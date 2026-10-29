/* ============================================================
   史高治账本 · 账单导入（内置 xlsx / csv 解析，零依赖）
   支持 App 导出的「收支账单」格式：日期 / 类型 / 金额 / 一级分类 /
   二级分类 / 账户1 / 账户2 / 备注 / 货币 / 标签 / 账本 …
   ============================================================ */
(function () {
'use strict';

var L = window.__L;
var esc = L.esc, pad2 = L.pad2;

/* ---------------- 字节工具 ---------------- */
function utf8(bytes) {
  return new TextDecoder('utf-8').decode(bytes);
}

/* ---------------- ZIP 读取 ---------------- */
function readZip(buf) {
  var dv = new DataView(buf), len = buf.byteLength;
  var eocd = -1;
  var lim = Math.max(0, len - 22 - 65535);
  for (var i = len - 22; i >= lim; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 xlsx（未找到 ZIP 结构）');
  var count = dv.getUint16(eocd + 10, true);
  var cdOff = dv.getUint32(eocd + 16, true);
  var entries = {}, p = cdOff;
  for (var k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    var method = dv.getUint16(p + 10, true);
    var csize = dv.getUint32(p + 20, true);
    var nameLen = dv.getUint16(p + 28, true);
    var extraLen = dv.getUint16(p + 30, true);
    var cmtLen = dv.getUint16(p + 32, true);
    var lho = dv.getUint32(p + 42, true);
    var name = utf8(new Uint8Array(buf, p + 46, nameLen));
    var lnameLen = dv.getUint16(lho + 26, true);
    var lextraLen = dv.getUint16(lho + 28, true);
    entries[name] = { method: method, start: lho + 30 + lnameLen + lextraLen, size: csize };
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return { buf: buf, entries: entries };
}

function entryBytes(zip, name) {
  var e = zip.entries[name];
  if (!e) return null;
  return new Uint8Array(zip.buf, e.start, e.size);
}

async function entryText(zip, name) {
  var e = zip.entries[name];
  if (!e) return null;
  var bytes = new Uint8Array(zip.buf, e.start, e.size);
  if (e.method === 0) return utf8(bytes);
  if (typeof DecompressionStream !== 'undefined') {
    try {
      var ds = new DecompressionStream('deflate-raw');
      var stream = new Blob([bytes]).stream().pipeThrough(ds);
      var ab = await new Response(stream).arrayBuffer();
      return utf8(new Uint8Array(ab));
    } catch (err) { /* 落到下面 */ }
  }
  throw new Error('这台浏览器不支持解压 xlsx，请把表格另存为 CSV 再导入');
}

/* ---------------- 共享字符串 / 工作表 ---------------- */
function parseShared(xml) {
  if (!xml) return [];
  var doc = new DOMParser().parseFromString(xml, 'application/xml');
  var sis = doc.getElementsByTagName('si'), out = [];
  for (var i = 0; i < sis.length; i++) {
    var ts = sis[i].getElementsByTagName('t'), s = '';
    for (var k = 0; k < ts.length; k++) s += ts[k].textContent;
    out.push(s);
  }
  return out;
}

function colIndex(ref) {
  var m = /^([A-Z]+)/.exec(ref || '');
  if (!m) return 0;
  var s = m[1], n = 0;
  for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n - 1;
}

function parseSheet(xml, shared) {
  var doc = new DOMParser().parseFromString(xml, 'application/xml');
  var rows = doc.getElementsByTagName('row'), out = [];
  for (var i = 0; i < rows.length; i++) {
    var cells = rows[i].getElementsByTagName('c');
    var arr = [];
    for (var k = 0; k < cells.length; k++) {
      var c = cells[k];
      var idx = colIndex(c.getAttribute('r'));
      var t = c.getAttribute('t');
      var v = '';
      if (t === 's') {
        var vi = c.getElementsByTagName('v')[0];
        v = vi ? (shared[+vi.textContent] || '') : '';
      } else if (t === 'inlineStr') {
        var is = c.getElementsByTagName('t');
        v = is.length ? is[0].textContent : '';
      } else {
        var vn = c.getElementsByTagName('v')[0];
        v = vn ? vn.textContent : '';
      }
      arr[idx] = v;
    }
    for (var j = 0; j < arr.length; j++) if (arr[j] == null) arr[j] = '';
    out.push(arr);
  }
  return out;
}

/* ---------------- 读取 xlsx ---------------- */
async function readXlsx(file) {
  var buf = await file.arrayBuffer();
  var zip = readZip(buf);
  var names = Object.keys(zip.entries);
  var sharedPath = names.filter(function (n) { return /^xl\/sharedStrings\.xml$/i.test(n); })[0];
  var shared = sharedPath ? parseShared(await entryText(zip, sharedPath)) : [];

  var sheets = names.filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/i.test(n); })
    .sort(function (a, b) {
      return (+(/(\d+)/.exec(a) || [, 0])[1]) - (+(/(\d+)/.exec(b) || [, 0])[1]);
    });
  if (!sheets.length) throw new Error('这个 xlsx 里没有工作表');

  /* 表名按 workbook.xml 里 <sheet> 的出现顺序取（与 sheet1.xml、sheet2.xml… 对应） */
  var wbNames = [];
  var wbPath = names.filter(function (n) { return /^xl\/workbook\.xml$/i.test(n); })[0];
  if (wbPath) {
    try {
      var wd = new DOMParser().parseFromString(await entryText(zip, wbPath), 'application/xml');
      var tags = wd.getElementsByTagName('sheet');
      for (var i = 0; i < tags.length; i++) wbNames.push(tags[i].getAttribute('name') || ('Sheet' + (i + 1)));
    } catch (e) { }
  }

  /* 全部读出来 —— 多表文件（比如本应用导出的报告：消费报告 / 消费明细 / 统计数据）
     只有其中一张是账单明细，交给 parseFile 去挑 */
  var out = [];
  for (var j = 0; j < sheets.length; j++) {
    out.push({
      name: wbNames[j] || ('Sheet' + (j + 1)),
      grid: parseSheet(await entryText(zip, sheets[j]), shared)
    });
  }
  return { sheets: out };
}

/* ---------------- CSV ---------------- */
function readCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  var rows = [], row = [], cell = '', q = false, i = 0;
  while (i < text.length) {
    var ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"') { q = true; i++; continue; }
    if (ch === ',' || ch === '\t') { row.push(cell); cell = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
    cell += ch; i++;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/* ---------------- 表头识别 ---------------- */
var HEAD = {
  date: ['日期', '交易日期', '交易时间', '记账日期', '时间', 'date', 'datetime'],
  type: ['类型', '收支', '收支类型', '交易类型', 'type'],
  amount: ['金额', '金额(元)', '金额（元）', '发生额', 'amount', 'money'],
  cat1: ['一级分类', '分类', '类别', '收支分类', 'category', 'cat'],
  cat2: ['二级分类', '子分类', '子类别', 'subcategory'],
  acct: ['账户1', '账户', '账户名', '支付账户', 'account'],
  acct2: ['账户2', '转入账户', '对方账户', 'to', 'toaccount'],
  note: ['备注', '说明', '描述', '商品说明', 'note', 'remark', 'memo'],
  cur: ['货币', '币种', 'currency'],
  tags: ['标签', 'tag', 'tags'],
  book: ['账本', '账簿', 'book'],
  refund: ['退款'],
  discount: ['优惠', '折扣'],
  fee: ['手续费'],
  loc: ['位置', '地点', '商家位置']
};

function normHead(s) {
  return String(s || '').replace(/[\s\u3000()（）:：*]/g, '').toLowerCase();
}

function mapHeader(row) {
  var map = {}, used = 0;
  for (var i = 0; i < row.length; i++) {
    var h = normHead(row[i]);
    if (!h) continue;
    for (var key in HEAD) {
      if (map[key] != null) continue;
      var cands = HEAD[key];
      for (var k = 0; k < cands.length; k++) {
        var c = normHead(cands[k]);
        if (h === c || h.indexOf(c) >= 0) { map[key] = i; used++; break; }
      }
      if (map[key] != null) break;
    }
  }
  return { map: map, used: used };
}

function findHeader(rows) {
  var best = null;
  for (var i = 0; i < Math.min(rows.length, 12); i++) {
    var r = mapHeader(rows[i]);
    if (r.used >= 3 && (!best || r.used > best.used)) best = { idx: i, map: r.map, used: r.used };
  }
  return best;
}

/* ---------------- 值解析 ---------------- */
function parseDateCell(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' || /^\d{5}(\.\d+)?$/.test(String(v).trim())) {
    var serial = +v;
    if (serial > 20000 && serial < 80000) {
      var ms = Math.round((serial - 25569) * 86400000);
      var d = new Date(ms);
      return {
        date: d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()),
        time: pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes())
      };
    }
  }
  var s = String(v).trim();
  var m = /(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/.exec(s);
  var y, mo, da, rest = '';
  if (m) { y = +m[1]; mo = +m[2]; da = +m[3]; rest = s.slice(m.index + m[0].length); }
  else {
    var m2 = /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s);
    if (!m2) return null;
    mo = +m2[1]; da = +m2[2]; y = +m2[3]; rest = s.slice(m2.index + m2[0].length);
  }
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  var tm = /(\d{1,2})\s*[:：]\s*(\d{1,2})/.exec(rest) || /(\d{1,2})\s*[:：]\s*(\d{1,2})/.exec(s);
  var time = tm ? pad2(+tm[1]) + ':' + pad2(+tm[2]) : '';
  return { date: y + '-' + pad2(mo) + '-' + pad2(da), time: time };
}

function parseAmount(v) {
  var s = String(v == null ? '' : v).replace(/[¥$,\s元圆]/g, '').replace(/，/g, '');
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function normType(raw, amount) {
  var t = String(raw || '').trim();
  /* 表格自带「类型」列时以它为准，别用分类名去猜 —— App 里「转账红包」本身记的就是支出 */
  if (/^支出|消费|付款/.test(t)) return 'expense';
  if (/^收入|入账|收款/.test(t)) return 'income';
  if (/转账|还款|借入|借出|转出|转入/.test(t)) return 'transfer';
  if (/报销/.test(t)) return 'expense';
  return amount < 0 ? 'expense' : 'income';
}

/* 按名字猜图标 */
var ICON_RULES = [
  ['餐', '🍜'], ['饭', '🍚'], ['食', '🍜'], ['咖啡', '☕'], ['奶茶', '🧋'], ['茶', '🧋'],
  ['交通', '🚇'], ['打车', '🚕'], ['地铁', '🚇'], ['公交', '🚌'], ['加油', '⛽'], ['停车', '🅿️'],
  ['购物', '🛍️'], ['日用', '🛍️'], ['超市', '🛒'], ['服饰', '👕'], ['衣', '👕'], ['鞋', '👟'],
  ['美容', '💇'], ['美发', '💇'], ['理发', '💇'], ['化妆', '💄'],
  ['医疗', '💊'], ['药', '💊'], ['健康', '🩺'],
  ['房租', '🏠'], ['居住', '🏠'], ['水电', '💡'], ['物业', '🏠'], ['家居', '🛋️'],
  ['通讯', '📱'], ['话费', '📱'], ['数码', '💻'], ['电器', '💻'], ['电子', '💻'],
  ['娱乐', '🎬'], ['休闲', '🎬'], ['电影', '🎬'], ['游戏', '🎮'], ['旅游', '✈️'], ['旅行', '✈️'],
  ['学习', '📚'], ['书', '📚'], ['教育', '📚'], ['培训', '📚'],
  ['运动', '🏃'], ['健身', '🏃'], ['户外', '🏕️'],
  ['红包', '🧧'], ['转账', '💸'], ['人情', '🎁'], ['礼物', '🎁'], ['宠物', '🐱'],
  ['生活服务', '💼'], ['服务', '💼'], ['商业', '💼'], ['快递', '📦'],
  ['工资', '💵'], ['薪', '💵'], ['奖金', '🏆'], ['理财', '📈'], ['投资', '📈'],
  ['报销', '🧾'], ['退款', '↩️'], ['其他', '✨']
];
function guessIcon(name) {
  var s = String(name || '');
  for (var i = 0; i < ICON_RULES.length; i++) if (s.indexOf(ICON_RULES[i][0]) >= 0) return ICON_RULES[i][1];
  return '✨';
}
function guessColor(name, seed) {
  var s = String(name || ''), h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return L.PALETTE[(h + (seed || 0)) % L.PALETTE.length];
}

/* ---------------- JSON 备份 ---------------- */
async function parseBackup(file) {
  var txt = await file.text();
  var obj;
  try { obj = JSON.parse(txt); } catch (e) { throw new Error('JSON 解析失败，文件可能不完整'); }
  if (!obj || !Array.isArray(obj.txns)) throw new Error('这不像是账本备份（缺少 txns 记录数组）');

  var txns = obj.txns.filter(function (t) { return t && t.date && t.amount != null && t.type; });
  if (!txns.length) throw new Error('备份里没有可恢复的记录');
  var dates = txns.map(function (t) { return t.date; }).sort();

  return {
    kind: 'backup',
    data: obj,
    fileName: file.name || '备份.json',
    nTxns: txns.length,
    nCats: (obj.cats || []).length,
    nAccts: (obj.accts || []).length,
    nBudgets: Object.keys(obj.budgets || {}).length,
    exportedAt: obj.exportedAt || '',
    from: dates[0],
    to: dates[dates.length - 1]
  };
}

/* ---------------- 主流程：解析成待导入记录 ---------------- */
async function parseFile(file) {
  var name = (file.name || '').toLowerCase();
  if (/\.json$/.test(name)) return await parseBackup(file);

  var cands = [];
  if (/\.xlsx?$/.test(name)) {
    cands = (await readXlsx(file)).sheets;
  } else if (/\.csv$/.test(name) || /\.txt$/.test(name)) {
    var text = await file.text();
    /* 有些系统会把备份存成 .txt，嗅一下内容 */
    if (/^\s*\{/.test(text) && text.indexOf('"txns"') >= 0) return await parseBackup(file);
    cands = [{ name: 'CSV', grid: readCsv(text) }];
  } else {
    throw new Error('只支持 .xlsx / .xls / .csv / .json 文件');
  }
  if (!cands.length) throw new Error('文件里没有读到内容');

  /* 多表时逐张试：谁能认出表头、且表头下「有日期有金额」的行最多，就用谁 */
  var pick = null;
  cands.forEach(function (c) {
    if (!c.grid || !c.grid.length) return;
    var h = findHeader(c.grid);
    if (!h) return;
    var n = 0;
    for (var i = h.idx + 1; i < c.grid.length; i++) {
      var g = c.grid[i];
      if (!g) continue;
      if (parseDateCell(g[h.map.date]) && parseAmount(g[h.map.amount])) n++;
    }
    if (n > 0 && (!pick || n > pick.n)) pick = { grid: c.grid, head: h, name: c.name, n: n };
  });
  if (!pick) throw new Error('没找到表头（需要至少有「日期 / 类型 / 金额」中的两三个列名）');

  var grid = pick.grid, head = pick.head;
  var map = head.map;
  var rows = [];
  for (var i = head.idx + 1; i < grid.length; i++) {
    var g = grid[i];
    if (!g || !g.length) continue;
    var any = false;
    for (var k = 0; k < g.length; k++) if (String(g[k]).trim() !== '') { any = true; break; }
    if (!any) continue;

    var dt = parseDateCell(g[map.date]);
    if (!dt) continue;                       /* 没有日期的行跳过（小计/空行） */
    var amtRaw = parseAmount(g[map.amount]);
    if (!amtRaw) continue;

    var cat1 = String(g[map.cat1] || '').trim();
    var cat2 = String(g[map.cat2] || '').trim();
    var type = normType(g[map.type], amtRaw);
    /* 转账必须有转入账户，否则按金额正负退回收入/支出 */
    var acct2v = map.acct2 != null ? String(g[map.acct2] || '').trim() : '';
    if (type === 'transfer' && !acct2v) type = amtRaw < 0 ? 'expense' : 'income';
    var note = String(g[map.note] || '').trim();
    var extra = [];
    if (map.discount != null) {
      var dis = parseAmount(g[map.discount]);
      if (dis) extra.push('优惠 ' + L.num(dis, 2));
    }
    if (map.fee != null) {
      var fee = parseAmount(g[map.fee]);
      if (fee) extra.push('手续费 ' + L.num(fee, 2));
    }
    var tags = String(g[map.tags] || '').split(/[,，;；\s]+/).filter(Boolean);
    rows.push({
      type: type,
      amount: Math.abs(amtRaw),
      date: dt.date,
      time: dt.time,
      cat1: cat1 || (type === 'income' ? '其他收入' : '未分类'),
      cat2: cat2,
      acct: String(g[map.acct] || '').trim(),
      acct2: acct2v,
      note: note + (extra.length ? '（' + extra.join('，') + '）' : ''),
      tags: tags,
      book: String(g[map.book] || '').trim()
    });
  }
  if (!rows.length) throw new Error('没有解析到有效记录（检查日期与金额列）');
  rows.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.time || '') < (b.time || '') ? -1 : 1;
  });

  var dates = rows.map(function (r) { return r.date; });
  return {
    kind: 'rows',
    rows: rows,
    fileName: file.name || '账单',
    sheetName: pick.name,
    from: dates[0],
    to: dates[dates.length - 1],
    cols: Object.keys(map).length
  };
}

/* ---------------- 落库 ---------------- */
function importRows(rows, opt) {
  opt = opt || {};
  var S = L.S;
  var created = { cats: 0, accts: 0 }, dup = 0, added = 0;

  if (opt.mode === 'replace') {
    S.txns = [];
  }

  /* 现有指纹，用于去重 */
  var seen = {};
  if (opt.skipDup && opt.mode !== 'replace') {
    S.txns.forEach(function (t) {
      seen[[t.date, t.time || '', t.type, Math.round(t.amount * 100), (t.cat || ''), (t.note || '')].join('|')] = 1;
    });
  }

  function ensureCat(name, type) {
    for (var i = 0; i < S.cats.length; i++) {
      if (S.cats[i].name === name && S.cats[i].type === type) return S.cats[i];
    }
    var id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    var c = {
      id: id, name: name, type: type,
      icon: guessIcon(name), color: guessColor(name, S.cats.length)
    };
    S.cats.push(c); created.cats++;
    return c;
  }
  function ensureAcct(name, type) {
    if (!name) name = opt.defaultAcct || '导入账户';
    for (var i = 0; i < S.accts.length; i++) {
      if (S.accts[i].name === name) return S.accts[i];
    }
    var id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    var a = {
      id: id, name: name, sub: '导入', type: type || 'asset',
      icon: /信用卡|花呗|白条|借/.test(name) ? '💳' : '🏦',
      color: guessColor(name, 3), opening: 0
    };
    S.accts.push(a); created.accts++;
    return a;
  }

  var base = Date.now();
  rows.forEach(function (r, i) {
    var fp = [r.date, r.time || '', r.type, Math.round(r.amount * 100), r.cat1, r.note || ''].join('|');
    if (opt.skipDup && seen[fp]) { dup++; return; }
    seen[fp] = 1;

    var cat = ensureCat(r.cat1, r.type === 'income' ? 'income' : 'expense');
    var acctName = r.acct || opt.defaultAcct || '导入账户';
    var acct = ensureAcct(acctName, 'asset');

    var t = {
      id: 'i' + (base + i).toString(36),
      type: r.type,
      amount: r.amount,
      date: r.date,
      time: r.time || '12:00',
      cat: cat.id,
      acct: acct.id,
      note: r.note || '',
      tags: r.tags || []
    };
    if (r.cat2) t.sub = r.cat2;
    if (r.type === 'transfer') {
      var to = ensureAcct(r.acct2 || opt.defaultAcct || '导入账户', 'asset');
      t.toAcct = to.id;
    }
    S.txns.push(t);
    added++;
  });

  S.txns.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.time || '') < (b.time || '') ? -1 : 1;
  });

  S.isSeed = false;
  S.ledgerMonth = L.monthKey(L.latestDate() || L.todayISO());
  S.calKey = S.ledgerMonth;
  S.range = 'all';
  S.rangeOff = 0;
  S.f.from = ''; S.f.to = '';
  L.persist();

  return { added: added, dup: dup, cats: created.cats, accts: created.accts };
}

window.__IMP = {
  parseFile: parseFile, importRows: importRows,
  readXlsx: readXlsx, readCsv: readCsv, parseDateCell: parseDateCell,
  guessIcon: guessIcon, guessColor: guessColor
};
})();
