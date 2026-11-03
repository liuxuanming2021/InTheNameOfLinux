/* Nalxer App 1.3.1 —— 我的 / 聊天 / 队伍 / 头衔 / 命令 / 更多 */
(function () {
  'use strict';

  var DEFAULT_SERVER = 'http://aam.rainplay.cn:49282';

  var LS = {
    server: 'nalxer.server',
    token: 'nalxer.token',
    name: 'nalxer.name',
    admin: 'nalxer.admin',
    expire: 'nalxer.expire',
    theme: 'nalxer.theme'
  };

  var PAGE_TITLE = {
    me: ['我的数据', ''],
    chat: ['服务器聊天', '和游戏里的玩家一起聊'],
    team: ['队伍', 'LinuxTeam'],
    title: ['头衔', 'LinuxTitle'],
    admin: ['服务器管理', '玩家 / 举报 / 惩罚 / 假人'],
    cmd: ['服务器命令', '只有管理员能用'],
    more: ['更多', '在线玩家 / 设置']
  };

  var state = {
    server: '',
    token: '',
    name: '',
    admin: false,
    page: 'me',
    me: null,
    chatLast: 0,
    chatMsgs: [],
    chatTimer: 0,
    adminTab: 'player',
    cmdCatalog: null,
    cmdGroup: '',
    timer: 0
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** 把 §6[元老] §r 这类色码去掉，只留文字 */
  function plain(s) {
    return String(s == null ? '' : s).replace(/[\u00a7&][0-9a-fk-orx]/gi, '');
  }

  function normServer(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return DEFAULT_SERVER;
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    return s.replace(/\/+$/, '');
  }

  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.add('hidden'); }, 2200);
  }

  function fatal(prefix, detail) {
    var el = $('fatal');
    el.textContent = prefix + (detail ? '\n' + detail : '');
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.add('hidden'); }, 8000);
  }

  // ── 主题 ─────────────────────────────────────────────

  function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0b0f14' : '#f4f6fa');
    var sw = $('sw-theme');
    if (sw) sw.setAttribute('aria-checked', dark ? 'true' : 'false');
  }

  function initTheme() {
    var saved = localStorage.getItem(LS.theme);
    applyTheme(saved === 'dark');
  }

  function toggleTheme() {
    var dark = document.documentElement.getAttribute('data-theme') !== 'dark';
    applyTheme(dark);
    localStorage.setItem(LS.theme, dark ? 'dark' : 'light');
  }

  // ── 请求 ─────────────────────────────────────────────

  function api(path, opts) {
    opts = opts || {};
    var url = state.server + path;
    var headers = { 'Accept': 'application/json' };
    if (opts.body != null) headers['Content-Type'] = 'application/json';
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;

    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 10000) : 0;

    return fetch(url, {
      method: opts.method || (opts.body != null ? 'POST' : 'GET'),
      headers: headers,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (timer) clearTimeout(timer);
      return r.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : {}; } catch (e) { data = { ok: false, message: '服务器返回的不是 JSON' }; }
        if (r.status === 401) {
          if (!opts.quiet) { logout(true); }
          throw new Error((data && data.message) || '登录已过期，请重新登录');
        }
        return { status: r.status, data: data };
      });
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        throw new Error('连接超时：' + url + '（10 秒没响应，多半是端口没放行或被防火墙挡了）');
      }
      if (err && err.message && err.message.indexOf('登录已过期') >= 0) throw err;
      if (err && err.message && err.message.indexOf('连接超时') >= 0) throw err;
      throw new Error('连不上 ' + url + ' —— 看这几点：服务器开着吗 / 云服务器安全组放行这个端口了吗 / plugins 里有没有 NalxerApp');
    });
  }

  // ── 登录 / 退出 ──────────────────────────────────────

  function persist() {
    localStorage.setItem(LS.server, state.server);
    localStorage.setItem(LS.token, state.token);
    localStorage.setItem(LS.name, state.name);
    localStorage.setItem(LS.admin, state.admin ? '1' : '0');
  }

  function doLogin() {
    var btn = $('btn-login');
    var err = $('login-err');
    err.classList.add('hidden');
    state.server = normServer($('f-server').value);
    var name = $('f-name').value.trim();
    var pass = $('f-pass').value;
    if (!name) { err.textContent = '先填游戏 ID'; err.classList.remove('hidden'); return; }
    btn.disabled = true;
    btn.textContent = '登录中…';

    api('/api/login', { body: { name: name, password: pass }, quiet: true }).then(function (r) {
      var d = r.data || {};
      if (!d.ok) throw new Error(d.message || '登录失败');
      state.token = d.token || '';
      state.name = d.name || name;
      state.admin = !!d.admin;
      persist();
      enterApp();
    }).catch(function (e) {
      err.textContent = e.message;
      err.classList.remove('hidden');
    }).then(function () {
      btn.disabled = false;
      btn.textContent = '登录';
    });
  }

  function logout(silent) {
    state.token = '';
    state.name = '';
    state.admin = false;
    state.me = null;
    state.chatMsgs = [];
    state.chatLast = 0;
    localStorage.removeItem(LS.token);
    localStorage.removeItem(LS.name);
    localStorage.removeItem(LS.admin);
    stopTimers();
    $('app').classList.add('hidden');
    $('login').classList.remove('hidden');
    if (!silent) toast('已退出登录');
  }

  function enterApp() {
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('tab-cmd').classList.toggle('hidden', !state.admin);
    $('tab-admin').classList.toggle('hidden', !state.admin);
    $('admin-card').classList.toggle('hidden', !state.admin);
    $('status-card').classList.toggle('hidden', !state.admin);
    $('f-server-edit').value = state.server;
    $('set-name').textContent = state.name;
    $('set-server').textContent = state.server.replace(/^https?:\/\//, '');
    $('set-admin').textContent = state.admin ? '有' : '否';
    switchPage(state.page || 'me');
    loadMe();
    startTimers();
  }

  // ── 页面切换 ─────────────────────────────────────────

  var PAGE_IDS = {
    me: 'page-me', chat: 'page-chat', team: 'page-team',
    title: 'page-titles', admin: 'page-admin', cmd: 'page-cmd', more: 'page-more'
  };

  function switchPage(page) {
    if (!PAGE_IDS[page]) page = 'me';
    // 管理 / 命令只有管理员能进
    if ((page === 'cmd' || page === 'admin') && !state.admin) page = 'more';
    state.page = page;

    Object.keys(PAGE_IDS).forEach(function (p) {
      var el = $(PAGE_IDS[p]);
      if (el) el.classList.toggle('hidden', p !== page);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-page') === page);
    });

    var meta = PAGE_TITLE[page] || ['Nalxer', ''];
    $('page-title').textContent = meta[0];
    $('page-sub').textContent = meta[1] || state.name;
    window.scrollTo(0, 0);

    if (page === 'chat') { $('chat-dot').classList.add('hidden'); loadChat(); }
    if (page === 'team') loadTeam();
    if (page === 'title') loadTitles();
    if (page === 'cmd') loadCommands();
    if (page === 'admin') setAdminTab(state.adminTab || 'player');
    if (page === 'more') loadPlayers();
  }

  // ── 我的 ─────────────────────────────────────────────

  function setStat(id, text) {
    var el = $(id);
    if (!el) return;
    el.textContent = text;
    var n = String(text).length;
    el.classList.toggle('long', n >= 8 && n < 11);
    el.classList.toggle('xlong', n >= 11);
  }

  function fmt(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString('en-US');
  }

  function fmtTime(ms) {
    if (!ms || Number(ms) <= 0) return '—';
    var d = new Date(Number(ms));
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function hoursText(h) {
    if (h == null) return '—';
    var v = Number(h);
    if (v < 1) return Math.round(v * 60) + ' 分钟';
    return (Math.round(v * 10) / 10) + ' 小时';
  }

  function loadMe() {
    api('/api/me').then(function (r) {
      var d = r.data || {};
      if (!d.ok) { toast(d.message || '读不到数据'); return; }
      state.me = d.data;
      renderMe(d.data);
      loadCheckin();
      if (state.admin) loadStatus();
    }).catch(function (e) { fatal('读取数据失败', e.message); });
  }

  function renderMe(d) {
    $('me-name').textContent = d.name || state.name;
    $('me-dot').classList.toggle('on', !!d.online);

    var badges = [];
    if (d.team) badges.push('<span class="badge">' + esc(plain(d.team)) + '</span>');
    else badges.push('<span class="badge gray">无队伍</span>');
    if (d.titleName) badges.push('<span class="badge gold">' + esc(d.titleName) + '</span>');
    else badges.push('<span class="badge gray">无头衔</span>');
    if (d.online) badges.push('<span class="badge">在线</span>');
    $('me-badges').innerHTML = badges.join('');

    setStat('me-coins', d.hasCoins ? fmt(d.coins) : '—');
    setStat('me-points', d.hasPoints ? fmt(d.points) : '—');
    setStat('me-level', d.level == null ? '—' : '' + d.level);

    var into = d.expIntoLevel || 0;
    var need = d.expToNext || 0;
    var pct = need > 0 ? Math.min(100, Math.round(into * 100 / need)) : 0;
    $('me-exp-fill').style.width = pct + '%';
    $('me-exp-text').textContent = need > 0
      ? fmt(into) + ' / ' + fmt(need) + ' 经验（' + pct + '%）'
      : (d.levelLive ? '满级/无进度' : '离线时读不到进度');
    $('me-exp-total').textContent = '总经验 ' + fmt(d.totalExp || 0);

    var avatar = $('me-avatar');
    if (d.uuid) {
      avatar.innerHTML = '<img alt="" src="https://crafatar.com/avatars/' + esc(d.uuid) +
        '?size=96&overlay" onerror="this.parentNode.textContent=\'' +
        esc((d.name || '?').slice(0, 1).toUpperCase()) + '\'">';
    } else {
      avatar.textContent = (d.name || '?').slice(0, 1).toUpperCase();
    }

    if (d.online) {
      $('me-live-card').classList.remove('hidden');
      $('me-live-tag').textContent = '在线';
      $('me-live-tag').style.color = 'var(--green)';
      var rows = [
        ['生命', (d.health == null ? '—' : Math.round(d.health)) + ' / ' + (d.maxHealth == null ? '—' : Math.round(d.maxHealth))],
        ['饥饿值', d.food == null ? '—' : d.food],
        ['延迟', (d.ping == null ? '—' : d.ping + ' ms')],
        ['世界', d.world || '—'],
        ['游戏模式', d.gamemode || '—']
      ];
      $('me-live').innerHTML = rows.map(function (r) {
        return '<span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b>';
      }).join('');
    } else {
      $('me-live-card').classList.add('hidden');
    }

    if (d.banned) {
      $('me-ban-card').classList.remove('hidden');
      $('me-ban').innerHTML =
        '<span>原因</span><b>' + esc(d.banReason || '未填写原因') + '</b>' +
        '<span>到期</span><b>' + esc(d.banUntil ? fmtTime(d.banUntil) : '永久') + '</b>';
    } else {
      $('me-ban-card').classList.add('hidden');
    }

    var info = [
      ['在线时长', hoursText(d.playtimeHours)],
      ['首次进服', fmtTime(d.firstPlayed)],
      ['最近进服', fmtTime(d.lastPlayed)],
      ['当前头衔', d.titleName || '无'],
      ['UUID', d.uuid || '—']
    ];
    $('me-rows').innerHTML = info.map(function (r) {
      return '<span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b>';
    }).join('');
  }

  function loadCheckin() {
    api('/api/checkin').then(function (r) {
      var d = r.data || {};
      if (!d.ok) return;
      var info = d.info || {};
      $('ck-streak').textContent = info.streak || 0;
      $('ck-total').textContent = info.total || 0;
      var btn = $('btn-checkin');
      if (!d.server) {
        btn.disabled = true;
        btn.textContent = '没接经济';
        $('ck-hint').textContent = '服务器没接金币/点券，签到发不出奖励';
      } else if (info.claimed) {
        btn.disabled = true;
        btn.textContent = '已签到';
        $('ck-hint').textContent = '今天签过了，明天 0 点再来';
      } else {
        btn.disabled = false;
        btn.textContent = '签到';
        $('ck-hint').textContent = '每天 0 点重置，随机 5000 金币或 1-5 点券';
      }
    }).catch(function () {});
  }

  function doCheckin() {
    var btn = $('btn-checkin');
    btn.disabled = true;
    btn.textContent = '领取中…';
    api('/api/checkin', { body: { op: 'claim' } }).then(function (r) {
      var d = r.data || {};
      toast(d.message || (d.ok ? '签到成功' : '签到失败'));
      if (d.info) {
        $('ck-streak').textContent = d.info.streak || 0;
        $('ck-total').textContent = d.info.total || 0;
        if (d.info.claimed) { btn.textContent = '已签到'; btn.disabled = true; }
      }
      loadMe();
    }).catch(function (e) {
      toast(e.message);
      btn.disabled = false;
      btn.textContent = '签到';
    });
  }

  // ── 聊天 ─────────────────────────────────────────────

  function loadChat() {
    api('/api/chat?since=' + (state.chatLast || 0)).then(function (r) {
      var d = r.data || {};
      if (!d.ok) return;
      $('chat-online').textContent = (d.online || 0) + ' 人在线';
      var msgs = d.messages || [];
      if (msgs.length) {
        state.chatLast = d.last || state.chatLast;
        state.chatMsgs = state.chatMsgs.concat(msgs).slice(-200);
        renderChat();
      } else if (!state.chatMsgs.length) {
        renderChat();
      }
    }).catch(function () {});
  }

  function renderChat() {
    var box = $('chat-list');
    if (!state.chatMsgs.length) {
      box.innerHTML = '<p class="empty">还没有人说话，打个招呼？</p>';
      return;
    }
    box.innerHTML = state.chatMsgs.map(function (m) {
      var mine = m.name === state.name && m.source === 'app';
      var cls = 'msg' + (mine ? ' mine' : '') + (m.source === 'console' ? ' console' : '');
      // 控制台发的话名字本来就是「控制台」，别再重复一次
      var tag = m.source === 'console' ? '' : (m.source === 'app' ? ' · App' : ' · 游戏');
      var t = new Date(m.time || Date.now());
      var when = pad(t.getHours()) + ':' + pad(t.getMinutes());
      return '<div class="' + cls + '">' +
        '<div class="meta">' + esc(m.name) + ' · ' + when + esc(tag) + '</div>' +
        '<div class="bubble">' + esc(m.text) + '</div></div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  }

  function sendChat() {
    var input = $('f-chat');
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    api('/api/chat', { body: { message: text } }).then(function (r) {
      var d = r.data || {};
      if (!d.ok) { toast(d.message || '发送失败'); return; }
      loadChat();
    }).catch(function (e) { toast(e.message); });
  }

  // ── 队伍 ─────────────────────────────────────────────

  function loadTeam() {
    api('/api/team').then(function (r) {
      var d = r.data || {};
      if (!d.ok) { toast(d.message || '读不到队伍'); return; }
      renderTeam(d);
    }).catch(function (e) { fatal('读取队伍失败', e.message); });
  }

  function teamCard(team, idx) {
    var isLeader = (team.leaderName || '').toLowerCase() === state.name.toLowerCase();
    var members = team.members || [];
    var head = '<div class="card-title">' +
      '<h2>' + esc(plain(team.coloredName || team.name)) +
      (team.tag ? '<span class="side" style="font-weight:400">（' + esc(plain(team.coloredTag || team.tag)) + '）</span>' : '') +
      '</h2><span class="side">' + (team.size || 0) + ' / ' + (team.maxSize || 0) + ' 人</span></div>' +
      '<div class="hint" style="margin:-4px 0 8px">队长 ' + esc(team.leaderName || '—') + '</div>';
    var body = members.map(function (m) {
      var canKick = isLeader && (m.name || '').toLowerCase() !== state.name.toLowerCase();
      return '<div class="member">' +
        '<i class="dot' + (m.online ? ' on' : '') + '"></i>' +
        '<div class="who"><b>' + esc(m.name) + '</b><span>贡献 ' + (m.contribution || 0) +
        ' · 在队 ' + (m.days || 0) + ' 天</span></div>' +
        (canKick ? '<button class="btn btn-mini" data-kick="' + esc(m.name) + '">踢出</button>' : '') +
        '</div>';
    }).join('') || '<p class="empty">队伍里只有你</p>';
    var acts = '<div class="seg" style="margin-top:10px">' +
      '<button class="seg-btn" data-leave="' + esc(team.name) + '">退出这个队伍</button>' +
      (isLeader ? '<button class="seg-btn" data-team="disband" data-tname="' + esc(team.name) + '">解散</button>' : '') +
      '</div>';
    return '<div class="card">' + head + body + acts + '</div>';
  }

  function renderTeam(d) {
    // 一个人可能在好几个队里：先看 myTeams，老服务端只有 team 就退回单个
    var mine = d.myTeams || [];
    if (!mine.length && d.team) mine = [d.team];
    var team = mine.length ? mine[0] : null;

    if (mine.length) {
      $('team-mine').classList.remove('hidden');
      $('team-none').classList.add('hidden');
      $('team-name').textContent = mine.length + ' 个队伍';
      $('team-sub').textContent = mine.map(function (t) {
        return plain(t.coloredName || t.name);
      }).join(' / ');
      $('team-members').innerHTML = mine.map(teamCard).join('');
      $('team-actions').innerHTML = '';
    } else {
      $('team-mine').classList.add('hidden');
      $('team-none').classList.remove('hidden');
    }

    var list = d.teams || [];
    $('team-count').textContent = list.length ? list.length + ' 个' : '—';
    $('team-list').innerHTML = list.length ? list.map(function (t) {
      var joined = mine.some(function (x) { return x.name === t.name; });
      return '<div class="list-item"><div class="main"><b>' + esc(plain(t.coloredName || t.name)) + '</b>' +
        '<div class="sub">队长 ' + esc(t.leaderName || '—') + ' · ' + (t.size || 0) + '/' + (t.maxSize || 0) + ' 人</div>' +
        '<div class="tags"><span class="tag">标识 ' + esc(plain(t.tag || '—')) + '</span></div></div>' +
        (joined ? '<span class="tag on">我的队伍</span>'
          : '<button class="btn btn-mini" data-join="' + esc(t.name) + '">加入</button>') +
        '</div>';
    }).join('') : '<p class="empty">服务器上还没有队伍</p>';
  }

  function teamAction(action, arg) {
    api('/api/team', { body: { action: action, arg: arg || '' } }).then(function (r) {
      var d = r.data || {};
      toast(d.message || (d.ok ? '完成' : '失败'));
      loadTeam();
      loadMe();
    }).catch(function (e) { toast(e.message); });
  }

  // ── 头衔 ─────────────────────────────────────────────

  function loadTitles() {
    api('/api/titles').then(function (r) {
      var d = r.data || {};
      if (!d.ok) { toast(d.message || '读不到头衔'); return; }
      renderTitles(d.data || {});
    }).catch(function (e) { fatal('读取头衔失败', e.message); });
  }

  var STAT_NAME = { mining: '挖矿', farming: '收获', deaths: '死亡', fishing: '钓鱼', kills: '击杀', mobkills: '杀怪' };

  function condText(t) {
    var v = t.conditionValue || 0;
    var ct = t.conditionType || '';
    if (t.permission) return '需要权限 ' + t.permission;
    if (ct === 'playtime') return '累计在线 ' + Math.round(v / 3600000) + ' 小时';
    if (ct === 'daily_playtime') return '今日在线 ' + Math.round(v / 3600000) + ' 小时';
    if (ct === 'statistic') return (STAT_NAME[t.statisticType] || t.statisticType || '统计') + ' ' + fmt(v) + ' 次';
    if (ct === 'festival') return '节日活动';
    if (ct === 'manual') return '管理员发放';
    return ct || '—';
  }

  function renderTitles(data) {
    var titles = data.titles || [];
    var activeTitle = data.activeTitle;
    var active = titles.filter(function (t) { return t.active; })[0];

    if (active || activeTitle) {
      $('title-active').textContent = active ? active.display : plain(activeTitle);
      $('title-active-sub').textContent = active ? (active.prefix || '').replace(/§./g, '') : '';
      $('btn-title-off').classList.remove('hidden');
    } else {
      $('title-active').textContent = '还没戴头衔';
      $('title-active-sub').textContent = '下面挑一个戴上';
      $('btn-title-off').classList.add('hidden');
    }

    $('title-count').textContent = (data.unlockedCount || 0) + ' / ' + (data.total || titles.length);

    $('title-list').innerHTML = titles.length ? titles.map(function (t) {
      var tag = t.active ? '<span class="tag on">佩戴中</span>'
        : (t.unlocked ? '<span class="tag ok">已解锁</span>' : '<span class="tag">未解锁</span>');
      var btn = t.active ? '' :
        '<button class="btn btn-mini" data-title="' + esc(t.id) + '">' + (t.unlocked ? '戴上' : '查看') + '</button>';
      var prog = '';
      if (!t.unlocked && t.progress >= 0 && t.conditionValue > 0) {
        var pct = Math.min(100, Math.round(t.progress * 100 / t.conditionValue));
        prog = '<div class="exp-bar" style="margin:6px 0 0;height:6px"><i style="width:' + pct + '%"></i></div>' +
          '<div class="hint">进度 ' + pct + '%</div>';
      }
      return '<div class="list-item"><div class="main"><b>' + esc(t.display || t.id) + '</b>' +
        '<div class="sub">' + esc(condText(t)) + '</div>' + prog + '</div>' +
        '<div class="tags">' + tag + '</div>' + btn + '</div>';
    }).join('') : '<p class="empty">服务器上没有配头衔</p>';
  }

  function equipTitle(id) {
    api('/api/titles', { body: { id: id || '' } }).then(function (r) {
      var d = r.data || {};
      toast(d.message || (d.ok ? '完成' : '失败'));
      if (d.data) renderTitles(d.data);
      loadMe();
    }).catch(function (e) { toast(e.message); });
  }

  // ── 命令 ─────────────────────────────────────────────

  function loadCommands() {
    if (state.cmdCatalog) { renderCmdGroups(); return; }
    api('/api/admin/commands').then(function (r) {
      var d = r.data || {};
      if (!d.ok) { $('cmd-list').innerHTML = '<p class="empty">' + esc(d.message || '读不到命令表') + '</p>'; return; }
      state.cmdCatalog = d;
      renderCmdGroups();
    }).catch(function (e) { fatal('读取命令表失败', e.message); });
  }

  function renderCmdGroups() {
    var cat = state.cmdCatalog || {};
    var groups = cat.groups || [];
    if (!groups.length) {
      $('cmd-groups').innerHTML = '';
      $('cmd-list').innerHTML = '<p class="empty">服务器没给命令表（admin.commands.enabled 关着？）</p>';
      return;
    }
    if (!state.cmdGroup || !groups.some(function (g) { return g.name === state.cmdGroup; })) {
      state.cmdGroup = groups[0].name;
    }
    $('cmd-groups').innerHTML = groups.map(function (g) {
      return '<button class="seg-btn' + (g.name === state.cmdGroup ? ' active' : '') +
        '" data-group="' + esc(g.name) + '">' + esc(g.name) + '</button>';
    }).join('');
    var cur = groups.filter(function (g) { return g.name === state.cmdGroup; })[0];
    var items = (cur && cur.items) || [];
    $('cmd-list').innerHTML = items.map(function (it) {
      return '<button class="cmd-item' + (it.danger ? ' danger' : '') + '" data-cmd="' + esc(it.cmd) + '">' +
        '<div class="cmd-label">' + esc(it.label) + (it.danger ? '<span class="cmd-badge">谨慎</span>' : '') + '</div>' +
        '<div class="cmd-args">' + esc(it.cmd) + (it.args ? ' ' + esc(it.args) : '') + '</div>' +
        '<div class="cmd-desc">' + esc(it.desc || '') + '</div></button>';
    }).join('');
  }

  function runCommand() {
    var cmd = $('f-cmd').value.trim();
    if (!cmd) { toast('先写要执行的命令'); return; }
    var dangerous = /^(stop|restart|reload|op|deop|whitelist|give|gamemode|gm|kick)\b/i.test(cmd);
    if (dangerous && !confirm('「' + cmd + '」可能弄坏服务器，确定要执行？')) return;

    var btn = $('btn-run');
    btn.disabled = true;
    btn.textContent = '执行中…';
    api('/api/admin/exec', { body: { command: cmd } }).then(function (r) {
      var d = r.data || {};
      showCmdOutput('$ ' + cmd, d.output || [], d.ok, d.message);
    }).catch(function (e) {
      showCmdOutput('$ ' + cmd, [], false, e.message);
    }).then(function () {
      btn.disabled = false;
      btn.textContent = '执行';
    });
  }

  function showCmdOutput(echo, lines, ok, message) {
    var box = $('cmd-out');
    var html = '<div class="cmd-echo">' + esc(echo) + '</div>';
    if (message) html += '<div class="' + (ok ? '' : 'cmd-err') + '">' + esc(message) + '</div>';
    if (lines && lines.length) {
      html += lines.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('');
    } else if (ok) {
      html += '<div class="hint">（没有输出）</div>';
    }
    box.innerHTML = html;
    box.classList.remove('hidden');
  }

  // ── 更多：在线玩家 / 管理 / 设置 ─────────────────────

  function loadPlayers() {
    api('/api/players').then(function (r) {
      var d = r.data || {};
      var list = d.players || [];
      $('online-list').innerHTML = list.length ? list.map(function (p) {
        var tags = [];
        if (p.team) tags.push('<span class="tag">' + esc(plain(p.team)) + '</span>');
        if (p.titleId) tags.push('<span class="tag ok">' + esc(p.titleId) + '</span>');
        return '<div class="list-item"><i class="dot on"></i><div class="main"><b>' + esc(p.name) + '</b>' +
          '<div class="sub">' + (p.level == null ? '—' : p.level) + ' 级 · ' + (p.ping == null ? '—' : p.ping + 'ms') +
          ' · ' + esc(p.world || '—') + '</div><div class="tags">' + tags.join('') + '</div></div>' +
          (state.admin ? '<button class="btn btn-mini" data-manage="' + esc(p.name) + '">管理</button>' : '') +
          '</div>';
      }).join('') : '<p class="empty">现在没人在线</p>';
    }).catch(function (e) { $('online-list').innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; });
  }

  function loadStatus() {
    api('/api/admin/status').then(function (r) {
      var d = r.data || {};
      if (!d.ok) return;
      var plugins = d.plugins || [];
      var on = plugins.filter(function (p) { return p.loaded; }).length;
      $('status-sub').textContent = on + ' / ' + plugins.length + ' 已加载';
      $('status-list').innerHTML = plugins.map(function (p) {
        return '<div class="list-item"><div class="main"><b>' + esc(p.label || p.name) + '</b>' +
          '<div class="sub">' + esc(p.name) + (p.version ? ' · v' + esc(p.version) : '') + '</div></div>' +
          '<span class="tag ' + (p.loaded ? 'ok' : '') + '">' + (p.loaded ? '已加载' : '没装') + '</span></div>';
      }).join('');

      var hooks = d.hooks || {};
      var feats = d.features || {};
      var bits = [];
      Object.keys(hooks).forEach(function (k) {
        if (hooks[k]) bits.push(k);
      });
      if (bits.length) {
        $('status-list').innerHTML += '<p class="hint" style="margin-top:10px">已接上的能力：' + esc(bits.join(' / ')) + '</p>';
      }
      var off = Object.keys(feats).filter(function (k) { return !feats[k]; });
      if (off.length) {
        $('status-list').innerHTML += '<p class="hint">关掉的功能：' + esc(off.join(' / ')) + '</p>';
      }
    }).catch(function () {});
  }

  function setAdminTab(tab) {
    state.adminTab = tab;
    Array.prototype.forEach.call(document.querySelectorAll('#admin-tabs .seg-btn'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-admin') === tab);
    });
    ['player', 'report', 'penalty', 'fake'].forEach(function (t) {
      var el = $('admin-' + t);
      if (el) el.classList.toggle('hidden', t !== tab);
    });
    if (tab === 'report') loadReports();
    if (tab === 'penalty') loadPenalties();
    if (tab === 'fake') loadFakes();
  }

  function searchPlayers() {
    var q = $('f-search').value.trim();
    if (!q) { toast('先写个名字'); return; }
    $('search-list').innerHTML = '<p class="empty">搜索中…</p>';
    $('player-detail').classList.add('hidden');
    api('/api/admin/players?q=' + encodeURIComponent(q)).then(function (r) {
      var d = r.data || {};
      var list = d.players || [];
      $('search-list').innerHTML = list.length ? list.map(function (p) {
        return '<div class="list-item"><div class="main"><b>' + esc(p.name) + '</b>' +
          '<div class="sub">' + (p.online ? '在线' : '离线') + (p.banned ? ' · 已封禁' : '') + '</div></div>' +
          '<button class="btn btn-mini" data-detail="' + esc(p.name) + '">详情</button></div>';
      }).join('') : '<p class="empty">没找到这个人</p>';
    }).catch(function (e) { $('search-list').innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; });
  }

  function playerDetail(name) {
    api('/api/admin/player?name=' + encodeURIComponent(name)).then(function (r) {
      var d = r.data || {};
      if (!d.ok) { toast(d.message || '读不到'); return; }
      var p = d.data || {};
      var rows = [
        ['状态', p.online ? '在线' : '离线'],
        ['金币', p.hasCoins ? fmt(p.coins) : '—'],
        ['点券', p.hasPoints ? fmt(p.points) : '—'],
        ['等级', p.level == null ? '—' : p.level],
        ['在线时长', hoursText(p.playtimeHours)],
        ['队伍', p.team ? plain(p.team) : '无'],
        ['头衔', p.titleName || '无'],
        ['封禁', p.banned ? ('是 · ' + (p.banReason || '未填写')) : '否']
      ].map(function (x) {
        return '<span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b>';
      }).join('');

      var penalties = [];
      var pmap = d.penalties || {};
      Object.keys(pmap).forEach(function (k) {
        if (pmap[k]) penalties.push(k);
      });

      var html = '<div class="card" style="margin:0"><div class="card-title"><h2>' + esc(p.name) + '</h2>' +
        '<span class="side">' + (penalties.length ? '在惩罚中：' + esc(penalties.join(' / ')) : '没有惩罚') + '</span></div>' +
        '<div class="kv">' + rows + '</div></div>';

      var kinds = [
        ['banmsg', '禁言'], ['banmove', '禁止移动'], ['banblock', '禁止交互'],
        ['all', '全部禁止'], ['ban', '封禁']
      ];
      html += '<div class="hint" style="margin-top:12px">惩罚（分钟数留空 = 永久）</div>' +
        '<div class="seg" style="margin-top:6px">' +
        kinds.map(function (k) {
          return '<button class="seg-btn" data-pen="' + k[0] + '">' + k[1] + '</button>';
        }).join('') +
        '</div>' +
        '<div class="seg" style="margin-top:8px">' +
        kinds.map(function (k) {
          var short = { banmsg: '解除禁言', banmove: '解除移动', banblock: '解除交互', all: '解除全部', ban: '解除封禁' };
          return '<button class="seg-btn" data-unpen="' + k[0] + '">' + (short[k[0]] || ('解除' + k[1])) + '</button>';
        }).join('') +
        '<button class="seg-btn" data-ban="0">解封</button></div>' +
        (penalties.length ? '<div class="hint" style="margin-top:8px">生效中：' + esc(penalties.join(' / ')) + '</div>' : '');

      var reps = d.reports || [];
      if (reps.length) {
        html += '<div class="hint" style="margin-top:10px">最近被举报：</div>' + reps.slice(0, 5).map(function (x) {
          return '<div class="list-item"><div class="main"><b>#' + x.id + ' ' + esc(x.reason) + '</b>' +
            '<div class="sub">' + esc(x.reporter) + ' · ' + (x.handled ? '已处理' : '待处理') + '</div></div></div>';
        }).join('');
      }
      var box = $('player-detail');
      box.innerHTML = html;
      box.classList.remove('hidden');
    }).catch(function (e) { toast(e.message); });
  }

  function applyPenalty(type, name, minutes, reason) {
    api('/api/admin/penalty', {
      body: { op: 'apply', type: type, name: name, minutes: minutes || 0, reason: reason || '' }
    }).then(function (r) {
      var d = r.data || {};
      toast(d.message || (d.ok ? '已执行' : '失败'));
      if (d.ok) { loadPenalties(); playerDetail(name); }
    }).catch(function (e) { toast(e.message); });
  }

  function releasePenalty(type, name) {
    api('/api/admin/penalty', { body: { op: 'release', type: type, name: name } }).then(function (r) {
      var d = r.data || {};
      toast(d.message || '已解除');
      loadPenalties();
      if (name) playerDetail(name);
    }).catch(function (e) { toast(e.message); });
  }

  function loadReports() {
    $('report-list').innerHTML = '<p class="empty">加载中…</p>';
    api('/api/admin/reports?pending=1').then(function (r) {
      var d = r.data || {};
      var list = d.reports || [];
      $('report-count').textContent = list.length ? list.length + ' 条待处理' : '没有待处理';
      $('report-list').innerHTML = list.length ? list.map(function (x) {
        var t = new Date(x.time || Date.now());
        return '<div class="list-item" style="align-items:flex-start"><div class="main">' +
          '<b>#' + x.id + ' ' + esc(x.target) + '</b>' +
          '<div class="sub">' + esc(plain(x.reason || '')) + '</div>' +
          '<div class="sub">举报人 ' + esc(x.reporter) + ' · ' + pad(t.getMonth() + 1) + '-' +
          pad(t.getDate()) + ' ' + pad(t.getHours()) + ':' + pad(t.getMinutes()) + '</div>' +
          '<div class="seg" style="margin-top:8px">' +
          '<button class="seg-btn" data-rep="accept" data-id="' + x.id + '">受理</button>' +
          '<button class="seg-btn" data-rep="reject" data-id="' + x.id + '">驳回</button>' +
          '</div></div></div>';
      }).join('') : '<p class="empty">没有待处理的举报</p>';
    }).catch(function (e) { $('report-list').innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; });
  }

  function handleReport(op, id) {
    var note = op === 'accept' ? prompt('处理说明（可留空）', '已处理') : prompt('驳回原因（可留空）', '证据不足');
    if (note === null) return;
    api('/api/admin/report', { body: { op: op, id: id, note: note } }).then(function (r) {
      var d = r.data || {};
      toast(d.message || (d.ok ? '已处理' : '失败'));
      loadReports();
    }).catch(function (e) { toast(e.message); });
  }

  function loadPenalties() {
    $('penalty-list').innerHTML = '<p class="empty">加载中…</p>';
    api('/api/admin/penalties').then(function (r) {
      var d = r.data || {};
      var list = d.penalties || [];
      $('penalty-count').textContent = list.length ? list.length + ' 条' : '没有生效中的惩罚';
      var CN = { banmsg: '禁言', banmove: '禁移动', banblock: '禁破坏', banall: '全部惩罚' };
      $('penalty-list').innerHTML = list.length ? list.map(function (x) {
        return '<div class="list-item"><div class="main"><b>' + esc(x.player) + '</b>' +
          '<div class="sub">' + esc(CN[x.type] || x.type) + ' · ' + esc(plain(x.reason || '')) + '</div>' +
          '<div class="sub">到期 ' + esc(x.expire || '—') + ' · 执行人 ' + esc(x.operator || '—') + '</div></div>' +
          '<button class="btn btn-mini" data-release="' + esc(x.type) + '" data-who="' + esc(x.player) + '">解除</button></div>';
      }).join('') : '<p class="empty">现在没有生效中的惩罚</p>';
    }).catch(function (e) { $('penalty-list').innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; });
  }

  var fakeSettings = {};

  function renderFakeSettings(st) {
    fakeSettings = st || {};
    var gm = fakeSettings.gamemode || 'CREATIVE';
    var inv = !!fakeSettings.invulnerable;
    $('fake-gm-text').textContent = gm === 'CREATIVE' ? '创造' : (gm === 'SURVIVAL' ? '生存'
      : (gm === 'ADVENTURE' ? '冒险' : gm));
    $('fake-inv-text').textContent = inv ? '是' : '否';
    $('fake-settings-sub').textContent = fakeSettings.prefix
      ? ('名字前缀 ' + fakeSettings.prefix) : '—';
  }

  function fakeSet(key, value) {
    api('/api/admin/fake', { body: { op: 'set', key: key, value: value } }).then(function (r) {
      var d = r.data || {};
      toast(d.message || '已保存');
      if (d.ok) loadFakes();
    }).catch(function (e) { toast(e.message); });
  }

  function fakeRespawn(name) {
    api('/api/admin/fake', { body: { op: 'respawn', name: name } }).then(function (r) {
      var d = r.data || {};
      toast(d.message || '已重生');
      loadFakes();
    }).catch(function (e) { toast(e.message); });
  }

  function loadFakes() {
    $('fake-list').innerHTML = '<p class="empty">加载中…</p>';
    api('/api/admin/fakes').then(function (r) {
      var d = r.data || {};
      if (!d.available) {
        $('fake-list').innerHTML = '<p class="empty">服务器没装 FakePlayerPlugin</p>';
        return;
      }
      renderFakeSettings(d.settings || {});
      var list = d.fakes || [];
      $('fake-list').innerHTML = list.length ? list.map(function (f) {
        var who = f.creator ? (' · 召唤者 ' + esc(f.creator)) : '';
        return '<div class="list-item"><i class="dot' + (f.active ? ' on' : '') + '"></i>' +
          '<div class="main"><b>' + esc(f.name) + '</b><div class="sub">' + esc(f.world || '—') +
          ' · ' + Math.round(f.x) + ', ' + Math.round(f.y) + ', ' + Math.round(f.z) + who + '</div></div>' +
          '<button class="btn btn-mini" data-fake-respawn="' + esc(f.name) + '">重生</button>' +
          '<button class="btn btn-mini" data-fake-remove="' + esc(f.name) + '">移除</button></div>';
      }).join('') : '<p class="empty">还没有假人</p>';
    }).catch(function (e) { $('fake-list').innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; });
  }

  function fakeAdd() {
    var name = $('f-fake').value.trim();
    if (!name) { toast('写个假人名字'); return; }
    api('/api/admin/fake', { body: { op: 'add', name: name } }).then(function (r) {
      var d = r.data || {};
      toast(d.message || (d.ok ? '已召唤' : '失败'));
      if (d.ok) { $('f-fake').value = ''; loadFakes(); }
    }).catch(function (e) { toast(e.message); });
  }

  function fakeRemove(name) {
    api('/api/admin/fake', { body: { op: 'remove', name: name } }).then(function (r) {
      var d = r.data || {};
      toast(d.message || '已移除');
      loadFakes();
    }).catch(function (e) { toast(e.message); });
  }

  // ── 接口地址 ─────────────────────────────────────────

  function saveServer() {
    state.server = normServer($('f-server-edit').value);
    $('f-server-edit').value = state.server;
    persist();
    $('set-server').textContent = state.server.replace(/^https?:\/\//, '');
    $('server-msg').textContent = '已保存：' + state.server + '，正在重新拉数据…';
    loadMe();
    loadPlayers();
  }

  function testServer() {
    var url = normServer($('f-server-edit').value);
    $('server-msg').textContent = '正在连 ' + url + ' …';
    fetch(url + '/api/health', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var caps = d.capabilities || {};
        var on = Object.keys(caps).filter(function (k) { return caps[k]; });
        $('server-msg').textContent = d.ok
          ? ('通了：' + (d.app || 'NalxerApp') + ' v' + (d.version || '?') +
            '（' + (on.length ? on.join('、') + ' ✓' : '没接上任何插件') + '）')
          : '连上了，但服务器说：' + (d.message || '不正常');
      })
      .catch(function (e) {
        $('server-msg').textContent = '连不上 ' + url + ' —— ' + e.message;
      });
  }

  function resetServer() {
    state.server = normServer(DEFAULT_SERVER);
    $('f-server-edit').value = state.server;
    persist();
    $('set-server').textContent = state.server.replace(/^https?:\/\//, '');
    $('server-msg').textContent = '已恢复默认：' + state.server;
    loadMe();
  }

  // ── 定时刷新 ─────────────────────────────────────────

  function startTimers() {
    stopTimers();
    state.timer = setInterval(function () {
      if (state.page === 'me') loadMe();
      if (state.page === 'chat') loadChat();
    }, 30000);
    state.chatTimer = setInterval(function () {
      if (state.page === 'chat') { loadChat(); return; }
      api('/api/chat?since=' + (state.chatLast || 0)).then(function (r) {
        var d = r.data || {};
        var msgs = d.messages || [];
        if (msgs.length) {
          state.chatLast = d.last || state.chatLast;
          state.chatMsgs = state.chatMsgs.concat(msgs).slice(-200);
          $('chat-dot').classList.remove('hidden');
        }
      }).catch(function () {});
    }, 12000);
  }

  function stopTimers() {
    if (state.timer) clearInterval(state.timer);
    if (state.chatTimer) clearInterval(state.chatTimer);
    state.timer = 0;
    state.chatTimer = 0;
  }

  // ── 事件绑定 ─────────────────────────────────────────

  function bind() {
    $('btn-login').addEventListener('click', doLogin);
    $('f-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    $('btn-refresh').addEventListener('click', function () {
      if (state.page === 'me') loadMe();
      else if (state.page === 'chat') loadChat();
      else if (state.page === 'team') loadTeam();
      else if (state.page === 'title') loadTitles();
      else if (state.page === 'more') { loadPlayers(); if (state.admin) loadStatus(); }
      toast('已刷新');
    });

    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.addEventListener('click', function () { switchPage(b.getAttribute('data-page')); });
    });

    $('btn-checkin').addEventListener('click', doCheckin);
    $('btn-chat-send').addEventListener('click', sendChat);
    $('f-chat').addEventListener('keydown', function (e) { if (e.key === 'Enter') sendChat(); });
    $('btn-team-create').addEventListener('click', function () {
      var name = $('f-team-name').value.trim();
      if (!name) { toast('先写队伍名字'); return; }
      teamAction('create', name);
    });
    $('btn-team-leave').addEventListener('click', function () {
      if (confirm('确定退出所有队伍？')) teamAction('leave', '');
    });
    $('btn-title-off').addEventListener('click', function () { equipTitle(''); });

    document.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-team],[data-leave],[data-join],[data-kick],[data-title],[data-group],[data-cmd]') : null;
      if (!t) return;
      if (t.hasAttribute('data-leave')) {
        var tn = t.getAttribute('data-leave');
        if (confirm('退出队伍「' + tn + '」？')) teamAction('leave', tn);
      } else if (t.hasAttribute('data-team')) {
        var tname = t.getAttribute('data-tname') || '';
        if (confirm('解散队伍' + (tname ? '「' + tname + '」' : '') + '？这个操作不可撤销')) teamAction('disband', tname);
      } else if (t.hasAttribute('data-join')) {
        teamAction('join', t.getAttribute('data-join'));
      } else if (t.hasAttribute('data-kick')) {
        var who = t.getAttribute('data-kick');
        if (confirm('把 ' + who + ' 踢出队伍？')) teamAction('kick', who);
      } else if (t.hasAttribute('data-title')) {
        var id = t.getAttribute('data-title');
        var row = t.parentNode;
        if (t.textContent === '查看') { toast('这个头衔还没解锁，条件见上面'); return; }
        equipTitle(id);
      } else if (t.hasAttribute('data-group')) {
        state.cmdGroup = t.getAttribute('data-group');
        renderCmdGroups();
      } else if (t.hasAttribute('data-cmd')) {
        var cmd = t.getAttribute('data-cmd');
        $('f-cmd').value = cmd + ' ';
        $('f-cmd').focus();
      }
    });

    $('btn-run').addEventListener('click', runCommand);
    $('f-cmd').addEventListener('keydown', function (e) { if (e.key === 'Enter') runCommand(); });

    $('btn-load-players').addEventListener('click', loadPlayers);
    Array.prototype.forEach.call(document.querySelectorAll('#admin-tabs .seg-btn'), function (b) {
      b.addEventListener('click', function () { setAdminTab(b.getAttribute('data-admin')); });
    });
    $('btn-search').addEventListener('click', searchPlayers);
    $('f-search').addEventListener('keydown', function (e) { if (e.key === 'Enter') searchPlayers(); });
    $('btn-load-reports').addEventListener('click', loadReports);
    $('btn-load-penalties').addEventListener('click', loadPenalties);
    $('btn-fake-add').addEventListener('click', fakeAdd);

    document.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-manage],[data-detail],[data-rep],[data-release],[data-pen],[data-unpen],[data-ban],[data-fake-remove],[data-fake-respawn],[data-fake-set]') : null;
      if (!t) return;
      if (t.hasAttribute('data-fake-set')) {
        fakeSet(t.getAttribute('data-fake-set'), t.getAttribute('data-value'));
        return;
      }
      if (t.hasAttribute('data-fake-respawn')) { fakeRespawn(t.getAttribute('data-fake-respawn')); return; }
      if (t.hasAttribute('data-unpen')) {
        var h0 = document.querySelector('#player-detail .card-title h2');
        var w0 = h0 ? h0.textContent : '';
        if (!w0) { toast('先选一个玩家'); return; }
        releasePenalty(t.getAttribute('data-unpen'), w0);
        return;
      }
      if (t.hasAttribute('data-manage')) { setAdminTab('player'); $('f-search').value = t.getAttribute('data-manage'); searchPlayers(); }
      else if (t.hasAttribute('data-detail')) playerDetail(t.getAttribute('data-detail'));
      else if (t.hasAttribute('data-rep')) handleReport(t.getAttribute('data-rep'), t.getAttribute('data-id'));
      else if (t.hasAttribute('data-release')) releasePenalty(t.getAttribute('data-release'), t.getAttribute('data-who'));
      else if (t.hasAttribute('data-fake-remove')) fakeRemove(t.getAttribute('data-fake-remove'));
      else if (t.hasAttribute('data-pen')) {
        var sel = document.querySelector('#player-detail .card-title h2');
        var who = sel ? sel.textContent : '';
        if (!who) { toast('先在下面选一个玩家'); return; }
        var kind = t.getAttribute('data-pen');
        var label = { banmsg: '禁言', banmove: '禁止移动', banblock: '禁止交互', all: '全部禁止', ban: '封禁' }[kind] || kind;
        var minStr = prompt('给 ' + who + ' 开「' + label + '」多少分钟？（留空 = 永久）', '10');
        if (minStr === null) return;
        var minutes = parseInt(minStr, 10);
        if (isNaN(minutes) || minutes < 0) minutes = 0;
        var why = prompt('原因（可留空）', 'App 管理员操作');
        if (why === null) return;
        applyPenalty(kind, who, minutes, why || '');
      } else if (t.hasAttribute('data-ban')) {
        var h = document.querySelector('#player-detail .card-title h2');
        var target = h ? h.textContent : '';
        if (!target) { toast('先选一个玩家'); return; }
        if (t.getAttribute('data-ban') === '1') {
          var res = prompt('封禁 ' + target + '，原因（留空为未填写）', '违反服务器规定');
          if (res === null) return;
          var mins = prompt('封多久（分钟，0 = 永久）', '0');
          if (mins === null) return;
          applyPenalty('ban', target, parseInt(mins, 10) || 0, res);
        } else {
          releasePenalty('ban', target);
        }
      }
    });

    $('btn-save-server').addEventListener('click', saveServer);
    $('btn-test-server').addEventListener('click', testServer);
    $('btn-reset-server').addEventListener('click', resetServer);
    $('sw-theme').addEventListener('click', toggleTheme);
    $('btn-logout').addEventListener('click', function () { logout(false); });
  }

  // ── 启动 ─────────────────────────────────────────────

  function boot() {
    initTheme();
    bind();

    state.server = normServer(localStorage.getItem(LS.server) || DEFAULT_SERVER);
    state.token = localStorage.getItem(LS.token) || '';
    state.name = localStorage.getItem(LS.name) || '';
    state.admin = localStorage.getItem(LS.admin) === '1';
    $('f-server').value = state.server;

    window.addEventListener('error', function (e) {
      fatal('出错了', (e.message || '') + (e.filename ? '\n' + e.filename + ':' + e.lineno : ''));
    });
    window.addEventListener('unhandledrejection', function (e) {
      fatal('请求出错', (e.reason && e.reason.message) || String(e.reason));
    });

    if (state.token) {
      enterApp();
      var tab = new URLSearchParams(location.search).get('page');
      if (tab) switchPage(tab);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
