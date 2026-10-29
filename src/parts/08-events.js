/* ============================================================
   史高治账本 · 交互
   ============================================================ */
(function () {
'use strict';

var L = window.__L, C = window.__C, V = window.__V, IMP = window.__IMP;
var S = L.S;
var $ = L.$, $$ = L.$$, esc = L.esc;

/* ---------------- 弹层 ---------------- */
var opened = null;
function openSheet(id) {
  var el = $(id);
  if (!el) return;
  if (opened && opened !== el) opened.classList.remove('on');
  opened = el;
  $('#backdrop').classList.add('on');
  el.classList.add('on');
  el.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  if (opened) opened.classList.remove('on');
  opened = null;
  $('#backdrop').classList.remove('on');
  document.body.style.overflow = '';
}
$('#backdrop').addEventListener('click', closeSheet);
document.addEventListener('click', function (e) {
  var b = e.target.closest && e.target.closest('[data-close]');
  if (b) closeSheet();
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && opened) closeSheet();
});

/* ---------------- toast ---------------- */
var toastTimer = null;
function toast(msg) {
  var t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2000);
}

/* ---------------- 通用选项列表 ---------------- */
function pickList(title, items, onPick) {
  $('#pickTitle').textContent = title;
  $('#pickBody').innerHTML = items.map(function (it, i) {
    return '<button class="pick-item" data-pick="' + i + '">' +
      '<span>' + esc(it.label) + '</span>' +
      (it.note ? '<em>' + esc(it.note) + '</em>' : '') + '</button>';
  }).join('');
  $$('#pickBody .pick-item').forEach(function (b) {
    b.onclick = function () {
      var it = items[+b.getAttribute('data-pick')];
      closeSheet();
      onPick(it);
    };
  });
  openSheet('#shPick');
}

/* ---------------- 主题 ---------------- */
function applyTheme() {
  var light = S.theme === 'light';
  document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
  var m = document.querySelector('meta[name="color-scheme"]');
  if (m) m.setAttribute('content', light ? 'light dark' : 'dark light');
  var tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.setAttribute('content', light ? '#f4f6fa' : '#08090b');
}
$('#btnTheme').addEventListener('click', function () {
  S.theme = S.theme === 'light' ? 'dark' : 'light';
  applyTheme();
  L.persist();
  L.hideTips = null;
  C.hideTips(null);
  V.renderAll();
  toast(S.theme === 'light' ? '已切换浅色' : '已切换深色');
});

/* ---------------- 标签页 ---------------- */
$$('.tab').forEach(function (b) {
  b.addEventListener('click', function () { V.switchTab(b.getAttribute('data-tab')); });
});
document.addEventListener('click', function (e) {
  var g = e.target.closest && e.target.closest('[data-go]');
  if (g) V.switchTab(g.getAttribute('data-go'));
});

/* ============================================================
   记一笔
   ============================================================ */
var draft = null;

function newDraft(type) {
  return {
    id: null,
    type: type || 'expense',
    digits: '0',
    cat: '',
    acct: (S.accts[0] || {}).id || '',
    toAcct: (S.accts[1] || S.accts[0] || {}).id || '',
    date: L.todayISO(),
    time: L.pad2(new Date().getHours()) + ':' + L.pad2(new Date().getMinutes()),
    note: '',
    tags: ''
  };
}

function amountVal() {
  var n = parseInt(draft.digits || '0', 10);
  if (!isFinite(n)) n = 0;
  return n / 100;
}

function paintAmount() {
  $('#amountView').innerHTML = '<span class="cur">¥</span>' + L.num(amountVal(), 2);
}

function paintTxSheet() {
  $('#txSheetTitle').textContent = draft.id ? '编辑记录' : '记一笔';
  $('#btnSaveTx').textContent = draft.id ? '保存修改' : '保存';
  $('#btnTxCancel').textContent = draft.id ? '删除' : '取消';
  $('#btnTxCancel').className = 'btn ' + (draft.id ? 'danger' : 'ghost');

  $$('#txTypeSw button').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-type') === draft.type);
  });
  var isTf = draft.type === 'transfer';
  $('#catField').hidden = isTf;
  $('#toAcctField').hidden = !isTf;
  $('#acctLb').textContent = isTf ? '转出账户' : '账户';

  /* 分类 */
  var cats = S.cats.filter(function (c) { return c.type === (draft.type === 'income' ? 'income' : 'expense'); });
  if (!draft.cat && cats.length) draft.cat = cats[0].id;
  $('#catPick').innerHTML = cats.map(function (c) {
    return '<button data-cat="' + c.id + '" class="' + (c.id === draft.cat ? 'on' : '') + '">' +
      '<i>' + c.icon + '</i><span>' + esc(c.name) + '</span></button>';
  }).join('');
  $$('#catPick button').forEach(function (b) {
    b.onclick = function () {
      draft.cat = b.getAttribute('data-cat');
      $$('#catPick button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
    };
  });

  /* 账户 */
  $('#acctPick').innerHTML = S.accts.map(function (a) {
    return '<button data-acct="' + a.id + '" class="' + (a.id === draft.acct ? 'on' : '') + '">' +
      '<i>' + (a.icon || '🏦') + '</i><span>' + esc(a.name) + '</span></button>';
  }).join('');
  $$('#acctPick button').forEach(function (b) {
    b.onclick = function () {
      draft.acct = b.getAttribute('data-acct');
      $$('#acctPick button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
    };
  });

  var opt = S.accts.map(function (a) {
    return '<option value="' + a.id + '"' + (a.id === draft.toAcct ? ' selected' : '') + '>' + esc(a.name) + '</option>';
  }).join('');
  $('#toAcctSel').innerHTML = opt;
  $('#toAcctSel').onchange = function () { draft.toAcct = this.value; };

  $('#txDate').value = draft.date;
  $('#txTime').value = draft.time;
  $('#txNote').value = draft.note;
  $('#txTags').value = draft.tags;

  paintAmount();
}

function openTx(id) {
  if (id) {
    var t = null;
    S.txns.forEach(function (x) { if (x.id === id) t = x; });
    if (!t) return;
    draft = {
      id: t.id, type: t.type,
      digits: String(Math.round(t.amount * 100)),
      cat: t.cat, acct: t.acct, toAcct: t.toAcct || '',
      date: t.date, time: t.time || '12:00',
      note: t.note || '', tags: (t.tags || []).join(',')
    };
    if (draft.type === 'transfer') draft.cat = '';
  } else {
    draft = newDraft(S.lastType || 'expense');
  }
  paintTxSheet();
  openSheet('#shTx');
}

$('#fabAdd').addEventListener('click', function () { openTx(null); });

$$('#txTypeSw button').forEach(function (b) {
  b.addEventListener('click', function () {
    draft.type = b.getAttribute('data-type');
    if (draft.type === 'transfer') draft.toAcct = draft.toAcct || (S.accts[1] || {}).id;
    else draft.cat = '';
    paintTxSheet();
  });
});

$('#padKeys').addEventListener('click', function (e) {
  var b = e.target.closest('button');
  if (!b) return;
  var k = b.getAttribute('data-k');
  var d = draft.digits;
  if (k === 'del') { d = d.length <= 1 ? '0' : d.slice(0, -1); }
  else if (k === 'done') { saveTx(); return; }
  else if (k === '.') { /* 自动两位小数，忽略 */ }
  else {
    if (d === '0') d = '';
    if (d.length >= 9) return;
    if (k === '00' && d === '') d = '0';
    else d += k;
  }
  draft.digits = d || '0';
  paintAmount();
  $('#amountView').classList.remove('blink');
});

$('#txDate').addEventListener('change', function () { draft.date = this.value; });
$('#txTime').addEventListener('change', function () { draft.time = this.value; });
$('#txNote').addEventListener('input', function () { draft.note = this.value; });
$('#txTags').addEventListener('input', function () { draft.tags = this.value; });

$('#btnTxCancel').addEventListener('click', function () {
  if (!draft.id) { closeSheet(); return; }
  S.txns = S.txns.filter(function (t) { return t.id !== draft.id; });
  L.persist();
  closeSheet();
  V.renderAll();
  toast('已删除');
});

function saveTx() {
  var amt = amountVal();
  if (amt <= 0) { toast('请输入金额'); return; }
  var isTf = draft.type === 'transfer';
  if (!isTf && !draft.cat) { toast('请选择分类'); return; }
  if (isTf && (!draft.toAcct || draft.toAcct === draft.acct)) { toast('转出与转入账户不能相同'); return; }

  var tags = draft.tags.split(/[,，;；\s]+/).filter(Boolean);
  var base = {
    type: draft.type,
    amount: amt,
    date: draft.date || L.todayISO(),
    time: draft.time || '12:00',
    acct: draft.acct,
    note: (draft.note || '').trim(),
    tags: tags
  };
  if (isTf) { base.toAcct = draft.toAcct; base.cat = ''; }
  else base.cat = draft.cat;

  if (draft.id) {
    S.txns.forEach(function (t, i) {
      if (t.id === draft.id) S.txns[i] = Object.assign({}, t, base);
    });
  } else {
    base.id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
    S.txns.push(base);
  }
  S.lastType = draft.type;
  L.persist();
  closeSheet();
  S.calKey = S.calKey || L.monthKey(base.date);
  V.renderAll();
  toast(draft.id ? '已保存' : '记好了 · ' + L.yuan(amt));
}

$('#btnSaveTx').addEventListener('click', saveTx);

/* 明细点击 → 编辑 */
document.addEventListener('click', function (e) {
  var t = e.target.closest && e.target.closest('[data-tx]');
  if (t) { openTx(t.getAttribute('data-tx')); return; }

  var cr = e.target.closest && e.target.closest('[data-catrow]');
  if (cr) {
    var cid = cr.getAttribute('data-catrow');
    var rg = L.resolveRange();
    var list = L.rangeTxns(rg).filter(function (x) { return x.cat === cid; })
      .sort(function (a, b) { return b.amount - a.amount; });
    S.tab = 'ledger'; V.switchTab('ledger');
    S.ledgerFilter = 'all'; S.ledgerSearch = '';
    S.ledgerMonth = L.monthKey(list[0] ? list[0].date : L.latestDate());
    V.renderAll();
    toast('已跳到「' + L.catById(cid).name + '」最近一条所在月份');
    return;
  }

  var oi = e.target.closest && e.target.closest('[data-open-import]');
  if (oi) { $('#fileImport').click(); return; }

});

/* ============================================================
   账本页交互
   ============================================================ */
$$('[data-ledger-filter]').forEach(function (b) {
  b.addEventListener('click', function () {
    S.ledgerFilter = b.getAttribute('data-ledger-filter');
    V.renderLedger();
  });
});
$('#btnLedgerSearch').addEventListener('click', function () {
  var w = $('#ledgerSearchWrap');
  w.hidden = !w.hidden;
  if (!w.hidden) $('#ledgerSearch').focus();
  else { S.ledgerSearch = ''; $('#ledgerSearch').value = ''; V.renderLedger(); }
});
$('#ledgerSearch').addEventListener('input', function () {
  S.ledgerSearch = this.value.trim();
  V.renderLedger();
});
$('#btnSearchClose').addEventListener('click', function () {
  $('#ledgerSearchWrap').hidden = true;
  S.ledgerSearch = ''; $('#ledgerSearch').value = '';
  V.renderLedger();
});

function monthPicker() {
  var key = L.anchorKey();
  var items = [];
  for (var i = 0; i < 18; i++) {
    var k = L.addMonthsKey(key, -i);
    var rg = { from: L.firstOfMonth(k), to: L.lastOfMonth(k) };
    var s = L.summarize(L.rangeTxns(rg));
    items.push({ label: L.cnMonth(k), note: s.n ? s.n + ' 笔 · 支出 ' + L.yuan(s.out, 0) : '无记录', key: k });
  }
  pickList('选择月份', items, function (it) {
    S.ledgerMonth = it.key;
    if (S.tab !== 'ledger') V.switchTab('ledger');
    else V.renderLedger();
  });
}
$('#btnLedgerMonth').addEventListener('click', monthPicker);
$('#btnMonthPick').addEventListener('click', monthPicker);

/* 明细排序：默认（按日期）→ 金额从大到小 → 金额从小到大 → 回到默认 */
$('#btnLedgerSort').addEventListener('click', function () {
  var order = ['', 'desc', 'asc'];
  var tips = ['已恢复默认排序（按日期）', '金额：从大到小', '金额：从小到大'];
  var i = order.indexOf(S.ledgerSort || '');
  i = (i + 1) % order.length;
  S.ledgerSort = order[i];
  V.renderLedger();
  toast(tips[i]);
});

/* ============================================================
   统计页交互
   ============================================================ */
$('#btnStatFilter').addEventListener('click', function () { openFilter(); });

/* 统计页顶部：周 / 月 / 年 / 全部 / 范围 */
$$('#segRange button').forEach(function (b) {
  b.addEventListener('click', function () {
    var r = b.getAttribute('data-r');
    if (r === 'custom') { openFilter(); return; }
    /* 切回快捷范围时要清掉自定义区间，否则 resolveRange 会一直返回自定义 */
    S.f.from = ''; S.f.to = '';
    S.range = r;
    S.rangeOff = 0;
    V.renderStats();
  });
});
$('#navPrev').addEventListener('click', function () {
  S.rangeOff = (S.rangeOff || 0) - 1;
  V.renderStats();
});
$('#navNext').addEventListener('click', function () {
  var o = (S.rangeOff || 0) + 1;
  S.rangeOff = o > 0 ? 0 : o;
  V.renderStats();
});

$$('#segDaily button').forEach(function (b) {
  b.addEventListener('click', function () {
    S.segDaily = b.getAttribute('data-k');
    V.renderStats();
  });
});
$$('[data-daily-gran]').forEach(function (b) {
  b.addEventListener('click', function () {
    S.gran = b.getAttribute('data-daily-gran');
    S.granUser = true;
    V.renderStats();
  });
});
$$('#segCat button').forEach(function (b) {
  b.addEventListener('click', function () {
    S.segCat = b.getAttribute('data-k');
    V.renderStats();
  });
});
$('#btnDonutDelta').addEventListener('click', function () {
  S.donutDelta = !S.donutDelta;
  V.renderStats();
});
$('#btnDonutAll').addEventListener('click', function () {
  S.donutAll = !S.donutAll;
  V.renderStats();
});
$$('[data-cal-step]').forEach(function (b) {
  b.addEventListener('click', function () {
    S.calKey = L.addMonthsKey(S.calKey || L.anchorKey(), +b.getAttribute('data-cal-step'));
    V.renderStats();
  });
});

/* ============================================================
   筛选
   ============================================================ */
var fTmp = null;
function openFilter() {
  fTmp = {
    from: S.f.from, to: S.f.to,
    accts: S.f.accts.slice(), cats: S.f.cats.slice(), tags: S.f.tags.slice(),
    range: S.range
  };
  $('#fFrom').value = fTmp.from || '';
  $('#fTo').value = fTmp.to || '';
  paintFilter();
  openSheet('#shFilter');
}
function paintFilter() {
  if (!fTmp) return;
  $$('#fRange button').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-r') === fTmp.range);
  });
  $('#fAccts').innerHTML = S.accts.map(function (a) {
    return '<button class="tg ' + (fTmp.accts.indexOf(a.id) >= 0 ? 'gold' : '') + '" data-fa="' + a.id + '">' + esc(a.name) + '</button>';
  }).join('');
  var cats = S.cats.filter(function (c) { return c.type === 'expense'; });
  $('#fCats').innerHTML = cats.map(function (c) {
    return '<button class="tg ' + (fTmp.cats.indexOf(c.id) >= 0 ? 'gold' : '') + '" data-fc="' + c.id + '">' + c.icon + ' ' + esc(c.name) + '</button>';
  }).join('');
  var tagSet = {};
  S.txns.forEach(function (t) { (t.tags || []).forEach(function (g) { tagSet[g] = (tagSet[g] || 0) + 1; }); });
  var tags = Object.keys(tagSet).sort(function (a, b) { return tagSet[b] - tagSet[a]; }).slice(0, 14);
  $('#fTags').innerHTML = tags.length ? tags.map(function (g) {
    return '<button class="tg ' + (fTmp.tags.indexOf(g) >= 0 ? 'gold' : '') + '" data-ft="' + esc(g) + '">' + esc(g) + '</button>';
  }).join('') : '<span class="hint">还没有用过标签</span>';

  $$('#fAccts [data-fa]').forEach(function (b) { b.onclick = function () { toggle(fTmp.accts, b.getAttribute('data-fa')); paintFilter(); }; });
  $$('#fCats [data-fc]').forEach(function (b) { b.onclick = function () { toggle(fTmp.cats, b.getAttribute('data-fc')); paintFilter(); }; });
  $$('#fTags [data-ft]').forEach(function (b) { b.onclick = function () { toggle(fTmp.tags, b.getAttribute('data-ft')); paintFilter(); }; });
  $$('#fRange button').forEach(function (b) {
    b.onclick = function () { fTmp.range = b.getAttribute('data-r'); paintFilter(); };
  });
}
function toggle(arr, v) {
  var i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1); else arr.push(v);
}
$('#btnFilterApply').addEventListener('click', function () {
  S.f.from = $('#fFrom').value || '';
  S.f.to = $('#fTo').value || '';
  if (S.f.from && S.f.to && S.f.from > S.f.to) { var t = S.f.from; S.f.from = S.f.to; S.f.to = t; }
  S.range = fTmp.range;
  S.rangeOff = 0;
  S.f.accts = fTmp.accts; S.f.cats = fTmp.cats; S.f.tags = fTmp.tags;
  closeSheet();
  V.renderStats();
  var extra = [];
  if (S.f.accts.length) extra.push(S.f.accts.length + ' 个账户');
  if (S.f.cats.length) extra.push(S.f.cats.length + ' 个分类');
  if (S.f.tags.length) extra.push(S.f.tags.length + ' 个标签');
  toast(extra.length ? '已筛选：' + extra.join(' · ') : '已应用');
});
$('#btnFilterReset').addEventListener('click', function () {
  fTmp = { from: '', to: '', accts: [], cats: [], tags: [], range: 'month' };
  $('#fFrom').value = ''; $('#fTo').value = '';
  paintFilter();
});

/* ============================================================
   资产
   ============================================================ */
$('#btnAddAcct').addEventListener('click', function () { openAcct(null); });
$('#btnTransfer').addEventListener('click', function () {
  draft = newDraft('transfer');
  paintTxSheet();
  openSheet('#shTx');
});

/* ============================================================
   分类编辑
   ============================================================ */
var catDraft = null;
function openCat(id, type) {
  if (id) {
    var c = L.catById(id);
    catDraft = { id: id, name: c.name, type: c.type, icon: c.icon, color: c.color };
  } else {
    catDraft = { id: null, name: '', type: type || 'expense', icon: '✨', color: L.PALETTE[S.cats.length % L.PALETTE.length] };
  }
  $('#catSheetTitle').textContent = catDraft.id ? '编辑分类' : '新建分类';
  $('#catName').value = catDraft.name;
  $('#btnCatDel').hidden = !catDraft.id;
  paintCatSheet();
  openSheet('#shCat');
}
function paintCatSheet() {
  $$('#catTypeSw button').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-t') === catDraft.type);
    b.onclick = function () { catDraft.type = b.getAttribute('data-t'); paintCatSheet(); };
  });
  $('#catIcons').innerHTML = L.ICONS.map(function (ic) {
    return '<button class="tg ' + (ic === catDraft.icon ? 'gold' : '') + '" data-ic="' + ic + '" style="font-size:15px">' + ic + '</button>';
  }).join('');
  $$('#catIcons [data-ic]').forEach(function (b) {
    b.onclick = function () { catDraft.icon = b.getAttribute('data-ic'); paintCatSheet(); };
  });
  $('#catColors').innerHTML = L.PALETTE.map(function (co) {
    return '<button data-co="' + co + '" style="width:26px;height:26px;border-radius:8px;border:2px solid ' +
      (co === catDraft.color ? '#fff' : 'transparent') + ';background:' + co + '"></button>';
  }).join('');
  $$('#catColors [data-co]').forEach(function (b) {
    b.onclick = function () { catDraft.color = b.getAttribute('data-co'); paintCatSheet(); };
  });
  var b = L.budgetOf(L.anchorKey()).cats || {};
  var v = catDraft.id ? (b[catDraft.id] || '') : '';
  $('#catBudget').value = v || '';
  $('#catBudgetField').hidden = catDraft.type !== 'expense';
}
$('#btnCatSave').addEventListener('click', function () {
  var name = ($('#catName').value || '').trim();
  if (!name) { toast('请填分类名'); return; }
  if (catDraft.id) {
    S.cats.forEach(function (c, i) {
      if (c.id === catDraft.id) {
        S.cats[i] = Object.assign({}, c, { name: name, icon: catDraft.icon, color: catDraft.color });
      }
    });
  } else {
    S.cats.push({
      id: 'c' + Date.now().toString(36),
      name: name, type: catDraft.type, icon: catDraft.icon, color: catDraft.color
    });
  }
  var bv = parseFloat($('#catBudget').value);
  if (catDraft.id && catDraft.type === 'expense') {
    var key = L.anchorKey();
    if (!S.budgets[key]) S.budgets[key] = { total: 0, cats: {} };
    if (!S.budgets[key].cats) S.budgets[key].cats = {};
    if (bv > 0) S.budgets[key].cats[catDraft.id] = bv;
    else delete S.budgets[key].cats[catDraft.id];
  }
  L.persist();
  closeSheet();
  V.renderAll();
  toast('已保存');
});
$('#btnCatDel').addEventListener('click', function () {
  var used = S.txns.filter(function (t) { return t.cat === catDraft.id; }).length;
  if (used && !confirm('这个分类下还有 ' + used + ' 笔记录，删除后这些记录会变成「未分类」。确定删除？')) return;
  S.txns.forEach(function (t) { if (t.cat === catDraft.id) t.cat = ''; });
  S.cats = S.cats.filter(function (c) { return c.id !== catDraft.id; });
  L.persist();
  closeSheet();
  V.renderAll();
  toast('已删除');
});
$$('#segMgrCat button').forEach(function (b) {
  b.addEventListener('click', function () {
    S.mgrType = b.getAttribute('data-k');
    V.renderMe();
  });
});

/* ============================================================
   账户编辑
   ============================================================ */
var acctDraft = null;
function openAcct(id) {
  if (id) {
    var a = L.acctById(id);
    acctDraft = { id: id, name: a.name, sub: a.sub || '', type: a.type, opening: a.opening || 0, icon: a.icon || '🏦', color: a.color };
  } else {
    acctDraft = { id: null, name: '', sub: '', type: 'asset', opening: 0, icon: '🏦', color: L.PALETTE[S.accts.length % L.PALETTE.length] };
  }
  $('#acctSheetTitle').textContent = acctDraft.id ? '编辑账户' : '新建账户';
  $('#acctName').value = acctDraft.name;
  $('#acctSubInput').value = acctDraft.sub;
  $('#acctOpening').value = acctDraft.opening;
  $('#btnAcctDel').hidden = !acctDraft.id;
  paintAcctSheet();
  openSheet('#shAcct');
}
function paintAcctSheet() {
  $$('#acctTypeSw button').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-t') === acctDraft.type);
    b.onclick = function () { acctDraft.type = b.getAttribute('data-t'); paintAcctSheet(); };
  });
  var icons = ['🏦', '💳', '💰', '💵', '🅰️', '💬', '📈', '📊', '🏠', '🚗', '🎁', '🧾'];
  $('#acctIcons').innerHTML = icons.map(function (ic) {
    return '<button class="tg ' + (ic === acctDraft.icon ? 'gold' : '') + '" data-ai="' + ic + '" style="font-size:15px">' + ic + '</button>';
  }).join('');
  $$('#acctIcons [data-ai]').forEach(function (b) {
    b.onclick = function () { acctDraft.icon = b.getAttribute('data-ai'); paintAcctSheet(); };
  });
  $('#acctColors').innerHTML = L.PALETTE.map(function (co) {
    return '<button data-ac="' + co + '" style="width:26px;height:26px;border-radius:8px;border:2px solid ' +
      (co === acctDraft.color ? '#fff' : 'transparent') + ';background:' + co + '"></button>';
  }).join('');
  $$('#acctColors [data-ac]').forEach(function (b) {
    b.onclick = function () { acctDraft.color = b.getAttribute('data-ac'); paintAcctSheet(); };
  });
}
$('#btnAcctSave').addEventListener('click', function () {
  var name = ($('#acctName').value || '').trim();
  if (!name) { toast('请填账户名'); return; }
  var opening = parseFloat($('#acctOpening').value) || 0;
  if (acctDraft.type === 'debt') opening = -Math.abs(opening);
  var o = {
    name: name, sub: ($('#acctSubInput').value || '').trim(), type: acctDraft.type,
    opening: opening, icon: acctDraft.icon, color: acctDraft.color
  };
  if (acctDraft.id) {
    S.accts.forEach(function (a, i) { if (a.id === acctDraft.id) S.accts[i] = Object.assign({}, a, o); });
  } else {
    o.id = 'a' + Date.now().toString(36);
    S.accts.push(o);
  }
  L.persist();
  closeSheet();
  V.renderAll();
  toast('已保存');
});
$('#btnAcctDel').addEventListener('click', function () {
  var used = S.txns.filter(function (t) { return t.acct === acctDraft.id || t.toAcct === acctDraft.id; }).length;
  if (used && !confirm('这个账户下还有 ' + used + ' 笔记录，删除后这些记录会挂到第一个账户。确定删除？')) return;
  var fallback = (S.accts.filter(function (a) { return a.id !== acctDraft.id; })[0] || {}).id || '';
  S.txns.forEach(function (t) {
    if (t.acct === acctDraft.id) t.acct = fallback;
    if (t.toAcct === acctDraft.id) t.toAcct = fallback;
  });
  S.accts = S.accts.filter(function (a) { return a.id !== acctDraft.id; });
  L.persist();
  closeSheet();
  V.renderAll();
  toast('已删除');
});
document.addEventListener('click', function (e) {
  var m = e.target.closest && e.target.closest('[data-mgcat]');
  if (m) { openCat(m.getAttribute('data-mgcat')); return; }
  var a = e.target.closest && e.target.closest('[data-mgacct]');
  if (a) { openAcct(a.getAttribute('data-mgacct')); return; }
  var ac = e.target.closest && e.target.closest('[data-acct]');
  if (ac) { var id = ac.getAttribute('data-acct'); openAcct(id); return; }
  var add = e.target.closest && e.target.closest('[data-add]');
  if (add) {
    var k = add.getAttribute('data-add');
    if (k === 'cat') openCat(null, S.mgrType || 'expense');
    if (k === 'acct') openAcct(null);
    if (k === 'recurring') openRecur(null);
    return;
  }
  var rc = e.target.closest && e.target.closest('[data-recur]');
  if (rc) { openRecur(rc.getAttribute('data-recur')); return; }
});

/* ============================================================
   预算
   ============================================================ */
$('#btnBudgetEdit').addEventListener('click', function () { openBudget(); });
function openBudget() {
  var key = L.anchorKey();
  var b = L.budgetOf(key);
  $('#budgetSheetTitle').textContent = L.cnMonth(key) + ' 预算';
  $('#budTotal').value = b.total || '';
  var cats = S.cats.filter(function (c) { return c.type === 'expense'; });
  $('#budCatInputs').innerHTML = cats.map(function (c) {
    return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
      '<span style="font-size:16px;width:22px">' + c.icon + '</span>' +
      '<span style="flex:1;font-size:13px">' + esc(c.name) + '</span>' +
      '<input class="inp num" data-bc="' + c.id + '" type="number" min="0" step="50" ' +
      'style="width:110px;height:38px;text-align:right" value="' + ((b.cats || {})[c.id] || '') + '" placeholder="—">' +
      '</div>';
  }).join('');
  openSheet('#shBudget');
}
$('#btnBudgetSave').addEventListener('click', function () {
  var key = L.anchorKey();
  var total = parseFloat($('#budTotal').value) || 0;
  var cats = {};
  $$('#budCatInputs [data-bc]').forEach(function (inp) {
    var v = parseFloat(inp.value);
    if (v > 0) cats[inp.getAttribute('data-bc')] = v;
  });
  S.budgets[key] = { total: total, cats: cats };
  L.persist();
  closeSheet();
  V.renderAll();
  toast('预算已更新');
});

/* ============================================================
   固定支出
   ============================================================ */
var recurDraft = null;
function openRecur(id) {
  var r = null;
  S.recurring.forEach(function (x) { if (x.id === id) r = x; });
  recurDraft = r ? Object.assign({}, r) : { id: null, name: '', amount: 0, day: 1, cat: (S.cats[0] || {}).id };
  $('#recurName').value = recurDraft.name;
  $('#recurAmt').value = recurDraft.amount || '';
  $('#recurDay').value = recurDraft.day || 1;
  $('#recurCat').innerHTML = S.cats.filter(function (c) { return c.type === 'expense'; }).map(function (c) {
    return '<option value="' + c.id + '"' + (c.id === recurDraft.cat ? ' selected' : '') + '>' + c.icon + ' ' + esc(c.name) + '</option>';
  }).join('');
  $('#btnRecurDel').hidden = !recurDraft.id;
  openSheet('#shRecur');
}
$('#btnRecurSave').addEventListener('click', function () {
  var name = ($('#recurName').value || '').trim();
  var amt = parseFloat($('#recurAmt').value) || 0;
  if (!name || !amt) { toast('请填名称和金额'); return; }
  var o = {
    name: name, amount: amt,
    day: L.clamp(parseInt($('#recurDay').value, 10) || 1, 1, 28),
    cat: $('#recurCat').value, on: true
  };
  if (recurDraft.id) {
    S.recurring.forEach(function (r, i) { if (r.id === recurDraft.id) S.recurring[i] = Object.assign({}, r, o); });
  } else {
    o.id = 'r' + Date.now().toString(36);
    S.recurring.push(o);
  }
  L.persist();
  closeSheet();
  V.renderAll();
  toast('已保存');
});
$('#btnRecurDel').addEventListener('click', function () {
  S.recurring = S.recurring.filter(function (r) { return r.id !== recurDraft.id; });
  L.persist();
  closeSheet();
  V.renderAll();
  toast('已删除');
});

/* ============================================================
   导入
   ============================================================ */
var pendingImport = null;

function doImport(file) {
  if (!file) return;
  toast('正在解析 ' + file.name + ' …');
  IMP.parseFile(file).then(function (res) {
    pendingImport = res;
    paintImport(res);
    openSheet('#shImport');
  }).catch(function (err) {
    toast('解析失败：' + err.message);
    console.error(err);
  });
}

function paintImport(res) {
  var types = { expense: 0, income: 0, transfer: 0 };
  var catSet = {};
  res.rows.forEach(function (r) { types[r.type] = (types[r.type] || 0) + 1; catSet[r.cat1] = 1; });
  var catN = Object.keys(catSet).length;

  $('#impSummary').innerHTML =
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
      '<div style="width:40px;height:40px;border-radius:12px;background:rgba(78,203,143,.14);color:var(--down);' +
        'display:flex;align-items:center;justify-content:center;font-size:19px">✓</div>' +
      '<div><b style="font-size:14px">识别到 ' + res.rows.length + ' 条记录</b>' +
        '<div class="hint">' + esc(res.fileName) + ' · ' + res.from + ' → ' + res.to + '</div></div>' +
    '</div>' +
    '<div class="stat-grid">' +
      '<div class="stat"><span class="lbl">支出</span><b class="v sm">' + types.expense + ' 笔</b></div>' +
      '<div class="stat"><span class="lbl">收入</span><b class="v sm down">' + types.income + ' 笔</b></div>' +
      '<div class="stat"><span class="lbl">转账</span><b class="v sm">' + (types.transfer || 0) + ' 笔</b></div>' +
      '<div class="stat"><span class="lbl">分类</span><b class="v sm">' + catN + ' 个</b></div>' +
    '</div>';

  var preview = res.rows.slice(0, 4);
  $('#impPreview').innerHTML = preview.map(function (r) {
    var isIn = r.type === 'income';
    return '<div class="tx" style="cursor:default">' +
      '<div class="tx-ic" style="background:rgba(242,201,76,.12);color:var(--gold);font-size:15px">' +
        window.__IMP.guessIcon(r.cat1) + '</div>' +
      '<div class="tx-mid"><b>' + esc(r.note || r.cat1) + '</b>' +
        '<span>' + esc(r.cat1) + (r.acct ? ' · ' + esc(r.acct) : '') + ' · ' + esc(r.date) + '</span></div>' +
      '<div class="tx-amt ' + (isIn ? 'in' : 'out') + '">' + (isIn ? '+' : '-') + L.yuan(r.amount) + '</div>' +
      '</div>';
  }).join('') + '<div class="hint" style="text-align:center;margin-top:6px">仅预览前 4 条</div>';

  $('#impDefaultAcct').value = '导入账户';
  var sel = S.isSeed ? 'replace' : 'append';
  $$('#impMode button').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-m') === sel);
  });
  $('#impMode').setAttribute('data-sel', sel);
  $('#impDup').checked = true;
  $('#impNote').innerHTML = S.isSeed
    ? '当前是<b>示例数据</b>，默认「覆盖」会清空示例后再导入你的账单。'
    : '当前已有 <b>' + S.txns.length + '</b> 条记录，默认「追加」。';
}

$$('#impMode button').forEach(function (b) {
  b.addEventListener('click', function () {
    $$('#impMode button').forEach(function (x) { x.classList.remove('on'); });
    b.classList.add('on');
    $('#impMode').setAttribute('data-sel', b.getAttribute('data-m'));
  });
});

$('#btnImportPick').addEventListener('click', function () { $('#fileImport').click(); });
$('#fileImport').addEventListener('change', function () {
  doImport(this.files && this.files[0]);
  this.value = '';
});
$('#btnImportConfirm').addEventListener('click', function () {
  if (!pendingImport) return;
  var mode = $('#impMode').getAttribute('data-sel') || 'append';
  var r = IMP.importRows(pendingImport.rows, {
    mode: mode,
    skipDup: $('#impDup').checked,
    defaultAcct: ($('#impDefaultAcct').value || '导入账户').trim()
  });
  pendingImport = null;
  closeSheet();
  S.tab = 'stats';
  V.switchTab('stats');
  toast('导入 ' + r.added + ' 条' + (r.dup ? '，跳过 ' + r.dup + ' 条重复' : '') +
    (r.cats ? '，新建 ' + r.cats + ' 个分类' : ''));
});

/* 拖拽导入 */
['dragenter', 'dragover'].forEach(function (ev) {
  window.addEventListener(ev, function (e) {
    if (!e.dataTransfer || !e.dataTransfer.types || e.dataTransfer.types.indexOf('Files') < 0) return;
    e.preventDefault();
    document.body.classList.add('dragging');
  });
});
['dragleave', 'drop'].forEach(function (ev) {
  window.addEventListener(ev, function (e) {
    if (ev === 'dragleave' && e.relatedTarget) return;
    document.body.classList.remove('dragging');
  });
});
window.addEventListener('drop', function (e) {
  if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
  e.preventDefault();
  doImport(e.dataTransfer.files[0]);
});

/* ============================================================
   导出 / 重置
   ============================================================ */
function download(name, content, mime) {
  try {
    var blob = new Blob([content], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
    return true;
  } catch (e) { return false; }
}

function backupJSON() {
  return JSON.stringify({
    app: 'shiguang-ledger', version: 1, exportedAt: new Date().toISOString(),
    cats: S.cats, accts: S.accts, txns: S.txns,
    budgets: S.budgets, recurring: S.recurring
  }, null, 1);
}

function downloadBin(name, u8, mime) {
  try {
    var blob = new Blob([u8], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
    return true;
  } catch (e) { return false; }
}

function exportXlsx() {
  var X = window.__XLSX;
  if (!X) { toast('导出模块没加载'); return; }
  toast('正在生成 Excel 报告…');
  setTimeout(function () {
    try {
      var bytes = X.build();
      var name = X.fileName();
      var ok = downloadBin(name, bytes,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      toast(ok
        ? '已导出 ' + name + '（' + Math.round(bytes.length / 1024) + ' KB）'
        : '浏览器拦了下载，请在 Chrome 里打开本页再试');
    } catch (err) {
      console.error(err);
      toast('生成失败：' + (err && err.message ? err.message : err));
    }
  }, 60);
}

$('#btnExportXlsx').addEventListener('click', exportXlsx);
$('#btnStatExport').addEventListener('click', exportXlsx);

$('#btnExportJson').addEventListener('click', function () {
  var ok = download('史高治账本备份_' + L.todayISO() + '.json', backupJSON(), 'application/json');
  toast(ok ? '已导出备份' : '浏览器拦了下载，改点「复制备份」');
});

$('#btnExportCsv').addEventListener('click', function () {
  var head = ['日期', '类型', '金额', '一级分类', '二级分类', '账户1', '账户2', '备注', '货币', '标签', '账本'];
  var lines = [head.join(',')];
  function q(s) {
    s = String(s == null ? '' : s);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  S.txns.forEach(function (t) {
    lines.push([
      t.date + ' ' + (t.time || '00:00') + ':00',
      t.type === 'expense' ? '支出' : t.type === 'income' ? '收入' : '转账',
      (t.type === 'income' ? '' : '-') + t.amount.toFixed(2),
      L.catById(t.cat).name,
      t.sub || '',
      L.acctById(t.acct).name,
      t.toAcct ? L.acctById(t.toAcct).name : '',
      t.note || '',
      'CNY',
      (t.tags || []).join('/'),
      '日常账本'
    ].map(q).join(','));
  });
  var ok = download('史高治账本_' + L.todayISO() + '.csv', '\ufeff' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast(ok ? '已导出 CSV' : '浏览器拦了下载');
});

$('#btnCopyJson').addEventListener('click', function () {
  var s = backupJSON();
  $('#textArea').value = s;
  $('#textTitle').textContent = '备份 JSON（全选复制）';
  openSheet('#shText');
  setTimeout(function () {
    var ta = $('#textArea');
    ta.focus(); ta.select();
    if (navigator.clipboard) navigator.clipboard.writeText(s).then(function () { toast('已复制到剪贴板'); }).catch(function () { });
  }, 240);
});

$('#btnReset').addEventListener('click', function () {
  if (!confirm('清空当前账本并恢复示例数据？此操作不可撤销（建议先导出备份）。')) return;
  L.Store.clear();
  window.location.reload();
});

/* 清空示例数据：留下一个干净的空账本，分类/账户/主题保留 */
function wipeData() {
  var n = S.txns.length;
  var msg = n
    ? '确认清空全部 ' + n + ' 笔记录（含预算与固定支出）？\n\n分类、账户和主题设置会保留。此操作不可撤销，建议先导出备份。'
    : '确认清空预算与固定支出？\n\n分类、账户和主题设置会保留。';
  if (!confirm(msg)) return;
  S.txns = [];
  S.budgets = {};
  S.recurring = [];
  S.isSeed = false;
  S.noSeed = true;
  L.persist();
  window.location.reload();
}
$('#btnWipe').addEventListener('click', wipeData);

/* 导入 / 清空 的入口在页面里是动态生成的（示例横幅会重建），统一用委托 */
document.addEventListener('click', function (e) {
  var t = e.target.closest && e.target.closest('[data-open-import],[data-wipe]');
  if (!t) return;
  if (t.hasAttribute('data-wipe')) wipeData();
  else $('#fileImport').click();
});

/* ============================================================
   启动
   ============================================================ */
function boot() {
  L.loadState();
  applyTheme();
  S.mgrType = 'expense';
  V.switchTab(S.tab || 'stats');

  var r = 0;
  window.addEventListener('resize', function () {
    clearTimeout(r);
    r = setTimeout(function () {
      if (S.tab === 'stats' || S.tab === 'assets' || S.tab === 'ledger') V.renderAll();
    }, 200);
  });

  /* 键盘快捷键 */
  document.addEventListener('keydown', function (e) {
    if (opened) return;
    if ((e.key === 'n' || e.key === 'N') && !/input|textarea/i.test(e.target.tagName)) {
      e.preventDefault();
      openTx(null);
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
