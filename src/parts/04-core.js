/* ============================================================
   史高治账本 · 核心（工具 / 存储 / 数据 / 派生计算）
   ============================================================ */
(function () {
'use strict';

var APP_VERSION = 'v1.0 · 2026-10-26';
var KEY = 'shiguang-ledger-v1';
var DAY = 86400000;

/* ---------------- 基础工具 ---------------- */
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function sum(arr, f) { var t = 0; for (var i = 0; i < arr.length; i++) t += f ? f(arr[i]) : arr[i]; return t; }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function trimZero(s) { return s.indexOf('.') < 0 ? s : s.replace(/0+$/, '').replace(/\.$/, ''); }

function num(n, dec) {
  var v = Math.abs(+n || 0), s = v.toFixed(dec == null ? 2 : dec), p = s.split('.');
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 ? '-' : '') + p.join('.');
}
function yuan(n, dec) { var v = +n || 0; return (v < 0 ? '-' : '') + '¥' + num(Math.abs(v), dec); }
function yuanS(n, dec) {
  var v = +n || 0;
  return (v > 0 ? '+' : v < 0 ? '-' : '') + '¥' + num(Math.abs(v), dec);
}
function shortYuan(n) {
  var a = Math.abs(+n || 0);
  if (a >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
  if (a >= 10000) return trimZero((n / 10000).toFixed(a >= 100000 ? 1 : 2)) + '万';
  return num(n, 0);
}
function axisYuan(v) {
  var a = Math.abs(v);
  if (a >= 10000) return trimZero((v / 10000).toFixed(a >= 100000 ? 1 : 2)) + '万';
  return num(v, 0);
}
function pct(n, dec) {
  if (n == null || !isFinite(n)) return '—';
  return (n * 100).toFixed(dec == null ? 2 : dec) + '%';
}

/* ---------------- 日期 ---------------- */
function iso(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function todayISO() { return iso(new Date()); }
function parseISO(s) {
  var p = String(s).split('-');
  return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
}
function addDaysISO(s, n) { var d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); }
function addMonthsKey(key, n) {
  var p = key.split('-'), y = +p[0], m = +p[1] - 1 + n;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return y + '-' + pad2(m + 1);
}
function monthKey(s) { return String(s).slice(0, 7); }
function firstOfMonth(key) { return key + '-01'; }
function lastOfMonth(key) {
  var p = key.split('-'), y = +p[0], m = +p[1];
  var d = new Date(y, m, 0);
  return y + '-' + pad2(m) + '-' + pad2(d.getDate());
}
var WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function wdName(s) { return WD[parseISO(s).getDay()]; }
function mdLabel(s) { var p = s.split('-'); return (+p[1]) + '-' + (+p[2]); }
function cnMonth(key) { var p = key.split('-'); return p[0] + '年' + (+p[1]) + '月'; }
function dateLabel(s) {
  var d = parseISO(s), t = todayISO();
  if (s === t) return '今天';
  if (s === addDaysISO(t, -1)) return '昨天';
  if (s === addDaysISO(t, 1)) return '明天';
  return (+s.slice(5, 7)) + '月' + (+s.slice(8, 10)) + '日 ' + WD[d.getDay()];
}

/* ---------------- 配色 ---------------- */
var PALETTE = ['#f0716a', '#f0a05a', '#f5c860', '#6cc4f5', '#6c7ef5',
  '#b06cf5', '#f06cb0', '#8fb8f0', '#7fd6b8', '#a0d060',
  '#f0d060', '#c0b8f0', '#f0856a', '#9fd0e8'];
var ICONS = ['🍜', '🚇', '🛍️', '🎬', '☕', '🏠', '💊', '📚', '👕', '🎁',
  '💻', '📱', '💇', '🏃', '💼', '🧾', '🎵', '🐱', '✈️', '💡',
  '💰', '💵', '🏆', '📈', '🧧', '✨', '🅿️', '⛽', '🍺', '🎮'];

/* ---------------- 默认分类 ---------------- */
function defaultCats() {
  return [
    { id: 'food', name: '餐饮美食', icon: '🍜', color: '#f5c860', type: 'expense' },
    { id: 'traffic', name: '交通出行', icon: '🚇', color: '#f0716a', type: 'expense' },
    { id: 'digital', name: '数码电器', icon: '💻', color: '#f0a05a', type: 'expense' },
    { id: 'home', name: '居住房租', icon: '🏠', color: '#8fb8f0', type: 'expense' },
    { id: 'daily', name: '日用百货', icon: '🛍️', color: '#b06cf5', type: 'expense' },
    { id: 'fun', name: '文化休闲', icon: '🎬', color: '#6c7ef5', type: 'expense' },
    { id: 'cloth', name: '服饰装扮', icon: '👕', color: '#6cc4f5', type: 'expense' },
    { id: 'phone', name: '充值缴费', icon: '📱', color: '#c07ef0', type: 'expense' },
    { id: 'beauty', name: '美容美发', icon: '💇', color: '#f06cb0', type: 'expense' },
    { id: 'biz', name: '商业服务', icon: '💼', color: '#f0856a', type: 'expense' },
    { id: 'sport', name: '运动户外', icon: '🏃', color: '#f0d060', type: 'expense' },
    { id: 'med', name: '医疗健康', icon: '💊', color: '#7fd6b8', type: 'expense' },
    { id: 'study', name: '学习进修', icon: '📚', color: '#a0d060', type: 'expense' },
    { id: 'gift', name: '人情往来', icon: '🎁', color: '#c0b8f0', type: 'expense' },
    { id: 'salary', name: '工资', icon: '💵', color: '#4ecb8f', type: 'income' },
    { id: 'bonus', name: '奖金', icon: '🏆', color: '#5fd0a0', type: 'income' },
    { id: 'invest', name: '理财收益', icon: '📈', color: '#7fd6b8', type: 'income' },
    { id: 'redpkt', name: '红包', icon: '🧧', color: '#f0716a', type: 'income' },
    { id: 'otherin', name: '其他收入', icon: '✨', color: '#a0a8b8', type: 'income' }
  ];
}

function defaultAccts() {
  return [
    { id: 'cmb', name: '招商银行', sub: '储蓄卡', type: 'asset', icon: '🏦', color: '#e2574c', opening: 78000 },
    { id: 'alipay', name: '支付宝', sub: '余额宝', type: 'asset', icon: '🅰️', color: '#1677ff', opening: 12400 },
    { id: 'wechat', name: '微信钱包', sub: '零钱', type: 'asset', icon: '💬', color: '#07c160', opening: 3200 },
    { id: 'fund', name: '基金账户', sub: '定投', type: 'asset', icon: '📈', color: '#6c7ef5', opening: 62000 },
    { id: 'cash', name: '现金', sub: '钱包', type: 'asset', icon: '💵', color: '#f5c860', opening: 800 },
    { id: 'credit', name: '信用卡', sub: '经典白金', type: 'debt', icon: '💳', color: '#8b8f96', opening: -4500 }
  ];
}

/* ---------------- 本地存储（沙箱下自动降级为内存） ---------------- */
var memoryStore = {};
var canPersist = (function () {
  try { window.localStorage.setItem('__t', '1'); window.localStorage.removeItem('__t'); return true; }
  catch (e) { return false; }
})();
var Store = {
  ok: canPersist,
  get: function () {
    try {
      var raw = canPersist ? window.localStorage.getItem(KEY) : memoryStore[KEY];
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  set: function (obj) {
    var raw = JSON.stringify(obj);
    if (canPersist) { try { window.localStorage.setItem(KEY, raw); return true; } catch (e) { } }
    memoryStore[KEY] = raw; return false;
  },
  clear: function () {
    if (canPersist) { try { window.localStorage.removeItem(KEY); } catch (e) { } }
    delete memoryStore[KEY];
  }
};

/* ---------------- 状态 ---------------- */
var S = {
  cats: [], accts: [], txns: [], books: [], curBook: 'main',
  budgets: {}, recurring: [],
  theme: 'dark',
  range: 'month', f: { from: '', to: '', accts: [], cats: [], tags: [] },
  rangeOff: 0,
  segDaily: 'expense', gran: 'day', granUser: false,
  segCat: 'expense', donutDelta: false, donutAll: true,
  segNet: 'net',
  monthMode: 'amount',
  calKey: '',
  ledgerFilter: 'all',
  ledgerMonth: '',
  ledgerSearch: '',
  ledgerSort: '',   /* '' 默认（按日期） | 'desc' 金额降序 | 'asc' 金额升序 */
  mgrType: 'expense', lastType: 'expense', isSeed: false,
  noSeed: false,
  tab: 'stats'
};

/* ---------------- 种子数据 ---------------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

var NOTES = {
  food: ['午饭', '晚饭', '早餐', '外卖', '和同事吃饭', '奶茶', '便利店', '火锅', '咖啡', '食堂'],
  traffic: ['地铁', '公交', '打车', '共享单车', '高铁票', '加油', '停车费', '机票'],
  digital: ['耳机', '移动硬盘', '显示器', '键盘', '充电器', '平板保护壳'],
  home: ['房租', '水电费', '物业费', '宽带'],
  daily: ['超市', '纸巾', '洗衣液', '收纳盒', '洗发水', '水果'],
  fun: ['电影票', '演出', '展览', '剧本杀', 'KTV', '游戏'],
  cloth: ['T恤', '外套', '运动鞋', '袜子', '衬衫'],
  phone: ['话费充值', '视频会员', '音乐会员', '云盘会员'],
  beauty: ['剪头发', '护肤品', '面膜'],
  biz: ['快递费', '打印', '办公用品', '服务费'],
  sport: ['健身房', '跑鞋', '羽毛球', '游泳'],
  med: ['感冒药', '体检', '挂号', '维生素'],
  study: ['买书', '网课', '考试报名'],
  gift: ['生日礼物', '随礼', '探望']
};
var AMT = {
  food: [12, 88], traffic: [4, 46], digital: [199, 5200], home: [180, 3600],
  daily: [15, 220], fun: [28, 320], cloth: [89, 699], phone: [15, 128],
  beauty: [38, 268], biz: [10, 160], sport: [25, 400], med: [22, 460],
  study: [39, 620], gift: [100, 800]
};

function seedData() {
  var rnd = mulberry32(20261026);
  var cats = defaultCats(), accts = defaultAccts();
  var txns = [];
  var id = 1;
  var FROM = '2026-03-01', TO = todayISO();

  var creditBal = -4500;
  function add(o) {
    o.id = 't' + (id++);
    if (o.type === 'expense' && o.acct === 'credit') creditBal -= o.amount;
    if (o.type === 'transfer' && o.toAcct === 'credit') creditBal += o.amount;
    if (!o.time) o.time = pad2(7 + Math.floor(rnd() * 16)) + ':' + pad2(Math.floor(rnd() * 60));
    if (!o.note) o.note = '';
    if (!o.tags) o.tags = [];
    txns.push(o);
  }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function amt(cat) {
    var r = AMT[cat] || [10, 200];
    var v = r[0] + Math.pow(rnd(), 1.6) * (r[1] - r[0]);
    return Math.round(v * 100) / 100;
  }

  /* 日常消费权重 */
  var W = [['food', 40], ['traffic', 22], ['daily', 8], ['fun', 6], ['cloth', 4],
    ['phone', 4], ['beauty', 3], ['sport', 3], ['biz', 2], ['digital', 2],
    ['med', 2], ['study', 1], ['gift', 1]];
  var WSUM = sum(W, function (x) { return x[1]; });
  function pickCat() {
    var r = rnd() * WSUM;
    for (var i = 0; i < W.length; i++) { r -= W[i][1]; if (r <= 0) return W[i][0]; }
    return 'food';
  }
  var ACC_POOL = ['alipay', 'wechat', 'alipay', 'wechat', 'cmb', 'credit', 'cash'];

  var d = FROM;
  while (d <= TO) {
    var dd = parseISO(d), dow = dd.getDay();
    var dayIdx = dd.getDate();
    var mk = monthKey(d);

    /* 房租 */
    if (dayIdx === 1) {
      add({ type: 'expense', cat: 'home', acct: 'cmb', amount: 3200, date: d, time: '09:12', note: '房租' });
    }
    /* 水电物业 */
    if (dayIdx === 6) {
      add({ type: 'expense', cat: 'home', acct: 'alipay', amount: 160 + Math.round(rnd() * 90), date: d, time: '20:30', note: '水电费' });
    }
    /* 工资 */
    if (dayIdx === 10) {
      add({ type: 'income', cat: 'salary', acct: 'cmb', amount: 12500, date: d, time: '10:05', note: mk + ' 工资' });
    }
    /* 季度奖金 */
    if (dayIdx === 15 && (mk === '2026-04' || mk === '2026-07' || mk === '2026-10')) {
      add({ type: 'income', cat: 'bonus', acct: 'cmb', amount: 4800 + Math.round(rnd() * 2200), date: d, time: '10:20', note: '季度奖金' });
    }
    /* 理财收益 */
    if (dayIdx === 21) {
      add({ type: 'income', cat: 'invest', acct: 'fund', amount: 120 + Math.round(rnd() * 480), date: d, time: '15:40', note: '基金分红' });
    }
    /* 信用卡还款 */
    if (dayIdx === 8 && creditBal < -60) {
      /* 按当前欠款还掉 9 成，留一点当本月新增消费 */
      add({ type: 'transfer', acct: 'cmb', toAcct: 'credit', amount: Math.round(-creditBal * 0.9), date: d, time: '08:30', note: '信用卡还款' });
    }
    /* 会员订阅 */
    if (dayIdx === 5) {
      add({ type: 'expense', cat: 'phone', acct: 'wechat', amount: 25, date: d, time: '00:10', note: '云盘会员' });
    }
    /* 零钱补给：让电子钱包与现金保持正余额（否则演示数据会出现负的「资产」） */
    if (dayIdx === 9) add({ type: 'transfer', acct: 'cmb', toAcct: 'alipay', amount: 3000, date: d, time: '09:05', note: '转入余额宝' });
    if (dayIdx === 20) add({ type: 'transfer', acct: 'cmb', toAcct: 'wechat', amount: 900, date: d, time: '09:10', note: '零钱补充' });
    if (dayIdx === 25) add({ type: 'transfer', acct: 'cmb', toAcct: 'cash', amount: 400, date: d, time: '09:15', note: '取现' });

    /* 日常笔数 */
    var n = dow === 0 || dow === 6 ? 1 + Math.floor(rnd() * 3) : Math.floor(rnd() * 3);
    for (var k = 0; k < n; k++) {
      var c = pickCat();
      if ((dow === 0 || dow === 6) && rnd() < .45) c = pick(['food', 'fun', 'cloth', 'daily']);
      add({
        type: 'expense', cat: c, acct: pick(ACC_POOL),
        amount: amt(c), date: d,
        note: pick(NOTES[c] || ['其他'])
      });
    }

    /* 偶发大额 */
    if (d === '2026-10-05') {
      add({ type: 'expense', cat: 'digital', acct: 'credit', amount: 4999, date: d, time: '21:08', note: '笔记本电脑' });
    }
    if (d === '2026-09-12') {
      add({ type: 'expense', cat: 'digital', acct: 'credit', amount: 1299, date: d, time: '19:45', note: '蓝牙耳机' });
    }
    if (d === '2026-08-03') {
      add({ type: 'expense', cat: 'travel_x', acct: 'credit', amount: 2860, date: d, time: '12:30', note: '出差机票', tags: ['出差', '垫付'] });
    }
    if (d === '2026-07-18') {
      add({ type: 'expense', cat: 'biz', acct: 'cmb', amount: 680, date: d, time: '16:20', note: '客户接待', tags: ['垫付'] });
    }
    if (d === '2026-10-14') {
      add({ type: 'expense', cat: 'biz', acct: 'cmb', amount: 380, date: d, time: '11:05', note: '打车+餐费（项目组）', tags: ['项目A', '垫付'] });
    }
    if (d === '2026-09-25') {
      add({ type: 'income', cat: 'otherin', acct: 'alipay', amount: 800, date: d, time: '18:00', note: '朋友还钱', tags: ['收款'] });
    }

    d = addDaysISO(d, 1);
  }

  /* 出差类支出归到交通 */
  txns.forEach(function (t) { if (t.cat === 'travel_x') t.cat = 'traffic'; });

  txns.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.time < b.time ? -1 : 1;
  });

  var nowKey = monthKey(todayISO());
  var budgets = {};
  budgets[nowKey] = {
    total: 12000,
    cats: { food: 2600, traffic: 1200, digital: 1500, home: 3600, daily: 800, fun: 700, cloth: 600 }
  };
  var prevKey = addMonthsKey(nowKey, -1);
  budgets[prevKey] = { total: 12000, cats: { food: 2400, traffic: 1000, home: 3600, digital: 800 } };

  var recurring = [
    { id: 'r1', name: '房租', amount: 3200, day: 1, cat: 'home', on: true },
    { id: 'r2', name: '云盘会员', amount: 25, day: 5, cat: 'phone', on: true },
    { id: 'r3', name: '健身房', amount: 299, day: 12, cat: 'sport', on: true },
    { id: 'r4', name: '话费', amount: 59, day: 20, cat: 'phone', on: true }
  ];

  return {
    cats: cats, accts: accts, txns: txns,
    budgets: budgets, recurring: recurring,
    books: [{ id: 'main', name: '日常账本', icon: '📖' }], curBook: 'main',
    theme: 'dark'
  };
}

/* ---------------- 载入 ---------------- */
function loadState() {
  var d = Store.get();
  if (!d) { d = seedData(); S.isSeed = true; Store.set(d); }
  else if ((!d.txns || !d.txns.length) && !d.noSeed) { d = seedData(); S.isSeed = true; Store.set(d); }
  else S.isSeed = !!d.isSeed;
  S.noSeed = !!d.noSeed;
  S.cats = d.cats || defaultCats();
  S.accts = d.accts || defaultAccts();
  S.txns = d.txns || [];
  S.budgets = d.budgets || {};
  S.recurring = d.recurring || [];
  S.books = d.books || [{ id: 'main', name: '日常账本', icon: '📖' }];
  S.curBook = d.curBook || 'main';
  S.theme = d.theme || 'dark';
  S.ledgerMonth = S.ledgerMonth || monthKey(latestDate() || todayISO());
  S.calKey = monthKey(latestDate() || todayISO());
}

function persist() {
  return Store.set({
    cats: S.cats, accts: S.accts, txns: S.txns,
    budgets: S.budgets, recurring: S.recurring,
    books: S.books, curBook: S.curBook, theme: S.theme,
    isSeed: S.isSeed, noSeed: S.noSeed
  });
}

/* ---------------- 查询 ---------------- */
function catById(id) {
  for (var i = 0; i < S.cats.length; i++) if (S.cats[i].id === id) return S.cats[i];
  return { id: id, name: id || '未分类', icon: '❓', color: '#7a828e', type: 'expense' };
}
function acctById(id) {
  for (var i = 0; i < S.accts.length; i++) if (S.accts[i].id === id) return S.accts[i];
  return { id: id, name: id || '未知', icon: '❓', color: '#7a828e', type: 'asset', opening: 0 };
}
function latestDate() {
  var m = '';
  for (var i = 0; i < S.txns.length; i++) if (S.txns[i].date > m) m = S.txns[i].date;
  return m;
}
function earliestDate() {
  var m = '';
  for (var i = 0; i < S.txns.length; i++) if (!m || S.txns[i].date < m) m = S.txns[i].date;
  return m;
}
function anchorKey() { return monthKey(latestDate() || todayISO()); }
/* 周期锚点日：拿最新一条记录的日期，没有记录就用今天 */
function anchorDate() { return latestDate() || todayISO(); }

/* ---------------- 区间 ----------------
   range: week | month | last3 | year | all
   rangeOff: 0 = 当前周期，-1 = 上一个周期（周/月/年可翻页） */
function resolveRange() {
  if (S.f.from && S.f.to) {
    return { from: S.f.from, to: S.f.to, label: S.f.from + ' → ' + S.f.to, short: '自定义' };
  }
  var off = S.rangeOff || 0;
  var a = anchorDate();

  if (S.range === 'week') {
    var d = parseISO(a);
    var dow = (d.getDay() + 6) % 7;                    /* 把周日=0 转成周一=0 */
    var s = addDaysISO(a, -dow + off * 7);
    var e = addDaysISO(s, 6);
    var mdS = s.slice(5).replace('-', '.'), mdE = e.slice(5).replace('-', '.');
    var yS = s.slice(0, 4), yE = e.slice(0, 4);
    return {
      from: s, to: e,
      /* 同年：2026年 10.26 - 11.01；跨年：2025年 12.29 - 2026年 01.04 */
      label: yS + '年 ' + mdS + ' - ' + (yS === yE ? mdE : yE + '年 ' + mdE),
      short: off === 0 ? '本周' : '周'
    };
  }
  if (S.range === 'month') {
    var k = addMonthsKey(monthKey(a), off);
    return { from: firstOfMonth(k), to: lastOfMonth(k), label: cnMonth(k), short: off === 0 ? '本月' : '月' };
  }
  if (S.range === 'last3') {
    var k1 = addMonthsKey(monthKey(a), off);
    var k0 = addMonthsKey(k1, -2);
    return { from: firstOfMonth(k0), to: lastOfMonth(k1), label: cnMonth(k0) + ' → ' + cnMonth(k1), short: '近 3 月' };
  }
  if (S.range === 'year') {
    var y = String(+monthKey(a).slice(0, 4) + off);
    return { from: y + '-01-01', to: y + '-12-31', label: y + ' 年', short: off === 0 ? '本年' : '年' };
  }
  var e2 = earliestDate() || firstOfMonth(monthKey(a));
  return { from: e2, to: lastOfMonth(monthKey(a)), label: '全部（' + e2 + ' 起）', short: '全部' };
}

function matchFilter(t) {
  if (S.f.accts.length && S.f.accts.indexOf(t.acct) < 0 && S.f.accts.indexOf(t.toAcct) < 0) return false;
  if (S.f.cats.length && S.f.cats.indexOf(t.cat) < 0) return false;
  if (S.f.tags.length) {
    var hit = false;
    for (var i = 0; i < S.f.tags.length; i++) if ((t.tags || []).indexOf(S.f.tags[i]) >= 0) { hit = true; break; }
    if (!hit) return false;
  }
  return true;
}

function rangeTxns(rg) {
  var out = [];
  for (var i = 0; i < S.txns.length; i++) {
    var t = S.txns[i];
    if (t.date < rg.from || t.date > rg.to) continue;
    if (!matchFilter(t)) continue;
    out.push(t);
  }
  return out;
}

/* ---------------- 汇总 ---------------- */
function summarize(list) {
  var o = { out: 0, inc: 0, net: 0, n: 0, outN: 0, incN: 0, repay: 0, recv: 0 };
  for (var i = 0; i < list.length; i++) {
    var t = list[i];
    o.n++;
    if (t.type === 'expense') { o.out += t.amount; o.outN++; }
    else if (t.type === 'income') {
      o.inc += t.amount; o.incN++;
      if ((t.tags || []).indexOf('收款') >= 0) o.recv += t.amount;
    } else if (t.type === 'transfer') {
      if (acctById(t.toAcct).type === 'debt') o.repay += t.amount;
    }
  }
  o.net = o.inc - o.out;
  return o;
}

/* 有效结束日：区间终点在未来时，截到今天（避免图表右侧拖一条空尾巴） */
function effEnd(rg) {
  var t = todayISO();
  if (rg.to <= t) return rg.to;
  return rg.from > t ? rg.to : t;
}

function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / DAY) + 1;
}

/* ---------------- 每日序列 ---------------- */
function dailySeries(rg, kind) {
  var map = {};
  rangeTxns(rg).forEach(function (t) {
    if (t.type === 'transfer') return;
    var k = t.date, m = map[k] || (map[k] = { e: 0, i: 0 });
    if (t.type === 'expense') m.e += t.amount; else m.i += t.amount;
  });
  var out = [], d = rg.from, guard = 0;
  while (d <= rg.to && guard++ < 800) {
    var m = map[d] || { e: 0, i: 0 };
    var v = kind === 'income' ? m.i : kind === 'net' ? (m.i - m.e) : m.e;
    out.push({ date: d, v: v, e: m.e, i: m.i });
    d = addDaysISO(d, 1);
  }
  return out;
}

/* 按周/月聚合（日图切换粒度用） */
function bucketSeries(rg, kind, gran) {
  var daily = dailySeries(rg, kind);
  if (gran === 'day') return daily.map(function (x) {
    return { date: x.date, v: x.v, label: mdLabel(x.date), key: x.date, n: 1 };
  });
  var map = {}, order = [];
  daily.forEach(function (x) {
    var k;
    if (gran === 'week') {
      var d = parseISO(x.date);
      var off = (d.getDay() + 6) % 7;
      var monday = iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - off));
      k = monday;
    } else k = monthKey(x.date);
    if (!map[k]) { map[k] = { v: 0, n: 0, key: k }; order.push(k); }
    map[k].v += x.v; map[k].n++;
  });
  return order.map(function (k) {
    var label = gran === 'week' ? mdLabel(k) : (+k.split('-')[1]) + '月';
    return { date: k, v: map[k].v, label: label, key: k, n: map[k].n };
  });
}

/* ---------------- 分类聚合 ---------------- */
function catAggregate(list, type) {
  var map = {}, total = 0;
  list.forEach(function (t) {
    if (t.type !== type) return;
    if (!map[t.cat]) map[t.cat] = { id: t.cat, amount: 0, count: 0 };
    map[t.cat].amount += t.amount;
    map[t.cat].count++;
    total += t.amount;
  });
  var arr = Object.keys(map).map(function (k) {
    var c = catById(k);
    return { id: k, name: c.name, icon: c.icon, color: c.color, amount: map[k].amount, count: map[k].count, pct: total ? map[k].amount / total : 0 };
  });
  arr.sort(function (a, b) { return b.amount - a.amount; });
  return { items: arr, total: total };
}

/* 环比：与上一个等长区间比 */
function prevRange(rg) {
  var n = daysBetween(rg.from, rg.to);
  var to = addDaysISO(rg.from, -1);
  return { from: addDaysISO(to, -(n - 1)), to: to };
}
function catDelta(rg, type) {
  var cur = catAggregate(rangeTxns(rg), type).items;
  var pr = prevRange(rg);
  var prev = catAggregate(rangeTxns(pr), type).items;
  var pm = {};
  prev.forEach(function (x) { pm[x.id] = x.amount; });
  cur.forEach(function (x) { x.prev = pm[x.id] || 0; x.delta = x.amount - x.prev; });
  return cur;
}

/* ---------------- 月度序列 ---------------- */
function monthlySeries(n) {
  var k = anchorKey(), out = [];
  for (var i = n - 1; i >= 0; i--) {
    var key = addMonthsKey(k, -i);
    var rg = { from: firstOfMonth(key), to: lastOfMonth(key) };
    var s = summarize(rangeTxns(rg));
    out.push({ key: key, label: (+key.split('-')[1]) + '月', inc: s.inc, exp: s.out, net: s.inc - s.out, rate: s.inc > 0 ? (s.inc - s.out) / s.inc : null });
  }
  return out;
}

/* ---------------- 账户余额曲线 ---------------- */
function balanceCurve(from, to) {
  var sorted = S.txns.slice().sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.time || '') < (b.time || '') ? -1 : 1;
  });
  var bal = {};
  S.accts.forEach(function (a) { bal[a.id] = +a.opening || 0; });

  function apply(t) {
    if (t.type === 'transfer') {
      bal[t.acct] = (bal[t.acct] || 0) - t.amount;
      bal[t.toAcct] = (bal[t.toAcct] || 0) + t.amount;
    } else if (t.type === 'income') {
      bal[t.acct] = (bal[t.acct] || 0) + t.amount;
    } else {
      bal[t.acct] = (bal[t.acct] || 0) - t.amount;
    }
  }

  var i = 0;
  while (i < sorted.length && sorted[i].date < from) { apply(sorted[i]); i++; }

  var dates = [], nets = [], assets = [], debts = [];
  var d = from, guard = 0;
  while (d <= to && guard++ < 1200) {
    while (i < sorted.length && sorted[i].date <= d) { apply(sorted[i]); i++; }
    var a = 0, li = 0;
    for (var k in bal) { if (bal[k] > 0) a += bal[k]; else li += -bal[k]; }
    dates.push(d); assets.push(a); debts.push(li); nets.push(a - li);
    d = addDaysISO(d, 1);
  }
  return { dates: dates, net: nets, asset: assets, debt: debts };
}

function currentBalances() {
  var c = balanceCurve(earliestDate() || firstOfMonth(anchorKey()), lastOfMonth(anchorKey()));
  var last = c.dates.length - 1;
  var out = { net: 0, asset: 0, debt: 0 };
  if (last >= 0) { out.net = c.net[last]; out.asset = c.asset[last]; out.debt = c.debt[last]; }
  return out;
}

/* ---------------- 时段 / 日历 ---------------- */
var SLOTS = [
  { id: 'a', label: '00-06', from: 0, to: 6 },
  { id: 'b', label: '06-09', from: 6, to: 9 },
  { id: 'c', label: '09-12', from: 9, to: 12 },
  { id: 'd', label: '12-14', from: 12, to: 14 },
  { id: 'e', label: '14-18', from: 14, to: 18 },
  { id: 'f', label: '18-24', from: 18, to: 24 }
];
function slotOf(time) {
  var h = parseInt(String(time || '12:00').slice(0, 2), 10) || 0;
  for (var i = 0; i < SLOTS.length; i++) if (h >= SLOTS[i].from && h < SLOTS[i].to) return SLOTS[i].id;
  return 'f';
}
function heatGrid(list) {
  var g = {}, max = 0;
  for (var w = 0; w < 7; w++) { g[w] = {}; SLOTS.forEach(function (s) { g[w][s.id] = 0; }); }
  list.forEach(function (t) {
    if (t.type !== 'expense') return;
    var w = (parseISO(t.date).getDay() + 6) % 7;
    var s = slotOf(t.time);
    g[w][s] += t.amount;
    if (g[w][s] > max) max = g[w][s];
  });
  return { grid: g, max: max };
}

function calendarMonth(key) {
  var p = key.split('-'), y = +p[0], m = +p[1];
  var first = new Date(y, m - 1, 1);
  var days = new Date(y, m, 0).getDate();
  var lead = (first.getDay() + 6) % 7;
  var map = {};
  S.txns.forEach(function (t) {
    if (t.type !== 'expense') return;
    if (monthKey(t.date) !== key) return;
    map[t.date] = (map[t.date] || 0) + t.amount;
  });
  var cells = [];
  for (var i = 0; i < lead; i++) cells.push(null);
  for (var d = 1; d <= days; d++) {
    var ds = key + '-' + pad2(d);
    cells.push({ d: d, date: ds, v: map[ds] || 0 });
  }
  while (cells.length % 7) cells.push(null);
  var max = 0;
  cells.forEach(function (c) { if (c && c.v > max) max = c.v; });
  return { cells: cells, max: max, key: key };
}

/* ---------------- 预算 ---------------- */
function budgetOf(key) { return S.budgets[key] || { total: 0, cats: {} }; }
function monthExpense(key) {
  var rg = { from: firstOfMonth(key), to: lastOfMonth(key) };
  return summarize(rangeTxns(rg)).out;
}

/* ---------------- 导出给其他文件 ---------------- */
window.__L = {
  APP_VERSION: APP_VERSION, DAY: DAY, SLOTS: SLOTS, PALETTE: PALETTE, ICONS: ICONS,
  $: $, $$: $$, esc: esc, clamp: clamp, sum: sum, pad2: pad2, trimZero: trimZero,
  num: num, yuan: yuan, yuanS: yuanS, shortYuan: shortYuan, axisYuan: axisYuan, pct: pct,
  iso: iso, todayISO: todayISO, parseISO: parseISO, addDaysISO: addDaysISO,
  addMonthsKey: addMonthsKey, monthKey: monthKey, firstOfMonth: firstOfMonth,
  lastOfMonth: lastOfMonth, wdName: wdName, mdLabel: mdLabel, cnMonth: cnMonth,
  dateLabel: dateLabel, WD: WD,
  Store: Store, S: S, seedData: seedData, loadState: loadState, persist: persist,
  catById: catById, acctById: acctById, latestDate: latestDate, earliestDate: earliestDate,
  anchorKey: anchorKey, resolveRange: resolveRange, rangeTxns: rangeTxns, summarize: summarize,
  daysBetween: daysBetween, effEnd: effEnd, dailySeries: dailySeries, bucketSeries: bucketSeries,
  catAggregate: catAggregate, catDelta: catDelta, prevRange: prevRange,
  monthlySeries: monthlySeries, balanceCurve: balanceCurve, currentBalances: currentBalances,
  heatGrid: heatGrid, slotOf: slotOf, calendarMonth: calendarMonth,
  budgetOf: budgetOf, monthExpense: monthExpense
};
})();
