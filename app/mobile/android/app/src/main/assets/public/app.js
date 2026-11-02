/* Nalxer App —— 前端逻辑（1.2.0）
 * 所有接口都带 Bearer 令牌，除了 /api/health 与 /api/login。
 */
(function () {
  'use strict';

  var DEFAULT_SERVER = 'http://aam.rainplay.cn:49282';
  var K = {
    server: 'nalxer.server',
    token: 'nalxer.token',
    name: 'nalxer.name',
    admin: 'nalxer.admin',
    expire: 'nalxer.expire'
  };

  var LS = window.localStorage;

  var state = {
    server: LS.getItem(K.server) || DEFAULT_SERVER,
    token: LS.getItem(K.token) || '',
    name: LS.getItem(K.name) || '',
    admin: LS.getItem(K.admin) === '1',
    expire: parseInt(LS.getItem(K.expire) || '0', 10) || 0,
    page: 'me',
    me: null,
    chatLast: 0,
    chatMsgs: [],
    chatTimer: null,
    meTimer: null,
    adminTab: 'ban',
    selectedTarget: '',
    cmdCatalog: null,
    cmdGroup: '',
    players: [],
    team: null,
    titles: null
  };

  // ── 小工具 ──────────────────────────────────────────────

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 去掉 &x / §x 色码，用于纯文本展示 */
  function plain(s) {
    return String(s == null ? '' : s).replace(/[&§][0-9a-fk-orA-FK-OR]/g, '');
  }

  function normServer(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return DEFAULT_SERVER;
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    return s.replace(/\/+$/, '');
  }

  function fmtNum(n) {
    if (n == null || n === '') return '—';
    var v = Number(n);
    if (!isFinite(v)) return String(n);
    return v.toLocaleString('en-US');
  }

  function fmtTime(ms) {
    if (!ms) return '—';
    var d = new Date(Number(ms));
    if (isNaN(d.getTime())) return '—';
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function fmtHours(sec) {
    if (sec == null) return '—';
    var h = Number(sec) / 3600;
    if (h < 1) return Math.round(Number(sec) / 60) + ' 分钟';
    return (Math.round(h * 10) / 10) + ' 小时';
  }

  var toastTimer = null;
  function toast(msg, kind) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast' + (kind ? ' ' + kind : '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast hidden'; }, 2600);
  }

  function showFatal(where, err) {
    var el = $('fatal');
    if (!el) return;
    var detail = err && err.message ? err.message : String(err || '');
    el.textContent = (where ? where + '：' : '') + detail;
    el.className = 'fatal';
    setTimeout(function () { el.className = 'fatal hidden'; }, 6000);
  }

  window.onerror = function (msg, src, line) {
    showFatal('页面出错', msg + ' @' + line);
  };
  window.addEventListener('unhandledrejection', function (e) {
    showFatal('请求出错', e && e.reason ? e.reason : '未知错误');
  });

  // ── 接口 ────────────────────────────────────────────────

  function url(path, query) {
    var u = state.server.replace(/\/+$/, '') + path;
    if (!query) return u;
    var parts = [];
    Object.keys(query).forEach(function (k) {
      var v = query[k];
      if (v === undefined || v === null) return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return parts.length ? u + '?' + parts.join('&') : u;
  }

  function api(path, opts) {
    opts = opts || {};
    var method = opts.method || 'GET';
    var target = url(path, opts.query);
    var ctrl = null;
    var timer = null;
    var init = { method: method, headers: {} };
    if (state.token) init.headers['Authorization'] = 'Bearer ' + state.token;
    if (opts.body) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    if (window.AbortController) {
      ctrl = new AbortController();
      init.signal = ctrl.signal;
      timer = setTimeout(function () { ctrl.abort(); }, 10000);
    }
    return fetch(target, init).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.text().then(function (text) {
        var json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
        if (!res.ok) {
          var msg = json && json.message ? json.message : ('服务器返回 ' + res.status);
          if (res.status === 401) {
            logout(true);
            msg = msg || '登录过期了，请重新登录';
          }
          var err = new Error(msg);
          err.status = res.status;
          throw err;
        }
        return json || { ok: true };
      });
    }, function (e) {
      if (timer) clearTimeout(timer);
      if (e && e.name === 'AbortError') {
        throw new Error('连接超时：' + target + '（10 秒没响应，多半是端口没放行或被防火墙挡了）');
      }
      throw new Error('连不上 ' + target + ' —— 看这几点：服务器开着吗 / 云服务器安全组放行这个端口了吗 / plugins 里有没有 NalxerApp');
    });
  }

  // ── 登录 ────────────────────────────────────────────────

  function setLoginMsg(text, bad) {
    var el = $('login-msg');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = bad ? '#ff9b9b' : '';
  }

  function doLogin() {
    var server = normServer($('f-server').value);
    var name = String($('f-name').value || '').trim();
    var pass = String($('f-pass').value || '');
    if (!name) { setLoginMsg('先填游戏 ID', true); return; }
    state.server = server;
    $('f-server').value = server;
    var btn = $('btn-login');
    btn.disabled = true;
    setLoginMsg('登录中…');
    api('/api/login', { method: 'POST', body: { name: name, password: pass } })
      .then(function (r) {
        state.token = r.token || '';
        state.name = r.name || name;
        state.admin = !!r.admin;
        state.expire = Date.now() + (r.expiresIn ? r.expiresIn * 1000 : 0);
        LS.setItem(K.server, state.server);
        LS.setItem(K.token, state.token);
        LS.setItem(K.name, state.name);
        LS.setItem(K.admin, state.admin ? '1' : '0');
        LS.setItem(K.expire, String(state.expire));
        setLoginMsg('');
        enterApp();
        toast('登录成功，欢迎回来 ' + state.name, 'ok');
      })
      .catch(function (e) {
        setLoginMsg(plain(e.message), true);
      })
      .then(function () { btn.disabled = false; });
  }

  function logout(silent) {
    state.token = '';
    state.me = null;
    state.chatMsgs = [];
    state.chatLast = 0;
    state.titles = null;
    state.team = null;
    LS.removeItem(K.token);
    LS.removeItem(K.name);
    LS.removeItem(K.admin);
    LS.removeItem(K.expire);
    stopTimers();
    $('app').classList.add('hidden');
    $('login').classList.remove('hidden');
    $('f-pass').value = '';
    if (!silent) toast('已退出登录');
  }

  function enterApp() {
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('page-sub').textContent = state.name;
    $('admin-card').classList.toggle('hidden', !state.admin);
    $('set-name').textContent = state.name;
    $('set-server').textContent = state.server.replace(/^https?:\/\//, '');
    $('set-admin').textContent = state.admin ? '有' : '否';
    $('f-server-edit').value = state.server;
    switchPage(state.page || 'me');
    loadMe();
    startTimers();
  }

  // ── 顶部 / 底部导航 ─────────────────────────────────────

  var PAGE_TITLE = {
    me: ['我的数据', ''],
    chat: ['服务器聊天', '和游戏里的玩家一起聊'],
    team: ['队伍', 'LinuxTeam'],
    title: ['头衔', 'LinuxTitle'],
    more: ['更多', '在线玩家 · 管理 · 设置']
  };

  function switchPage(page) {
    state.page = page;
    var ids = { me: 'page-me', chat: 'page-chat', team: 'page-team', title: 'page-titles', more: 'page-more' };
    Object.keys(ids).forEach(function (p) {
      var el = $(ids[p]);
      if (el) el.classList.toggle('hidden', p !== page);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-page') === page);
    });
    var meta = PAGE_TITLE[page] || ['Nalxer', ''];
    $('page-title').textContent = meta[0];
    $('page-sub').textContent = state.name + (meta[1] ? ' · ' + meta[1] : '');
    if (page === 'chat') {
      $('chat-badge').classList.add('hidden');
      loadChat(true);
    }
    if (page === 'team') loadTeam();
    if (page === 'title') loadTitles();
    if (page === 'more') {
      loadPlayers();
      if (state.admin) setAdminTab(state.adminTab || 'ban');
    }
    if (page === 'me') loadMe();
  }

  function startTimers() {
    stopTimers();
    state.meTimer = setInterval(function () {
      if (state.page === 'me') loadMe(true);
    }, 30000);
    state.chatTimer = setInterval(function () {
      if (state.page === 'chat') loadChat(false);
    }, 5000);
  }

  function stopTimers() {
    if (state.meTimer) clearInterval(state.meTimer);
    if (state.chatTimer) clearInterval(state.chatTimer);
    state.meTimer = null;
    state.chatTimer = null;
  }

  // ── 我的 ────────────────────────────────────────────────

  function kv(label, value) {
    return '<div class="kv"><span>' + esc(label) + '</span><b>' + esc(value == null ? '—' : value) + '</b></div>';
  }

  /** 写数字卡片：太长就自动降字号，别截断成省略号。 */
  function setStat(id, text) {
    var el = $(id);
    if (!el) return;
    el.textContent = text;
    var n = String(text).length;
    el.classList.toggle('long', n > 7 && n <= 10);
    el.classList.toggle('xlong', n > 10);
  }

  function renderMe(d) {
    state.me = d;
    $('me-name').textContent = d.name || state.name;
    $('me-dot').className = 'dot ' + (d.online ? 'on' : 'off');
    $('me-state').textContent = d.online
      ? ('在线' + (d.world ? ' · ' + d.world : '') + (d.gamemode ? ' · ' + d.gamemode : ''))
      : '离线（显示的是上次存档的数据）';

    // 头像：先放首字母，皮肤拿到再换
    var av = $('avatar');
    var initial = String(d.name || '?').trim().charAt(0).toUpperCase();
    av.textContent = initial;
    av.style.background = 'linear-gradient(150deg, #4cc2ff, #7c6cff)';
    if (d.uuid) {
      var img = new Image();
      img.onload = function () {
        av.textContent = '';
        av.style.background = 'transparent';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.borderRadius = '15px';
        img.style.objectFit = 'cover';
        av.appendChild(img);
      };
      img.src = 'https://crafatar.com/avatars/' + encodeURIComponent(d.uuid) + '?size=116&overlay';
    }

    // 徽标：队伍 + 头衔
    var badges = [];
    badges.push('<span class="badge">' + esc(d.team ? plain(d.team) : '无队伍') + '</span>');
    if (d.titleName) badges.push('<span class="badge gold">' + esc(plain(d.titleName)) + '</span>');
    if (d.muted) badges.push('<span class="badge" style="color:#ffb3b3;border-color:rgba(255,107,107,.35)">已禁言</span>');
    $('me-badges').innerHTML = badges.join('');

    setStat('me-coins', d.hasCoins ? fmtNum(d.coins) : '—');
    setStat('me-points', d.hasPoints ? fmtNum(d.points) : '—');
    setStat('me-level', d.level == null ? '—' : fmtNum(d.level));

    var need = Number(d.expToNext || 0);
    var into = Number(d.expIntoLevel || 0);
    var pct = need > 0 ? Math.max(0, Math.min(100, (into / need) * 100)) : 0;
    $('me-exp-fill').style.width = pct.toFixed(1) + '%';
    $('me-exp-text').textContent = d.level == null ? '—'
      : (fmtNum(into) + ' / ' + fmtNum(need) + ' 经验（' + pct.toFixed(0) + '%）');
    $('me-exp-total').textContent = d.totalExp == null ? '' : ('总经验 ' + fmtNum(d.totalExp));

    // 实时状态
    if (d.online) {
      $('me-live-card').classList.remove('hidden');
      var rows = [];
      if (d.health != null) rows.push(kv('生命', d.health + ' / ' + d.maxHealth));
      if (d.food != null) rows.push(kv('饥饿值', d.food));
      if (d.ping != null) rows.push(kv('延迟', d.ping + ' ms'));
      if (d.world) rows.push(kv('世界', d.world));
      $('me-live').innerHTML = rows.join('');
    } else {
      $('me-live-card').classList.add('hidden');
    }

    // 封禁卡
    if (d.banned) {
      $('me-ban-card').classList.remove('hidden');
      $('me-ban-reason').textContent = plain(d.banReason) || '未填写原因';
      $('me-ban-until').textContent = d.banUntil ? ('解封时间：' + plain(d.banUntil)) : '永久封禁';
    } else {
      $('me-ban-card').classList.add('hidden');
    }

    // 明细
    var list = [];
    list.push('<div class="row"><span>在线时长</span><b>' + esc(fmtHours(d.playtimeSeconds)) + '</b></div>');
    list.push('<div class="row"><span>首次进服</span><b>' + esc(fmtTime(d.firstPlayed)) + '</b></div>');
    list.push('<div class="row"><span>最近进服</span><b>' + esc(fmtTime(d.lastPlayed)) + '</b></div>');
    if (d.teamInfo) {
      list.push('<div class="row"><span>队伍</span><b>' + esc(plain(d.teamInfo.coloredName || d.teamInfo.name)) + '</b></div>');
      if (d.teamInfo.leaderName) {
        list.push('<div class="row"><span>队长</span><b>' + esc(d.teamInfo.leaderName) + '</b></div>');
      }
    }
    if (d.titleName) {
      list.push('<div class="row"><span>头衔</span><b>' + esc(plain(d.titleName)) + '</b></div>');
    }
    list.push('<div class="row"><span>UUID</span><b style="font-size:11.5px">' + esc(d.uuid || '—') + '</b></div>');
    $('me-rows').innerHTML = list.join('');
  }

  function loadMe(silent) {
    return api('/api/me').then(function (r) {
      renderMe(r.data || {});
    }).catch(function (e) {
      if (!silent) toast(plain(e.message), 'bad');
    });
  }

  // ── 聊天 ────────────────────────────────────────────────

  function renderChat() {
    var box = $('chat-list');
    if (!state.chatMsgs.length) {
      box.innerHTML = '<p class="muted">还没有人说话，打个招呼？</p>';
      return;
    }
    box.innerHTML = state.chatMsgs.map(function (m) {
      var cls = 'msg' + (m.name === state.name ? ' self' : '') + (m.source === 'app' ? ' app' : '');
      return '<div class="' + cls + '">' +
        '<div class="who">' + esc(m.name) + ' · ' + esc(fmtTime(m.time).slice(11)) + '</div>' +
        '<div class="bubble"><span class="text">' + esc(m.text) + '</span></div>' +
        '</div>';
    }).join('');
    var last = box.lastElementChild;
    if (last && last.scrollIntoView) last.scrollIntoView({ block: 'end' });
  }

  function loadChat(full) {
    return api('/api/chat', { query: { since: full ? 0 : state.chatLast, limit: 60 } })
      .then(function (r) {
        var msgs = r.messages || [];
        if (full) {
          state.chatMsgs = msgs;
        } else if (msgs.length) {
          state.chatMsgs = state.chatMsgs.concat(msgs).slice(-120);
          if (state.page !== 'chat') $('chat-badge').classList.remove('hidden');
        }
        if (r.last) state.chatLast = r.last;
        $('chat-online').textContent = (r.online != null ? r.online + ' 人在线' : '');
        renderChat();
      })
      .catch(function (e) { toast(plain(e.message), 'bad'); });
  }

  function sendChat() {
    var input = $('f-chat');
    var text = String(input.value || '').trim();
    if (!text) { toast('先说点什么'); return; }
    var btn = $('btn-chat-send');
    btn.disabled = true;
    api('/api/chat', { method: 'POST', body: { message: text } })
      .then(function (r) {
        input.value = '';
        toast(r.message || '已发到服务器', 'ok');
        loadChat(false);
      })
      .catch(function (e) { toast(plain(e.message), 'bad'); })
      .then(function () { btn.disabled = false; });
  }

  // ── 队伍 ────────────────────────────────────────────────

  function renderTeam(r) {
    var team = r.team;
    state.team = team;
    if (team) {
      $('team-mine').classList.remove('hidden');
      $('team-none').classList.add('hidden');
      $('team-name').textContent = plain(team.coloredName || team.name) || '我的队伍';
      $('team-size').textContent = (team.size || 0) + ' / ' + (team.maxSize || 0) + ' 人';
      $('team-kv').innerHTML = [
        kv('队伍名', plain(team.name)),
        kv('队标', plain(team.coloredTag || team.tag) || '无'),
        kv('队长', team.leaderName || '—'),
        kv('建队时间', fmtTime(team.createTime))
      ].join('');
      var members = team.members || [];
      $('team-member-count').textContent = members.length + ' 人';
      $('team-members').innerHTML = members.length ? members.map(function (m) {
        var tag = m.online ? '<span class="tag ok">在线</span>' : '<span class="tag">离线</span>';
        var lead = m.name === team.leaderName ? ' <span class="badge gold">队长</span>' : '';
        return '<div class="row"><span>' + esc(m.name) + lead + '</span><span>' + tag + '</span></div>';
      }).join('') : '<p class="muted">没有成员数据</p>';
    } else {
      $('team-mine').classList.add('hidden');
      $('team-none').classList.remove('hidden');
      var list = r.teams || [];
      $('team-list').innerHTML = list.length ? list.map(function (t) {
        return '<div class="row"><span>' + esc(plain(t.coloredName || t.name)) +
          ' <span class="muted">' + esc(plain(t.coloredTag || t.tag) || '') + '</span></span>' +
          '<span class="muted">' + (t.size || 0) + '/' + (t.maxSize || 0) + ' · ' + esc(t.leaderName || '') + '</span></div>';
      }).join('') : '<p class="muted">服务器上还没有队伍</p>';
    }
    if (r.available === false) toast('服务器没装 LinuxTeam，队伍功能不可用', 'bad');
  }

  function loadTeam() {
    return api('/api/team').then(renderTeam).catch(function (e) {
      toast(plain(e.message), 'bad');
    });
  }

  function teamAction(action, arg) {
    return api('/api/team', { method: 'POST', body: { action: action, arg: arg || '' } })
      .then(function (r) {
        toast(plain(r.message) || '操作完成', 'ok');
        loadTeam();
      })
      .catch(function (e) {
        toast(plain(e.message), 'bad');
        loadTeam();
      });
  }

  // ── 头衔 ────────────────────────────────────────────────

  var STAT_NAME = { mining: '挖矿', farming: '收获', deaths: '死亡', fishing: '钓鱼' };

  /** 把 LinuxTitle 的 condition 翻成人话。 */
  function condText(t) {
    var type = String(t.conditionType || '');
    var v = Number(t.conditionValue || 0);
    var hours = Math.round(v / 3600000 * 10) / 10;
    if (type === 'playtime') return '累计在线 ' + hours + ' 小时';
    if (type === 'daily_playtime') return '今日在线 ' + hours + ' 小时';
    if (type === 'statistic') {
      var name = STAT_NAME[t.statisticType || ''] || t.statisticType || '统计';
      return name + ' ' + fmtNum(v) + ' 次';
    }
    if (type === 'festival') return '节日活动';
    if (type === 'manual') return '管理员发放';
    if (t.permission) return '需要权限 ' + t.permission;
    return type || t.id;
  }

  function renderTitles(r) {
    var d = r.data || {};
    state.titles = d;
    var active = d.activeTitle;
    $('title-active').textContent = active ? plain(active.display || active.id) : '未佩戴';
    $('btn-title-off').disabled = !active;
    var list = d.titles || [];
    $('title-count').textContent = (d.unlockedCount || 0) + ' / ' + (d.total || list.length);
    if (!list.length) {
      $('title-list').innerHTML = '<p class="muted">服务器上还没有配置头衔</p>';
      return;
    }
    $('title-list').innerHTML = list.map(function (t) {
      var locked = !t.unlocked;
      var cond = condText(t);
      var btn = t.active
        ? '<button class="mini-btn on" disabled>佩戴中</button>'
        : '<button class="mini-btn" data-title="' + esc(t.id) + '"' + (locked ? ' disabled' : '') + '>' +
          (locked ? '未解锁' : '佩戴') + '</button>';
      return '<div class="row title-row"><div class="title-main">' +
        '<div class="title-name">' + esc(plain(t.display || t.id)) + '</div>' +
        '<div class="title-cond">' + esc(cond) + '</div>' +
        '</div><div class="title-btns">' + btn + '</div></div>';
    }).join('');
    Array.prototype.forEach.call($('title-list').querySelectorAll('button[data-title]'), function (b) {
      b.onclick = function () { equipTitle(b.getAttribute('data-title')); };
    });
    if (r.available === false) toast('服务器没装 LinuxTitle，头衔功能不可用', 'bad');
  }

  function loadTitles() {
    return api('/api/titles').then(renderTitles).catch(function (e) {
      toast(plain(e.message), 'bad');
    });
  }

  function equipTitle(id) {
    api('/api/titles', { method: 'POST', body: { id: id || '' } })
      .then(function (r) {
        toast(plain(r.message) || '已更新头衔', 'ok');
        renderTitles({ ok: true, available: true, data: r.data || {} });
        loadMe(true);
      })
      .catch(function (e) { toast(plain(e.message), 'bad'); });
  }

  // ── 在线玩家 ────────────────────────────────────────────

  function loadPlayers() {
    return api('/api/players').then(function (r) {
      var list = r.players || [];
      state.players = list;
      $('players-list').innerHTML = list.length ? list.map(function (p) {
        var team = p.team ? plain(p.team) : '';
        var sub = [team, p.world, p.gamemode, p.ping != null ? p.ping + 'ms' : ''].filter(Boolean).join(' · ');
        return '<div class="row"><span>' + esc(p.name) +
          (p.titleId ? ' <span class="badge gold">' + esc(p.titleId) + '</span>' : '') +
          '</span><span class="muted">' + esc(sub) + '</span></div>';
      }).join('') : '<p class="muted">现在没人在线</p>';
    }).catch(function (e) { toast(plain(e.message), 'bad'); });
  }

  // ── 管理员：封禁 ────────────────────────────────────────

  function setAdminTab(tab) {
    state.adminTab = tab;
    $('admin-ban-view').classList.toggle('hidden', tab !== 'ban');
    $('admin-cmd-view').classList.toggle('hidden', tab !== 'cmd');
    Array.prototype.forEach.call(document.querySelectorAll('#admin-tabs .seg-btn'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-admin-tab') === tab);
    });
    if (tab === 'ban') loadBans();
    if (tab === 'cmd') loadCommands();
  }

  function searchPlayers() {
    var q = String($('f-search').value || '').trim();
    if (!q) { toast('先输入名字'); return; }
    api('/api/admin/search', { query: { q: q } }).then(function (r) {
      var hits = r.hits || [];
      if (!hits.length) {
        $('search-result').innerHTML = '<p class="muted">没找到叫这个名字的玩家</p>';
        return;
      }
      $('search-result').innerHTML = hits.map(function (h) {
        var tags = [];
        if (h.online) tags.push('<span class="tag ok">在线</span>');
        if (h.banned) tags.push('<span class="tag bad">已封禁</span>');
        return '<div class="row"><span>' + esc(h.name) + ' ' + tags.join(' ') + '</span>' +
          '<button class="mini-btn" data-pick="' + esc(h.name) + '">处理</button></div>';
      }).join('');
      Array.prototype.forEach.call($('search-result').querySelectorAll('button[data-pick]'), function (b) {
        b.onclick = function () {
          state.selectedTarget = b.getAttribute('data-pick');
          $('ban-target').textContent = '目标：' + state.selectedTarget;
          $('ban-form').classList.remove('hidden');
        };
      });
    }).catch(function (e) { toast(plain(e.message), 'bad'); });
  }

  function loadBans() {
    return api('/api/admin/bans').then(function (r) {
      var list = r.bans || [];
      $('bans-count').textContent = (r.count || list.length) + ' 条';
      $('bans-list').innerHTML = list.length ? list.map(function (b) {
        return '<div class="row"><div style="min-width:0"><div>' + esc(b.player) + '</div>' +
          '<div class="muted" style="overflow:hidden;text-overflow:ellipsis">' + esc(plain(b.reason)) + '</div></div>' +
          '<div style="display:flex;align-items:center;gap:8px;flex:0 0 auto">' +
          '<span class="muted">' + esc(b.expire || '永久') + '</span>' +
          '<button class="mini-btn" data-unban="' + esc(b.player) + '">解封</button></div></div>';
      }).join('') : '<p class="muted">没有封禁记录</p>';
      Array.prototype.forEach.call($('bans-list').querySelectorAll('button[data-unban]'), function (btn) {
        btn.onclick = function () { doUnban(btn.getAttribute('data-unban')); };
      });
    }).catch(function (e) { toast(plain(e.message), 'bad'); });
  }

  function doBan() {
    if (!state.selectedTarget) { toast('先搜索并选一个玩家'); return; }
    var reason = String($('f-ban-reason').value || '').trim();
    var minutes = parseInt($('f-ban-minutes').value, 10) || 0;
    if (!confirm('确定封禁 ' + state.selectedTarget + '？')) return;
    api('/api/admin/ban', { method: 'POST', body: { name: state.selectedTarget, reason: reason, minutes: minutes } })
      .then(function (r) {
        toast(plain(r.message) || '已封禁', 'ok');
        loadBans();
        loadMe(true);
      })
      .catch(function (e) { toast(plain(e.message), 'bad'); });
  }

  function doUnban(name) {
    if (!name) return;
    if (!confirm('确定解封 ' + name + '？')) return;
    api('/api/admin/unban', { method: 'POST', body: { name: name } })
      .then(function (r) {
        toast(plain(r.message) || '已解封', 'ok');
        loadBans();
        loadMe(true);
      })
      .catch(function (e) { toast(plain(e.message), 'bad'); });
  }

  // ── 管理员：命令 ────────────────────────────────────────

  function loadCommands() {
    if (state.cmdCatalog) {
      renderCmdGroups();
      renderCmdList();
      return;
    }
    api('/api/admin/commands').then(function (r) {
      state.cmdCatalog = r;
      renderCmdGroups();
      renderCmdList();
    }).catch(function (e) { toast(plain(e.message), 'bad'); });
  }

  function renderCmdGroups() {
    var groups = (state.cmdCatalog && state.cmdCatalog.groups) || [];
    if (!groups.length) { $('cmd-groups').innerHTML = ''; return; }
    if (!state.cmdGroup) state.cmdGroup = groups[0].name;
    $('cmd-groups').innerHTML = groups.map(function (g) {
      return '<button class="seg-btn' + (g.name === state.cmdGroup ? ' active' : '') +
        '" data-cmd-group="' + esc(g.name) + '">' + esc(g.name) + '</button>';
    }).join('');
    Array.prototype.forEach.call($('cmd-groups').querySelectorAll('button[data-cmd-group]'), function (b) {
      b.onclick = function () {
        state.cmdGroup = b.getAttribute('data-cmd-group');
        renderCmdGroups();
        renderCmdList();
      };
    });
  }

  function renderCmdList() {
    var groups = (state.cmdCatalog && state.cmdCatalog.groups) || [];
    var group = null;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].name === state.cmdGroup) { group = groups[i]; break; }
    }
    var items = group && group.items ? group.items : [];
    $('cmd-list').innerHTML = items.map(function (it) {
      return '<button class="cmd-item' + (it.danger ? ' danger' : '') + '" data-cmd="' + esc(it.cmd) + '">' +
        '<div class="cmd-label">' + esc(it.label) + (it.danger ? '<span class="cmd-badge">谨慎</span>' : '') + '</div>' +
        '<div class="cmd-args">' + esc(it.cmd) + (it.args ? ' ' + esc(it.args) : '') + '</div>' +
        '<div class="cmd-desc">' + esc(it.desc || '') + '</div></button>';
    }).join('');
    Array.prototype.forEach.call($('cmd-list').querySelectorAll('button[data-cmd]'), function (b) {
      b.onclick = function () {
        var input = $('f-cmd');
        input.value = b.getAttribute('data-cmd') + ' ';
        input.focus();
      };
    });
  }

  function runCommand() {
    var cmd = String($('f-cmd').value || '').trim();
    if (!cmd) { toast('先写一条命令'); return; }
    var knownDanger = /^(stop|restart|reload|op|deop|whitelist|plugins|version|give|gm|gamemode|kick)\b/i.test(cmd);
    if (knownDanger && !confirm('这条命令很危险：\n' + cmd + '\n\n确定执行？')) return;
    var btn = $('btn-run');
    btn.disabled = true;
    var out = $('cmd-out');
    out.classList.remove('hidden');
    out.innerHTML = '<span class="cmd-echo">$ ' + esc(cmd) + '</span>';
    api('/api/admin/exec', { method: 'POST', body: { command: cmd } })
      .then(function (r) {
        var lines = r.output || [];
        var html = '<span class="cmd-echo">$ ' + esc(cmd) + '</span>\n';
        html += lines.length ? lines.map(esc).join('\n') : esc(plain(r.message) || '（没有回显）');
        if (!r.ok) html = '<span class="cmd-err">' + html + '</span>';
        out.innerHTML = html;
        toast(plain(r.message) || '执行完成', r.ok ? 'ok' : 'bad');
      })
      .catch(function (e) {
        out.innerHTML = '<span class="cmd-echo">$ ' + esc(cmd) + '</span>\n<span class="cmd-err">' +
          esc(plain(e.message)) + '</span>';
        toast(plain(e.message), 'bad');
      })
      .then(function () { btn.disabled = false; });
  }

  // ── 设置 ────────────────────────────────────────────────

  function saveServer() {
    var s = normServer($('f-server-edit').value);
    state.server = s;
    LS.setItem(K.server, s);
    $('f-server-edit').value = s;
    $('set-server').textContent = s.replace(/^https?:\/\//, '');
    $('server-msg').textContent = '已保存，正在重新拉数据…';
    loadMe().then(function () {
      $('server-msg').textContent = '已连上 ' + s.replace(/^https?:\/\//, '');
    }).catch(function (e) {
      $('server-msg').textContent = plain(e.message);
    });
  }

  function testServer() {
    var s = normServer($('f-server-edit').value);
    $('server-msg').textContent = '测试中…';
    fetch(s + '/api/health', { method: 'GET' }).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = JSON.parse(t); } catch (e) { j = null; }
        if (!r.ok || !j) throw new Error('返回了 ' + r.status + '，不像 NalxerApp 的接口');
        var c = j.capabilities || {};
        var pairs = [['authme', '登录'], ['coins', '金币'], ['points', '点券'],
                     ['bans', '封禁'], ['teams', '队伍'], ['titles', '头衔']];
        var marks = pairs.map(function (p) { return p[1] + (c[p[0]] ? '✓' : '✗'); });
        $('server-msg').textContent = '通了：' + (j.app || 'NalxerApp') + ' v' + (j.version || '?') +
          '（' + marks.join(' ') + '）';
      });
    }).catch(function (e) {
      $('server-msg').textContent = '连不上：' + (e.message || '网络错误');
    });
  }

  // ── 事件绑定 ────────────────────────────────────────────

  function bind() {
    $('btn-login').onclick = doLogin;
    $('f-pass').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doLogin();
    });
    $('btn-refresh').onclick = function () {
      toast('刷新中…');
      loadMe();
      if (state.page === 'chat') loadChat(true);
      if (state.page === 'team') loadTeam();
      if (state.page === 'title') loadTitles();
      if (state.page === 'more') loadPlayers();
    };
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.onclick = function () { switchPage(b.getAttribute('data-page')); };
    });

    $('btn-chat-send').onclick = sendChat;
    $('f-chat').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') sendChat();
    });

    $('btn-team-create').onclick = function () {
      var name = String($('f-team-create').value || '').trim();
      if (!name) { toast('先想个队名'); return; }
      teamAction('create', name);
    };
    $('btn-team-reload').onclick = loadTeam;
    $('btn-team-leave').onclick = function () {
      if (!confirm('确定退出队伍？')) return;
      teamAction('leave', '');
    };
    $('btn-team-kick').onclick = function () {
      var arg = String($('f-team-arg').value || '').trim();
      if (!arg) { toast('要踢谁？填玩家名'); return; }
      teamAction('kick', arg);
    };
    $('btn-team-transfer').onclick = function () {
      var arg = String($('f-team-arg').value || '').trim();
      if (!arg) { toast('转让给谁？填玩家名'); return; }
      if (!confirm('确定把队长转给 ' + arg + '？')) return;
      teamAction('transfer', arg);
    };
    $('btn-team-disband').onclick = function () {
      if (!confirm('解散队伍不可恢复，确定？')) return;
      teamAction('disband', '');
    };

    $('btn-title-off').onclick = function () { equipTitle(''); };

    $('btn-players-reload').onclick = loadPlayers;

    Array.prototype.forEach.call(document.querySelectorAll('#admin-tabs .seg-btn'), function (b) {
      b.onclick = function () { setAdminTab(b.getAttribute('data-admin-tab')); };
    });
    $('btn-search').onclick = searchPlayers;
    $('f-search').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') searchPlayers();
    });
    $('btn-ban').onclick = doBan;
    $('btn-unban').onclick = function () {
      if (!state.selectedTarget) { toast('先搜索并选一个玩家'); return; }
      doUnban(state.selectedTarget);
    };
    $('btn-run').onclick = runCommand;
    $('f-cmd').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') runCommand();
    });

    $('btn-save-server').onclick = saveServer;
    $('btn-test-server').onclick = testServer;
    $('btn-reset-server').onclick = function () {
      state.server = DEFAULT_SERVER;
      LS.setItem(K.server, DEFAULT_SERVER);
      $('f-server-edit').value = DEFAULT_SERVER;
      $('set-server').textContent = DEFAULT_SERVER.replace(/^https?:\/\//, '');
      toast('已恢复默认地址');
    };
    $('btn-logout').onclick = function () {
      if (!confirm('退出登录？')) return;
      logout(false);
    };
  }

  // ── 启动 ────────────────────────────────────────────────

  function boot() {
    bind();
    $('f-server').value = state.server;
    $('f-server-edit').value = state.server;
    var params = new URLSearchParams(location.search);
    var page = (params.get('page') || '').trim();
    if (page) state.page = page;

    if (state.token) {
      enterApp();
      loadMe(true).then(function () {
        var tab = (params.get('tab') || '').trim();
        if (tab === 'cmd' && state.admin) setAdminTab('cmd');
      });
    } else {
      $('login').classList.remove('hidden');
      $('app').classList.add('hidden');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
