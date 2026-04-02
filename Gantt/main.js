/* ═══════════════════════════════════════════════════════
   Bland2Grand · main.js
═══════════════════════════════════════════════════════ */

// ── CONFIG ────────────────────────────────────────────
const DATA_URL     = 'tasks.json';
const STORAGE_KEY     = 'b2g_tasks_v2';
const COLLAPSE_KEY    = 'b2g_collapse_v1';
const SIDEBAR_WIDTH_KEY = 'b2g_sidebar_w_v1';
const SIDEBAR_DEFAULT_W = 360;

const PHASE_COLORS = { 1:'#3b82f6', 2:'#06b6d4', 3:'#10b981', 4:'#f59e0b', 5:'#a855f7' };
const PHASE_DIMS   = { 1:'rgba(59,130,246,.18)', 2:'rgba(6,182,212,.18)', 3:'rgba(16,185,129,.18)', 4:'rgba(245,158,11,.18)', 5:'rgba(168,85,247,.18)' };
const PROJECT_START = new Date(2026, 3, 1);
const PROJECT_END   = new Date(2026, 5, 5);

function parseTaskDate(d) {
  if (d == null || d === '') return PROJECT_START;
  if (d instanceof Date) return d;
  var s = String(d);
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return new Date(d);
}

let PX_PER_DAY = 24;
let tasks       = [];
let collapsed   = {};
let filterPhase = 'all';
let searchQ     = '';
let editingId   = null;

// ── INIT ─────────────────────────────────────────────
async function init() {
  try { collapsed = JSON.parse(localStorage.getItem(COLLAPSE_KEY)) || {}; } catch { collapsed = {}; }
  loadSidebarWidth();
  initSidebarResize();
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) { try { tasks = JSON.parse(saved); } catch { tasks = []; } }
  if (!tasks || !tasks.length) {
    const res  = await fetch(DATA_URL);
    const json = await res.json();
    tasks = json.tasks;
    persist();
  }
  render();
}

function sidebarWidthClamp() {
  var minW = 200;
  var maxW = Math.min(720, Math.floor(window.innerWidth * 0.65));
  if (maxW < minW + 40) maxW = minW + 40;
  return { min: minW, max: maxW };
}

function applySidebarWidth(px) {
  var c = sidebarWidthClamp();
  var w = Math.round(px);
  if (w < c.min) w = c.min;
  if (w > c.max) w = c.max;
  document.documentElement.style.setProperty('--sidebar-w', w + 'px');
  return w;
}

function loadSidebarWidth() {
  var raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
  var w = raw ? parseInt(raw, 10) : NaN;
  if (!isFinite(w)) w = SIDEBAR_DEFAULT_W;
  return applySidebarWidth(w);
}

function initSidebarResize() {
  var handle = document.getElementById('sidebarResize');
  if (!handle) return;

  var dragging = false;
  var startX = 0;
  var startW = 0;

  function readCurrentW() {
    var cs = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim();
    return parseInt(cs, 10) || SIDEBAR_DEFAULT_W;
  }

  function onMove(clientX) {
    if (!dragging) return;
    var dx = clientX - startX;
    applySidebarWidth(startW + dx);
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(readCurrentW()));
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('touchcancel', onTouchEnd);
  }

  function onMouseMove(e) { onMove(e.clientX); }
  function onMouseUp() { endDrag(); }
  function onTouchMove(e) {
    if (e.touches && e.touches[0]) { onMove(e.touches[0].clientX); e.preventDefault(); }
  }
  function onTouchEnd() { endDrag(); }

  handle.addEventListener('mousedown', function(e) {
    dragging = true; startX = e.clientX; startW = readCurrentW();
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  });

  handle.addEventListener('touchstart', function(e) {
    if (!e.touches || !e.touches[0]) return;
    dragging = true; startX = e.touches[0].clientX; startW = readCurrentW();
    handle.classList.add('active');
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('resize', function() { applySidebarWidth(readCurrentW()); });
}

// ── PERSIST ───────────────────────────────────────────
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
}

async function saveToFile() {
  try {
    const res = await fetch('/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks })
    });
    showSaveIndicator(res.ok ? 'Saved to disk \u2713' : 'Save failed \u2717', !res.ok);
  } catch {
    showSaveIndicator('Saved locally \u2713', false);
  }
}

function showSaveIndicator(msg, isError) {
  const bar = document.getElementById('statusBar');
  const old = document.getElementById('saveIndicator');
  if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'saveIndicator';
  el.style.cssText = 'font-family:var(--font-mono);font-size:10px;font-weight:700;' +
    'color:' + (isError ? '#f43f5e' : '#22c55e') + ';margin-left:12px;transition:opacity .5s';
  el.textContent = msg;
  bar.appendChild(el);
  setTimeout(function() { el.style.opacity = '0'; setTimeout(function() { el.remove(); }, 600); }, 2200);
}

function persistAndSave() { persist(); saveToFile(); }
setInterval(function() { if (tasks && tasks.length) saveToFile(); }, 30000);

// ── UTILS ─────────────────────────────────────────────
const daysBetween = function(a, b) { return (new Date(b) - new Date(a)) / 86400000; };
const dateToX     = function(d)    { return daysBetween(PROJECT_START, parseTaskDate(d)) * PX_PER_DAY; };
const totalDays   = function()     { return Math.ceil(daysBetween(PROJECT_START, PROJECT_END)) + 2; };
const f           = function(n)    { return (+n).toFixed(1); };

function getParentId(id) {
  if (!id || id.startsWith('P') || id.startsWith('M')) return null;
  const m = id.match(/^(\d+)[a-z]/);
  return m ? m[1] : null;
}
function isCollapsedChild(task) {
  const pid = getParentId(task.id);
  return pid ? !!collapsed[pid] : false;
}
function getColor(task) {
  return task.type === 'milestone' ? '#f43f5e' : (PHASE_COLORS[task.phase] || '#8b949e');
}
function isVisible(task) {
  if (filterPhase !== 'all') {
    if (task.type === 'phase') return task.id === 'P' + filterPhase;
    if (task.phase != filterPhase) return false;
  }
  if (searchQ) {
    const q = searchQ.toLowerCase();
    return task.name.toLowerCase().includes(q) || task.id.toLowerCase().includes(q);
  }
  return true;
}
function getProgressColor(pct) {
  if (pct >= 100) return '#22c55e';
  if (pct >= 50)  return '#f59e0b';
  return '#3b82f6';
}

// ── RENDER ────────────────────────────────────────────
function render() { renderSidebar(); renderGantt(); renderStats(); }

// ── SIDEBAR ───────────────────────────────────────────
function renderSidebar() {
  const container = document.getElementById('taskList');
  const frags = [];

  tasks.forEach(function(task) {
    if (!isVisible(task)) return;
    const hidden  = isCollapsedChild(task) ? ' hidden' : '';
    const color   = getColor(task);
    const isDone  = task.progress >= 100;
    const hasKids = tasks.some(function(t) { return getParentId(t.id) === task.id && isVisible(t); });
    const deps    = task.dep || '\u2014';

    let rowClass = 'row ';
    if      (task.type === 'phase')     rowClass += 'rph';
    else if (task.type === 'milestone') rowClass += 'rms';
    else if (task.type === 'task')      rowClass += 'rtask';
    else                                rowClass += 'rsub';
    if (isDone) rowClass += ' done';
    rowClass += hidden;

    let indent = '';
    if (task.type === 'task' || task.type === 'milestone') indent = 'i1';
    if (task.type === 'subtask') indent = 'i2';

    const tog = hasKids
      ? '<button class="toggle-btn' + (collapsed[task.id] ? ' coll' : '') + '" onclick="event.stopPropagation();toggleCollapse(\'' + task.id + '\')"><i class="fa-solid fa-chevron-down"></i></button>'
      : '<span style="width:14px;flex-shrink:0;display:inline-block"></span>';

    if (task.type === 'phase') {
      frags.push('<div class="' + rowClass + '" data-id="' + task.id + '">' +
        '<div class="row-inner">' +
        '<div class="row-name"><div class="phase-pill" style="background:' + color + '"></div>' +
        '<span class="task-name">' + task.name + '</span></div>' +
        '<div class="row-dur">' + task.dur + 'd</div><div class="row-dep">\u2014</div><div></div><div></div>' +
        '</div></div>');
      return;
    }

    const pct  = task.type === 'milestone' ? (isDone ? 100 : 0) : (task.progress || 0);
    const pcol = getProgressColor(pct);
    const msIc = task.type === 'milestone' ? '<i class="fa-solid fa-diamond" style="color:#f43f5e;font-size:10px;flex-shrink:0"></i>' : '';
    const pill = task.type !== 'milestone' ? '<div class="phase-pill" style="background:' + color + ';opacity:.5"></div>' : '';
    const tag  = (task.type !== 'phase' && task.type !== 'milestone') ? task.id : '';

    frags.push(
      '<div class="' + rowClass + '" data-id="' + task.id + '" onclick="openEdit(\'' + task.id + '\')">' +
      '<div class="row-inner">' +
      '<div class="row-name ' + indent + '">' + msIc + pill + tog +
      '<span class="task-tag">' + tag + '</span>' +
      '<span class="task-name">' + task.name + '</span></div>' +
      '<div class="row-dur">' + (task.dur > 0 ? task.dur + 'd' : '\u2014') + '</div>' +
      '<div class="row-dep" title="' + (task.dep || '') + '">' + deps + '</div>' +
      '<div class="row-prog" onclick="event.stopPropagation();quickProgress(\'' + task.id + '\')" title="Click to cycle progress">' +
      '<div class="prog-bar-wrap"><div class="prog-bar-fill" style="width:' + pct + '%;background:' + pcol + '"></div></div>' +
      '<div class="prog-pct">' + pct + '%</div></div>' +
      '<div class="row-acts">' +
      '<button class="act-btn' + (isDone ? ' done-check' : '') + '" title="' + (isDone ? 'Mark incomplete' : 'Mark complete') + '" onclick="event.stopPropagation();toggleDone(\'' + task.id + '\')">' +
      '<i class="fa-solid ' + (isDone ? 'fa-check-circle' : 'fa-circle') + '"></i></button>' +
      '<button class="act-btn" title="Edit" onclick="event.stopPropagation();openEdit(\'' + task.id + '\')">' +
      '<i class="fa-solid fa-pen-to-square"></i></button>' +
      '</div></div></div>'
    );
  });

  container.innerHTML = frags.join('');
}

// ── GANTT ─────────────────────────────────────────────
function renderGantt() {
  const total  = totalDays();
  const W      = total * PX_PER_DAY;
  const months = buildMonths(total);

  let hdrHtml = '';
  months.forEach(function(m) {
    const mw    = m.days.length * PX_PER_DAY;
    const weeks = [];
    for (let i = 0; i < m.days.length; i += 7) {
      const dt = new Date(PROJECT_START);
      dt.setDate(dt.getDate() + m.days[i]);
      weeks.push(dt.getDate());
    }
    hdrHtml += '<div class="gh-month" style="width:' + mw + 'px">' +
      '<div class="gh-month-label">' + m.label + '</div>' +
      '<div class="gh-weeks">' +
      weeks.map(function(w) { return '<div class="gh-week" style="width:' + (7 * PX_PER_DAY) + 'px">' + w + '</div>'; }).join('') +
      '</div></div>';
  });
  const hdr = document.getElementById('ganttHeader');
  hdr.innerHTML   = hdrHtml;
  hdr.style.width = W + 'px';

  const body = document.getElementById('ganttBody');
  body.style.width = W + 'px';

  let html = '';

  for (let d = 0; d < total; d++) {
    const dt = new Date(PROJECT_START);
    dt.setDate(dt.getDate() + d);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6)
      html += '<div class="g-weekend" style="left:' + (d * PX_PER_DAY) + 'px;width:' + PX_PER_DAY + 'px"></div>';
  }

  months.forEach(function(m) {
    html += '<div class="g-line month" style="left:' + (m.startDay * PX_PER_DAY) + 'px"></div>';
    for (let i = 7; i < m.days.length; i += 7)
      html += '<div class="g-line" style="left:' + ((m.startDay + i) * PX_PER_DAY) + 'px"></div>';
  });

  const todayX = daysBetween(PROJECT_START, new Date()) * PX_PER_DAY;
  if (todayX >= 0 && todayX <= W)
    html += '<div class="g-today" style="left:' + todayX + 'px"></div>';

  tasks.forEach(function(task) {
    if (!isVisible(task)) return;
    const hidden = isCollapsedChild(task) ? ' hidden' : '';
    const color  = getColor(task);
    const isDone = task.progress >= 100;
    const x      = dateToX(task.start);

    let bar = '';
    if (task.type === 'phase') {
      bar = '<div class="gbar gbar-phase" style="left:' + x + 'px;width:' + (task.dur * PX_PER_DAY) + 'px;background:' + color + '"></div>';
    } else if (task.type === 'milestone') {
      bar = '<div class="gbar gbar-ms" style="left:' + (x - 8) + 'px;top:8px;background:#f43f5e"' +
        ' onmouseenter="showTT(event,\'' + task.id + '\')" onmouseleave="hideTT()" onclick="openEdit(\'' + task.id + '\')"></div>';
    } else if (task.dur > 0) {
      const w   = Math.max(task.dur * PX_PER_DAY - 2, 4);
      const pct = task.progress || 0;
      const lbl = task.type === 'task' ? '' : task.id;
      bar = '<div class="gbar" style="left:' + (x + 1) + 'px;width:' + w + 'px;background:' + color + ';opacity:' + (task.type === 'task' ? 1 : 0.8) + (isDone ? ';filter:brightness(.7)' : '') + '"' +
        ' onmouseenter="showTT(event,\'' + task.id + '\')" onmouseleave="hideTT()" onclick="openEdit(\'' + task.id + '\')">' +
        '<div class="gbar-prog" style="width:' + pct + '%"></div>' +
        '<span class="gbar-label">' + lbl + '</span>' +
        (isDone ? '<i class="fa-solid fa-check" style="margin-left:auto;font-size:8px;position:relative;z-index:2"></i>' : '') +
        '</div>';
    }

    let gc = 'grow ';
    if      (task.type === 'phase')     gc += 'rph';
    else if (task.type === 'milestone') gc += 'rms';
    if (isDone && task.type !== 'phase') gc += ' done';
    gc += hidden;

    html += '<div class="' + gc + '" data-id="' + task.id + '">' + bar + '</div>';
  });

  body.innerHTML = html;

  requestAnimationFrame(function() { requestAnimationFrame(drawArrows); });

  const pane    = document.getElementById('ganttPane');
  const sidebar = document.getElementById('taskList');
  pane.onscroll                  = function() { sidebar.parentElement.scrollTop = pane.scrollTop; };
  sidebar.parentElement.onscroll = function() { pane.scrollTop = sidebar.parentElement.scrollTop; };
}

// ── BUILD MONTH METADATA ──────────────────────────────
function buildMonths(total) {
  const months = [];
  let lastM = -1;
  for (let d = 0; d <= total; d++) {
    const dt = new Date(PROJECT_START);
    dt.setDate(dt.getDate() + d);
    const m = dt.getMonth();
    if (m !== lastM) {
      months.push({ label: dt.toLocaleString('default', { month: 'long', year: 'numeric' }), startDay: d, days: [] });
      lastM = m;
    }
    months[months.length - 1].days.push(d);
  }
  return months;
}

// ── DEPENDENCY ARROWS ─────────────────────────────────
function drawArrows() {
  var old = document.getElementById('arrowLayer');
  if (old) old.remove();

  var body = document.getElementById('ganttBody');
  if (!body) return;

  var rowInfo = {};
  var els = body.querySelectorAll('.grow[data-id]');
  for (var ei = 0; ei < els.length; ei++) {
    var el = els[ei];
    if (el.classList.contains('hidden')) continue;
    var t = el.offsetTop;
    var h = el.offsetHeight || 32;
    rowInfo[el.getAttribute('data-id')] = { topY: t, midY: t + h / 2, botY: t + h };
  }

  var NS  = 'http://www.w3.org/2000/svg';
  var SVG = document.createElementNS(NS, 'svg');
  SVG.id = 'arrowLayer';
  SVG.setAttribute('width',  String(parseInt(body.style.width) || 2000));
  SVG.setAttribute('height', String(body.scrollHeight || 1000));
  SVG.style.position     = 'absolute';
  SVG.style.top          = '0';
  SVG.style.left         = '0';
  SVG.style.pointerEvents= 'none';
  SVG.style.zIndex       = '4';
  SVG.style.overflow     = 'visible';

  var defs = document.createElementNS(NS, 'defs');
  SVG.appendChild(defs);

  var MARG = 8;
  var BOX_PAD = 6;
  var LANE_STEP = 14;
  var LANE_GAP = 11;
  var geomCache = {};

  function barRectFromDom(taskId) {
    var row = body.querySelector('.grow[data-id="' + taskId + '"]');
    if (!row || row.classList.contains('hidden')) return null;
    var gbar = row.querySelector('.gbar');
    if (!gbar) return null;
    var br = gbar.getBoundingClientRect();
    var bb = body.getBoundingClientRect();
    var sl = body.scrollLeft || 0;
    var st = body.scrollTop || 0;
    var left   = br.left - bb.left + sl;
    var right  = br.right - bb.left + sl;
    var top    = br.top - bb.top + st;
    var bottom = br.bottom - bb.top + st;
    return { L: left, R: right, midY: (top + bottom) / 2, topY: top, botY: bottom };
  }

  function geom(task) {
    if (geomCache[task.id]) return geomCache[task.id];
    var g = barRectFromDom(task.id);
    if (!g) {
      var ri = rowInfo[task.id];
      if (!ri) return null;
      var x = dateToX(task.start);
      if (task.type === 'milestone') {
        g = { L: x - 8, R: x + 8, midY: ri.midY, topY: ri.topY, botY: ri.botY };
      } else if (task.type === 'phase') {
        g = { L: x, R: x + Math.max(task.dur * PX_PER_DAY, 1), midY: ri.midY, topY: ri.topY, botY: ri.botY };
      } else if (task.dur > 0) {
        var w = Math.max(task.dur * PX_PER_DAY - 2, 4);
        g = { L: x + 1, R: x + 1 + w, midY: ri.midY, topY: ri.topY, botY: ri.botY };
      } else {
        return null;
      }
    }
    geomCache[task.id] = g;
    return g;
  }

  function padGeomBox(g) {
    return { L: g.L - BOX_PAD, R: g.R + BOX_PAD, topY: g.topY - BOX_PAD, botY: g.botY + BOX_PAD };
  }

  function horizSegHitsBox(y, x0, x1, box) {
    if (y < box.topY || y > box.botY) return false;
    var xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    return xb >= box.L && xa <= box.R;
  }
  function vertSegHitsBox(x, y0, y1, box) {
    if (x < box.L || x > box.R) return false;
    var ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    return yb >= box.topY && ya <= box.botY;
  }
  function segmentHitsBox(p, q, box) {
    if (Math.abs(p.y - q.y) < 0.5) return horizSegHitsBox(p.y, p.x, q.x, box);
    if (Math.abs(p.x - q.x) < 0.5) return vertSegHitsBox(p.x, p.y, q.y, box);
    return true;
  }

  var obstacleIdx = [];
  var maxBarR = 0;
  for (var oi = 0; oi < tasks.length; oi++) {
    var ot = tasks[oi];
    if (!isVisible(ot) || isCollapsedChild(ot)) continue;
    var og = geom(ot);
    if (!og) continue;
    obstacleIdx.push({ id: ot.id, box: padGeomBox(og) });
    if (og.R > maxBarR) maxBarR = og.R;
  }

  function pathHitsObstacles(pts, skipIdSrc) {
    if (!pts || pts.length < 2) return false;
    var n = pts.length - 1;
    for (var pi = 0; pi < n; pi++) {
      var p = pts[pi], q = pts[pi + 1];
      var isFirst = (pi === 0);
      for (var oj = 0; oj < obstacleIdx.length; oj++) {
        var ob = obstacleIdx[oj];
        if (isFirst && ob.id === skipIdSrc) continue;
        if (segmentHitsBox(p, q, ob.box)) return true;
      }
    }
    return false;
  }

  function isSubtaskChain(src, dest) {
    return src.type === 'subtask' && dest.type === 'subtask';
  }

  function orthoZ(sx, sy, ex, ax, ay) {
    var raw = [
      { x: sx, y: sy },
      { x: ex, y: sy },
      { x: ex, y: ay },
      { x: ax, y: ay }
    ];
    var pts = [raw[0]];
    for (var i = 1; i < raw.length; i++) {
      var p = raw[i], q = pts[pts.length - 1];
      if (Math.abs(p.x - q.x) > 0.3 || Math.abs(p.y - q.y) > 0.3) pts.push(p);
    }
    return pts.length >= 2 ? pts : null;
  }

  function manhattan(pts) {
    var s = 0;
    for (var i = 1; i < pts.length; i++)
      s += Math.abs(pts[i].x - pts[i-1].x) + Math.abs(pts[i].y - pts[i-1].y);
    return s;
  }

  function uniqueSortedXs(arr) {
    var u = [], seen = {};
    for (var i = 0; i < arr.length; i++) {
      var v = Math.round(arr[i] * 2) / 2;
      if (seen[v]) continue;
      seen[v] = 1;
      u.push(v);
    }
    u.sort(function(a, b) { return a - b; });
    return u;
  }

  function collectExCandidates(sx, ax) {
    var xs = [];
    var lo = Math.min(sx, ax), hi = Math.max(sx, ax);
    var k;
    for (k = -40; k <= 40; k++) xs.push((sx + ax) * 0.5 + k * 8);
    var exMinR = Math.max(sx, ax) + 6;
    for (k = 0; k < 50; k++) xs.push(exMinR + k * 6);
    var exMaxL = Math.min(sx, ax) - 6;
    for (k = 0; k < 50; k++) xs.push(exMaxL - k * 6);
    for (k = 0; k < 35; k++) {
      xs.push(lo - 25 - k * LANE_STEP);
      xs.push(hi + 25 + k * LANE_STEP);
    }
    xs.push(sx, ax);
    xs.push(maxBarR + 16, maxBarR + 36, maxBarR + 64, maxBarR + 100);
    for (var oj = 0; oj < obstacleIdx.length; oj++) {
      var b = obstacleIdx[oj].box;
      xs.push(b.L - 8, b.L - 16, b.R + 8, b.R + 16);
    }
    return uniqueSortedXs(xs);
  }

  function filterExForMode(xs, sx, ax, mode) {
    if (mode === 'any') return xs;
    var out = [];
    var pad = 4;
    var i;
    if (mode === 'right') {
      var need = Math.max(sx, ax) + pad;
      for (i = 0; i < xs.length; i++) { if (xs[i] > need) out.push(xs[i]); }
      if (!out.length) { for (var vr = 0; vr < 40; vr++) out.push(need + 6 + vr * 8); }
    } else if (mode === 'left') {
      var cap = Math.min(sx, ax) - pad;
      for (i = 0; i < xs.length; i++) { if (xs[i] < cap) out.push(xs[i]); }
      if (!out.length) { for (var vl = 0; vl < 40; vl++) out.push(cap - 6 - vl * 8); }
    }
    return out.length ? out : xs;
  }

  function bestOrthoForAnchor(sx, sy, ax, ay, skipIdSrc, mode, tieBump) {
    tieBump = tieBump || 0;
    var raw = collectExCandidates(sx, ax);
    var xs = filterExForMode(raw, sx, ax, mode);
    var bestPts = null;
    var bestLen = Infinity;
    var bi;
    for (bi = 0; bi < xs.length; bi++) {
      var ex = xs[bi];
      if (mode === 'right') ex += tieBump;
      else if (mode === 'left') ex -= tieBump;
      else ex += tieBump;
      var pts = orthoZ(sx, sy, ex, ax, ay);
      if (!pts || pathHitsObstacles(pts, skipIdSrc)) continue;
      var L = manhattan(pts);
      if (L < bestLen) { bestLen = L; bestPts = pts; }
    }
    return bestPts;
  }

  function routeEdge(sx, sy, dg, chain, skipIdSrc, tieBump) {
    tieBump = tieBump || 0;
    if (chain) {
      return bestOrthoForAnchor(sx, sy, dg.R + MARG, dg.midY, skipIdSrc, 'right', tieBump);
    }
    var frac = 0.35;
    var aLx = dg.L - MARG; var aLy = dg.midY;
    var aTx = dg.L + (dg.R - dg.L) * frac; var aTy = dg.topY - MARG;
    var aBx = dg.L + (dg.R - dg.L) * frac; var aBy = dg.botY + MARG;
    var candidates = [];
    var pL = bestOrthoForAnchor(sx, sy, aLx, aLy, skipIdSrc, 'left', tieBump);
    if (pL) candidates.push(pL);
    var pT = bestOrthoForAnchor(sx, sy, aTx, aTy, skipIdSrc, 'any', tieBump);
    if (pT) candidates.push(pT);
    var pB = bestOrthoForAnchor(sx, sy, aBx, aBy, skipIdSrc, 'any', tieBump);
    if (pB) candidates.push(pB);
    if (!candidates.length) {
      var busR = maxBarR + 24 + Math.abs(tieBump);
      var pBus = orthoZ(sx, sy, busR + (tieBump || 0), aLx, aLy);
      if (pBus && !pathHitsObstacles(pBus, skipIdSrc)) candidates.push(pBus);
    }
    if (!candidates.length) return null;
    candidates.sort(function(a, b) { return manhattan(a) - manhattan(b); });
    return candidates[0];
  }

  function extractVerticals(pts) {
    var out = [];
    if (!pts) return out;
    for (var i = 0; i < pts.length - 1; i++) {
      if (Math.abs(pts[i].x - pts[i+1].x) < 0.5) {
        out.push({ x: pts[i].x, y0: Math.min(pts[i].y, pts[i+1].y), y1: Math.max(pts[i].y, pts[i+1].y) });
      }
    }
    return out;
  }
  function extractHorizontals(pts) {
    var out = [];
    if (!pts) return out;
    for (var i = 0; i < pts.length - 1; i++) {
      if (Math.abs(pts[i].y - pts[i+1].y) < 0.5) {
        out.push({ y: pts[i].y, x0: Math.min(pts[i].x, pts[i+1].x), x1: Math.max(pts[i].x, pts[i+1].x) });
      }
    }
    return out;
  }
  function vSegConflictsPlaced(a, placed) {
    for (var i = 0; i < placed.length; i++) {
      var b = placed[i];
      if (Math.abs(a.x - b.x) >= LANE_GAP) continue;
      if (a.y1 <= b.y0 + 2 || b.y1 <= a.y0 + 2) continue;
      return true;
    }
    return false;
  }
  function hSegConflictsPlaced(a, placed) {
    for (var i = 0; i < placed.length; i++) {
      var b = placed[i];
      if (Math.abs(a.y - b.y) >= LANE_GAP) continue;
      if (a.x1 <= b.x0 + 2 || b.x1 <= a.x0 + 2) continue;
      return true;
    }
    return false;
  }
  function pathConflictsPlaced(pts, vPlaced, hPlaced) {
    var vi = extractVerticals(pts);
    var hi = extractHorizontals(pts);
    for (var a = 0; a < vi.length; a++) { if (vSegConflictsPlaced(vi[a], vPlaced)) return true; }
    for (var b = 0; b < hi.length; b++) { if (hSegConflictsPlaced(hi[b], hPlaced)) return true; }
    return false;
  }
  function registerPlaced(pts, vPlaced, hPlaced) {
    var vi = extractVerticals(pts);
    var hi = extractHorizontals(pts);
    for (var ri = 0; ri < vi.length; ri++) vPlaced.push(vi[ri]);
    for (var rj = 0; rj < hi.length; rj++) hPlaced.push(hi[rj]);
  }

  var arrows = [];
  var edgeList = [];

  for (var ti = 0; ti < tasks.length; ti++) {
    var task = tasks[ti];
    if (!task.dep || !task.dep.trim() || task.dep === '\u2014') continue;
    if (!isVisible(task) || isCollapsedChild(task)) continue;
    var dg = geom(task);
    if (!dg) continue;
    var depList = task.dep.split(',');
    for (var di = 0; di < depList.length; di++) {
      var depId = depList[di].trim();
      if (!depId) continue;
      var srcIdx = -1;
      for (var si2 = 0; si2 < tasks.length; si2++) { if (tasks[si2].id === depId) { srcIdx = si2; break; } }
      if (srcIdx === -1) continue;
      var src = tasks[srcIdx];
      if (!isVisible(src) || isCollapsedChild(src)) continue;
      var sg = geom(src);
      if (!sg) continue;
      var color    = PHASE_COLORS[task.phase] || '#8b949e';
      var sx = sg.R; var sy = sg.midY;
      var chain = isSubtaskChain(src, task);
      edgeList.push({ sx: sx, sy: sy, sg: sg, dg: dg, chain: chain, src: src, task: task, color: color });
    }
  }

  var placedV = []; var placedH = [];
  for (var ei = 0; ei < edgeList.length; ei++) {
    var ed = edgeList[ei];
    var pts0 = null;
    var lane;
    for (lane = 0; lane < 55; lane++) {
      var tryPts = routeEdge(ed.sx, ed.sy, ed.dg, ed.chain, ed.src.id, lane * LANE_STEP);
      if (!tryPts || pathHitsObstacles(tryPts, ed.src.id)) continue;
      if (!pathConflictsPlaced(tryPts, placedV, placedH)) { pts0 = tryPts; break; }
    }
    if (!pts0) continue;
    registerPlaced(pts0, placedV, placedH);
    arrows.push({ pts: pts0, color: ed.color });
  }

  var cross = [];
  for (var ai = 0; ai < arrows.length; ai++) cross.push({});

  for (var i = 0; i < arrows.length; i++) {
    var A = arrows[i].pts;
    for (var j = i + 1; j < arrows.length; j++) {
      var B = arrows[j].pts;
      for (var asi = 0; asi < A.length - 1; asi++) {
        for (var bsi = 0; bsi < B.length - 1; bsi++) {
          var aIsH = Math.abs(A[asi+1].y - A[asi].y) < 0.5;
          var bIsH = Math.abs(B[bsi+1].y - B[bsi].y) < 0.5;
          if (aIsH === bIsH) continue;
          var hP, hQ, vP, vQ, crossOnJ;
          if (aIsH) { hP = A[asi]; hQ = A[asi+1]; vP = B[bsi]; vQ = B[bsi+1]; crossOnJ = true; }
          else       { hP = B[bsi]; hQ = B[bsi+1]; vP = A[asi]; vQ = A[asi+1]; crossOnJ = false; }
          var hMinX = Math.min(hP.x, hQ.x), hMaxX = Math.max(hP.x, hQ.x);
          var vMinY = Math.min(vP.y, vQ.y), vMaxY = Math.max(vP.y, vQ.y);
          var vx = vP.x, hy = hP.y;
          if (vx > hMinX + 1 && vx < hMaxX - 1 && hy > vMinY + 1 && hy < vMaxY - 1) {
            var segJ  = crossOnJ ? bsi : asi;
            var tVal  = crossOnJ ? (hy - vP.y) / (vQ.y - vP.y) : (vx - hP.x) / (hQ.x - hP.x);
            if (tVal > 0.05 && tVal < 0.95) {
              if (!cross[j][segJ]) cross[j][segJ] = [];
              cross[j][segJ].push(tVal);
            }
          }
        }
      }
    }
  }

  var FILLET = 0;
  var ARC    = 5;
  var ARROW_TIP_INSET = 7;
  var ARROW_HALF_W    = 3.8;

  function shortenStrokePts(pts, arrlen) {
    if (!pts || pts.length < 2) return pts;
    var out = [];
    var i;
    for (i = 0; i < pts.length - 1; i++) out.push({ x: pts[i].x, y: pts[i].y });
    var prev = pts[pts.length - 2], tip = pts[pts.length - 1];
    var dx = tip.x - prev.x, dy = tip.y - prev.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.5) return pts;
    var shrink = Math.min(arrlen, Math.max(0, len - 0.01));
    var ux = dx / len, uy = dy / len;
    out.push({ x: tip.x - ux * shrink, y: tip.y - uy * shrink });
    return out;
  }

  function arrowHeadPolygonPoints(tipX, tipY, prevX, prevY) {
    var dx = tipX - prevX, dy = tipY - prevY;
    var SNAP_EPS = 0.75;
    if (Math.abs(dx) < SNAP_EPS && Math.abs(dy) >= SNAP_EPS) {
      var ux = 0; var uy = dy >= 0 ? 1 : -1;
      var bx = tipX - ux * ARROW_TIP_INSET, by = tipY - uy * ARROW_TIP_INSET;
      var px = -uy * ARROW_HALF_W, py = ux * ARROW_HALF_W;
      return tipX + ',' + tipY + ' ' + (bx + px) + ',' + (by + py) + ' ' + (bx - px) + ',' + (by - py);
    }
    if (Math.abs(dy) < SNAP_EPS && Math.abs(dx) >= SNAP_EPS) {
      var ux = dx >= 0 ? 1 : -1; var uy = 0;
      var bx = tipX - ux * ARROW_TIP_INSET, by = tipY - uy * ARROW_TIP_INSET;
      var px = -uy * ARROW_HALF_W, py = ux * ARROW_HALF_W;
      return tipX + ',' + tipY + ' ' + (bx + px) + ',' + (by + py) + ' ' + (bx - px) + ',' + (by - py);
    }
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len;
    var bx = tipX - ux * ARROW_TIP_INSET, by = tipY - uy * ARROW_TIP_INSET;
    var px = -uy * ARROW_HALF_W, py = ux * ARROW_HALF_W;
    return tipX + ',' + tipY + ' ' + (bx + px) + ',' + (by + py) + ' ' + (bx - px) + ',' + (by - py);
  }

  function toD(pts, segCross) {
    if (!pts || pts.length < 2) return '';
    var d = 'M ' + f(pts[0].x) + ' ' + f(pts[0].y);
    for (var i = 1; i < pts.length; i++) {
      var prev   = pts[i-1], curr = pts[i];
      var isLast = (i === pts.length - 1);
      var isH    = Math.abs(curr.y - prev.y) < 0.5;
      var tList  = (segCross[i-1] || []).slice().sort(function(a,b){return a-b;});
      if (tList.length > 0) {
        for (var ti2 = 0; ti2 < tList.length; ti2++) {
          var t  = tList[ti2];
          var cx = prev.x + (curr.x - prev.x) * t;
          var cy = prev.y + (curr.y - prev.y) * t;
          if (isH) {
            d += ' L ' + f(cx - ARC) + ' ' + f(cy) +
                 ' A ' + ARC + ' ' + ARC + ' 0 0 1 ' + f(cx + ARC) + ' ' + f(cy);
          } else {
            d += ' L ' + f(cx) + ' ' + f(cy - ARC) +
                 ' A ' + ARC + ' ' + ARC + ' 0 0 0 ' + f(cx) + ' ' + f(cy + ARC);
          }
        }
        d += ' L ' + f(curr.x) + ' ' + f(curr.y);
      } else if (!isLast && FILLET >= 0.5) {
        var next = pts[i + 1];
        var inDx = curr.x - prev.x, inDy = curr.y - prev.y;
        var outDx = next.x - curr.x, outDy = next.y - curr.y;
        var inL = Math.sqrt(inDx*inDx + inDy*inDy);
        var outL = Math.sqrt(outDx*outDx + outDy*outDy);
        if (inL < 0.5 || outL < 0.5) { d += ' L ' + f(curr.x) + ' ' + f(curr.y); continue; }
        var r   = Math.min(FILLET, inL * 0.45, outL * 0.45);
        var p1x = curr.x - (inDx / inL) * r, p1y = curr.y - (inDy / inL) * r;
        var p2x = curr.x + (outDx / outL) * r, p2y = curr.y + (outDy / outL) * r;
        d += ' L ' + f(p1x) + ' ' + f(p1y) +
             ' Q ' + f(curr.x) + ' ' + f(curr.y) + ' ' + f(p2x) + ' ' + f(p2y);
      } else {
        d += ' L ' + f(curr.x) + ' ' + f(curr.y);
      }
    }
    return d;
  }

  for (var ai2 = 0; ai2 < arrows.length; ai2++) {
    var arr = arrows[ai2];
    var ptsDraw = shortenStrokePts(arr.pts, ARROW_TIP_INSET);

    if (arr.pts && arr.pts.length >= 2 && ptsDraw && ptsDraw.length >= 1) {
      var tip = arr.pts[arr.pts.length - 1];
      var prv = arr.pts[arr.pts.length - 2];
      var prv2 = arr.pts.length >= 3 ? arr.pts[arr.pts.length - 3] : null;
      var dx = tip.x - prv.x, dy = tip.y - prv.y;
      var SNAP_EPS = 0.75;
      var isVert = Math.abs(dx) < SNAP_EPS;
      var isHorz = Math.abs(dy) < SNAP_EPS;
      var ux = 0, uy = 0;
      if (isVert && !isHorz) { uy = dy >= 0 ? 1 : -1; }
      else if (isHorz && !isVert) { ux = dx >= 0 ? 1 : -1; }
      else { var len = Math.sqrt(dx * dx + dy * dy) || 1; ux = dx / len; uy = dy / len; }
      var bx = tip.x - ux * ARROW_TIP_INSET;
      var by = tip.y - uy * ARROW_TIP_INSET;
      var px = -uy * ARROW_HALF_W, py = ux * ARROW_HALF_W;
      var c1 = { x: bx + px, y: by + py };
      var c2 = { x: bx - px, y: by - py };
      var c = c1;
      if (prv2) {
        var d1 = Math.abs(c1.x - prv2.x) + Math.abs(c1.y - prv2.y);
        var d2 = Math.abs(c2.x - prv2.x) + Math.abs(c2.y - prv2.y);
        c = d1 <= d2 ? c1 : c2;
      }
      ptsDraw.splice(ptsDraw.length - 1, 1, { x: bx, y: by }, c);
    }

    var d = toD(ptsDraw, cross[ai2]);
    if (!d) continue;
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', arr.color);
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-linejoin', 'miter');
    path.setAttribute('stroke-linecap', 'butt');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-dasharray', '5 3');
    path.setAttribute('opacity', '0.55');
    SVG.appendChild(path);

    var tip = arr.pts[arr.pts.length - 1];
    var prv = arr.pts[arr.pts.length - 2];
    var poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('points', arrowHeadPolygonPoints(tip.x, tip.y, prv.x, prv.y));
    poly.setAttribute('fill', arr.color);
    poly.setAttribute('opacity', '1');
    poly.setAttribute('stroke', 'none');
    SVG.appendChild(poly);
  }

  body.appendChild(SVG);
}

// ── STATS ─────────────────────────────────────────────
function renderStats() {
  var nonPhase   = tasks.filter(function(t) { return t.type !== 'phase'; });
  var totalT     = nonPhase.length;
  var milestones = tasks.filter(function(t) { return t.type === 'milestone'; }).length;
  var done       = nonPhase.filter(function(t) { return t.progress >= 100; }).length;
  var totalDur   = tasks.filter(function(t) { return t.type === 'subtask'; }).reduce(function(s,t) { return s + (t.dur||0); }, 0);
  var pct        = totalT > 0 ? Math.round(done / totalT * 100) : 0;
  document.getElementById('statusBar').innerHTML =
    '<div class="stat"><i class="fa-solid fa-list-check"></i> <strong>' + totalT + '</strong> tasks</div>' +
    '<div class="stat"><i class="fa-solid fa-diamond" style="color:#f43f5e"></i> <strong>' + milestones + '</strong> milestones</div>' +
    '<div class="stat"><i class="fa-solid fa-clock"></i> <strong>' + totalDur.toFixed(1) + '</strong> working days</div>' +
    '<div class="stat"><i class="fa-solid fa-circle-check" style="color:#22c55e"></i> <strong>' + done + '</strong> / ' + totalT + ' complete (<strong>' + pct + '%</strong>)</div>' +
    '<div class="stat"><i class="fa-solid fa-calendar-range"></i> Apr 1 \u2013 Jun 5, 2026</div>' +
    '<div class="stat-sep"></div>' +
    '<div class="stat-author"><i class="fa-solid fa-user-gear"></i> Elliott Starosta \u00b7 TEJ4M</div>';
}

// ── COLLAPSE ──────────────────────────────────────────
function toggleCollapse(id) { collapsed[id] = !collapsed[id]; persist(); render(); }

// ── QUICK PROGRESS ────────────────────────────────────
function quickProgress(id) {
  var task = tasks.find(function(t) { return t.id === id; });
  if (!task) return;
  var steps = [0, 25, 50, 75, 100];
  var cur   = task.progress || 0;
  var idx   = steps.indexOf(cur);
  task.progress = steps[(idx + 1) % steps.length];
  persistAndSave(); render();
}

// ── TOGGLE DONE ───────────────────────────────────────
function toggleDone(id) {
  var task = tasks.find(function(t) { return t.id === id; });
  if (!task) return;
  task.progress = task.progress >= 100 ? 0 : 100;
  persistAndSave(); render();
}

// ── TOOLTIP ───────────────────────────────────────────
function showTT(e, id) {
  var task = tasks.find(function(t) { return t.id === id; });
  if (!task) return;
  var color = getColor(task);
  document.getElementById('tooltip').innerHTML =
    '<div class="tt-title" style="color:' + color + '">' + task.id + ' \u00b7 ' + task.type.toUpperCase() + '</div>' +
    '<div>' + task.name + '</div>' +
    '<div class="tt-row"><i class="fa-solid fa-calendar-day"></i> Start: ' + task.start + '</div>' +
    '<div class="tt-row"><i class="fa-solid fa-hourglass-half"></i> Duration: ' + (task.dur > 0 ? task.dur + ' days' : '\u2014') + '</div>' +
    (task.dep ? '<div class="tt-row"><i class="fa-solid fa-arrow-right-from-bracket"></i> Deps: ' + task.dep + '</div>' : '') +
    '<div class="tt-row"><i class="fa-solid fa-chart-simple"></i> Progress: ' + (task.progress || 0) + '%</div>' +
    (task.notes ? '<div class="tt-notes"><i class="fa-solid fa-note-sticky"></i> ' + task.notes + '</div>' : '');
  var tt = document.getElementById('tooltip');
  tt.style.display = 'block';
  moveTT(e);
}
function hideTT() { document.getElementById('tooltip').style.display = 'none'; }
function moveTT(e) {
  var tt = document.getElementById('tooltip');
  if (tt.style.display !== 'block') return;
  tt.style.left = Math.min(e.clientX + 14, window.innerWidth  - 320) + 'px';
  tt.style.top  = Math.min(e.clientY - 10, window.innerHeight - 200) + 'px';
}
document.addEventListener('mousemove', moveTT);

// ── ZOOM / FILTER ─────────────────────────────────────
function setZoom(v)       { PX_PER_DAY = parseInt(v); renderGantt(); }
function filterByPhase(v) { filterPhase = v; render(); }
function filterSearch(v)  { searchQ = v; render(); }

// ── MODAL ─────────────────────────────────────────────
function openAdd() {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'Add Task';
  document.getElementById('deleteBtn').style.display = 'none';
  ['fId','fName','fDep','fNotes'].forEach(function(id) { document.getElementById(id).value = ''; });
  document.getElementById('fStart').value  = '2026-04-01';
  document.getElementById('fDur').value    = '1';
  document.getElementById('fType').value   = 'subtask';
  document.getElementById('fPhase').value  = '1';
  document.getElementById('fProg').value   = '0';
  syncProgSliderVisual();
  document.getElementById('modalOverlay').classList.add('open');
}
function openEdit(id) {
  var task = tasks.find(function(t) { return t.id === id; });
  if (!task) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = 'Edit \u00b7 ' + id;
  document.getElementById('deleteBtn').style.display = 'inline-flex';
  document.getElementById('fId').value    = task.id;
  document.getElementById('fName').value  = task.name;
  document.getElementById('fStart').value = task.start;
  document.getElementById('fDur').value   = task.dur;
  document.getElementById('fDep').value   = task.dep || '';
  document.getElementById('fType').value  = task.type;
  document.getElementById('fPhase').value = task.phase;
  var p = task.progress || 0;
  p = Math.min(100, Math.max(0, Math.round(p / 10) * 10));
  document.getElementById('fProg').value  = p;
  syncProgSliderVisual();
  document.getElementById('fNotes').value = task.notes || '';
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  editingId = null;
}
function saveTask() {
  var id    = document.getElementById('fId').value.trim();
  var name  = document.getElementById('fName').value.trim();
  var start = document.getElementById('fStart').value;
  var dur   = parseFloat(document.getElementById('fDur').value) || 0;
  var dep   = document.getElementById('fDep').value.trim();
  var type  = document.getElementById('fType').value;
  var phase = parseInt(document.getElementById('fPhase').value);
  var prog  = parseInt(document.getElementById('fProg').value) || 0;
  var notes = document.getElementById('fNotes').value.trim();
  if (!id || !name) { alert('Task ID and Name are required.'); return; }
  if (editingId) {
    var idx = tasks.findIndex(function(t) { return t.id === editingId; });
    if (idx !== -1) tasks[idx] = { id:id, name:name, start:start, dur:dur, dep:dep, type:type, phase:phase, progress:prog, notes:notes };
  } else {
    if (tasks.find(function(t) { return t.id === id; })) { alert('Task ID already exists.'); return; }
    tasks.push({ id:id, name:name, start:start, dur:dur, dep:dep, type:type, phase:phase, progress:prog, notes:notes });
  }
  persistAndSave(); closeModal(); render();
}
function deleteTask() {
  if (!editingId) return;
  if (!confirm('Delete task ' + editingId + '?')) return;
  tasks = tasks.filter(function(t) { return t.id !== editingId; });
  persistAndSave(); closeModal(); render();
}

// ── EXPORT CSV ────────────────────────────────────────
function exportCSV() {
  var rows = [['ID','Name','Type','Phase','Start','Duration','Dependencies','Progress','Notes']];
  tasks.forEach(function(t) {
    rows.push([t.id, '"' + t.name.replace(/"/g,'""') + '"', t.type, t.phase, t.start, t.dur, t.dep, t.progress||0, '"' + (t.notes||'').replace(/"/g,'""') + '"']);
  });
  var a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.map(function(r){return r.join(',');}).join('\n'));
  a.download = 'bland2grand_schedule.csv';
  a.click();
}

// ── EXPORT PNG ────────────────────────────────────────
async function exportImage() {
  const btn = document.getElementById('exportImgBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rendering…'; }

  // Load html2canvas on-demand
  if (!window.html2canvas) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load html2canvas'));
      document.head.appendChild(s);
    }).catch(err => {
      showSaveIndicator('Export failed — network error', true);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-image"></i> Export PNG'; }
      throw err;
    });
  }

  const sidebarEl     = document.getElementById('sidebar');
  const sidebarHead   = document.querySelector('.sidebar-head');
  const taskListEl    = document.getElementById('taskList');
  const ganttHeaderEl = document.getElementById('ganttHeader');
  const ganttBodyEl   = document.getElementById('ganttBody');

  const sidebarW  = sidebarEl.offsetWidth;
  const ganttW    = parseInt(ganttBodyEl.style.width) || ganttBodyEl.scrollWidth;
  const HEADER_H  = 64;
  const ROW_H     = 32;

  // Count all visible rows (both .row and phase rows that are 28px — use offsetHeight sum)
  const allRows = taskListEl.querySelectorAll('.row:not(.hidden)');
  let contentH = HEADER_H;
  allRows.forEach(function(r) { contentH += r.offsetHeight || ROW_H; });
  contentH += 4; // small bottom pad

  const totalW = sidebarW + ganttW;
  const totalH = contentH;

  // ── Off-screen wrapper ────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'position:fixed',
    'top:-99999px',
    'left:-99999px',
    `width:${totalW}px`,
    `height:${totalH}px`,
    'display:flex',
    'overflow:hidden',
    'background:#0d1117',
  ].join(';');

  // Sidebar clone
  const sCol = document.createElement('div');
  sCol.style.cssText = `width:${sidebarW}px;flex-shrink:0;border-right:1px solid #30363d;background:#161b22;overflow:hidden;height:${totalH}px;`;

  const hClone = sidebarHead.cloneNode(true);
  hClone.style.position = 'relative';
  const lClone = taskListEl.cloneNode(true);
  lClone.style.overflow = 'visible';
  // Show action buttons in the export so it looks clean
  lClone.querySelectorAll('.row-acts').forEach(el => el.style.opacity = '0');

  sCol.appendChild(hClone);
  sCol.appendChild(lClone);

  // Gantt clone
  const gCol = document.createElement('div');
  gCol.style.cssText = `flex:1;position:relative;background:#0d1117;overflow:hidden;height:${totalH}px;`;

  const ghClone = ganttHeaderEl.cloneNode(true);
  ghClone.style.cssText = `position:relative;top:0;width:${ganttW}px;height:${HEADER_H}px;display:flex;background:#0d1117;border-bottom:1px solid #30363d;z-index:1;`;

  const gbClone = ganttBodyEl.cloneNode(true);
  gbClone.style.cssText = `position:relative;width:${ganttW}px;`;

  // Fix the SVG arrow layer inside the clone
  const svgClone = gbClone.querySelector('#arrowLayer');
  if (svgClone) {
    svgClone.setAttribute('width', String(ganttW));
    svgClone.setAttribute('height', String(totalH - HEADER_H + 50));
    svgClone.id = '_arrowLayerExport';
  }

  gCol.appendChild(ghClone);
  gCol.appendChild(gbClone);

  wrapper.appendChild(sCol);
  wrapper.appendChild(gCol);
  document.body.appendChild(wrapper);

  try {
    const canvas = await html2canvas(wrapper, {
      width:           totalW,
      height:          totalH,
      scale:           2,
      useCORS:         true,
      allowTaint:      true,
      backgroundColor: '#0d1117',
      logging:         false,
      imageTimeout:    0,
    });

    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `bland2grand_gantt_${dateStr}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
    showSaveIndicator('Exported PNG ✓', false);
  } catch (err) {
    console.error('[exportImage]', err);
    showSaveIndicator('Export failed ✗', true);
  } finally {
    document.body.removeChild(wrapper);
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-image"></i> Export PNG'; }
  }
}

// ── RESET ─────────────────────────────────────────────
function resetData() {
  if (!confirm('Reset ALL data to original tasks.json? All progress will be lost.')) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(COLLAPSE_KEY);
  location.reload();
}

// ── EVENTS ────────────────────────────────────────────
document.getElementById('modalOverlay').addEventListener('click', function(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });
function syncProgSliderVisual() {
  var el = document.getElementById('fProg');
  if (!el) return;
  var v = String(el.value);
  el.style.setProperty('--val', v + '%');
  var wrap = document.getElementById('progSliderWrap');
  if (wrap) wrap.style.setProperty('--val', v + '%');
  document.getElementById('fProgVal').textContent = v + '%';
  el.setAttribute('aria-valuetext', v + ' percent');
}
document.getElementById('fProg').addEventListener('input', syncProgSliderVisual);

// ── START ─────────────────────────────────────────────
init();