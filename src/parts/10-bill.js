/* ============================================================
   史高治账本 · 信用卡账单文本解析
   从邮箱里全选复制的账单正文 -> 交易行 -> 走原有 importRows 落库
   ============================================================ */
(function () {
  'use strict';

  var GROUPS = ['还款', '分期', '退款', '消费'];

  /* 账单里的商户类别 -> 账本已有的分类名（避免导入时凭空建一堆新分类） */
  var CAT_MAP = {
    '交通出行': '交通出行',
    '餐饮美食': '餐饮美食',
    '便利超市': '日用百货',
    '网购电商': '日用百货',
    '休闲娱乐': '文化休闲',
    '生活服务': '商业服务',
    '医疗健康': '医疗健康',
    '个人转账': '人情往来',
    '其他': '日用百货'
  };

  /* 关键词表：命中即归类 */
  var RULES = [
    { cat: '交通出行', kw: ['高德打车', '滴滴', '地铁', '公交', '停车', '加油', '充电桩', '共享单车', '哈啰', '青桔', '铁路', '航空', '机票', '车费', '出行'] },
    { cat: '餐饮美食', kw: ['三快', '拉扎斯', '饿了么', '美团', '金拱门', '麦当劳', '肯德基', '百胜', '大家乐', '萨莉亚', '瑞幸', 'luckin', '咖啡', '餐', '食堂', '饭堂', '酒吧', '茶', '烘焙', '面包', '甜', '烧烤', '火锅', '精酿', '饮食', '厨', '威士忌', 'CAFE', '名点', '轩', '食府', '小馆'] },
    { cat: '便利超市', kw: ['便利店', '超市', '罗森', '赛壹', '福满家', '喜市多', '24H', '百世邻里', '七鲜', '赵一鸣', '零食', '卖场', '生鲜', '菜市场', '伊莎', '连锁店', '华西店', '美喜福', '8字'] },
    { cat: '网购电商', kw: ['京东', '天猫', '淘宝', '拼多多', '得物', '义乌', '贸易', '电子商务', '商城', '旗舰店', '专营店', '供应链', '百货', '优选'] },
    { cat: '休闲娱乐', kw: ['院线', '电影', '哔哩', '演出', '太合', '音乐', '游戏', 'KTV', '剧本', '密室', '健身', '运动', 'Yotree', '名创', '公园', '文旅'] },
    { cat: '生活服务', kw: ['充电', '保洁', '物业', '维修', '快递', '洗衣', '洗车', '摄影', '美容', '理发', '家居', '环保', '智联', '物联', '通信', '移动', '联通', '电信'] },
    { cat: '医疗健康', kw: ['药', '医院', '诊所', '体检', '口腔', '海诺', '口罩'] },
    { cat: '个人转账', kw: ['转账', '红包'] }
  ];

  /* 企业/店铺特征词：命中说明是商家，不是「转给某个人」 */
  var ORG_RE = /公司|有限|店|超市|便利|科技|商贸|餐饮|食品|广场|中心|集团|商城|市场|工厂|银行|馆|酒|咖|茶|药|酒店|公寓|物业|学校|医院|网络|信息|技术|服务|连锁|旗舰|专营|供应|贸易|电子商务|文化|传媒|实业|经营|管理|停车|院|厂|事务所|工作室/;
  var PAY_RE = /^(支付宝|财付通|微信支付|抖音支付|京东支付)[-－]/;

  function classify(desc) {
    var d = String(desc || '');
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i];
      for (var k = 0; k < r.kw.length; k++) {
        if (d.indexOf(r.kw[k]) >= 0) return r.cat;
      }
    }
    /* 付给某个「人名」（没有商家特征词）-> 个人转账 */
    if (PAY_RE.test(d)) {
      var who = d.replace(PAY_RE, '');
      if (who && !ORG_RE.test(who)) return '个人转账';
    }
    return '其他';
  }

  function isDateTok(s) {
    var m = /^(\d{2})(\d{2})$/.exec(s);
    if (!m) return false;
    var mo = +m[1], d = +m[2];
    return mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
  }
  function isMoneyTok(s) { return /^[¥￥]\s*-?[\d,]+\.?\d*$/.test(s); }
  function isLocalTok(s) { return /^-?[\d,]+\.\d{2}$/.test(s); }
  function toNum(s) { return parseFloat(String(s).replace(/[¥￥,\s]/g, '')); }

  function ymd(y, mo, d) {
    return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
  }

  /* 账单头：周期 / 额度 / 应还 / 最低 / 到期 / 账户明细 */
  function parseHead(head) {
    var meta = { from: '', to: '', credit: null, amount: null, minDue: null, due: '', acct: [] };
    var RANGE = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\s*[-–—~]\s*(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/;
    var ONE = /^\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}$/;
    var money = [], dates = [];

    head.forEach(function (L) {
      var m = RANGE.exec(L);
      if (m) {
        if (!meta.from) {
          meta.from = ymd(m[1], m[2], m[3]);
          meta.to = ymd(m[4], m[5], m[6]);
        }
        return;
      }
      if (isMoneyTok(L)) { money.push(toNum(L)); return; }
      if (ONE.test(L)) dates.push(L.replace(/[\/.]/g, '-'));
    });

    if (money.length >= 3) { meta.credit = money[0]; meta.amount = money[1]; meta.minDue = money[2]; }
    if (dates.length) meta.due = dates[0];
    meta.acct = money.slice(3, 9);
    return meta;
  }

  /* 主解析：返回 { rows, meta, stats } */
  function parseBillText(text) {
    var lines = String(text || '').split(/\r?\n/).map(function (s) { return s.trim(); });
    var head = [], grp = null, cur = null, prev = '', items = [];

    function flush() {
      if (cur && cur.amt != null) items.push(cur);
      cur = null;
    }

    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (!ln) continue;
      if (GROUPS.indexOf(ln) >= 0) { flush(); grp = ln; prev = 'grp'; continue; }
      if (grp === null) { head.push(ln); continue; }

      /* 紧跟人民币金额的 4 位数字 = 卡号末四位（不能和 MMDD 日期混） */
      if (prev === 'amt' && cur && !cur.card && /^\d{4}$/.test(ln)) { cur.card = ln; prev = 'card'; continue; }

      if (isDateTok(ln)) {
        if (cur && cur.amt != null) flush();
        if (!cur) cur = { grp: grp, d1: ln, d2: null, desc: '', amt: null, card: null, country: '', local: null };
        else if (!cur.d2) cur.d2 = ln;
        prev = 'date'; continue;
      }
      if (!cur) continue;
      if (cur.amt == null) {
        if (isMoneyTok(ln)) { cur.amt = toNum(ln); prev = 'amt'; }
        else { cur.desc = (cur.desc + ln).trim(); prev = 'desc'; }
        continue;
      }
      if (!cur.country && /^[A-Z]{2}$/.test(ln)) { cur.country = ln; prev = 'ctry'; continue; }
      if (cur.local == null && isLocalTok(ln)) { cur.local = toNum(ln); prev = 'local'; continue; }
      prev = 'other';
    }
    flush();

    if (!items.length) throw new Error('没识别到交易记录。确认粘贴的是账单正文，并且包含「还款 / 消费」这类分组标题。');

    var meta = parseHead(head);
    /* 年份：账单周期内的日期落在哪个月，就用哪年 */
    var y1 = meta.from ? +meta.from.slice(0, 4) : new Date().getFullYear();
    var y2 = meta.to ? +meta.to.slice(0, 4) : y1;
    var m1 = meta.from ? +meta.from.slice(5, 7) : 1;

    var rows = [], stats = { expense: 0, refund: 0, install: 0, repay: 0, nExp: 0, nRef: 0, nIns: 0, nRep: 0 };

    items.forEach(function (t) {
      var mo = +t.d1.slice(0, 2), d = +t.d1.slice(2, 4);
      var y = mo >= m1 ? y1 : y2;
      var date = ymd(y, mo, d);

      var cat = classify(t.desc);
      var clean = String(t.desc).replace(PAY_RE, '').trim() || t.desc;
      if (clean.length > 40) clean = clean.slice(0, 40);

      if (t.grp === '还款') {
        stats.repay += t.amt; stats.nRep++;
        return;                       /* 还款不是消费，默认不进账本 */
      }
      if (t.grp === '退款') {
        stats.refund += t.amt; stats.nRef++;
        rows.push({
          type: 'income', amount: Math.abs(t.amt), date: date, time: '12:00',
          cat1: '其他收入', cat2: '退款',
          acct: '', acct2: '',
          note: '退款·' + clean, tags: ['信用卡退款']
        });
        return;
      }
      if (t.grp === '分期') {
        stats.install += t.amt;
        if (t.amt <= 0) {             /* 贴息之类的负数，按退款处理 */
          stats.nRef++;
          rows.push({
            type: 'income', amount: Math.abs(t.amt), date: date, time: '12:00',
            cat1: '其他收入', cat2: '分期贴息',
            acct: '', acct2: '',
            note: '贴息·' + clean, tags: ['信用卡分期']
          });
          return;
        }
        stats.nIns++;
        rows.push({
          type: 'expense', amount: t.amt, date: date, time: '12:00',
          cat1: CAT_MAP[cat] || '日用百货', cat2: '分期',
          acct: '', acct2: '',
          note: clean, tags: ['信用卡分期']
        });
        return;
      }
      /* 消费 */
      if (t.amt <= 0) return;
      stats.expense += t.amt; stats.nExp++;
      rows.push({
        type: 'expense', amount: t.amt, date: date, time: '12:00',
        cat1: CAT_MAP[cat] || '日用百货', cat2: '',
        acct: '', acct2: '',
        note: clean, tags: ['信用卡账单']
      });
    });

    return { rows: rows, meta: meta, stats: stats, items: items.length };
  }

  window.__BILL = { parse: parseBillText, classify: classify, CAT_MAP: CAT_MAP };
})();
