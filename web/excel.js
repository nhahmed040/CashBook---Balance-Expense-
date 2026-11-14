/* Excel (.xlsx) exports laid out like the contractor's payment-certificate workbooks:
   Certificate sheet, Summary sheet and BOQ sheet (Contract / Executed quantity / Executed amount,
   each with Previous, Current and Total To Date). Formulas are live and carry cached values.
   Also a date-range report workbook. Pure functions: no DOM access. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./logic.js'), require('./xlsx.js'));
  else root.CBExcel = factory(root.CBLogic, root.CBXlsx);
})(this, function (L, X) {
  'use strict';

  var r2 = L.round2;
  var MONEY = '#,##0.00';
  var QTY = '#,##0.00#';

  /* ---------- styles ---------- */
  var T = 'Times New Roman', C = 'Cambria';
  function st(o, base) { var r = {}; Object.keys(base || {}).forEach(function (k) { r[k] = base[k]; }); Object.keys(o || {}).forEach(function (k) { r[k] = o[k]; }); return r; }
  var HEAD_FILL = 'D9D9D9', SEC_FILL = 'F2F2F2';

  function q(name) { return "'" + name + "'!"; }
  function ref(col, row) { return col + row; }

  /* ---------- BOQ sheet ---------- */
  function boqSheet(p, progress, sheetName) {
    var rows = [], merges = [], heights = {};
    function put(r, c, v) { while (rows.length < r) rows.push(null); if (!rows[r - 1]) rows[r - 1] = []; rows[r - 1][c] = v; }
    var info = { sz: 12, b: true, font: T };
    put(2, 1, { v: 'Project :- ' + p.name, s: info });
    put(3, 1, { v: 'Location :- ' + p.location, s: info });
    put(4, 1, { v: 'Client :- ' + p.client, s: info });
    put(5, 1, { v: 'Contractor :- ' + p.contractor, s: info });
    var hs = { b: true, sz: 12, font: T, h: 'center', border: 'thin', fill: HEAD_FILL, wrap: true };
    put(7, 1, { v: 'Specification and Bill of Quantity for ' + p.name, s: st({ h: 'left', border: null, fill: null }, hs) });
    put(7, 3, { v: 'Contract', s: hs }); put(7, 4, { s: hs }); put(7, 5, { s: hs });
    put(7, 6, { v: 'Executed Quantity', s: hs }); put(7, 7, { s: hs }); put(7, 8, { s: hs });
    put(7, 9, { v: 'Executed Amount', s: hs }); put(7, 10, { s: hs }); put(7, 11, { s: hs });
    merges.push('D7:F7', 'G7:I7', 'J7:L7');
    ['Item', 'Description', 'Unit', 'Qty', 'Rate', 'Amount', 'Previous', 'Current', 'Total To Date', 'Previous', 'Current', 'Total To Date']
      .forEach(function (h, i) { put(8, i, { v: h, s: hs }); });

    var cell = { sz: 12, font: T, border: 'thin' };
    var text = st({ wrap: true, v: 'top' }, cell);
    var num = st({ fmt: MONEY, h: 'right' }, cell);
    var rateS = st({ fmt: '#,##0.00###', h: 'right' }, cell);
    var qty = st({ fmt: QTY, h: 'right' }, cell);
    var bold = st({ b: true }, cell);
    var secs = L.boqSections(p), r = 9, sectionRows = [];
    var tot = { amt: 0, prev: 0, cur: 0, to: 0 };

    secs.forEach(function (sec) {
      put(r, 0, { s: bold }); put(r, 1, { v: sec.title, s: st({ fill: SEC_FILL }, bold) });
      for (var k = 2; k <= 11; k++) put(r, k, { s: cell });
      r++;
      if (sec.group) { sectionRows.push({ row: 0, title: sec.title, group: true }); return; }
      var first = r, sum = { amt: 0, prev: 0, cur: 0, to: 0 };
      var segStart = r, seg = { amt: 0, prev: 0, cur: 0, to: 0 }, segs = [];
      var SC = [['F', 5, 'amt'], ['J', 9, 'prev'], ['K', 10, 'cur'], ['L', 11, 'to']];
      sec.items.forEach(function (idx) {
        var pr = progress[idx], it = pr.item;
        if (L.isSumRow(it)) {
          var segEnd = r - 1, sty = st({ fmt: MONEY, h: 'right', b: true, fill: SEC_FILL }, cell);
          put(r, 0, { s: st({ fill: SEC_FILL }, bold) }); put(r, 1, { v: it.desc, s: st({ h: 'right', fill: SEC_FILL }, bold) });
          for (var kk = 2; kk <= 4; kk++) put(r, kk, { s: st({ fill: SEC_FILL }, cell) });
          SC.forEach(function (c) {
            put(r, c[1], { f: segStart <= segEnd ? 'SUM(' + c[0] + segStart + ':' + c[0] + segEnd + ')' : '0', v: seg[c[2]], s: sty });
          });
          [6, 7, 8].forEach(function (k5) { put(r, k5, { s: st({ fill: SEC_FILL }, cell) }); });
          if (segStart <= segEnd) segs.push([segStart, segEnd, seg]);
          segStart = r + 1; seg = { amt: 0, prev: 0, cur: 0, to: 0 };
          r++; return;
        }
        if (L.isHeading(it)) {
          put(r, 0, { v: it.no, s: cell }); put(r, 1, { v: it.desc, s: bold });
          for (var k2 = 2; k2 <= 11; k2++) put(r, k2, { s: cell });
          r++; return;
        }
        var amt = it.qty * it.rate, prevA = it.rate * pr.prev, curA = it.rate * pr.cur;
        put(r, 0, { v: it.no, s: st({ h: 'center', v: 'top' }, cell) });
        put(r, 1, { v: it.desc, s: text });
        put(r, 2, { v: it.unit, s: st({ h: 'center', v: 'top' }, cell) });
        put(r, 3, { v: it.qty, s: qty });
        put(r, 4, { v: it.rate, s: rateS });
        put(r, 5, { f: 'E' + r + '*D' + r, v: amt, s: num });
        put(r, 6, { v: pr.prev || null, s: qty });
        put(r, 7, { v: pr.cur || null, s: qty });
        put(r, 8, { f: 'G' + r + '+H' + r, v: pr.prev + pr.cur, s: qty });
        put(r, 9, { f: 'E' + r + '*G' + r, v: prevA, s: num });
        put(r, 10, { f: 'E' + r + '*H' + r, v: curA, s: num });
        put(r, 11, { f: 'J' + r + '+K' + r, v: prevA + curA, s: num });
        sum.amt += amt; sum.prev += prevA; sum.cur += curA; sum.to += prevA + curA;
        seg.amt += amt; seg.prev += prevA; seg.cur += curA; seg.to += prevA + curA;
        r++;
      });
      var last = r - 1;
      if (segStart <= last) segs.push([segStart, last, seg]);
      put(r, 0, { s: bold }); put(r, 1, { v: 'Total carried to summary', s: st({ h: 'right' }, bold) });
      for (var k3 = 2; k3 <= 4; k3++) put(r, k3, { s: cell });
      [['F', 5, 'amt'], ['J', 9, 'prev'], ['K', 10, 'cur'], ['L', 11, 'to']].forEach(function (c) {
        put(r, c[1], { f: segs.length ? segs.map(function (g) { return 'SUM(' + c[0] + g[0] + ':' + c[0] + g[1] + ')'; }).join('+') : '0', v: sum[c[2]], s: st({ fmt: MONEY, h: 'right', b: true }, cell) });
      });
      [6, 7, 8].forEach(function (k4) { put(r, k4, { s: cell }); });
      sectionRows.push({ row: r, title: sec.title, group: false, sum: sum });
      tot.amt += sum.amt; tot.prev += sum.prev; tot.cur += sum.cur; tot.to += sum.to;
      r++;
    });
    return {
      sheet: { name: sheetName, cols: [9, 56, 8, 12, 14, 17, 12, 12, 14, 16, 16, 17], rows: rows, merges: merges, heights: heights, landscape: true },
      sectionRows: sectionRows, totals: tot
    };
  }

  /* ---------- Variation Order sheet (follows the user's "Variation order format" workbook) ---------- */
  function variationOrderSheet(p, cert, orderNo, info) {
    var rows = [], merges = [], heights = {};
    function put(r, c, v) { while (rows.length < r) rows.push(null); if (!rows[r - 1]) rows[r - 1] = []; rows[r - 1][c] = v; }
    function col(i) { return String.fromCharCode(65 + i); }
    var vr = L.boqVariation(p, cert.id).rows.slice();
    var lines = vr.map(function (r) { return { desc: r.item.desc, unit: r.item.unit, cq: r.contractQty, rate: r.rate, ex: r.executed, pv: r.prevVaried }; });
    (cert.variations || []).forEach(function (v) { lines.push({ desc: v.desc, unit: v.unit, cq: 0, rate: v.rate, ex: v.qty, pv: 0 }); });
    var hasPrev = lines.some(function (l) { return l.pv > 0; }), n = hasPrev ? 1 : 0;
    var cEx = 6, cPv = 7, cXs = 7 + n, cAm = 8 + n;
    var base = { font: T, sz: 12 };
    var info12 = st({ b: true }, base);
    put(2, 4, { v: 'Variation Order No. ' + orderNo, s: st({ b: true, sz: 14 }, base) });
    put(3, 1, { v: 'Project :- ' + p.name, s: info12 });
    put(4, 1, { v: 'Location :- ' + (p.location || ''), s: info12 });
    put(5, 1, { v: 'Client :- ' + (p.client || ''), s: info12 });
    put(6, 1, { v: 'Contractor:- ' + ((info && info.contractor) || ''), s: info12 });
    var hs = st({ b: true, h: 'center', border: 'thin', fill: HEAD_FILL, wrap: true }, base);
    var heads1 = ['No', 'Work Description', 'Unit', 'Contract', '', '', 'Excuted Work'];
    for (var i = 0; i <= cAm; i++) { put(8, i, { v: i < 3 ? heads1[i] : (i === 3 ? 'Contract' : (i === 6 ? 'Executed Work' : '')), s: hs }); put(9, i, { s: hs }); }
    merges.push('A8:A9', 'B8:B9', 'C8:C9', 'D8:F8', 'G8:' + col(cAm) + '8');
    var sub = ['Qty', 'Unit rate', 'Contract cost', 'Executed Quantity'];
    if (hasPrev) sub.push('Already in previous variation');
    sub.push('Exceed Quantity', 'Exceed Variation Amount');
    sub.forEach(function (h, k) { put(9, 3 + k, { v: h, s: hs }); });
    var cell = st({ border: 'thin' }, base), r = 10, total = 0;
    lines.forEach(function (l, k) {
      var exceed = l.ex - l.cq - l.pv, amt = exceed * l.rate; total += amt;
      put(r, 0, { v: k + 1, s: st({ h: 'center' }, cell) });
      put(r, 1, { v: l.desc, s: st({ wrap: true, v: 'top' }, cell) });
      put(r, 2, { v: l.unit, s: st({ h: 'center' }, cell) });
      put(r, 3, { v: l.cq, s: st({ fmt: QTY, h: 'right' }, cell) });
      put(r, 4, { v: l.rate, s: st({ fmt: '#,##0.00####', h: 'right' }, cell) });
      put(r, 5, { f: 'D' + r + '*E' + r, v: l.cq * l.rate, s: st({ fmt: MONEY, h: 'right' }, cell) });
      put(r, cEx, { v: l.ex, s: st({ fmt: QTY, h: 'right' }, cell) });
      if (hasPrev) put(r, cPv, { v: l.pv, s: st({ fmt: QTY, h: 'right' }, cell) });
      put(r, cXs, { f: 'G' + r + '-D' + r + (hasPrev ? '-H' + r : ''), v: exceed, s: st({ fmt: QTY, h: 'right' }, cell) });
      put(r, cAm, { f: 'E' + r + '*' + col(cXs) + r, v: amt, s: st({ fmt: MONEY, h: 'right' }, cell) });
      r++;
    });
    for (var z = 0; z <= cAm; z++) put(r, z, { s: cell });
    put(r, 1, { v: 'Total', s: st({ b: true }, cell) });
    put(r, cAm, { f: 'SUM(' + col(cAm) + '10:' + col(cAm) + (r - 1) + ')', v: total, s: st({ fmt: MONEY, h: 'right', b: true }, cell) });
    var sg = r + 3, bold = st({ b: true }, base);
    [[0, 'Contractor/Project Manager'], [3, 'Site Supervisor'], [6, 'Approved by Client'], [cAm - 1, 'Approved by Construction office']].forEach(function (b) {
      put(sg, b[0], { v: b[1], s: bold });
      put(sg + 1, b[0], { v: 'Name:_______________________', s: base });
      put(sg + 2, b[0], { v: 'Signature:_____________________', s: base });
      put(sg + 3, b[0], { v: 'Date:_________________________', s: base });
    });
    var cols = [5, 52, 8, 12, 14, 16, 16].concat(hasPrev ? [16] : []).concat([14, 20]);
    return { name: 'Variation Order', cols: cols, rows: rows, merges: merges, heights: heights, landscape: true };
  }

  /* ---------- Summary sheet ---------- */
  function summarySheet(p, boq, sheetName, boqName) {
    var rows = [], vat = p.vat;
    function put(r, c, v) { while (rows.length < r) rows.push(null); if (!rows[r - 1]) rows[r - 1] = []; rows[r - 1][c] = v; }
    var info = { sz: 14, b: true };
    put(2, 2, { v: 'Project :- ' + p.name, s: info });
    put(3, 2, { v: 'Location :- ' + p.location, s: info });
    put(4, 2, { v: 'Client :- ' + p.client, s: info });
    put(5, 2, { v: 'Contractor :- ' + p.contractor, s: info });
    var hs = { b: true, sz: 14, border: 'medium', fill: HEAD_FILL, h: 'center' };
    put(7, 2, { v: 'SUMMARY', s: hs });
    ['AMOUNT', 'Previous', 'Current', 'Total To Date'].forEach(function (h, i) { put(7, 3 + i, { v: h, s: hs }); });
    var cell = { b: true, sz: 14, border: 'thin' };
    var cellN = st({ fmt: MONEY, h: 'right' }, cell);
    var r = 8, groupRows = [], curGroup = null, grand = { amt: 0, prev: 0, cur: 0, to: 0 };
    var cols = [['D', 'F', 'amt'], ['E', 'J', 'prev'], ['F', 'K', 'cur'], ['G', 'L', 'to']];

    function closeGroup() {
      if (!curGroup) return;
      var first = curGroup.first, last = r - 1;
      put(r, 1, { v: '', s: cell });
      put(r, 2, { v: 'TOTAL (' + curGroup.letter + ')', s: st({ fill: SEC_FILL, h: 'center' }, cell) });
      cols.forEach(function (c, k) {
        put(r, 3 + k, { f: first <= last ? 'SUM(' + c[0] + first + ':' + c[0] + last + ')' : '0', v: curGroup.sum[c[2]], s: st({ fill: SEC_FILL }, cellN) });
      });
      groupRows.push(r); r++; curGroup = null;
    }
    var n = 0, plain = { first: 0, rows: [] };
    boq.sectionRows.forEach(function (sec) {
      if (sec.group) {
        closeGroup();
        var letter = (/^[A-Za-z]/.exec(sec.title) || ['•'])[0].toUpperCase();
        put(r, 1, { v: letter, s: st({ h: 'center' }, cell) });
        put(r, 2, { v: sec.title.replace(/^[A-Za-z]\.\s*/, '').toUpperCase(), s: st({ h: 'center' }, cell) });
        for (var k = 3; k <= 6; k++) put(r, k, { s: cell });
        curGroup = { letter: letter, first: r + 1, sum: { amt: 0, prev: 0, cur: 0, to: 0 } };
        r++; return;
      }
      n++;
      put(r, 1, { s: cell });
      put(r, 2, { v: sec.title, s: cell });
      cols.forEach(function (c, k) {
        put(r, 3 + k, { f: q(boqName) + c[1] + sec.row, v: sec.sum[c[2]], s: cellN });
        if (curGroup) curGroup.sum[c[2]] += sec.sum[c[2]];
        grand[c[2]] += sec.sum[c[2]];
      });
      plain.rows.push(r);
      r++;
    });
    closeGroup();
    // grand total
    var totRow = r;
    put(r, 1, { s: cell }); put(r, 2, { v: 'TOTAL', s: st({ fill: HEAD_FILL, h: 'center' }, cell) });
    cols.forEach(function (c, k) {
      var f;
      if (groupRows.length) f = groupRows.map(function (g) { return c[0] + g; }).join('+');
      else f = plain.rows.length ? 'SUM(' + c[0] + plain.rows[0] + ':' + c[0] + plain.rows[plain.rows.length - 1] + ')' : '0';
      put(r, 3 + k, { f: f, v: grand[c[2]], s: st({ fill: HEAD_FILL }, cellN) });
    });
    r++;
    put(r, 1, { s: cell }); put(r, 2, { v: 'VAT (' + vat + '%)', s: cell });
    cols.forEach(function (c, k) { put(r, 3 + k, { f: c[0] + totRow + '*' + (vat / 100), v: grand[c[2]] * vat / 100, s: cellN }); });
    r++;
    put(r, 1, { s: cell }); put(r, 2, { v: 'GRAND TOTAL WITH VAT', s: st({ fill: HEAD_FILL }, cell) });
    cols.forEach(function (c, k) { put(r, 3 + k, { f: c[0] + totRow + '+' + c[0] + (r - 1), v: grand[c[2]] * (1 + vat / 100), s: st({ fill: HEAD_FILL }, cellN) }); });
    return {
      sheet: { name: sheetName, cols: [2, 6, 56, 20, 20, 20, 20], rows: rows, landscape: true },
      totalRow: totRow, totals: grand
    };
  }

  /* ---------- Certificate sheet ---------- */
  function certificateSheet(p, cert, sum, sumName) {
    var rows = [], merges = [], heights = {};
    function put(r, c, v) { while (rows.length < r) rows.push(null); if (!rows[r - 1]) rows[r - 1] = []; rows[r - 1][c] = v; }
    var B = 1, Cc = 2, D = 3, E = 4, F = 5, G = 6, H = 7; // column indexes
    var base = { font: C, sz: 12 };
    var bold = st({ b: true }, base);
    var box = st({ border: 'medium', h: 'center' }, base);
    var boxB = st({ b: true }, box);
    var boxN = st({ fmt: MONEY, h: 'right', border: 'medium' }, base);
    var boxNB = st({ b: true }, boxN);
    var head = st({ fill: HEAD_FILL }, boxB);
    var vat = p.vat / 100;

    var list = L.sortedCerts(p), idx = 0;
    list.forEach(function (c, k) { if (c.id === cert.id) idx = k; });
    var prev = list.slice(0, idx), upto = list.slice(0, idx + 1);
    var cc = L.certCalc(p, cert);
    var cumGross = r2(upto.reduce(function (a, c) { return a + c.gross; }, 0));
    var prevGross = r2(prev.reduce(function (a, c) { return a + c.gross; }, 0));
    var cumAdv = r2(upto.reduce(function (a, c) { return a + c.advanceRecovery; }, 0));

    // title
    put(3, B, { v: 'INTERIM PAYMENT CERTIFICATE' + (cert.no ? ' No. ' + cert.no : ''), s: st({ b: true, sz: 18, h: 'center', border: 'thick', fill: HEAD_FILL }, base) });
    for (var k = 2; k <= 7; k++) put(3, k, { s: st({ border: 'thick', fill: HEAD_FILL }, base) });
    merges.push('B3:H3'); heights[3] = 30;
    var lab = st({ b: true, sz: 14, h: 'right' }, base), val = st({ b: true, sz: 14, h: 'left' }, base);
    [['Project :', p.name], ['Client :', p.client], ['Contractor :', p.contractor], ['Location :', p.location]].forEach(function (x, i) {
      put(5 + i, B, { v: x[0], s: lab }); put(5 + i, Cc, { v: x[1], s: val }); merges.push('C' + (5 + i) + ':F' + (5 + i));
    });

    // contract value block (right)
    var contractBase = p.contractSum > 0 ? p.contractSum : sum.totals.amt;
    var contractCell = p.contractSum > 0 ? { v: contractBase } : { f: q(sumName) + 'D' + sum.totalRow, v: contractBase };
    var vTot = L.variationTotal(p);
    var afterRebate, rebateAmt = r2(-(contractBase + vTot) * p.rebate / 100);
    afterRebate = r2(contractBase + vTot + rebateAmt);
    var cvLab = st({ h: 'right', border: 'medium' }, base);
    put(5, G, { v: 'Contract Value', s: head }); put(5, H, { v: 'Amount(Birr)', s: head });
    function cv(r, label, c, bold2) {
      put(r, G, { v: label, s: cvLab });
      var o = { v: c.v, f: c.f, s: bold2 ? boxNB : boxN };
      if (c.v === '-') o.s = st({ h: 'center' }, boxN);
      put(r, H, o);
    }
    cv(6, 'Main contract :', contractCell);
    cv(7, 'Supplementary Cont. :', { v: '-' });
    cv(8, 'Variation orders :', vTot > 0 ? { v: vTot } : { v: '-' });
    cv(9, 'Rebate(' + p.rebate + '%) :', p.rebate > 0 ? { f: '-(H6+H8)*' + (p.rebate / 100), v: rebateAmt } : { v: '-' });
    cv(10, 'After rebate :', { f: 'SUM(H6:H9)', v: afterRebate }, true);
    cv(11, p.vat + ' % VAT :', { f: 'H10*' + vat, v: afterRebate * vat }, true);
    cv(12, 'Total :', { f: 'H10+H11', v: afterRebate * (1 + vat) }, true);

    // measurement text (left)
    var small = st({ sz: 11 }, base);
    put(12, B, { v: 'According to the measurement taken by supervisor of the work', s: small });
    put(13, B, { v: 'certificate of measurement dated on ' + cert.date + ' the volume work', s: small });
    put(14, B, { v: 'executed and/or materials supplied up to date is ' + L.round2(cumGross).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' Birr (excl. VAT)', s: small });

    // payments table (left): previous payments
    var nPay = Math.max(3, prev.length);
    put(16, B, { v: 'Payment', s: st({ fill: HEAD_FILL }, boxB) }); put(16, Cc, { s: box }); put(16, D, { s: box }); merges.push('B16:D16');
    put(17, B, { v: 'Payment No.', s: box }); put(17, Cc, { v: 'Without VAT', s: box }); put(17, D, { v: 'With VAT', s: box });
    function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
    for (var i = 0; i < nPay; i++) {
      var rr = 18 + i, c = prev[i];
      put(rr, B, { v: (c && c.no) ? c.no : ordinal(i + 1), s: box });
      put(rr, Cc, c ? { v: c.gross, s: boxN } : { s: boxN });
      put(rr, D, c ? { f: 'C' + rr + '*' + vat + '+C' + rr, v: c.gross * (1 + vat), s: boxN } : { s: boxN });
    }
    var payTot = 18 + nPay;
    var prevWithVat = prevGross * (1 + vat);
    put(payTot, B, { v: 'Total', s: boxB }); put(payTot, Cc, { s: boxN });
    put(payTot, D, { f: 'SUM(D18:D' + (payTot - 1) + ')', v: prevWithVat, s: boxNB });
    var prevNet = r2(prev.reduce(function (a, c) { return a + L.certCalc(p, c).payable; }, 0));

    // advance block (left)
    var a0 = payTot + 3;
    put(a0 - 1, B, { v: 'Advance Payment', s: head }); put(a0 - 1, Cc, { s: box }); put(a0 - 1, D, { s: box }); merges.push('B' + (a0 - 1) + ':D' + (a0 - 1));
    put(a0, B, { v: 'Description', s: box }); put(a0, Cc, { v: 'Amount (Birr)', s: box }); put(a0, D, { s: box }); merges.push('C' + a0 + ':D' + a0);
    put(a0 + 1, B, { v: 'Advance paid', s: box }); put(a0 + 1, Cc, { v: p.advance, s: boxNB }); put(a0 + 1, D, { s: box }); merges.push('C' + (a0 + 1) + ':D' + (a0 + 1));
    put(a0 + 2, B, { v: '', s: box }); put(a0 + 2, Cc, { v: 'Advance Repaid', s: box }); put(a0 + 2, D, { s: box }); merges.push('C' + (a0 + 2) + ':D' + (a0 + 2));
    var nAdv = Math.max(3, upto.length);
    for (var j = 0; j < nAdv; j++) {
      var ar = a0 + 3 + j, ac = upto[j];
      put(ar, B, { v: (ac && ac.no) ? ac.no : ordinal(j + 1), s: box });
      put(ar, Cc, ac ? { v: ac.advanceRecovery, s: boxN } : { s: boxN }); put(ar, D, { s: box }); merges.push('C' + ar + ':D' + ar);
    }
    var aEnd = a0 + 3 + nAdv;
    put(aEnd, B, { v: 'Adva. Repaid to date', s: box }); put(aEnd, Cc, { f: 'SUM(C' + (a0 + 3) + ':C' + (aEnd - 1) + ')', v: cumAdv, s: boxNB }); put(aEnd, D, { s: box }); merges.push('C' + aEnd + ':D' + aEnd);
    put(aEnd + 1, B, { v: 'Out standing Advance', s: box }); put(aEnd + 1, Cc, { f: 'C' + (a0 + 1) + '-C' + aEnd, v: r2(p.advance - cumAdv), s: boxNB }); put(aEnd + 1, D, { s: box }); merges.push('C' + (aEnd + 1) + ':D' + (aEnd + 1));

    // current executed (right)
    var useLink = p.boq.length && Math.abs(sum.totals.to - cumGross) < 0.01;
    var vNo0 = L.variationOrderNo(p, cert.id), vAmt0 = L.certCalc(p, cert).variationOrder;
    if (vNo0 > 0) {
      put(19, G, { v: 'Of which Variation order ' + vNo0, s: box });
      put(19, H, { v: vAmt0, s: boxN });
    }
    put(21, G, { v: 'A) Current Executed ', s: head }); put(21, H, { s: head }); merges.push('G21:H21');
    put(22, G, { v: 'Service sum', s: st({ b: true, fill: HEAD_FILL }, box) });
    put(22, H, useLink ? { f: q('Summary') + 'G' + sum.totalRow, v: cumGross, s: st({ fill: HEAD_FILL }, boxNB) } : { v: cumGross, s: st({ fill: HEAD_FILL }, boxNB) });
    put(23, G, { v: 'Vat (' + p.vat + '%)', s: box }); put(23, H, { f: vat + '*H22', v: cumGross * vat, s: boxN });
    put(24, G, { v: 'Net service sum', s: box }); put(24, H, { f: 'SUM(H22:H23)', v: cumGross * (1 + vat), s: boxN });
    put(25, F, { v: 'Deductions', s: head }); put(25, G, { v: 'A=Total', s: boxB }); put(25, H, { f: 'H24', v: cumGross * (1 + vat), s: boxNB });
    var A = cumGross * (1 + vat);
    // retention is held on the work including VAT; withholding tax and VAT withholding are not part of the certificate
    var ret = r2(upto.reduce(function (a, c) { return a + L.certCalc(p, c).retention; }, 0));
    var cumPen = r2(upto.reduce(function (a, c) { return a + (c.penalty || 0); }, 0));
    var ds = st({ h: 'left', border: 'thin' }, base);
    put(26, F, { v: '1.Previous payments (net paid)', s: ds }); put(26, G, { v: prevNet, s: boxN });
    put(27, F, { v: '2.Retention ' + p.retention + '%', s: ds }); put(27, G, { f: p.retention / 100 + '*H25', v: ret, s: boxN });
    put(28, F, { v: '3.Advance Repayment', s: ds }); put(28, G, { f: 'C' + aEnd, v: cumAdv, s: boxN });
    put(29, F, { v: '4.Penalty', s: ds }); put(29, G, cumPen > 0 ? { v: cumPen, s: boxN } : { s: boxN });
    var B2 = prevNet + ret + cumAdv + cumPen;
    put(30, F, { v: 'B = Total deductions (1 - 4)', s: st({ b: true, h: 'right' }, ds) }); put(30, G, { f: 'SUM(G26:G29)', v: B2, s: boxNB });
    var net = A - B2;
    put(31, F, { v: 'C = Net (A-B)', s: ds }); put(31, G, { s: boxN }); put(31, H, { f: 'H25-G30', v: net, s: boxN });
    put(33, F, { v: 'G=Net pay to the contractor ©', s: st({ b: true, h: 'right' }, base) }); put(33, G, { s: boxN });
    put(33, H, { f: 'H25-G30', v: net, s: st({ fill: HEAD_FILL }, boxNB) });

    // certification text and signatures
    var endRow = Math.max(aEnd + 3, 35);
    put(endRow, B, { v: 'We certify that the contractor is now entitled to the sum of Birr (' + L.amountWords(cc.payable) + ').', s: st({ sz: 11, b: true, h: 'center', wrap: true }, base) });
    merges.push('B' + endRow + ':H' + endRow); heights[endRow] = 32;
    var sg = endRow + 3;
    put(sg, B, { v: 'Certified by:______________________', s: bold }); put(sg, F, { v: 'Approved by', s: st({ b: true, h: 'right' }, base) });
    put(sg + 1, B, { v: 'Signature:____________', s: bold }); put(sg + 1, F, { v: 'Signature :  ', s: st({ b: true, h: 'right' }, base) }); put(sg + 1, G, { v: '_____________________________', s: base });
    put(sg + 2, B, { v: 'Date_______________', s: bold }); put(sg + 2, F, { v: 'Date :  ', s: st({ b: true, h: 'right' }, base) }); put(sg + 2, G, { v: '_____________________________', s: base });
    return { name: 'Certificate', cols: [2.6, 24.7, 16, 17.3, 9.1, 34.4, 26.9, 21.6], rows: rows, merges: merges, heights: heights, hideGrid: true };
  }

  function prep(p) {
    // normalise a project so the builders can rely on every field being present
    return L.sanitizeProject(JSON.parse(JSON.stringify(p)), 1);
  }

  /* Certificate + summary + BOQ workbook for one certificate. */
  function certificateWorkbook(project, certId, info) {
    var p = prep(project);
    var cert = null;
    p.certs.forEach(function (c) { if (c.id === certId) cert = c; });
    if (!cert) return null;
    var progress = L.boqProgress(p, certId);
    var boq = boqSheet(p, progress, 'BOQ');
    var sum = summarySheet(p, boq, 'Summary', 'BOQ');
    var certSheet = certificateSheet(p, cert, sum, 'Summary');
    var sheets = [certSheet, sum.sheet, boq.sheet];
    var vNo = L.variationOrderNo(p, certId);
    if (vNo > 0) sheets.push(variationOrderSheet(p, cert, vNo, info));
    return { sheets: sheets };
  }

  /* Summary + BOQ workbook (current quantities against the last certificate). */
  function boqWorkbook(project) {
    var p = prep(project);
    var progress = L.boqProgress(p, null);
    var boq = boqSheet(p, progress, 'BOQ');
    var sum = summarySheet(p, boq, 'Summary', 'BOQ');
    return { sheets: [sum.sheet, boq.sheet] };
  }

  /* ---------- date-range report ---------- */
  /* opts: { state, from, to, bookIds, title, labels: {...} } */
  function reportWorkbook(opts) {
    var state = opts.state, list = L.rangeEntries(state, opts.from, opts.to, opts.bookIds);
    var contactName = {};
    state.contacts.forEach(function (c) { contactName[c.id] = c.name; });
    var tot = L.totals(list);
    var hs = { b: true, border: 'thin', fill: HEAD_FILL, h: 'center' };
    var cell = { border: 'thin' }, num = { border: 'thin', fmt: MONEY, h: 'right' };

    var rows = [];
    rows.push([{ v: opts.title || 'CashBook report', s: { b: true, sz: 16 } }]);
    rows.push([{ v: 'Period: ' + (opts.from || '…') + ' to ' + (opts.to || '…') }]);
    rows.push([]);
    rows.push([{ v: 'Cash in', s: hs }, { v: 'Cash out', s: hs }, { v: 'Balance', s: hs }]);
    rows.push([{ v: tot.cashIn, s: num }, { v: tot.cashOut, s: num }, { v: tot.balance, s: num }]);
    rows.push([]);
    function group(title, keyFn) {
      var m = {};
      list.forEach(function (e) {
        var k = keyFn(e) || '-';
        m[k] = m[k] || { i: 0, o: 0 };
        if (e.type === 'in') m[k].i += e.amount; else m[k].o += e.amount;
      });
      rows.push([{ v: title, s: hs }, { v: 'Cash in', s: hs }, { v: 'Cash out', s: hs }, { v: 'Net', s: hs }]);
      Object.keys(m).sort().forEach(function (k) {
        rows.push([{ v: k, s: cell }, { v: r2(m[k].i), s: num }, { v: r2(m[k].o), s: num }, { v: r2(m[k].i - m[k].o), s: num }]);
      });
      rows.push([]);
    }
    group('Category', function (e) { return e.category; });
    group('Payment mode', function (e) { return e.mode; });
    group('Member', function (e) { return e.by; });
    group('Contact', function (e) { return e.contactId ? contactName[e.contactId] : e.party; });
    group('Book', function (e) { return e.book; });
    var summary = { name: 'Summary', cols: [34, 16, 16, 16], rows: rows };

    var er = [[['Date', 'Book', 'Type', 'Category', 'Contact', 'Mode', 'Member', 'Remark', 'Cash in', 'Cash out', 'Balance']
      .map(function (h) { return { v: h, s: hs }; })][0]];
    var bal = 0;
    list.forEach(function (e, k) {
      bal = r2(bal + (e.type === 'in' ? e.amount : -e.amount));
      var rr = k + 2;
      er.push([
        { v: e.date, s: cell }, { v: e.book, s: cell }, { v: e.type === 'in' ? 'Cash in' : 'Cash out', s: cell },
        { v: e.category, s: cell }, { v: e.contactId ? contactName[e.contactId] || e.party : e.party, s: cell },
        { v: e.mode, s: cell }, { v: e.by, s: cell }, { v: e.note, s: cell },
        e.type === 'in' ? { v: e.amount, s: num } : { s: num },
        e.type === 'out' ? { v: e.amount, s: num } : { s: num },
        { f: 'SUM(I$2:I' + rr + ')-SUM(J$2:J' + rr + ')', v: bal, s: num }
      ]);
    });
    er.push([{ s: cell }, { s: cell }, { s: cell }, { s: cell }, { s: cell }, { s: cell }, { s: cell }, { v: 'TOTAL', s: { b: true, border: 'thin', h: 'right' } },
      { f: 'SUM(I2:I' + (list.length + 1) + ')', v: tot.cashIn, s: st({ b: true }, num) },
      { f: 'SUM(J2:J' + (list.length + 1) + ')', v: tot.cashOut, s: st({ b: true }, num) },
      { f: 'I' + (list.length + 2) + '-J' + (list.length + 2), v: tot.balance, s: st({ b: true }, num) }]);
    return { sheets: [summary, { name: 'Entries', cols: [12, 16, 10, 18, 22, 10, 16, 26, 14, 14, 14], rows: er, landscape: true }] };
  }

  function toBytes(wb) { return X.build(wb); }

  return {
    certificateWorkbook: certificateWorkbook, boqWorkbook: boqWorkbook, reportWorkbook: reportWorkbook, toBytes: toBytes
  };
});
