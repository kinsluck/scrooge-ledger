/* ============================================================
   史高治账本 · 视图渲染
   ============================================================ */
(function () {
'use strict';

var L = window.__L, C = window.__C;
var S = L.S;
var $ = L.$, $$ = L.$$, esc = L.esc;

function html(el, s) { el.innerHTML = s; }
function fmt(n) { return L.yuan(n); }
function cls(v) { return v > 0 ? 'up' : v < 0 ? 'down' : ''; }

/* ============================================================
   账本
   ============================================================ */
function renderLedger() {
  var mk = S.ledgerMonth || L.monthKey(L.latestDate() || L.todayISO());
  var rg = { from: L.firstOfMonth(mk), to: L.lastOfMonth(mk) };
  var list = L.rangeTxns(rg);
  var s = L.summarize(list);

  $('#heroMonth').textContent = L.cnMonth(mk);
  var dayNow = new Date();
  var isCur = L.monthKey(L.todayISO()) === mk;
  $('#heroDayLeft').textContent = isCur
    ? '还剩 ' + Math.max(0, new Date(dayNow.getFullYear(), dayNow.getMonth() + 1, 0).getDate() - dayNow.getDate()) + ' 天'
    : '已归档';

  html($('#ledgerHero'),
    '<div style="display:flex;align-items:flex-end;gap:10px;justify-content:space-between">' +
      '<div>' +
        '<div class="hint" style="margin-bottom:2px">本月结余</div>' +
        '<div class="num" style="font-size:29px;font-weight:700;letter-spacing:-.02em;line-height:1.15;' +
          (s.net < 0 ? 'color:var(--up)' : 'color:var(--gold)') + '">' + fmt(s.net) + '</div>' +
      '</div>' +
      '<div style="text-align:right">' +
        '<div class="badge ' + (s.net >= 0 ? 'green' : 'red') + '">' +
          (s.net >= 0 ? '收支有结余' : '本月透支') + '</div>' +
        '<div class="hint" style="margin-top:5px">' + s.n + ' 笔记录</div>' +
      '</div>' +
    '</div>' +
    '<div class="stat-grid" style="margin-top:12px">' +
      '<div class="stat"><span class="lbl">支出</span><b class="v">' + fmt(s.out) + '</b></div>' +
      '<div class="stat"><span class="lbl">收入</span><b class="v down">' + fmt(s.inc) + '</b></div>' +
    '</div>');

  var daily = L.dailySeries({ from: rg.from, to: L.effEnd(rg) }, 'expense');
  C.spark($('#cLedgerSpark'), daily, { color: '#f0716c' });

  /* 明细 */
  var f = S.ledgerFilter;
  var shown = list.filter(function (t) {
    if (f === 'all') return true;
    return t.type === f;
  });
  if (S.ledgerSearch) {
    var q = S.ledgerSearch.toLowerCase();
    shown = shown.filter(function (t) {
      return (t.note || '').toLowerCase().indexOf(q) >= 0 ||
        L.catById(t.cat).name.indexOf(q) >= 0 ||
        String(t.amount).indexOf(q) >= 0;
    });
  }
  shown.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (a.time || '') < (b.time || '') ? 1 : -1;
  });

  $('#ledgerCount').textContent = shown.length + ' 笔';
  $$('[data-ledger-filter]').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-ledger-filter') === f);
  });

  if (!shown.length) {
    html($('#txList'), '<div class="empty">这个月还没有记录<br><em>点右下角 ＋ 记一笔</em></div>');
    return;
  }

  var out = '', cur = '', dayOut = 0, dayIn = 0, buf = [];
  function flushDay() {
    if (!buf.length) return;
    out += '<div class="day-grp"><div class="day-hd"><b>' + esc(cur) + '</b>' +
      '<span>' + L.wdName(cur) + '</span>' +
      '<span class="sum">' + (dayOut ? '支出 ' + fmt(dayOut) : '') +
      (dayOut && dayIn ? ' · ' : '') + (dayIn ? '收入 ' + fmt(dayIn) : '') + '</span></div>' +
      buf.join('') + '</div>';
    buf = []; dayOut = 0; dayIn = 0;
  }
  shown.forEach(function (t) {
    if (t.date !== cur) { flushDay(); cur = t.date; }
    if (t.type === 'expense') dayOut += t.amount;
    else if (t.type === 'income') dayIn += t.amount;
    buf.push(txRow(t));
  });
  flushDay();
  html($('#txList'), out);
}

function txRow(t) {
  var isTf = t.type === 'transfer';
  var c = isTf ? { icon: '⇄', color: '#5b9cf5', name: '转账' } : L.catById(t.cat);
  var a = L.acctById(t.acct);
  var isIn = t.type === 'income';
  var amt, cls2;
  if (isTf) { amt = fmt(t.amount); cls2 = ''; }
  else { amt = (isIn ? '+' : '-') + fmt(t.amount); cls2 = isIn ? 'in' : 'out'; }
  var meta = [];
  if (a && a.name) meta.push(a.name);
  if (t.sub) meta.push(t.sub);
  if (isTf) meta.push('→ ' + L.acctById(t.toAcct).name);
  if ((t.tags || []).length) meta.push(t.tags.join(' / '));
  var time = (t.time || '').slice(0, 5);

  return '<div class="tx" data-tx="' + t.id + '">' +
    '<div class="tx-ic" style="background:' + hexA(c.color, .14) + ';color:' + c.color + '">' + c.icon + '</div>' +
    '<div class="tx-mid"><b>' + esc(t.note || c.name) + '</b>' +
      '<span>' + esc(c.name) + (meta.length ? ' · ' + esc(meta.join(' · ')) : '') + '</span></div>' +
    '<div class="tx-amt ' + cls2 + '">' + amt + '<span class="tagm">' + time + '</span></div>' +
    '</div>';
}

function hexA(hex, a) {
  var h = String(hex || '#888888').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var n = parseInt(h, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

/* ============================================================
   资产
   ============================================================ */
function renderAssets() {
  var bal = L.currentBalances();
  var key = L.anchorKey();
  var endD = L.effEnd({ from: L.firstOfMonth(key), to: L.lastOfMonth(key) });
  var startD = L.addMonthsKey(key, -6);
  var curve = L.balanceCurve(L.firstOfMonth(startD), endD);
  var today = L.todayISO();
  var idx = curve.dates.indexOf(today) >= 0 ? curve.dates.indexOf(today) : curve.dates.length - 1;
  var m0 = Math.max(0, idx - 30);
  var prev = curve.net[m0] || 0;
  var delta = bal.net - prev;
  var rate = prev !== 0 ? delta / Math.abs(prev) : null;

  html($('#netCard'),
    '<div class="card-hd"><i class="dot"></i><b>净资产</b><span class="card-more">›</span></div>' +
    '<div style="display:flex;align-items:flex-end;gap:8px">' +
      '<div class="num" style="font-size:31px;font-weight:700;letter-spacing:-.02em;line-height:1.1;' +
        (bal.net < 0 ? 'color:var(--up)' : 'color:var(--gold)') + '">' + fmt(bal.net) + '</div>' +
      '<div style="padding-bottom:3px">' +
        '<span class="delta ' + (delta >= 0 ? 'down' : 'up') + '">' +
          (delta >= 0 ? '▲' : '▼') + ' ' + L.shortYuan(Math.abs(delta)) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="hint" style="margin:4px 0 12px">较 30 天前' + (rate != null ? ' · ' + L.pct(rate, 1) : '') + '</div>' +
    '<div class="stat-grid">' +
      '<div class="stat"><span class="lbl">总资产</span><b class="v sm">' + fmt(bal.asset) + '</b></div>' +
      '<div class="stat"><span class="lbl">总负债</span><b class="v sm" style="color:var(--ink2)">' + fmt(bal.debt) + '</b></div>' +
    '</div>');

  /* 构成 */
  var pos = [];
  S.accts.forEach(function (a) {
    var v = balanceOf(a.id);
    if (v > 0) pos.push({ name: a.name, amount: v, color: a.color });
  });
  pos.sort(function (a, b) { return b.amount - a.amount; });
  C.stackBarOne($('#cCompose'), pos, {});
  html($('#composeLegend'), pos.map(function (p) {
    return '<span><i style="background:' + p.color + '"></i>' + esc(p.name) + ' ' + L.pct(p.amount / (bal.asset || 1), 1) + '</span>';
  }).join(''));

  /* 账户列表 */
  var assets = S.accts.filter(function (a) { return a.type !== 'debt'; });
  var debts = S.accts.filter(function (a) { return a.type === 'debt'; });
  $('#acctSub').textContent = S.accts.length + ' 个账户';
  var out = '';
  function grp(title, arr) {
    if (!arr.length) return;
    out += '<div class="hint" style="margin:8px 2px 2px">' + title + '</div>';
    arr.forEach(function (a) {
      var v = balanceOf(a.id);
      var share = a.type === 'debt' ? 0 : v / (bal.asset || 1);
      out += '<div class="cat-row" data-acct="' + a.id + '">' +
        '<div class="cat-ic" style="background:' + hexA(a.color, .14) + ';color:' + a.color + '">' + (a.icon || '🏦') + '</div>' +
        '<div class="cat-mid"><div class="cat-nm"><b>' + esc(a.name) + '</b>' +
          '<span>' + esc(a.sub || '') + '</span></div>' +
          (a.type === 'debt' ? '' : '<div class="cat-bar"><i style="width:' + (share * 100).toFixed(1) + '%;background:' + a.color + '"></i></div>') +
        '</div>' +
        '<div class="cat-right"><div class="cat-l1"><b class="cat-amt" style="' + (v < 0 ? 'color:var(--up)' : '') + '">' + fmt(v) + '</b></div>' +
        '<div class="cat-l2">' + (a.type === 'debt' ? '负债' : L.pct(share, 1)) + '</div></div>' +
        '</div>';
    });
  }
  grp('资产账户', assets);
  grp('负债账户', debts);
  html($('#acctList'), out);
}

function balanceOf(acctId) {
  var key = L.anchorKey();
  var c = L.balanceCurve(L.earliestDate() || L.firstOfMonth(key), L.lastOfMonth(key));
  /* 用总额反推：直接用逐账户曲线成本高，这里单独算 */
  var bal = +L.acctById(acctId).opening || 0;
  S.txns.forEach(function (t) {
    if (t.date > L.lastOfMonth(key)) return;
    if (t.type === 'transfer') {
      if (t.acct === acctId) bal -= t.amount;
      if (t.toAcct === acctId) bal += t.amount;
    } else if (t.type === 'income') { if (t.acct === acctId) bal += t.amount; }
    else { if (t.acct === acctId) bal -= t.amount; }
  });
  return bal;
}

/* ============================================================
   统计
   ============================================================ */
/* 粒度自适应：范围越长，日柱子越密，自动切到周/月（用户手动点过就不再自动改） */
function autoGran() {
  if (S.granUser) return;
  var rg = L.resolveRange();
  var d = L.daysBetween(rg.from, L.effEnd(rg));
  S.gran = d > 400 ? 'month' : d > 75 ? 'week' : 'day';
}

function renderStats() {
  autoGran();
  var rg = L.resolveRange();
  var list = L.rangeTxns(rg);
  var s = L.summarize(list);
  var days = L.daysBetween(rg.from, L.effEnd(rg));

  var sb = $('#seedBanner');
  if (sb) {
    if (S.isSeed) {
      sb.innerHTML = '<div class="card" style="padding:12px 14px;display:flex;align-items:center;gap:10px;border-color:rgba(242,201,76,.28)">' +
        '<span style="font-size:17px">📥</span>' +
        '<div style="flex:1;min-width:0"><b style="font-size:12.5px">现在看到的是示例数据</b>' +
        '<div class="hint">导入记账 App 导出的表格，换成你自己的账单</div></div>' +
        '<div style="display:flex;flex-direction:column;gap:6px">' +
        '<button class="mini-btn on" data-open-import>导入</button>' +
        '<button class="mini-btn" data-wipe>清空</button></div></div>';
    } else {
      sb.innerHTML = '';
    }
  }

  $('#statRangeLabel').textContent = rg.label;
  $('#btnStatRange').textContent = rg.short + ' ▾';

  $('#sOut').textContent = fmt(s.out);
  $('#sIn').textContent = fmt(s.inc);
  var netEl = $('#sNet');
  netEl.textContent = fmt(s.net);
  netEl.className = 'v ' + (s.net > 0 ? 'down' : s.net < 0 ? 'up' : '');
  $('#sAvg').textContent = fmt(s.out / Math.max(1, days));

  $('#sRepay').textContent = fmt(s.repay);
  $('#sRecv').textContent = fmt(s.recv);

  /* 收支统计图 */
  var kind = S.segDaily;
  var data = L.bucketSeries({ from: rg.from, to: L.effEnd(rg) }, kind, S.gran);
  var avg = data.length ? L.sum(data, function (d) { return d.v; }) / data.length : 0;
  $('#dailyAvg').textContent = '平均 ' + L.yuan(Math.round(avg), 0);
  $$('[data-daily-gran]').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-daily-gran') === S.gran);
  });
  $$('#segDaily button').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-k') === kind);
  });

  var kindName = kind === 'income' ? '收入' : kind === 'net' ? '结余' : '支出';
  C.barDaily($('#cDaily'), data, {
    title: kindName,
    colorOf: function (d) {
      if (kind === 'income') return 'url(#gBarDn)';
      if (kind === 'net') return d.v >= 0 ? 'url(#gBarDn)' : 'url(#gBarUp)';
      return 'url(#gBarUp)';
    },
    tipHTML: function (d) {
      return '<h4>' + esc(d.label) + '</h4>' +
        '<div class="tr"><span>' + kindName + '</span><b>' + esc(L.yuan(d.v)) + '</b></div>' +
        (S.gran !== 'day' ? '<div class="tr"><span>日均</span><b>' + esc(L.yuan(d.v / Math.max(1, d.n))) + '</b></div>' : '');
    },
    onPick: function (d) {
      var el = $('#dailyChip');
      if (!d) { return; }
      el.innerHTML = esc(d.label) + ' <b>' + esc(L.yuan(d.v)) + '</b>';
    }
  });

  /* 环形图 */
  var catType = S.segCat;
  $('#donutTitle').textContent = catType === 'income' ? '收入分类详情' : '支出分类详情';
  var agg = L.catDelta(rg, catType);
  if (!S.donutAll) agg = agg.slice(0, 6);
  C.donut($('#cDonut'), agg.map(function (x) {
    return {
      name: x.name, amount: x.amount, color: x.color, count: x.count,
      delta: S.donutDelta ? x.delta : null
    };
  }), {
    title: '分类占比',
    centerLabel: catType === 'income' ? '总收入' : '总支出',
    delta: S.donutDelta
  });
  $$('#segCat button').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-k') === catType);
  });
  $('#btnDonutDelta').classList.toggle('on', S.donutDelta);
  $('#btnDonutAll').classList.toggle('on', S.donutAll);

  /* 分类排行 */
  var all = L.catDelta(rg, catType);
  $('#catListSub').textContent = all.length + ' 个分类';
  html($('#catList'), all.length ? all.map(function (x) {
    var d = x.delta || 0;
    var good = catType === 'income' ? d > 0 : d < 0;
    var dcls = d === 0 ? 'flat' : good ? 'down' : 'up';
    var arrow = d > 0 ? '▲' : d < 0 ? '▼' : '·';
    return '<div class="cat-row" data-catrow="' + x.id + '">' +
      '<div class="cat-ic" style="background:' + hexA(x.color, .14) + ';color:' + x.color + '">' + x.icon + '</div>' +
      '<div class="cat-mid">' +
        '<div class="cat-nm"><b>' + esc(x.name) + '</b><span>' + L.pct(x.pct) + '</span></div>' +
        '<div class="cat-bar"><i style="width:' + (x.pct * 100).toFixed(1) + '%;background:' + x.color + '"></i></div>' +
      '</div>' +
      '<div class="cat-right">' +
        '<div class="cat-l1">' +
          (Math.abs(d) >= 1 ? '<span class="delta ' + dcls + '">' + arrow + ' ¥' + L.shortYuan(Math.abs(d)) + '</span>' : '') +
          '<b class="cat-amt">' + fmt(x.amount) + '</b>' +
        '</div>' +
        '<div class="cat-l2">' + x.count + ' 笔</div>' +
      '</div></div>';
  }).join('') : '<div class="empty">本期没有' + (catType === 'income' ? '收入' : '支出') + '记录</div>');

  renderInsight(rg);
  renderBudgetMini();
}

function renderInsight(rg) {
  /* 月度收支 */
  var ms = L.monthlySeries(12);
  while (ms.length > 3 && !ms[0].inc && !ms[0].exp) ms.shift();
  $('#monthSub').textContent = '近 ' + ms.length + ' 个月';
  C.groupedBars($('#cMonthly'), ms, {});
  html($('#monthLegend'),
    '<span><i style="background:#4ecb8f"></i>收入</span>' +
    '<span><i style="background:#f0716a"></i>支出</span>' +
    '<span><i style="background:#f2c94c"></i>结余</span>');

  /* 储蓄率 */
  var withRate = ms.filter(function (m) { return m.rate != null; });
  $('#saveSub').textContent = withRate.length
    ? '近 ' + withRate.length + ' 月 · 平均 ' + L.pct(L.sum(withRate, function (m) { return m.rate; }) / withRate.length, 1)
    : '';
  C.rateLine($('#cSave'), ms, {});

  /* 日历 */
  var cal = L.calendarMonth(S.calKey);
  $('#calSub').textContent = L.cnMonth(S.calKey);
  C.calendarHeat($('#cCal'), cal, {});
  var cmax = cal.max || 1;
  html($('#calLegend'),
    '<span><i style="background:rgba(255,255,255,.07)"></i>无</span>' +
    '<span><i style="background:rgba(240,113,106,.38)"></i>' + L.shortYuan(cmax * .3) + '</span>' +
    '<span><i style="background:rgba(240,113,106,.68)"></i>' + L.shortYuan(cmax * .65) + '</span>' +
    '<span><i style="background:#f0716a"></i>' + L.shortYuan(cmax) + '</span>');

  /* 时段热力 */
  C.heatMatrix($('#cHeat'), L.heatGrid(L.rangeTxns(rg)), {});

  /* 分类趋势 */
  var ms6 = L.monthlySeries(6);
  var matrix = {}, totals = {};
  ms6.forEach(function (m) {
    var r2 = { from: L.firstOfMonth(m.key), to: L.lastOfMonth(m.key) };
    L.catAggregate(L.rangeTxns(r2), 'expense').items.forEach(function (it) {
      (matrix[it.id] = matrix[it.id] || [])[ms6.indexOf(m)] = it.amount;
      totals[it.id] = (totals[it.id] || 0) + it.amount;
    });
  });
  var topIds = Object.keys(totals).sort(function (a, b) { return totals[b] - totals[a]; }).slice(0, 5);
  var series = topIds.map(function (id) {
    var c = L.catById(id);
    return {
      name: c.name, color: c.color,
      values: ms6.map(function (_, i) { return (matrix[id] && matrix[id][i]) || 0; })
    };
  });
  if (topIds.length) {
    var rest = ms6.map(function (_, i) {
      var all = 0;
      Object.keys(matrix).forEach(function (id) { if (topIds.indexOf(id) < 0) all += (matrix[id][i] || 0); });
      return all;
    });
    if (L.sum(rest) > 0) series.push({ name: '其他', color: '#5a6270', values: rest });
    C.stackArea($('#cStackArea'), ms6, series, {});
    html($('#stackLegend'), series.map(function (s) {
      return '<span><i style="background:' + s.color + '"></i>' + esc(s.name) + '</span>';
    }).join(''));
  } else {
    C.emptyState($('#cStackArea'), '暂无数据', '');
  }

  /* 单笔 Top */
  var exps = L.rangeTxns(rg).filter(function (t) { return t.type === 'expense'; })
    .sort(function (a, b) { return b.amount - a.amount; }).slice(0, 5);
  html($('#topList'), exps.length ? exps.map(function (t, i) {
    var c = L.catById(t.cat);
    return '<div class="tx" data-tx="' + t.id + '">' +
      '<div class="tx-ic" style="background:' + hexA(c.color, .14) + ';color:' + c.color + ';font-size:13px;font-weight:700">' + (i + 1) + '</div>' +
      '<div class="tx-mid"><b>' + esc(t.note || c.name) + '</b>' +
        '<span>' + esc(c.name) + ' · ' + esc(t.date) + '</span></div>' +
      '<div class="tx-amt out">' + fmt(t.amount) + '</div></div>';
  }).join('') : '<div class="empty">本期没有支出</div>');
}

function renderBudgetMini() {
  var key = L.anchorKey();
  var b = L.budgetOf(key);
  var spent = L.monthExpense(key);
  $('#budgetSub').textContent = L.cnMonth(key);
  if (!b.total) {
    html($('#budgetMini'), '<div class="empty" style="padding:20px 10px">还没设置预算<br><em>点右上「管理」设一个月度上限</em></div>');
    return;
  }
  var p = spent / b.total;
  var color = p > 1 ? 'var(--up)' : p > 0.8 ? '#f2a13c' : 'var(--down)';
  html($('#budgetMini'),
    '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">' +
      '<b class="num" style="font-size:22px">' + fmt(spent) + '</b>' +
      '<span class="hint">/ ' + fmt(b.total) + '</span>' +
      '<span class="badge ' + (p > 1 ? 'red' : p > .8 ? 'gold' : 'green') + '" style="margin-left:auto">' +
        (p > 1 ? '超支 ' + L.pct(p - 1, 1) : '剩余 ' + L.pct(1 - p, 1)) + '</span>' +
    '</div>' +
    '<div class="prog"><i style="width:' + Math.min(100, p * 100).toFixed(1) + '%;background:' + color + '"></i></div>');
}

/* ============================================================
   预算
   ============================================================ */
function renderBudget() {
  var key = L.anchorKey();
  var b = L.budgetOf(key);
  var spent = L.monthExpense(key);
  var total = b.total || 0;
  var p = total ? spent / total : 0;
  var days = new Date(+key.slice(0, 4), +key.slice(5, 7), 0).getDate();
  var passed = L.monthKey(L.todayISO()) === key ? new Date().getDate() : days;
  var left = total - spent;
  var perDay = left > 0 ? left / Math.max(1, days - passed) : 0;

  $('#budgetMonthLabel').textContent = L.cnMonth(key) + ' · 第 ' + passed + '/' + days + ' 天';

  html($('#budgetHero'),
    '<div class="card-hd"><i class="dot"></i><b>本月预算</b><span class="card-more">›</span></div>' +
    '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:10px">' +
      '<div><div class="hint">已用</div>' +
        '<div class="num" style="font-size:29px;font-weight:700;line-height:1.15">' + fmt(spent) + '</div></div>' +
      '<div style="text-align:right"><div class="hint">预算</div>' +
        '<div class="num" style="font-size:17px;color:var(--ink2)">' + (total ? fmt(total) : '未设置') + '</div></div>' +
    '</div>' +
    '<div class="prog" style="height:9px;margin:12px 0 8px">' +
      '<i style="width:' + Math.min(100, p * 100).toFixed(1) + '%;background:' +
      (p > 1 ? 'var(--up)' : p > .8 ? '#f2a13c' : 'linear-gradient(90deg,#4ecb8f,#7fd6b8)') + '"></i></div>' +
    '<div class="stat-grid" style="margin-top:12px">' +
      '<div class="stat"><span class="lbl">' + (left >= 0 ? '剩余' : '超支') + '</span>' +
        '<b class="v sm ' + (left >= 0 ? 'down' : 'up') + '">' + fmt(Math.abs(left)) + '</b></div>' +
      '<div class="stat"><span class="lbl">日均可用</span><b class="v sm">' + (left > 0 ? fmt(perDay) : '—') + '</b></div>' +
    '</div>' +
    (total && p > 1 ? '<div class="hint" style="margin-top:8px;color:var(--up)">已超出预算 ' + L.pct(p - 1, 1) + '，建议从下一档非必要支出里找回来。</div>' : ''));

  /* 分类预算 */
  var catB = (b.cats || {});
  var ids = Object.keys(catB).filter(function (k) { return catB[k] > 0; });
  var rg = { from: L.firstOfMonth(key), to: L.lastOfMonth(key) };
  var spentMap = {};
  L.catAggregate(L.rangeTxns(rg), 'expense').items.forEach(function (it) { spentMap[it.id] = it.amount; });
  $('#catBudgetSub').textContent = ids.length + ' 项';
  html($('#catBudgets'), ids.length ? ids.map(function (id) {
    var c = L.catById(id), lim = catB[id], used = spentMap[id] || 0;
    var r = used / lim;
    return '<div style="padding:9px 2px;border-bottom:1px solid var(--line)">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<span style="font-size:14px">' + c.icon + '</span>' +
        '<b style="font-size:13px">' + esc(c.name) + '</b>' +
        '<span class="hint" style="margin-left:auto">' + fmt(used) + ' / ' + fmt(lim) + '</span>' +
        '<span class="badge ' + (r > 1 ? 'red' : r > .8 ? 'gold' : '') + '">' + L.pct(r, 0) + '</span>' +
      '</div>' +
      '<div class="prog thin"><i style="width:' + Math.min(100, r * 100).toFixed(1) + '%;background:' +
        (r > 1 ? 'var(--up)' : r > .8 ? '#f2a13c' : c.color) + '"></i></div>' +
      '</div>';
  }).join('') : '<div class="empty">还没有设分类预算<br><em>点右上 ✎ 添加</em></div>');

  /* 固定支出 */
  var recs = S.recurring.slice().sort(function (a, b) { return a.day - b.day; });
  var todayD = new Date().getDate();
  var isCur = L.monthKey(L.todayISO()) === key;
  html($('#recurList'), recs.length ? recs.map(function (r) {
    var c = L.catById(r.cat);
    var done = isCur ? todayD >= r.day : true;
    return '<div class="cat-row" data-recur="' + r.id + '">' +
      '<div class="cat-ic" style="background:' + hexA(c.color, .14) + ';color:' + c.color + '">' + c.icon + '</div>' +
      '<div class="cat-mid"><div class="cat-nm"><b>' + esc(r.name) + '</b>' +
        '<span>每月 ' + r.day + ' 日</span></div>' +
        '<div class="cat-l2" style="text-align:left;margin-top:2px;color:' + (done ? 'var(--ink3)' : 'var(--gold)') + '">' +
        (done ? '本月已扣' : '还有 ' + (r.day - todayD) + ' 天') + '</div></div>' +
      '<div class="cat-right"><div class="cat-l1"><b class="cat-amt">' + fmt(r.amount) + '</b></div>' +
        '<div class="cat-l2">固定</div></div></div>';
  }).join('') : '<div class="empty">没有固定支出<br><em>点右上 ＋ 添加房贷、会员等</em></div>');
}

/* ============================================================
   我的
   ============================================================ */
/* 史高治金币：外圈压纹 + ¢ */
var COIN_ICON = '<svg viewBox="0 0 64 64" width="31" height="31" aria-hidden="true">' +
  '<defs><radialGradient id="cg1" cx="33%" cy="26%" r="78%">' +
    '<stop offset="0" stop-color="#fdf0b8"/><stop offset="0.45" stop-color="#f2c94c"/>' +
    '<stop offset="1" stop-color="#a8791a"/></radialGradient></defs>' +
  '<circle cx="32" cy="32" r="30" fill="url(#cg1)"/>' +
  '<circle cx="32" cy="32" r="23.5" fill="none" stroke="#7d5a0c" stroke-opacity=".38" stroke-width="2"/>' +
  '<text x="32" y="43" font-family="Georgia,serif" font-size="27" font-weight="700" ' +
    'text-anchor="middle" fill="#6b4a08" fill-opacity=".78">¢</text></svg>';

function renderMe() {
  var n = S.txns.length;
  var first = L.earliestDate() || L.todayISO();
  var used = Math.max(1, L.daysBetween(first, L.todayISO()));
  html($('#meHero'),
    '<div style="display:flex;align-items:center;gap:12px">' +
      '<div class="coin-badge">' + COIN_ICON + '</div>' +
      '<div style="flex:1;min-width:0"><b style="font-size:15px">史高治账本</b>' +
        '<div class="hint">' + n + ' 笔记录 · 从 ' + first.slice(0, 7).replace('-', '.') + ' 开始</div></div>' +
      '<div style="text-align:right"><div class="num" style="font-size:19px;font-weight:700">' + used + '</div>' +
        '<div class="hint">天</div></div>' +
    '</div>');

  /* 分类管理 */
  var mtype = S.mgrType || 'expense';
  $$('#segMgrCat button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-k') === mtype); });
  var cats = S.cats.filter(function (c) { return c.type === mtype; });
  $('#mgCatSub').textContent = cats.length + ' 个';
  html($('#catMgrList'), cats.map(function (c) {
    var cnt = 0;
    S.txns.forEach(function (t) { if (t.cat === c.id) cnt++; });
    return '<div class="cat-row" data-mgcat="' + c.id + '">' +
      '<div class="cat-ic" style="background:' + hexA(c.color, .14) + ';color:' + c.color + '">' + c.icon + '</div>' +
      '<div class="cat-mid"><div class="cat-nm"><b>' + esc(c.name) + '</b></div>' +
        '<div class="cat-l2" style="text-align:left;margin-top:1px">' + cnt + ' 笔</div></div>' +
      '<div class="cat-right"><span class="hint">编辑 ›</span></div></div>';
  }).join(''));

  /* 账户管理 */
  $('#mgAcctSub').textContent = S.accts.length + ' 个';
  html($('#acctMgrList'), S.accts.map(function (a) {
    return '<div class="cat-row" data-mgacct="' + a.id + '">' +
      '<div class="cat-ic" style="background:' + hexA(a.color, .14) + ';color:' + a.color + '">' + (a.icon || '🏦') + '</div>' +
      '<div class="cat-mid"><div class="cat-nm"><b>' + esc(a.name) + '</b><span>' + esc(a.sub || '') + '</span></div>' +
        '<div class="cat-l2" style="text-align:left;margin-top:1px">期初 ' + fmt(a.opening) + '</div></div>' +
      '<div class="cat-right"><div class="cat-l1"><b class="cat-amt">' + fmt(balanceOf(a.id)) + '</b></div>' +
        '<div class="cat-l2">' + (a.type === 'debt' ? '负债' : '资产') + '</div></div></div>';
  }).join(''));

  /* 数据 */
  $('#dataCount').textContent = n + ' 条';
  var bytes = 0;
  try { bytes = JSON.stringify({ t: S.txns, c: S.cats, a: S.accts }).length; } catch (e) { }
  $('#dataSize').textContent = (bytes / 1024).toFixed(1) + ' KB';
  $('#dataFrom').textContent = L.earliestDate() || '—';
  $('#dataWhere').textContent = L.Store.ok ? '浏览器本地存储' : '临时内存（关页即失）';
  $('#dataWhere').style.color = L.Store.ok ? '' : 'var(--up)';
  $('#appVer').textContent = L.APP_VERSION;
}

/* ============================================================
   调度
   ============================================================ */
var _rendering = false;
function renderAll() {
  if (_rendering) return;
  _rendering = true;
  try {
    if (S.tab === 'ledger') renderLedger();
    else if (S.tab === 'assets') renderAssets();
    else if (S.tab === 'stats') renderStats();
    else if (S.tab === 'budget') renderBudget();
    else if (S.tab === 'me') renderMe();
  } finally { _rendering = false; }
}

function switchTab(tab) {
  S.tab = tab;
  $$('.screen').forEach(function (s) { s.classList.remove('on'); });
  var el = $('#sc-' + tab);
  if (el) el.classList.add('on');
  $$('.tab').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === tab); });
  window.scrollTo(0, 0);
  renderAll();
}

window.__V = {
  renderAll: renderAll, renderLedger: renderLedger, renderAssets: renderAssets,
  renderStats: renderStats, renderBudget: renderBudget, renderMe: renderMe,
  switchTab: switchTab, txRow: txRow, hexA: hexA, balanceOf: balanceOf
};
})();
