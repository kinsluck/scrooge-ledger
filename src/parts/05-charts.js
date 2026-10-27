/* ============================================================
   史高治账本 · 图表引擎（零依赖 SVG）
   ============================================================ */
(function () {
'use strict';

var L = window.__L;
var $ = L.$, esc = L.esc, clamp = L.clamp, pad2 = L.pad2;

var NS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs) {
  var n = document.createElementNS(NS, tag);
  if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  return n;
}
function txt(node, s) { node.textContent = s; return node; }

/* ---------------- 标签宽度 / 抽稀 ---------------- */
var LABEL_CHW = 0.56, LABEL_GAP = 0.55;
function labelTextWidth(text, fs) {
  var s = String(text), w = 0;
  for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 0x2e80 ? 1.0 : LABEL_CHW;
  return w * (fs || 10.5);
}
function tickStep(n, slotW, labW) {
  if (n <= 1 || slotW <= 0) return 1;
  var byGap = Math.ceil((labW + 10) / slotW);
  var byRatio = Math.ceil(labW * (1 + LABEL_GAP) / slotW);
  return Math.max(1, byGap, byRatio);
}
function tickOn(idx, n, step) { return (n - 1 - idx) % step === 0; }

/* ---------------- 刻度 ---------------- */
function niceTicks(lo, hi, count) {
  if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
  if (lo === hi) { if (lo === 0) hi = 1; else { lo -= Math.abs(lo) * .5; hi += Math.abs(hi) * .5; } }
  var span = hi - lo, raw = span / Math.max(1, count || 4);
  var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
  var norm = raw / mag;
  var step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  var lo2 = Math.floor(lo / step + 1e-9) * step;
  var hi2 = Math.ceil(hi / step - 1e-9) * step;
  var ticks = [], guard = 0;
  for (var v = lo2; v <= hi2 + step * 1e-6 && guard++ < 60; v += step) ticks.push(Math.round(v / step) * step);
  return { lo: lo2, hi: hi2, step: step, ticks: ticks };
}

/* ---------------- 气泡 ---------------- */
var _tips = [];
function tipOf(wrap) {
  var t = wrap.querySelector('.tip');
  if (!t) { t = document.createElement('div'); t.className = 'tip'; wrap.appendChild(t); }
  if (_tips.indexOf(t) < 0) _tips.push(t);
  return t;
}
function hideTips(keep) {
  for (var i = 0; i < _tips.length; i++) {
    var t = _tips[i];
    if (t === keep) continue;
    t.classList.remove('on');
    if (typeof t.__reset === 'function') { t.__reset(); t.__reset = null; }
  }
}
function showTip(tip, html) { tip.innerHTML = html; tip.classList.add('on'); }
function placeTip(tip, x, y, W, H, touch) {
  var tw = tip.offsetWidth || 120, th = tip.offsetHeight || 40, left, top;
  if (touch) {
    left = x - tw / 2;
    if (left + tw > W - 6) left = W - tw - 6;
    if (left < 6) left = 6;
    top = y > H * 0.45 ? y - th - 26 : y + 26;
    if (top < 0) top = y + 26;
  } else {
    left = x + 14; top = y - th - 10;
    if (left + tw > W - 6) left = x - tw - 14;
    if (left < 6) left = 6;
    if (top < 0) top = y + 14;
  }
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}
function isTouch(ev) { return !!(ev && ev.pointerType && ev.pointerType !== 'mouse'); }

/* 统一指针层：鼠标移动 / 触摸按下拖动，抬手保留 */
function bindProbe(el, onAt, onLeave) {
  var drag = false;
  function at(ev) {
    var r = el.getBoundingClientRect();
    onAt(ev.clientX - r.left, ev.clientY - r.top, ev);
  }
  el.addEventListener('pointerdown', function (ev) {
    drag = true;
    if (isTouch(ev) && el.setPointerCapture) { try { el.setPointerCapture(ev.pointerId); } catch (e) { } }
    at(ev);
  });
  el.addEventListener('pointermove', function (ev) {
    if (ev.pointerType === 'mouse' || drag) at(ev);
  });
  el.addEventListener('pointerleave', function (ev) {
    if (!isTouch(ev)) { drag = false; onLeave(); }
  });
  el.addEventListener('pointerup', function () { drag = false; });
  el.addEventListener('pointercancel', function () { drag = false; onLeave(); });
}
document.addEventListener('pointerdown', function (ev) {
  var t = ev.target;
  if (!(t && t.closest && t.closest('.chart-wrap, .tip'))) hideTips(null);
}, true);

/* ---------------- 空态 / 清理 ---------------- */
function clearWrap(wrap) {
  var tip = wrap.querySelector('.tip');
  wrap.innerHTML = '';
  if (tip) wrap.appendChild(tip);
}
function emptyState(wrap, title, sub) {
  clearWrap(wrap);
  var d = document.createElement('div');
  d.className = 'chart-empty';
  d.innerHTML = '<b>' + esc(title) + '</b><span>' + esc(sub || '') + '</span>';
  wrap.appendChild(d);
}

/* ============================================================
   1) 日柱状图（灰色轨道 + 彩色值柱 + 均值虚线）
   ============================================================ */
function barDaily(wrap, data, opt) {
  opt = opt || {};
  clearWrap(wrap);
  if (!data.length) { emptyState(wrap, '暂无数据', '换个时间范围试试'); return; }

  var W = Math.max(240, Math.round(wrap.clientWidth || 340));
  var narrow = W < 380;
  var H = opt.height || (narrow ? 168 : 186);
  var M = { l: narrow ? 30 : 36, r: 8, t: 14, b: 20 };
  var iw = Math.max(40, W - M.l - M.r), ih = Math.max(60, H - M.t - M.b);

  var vals = data.map(function (d) { return d.v; });
  var maxV = Math.max(0.0001, Math.max.apply(null, vals));
  var minV = Math.min(0, Math.min.apply(null, vals));
  var sc = niceTicks(minV, maxV * 1.06, narrow ? 3 : 4);

  var yOf = function (v) { return M.t + ih - (v - sc.lo) / (sc.hi - sc.lo) * ih; };
  var zeroY = yOf(0);
  var slotW = iw / data.length;
  var bw = clamp(slotW * 0.44, 2, 6);

  var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': opt.title || '柱状图' });

  /* 网格 */
  sc.ticks.forEach(function (v) {
    var y = yOf(v);
    if (y < M.t - 1 || y > M.t + ih + 1) return;
    svg.appendChild(sv('line', { x1: M.l, x2: M.l + iw, y1: y, y2: y, stroke: 'currentColor', 'stroke-opacity': v === 0 ? .11 : .05, 'stroke-width': 1 }));
    var t = sv('text', { x: M.l - 5, y: y + 3.4, 'text-anchor': 'end', 'font-size': 9.5, fill: 'currentColor', 'fill-opacity': .42 });
    t.textContent = opt.fmtY ? opt.fmtY(v) : L.axisYuan(v);
    svg.appendChild(t);
  });

  var trackC = opt.trackColor || 'currentColor';

  /* 轨道 + 值柱 */
  data.forEach(function (d, i) {
    var cx = M.l + slotW * i + slotW / 2;
    var top = M.t, bot = zeroY;
    svg.appendChild(sv('rect', {
      x: cx - bw / 2, y: Math.min(top, bot), width: bw,
      height: Math.max(1, Math.abs(bot - top)), rx: bw / 2, fill: trackC, 'fill-opacity': .06
    }));
    if (Math.abs(d.v) < 1e-9) return;
    var vy = yOf(d.v);
    var y1 = Math.min(vy, zeroY), y2 = Math.max(vy, zeroY);
    var h = Math.max(2, y2 - y1);
    var pos = d.v >= 0;
    var fill = opt.colorOf ? opt.colorOf(d) : (pos ? 'url(#gBarUp)' : 'url(#gBarDn)');
    svg.appendChild(sv('rect', {
      x: cx - bw / 2, y: y1, width: bw, height: h,
      rx: Math.min(bw / 2, h / 2), fill: fill, 'data-i': i
    }));
  });

  /* 渐变 */
  var defs = sv('defs');
  var g1 = sv('linearGradient', { id: 'gBarUp', x1: 0, y1: 0, x2: 0, y2: 1 });
  g1.appendChild(sv('stop', { offset: '0', 'stop-color': '#f5a05a' }));
  g1.appendChild(sv('stop', { offset: '1', 'stop-color': '#f0716a' }));
  var g2 = sv('linearGradient', { id: 'gBarDn', x1: 0, y1: 0, x2: 0, y2: 1 });
  g2.appendChild(sv('stop', { offset: '0', 'stop-color': '#4ecb8f' }));
  g2.appendChild(sv('stop', { offset: '1', 'stop-color': '#38a877' }));
  defs.appendChild(g1); defs.appendChild(g2);
  svg.insertBefore(defs, svg.firstChild);

  /* 均值线 */
  var avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  if (avg > 0 && data.length > 2) {
    var ay = yOf(avg);
    svg.appendChild(sv('line', {
      x1: M.l, x2: M.l + iw, y1: ay, y2: ay,
      stroke: 'currentColor', 'stroke-opacity': .3, 'stroke-width': 1, 'stroke-dasharray': '4 4'
    }));
  }

  /* x 标签 */
  var fs = narrow ? 9 : 9.5;
  var lw = labelTextWidth(data[0].label || '10-01', fs);
  var stp = tickStep(data.length, slotW, lw);
  data.forEach(function (d, i) {
    if (!tickOn(i, data.length, stp)) return;
    var cx = M.l + slotW * i + slotW / 2;
    /* 首尾标签改用 start / end 锚点贴边，不要 clamp —— clamp 会把最后一个挤到前一个身上 */
    var anchor = 'middle', tx = cx;
    if (cx < 14) { anchor = 'start'; tx = 1; }
    else if (cx > W - 14) { anchor = 'end'; tx = W - 1; }
    var t = sv('text', { x: tx, y: H - 5, 'text-anchor': anchor, 'font-size': fs, fill: 'currentColor', 'fill-opacity': .4 });
    t.textContent = d.label;
    svg.appendChild(t);
  });

  /* 命中层 */
  var hair = sv('line', { x1: 0, x2: 0, y1: M.t, y2: M.t + ih, stroke: 'currentColor', 'stroke-opacity': .22, 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0 });
  svg.appendChild(hair);
  var hit = sv('rect', { x: M.l, y: M.t, width: iw, height: ih, fill: 'transparent', class: 'probe' });
  svg.appendChild(hit);
  wrap.appendChild(svg);

  var tip = tipOf(wrap);
  var lastI = -1;
  bindProbe(hit, function (x, y, ev) {
    var i = clamp(Math.floor(x / slotW), 0, data.length - 1);
    var d = data[i];
    var cx = M.l + slotW * i + slotW / 2;
    hair.setAttribute('x1', cx); hair.setAttribute('x2', cx); hair.setAttribute('opacity', 1);
    lastI = i;
    showTip(tip, (opt.tipHTML ? opt.tipHTML(d, i) : '<h4>' + esc(d.label) + '</h4>' + esc(L.yuan(d.v))));
    placeTip(tip, cx, clamp(yOf(d.v), M.t, M.t + ih), W, H, isTouch(ev));
    hideTips(tip);
    if (opt.onPick) opt.onPick(d, i);
  }, function () {
    hair.setAttribute('opacity', 0);
    tip.classList.remove('on');
    lastI = -1;
    if (opt.onPick) opt.onPick(null, -1);
  });
  tip.__reset = function () { hair.setAttribute('opacity', 0); };
  if (opt.onPick && data.length) {
    var mi = 0;
    data.forEach(function (d, i) { if (Math.abs(d.v) > Math.abs(data[mi].v)) mi = i; });
    opt.onPick(data[mi], mi);
  }
}

/* ============================================================
   2) 面积折线（净值趋势）
   ============================================================ */
function areaLine(wrap, series, opt) {
  opt = opt || {};
  clearWrap(wrap);
  var dates = series.dates, vals = series.values;
  if (!dates.length) { emptyState(wrap, '暂无数据', ''); return; }

  var W = Math.max(240, Math.round(wrap.clientWidth || 340));
  var narrow = W < 380;
  var H = opt.height || (narrow ? 180 : 200);
  var M = { l: narrow ? 40 : 46, r: 12, t: 18, b: 20 };
  var iw = Math.max(40, W - M.l - M.r), ih = Math.max(60, H - M.t - M.b);

  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  var pad = (hi - lo) * 0.16 || Math.abs(hi || 1) * 0.1;
  var sc = niceTicks(lo - pad, hi + pad, narrow ? 3 : 4);
  var yOf = function (v) { return M.t + ih - (v - sc.lo) / (sc.hi - sc.lo) * ih; };
  var t0 = L.parseISO(dates[0]).getTime(), t1 = L.parseISO(dates[dates.length - 1]).getTime();
  var xOf = function (i) { return M.l + (dates.length === 1 ? iw / 2 : i / (dates.length - 1) * iw); };

  var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': opt.title || '趋势图' });

  var uid = 'ar' + Math.random().toString(36).slice(2, 7);
  var defs = sv('defs');
  var lg = sv('linearGradient', { id: uid, x1: 0, y1: 0, x2: 0, y2: 1 });
  lg.appendChild(sv('stop', { offset: '0', 'stop-color': opt.color || '#f2c94c', 'stop-opacity': .30 }));
  lg.appendChild(sv('stop', { offset: '1', 'stop-color': opt.color || '#f2c94c', 'stop-opacity': .015 }));
  defs.appendChild(lg);
  svg.appendChild(defs);

  sc.ticks.forEach(function (v) {
    var y = yOf(v);
    if (y < M.t - 1 || y > M.t + ih + 1) return;
    svg.appendChild(sv('line', { x1: M.l, x2: M.l + iw, y1: y, y2: y, stroke: 'currentColor', 'stroke-opacity': .055 }));
    var t = sv('text', { x: M.l - 6, y: y + 3.4, 'text-anchor': 'end', 'font-size': 9.5, fill: 'currentColor', 'fill-opacity': .42 });
    t.textContent = opt.fmtY ? opt.fmtY(v) : L.axisYuan(v);
    svg.appendChild(t);
  });

  var pts = vals.map(function (v, i) { return [xOf(i), yOf(v)]; });
  var base = yOf(sc.lo);
  var dLine = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('');
  var dArea = dLine + 'L' + pts[pts.length - 1][0].toFixed(1) + ',' + base.toFixed(1) +
    'L' + pts[0][0].toFixed(1) + ',' + base.toFixed(1) + 'Z';
  svg.appendChild(sv('path', { d: dArea, fill: 'url(#' + uid + ')' }));
  svg.appendChild(sv('path', {
    d: dLine, fill: 'none', stroke: opt.color || '#f2c94c', 'stroke-width': 1.9,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round'
  }));

  /* 末端：空心点 + 虚线延伸 */
  var lastP = pts[pts.length - 1];
  svg.appendChild(sv('circle', { cx: lastP[0], cy: lastP[1], r: 3.6, fill: 'none', stroke: opt.color || '#f2c94c', 'stroke-width': 1.8 }));

  /* x 轴 */
  var ticks = [], stepDays = Math.max(1, Math.round((dates.length - 1) / 5));
  for (var i = 0; i < dates.length; i += stepDays) ticks.push(i);
  if (ticks[ticks.length - 1] !== dates.length - 1) ticks.push(dates.length - 1);
  var fs = narrow ? 9 : 9.5;
  var stp = Math.max(1, tickStep(ticks.length, iw / Math.max(1, ticks.length - 1), labelTextWidth('10-01', fs)));
  ticks.forEach(function (idx, k) {
    if (!tickOn(k, ticks.length, stp)) return;
    var x = xOf(idx);
    var t = sv('text', { x: clamp(x, 12, W - 12), y: H - 5, 'text-anchor': 'middle', 'font-size': fs, fill: 'currentColor', 'fill-opacity': .4 });
    t.textContent = L.mdLabel(dates[idx]);
    svg.appendChild(t);
  });

  var hair = sv('line', { x1: 0, x2: 0, y1: M.t, y2: M.t + ih, stroke: 'currentColor', 'stroke-opacity': .2, 'stroke-dasharray': '3 3', opacity: 0 });
  var dot = sv('circle', { cx: 0, cy: 0, r: 4.6, fill: 'none', stroke: opt.color || '#f2c94c', 'stroke-width': 2.2, opacity: 0 });
  svg.appendChild(hair); svg.appendChild(dot);
  var hit = sv('rect', { x: M.l, y: M.t, width: iw, height: ih, fill: 'transparent', class: 'probe' });
  svg.appendChild(hit);
  wrap.appendChild(svg);

  var tip = tipOf(wrap);
  bindProbe(hit, function (x, y, ev) {
    var i = clamp(Math.round(x / iw * (dates.length - 1)), 0, dates.length - 1);
    var p = pts[i];
    hair.setAttribute('x1', p[0]); hair.setAttribute('x2', p[0]); hair.setAttribute('opacity', 1);
    dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]); dot.setAttribute('opacity', 1);
    showTip(tip, '<h4>' + esc(dates[i]) + ' · ' + L.wdName(dates[i]) + '</h4>' +
      '<div class="tr"><span>' + esc(opt.name || '数值') + '</span><b>' + esc(L.yuan(vals[i], 0)) + '</b></div>' +
      (opt.extraHTML ? opt.extraHTML(i) : ''));
    placeTip(tip, p[0], p[1], W, H, isTouch(ev));
    hideTips(tip);
    if (opt.onPick) opt.onPick(i, dates[i], vals[i]);
  }, function () {
    hair.setAttribute('opacity', 0); dot.setAttribute('opacity', 0);
    tip.classList.remove('on');
    if (opt.onPick) opt.onPick(-1);
  });
  tip.__reset = function () { hair.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); };
  if (opt.onPick) opt.onPick(dates.length - 1, dates[dates.length - 1], vals[vals.length - 1]);
}

/* ============================================================
   3) 环形图（引导线 + 外置标签 + 碰撞消解）
   ============================================================ */
function donut(wrap, items, opt) {
  opt = opt || {};
  clearWrap(wrap);
  items = (items || []).filter(function (x) { return x.amount > 0; });
  if (!items.length) { emptyState(wrap, '本期没有记录', '先记一笔试试'); return; }

  var W = Math.max(260, Math.round(wrap.clientWidth || 340));
  var narrow = W < 360;
  var total = items.reduce(function (a, b) { return a + b.amount; }, 0);
  items.forEach(function (x) { x.pct = x.amount / total; });

  /* 先定半径，再由半径推高度 —— 反过来会让环在宽卡片里显得又小又空 */
  var colW = clamp(W * 0.21, narrow ? 62 : 68, 88);
  var R = Math.max(38, Math.min((W - colW * 2) / 2 * 0.95, opt.maxR || 132));
  var H = Math.round(R * 2 + 62);
  var r0 = R * 0.63;

  var minGap = narrow ? 24 : 26;

  var cx = W / 2, cy = H / 2;

  /* 分配标签：只给「够大」的块标，最多 6 个 —— 再多的靠下方列表，
     否则小片标签的引导线会互相缠在一起（实测 8 个以上就开始糊） */
  items.forEach(function (it, i) {
    var a0 = 0;
    for (var k = 0; k < i; k++) a0 += items[k].pct;
    it.a0 = a0 * Math.PI * 2 - Math.PI / 2;
    it.a1 = (a0 + it.pct) * Math.PI * 2 - Math.PI / 2;
    it.mid = it.a0 + it.pct * Math.PI;
    it.side = Math.cos(it.mid) >= 0 ? 1 : -1;
    it.labeled = false;
  });
  var byPct = items.slice().sort(function (a, b) { return b.pct - a.pct; });
  var maxLbl = opt.maxLabels || 6;
  var sideCount = { '-1': 0, '1': 0 };
  var capPerSide = Math.max(2, Math.floor((H - 30) / minGap));
  var labeled = [], skipped = 0;
  byPct.forEach(function (it) {
    if (labeled.length >= maxLbl) { skipped++; return; }
    if (it.pct < 0.02) { skipped++; return; }
    if (sideCount[it.side] >= capPerSide) { skipped++; return; }
    it.labeled = true; sideCount[it.side]++; labeled.push(it);
  });

  var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': opt.title || '占比图' });
  var leadG = sv('g');          /* 引导线放最底层，避免压在环上 */
  svg.appendChild(leadG);

  /* 扇区 */
  items.forEach(function (it, i) {
    /* pct ≈ 100% 时起终点重合，A 命令会退化画不出东西 → 单独用「外圆 + 内圆挖洞」
       其余情况（包括 >50% 的大扇区）走同一条标准扇形路径，large-arc 自己会处理 */
    var whole = it.pct >= 0.9995;
    var d;
    if (whole) {
      d = 'M' + cx + ',' + (cy - R) +
        'A' + R + ',' + R + ' 0 1 1 ' + cx + ',' + (cy + R) +
        'A' + R + ',' + R + ' 0 1 1 ' + cx + ',' + (cy - R) + 'Z' +
        'M' + cx + ',' + (cy - r0) +
        'A' + r0 + ',' + r0 + ' 0 1 0 ' + cx + ',' + (cy + r0) +
        'A' + r0 + ',' + r0 + ' 0 1 0 ' + cx + ',' + (cy - r0) + 'Z';
    } else {
      var p0 = [cx + Math.cos(it.a0) * R, cy + Math.sin(it.a0) * R];
      var p1 = [cx + Math.cos(it.a1) * R, cy + Math.sin(it.a1) * R];
      var large = (it.a1 - it.a0) > Math.PI ? 1 : 0;
      d = 'M' + p0[0].toFixed(2) + ',' + p0[1].toFixed(2) +
        'A' + R + ',' + R + ' 0 ' + large + ' 1 ' + p1[0].toFixed(2) + ',' + p1[1].toFixed(2) +
        'L' + (cx + Math.cos(it.a1) * r0).toFixed(2) + ',' + (cy + Math.sin(it.a1) * r0).toFixed(2) +
        'A' + r0 + ',' + r0 + ' 0 ' + large + ' 0 ' + (cx + Math.cos(it.a0) * r0).toFixed(2) + ',' + (cy + Math.sin(it.a0) * r0).toFixed(2) + 'Z';
    }
    var attrs = { d: d, fill: it.color, stroke: 'var(--card)', 'stroke-width': 1.2, 'data-i': i };
    if (whole) attrs['fill-rule'] = 'evenodd';
    var path = sv('path', attrs);
    path.style.transition = 'opacity .15s';
    svg.appendChild(path);
    it._path = path;
  });

  /* 标签排布 */
  function layout(side) {
    var arr = labeled.filter(function (x) { return x.side === side; });
    arr.sort(function (a, b) { return Math.sin(a.mid) - Math.sin(b.mid); });
    var ys = arr.map(function (x) { return cy + Math.sin(x.mid) * (R + 14); });
    for (var i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] < minGap) ys[i] = ys[i - 1] + minGap;
    var over = ys.length ? ys[ys.length - 1] - (H - 10) : 0;
    if (over > 0) {
      for (var j = ys.length - 1; j >= 0; j--) {
        ys[j] -= over;
        if (j > 0 && ys[j] - ys[j - 1] < minGap) over = minGap - (ys[j] - ys[j - 1]); else over = 0;
      }
    }
    var minTop = 12;
    if (ys.length && ys[0] < minTop) {
      var push = minTop - ys[0];
      for (var k = 0; k < ys.length; k++) ys[k] += push;
    }
    arr.forEach(function (x, i) { x.ly = ys[i]; });
    return arr;
  }
  var leftArr = layout(-1), rightArr = layout(1);

  function drawLabels(arr) {
    arr.forEach(function (it) {
      var x1 = cx + Math.cos(it.mid) * (R + 3);
      var y1 = cy + Math.sin(it.mid) * (R + 3);
      var x2 = cx + Math.cos(it.mid) * (R + 12);
      var y2 = cy + Math.sin(it.mid) * (R + 12);
      var side = it.side;
      var anchorX = cx + side * (R + 22);
      var textX = anchorX + side * 8;
      leadG.appendChild(sv('polyline', {
        points: x1.toFixed(1) + ',' + y1.toFixed(1) + ' ' + x2.toFixed(1) + ',' + y2.toFixed(1) +
          ' ' + anchorX.toFixed(1) + ',' + it.ly.toFixed(1),
        fill: 'none', stroke: it.color, 'stroke-width': 1, 'stroke-opacity': .45, 'stroke-linejoin': 'round'
      }));
      svg.appendChild(sv('circle', { cx: textX.toFixed(1), cy: (it.ly - 3.5).toFixed(1), r: 1.9, fill: it.color }));

      var t1 = sv('text', {
        x: (textX + side * 5).toFixed(1), y: (it.ly - 0.5).toFixed(1),
        'text-anchor': side > 0 ? 'start' : 'end', 'font-size': narrow ? 9 : 9.5,
        fill: 'currentColor'
      });
      t1.textContent = opt.labelName === false ? L.pct(it.pct) : it.name;
      svg.appendChild(t1);

      var t2 = sv('text', {
        x: (textX + side * 5).toFixed(1), y: (it.ly + 9.5).toFixed(1),
        'text-anchor': side > 0 ? 'start' : 'end', 'font-size': narrow ? 8.5 : 9,
        fill: 'currentColor', 'fill-opacity': .5
      });
      t2.textContent = opt.labelName === false
        ? (opt.delta ? L.yuanS(it.delta, 0) : '')
        : L.pct(it.pct) + (opt.delta ? '  ' + L.yuanS(it.delta, 0) : '');
      svg.appendChild(t2);
      if (!t2.textContent) t2.remove();
    });
  }
  drawLabels(leftArr); drawLabels(rightArr);

  /* 中心 */
  svg.appendChild(sv('circle', { cx: cx, cy: cy, r: r0 - 2, fill: 'var(--card)' }));
  var ct1 = sv('text', { x: cx, y: cy - 8, 'text-anchor': 'middle', 'font-size': contiguous(9.5), fill: 'currentColor', 'fill-opacity': .45 });
  ct1.textContent = opt.centerLabel || '总支出';
  svg.appendChild(ct1);
  var ct2 = sv('text', { x: cx, y: cy + 13, 'text-anchor': 'middle', 'font-size': narrow ? 15 : 16.5, 'font-weight': 700, fill: 'currentColor' });
  ct2.textContent = L.yuan(total, total >= 1000 ? 0 : 2);
  svg.appendChild(ct2);

  wrap.appendChild(svg);

  function contiguous(v) { return v; }

  /* hover 命中：按角度 */
  var tip = tipOf(wrap);
  var hit = sv('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent', class: 'probe' });
  svg.appendChild(hit);

  function locate(mx, my) {
    var dx = mx - cx, dy = my - cy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > R + 20) return null;
    var ang = Math.atan2(dy, dx);
    for (var i = 0; i < items.length; i++) {
      var a = ang;
      var a0 = items[i].a0, a1 = items[i].a1;
      if (i === 0); // noop
      var norm = function (x) { while (x < -Math.PI) x += Math.PI * 2; while (x > Math.PI) x -= Math.PI * 2; return x; };
      var d0 = norm(a - a0), d1 = norm(a1 - a0);
      var da = norm(a - a0);
      var span = d1 > 0 ? d1 : d1 + Math.PI * 2;
      if (da >= 0 && da <= span) return i;
    }
    return null;
  }

  bindProbe(hit, function (x, y, ev) {
    var i = locate(x, y);
    items.forEach(function (it, k) { it._path.style.opacity = (i == null || k === i) ? 1 : .35; });
    if (i == null) { tip.classList.remove('on'); return; }
    var it = items[i];
    showTip(tip, '<h4>' + esc(it.name) + '</h4>' +
      '<div class="tr"><span>金额</span><b>' + esc(L.yuan(it.amount)) + '</b></div>' +
      '<div class="tr"><span>占比</span><b>' + L.pct(it.pct) + '</b></div>' +
      (it.count != null ? '<div class="tr"><span>笔数</span><b>' + it.count + ' 笔</b></div>' : '') +
      (it.delta != null ? '<div class="tr"><span>环比</span><b style="color:' + (it.delta > 0 ? 'var(--up)' : 'var(--down)') + '">' + L.yuanS(it.delta, 0) + '</b></div>' : ''));
    placeTip(tip, x, y, W, H, isTouch(ev));
    hideTips(tip);
  }, function () {
    items.forEach(function (it) { it._path.style.opacity = 1; });
    tip.classList.remove('on');
  });
  tip.__reset = function () { items.forEach(function (it) { it._path.style.opacity = 1; }); };

  if (skipped) {
    var note = sv('text', { x: W - 6, y: H - 3, 'text-anchor': 'end', 'font-size': 8, fill: 'currentColor', 'fill-opacity': .3 });
    note.textContent = '另 ' + skipped + ' 项见下方列表';
    svg.appendChild(note);
  }
}

/* ============================================================
   4) 月度双柱 + 结余折线
   ============================================================ */
function groupedBars(wrap, months, opt) {
  opt = opt || {};
  clearWrap(wrap);
  if (!months.length) { emptyState(wrap, '暂无数据', ''); return; }

  var W = Math.max(240, Math.round(wrap.clientWidth || 340));
  var narrow = W < 380;
  var H = opt.height || (narrow ? 190 : 210);
  var M = { l: narrow ? 34 : 40, r: 10, t: 16, b: 22 };
  var iw = Math.max(40, W - M.l - M.r), ih = Math.max(60, H - M.t - M.b);

  var allV = [];
  months.forEach(function (m) { allV.push(m.inc, m.exp, m.net); });
  var sc = niceTicks(Math.min(0, Math.min.apply(null, allV)), Math.max.apply(null, allV) * 1.05, narrow ? 4 : 5);
  var yOf = function (v) { return M.t + ih - (v - sc.lo) / (sc.hi - sc.lo) * ih; };
  var slotW = iw / months.length;
  var bw = clamp(slotW * 0.26, 3, 11);
  var gap = clamp(slotW * 0.06, 1, 4);

  var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': '月度收支' });

  sc.ticks.forEach(function (v) {
    var y = yOf(v);
    if (y < M.t - 1 || y > M.t + ih + 1) return;
    svg.appendChild(sv('line', { x1: M.l, x2: M.l + iw, y1: y, y2: y, stroke: 'currentColor', 'stroke-opacity': v === 0 ? .12 : .05 }));
    var t = sv('text', { x: M.l - 5, y: y + 3.3, 'text-anchor': 'end', 'font-size': 9, fill: 'currentColor', 'fill-opacity': .4 });
    t.textContent = L.axisYuan(v);
    svg.appendChild(t);
  });

  var zeroY = yOf(0);
  months.forEach(function (m, i) {
    var base = M.l + slotW * i + slotW / 2;
    var x1 = base - bw - gap / 2, x2 = base + gap / 2;
    [['exp', x1, '#f0716a'], ['inc', x2, '#4ecb8f']].forEach(function (cfg) {
      var v = m[cfg[0]];
      if (Math.abs(v) < 1e-9) return;
      var y = yOf(v);
      svg.appendChild(sv('rect', {
        x: cfg[1], y: Math.min(y, zeroY), width: bw,
        height: Math.max(1.5, Math.abs(zeroY - y)), rx: Math.min(bw / 2, 3),
        fill: cfg[2], 'fill-opacity': .92
      }));
    });
  });

  /* 结余折线 */
  var pts = months.map(function (m, i) { return [M.l + slotW * i + slotW / 2, yOf(m.net)]; });
  svg.appendChild(sv('path', {
    d: pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(''),
    fill: 'none', stroke: '#f2c94c', 'stroke-width': 1.8, 'stroke-linejoin': 'round'
  }));
  pts.forEach(function (p) {
    svg.appendChild(sv('circle', { cx: p[0], cy: p[1], r: 2.6, fill: 'var(--card)', stroke: '#f2c94c', 'stroke-width': 1.6 }));
  });

  var fs = 9, lw = labelTextWidth('10月', fs);
  var stp = tickStep(months.length, slotW, lw);
  months.forEach(function (m, i) {
    if (!tickOn(i, months.length, stp)) return;
    var t = sv('text', { x: M.l + slotW * i + slotW / 2, y: H - 6, 'text-anchor': 'middle', 'font-size': fs, fill: 'currentColor', 'fill-opacity': .4 });
    t.textContent = m.label;
    svg.appendChild(t);
  });

  var hit = sv('rect', { x: M.l, y: M.t, width: iw, height: ih, fill: 'transparent', class: 'probe' });
  svg.appendChild(hit);
  wrap.appendChild(svg);

  var tip = tipOf(wrap);
  bindProbe(hit, function (x, y, ev) {
    var i = clamp(Math.floor(x / slotW), 0, months.length - 1);
    var m = months[i];
    showTip(tip, '<h4>' + esc(m.key) + '</h4>' +
      '<div class="tr"><span>收入</span><b style="color:var(--down)">' + esc(L.yuan(m.inc, 0)) + '</b></div>' +
      '<div class="tr"><span>支出</span><b style="color:var(--up)">' + esc(L.yuan(m.exp, 0)) + '</b></div>' +
      '<div class="tr"><span>结余</span><b>' + esc(L.yuanS(m.net, 0)) + '</b></div>' +
      '<div class="tr"><span>储蓄率</span><b>' + L.pct(m.rate) + '</b></div>');
    placeTip(tip, M.l + slotW * i + slotW / 2, yOf(m.net), W, H, isTouch(ev));
    hideTips(tip);
  }, function () { tip.classList.remove('on'); });
}

/* ============================================================
   5) 储蓄率折线（带 20% 目标线）
   ============================================================ */
function rateLine(wrap, months, opt) {
  opt = opt || {};
  clearWrap(wrap);
  var data = months.filter(function (m) { return m.rate != null; });
  if (data.length < 2) { emptyState(wrap, '记录不足', '至少两个月的收入才能算储蓄率'); return; }

  var W = Math.max(240, Math.round(wrap.clientWidth || 340));
  var narrow = W < 380;
  var H = opt.height || (narrow ? 168 : 186);
  var M = { l: narrow ? 34 : 40, r: 12, t: 16, b: 20 };
  var iw = Math.max(40, W - M.l - M.r), ih = Math.max(60, H - M.t - M.b);

  var vals = data.map(function (m) { return m.rate * 100; });
  var lo = Math.min(0, Math.min.apply(null, vals));
  var hi = Math.max(20, Math.max.apply(null, vals));
  var sc = niceTicks(lo - 4, hi + 4, narrow ? 3 : 4);
  var yOf = function (v) { return M.t + ih - (v - sc.lo) / (sc.hi - sc.lo) * ih; };
  var xOf = function (i) { return M.l + (data.length === 1 ? iw / 2 : i / (data.length - 1) * iw); };

  var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': '储蓄率' });

  sc.ticks.forEach(function (v) {
    var y = yOf(v);
    if (y < M.t - 1 || y > M.t + ih + 1) return;
    svg.appendChild(sv('line', { x1: M.l, x2: M.l + iw, y1: y, y2: y, stroke: 'currentColor', 'stroke-opacity': v === 0 ? .12 : .05 }));
    var t = sv('text', { x: M.l - 5, y: y + 3.3, 'text-anchor': 'end', 'font-size': 9, fill: 'currentColor', 'fill-opacity': .4 });
    t.textContent = v + '%';
    svg.appendChild(t);
  });

  /* 20% 目标 */
  var ty = yOf(20);
  svg.appendChild(sv('line', { x1: M.l, x2: M.l + iw, y1: ty, y2: ty, stroke: '#4ecb8f', 'stroke-opacity': .5, 'stroke-dasharray': '5 4' }));
  var tl = sv('text', { x: M.l + iw, y: ty - 4, 'text-anchor': 'end', 'font-size': 8.5, fill: '#4ecb8f', 'fill-opacity': .8 });
  tl.textContent = '健康线 20%';
  svg.appendChild(tl);

  var pts = data.map(function (m, i) { return [xOf(i), yOf(m.rate * 100)]; });
  var zy = yOf(0);
  var uid = 'sr' + Math.random().toString(36).slice(2, 7);
  var defs = sv('defs');
  var lg = sv('linearGradient', { id: uid, x1: 0, y1: 0, x2: 0, y2: 1 });
  lg.appendChild(sv('stop', { offset: '0', 'stop-color': '#6cc4f5', 'stop-opacity': .25 }));
  lg.appendChild(sv('stop', { offset: '1', 'stop-color': '#6cc4f5', 'stop-opacity': .01 }));
  defs.appendChild(lg); svg.appendChild(defs);

  var dLine = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('');
  svg.appendChild(sv('path', {
    d: dLine + 'L' + pts[pts.length - 1][0].toFixed(1) + ',' + zy.toFixed(1) + 'L' + pts[0][0].toFixed(1) + ',' + zy.toFixed(1) + 'Z',
    fill: 'url(#' + uid + ')'
  }));
  svg.appendChild(sv('path', { d: dLine, fill: 'none', stroke: '#6cc4f5', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  pts.forEach(function (p, i) {
    svg.appendChild(sv('circle', {
      cx: p[0], cy: p[1], r: 3, fill: data[i].rate >= .2 ? '#4ecb8f' : data[i].rate >= 0 ? '#f2c94c' : '#f0716a',
      stroke: 'var(--card)', 'stroke-width': 1.4
    }));
  });

  data.forEach(function (m, i) {
    if (i === 0 || i === data.length - 1 || data.length <= 7) {
      var t = sv('text', { x: clamp(xOf(i), 12, W - 12), y: H - 5, 'text-anchor': 'middle', 'font-size': 9, fill: 'currentColor', 'fill-opacity': .4 });
      t.textContent = m.label;
      svg.appendChild(t);
    }
  });

  var hit = sv('rect', { x: M.l, y: M.t, width: iw, height: ih, fill: 'transparent', class: 'probe' });
  svg.appendChild(hit);
  wrap.appendChild(svg);

  var tip = tipOf(wrap);
  bindProbe(hit, function (x, y, ev) {
    var i = clamp(Math.round(x / iw * (data.length - 1)), 0, data.length - 1);
    var m = data[i], p = pts[i];
    showTip(tip, '<h4>' + esc(m.key) + '</h4>' +
      '<div class="tr"><span>储蓄率</span><b>' + L.pct(m.rate) + '</b></div>' +
      '<div class="tr"><span>收入</span><b>' + esc(L.yuan(m.inc, 0)) + '</b></div>' +
      '<div class="tr"><span>支出</span><b>' + esc(L.yuan(m.exp, 0)) + '</b></div>');
    placeTip(tip, p[0], p[1], W, H, isTouch(ev));
    hideTips(tip);
  }, function () { tip.classList.remove('on'); });
}

/* ============================================================
   6) 日历热力
   ============================================================ */
function calendarHeat(wrap, cal, opt) {
  opt = opt || {};
  clearWrap(wrap);
  var W = Math.max(240, Math.round(wrap.clientWidth || 340));

  var cols = 7;
  var padL = 22, padT = 18, gap = 4;
  var cell = Math.floor((W - padL - 4 - gap * (cols - 1)) / cols);
  cell = clamp(cell, 26, 52);
  var rows = Math.ceil(cal.cells.length / cols);
  var H = padT + rows * (cell + gap) + 4;

  var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': '支出日历' });
  var wd = ['一', '二', '三', '四', '五', '六', '日'];
  wd.forEach(function (s, i) {
    var t = sv('text', { x: padL + i * (cell + gap) + cell / 2, y: 11, 'text-anchor': 'middle', 'font-size': 9, fill: 'currentColor', 'fill-opacity': .35 });
    t.textContent = s;
    svg.appendChild(t);
  });

  var max = cal.max || 1;
  cal.cells.forEach(function (c, i) {
    var col = i % cols, row = Math.floor(i / cols);
    var x = padL + col * (cell + gap), y = padT + row * (cell + gap);
    if (!c) return;
    var k = c.v / max;
    var op = c.v <= 0 ? 0 : 0.14 + Math.pow(k, .65) * 0.86;
    svg.appendChild(sv('rect', {
      x: x, y: y, width: cell, height: cell, rx: 6,
      fill: c.v <= 0 ? 'currentColor' : '#f0716a', 'fill-opacity': c.v <= 0 ? .05 : op,
      'data-date': c.date, class: 'cal-cell'
    }));
    var t = sv('text', { x: x + cell / 2, y: y + cell / 2 + 3.6, 'text-anchor': 'middle', 'font-size': 9.5, fill: '#fff', 'fill-opacity': c.v > 0 ? .9 : .28 });
    t.textContent = c.d;
    svg.appendChild(t);
  });

  var hit = sv('rect', { x: padL, y: padT, width: cols * (cell + gap), height: rows * (cell + gap), fill: 'transparent', class: 'probe' });
  svg.appendChild(hit);
  wrap.appendChild(svg);

  var tip = tipOf(wrap);
  function dateAt(x, y, ev) {
    var col = Math.floor(x / (cell + gap)), row = Math.floor(y / (cell + gap));
    var i = row * cols + col;
    return cal.cells[i] || null;
  }
  var lastEl = null;
  bindProbe(hit, function (x, y, ev) {
    var c = dateAt(x, y, ev);
    if (lastEl) lastEl.style.stroke = 'none';
    if (!c) { tip.classList.remove('on'); return; }
    var el = wrap.querySelector('[data-date="' + c.date + '"]');
    if (el) { el.style.stroke = '#fff'; el.style.strokeWidth = '1.5'; lastEl = el; }
    showTip(tip, '<h4>' + esc(c.date) + ' · ' + L.wdName(c.date) + '</h4>' +
      '<div class="tr"><span>支出</span><b>' + (c.v ? esc(L.yuan(c.v)) : '无记录') + '</b></div>');
    placeTip(tip, x + padL, y + padT, W, H, isTouch(ev));
    hideTips(tip);
  }, function () {
    if (lastEl) { lastEl.style.stroke = 'none'; lastEl = null; }
    tip.classList.remove('on');
  });
  tip.__reset = function () { if (lastEl) { lastEl.style.stroke = 'none'; lastEl = null; } };
}

/* ============================================================
   7) 星期 × 时段 热力矩阵
   ============================================================ */
function heatMatrix(wrap, hg, opt) {
  opt = opt || {};
  clearWrap(wrap);
  var W = Math.max(240, Math.round(wrap.clientWidth || 340));
  var padL = 34, padT = 16, gap = 3;
  var cols = L.SLOTS.length;
  var cellW = Math.floor((W - padL - 4 - gap * (cols - 1)) / cols);
  cellW = clamp(cellW, 22, 60);
  var cellH = clamp(Math.round(cellW * 0.72), 20, 34);
  var rows = 7;
  var H = padT + rows * (cellH + gap) + 16;

  var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': '时段热力' });
  var names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  L.SLOTS.forEach(function (s, i) {
    var t = sv('text', { x: padL + i * (cellW + gap) + cellW / 2, y: H - 4, 'text-anchor': 'middle', 'font-size': 8.5, fill: 'currentColor', 'fill-opacity': .35 });
    t.textContent = s.label;
    svg.appendChild(t);
  });
  names.forEach(function (n, r) {
    var t = sv('text', { x: padL - 5, y: padT + r * (cellH + gap) + cellH / 2 + 3.2, 'text-anchor': 'end', 'font-size': 8.5, fill: 'currentColor', 'fill-opacity': .35 });
    t.textContent = n;
    svg.appendChild(t);
  });

  var max = hg.max || 1;
  for (var r = 0; r < rows; r++) {
    L.SLOTS.forEach(function (s, c) {
      var v = hg.grid[r][s.id] || 0;
      var k = v / max;
      var op = v <= 0 ? 0 : 0.1 + Math.pow(k, .6) * 0.9;
      svg.appendChild(sv('rect', {
        x: padL + c * (cellW + gap), y: padT + r * (cellH + gap),
        width: cellW, height: cellH, rx: 4,
        fill: v <= 0 ? 'currentColor' : '#f2c94c', 'fill-opacity': v <= 0 ? .05 : op,
        'data-r': r, 'data-c': c, class: 'heat-cell'
      }));
      if (v > 0 && cellW > 34) {
        var t = sv('text', {
          x: padL + c * (cellW + gap) + cellW / 2,
          y: padT + r * (cellH + gap) + cellH / 2 + 3.2,
          'text-anchor': 'middle', 'font-size': 8,
          fill: k > .55 ? '#1b1503' : '#fff', 'fill-opacity': .9
        });
        t.textContent = L.shortYuan(v);
        svg.appendChild(t);
      }
    });
  }

  var hit = sv('rect', { x: padL, y: padT, width: cols * (cellW + gap), height: rows * (cellH + gap), fill: 'transparent', class: 'probe' });
  svg.appendChild(hit);
  wrap.appendChild(svg);

  var tip = tipOf(wrap), lastEl = null;
  bindProbe(hit, function (x, y, ev) {
    var c = clamp(Math.floor(x / (cellW + gap)), 0, cols - 1);
    var r = clamp(Math.floor(y / (cellH + gap)), 0, rows - 1);
    var v = hg.grid[r][L.SLOTS[c].id] || 0;
    if (lastEl) lastEl.style.stroke = 'none';
    var el = wrap.querySelector('[data-r="' + r + '"][data-c="' + c + '"]');
    if (el) { el.style.stroke = '#fff'; el.style.strokeWidth = '1.4'; lastEl = el; }
    showTip(tip, '<h4>' + names[r] + ' · ' + L.SLOTS[c].label + '</h4>' +
      '<div class="tr"><span>支出</span><b>' + (v ? esc(L.yuan(v, 0)) : '—') + '</b></div>');
    placeTip(tip, x + padL, y + padT, W, H, isTouch(ev));
    hideTips(tip);
  }, function () {
    if (lastEl) { lastEl.style.stroke = 'none'; lastEl = null; }
    tip.classList.remove('on');
  });
  tip.__reset = function () { if (lastEl) { lastEl.style.stroke = 'none'; lastEl = null; } };
}

/* ============================================================
   8) 分类堆叠面积
   ============================================================ */
function stackArea(wrap, months, series, opt) {
  opt = opt || {};
  clearWrap(wrap);
  if (!months.length || !series.length) { emptyState(wrap, '数据不足', ''); return; }

  var W = Math.max(240, Math.round(wrap.clientWidth || 340));
  var narrow = W < 380;
  var H = opt.height || (narrow ? 180 : 200);
  var M = { l: narrow ? 34 : 40, r: 10, t: 14, b: 20 };
  var iw = Math.max(40, W - M.l - M.r), ih = Math.max(60, H - M.t - M.b);

  var totals = months.map(function (_, i) {
    return series.reduce(function (a, s) { return a + s.values[i]; }, 0);
  });
  var sc = niceTicks(0, Math.max.apply(null, totals) * 1.05, narrow ? 3 : 4);
  var yOf = function (v) { return M.t + ih - (v - sc.lo) / (sc.hi - sc.lo) * ih; };
  var xOf = function (i) { return M.l + (months.length === 1 ? iw / 2 : i / (months.length - 1) * iw); };

  var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': '分类趋势' });

  sc.ticks.forEach(function (v) {
    var y = yOf(v);
    if (y < M.t - 1 || y > M.t + ih + 1) return;
    svg.appendChild(sv('line', { x1: M.l, x2: M.l + iw, y1: y, y2: y, stroke: 'currentColor', 'stroke-opacity': .05 }));
    var t = sv('text', { x: M.l - 5, y: y + 3.3, 'text-anchor': 'end', 'font-size': 9, fill: 'currentColor', 'fill-opacity': .4 });
    t.textContent = L.axisYuan(v);
    svg.appendChild(t);
  });

  var acc = months.map(function () { return 0; });
  /* 从底部往上叠：先算累计，再画 */
  var bands = series.map(function (s) {
    var lower = acc.slice();
    s.values.forEach(function (v, i) { acc[i] += v; });
    return { s: s, lower: lower, upper: acc.slice() };
  });
  bands.reverse().forEach(function (b) {
    var up = b.upper.map(function (v, i) { return xOf(i).toFixed(1) + ',' + yOf(v).toFixed(1); });
    var lo = b.lower.slice().reverse().map(function (v, k) {
      var i = b.lower.length - 1 - k;
      return xOf(i).toFixed(1) + ',' + yOf(v).toFixed(1);
    });
    svg.appendChild(sv('path', {
      d: 'M' + up.join('L') + 'L' + lo.join('L') + 'Z',
      fill: b.s.color, 'fill-opacity': .82, stroke: 'var(--card)', 'stroke-width': .8
    }));
  });

  var fs = 9, lw = labelTextWidth('10月', fs);
  var stp = tickStep(months.length, iw / Math.max(1, months.length - 1), lw);
  months.forEach(function (m, i) {
    if (!tickOn(i, months.length, stp)) return;
    var t = sv('text', { x: clamp(xOf(i), 12, W - 12), y: H - 5, 'text-anchor': 'middle', 'font-size': fs, fill: 'currentColor', 'fill-opacity': .4 });
    t.textContent = m.label;
    svg.appendChild(t);
  });

  var hit = sv('rect', { x: M.l, y: M.t, width: iw, height: ih, fill: 'transparent', class: 'probe' });
  svg.appendChild(hit);
  wrap.appendChild(svg);

  var tip = tipOf(wrap);
  bindProbe(hit, function (x, y, ev) {
    var i = clamp(Math.round(x / iw * (months.length - 1)), 0, months.length - 1);
    var rows = series.map(function (s) { return '<div class="tr"><span>' + esc(s.name) + '</span><b>' + esc(L.yuan(s.values[i], 0)) + '</b></div>'; }).join('');
    showTip(tip, '<h4>' + esc(months[i].key) + '</h4>' + rows +
      '<div class="tr" style="border-top:1px solid rgba(255,255,255,.1);margin-top:3px;padding-top:3px"><span>合计</span><b>' + esc(L.yuan(totals[i], 0)) + '</b></div>');
    placeTip(tip, xOf(i), M.t + 10, W, H, isTouch(ev));
    hideTips(tip);
  }, function () { tip.classList.remove('on'); });
}

/* ============================================================
   9) 单条堆叠构成条
   ============================================================ */
function stackBarOne(wrap, items, opt) {
  opt = opt || {};
  clearWrap(wrap);
  items = items.filter(function (x) { return x.amount > 0; });
  if (!items.length) { emptyState(wrap, '暂无账户', ''); return; }
  var W = Math.max(200, Math.round(wrap.clientWidth || 320));
  var H = opt.height || 30;
  var total = items.reduce(function (a, b) { return a + b.amount; }, 0);
  var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': '构成' });
  var x = 0, gap = 1.5;
  items.forEach(function (it, i) {
    var w = (it.amount / total) * (W - gap * (items.length - 1));
    w = Math.max(2, w);
    svg.appendChild(sv('rect', {
      x: x, y: 0, width: w, height: H, rx: 4,
      fill: it.color, 'data-i': i
    }));
    x += w + gap;
  });
  wrap.appendChild(svg);

  var tip = tipOf(wrap);
  var hit = sv('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent', class: 'probe' });
  svg.appendChild(hit);
  bindProbe(hit, function (mx, my, ev) {
    var x0 = 0, found = null;
    for (var i = 0; i < items.length; i++) {
      var w = Math.max(2, (items[i].amount / total) * (W - gap * (items.length - 1)));
      if (mx >= x0 && mx <= x0 + w) { found = items[i]; break; }
      x0 += w + gap;
    }
    if (!found) { tip.classList.remove('on'); return; }
    showTip(tip, '<h4>' + esc(found.name) + '</h4><div class="tr"><span>金额</span><b>' + esc(L.yuan(found.amount, 0)) + '</b></div>' +
      '<div class="tr"><span>占比</span><b>' + L.pct(found.amount / total) + '</b></div>');
    placeTip(tip, mx, 0, W, H + 40, isTouch(ev));
    hideTips(tip);
  }, function () { tip.classList.remove('on'); });
}

/* ============================================================
   10) 迷你折线（账本页头）
   ============================================================ */
function spark(wrap, data, opt) {
  opt = opt || {};
  clearWrap(wrap);
  if (data.length < 2) return;
  var W = Math.max(160, Math.round(wrap.clientWidth || 320));
  var H = opt.height || 44;
  var vals = data.map(function (d) { return d.v; });
  var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
  if (max === min) max = min + 1;
  var pad = (max - min) * .2;
  var yOf = function (v) { return H - 4 - (v - (min - pad)) / ((max + pad) - (min - pad)) * (H - 8); };
  var xOf = function (i) { return i / (data.length - 1) * W; };
  var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, 'aria-label': '每日走势' });
  var uid = 'sp' + Math.random().toString(36).slice(2, 7);
  var defs = sv('defs');
  var lg = sv('linearGradient', { id: uid, x1: 0, y1: 0, x2: 0, y2: 1 });
  lg.appendChild(sv('stop', { offset: '0', 'stop-color': opt.color || '#f2c94c', 'stop-opacity': .28 }));
  lg.appendChild(sv('stop', { offset: '1', 'stop-color': opt.color || '#f2c94c', 'stop-opacity': 0 }));
  defs.appendChild(lg); svg.appendChild(defs);

  var d = data.map(function (x, i) { return (i ? 'L' : 'M') + xOf(i).toFixed(1) + ',' + yOf(x.v).toFixed(1); }).join('');
  svg.appendChild(sv('path', { d: d + 'L' + W + ',' + H + 'L0,' + H + 'Z', fill: 'url(#' + uid + ')' }));
  svg.appendChild(sv('path', { d: d, fill: 'none', stroke: opt.color || '#f2c94c', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }));
  wrap.appendChild(svg);
}

window.__C = {
  sv: sv, labelTextWidth: labelTextWidth, tickStep: tickStep, tickOn: tickOn, niceTicks: niceTicks,
  barDaily: barDaily, areaLine: areaLine, donut: donut, groupedBars: groupedBars,
  rateLine: rateLine, calendarHeat: calendarHeat, heatMatrix: heatMatrix,
  stackArea: stackArea, stackBarOne: stackBarOne, spark: spark,
  emptyState: emptyState, clearWrap: clearWrap, hideTips: hideTips
};
})();
