/* ============================================================
   史高治账本 · 导出：带图表的 xlsx（零依赖，手写 ZIP + OOXML）
   —— 结论：STORE 不压缩，inline 字符串，4 张图表，A4 一页
   ============================================================ */
(function () {
'use strict';

var L = window.__L;
var esc = L.esc;

/* ---------------- CRC32 / ZIP ---------------- */
var CRC_TBL = (function () {
  var t = new Int32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(u8) {
  var c = -1;
  for (var i = 0; i < u8.length; i++) c = (c >>> 8) ^ CRC_TBL[(c ^ u8[i]) & 0xFF];
  return (c ^ -1) >>> 0;
}

var DOS_DATE = 0x5D5A;   /* 2026-10-26，固定值让产物可复现 */
var DOS_TIME = 0x6000;   /* 12:00 */

function zipStore(files) {
  var enc = new TextEncoder();
  var parts = [], central = [], offset = 0;

  files.forEach(function (f) {
    var nameB = enc.encode(f.name);
    var data = f.data;
    var crc = crc32(data);

    var lh = new Uint8Array(30 + nameB.length);
    var lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);        /* UTF-8 文件名 */
    lv.setUint16(8, 0, true);             /* STORE */
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameB.length, true);
    lv.setUint16(28, 0, true);
    lh.set(nameB, 30);
    parts.push(lh, data);

    var cd = new Uint8Array(46 + nameB.length);
    var cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameB.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cd.set(nameB, 46);
    central.push(cd);

    offset += lh.length + data.length;
  });

  var cdSize = central.reduce(function (a, b) { return a + b.length; }, 0);
  var eocd = new Uint8Array(22);
  var ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  var total = offset + cdSize + 22;
  var out = new Uint8Array(total), p = 0;
  parts.forEach(function (b) { out.set(b, p); p += b.length; });
  central.forEach(function (b) { out.set(b, p); p += b.length; });
  out.set(eocd, p);
  return out;
}

function xmlStr(s) {
  return new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + s);
}

/* ---------------- 单元格 / 行 ---------------- */
function S(v, s) { return { v: v, s: s == null ? 7 : s, t: 's' }; }
function N(v, s) { return { v: v, s: s == null ? 8 : s, t: 'n' }; }
function colName(i) {
  var n = i + 1, s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function cellXml(ref, c) {
  if (!c || c.v === '' || c.v == null) return '';
  var s = ' s="' + c.s + '"';
  if (c.t === 'n') {
    var num = +c.v;
    if (!isFinite(num)) num = 0;
    return '<c r="' + ref + '"' + s + '><v>' + num + '</v></c>';
  }
  return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + esc(c.v) + '</t></is></c>';
}
function rowsXml(rows, startRow) {
  var out = '';
  rows.forEach(function (row, i) {
    var r = (startRow || 1) + i;
    var cells = '';
    var arr = row.cells || row;
    arr.forEach(function (c, ci) {
      if (!c) return;
      cells += cellXml(colName(ci) + r, c);
    });
    if (!cells) {
      out += '<row r="' + r + '"' + (row.h ? ' ht="' + row.h + '" customHeight="1"' : '') + '/>';
      return;
    }
    out += '<row r="' + r + '"' + (row.h ? ' ht="' + row.h + '" customHeight="1"' : '') + '>' + cells + '</row>';
  });
  return out;
}

/* ---------------- styles.xml ---------------- */
function stylesXml() {
  var fonts = [
    '<font><sz val="10"/><color rgb="FF3A4453"/><name val="微软雅黑"/><charset val="134"/></font>',
    '<font><b/><sz val="18"/><color rgb="FF16273F"/><name val="微软雅黑"/><charset val="134"/></font>',
    '<font><sz val="9.5"/><color rgb="FF7A8797"/><name val="微软雅黑"/><charset val="134"/></font>',
    '<font><sz val="9"/><color rgb="FF7A8797"/><name val="微软雅黑"/><charset val="134"/></font>',
    '<font><b/><sz val="12.5"/><color rgb="FF16273F"/><name val="微软雅黑"/><charset val="134"/></font>',
    '<font><sz val="8"/><color rgb="FF9AA5B4"/><name val="微软雅黑"/><charset val="134"/></font>',
    '<font><b/><sz val="9.5"/><color rgb="FFFFFFFF"/><name val="微软雅黑"/><charset val="134"/></font>',
    '<font><b/><sz val="11"/><color rgb="FF16273F"/><name val="微软雅黑"/><charset val="134"/></font>',
    '<font><sz val="8.5"/><color rgb="FF8E9AAB"/><name val="微软雅黑"/><charset val="134"/></font>'
  ];
  var fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF16273F"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF4F7FB"/><bgColor indexed="64"/></patternFill></fill>'
  ];
  var borders = [
    '<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE6ECF5"/></bottom><diagonal/></border>'
  ];
  var xfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    '<xf numFmtId="0" fontId="6" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>',
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
    '<xf numFmtId="165" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="7" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>',
    '<xf numFmtId="0" fontId="8" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>',
    '<xf numFmtId="165" fontId="4" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>',
    '<xf numFmtId="166" fontId="4" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>',
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>'
  ];
  return '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3">' +
      '<numFmt numFmtId="164" formatCode="0.0%"/>' +
      '<numFmt numFmtId="165" formatCode="&quot;¥&quot;#,##0.00;-&quot;¥&quot;#,##0.00"/>' +
      '<numFmt numFmtId="166" formatCode="#,##0"/>' +
    '</numFmts>' +
    '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts>' +
    '<fills count="' + fills.length + '">' + fills.join('') + '</fills>' +
    '<borders count="' + borders.length + '">' + borders.join('') + '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';
}

/* ---------------- 图表 XML 零件 ---------------- */
function txPr(sz, color, bold) {
  return '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="' + sz + '"' + (bold ? ' b="1"' : '') + '>' +
    '<a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill>' +
    '<a:latin typeface="微软雅黑"/><a:ea typeface="微软雅黑"/></a:defRPr></a:pPr>' +
    '<a:endParaRPr lang="zh-CN"/></a:p></c:txPr>';
}
function chartTitle(text) {
  return '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p>' +
    '<a:pPr><a:defRPr sz="1100" b="1"><a:solidFill><a:srgbClr val="16273F"/></a:solidFill>' +
    '<a:latin typeface="微软雅黑"/><a:ea typeface="微软雅黑"/></a:defRPr></a:pPr>' +
    '<a:r><a:rPr lang="zh-CN" sz="1100" b="1"><a:solidFill><a:srgbClr val="16273F"/></a:solidFill>' +
    '<a:latin typeface="微软雅黑"/><a:ea typeface="微软雅黑"/></a:rPr><a:t>' + esc(text) + '</a:t></a:r>' +
    '</a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>';
}
function serCat(ref, names) {
  var pts = names.map(function (n, i) {
    return '<c:pt idx="' + i + '"><c:v>' + esc(n) + '</c:v></c:pt>';
  }).join('');
  return '<c:cat><c:strRef><c:f>' + esc(ref) + '</c:f>' +
    '<c:strCache><c:ptCount val="' + names.length + '"/>' + pts + '</c:strCache></c:strRef></c:cat>';
}
function serVal(ref, vals, fmt) {
  var pts = vals.map(function (v, i) {
    var n = +v;
    if (!isFinite(n)) n = 0;
    return '<c:pt idx="' + i + '"><c:v>' + (Math.round(n * 10000) / 10000) + '</c:v></c:pt>';
  }).join('');
  return '<c:val><c:numRef><c:f>' + esc(ref) + '</c:f>' +
    '<c:numCache><c:formatCode>' + (fmt || 'General') + '</c:formatCode>' +
    '<c:ptCount val="' + vals.length + '"/>' + pts + '</c:numCache></c:numRef></c:val>';
}
function solid(color) {
  return '<a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill>';
}
function dLbls(o) {
  o = o || {};
  var s = '<c:dLbls>';
  if (o.numFmt) s += '<c:numFmt formatCode="' + o.numFmt + '" sourceLinked="0"/>';
  if (o.txPr) s += txPr(o.txPr[0], o.txPr[1], true);
  if (o.pos) s += '<c:dLblPos val="' + o.pos + '"/>';
  s += '<c:showLegendKey val="0"/>' +
    '<c:showVal val="' + (o.val ? 1 : 0) + '"/>' +
    '<c:showCatName val="0"/><c:showSerName val="0"/>' +
    '<c:showPercent val="0"/><c:showBubbleSize val="0"/>';
  s += '</c:dLbls>';
  return s;
}
function catAx(id, cross, o) {
  o = o || {};
  return '<c:catAx><c:axId val="' + id + '"/>' +
    '<c:scaling><c:orientation val="' + (o.rev ? 'maxMin' : 'minMax') + '"/></c:scaling>' +
    '<c:delete val="0"/><c:axPos val="' + (o.pos || 'b') + '"/>' +
    '<c:numFmt formatCode="General" sourceLinked="1"/>' +
    '<c:majorTickMark val="none"/><c:minorTickMark val="none"/>' +
    '<c:tickLblPos val="' + (o.lblPos || 'nextTo') + '"/>' +
    '<c:spPr><a:ln w="9525">' + solid('DFE5EE') + '</a:ln></c:spPr>' +
    txPr('800', '8E9AAB') +
    '<c:crossAx val="' + cross + '"/><c:crosses val="autoZero"/>' +
    '<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/>' +
    '<c:noMultiLvlLbl val="0"/></c:catAx>';
}
function valAx(id, cross, o) {
  o = o || {};
  var grid = '<c:majorGridlines><c:spPr><a:ln w="9525">' + solid('EFF3F9') + '</a:ln></c:spPr></c:majorGridlines>';
  return '<c:valAx><c:axId val="' + id + '"/>' +
    '<c:scaling><c:orientation val="minMax"/></c:scaling>' +
    '<c:delete val="0"/><c:axPos val="' + (o.pos || 'l') + '"/>' +
    grid +
    '<c:numFmt formatCode="' + (o.numFmt || '#,##0') + '" sourceLinked="0"/>' +
    '<c:majorTickMark val="none"/><c:minorTickMark val="none"/>' +
    '<c:tickLblPos val="nextTo"/>' +
    '<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>' +
    txPr('800', '8E9AAB') +
    '<c:crossAx val="' + cross + '"/><c:crosses val="autoZero"/>' +
    '<c:crossBetween val="between"/></c:valAx>';
}
function chartSpace(o) {
  return '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<c:roundedCorners val="0"/>' +
    '<c:chart>' + chartTitle(o.title) +
    '<c:plotArea><c:layout/>' + o.plot + '</c:plotArea>' +
    (o.legend === false ? '' :
      '<c:legend><c:legendPos val="b"/><c:overlay val="0"/>' + txPr('850', '6B7481') + '</c:legend>') +
    '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>' +
    '</c:chart>' +
    '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="850">' +
    '<a:solidFill><a:srgbClr val="6B7481"/></a:solidFill>' +
    '<a:latin typeface="微软雅黑"/><a:ea typeface="微软雅黑"/></a:defRPr></a:pPr>' +
    '<a:endParaRPr lang="zh-CN"/></a:p></c:txPr>' +
    '</c:chartSpace>';
}

/* 四个具体图表 */
function chartDaily(dir, catRef, cats, valRef, vals, axisFmt) {
  var ser = '<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>支出</c:v></c:tx>' +
    '<c:spPr>' + solid('F0716A') + '<a:ln><a:noFill/></a:ln></c:spPr>' +
    '<c:invertIfNegative val="0"/>' +
    serCat(catRef, cats) + serVal(valRef, vals) + '</c:ser>';
  var plot;
  if (dir === 'col') {
    plot = '<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>' +
      ser + '<c:gapWidth val="45"/><c:axId val="71200001"/><c:axId val="71200002"/></c:barChart>' +
      catAx('71200001', '71200002', { lblPos: 'low' }) +
      valAx('71200002', '71200001', { numFmt: axisFmt });
  } else {
    plot = '<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>' +
      ser.replace('<c:invertIfNegative val="0"/>', '<c:marker val="0"/>') +
      '<c:smooth val="0"/><c:axId val="71200001"/><c:axId val="71200002"/></c:lineChart>' +
      catAx('71200001', '71200002', {}) +
      valAx('71200002', '71200001', { numFmt: axisFmt });
  }
  return chartSpace({ title: dir === 'col' ? '每日支出' : '支出趋势', plot: plot, legend: false });
}

function chartCatRank(catRef, cats, valRef, pcts) {
  var ser = '<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>占比</c:v></c:tx>' +
    '<c:spPr>' + solid('F0A05A') + '<a:ln><a:noFill/></a:ln></c:spPr>' +
    '<c:invertIfNegative val="0"/>' +
    dLbls({ numFmt: '0.0%', pos: 'outEnd', val: 1, txPr: ['900', '16273F'] }) +
    serCat(catRef, cats) + serVal(valRef, pcts) + '</c:ser>';
  var plot = '<c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:varyColors val="0"/>' +
    ser + '<c:gapWidth val="45"/><c:axId val="71200011"/><c:axId val="71200012"/></c:barChart>' +
    catAx('71200011', '71200012', { pos: 'l', rev: true }) +
    valAx('71200012', '71200011', { pos: 'b', numFmt: '0%' });
  return chartSpace({ title: '支出分类排行（占比）', plot: plot, legend: false });
}

function chartMonthly(catRef, cats, refInc, inc, refExp, exp) {
  var s1 = '<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>收入</c:v></c:tx>' +
    '<c:spPr>' + solid('4ECB8F') + '<a:ln><a:noFill/></a:ln></c:spPr>' +
    '<c:invertIfNegative val="0"/>' +
    serCat(catRef, cats) + serVal(refInc, inc) + '</c:ser>';
  var s2 = '<c:ser><c:idx val="1"/><c:order val="1"/><c:tx><c:v>支出</c:v></c:tx>' +
    '<c:spPr>' + solid('F0716A') + '<a:ln><a:noFill/></a:ln></c:spPr>' +
    '<c:invertIfNegative val="0"/>' +
    serCat(catRef, cats) + serVal(refExp, exp) + '</c:ser>';
  var plot = '<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>' +
    s1 + s2 + '<c:gapWidth val="60"/><c:overlap val="-12"/>' +
    '<c:axId val="71200021"/><c:axId val="71200022"/></c:barChart>' +
    catAx('71200021', '71200022', {}) +
    valAx('71200022', '71200021', { numFmt: '#,##0' });
  return chartSpace({ title: '月度收支', plot: plot });
}

function chartRate(catRef, cats, refRate, rates, refLine, line) {
  var s1 = '<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>储蓄率</c:v></c:tx>' +
    '<c:spPr><a:ln w="28575">' + solid('2F79E0') + '<a:round/></a:ln></c:spPr>' +
    '<c:marker><c:symbol val="circle"/><c:size val="4"/><c:spPr>' + solid('2F79E0') +
    '<a:ln w="9525">' + solid('FFFFFF') + '</a:ln></c:spPr></c:marker>' +
    serCat(catRef, cats) + serVal(refRate, rates) + '</c:ser>';
  var s2 = '<c:ser><c:idx val="1"/><c:order val="1"/><c:tx><c:v>健康线 20%</c:v></c:tx>' +
    '<c:spPr><a:ln w="19050" cap="rnd">' + solid('9FC7AE') + '<a:prstDash val="dash"/></a:ln></c:spPr>' +
    '<c:marker><c:symbol val="none"/></c:marker>' +
    serCat(catRef, cats) + serVal(refLine, line) + '</c:ser>';
  var plot = '<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>' +
    s1 + s2 + '<c:smooth val="0"/><c:axId val="71200031"/><c:axId val="71200032"/></c:lineChart>' +
    catAx('71200031', '71200032', {}) +
    valAx('71200032', '71200031', { numFmt: '0%' });
  return chartSpace({ title: '储蓄率走势', plot: plot });
}

/* ---------------- 绘图容器 ---------------- */
function drawingXml(anchors) {
  var body = anchors.map(function (a, i) {
    return '<xdr:twoCellAnchor editAs="oneCell">' +
      '<xdr:from><xdr:col>' + a[0] + '</xdr:col><xdr:colOff>0</xdr:colOff>' +
      '<xdr:row>' + a[1] + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>' +
      '<xdr:to><xdr:col>' + a[2] + '</xdr:col><xdr:colOff>0</xdr:colOff>' +
      '<xdr:row>' + a[3] + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
      '<xdr:graphicFrame macro="">' +
        '<xdr:nvGraphicFramePr><xdr:cNvPr id="' + (i + 2) + '" name="图表 ' + (i + 1) + '"/>' +
        '<xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>' +
        '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>' +
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">' +
        '<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId' + (i + 1) + '"/>' +
        '</a:graphicData></a:graphic></xdr:graphicFrame>' +
      '<xdr:clientData/></xdr:twoCellAnchor>';
  }).join('');
  return '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' + body + '</xdr:wsDr>';
}

/* ---------------- 取数 ---------------- */
function collect() {
  var rg = L.resolveRange();
  var endD = L.effEnd(rg);
  var list = L.rangeTxns(rg);
  var s = L.summarize(list);
  var days = Math.max(1, L.daysBetween(rg.from, endD));

  var cats = L.catDelta(rg, 'expense').filter(function (c) { return c.amount > 0; }).slice(0, 10);
  var months = L.monthlySeries(12);
  while (months.length > 1 && !months[0].inc && !months[0].exp) months.shift();

  var gran = days > 60 ? 'week' : 'day';
  var daily = L.bucketSeries({ from: rg.from, to: endD }, 'expense', gran);

  var biggest = null, maxN = 0;
  list.forEach(function (t) {
    if (t.type === 'expense' && t.amount > maxN) { maxN = t.amount; biggest = t; }
  });

  return {
    rg: rg, endD: endD, list: list, s: s, days: days,
    cats: cats, months: months, gran: gran, daily: daily, biggest: biggest
  };
}

/* ---------------- 组装 ---------------- */
function build() {
  var d = collect();
  var s = d.s;
  if (!d.list.length) throw new Error('当前范围内没有记录');

  var Q = function (name) { return "'" + name + "'!"; };
  var ST = '统计数据';
  var CR = Q(ST);

  /* ===== 统计数据 sheet ===== */
  var stat = [];
  function push(cells, h) { stat.push({ cells: cells, h: h }); return stat.length; }

  push([S('图表数据（本页供上面的图表引用，可忽略）', 11)]);
  push([]);

  push([S('支出分类 Top10', 11)]);
  push([S('分类', 6), S('金额', 6), S('占比', 6), S('笔数', 6), S('上期', 6), S('环比', 6)]);
  var rCat0 = stat.length + 1;
  var catNames = [], catPcts = [], catAmts = [];
  d.cats.forEach(function (c) {
    catNames.push(c.name);
    catPcts.push(c.pct);
    catAmts.push(c.amount);
    push([S(c.name, 7), N(c.amount, 8), N(c.pct, 9), N(c.count, 17), N(c.prev || 0, 8), N(c.delta || 0, 8)]);
  });
  var rCat1 = stat.length;

  push([]);
  push([S('月度收支', 11)]);
  push([S('月份', 6), S('收入', 6), S('支出', 6), S('结余', 6), S('储蓄率', 6), S('健康线', 6)]);
  var rMon0 = stat.length + 1;
  var monNames = [], monInc = [], monExp = [], monRate = [], monLine = [];
  d.months.forEach(function (m) {
    monNames.push(m.label);
    monInc.push(m.inc);
    monExp.push(m.exp);
    monRate.push(m.rate == null ? 0 : m.rate);
    monLine.push(0.2);
    push([S(m.label, 7), N(m.inc, 8), N(m.exp, 8), N(m.net, 8),
      m.rate == null ? S('—', 9) : N(m.rate, 9), N(0.2, 9)]);
  });
  var rMon1 = stat.length;

  push([]);
  push([S(d.gran === 'week' ? '每周支出' : '每日支出', 11)]);
  push([S('时间', 6), S('支出', 6)]);
  var rDay0 = stat.length + 1;
  var dayNames = [], dayVals = [];
  d.daily.forEach(function (x) {
    dayNames.push(x.label);
    dayVals.push(x.v);
    push([S(x.label, 7), N(x.v, 8)]);
  });
  var rDay1 = stat.length;

  var statRows = rowsXml(stat);
  var statSheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<dimension ref="A1:F' + stat.length + '"/>' +
    '<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    '<cols><col min="1" max="1" width="20" customWidth="1"/>' +
    '<col min="2" max="6" width="13" customWidth="1"/></cols>' +
    '<sheetData>' + statRows + '</sheetData>' +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '</worksheet>';

  /* ===== 消费报告 sheet ===== */
  var rep = [];
  function rpush(cells, h) { rep.push({ cells: cells, h: h }); return rep.length; }

  var rangeText = d.rg.label;
  var titleRow = rpush([S('消费报告', 1)], 32);
  rpush([S(rangeText + '   ·   ' + d.list.length + ' 笔记录   ·   生成于 ' +
    L.todayISO() + ' ' + L.pad2(new Date().getHours()) + ':' + L.pad2(new Date().getMinutes()), 2)], 18);
  rpush([], 10);

  rpush([S('支出', 3), S('收入', 3), S('结余', 3), S('日均支出', 3), S('记录笔数', 3), S('单笔均值', 3)], 16);
  rpush([N(s.out, 15), N(s.inc, 15), N(s.net, 15),
    N(s.out / d.days, 15), N(s.n, 16), N(s.outN ? s.out / s.outN : 0, 15)], 24);
  rpush([
    S(d.days + ' 天', 5),
    S(s.incN + ' 笔收入', 5),
    S(s.net >= 0 ? '有结余' : '本月透支', 5),
    S('按已过天数', 5),
    S(s.outN + ' 笔支出', 5),
    d.biggest ? S('最大 ' + L.yuan(d.biggest.amount, 0), 5) : S('—', 5)
  ], 15);
  rpush([], 6);
  /* 图表占 8~45 行，先补齐空行，再把页脚放到图表下方 */
  while (rep.length < 45) rep.push({ cells: [], h: 16.5 });
  rpush([S('数据来源：史高治账本 · 本页按筛选范围「' + rangeText + '」生成 · 图表原始数据见「统计数据」表', 5)], 16);

  var repRows = rowsXml(rep);
  var repSheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    '<dimension ref="A1:F' + rep.length + '"/>' +
    '<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    '<cols><col min="1" max="6" width="15.5" customWidth="1"/></cols>' +
    '<sheetData>' + repRows + '</sheetData>' +
    '<mergeCells count="2"><mergeCell ref="A1:F1"/><mergeCell ref="A2:F2"/></mergeCells>' +
    '<pageMargins left="0.45" right="0.45" top="0.5" bottom="0.5" header="0.25" footer="0.25"/>' +
    '<pageSetup paperSize="9" scale="100" fitToWidth="1" fitToHeight="1" orientation="portrait"/>' +
    '<drawing r:id="rId1"/>' +
    '</worksheet>';

  /* ===== 消费明细 sheet ===== */
  var det = [];
  det.push([S('日期', 6), S('时间', 6), S('类型', 6), S('分类', 6), S('二级分类', 6),
    S('账户', 6), S('金额', 6), S('标签', 6), S('备注', 6)]);
  var rowsSorted = d.list.slice().sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (a.time || '') < (b.time || '') ? 1 : -1;
  });
  rowsSorted.forEach(function (t) {
    var isTf = t.type === 'transfer';
    var cat = isTf ? { name: '转账' } : L.catById(t.cat);
    var amt = t.type === 'income' ? t.amount : -t.amount;   /* 转账 = 从转出账户流出，同样取负 */
    det.push([
      S(t.date, 7), S((t.time || '').slice(0, 5), 7),
      S(t.type === 'expense' ? '支出' : t.type === 'income' ? '收入' : '转账', 7),
      S(cat.name, 7),
      S(t.sub || '', 7),
      S(L.acctById(t.acct).name + (isTf ? ' → ' + L.acctById(t.toAcct).name : ''), 7),
      N(amt, 8),
      S((t.tags || []).join(' / '), 7),
      S(t.note || '', 13)
    ]);
  });
  var detXml = rowsXml(det);
  var detSheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    '<dimension ref="A1:I' + det.length + '"/>' +
    '<sheetViews><sheetView showGridLines="0" workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    '<cols><col min="1" max="2" width="11" customWidth="1"/>' +
    '<col min="3" max="5" width="12" customWidth="1"/>' +
    '<col min="6" max="6" width="18" customWidth="1"/>' +
    '<col min="7" max="7" width="13" customWidth="1"/>' +
    '<col min="8" max="8" width="17" customWidth="1"/>' +
    '<col min="9" max="9" width="34" customWidth="1"/></cols>' +
    '<sheetData>' + detXml + '</sheetData>' +
    '<autoFilter ref="A1:I' + det.length + '"/>' +
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.25" footer="0.25"/>' +
    '<pageSetup paperSize="9" fitToWidth="1" fitToHeight="0" orientation="landscape"/>' +
    '<headerFooter><oddFooter>&amp;L史高治账本 消费报告&amp;R第 &amp;P / &amp;N 页</oddFooter></headerFooter>' +
    '</worksheet>';

  /* ===== 图表 ===== */
  var f = function (a, b) { return CR + '$' + a + '$' + b; };
  var c1 = chartDaily(d.gran === 'week' ? 'line' : 'col',
    f('A', rDay0) + ':$A$' + rDay1, dayNames, f('B', rDay0) + ':$B$' + rDay1, dayVals, '#,##0');
  var c2 = chartCatRank(
    f('A', rCat0) + ':$A$' + rCat1, catNames, f('C', rCat0) + ':$C$' + rCat1, catPcts);
  var c3 = chartMonthly(
    f('A', rMon0) + ':$A$' + rMon1, monNames,
    f('B', rMon0) + ':$B$' + rMon1, monInc,
    f('C', rMon0) + ':$C$' + rMon1, monExp);
  var c4 = chartRate(
    f('A', rMon0) + ':$A$' + rMon1, monNames,
    f('E', rMon0) + ':$E$' + rMon1, monRate,
    f('F', rMon0) + ':$F$' + rMon1, monLine);

  var charts = [c1, c2, c3, c4];
  var anchors = [
    [0, 7, 3, 26],
    [3, 7, 6, 26],
    [0, 26, 3, 45],
    [3, 26, 6, 45]
  ];

  /* ===== 打包 ===== */
  var files = [];
  function add(name, str) {
    /* 工作表字符串自己带了声明，别再套一层 —— 双 <?xml?> 会让整份文件解析失败 */
    var data = str.indexOf('<?xml') === 0
      ? new TextEncoder().encode(str)
      : xmlStr(str);
    files.push({ name: name, data: data });
  }

  add('[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' +
    charts.map(function (_, i) {
      return '<Override PartName="/xl/charts/chart' + (i + 1) + '.xml" ' +
        'ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>';
    }).join('') +
    '</Types>');

  add('_rels/.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>');

  add('xl/workbook.xml',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' +
    '<sheet name="消费报告" sheetId="1" r:id="rId1"/>' +
    '<sheet name="消费明细" sheetId="2" r:id="rId2"/>' +
    '<sheet name="统计数据" sheetId="3" r:id="rId3"/>' +
    '</sheets>' +
    '<definedNames><definedName name="_xlnm.Print_Titles" localSheetId="1">' +
    "'消费明细'!$1:$1</definedName></definedNames>" +
    '</workbook>');

  add('xl/_rels/workbook.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>' +
    '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>');

  add('xl/styles.xml', stylesXml());
  add('xl/worksheets/sheet1.xml', repSheet);
  add('xl/worksheets/sheet2.xml', detSheet);
  add('xl/worksheets/sheet3.xml', statSheet);

  add('xl/worksheets/_rels/sheet1.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>' +
    '</Relationships>');

  add('xl/drawings/drawing1.xml', drawingXml(anchors));
  add('xl/drawings/_rels/drawing1.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    charts.map(function (_, i) {
      return '<Relationship Id="rId' + (i + 1) + '" ' +
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" ' +
        'Target="../charts/chart' + (i + 1) + '.xml"/>';
    }).join('') +
    '</Relationships>');

  charts.forEach(function (cx, i) { add('xl/charts/chart' + (i + 1) + '.xml', cx); });

  return zipStore(files);
}

function fileName() {
  var rg = L.resolveRange();
  var tag = rg.short === '自定义' ? (rg.from + '_' + rg.to) : (L.monthKey(L.latestDate() || L.todayISO()));
  return '史高治账本_' + tag + '_' + L.todayISO() + '.xlsx';
}

window.__XLSX = { build: build, fileName: fileName };
})();
