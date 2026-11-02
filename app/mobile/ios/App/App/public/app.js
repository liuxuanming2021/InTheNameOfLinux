/* Nalxer App —— 前端逻辑（无框架，直接操作 DOM） */
'use strict';

const $ = (id) => document.getElementById(id);

// 拼 innerHTML 时用，服务端回显里有 < > & 也不怕
function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
const LS = window.localStorage;
const KEY_SERVER = 'nalxer.server';
const KEY_TOKEN = 'nalxer.token';
const KEY_NAME = 'nalxer.name';
const KEY_ADMIN = 'nalxer.admin';
const KEY_EXPIRE = 'nalxer.expire';

// 打包进来时的默认接口地址；用户可以在登录页 / 设置页改成自己的
const DEFAULT_SERVER = 'http://aam.rainplay.cn:49985';

// 把用户随手写的地址整理成标准形式：
//   aam.rainplay.cn:49985      -> http://aam.rainplay.cn:49985
//   nalxer.top                 -> http://nalxer.top
//   https://api.x.top/         -> https://api.x.top
function normServer(v) {
  let s = String(v || '').trim();
  if (!s) return '';
  s = s.replace(/\s+/g, '');
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  s = s.replace(/\/+$/, '');
  return s;
}

const state = {
  server: LS.getItem(KEY_SERVER) || DEFAULT_SERVER,
  token: LS.getItem(KEY_TOKEN) || '',
  name: LS.getItem(KEY_NAME) || '',
  admin: LS.getItem(KEY_ADMIN) === '1',
  expire: Number(LS.getItem(KEY_EXPIRE) || 0),
  page: 'me',
  me: null,
  selected: null,     // 管理页里选中的玩家
  duration: 0,        // 封禁时长（分钟，0 = 永久）
  timer: null
};

/* ────────── 工具 ────────── */

function toast(text, isErr) {
  const t = $('toast');
  t.textContent = text;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.className = 'toast'; }, 2600);
}

function apiUrl(path) {
  let base = state.server.trim();
  if (!base) base = '';
  if (base.endsWith('/')) base = base.slice(0, -1);
  return base + path;
}

async function api(path, opts) {
  opts = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (state.token && !opts.noAuth) headers['Authorization'] = 'Bearer ' + state.token;
  let res;
  try {
    res = await fetch(apiUrl(path), {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
  } catch (e) {
    throw new Error('连不上服务器，检查网络或接口地址');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!data) throw new Error('服务器返回异常（' + res.status + '）');
  if (data.ok === false) throw new Error(data.message || '请求失败');
  return data;
}

function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('zh-CN');
}

function fmtTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (v) => String(v).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function stripColor(s) {
  return s ? String(s).replace(/[§&][0-9a-fk-orA-FK-OR]/g, '') : '';
}

function avatarUrl(name, size) {
  const s = size || 128;
  // Crafatar 更稳；失败时 img.onerror 兜底到 mc-heads
  return 'https://crafatar.com/avatars/' + encodeURIComponent(name) + '?size=' + s + '&overlay';
}

function setAvatar(img, name, size) {
  const s = size || 128;
  const n = name || '?';
  let step = 0;
  img.onerror = () => {
    step++;
    if (step === 1) {
      img.src = 'https://mc-heads.net/avatar/' + encodeURIComponent(n) + '/' + s;
    } else if (step === 2) {
      img.onerror = null;
      img.src = initialAvatar(n, s);
    }
  };
  img.src = avatarUrl(n, s);
}

/** 最后兜底：画一个带首字母的圆角方块（离线也能看） */
function initialAvatar(name, size) {
  const ch = (name || '?').slice(0, 1).toUpperCase();
  const hue = Math.abs(hashCode(name)) % 360;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="hsl(' + hue + ',70%,55%)"/>' +
    '<stop offset="1" stop-color="hsl(' + ((hue + 40) % 360) + ',70%,40%)"/>' +
    '</linearGradient></defs>' +
    '<rect width="100%" height="100%" fill="url(#g)"/>' +
    '<text x="50%" y="54%" font-family="sans-serif" font-size="' + Math.round(size * 0.46) + '"' +
    ' font-weight="700" fill="#0b0f14" text-anchor="middle" dominant-baseline="middle">' + ch + '</text></svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/* ────────── 登录 ────────── */

$('f-server').value = state.server;

$('btn-login').onclick = doLogin;
$('f-pass').onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };

async function doLogin() {
  const server = normServer($('f-server').value);
  const name = $('f-name').value.trim();
  const pass = $('f-pass').value;
  const err = $('login-err');
  err.textContent = '';
  if (!server) { err.textContent = '请填写服务器接口地址'; return; }
  if (!name) { err.textContent = '请填写游戏 ID'; return; }
  // 密码不在这里强制校验：服务器开了 login.require-authme 时会自己回「请填写游戏 ID 和密码」，
  // 关掉密码校验的服（只认在线玩家）则允许空密码登录。

  const btn = $('btn-login');
  btn.disabled = true;
  btn.textContent = '登录中…';
  state.server = server;
  try {
    const r = await api('/api/login', {
      method: 'POST', noAuth: true,
      body: { name: name, password: pass }
    });
    state.token = r.token;
    state.name = r.name || name;
    state.admin = !!r.admin;
    state.expire = r.expiresAt || 0;
    persist();
    showApp();
    await loadMe();
    startAutoRefresh();
    $('f-pass').value = '';
  } catch (e) {
    err.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '登录';
  }
}

function persist() {
  LS.setItem(KEY_SERVER, state.server);
  LS.setItem(KEY_TOKEN, state.token);
  LS.setItem(KEY_NAME, state.name);
  LS.setItem(KEY_ADMIN, state.admin ? '1' : '0');
  LS.setItem(KEY_EXPIRE, String(state.expire));
}

function logout() {
  state.token = ''; state.name = ''; state.admin = false; state.expire = 0; state.me = null;
  persist();
  stopAutoRefresh();
  $('view-app').classList.remove('active');
  $('view-login').classList.remove('active');
  $('view-login').classList.add('active');
  $('f-name').value = '';
  $('f-pass').value = '';
}

// ── 设置页：改接口地址 ─────────────────────────────────
function setServerMsg(text, isErr) {
  const el = $('server-msg');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isErr ? '#ff9d9d' : 'var(--accent)';
}

function saveServer() {
  const v = normServer($('f-server-edit').value);
  if (!v) { setServerMsg('地址不能为空', true); return; }
  state.server = v;
  persist();
  $('st-server').textContent = v.replace(/^https?:\/\//, '');
  if (state.me) renderMe(state.me);
  setServerMsg('已保存：' + v + '，正在重新拉数据…');
  loadMe().then(function () {
    setServerMsg('已连上新地址，数据已刷新');
  }).catch(function (e) {
    setServerMsg('保存了，但连不上：' + e.message, true);
  });
}

async function testServer() {
  const v = normServer($('f-server-edit').value);
  if (!v) { setServerMsg('先填地址', true); return; }
  setServerMsg('测试中…');
  try {
    const res = await fetch(v + '/api/health');
    const j = await res.json();
    const caps = j.capabilities || {};
    setServerMsg('通了：' + (j.app || 'NalxerApp') + ' v' + (j.version || '?') +
      '（金币' + (caps.coins ? '✔' : '✘') + ' 点券' + (caps.points ? '✔' : '✘') +
      ' 封禁' + (caps.bans ? '✔' : '✘') + '）');
  } catch (e) {
    setServerMsg('连不上：检查地址、端口、安全组和插件是否在跑', true);
  }
}

if ($('btn-save-server')) {
  $('btn-save-server').onclick = saveServer;
  $('btn-test-server').onclick = testServer;
  $('btn-reset-server').onclick = function () {
    $('f-server-edit').value = DEFAULT_SERVER;
    setServerMsg('已填回默认地址，点保存生效');
  };
  $('f-server-edit').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); saveServer(); }
  });
}

$('btn-logout').onclick = logout;

/* ────────── 主界面 ────────── */

function showApp() {
  $('view-login').classList.remove('active');
  $('view-app').classList.add('active');
  $('tb-sub').textContent = state.name;
  $('tab-admin-btn').classList.toggle('hidden', !state.admin);
  switchPage(state.admin ? 'me' : 'me');
  $('st-user').textContent = state.name;
  $('st-server').textContent = state.server.replace(/^https?:\/\//, '');
  $('f-server-edit').value = state.server;
  $('st-admin').textContent = state.admin ? '有（可封禁 / 解封）' : '无';
  $('st-expire').textContent = state.expire ? fmtTime(state.expire) : '—';
}

const TITLES = { me: '我的数据', admin: '玩家管理', settings: '设置' };

function switchPage(page) {
  state.page = page;
  document.querySelectorAll('.page').forEach((el) => el.classList.remove('active'));
  $('page-' + page).classList.add('active');
  document.querySelectorAll('.tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  $('tb-title').textContent = TITLES[page] || 'Nalxer';
  if (page === 'admin') {
    setAdminTab(state.adminTab || 'ban');
  }
}

// ── 管理页：玩家封禁 / 服务器命令 两个子标签 ──────────────

function setAdminTab(tab) {
  state.adminTab = tab;
  document.querySelectorAll('#admin-tabs .seg-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.adminTab === tab);
  });
  $('admin-ban-view').classList.toggle('hidden', tab !== 'ban');
  $('admin-cmd-view').classList.toggle('hidden', tab !== 'cmd');
  if (tab === 'ban') {
    loadBans();
    if (!state.selected) $('op-panel').classList.add('hidden');
  } else {
    loadCommands();
  }
}

document.querySelectorAll('#admin-tabs .seg-btn').forEach((b) => {
  b.onclick = () => setAdminTab(b.dataset.adminTab);
});

let cmdCatalog = null;
let cmdGroup = 0;

async function loadCommands() {
  if (!cmdCatalog) {
    try {
      const r = await api('/api/admin/commands');
      cmdCatalog = r;
    } catch (e) {
      $('cmd-list').innerHTML = '<p class="err">' + esc(e.message) + '</p>';
      return;
    }
  }
  renderCmdGroups();
  renderCmdList();
}

function renderCmdGroups() {
  const groups = cmdCatalog.groups || [];
  const box = $('cmd-groups');
  box.innerHTML = '';
  groups.forEach((g, i) => {
    const b = document.createElement('button');
    b.className = 'seg-btn' + (i === cmdGroup ? ' active' : '');
    b.textContent = g.name;
    b.onclick = () => { cmdGroup = i; renderCmdGroups(); renderCmdList(); };
    box.appendChild(b);
  });
}

function renderCmdList() {
  const groups = cmdCatalog.groups || [];
  const list = $('cmd-list');
  list.innerHTML = '';
  if (!cmdCatalog.enabled) {
    list.innerHTML = '<p class="hint">服务器把命令功能关了（config.yml 的 admin.commands.enabled）。</p>';
    return;
  }
  const g = groups[cmdGroup] || { items: [] };
  g.items.forEach((it) => {
    const el = document.createElement('button');
    el.className = 'cmd-item' + (it.danger ? ' danger' : '');
    el.innerHTML =
      '<div class="cmd-main">' +
        '<div class="cmd-label">' + esc(it.label) +
          (it.danger ? ' <span class="cmd-badge">谨慎</span>' : '') +
        '</div>' +
        '<div class="cmd-args">' + esc(it.cmd) + ' ' + esc(it.args || '') + '</div>' +
        (it.desc ? '<div class="cmd-desc">' + esc(it.desc) + '</div>' : '') +
      '</div>';
    el.onclick = () => {
      const input = $('f-cmd');
      input.value = it.cmd + (it.args ? ' ' : ' ');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      if (it.args) toast('填上后面的参数再执行');
    };
    list.appendChild(el);
  });
}

$('btn-run').onclick = runCommand;
$('f-cmd').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); runCommand(); }
});

async function runCommand() {
  const input = $('f-cmd');
  const cmd = (input.value || '').trim();
  if (!cmd) { toast('先写一条命令', true); return; }

  const danger = /^(stop|reload|op|deop|whitelist|give|gamemode|gm)(\s|$)/i.test(cmd) ||
                 (cmdCatalog && cmdKnownDanger(cmd));
  if (danger && !confirm('这条命令会改服务器状态：\n\n' + cmd + '\n\n确定执行？')) return;

  const btn = $('btn-run');
  btn.disabled = true; btn.textContent = '执行中…';
  try {
    const r = await api('/api/admin/exec', { method: 'POST', body: { command: cmd } });
    showCmdOutput('$ ' + cmd, r.output || [], true);
  } catch (e) {
    showCmdOutput('$ ' + cmd, [e.message], false);
  } finally {
    btn.disabled = false; btn.textContent = '执行';
  }
}

function cmdKnownDanger(cmd) {
  const groups = cmdCatalog.groups || [];
  for (const g of groups) {
    for (const it of g.items) {
      if (it.danger && cmd.toLowerCase().startsWith(it.cmd.toLowerCase())) return true;
    }
  }
  return false;
}

function showCmdOutput(echo, lines, ok) {
  const box = $('cmd-out');
  box.classList.remove('hidden');
  box.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'cmd-echo';
  head.textContent = echo;
  box.appendChild(head);
  lines.forEach((l) => {
    const d = document.createElement('div');
    d.className = ok ? '' : 'cmd-err';
    d.textContent = l;
    box.appendChild(d);
  });
  box.scrollTop = 0;
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.onclick = () => {
    if (btn.dataset.page === 'admin' && !state.admin) {
      toast('没有管理权限', true);
      return;
    }
    switchPage(btn.dataset.page);
  };
});

$('btn-refresh').onclick = async () => {
  $('btn-refresh').classList.add('spin');
  try {
    if (state.page === 'admin') { await loadBans(); } else { await loadMe(); }
    toast('已刷新');
  } catch (e) {
    toast(e.message, true);
  } finally {
    setTimeout(() => $('btn-refresh').classList.remove('spin'), 500);
  }
};

/* ────────── 我的数据 ────────── */

async function loadMe() {
  const r = await api('/api/me');
  state.me = r.data;
  renderMe(r.data);
}

function renderMe(d) {
  setAvatar($('avatar'), d.name || state.name, 128);
  $('p-name').textContent = d.name || '—';

  const online = !!d.online;
  $('p-online').className = 'dot ' + (online ? 'online' : 'offline');
  $('p-state').textContent = online ? '在线 · 正在服务器里玩' : '离线';

  // 队伍 / 头衔 / 等级徽标
  const team = d.team ? stripColor(d.team).trim() : '';
  const title = d.title ? stripColor(d.title).trim() : '';

  const elTeam = $('p-team'), elTitle = $('p-title'), elLevel = $('p-level');
  elTeam.classList.toggle('hidden', !team);
  if (team) elTeam.textContent = team;
  elTitle.classList.toggle('hidden', !title);
  if (title) { elTitle.textContent = title; elTitle.classList.add('gold'); }
  const lvl = Number(d.level || 0);
  elLevel.classList.toggle('hidden', lvl <= 0);

  // 三张数据卡
  $('s-coins').textContent = d.hasCoins ? fmtNum(d.coins) : '—';
  $('s-points').textContent = d.hasPoints ? fmtNum(d.points) : '—';
  $('s-level').textContent = fmtNum(lvl);

  // 经验进度：Minecraft 升级所需经验
  const need = expForLevel(lvl);
  const cur = Number(d.exp || 0);
  const pct = need > 0 ? Math.min(100, Math.round((cur / need) * 100)) : 0;
  $('e-fill').style.width = pct + '%';
  $('e-text').textContent = need > 0 ? (cur + ' / ' + need + ' 经验（' + pct + '%）') : '—';

  // 明细
  const hours = Number(d.playtimeHours || 0);
  $('d-playtime').textContent = hours >= 1
    ? (Math.round(hours * 10) / 10 + ' 小时')
    : (Math.round(hours * 60) + ' 分钟');
  $('d-first').textContent = fmtTime(d.firstPlayed);
  $('d-last').textContent = fmtTime(d.lastPlayed);
  $('d-uuid').textContent = d.uuid || '—';

  // 封禁状态
  const box = $('banned-box');
  if (d.banned) {
    box.classList.remove('hidden');
    $('warn-reason').textContent = d.banReason || '原因未写';
  } else {
    box.classList.add('hidden');
  }
}

/** 1.12.2 升级所需经验（1~15 级 2L+7，16~30 级 5L-38，31+ 9L-158） */
function expForLevel(level) {
  if (level <= 0) return 7;
  if (level <= 15) return 2 * level + 7;
  if (level <= 30) return 5 * level - 38;
  return 9 * level - 158;
}

/* ────────── 管理页 ────────── */

$('btn-search').onclick = doSearch;
$('f-search').onkeydown = (e) => { if (e.key === 'Enter') doSearch(); };

async function doSearch() {
  const q = $('f-search').value.trim();
  if (!q) return;
  const list = $('search-list');
  list.innerHTML = '<div class="muted" style="padding:10px 4px">搜索中…</div>';
  try {
    const r = await api('/api/admin/search?q=' + encodeURIComponent(q));
    const hits = r.hits || [];
    if (!hits.length) {
      list.innerHTML = '<div class="muted" style="padding:10px 4px">没找到这个玩家</div>';
      return;
    }
    list.innerHTML = '';
    hits.forEach((h) => {
      const wrap = document.createElement('div');
      wrap.className = 'search-item';
      const img = document.createElement('img');
      img.className = 'avatar sm';
      setAvatar(img, h.name, 64);
      const nm = document.createElement('div');
      nm.className = 'nm';
      const b = document.createElement('b');
      b.textContent = h.name;
      const s = document.createElement('span');
      s.textContent = (h.online ? '在线' : '离线') + (h.banned ? ' · 已封禁' : '');
      nm.appendChild(b); nm.appendChild(s);
      wrap.appendChild(img); wrap.appendChild(nm);
      wrap.onclick = () => selectPlayer(h.name);
      list.appendChild(wrap);
    });
  } catch (e) {
    list.innerHTML = '';
    toast(e.message, true);
  }
}

async function selectPlayer(name) {
  state.selected = name;
  $('op-panel').classList.remove('hidden');
  $('op-name').textContent = name;
  $('op-state').textContent = '读取中…';
  $('op-msg').textContent = '';
  setAvatar($('op-avatar'), name, 64);
  try {
    const r = await api('/api/me?name=' + encodeURIComponent(name));
    const d = r.data;
    $('op-state').textContent = (d.online ? '在线' : '离线') +
      ' · 金币 ' + (d.hasCoins ? fmtNum(d.coins) : '—') +
      ' · 点券 ' + (d.hasPoints ? fmtNum(d.points) : '—') +
      (d.banned ? ' · 已封禁' : '');
  } catch (e) {
    $('op-state').textContent = e.message;
  }
}

document.querySelectorAll('.seg-btn').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    state.duration = Number(b.dataset.min || 0);
  };
});

$('btn-ban').onclick = async () => {
  if (!state.selected) { toast('先选一个玩家', true); return; }
  const reason = $('f-reason').value.trim() || '违反服务器规则';
  const msg = $('op-msg');
  msg.textContent = '';
  $('btn-ban').disabled = true;
  try {
    const body = { name: state.selected, reason: reason };
    if (state.duration > 0) body.minutes = state.duration;
    const r = await api('/api/admin/ban', { method: 'POST', body: body });
    msg.textContent = r.message || '已封禁';
    toast(r.message || '已封禁');
    await loadBans();
    if (state.selected) selectPlayer(state.selected);
  } catch (e) {
    msg.textContent = e.message;
    toast(e.message, true);
  } finally {
    $('btn-ban').disabled = false;
  }
};

$('btn-unban').onclick = async () => {
  if (!state.selected) { toast('先选一个玩家', true); return; }
  const msg = $('op-msg');
  msg.textContent = '';
  $('btn-unban').disabled = true;
  try {
    const r = await api('/api/admin/unban', { method: 'POST', body: { name: state.selected } });
    msg.textContent = r.message || '已解封';
    toast(r.message || '已解封');
    await loadBans();
    selectPlayer(state.selected);
  } catch (e) {
    msg.textContent = e.message;
    toast(e.message, true);
  } finally {
    $('btn-unban').disabled = false;
  }
};

async function loadBans() {
  if (!state.admin) return;
  try {
    const r = await api('/api/admin/bans');
    const bans = r.bans || [];
    $('ban-count').textContent = bans.length ? bans.length + ' 条' : '没有封禁记录';
    const box = $('ban-list');
    box.innerHTML = '';
    bans.forEach((b) => {
      const row = document.createElement('div');
      row.className = 'ban-item';
      const nm = document.createElement('div');
      nm.className = 'nm';
      const bb = document.createElement('b');
      bb.textContent = b.player;
      const sp = document.createElement('span');
      sp.textContent = (b.reason || '无原因') + ' · ' + (b.operator || '未知');
      nm.appendChild(bb); nm.appendChild(sp);

      const exp = document.createElement('span');
      exp.className = 'exp';
      exp.textContent = b.expire || '永久';

      const btn = document.createElement('button');
      btn.className = 'mini-btn';
      btn.textContent = '解封';
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          const rr = await api('/api/admin/unban', { method: 'POST', body: { name: b.player } });
          toast(rr.message || '已解封');
          await loadBans();
        } catch (e) {
          toast(e.message, true);
          btn.disabled = false;
        }
      };

      row.appendChild(nm); row.appendChild(exp); row.appendChild(btn);
      box.appendChild(row);
    });
  } catch (e) {
    toast(e.message, true);
  }
}

/* ────────── 自动刷新 ────────── */

function startAutoRefresh() {
  stopAutoRefresh();
  state.timer = setInterval(async () => {
    if (!state.token || document.hidden) return;
    try {
      if (state.page === 'me') await loadMe();
      else if (state.page === 'admin') await loadBans();
    } catch (e) {
      if (/令牌|登录/.test(e.message)) { toast('登录已过期，请重新登录', true); logout(); }
    }
  }, 30000);
}

function stopAutoRefresh() {
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
}

/* ────────── 启动 ────────── */

// 任何脚本错误都亮一条红条，别静默白屏（方便真机上排查）
// 任何脚本错误都亮一条红条，别静默白屏（方便真机上排查）
function showFatal(prefix, detail) {
  try {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:999;padding:10px 12px;'
      + 'border-radius:10px;background:#7a1f1f;color:#ffdede;font:12px/1.5 monospace;white-space:pre-wrap';
    d.textContent = prefix + String.fromCharCode(10) + detail;
    document.body.appendChild(d);
  } catch (x) {}
}
window.addEventListener('error', function (e) {
  showFatal('脚本出错：' + (e.message || e.error),
    (e.filename || '') + ':' + e.lineno);
});
window.addEventListener('unhandledrejection', function (e) {
  var r = e.reason || {};
  showFatal('Promise 出错：', (r.stack || r.message || String(r)));
});

(async function boot() {
  // 调试用：?page=admin 可直接打开某页（打包后正常用底部标签切换）
  const want = (new URLSearchParams(location.search).get('page') || '').trim();

  if (state.token) {
    showApp();
    if (want && (want !== 'admin' || state.admin)) switchPage(want);
    // 调试用：?tab=cmd 直接进管理页的命令子标签
    const tab = (new URLSearchParams(location.search).get('tab') || '').trim();
    if (tab && state.admin) setAdminTab(tab);
    try {
      await loadMe();
      startAutoRefresh();
    } catch (e) {
      if (/令牌|登录|过期/.test(e.message)) { logout(); }
      else { toast(e.message, true); }
    }
  } else {
    $('view-login').classList.add('active');
  }
})();
