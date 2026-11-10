/* Pure data logic for CashBook: no DOM access, so it can be unit-tested in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CBLogic = factory();
})(this, function () {
  'use strict';

  var LANGS = ['en', 'om', 'am'];
  var CURRENCIES = ['ETB', 'USD', 'EUR', 'GBP', 'KES', 'SAR', 'AED', 'none'];
  var THEMES = ['system', 'light', 'dark'];
  var CALENDARS = ['gregorian', 'ethiopian'];
  var CODES = ['materials', 'labour', 'equipment', 'subcontract', 'transport', 'fuel', 'permits', 'overhead', 'other'];

  var idCounter = 0;
  function newId() {
    idCounter += 1;
    return Date.now() * 1000 + (idCounter % 1000);
  }

  function round2(n) { return Math.round(n * 100) / 100; }
  function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
  function num(v, min, max) {
    var n = Number(v);
    if (!isFinite(n)) n = 0;
    if (n < min) n = min;
    if (max != null && n > max) n = max;
    return round2(n);
  }
  function isDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function validId(v) { return typeof v === 'number' && isFinite(v) && v > 0; }
  function round3(n) { return Math.round(n * 1000) / 1000; }
  function num3(v, min) {
    var n = Number(v);
    if (!isFinite(n) || n < min) n = min;
    return round3(n);
  }
  /* List of photo ids: valid, unique, at most 12. */
  function photoIds(list) {
    var seen = {}, out = [];
    (Array.isArray(list) ? list : []).forEach(function (v) {
      if (validId(v) && !seen[v] && out.length < 12) { seen[v] = true; out.push(v); }
    });
    return out;
  }

  /* Keep the first item for each id; give duplicates a fresh id. */
  function mapList(list, fn, max) {
    var seen = {}, out = [];
    (Array.isArray(list) ? list : []).slice(0, max || 5000).forEach(function (raw) {
      var x = fn(raw);
      if (!x) return;
      while (seen[x.id]) x.id = newId();
      seen[x.id] = true;
      out.push(x);
    });
    return out;
  }

  /* ---------- entries ---------- */
  function sanitizeEntry(e) {
    if (!e || typeof e !== 'object') return null;
    var amt = Number(e.amount);
    if (!isFinite(amt) || amt <= 0) return null;
    return {
      id: validId(e.id) ? e.id : newId(),
      type: e.type === 'out' ? 'out' : 'in',
      amount: round2(amt),
      date: isDate(e.date) ? e.date : todayStr(),
      category: str(e.category, 40),
      note: str(e.note, 80),
      code: CODES.indexOf(e.code) >= 0 ? e.code : '',
      party: str(e.party, 60),
      billId: validId(e.billId) ? e.billId : 0,
      certId: validId(e.certId) ? e.certId : 0,
      photos: photoIds(e.photos)
    };
  }
  function uniqueEntries(list) { return mapList(list, sanitizeEntry); }

  /* ---------- project parts ---------- */
  function sanitizePayment(p) {
    if (!p || typeof p !== 'object') return null;
    var a = Number(p.amount);
    if (!isFinite(a) || a <= 0) return null;
    return {
      id: validId(p.id) ? p.id : newId(),
      date: isDate(p.date) ? p.date : todayStr(),
      amount: round2(a),
      entryId: validId(p.entryId) ? p.entryId : 0,
      bookId: str(p.bookId, 40)
    };
  }

  function sanitizeBill(b) {
    if (!b || typeof b !== 'object') return null;
    var a = Number(b.amount);
    if (!isFinite(a) || a <= 0) return null;
    return {
      id: validId(b.id) ? b.id : newId(),
      date: isDate(b.date) ? b.date : todayStr(),
      supplier: str(b.supplier, 60),
      code: CODES.indexOf(b.code) >= 0 ? b.code : 'other',
      desc: str(b.desc, 80),
      amount: round2(a),
      payments: mapList(b.payments, sanitizePayment, 500),
      photos: photoIds(b.photos)
    };
  }

  function sanitizeCert(c) {
    if (!c || typeof c !== 'object') return null;
    var g = Number(c.gross);
    if (!isFinite(g) || g <= 0) return null;
    return {
      id: validId(c.id) ? c.id : newId(),
      no: str(c.no, 20),
      date: isDate(c.date) ? c.date : todayStr(),
      gross: round2(g),
      advanceRecovery: num(c.advanceRecovery, 0),
      receipts: mapList(c.receipts, sanitizePayment, 500)
    };
  }

  function sanitizeWorker(w) {
    if (!w || typeof w !== 'object') return null;
    var name = str(w.name, 60);
    if (!name) return null;
    return { id: validId(w.id) ? w.id : newId(), name: name, role: str(w.role, 40), rate: num(w.rate, 0) };
  }

  function sanitizeAttendance(a) {
    if (!a || typeof a !== 'object' || !isDate(a.date) || !validId(a.workerId)) return null;
    return {
      id: validId(a.id) ? a.id : newId(),
      date: a.date,
      workerId: a.workerId,
      days: num(a.days, 0, 3),
      rate: num(a.rate, 0),
      paid: !!a.paid
    };
  }

  function sanitizeBoqItem(i) {
    if (!i || typeof i !== 'object') return null;
    var desc = str(i.desc, 120);
    if (!desc) return null;
    return {
      id: validId(i.id) ? i.id : newId(),
      no: str(i.no, 20),
      desc: desc,
      unit: str(i.unit, 12),
      qty: num3(i.qty, 0),
      rate: num(i.rate, 0),
      done: num3(i.done, 0)
    };
  }

  function sanitizeProject(p, n) {
    p = p && typeof p === 'object' ? p : {};
    var budgets = {};
    if (p.budgets && typeof p.budgets === 'object') {
      CODES.forEach(function (c) {
        var v = num(p.budgets[c], 0);
        if (v > 0) budgets[c] = v;
      });
    }
    var workers = mapList(p.workers, sanitizeWorker, 500);
    var wIds = {};
    workers.forEach(function (w) { wIds[w.id] = true; });
    // one attendance row per worker per day (the last one wins)
    var attMap = {};
    mapList(p.attendance, sanitizeAttendance, 50000).forEach(function (a) {
      if (wIds[a.workerId]) attMap[a.date + '|' + a.workerId] = a;
    });
    return {
      id: str(p.id, 40) || ('p' + newId()),
      name: str(p.name, 60) || ('Project ' + n),
      client: str(p.client, 60),
      location: str(p.location, 60),
      contractSum: num(p.contractSum, 0),
      startDate: isDate(p.startDate) ? p.startDate : '',
      endDate: isDate(p.endDate) ? p.endDate : '',
      vat: num(p.vat, 0, 100),
      wht: num(p.wht, 0, 100),
      retention: num(p.retention, 0, 100),
      advance: num(p.advance, 0),
      budgets: budgets,
      bills: mapList(p.bills, sanitizeBill, 5000),
      certs: mapList(p.certs, sanitizeCert, 1000),
      workers: workers,
      attendance: Object.keys(attMap).map(function (k) { return attMap[k]; }),
      boq: mapList(p.boq, sanitizeBoqItem, 3000),
      photos: photoIds(p.photos)
    };
  }

  /* ---------- whole state ---------- */
  function defaultState() {
    return {
      v: 3,
      current: 'main',
      settings: { lang: 'en', currency: 'ETB', theme: 'system', calendar: 'gregorian', pinHash: '', pinSalt: '' },
      books: [{ id: 'main', name: 'Main', projectId: '', entries: [] }],
      projects: []
    };
  }

  /* opts.keepPin: carry pinHash/pinSalt from raw (true for local storage, false for imports) */
  function sanitizeState(raw, opts) {
    var keepPin = !!(opts && opts.keepPin);
    var s = defaultState();
    if (!raw || typeof raw !== 'object') return s;

    var rs = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    if (LANGS.indexOf(rs.lang) >= 0) s.settings.lang = rs.lang;
    if (CURRENCIES.indexOf(rs.currency) >= 0) s.settings.currency = rs.currency;
    if (THEMES.indexOf(rs.theme) >= 0) s.settings.theme = rs.theme;
    if (CALENDARS.indexOf(rs.calendar) >= 0) s.settings.calendar = rs.calendar;
    if (keepPin && typeof rs.pinHash === 'string' && typeof rs.pinSalt === 'string' && rs.pinHash && rs.pinSalt) {
      s.settings.pinHash = rs.pinHash.slice(0, 64);
      s.settings.pinSalt = rs.pinSalt.slice(0, 64);
    }

    var projects = [], pIds = {};
    (Array.isArray(raw.projects) ? raw.projects : []).slice(0, 100).forEach(function (rp) {
      var p = sanitizeProject(rp, projects.length + 1);
      while (pIds[p.id]) p.id = p.id + '_';
      pIds[p.id] = true;
      projects.push(p);
    });
    s.projects = projects;

    if (Array.isArray(raw.books)) {
      var books = [], seenIds = {};
      raw.books.slice(0, 50).forEach(function (b, i) {
        if (!b || typeof b !== 'object') return;
        var id = str(b.id, 40) || ('b' + (i + 1));
        while (seenIds[id]) id = id + '_';
        seenIds[id] = true;
        books.push({
          id: id,
          name: str(b.name, 40) || ('Book ' + (books.length + 1)),
          projectId: pIds[b.projectId] ? b.projectId : '',
          entries: uniqueEntries(b.entries)
        });
      });
      if (books.length) {
        s.books = books;
        s.current = typeof raw.current === 'string' && seenIds[raw.current] ? raw.current : books[0].id;
      }
    }
    return s;
  }

  /* Data saved by the first version: a bare array of entries. */
  function migrateOld(arr) {
    var s = defaultState();
    s.books[0].entries = uniqueEntries(arr);
    return s;
  }

  /* ---------- PIN hashing (casual lock, not strong crypto) ---------- */
  function cyrb53(text, seed) {
    var h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (var i = 0, ch; i < text.length; i++) {
      ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  }
  function hashPin(pin, salt) {
    var h = salt + ':' + pin;
    for (var i = 0; i < 3000; i++) h = cyrb53(h + ':' + pin, i);
    return h;
  }
  function newSalt() {
    var s = '';
    for (var i = 0; i < 4; i++) s += Math.floor(Math.random() * 0xffffffff).toString(16);
    return s.slice(0, 32);
  }
  function validPin(pin) { return /^\d{4,8}$/.test(pin); }

  /* ---------- CSV ---------- */
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formulas
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function sortedForExport(entries) {
    return entries.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id;
    });
  }

  function rowsToCsv(rows) {
    return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }

  function buildCsv(entries) {
    var rows = [['Date', 'Type', 'Amount', 'Category', 'Remark', 'Cost code', 'Payee']];
    sortedForExport(entries).forEach(function (e) {
      rows.push([e.date, e.type === 'in' ? 'Cash in' : 'Cash out', e.amount.toFixed(2), e.category, e.note, e.code, e.party]);
    });
    return rowsToCsv(rows);
  }

  function parseCsv(text) {
    text = String(text || '').replace(/^﻿/, '');
    var rows = [], row = [], cell = '', inQ = false, i = 0, c;
    while (i < text.length) {
      c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cell += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ',') { row.push(cell); cell = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
      cell += c; i++;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return x.trim() !== ''; }); });
  }

  function unquoteFormula(s) {
    return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;
  }

  /* Returns { entries: [...], skipped: n } */
  function entriesFromCsv(text) {
    var rows = parseCsv(text);
    var idx = { date: 0, type: 1, amount: 2, category: 3, remark: 4, code: 5, payee: 6 };
    if (rows.length && /^date$/i.test(rows[0][0].trim())) {
      var head = rows.shift().map(function (h) { return h.trim().toLowerCase(); });
      var names = { date: 'date', type: 'type', amount: 'amount', category: 'category', remark: 'remark', code: 'cost code', payee: 'payee' };
      Object.keys(names).forEach(function (k) {
        var p = head.indexOf(names[k]);
        idx[k] = p; // -1 when the column is absent
      });
    }
    var out = [], skipped = 0;
    function cellAt(r, k) { return idx[k] >= 0 && r[idx[k]] != null ? r[idx[k]] : ''; }
    rows.forEach(function (r) {
      var e = sanitizeEntry({
        type: /out/i.test(cellAt(r, 'type')) ? 'out' : 'in',
        amount: parseFloat(String(cellAt(r, 'amount')).replace(/,/g, '')),
        date: cellAt(r, 'date').trim(),
        category: unquoteFormula(cellAt(r, 'category')),
        note: unquoteFormula(cellAt(r, 'remark')),
        code: cellAt(r, 'code').trim().toLowerCase(),
        party: unquoteFormula(cellAt(r, 'payee'))
      });
      if (e) out.push(e); else skipped++;
    });
    return { entries: uniqueEntries(out), skipped: skipped };
  }

  /* ---------- totals, filters, reports ---------- */
  function totals(entries) {
    var i = 0, o = 0;
    entries.forEach(function (e) { if (e.type === 'in') i += e.amount; else o += e.amount; });
    i = round2(i); o = round2(o);
    return { cashIn: i, cashOut: o, balance: round2(i - o) };
  }

  function filterEntries(entries, f) {
    var q = String((f && f.q) || '').trim().toLowerCase();
    return entries.filter(function (e) {
      if (f && f.type && f.type !== 'all' && e.type !== f.type) return false;
      if (f && f.from && e.date < f.from) return false;
      if (f && f.to && e.date > f.to) return false;
      if (q && (e.category + ' ' + e.note + ' ' + e.party).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function monthOf(date) { return date.slice(0, 7); }

  /* The month functions take an optional calendar (see calendar.js); months are keys like "2026-11". */
  function keyFn(cal) { return cal ? cal.monthKey : monthOf; }

  function monthTotals(entries, month, cal) {
    var key = keyFn(cal);
    return totals(entries.filter(function (e) { return key(e.date) === month; }));
  }

  function categoryTotals(entries, month, type, cal) {
    var map = {};
    var key = keyFn(cal);
    entries.forEach(function (e) {
      if (e.type !== type || key(e.date) !== month) return;
      map[e.category] = round2((map[e.category] || 0) + e.amount);
    });
    return Object.keys(map).map(function (k) { return { name: k, total: map[k] }; })
      .sort(function (a, b) { return b.total - a.total; });
  }

  function shiftMonth(month, delta) {
    var y = parseInt(month.slice(0, 4), 10), m = parseInt(month.slice(5, 7), 10) - 1 + delta;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return y + '-' + String(m + 1).padStart(2, '0');
  }

  function lastMonths(entries, endMonth, n, cal) {
    var out = [];
    var shift = cal ? cal.shiftMonth : shiftMonth;
    for (var k = n - 1; k >= 0; k--) {
      var m = shift(endMonth, -k);
      var t = monthTotals(entries, m, cal);
      out.push({ month: m, cashIn: t.cashIn, cashOut: t.cashOut });
    }
    return out;
  }

  /* ---------- construction projects ---------- */
  function sum(list, fn) {
    var t = 0;
    list.forEach(function (x) { t += fn(x); });
    return round2(t);
  }

  function billPaid(bill) { return sum(bill.payments, function (p) { return p.amount; }); }
  function billBalance(bill) { return round2(bill.amount - billPaid(bill)); }
  function certReceived(cert) { return sum(cert.receipts, function (p) { return p.amount; }); }

  /* Certificate arithmetic, shown to the user so they can check it against the contract:
     payable = gross - retention - advance recovery + VAT - withholding */
  function certCalc(project, cert) {
    var retention = round2(cert.gross * project.retention / 100);
    var vat = round2(cert.gross * project.vat / 100);
    var wht = round2(cert.gross * project.wht / 100);
    var payable = round2(cert.gross - retention - cert.advanceRecovery + vat - wht);
    var received = certReceived(cert);
    return {
      gross: cert.gross, retention: retention, advanceRecovery: cert.advanceRecovery,
      vat: vat, wht: wht, payable: payable, received: received, balance: round2(payable - received)
    };
  }

  function projectBooks(state, projectId) {
    return state.books.filter(function (b) { return b.projectId === projectId; });
  }

  /* Cost = all supplier bills + cash-out entries in linked books that do not pay a bill. */
  function projectSummary(state, projectId) {
    var p = null;
    state.projects.forEach(function (x) { if (x.id === projectId) p = x; });
    if (!p) return null;

    var costByCode = {};
    CODES.forEach(function (c) { costByCode[c] = 0; });
    p.bills.forEach(function (b) { costByCode[b.code] = round2(costByCode[b.code] + b.amount); });
    projectBooks(state, projectId).forEach(function (b) {
      b.entries.forEach(function (e) {
        if (e.type !== 'out' || e.billId) return;
        var c = e.code || 'other';
        costByCode[c] = round2(costByCode[c] + e.amount);
      });
    });

    var costTotal = sum(CODES, function (c) { return costByCode[c]; });
    var budgetTotal = sum(CODES, function (c) { return p.budgets[c] || 0; });
    var billsTotal = sum(p.bills, function (b) { return b.amount; });
    var billsPaid = sum(p.bills, function (b) { return billPaid(b); });
    var calcs = p.certs.map(function (c) { return certCalc(p, c); });
    var certified = sum(calcs, function (c) { return c.gross; });
    var payableTotal = sum(calcs, function (c) { return c.payable; });
    var receivedCerts = sum(calcs, function (c) { return c.received; });
    var advanceRecovered = sum(calcs, function (c) { return c.advanceRecovery; });
    var wagesUnpaid = sum(p.attendance, function (a) { return a.paid ? 0 : a.days * a.rate; });
    var bq = boqSummary(p);

    return {
      contractSum: p.contractSum,
      certified: certified,
      pctComplete: p.contractSum > 0 ? round2(certified / p.contractSum * 100) : 0,
      retentionHeld: sum(calcs, function (c) { return c.retention; }),
      advance: p.advance, advanceRecovered: advanceRecovered, advanceBalance: round2(p.advance - advanceRecovered),
      payableTotal: payableTotal,
      received: round2(p.advance + receivedCerts),
      clientOutstanding: round2(payableTotal - receivedCerts),
      costByCode: costByCode, costTotal: costTotal,
      budgetTotal: budgetTotal, budgetRemaining: round2(budgetTotal - costTotal),
      billsTotal: billsTotal, billsPaid: billsPaid, billsOutstanding: round2(billsTotal - billsPaid),
      wagesUnpaid: wagesUnpaid,
      boqTotal: bq.total, boqEarned: bq.earned, physicalPct: bq.pct,
      owed: round2(billsTotal - billsPaid + wagesUnpaid),
      margin: round2(certified - costTotal)
    };
  }

  /* Outstanding amount per supplier across a project's bills (largest first). */
  function supplierBalances(project) {
    var map = {};
    project.bills.forEach(function (b) {
      var key = b.supplier || '';
      map[key] = round2((map[key] || 0) + billBalance(b));
    });
    return Object.keys(map).map(function (k) { return { supplier: k, balance: map[k] }; })
      .filter(function (x) { return x.balance > 0; })
      .sort(function (a, b) { return b.balance - a.balance; });
  }

  /* Unpaid attendance in [from, to], grouped by worker. */
  function payroll(project, from, to) {
    var byWorker = {};
    project.attendance.forEach(function (a) {
      if (a.paid || a.days <= 0 || a.date < from || a.date > to) return;
      var r = byWorker[a.workerId] || (byWorker[a.workerId] = { workerId: a.workerId, days: 0, amount: 0 });
      r.days = round2(r.days + a.days);
      r.amount = round2(r.amount + a.days * a.rate);
    });
    var rows = [];
    project.workers.forEach(function (w) {
      var r = byWorker[w.id];
      if (r) rows.push({ workerId: w.id, name: w.name, days: r.days, amount: r.amount });
    });
    return { rows: rows, total: sum(rows, function (r) { return r.amount; }) };
  }

  function markPaid(project, from, to) {
    var n = 0;
    project.attendance.forEach(function (a) {
      if (!a.paid && a.days > 0 && a.date >= from && a.date <= to) { a.paid = true; n++; }
    });
    return n;
  }

  /* Monday..Sunday week containing the given date. */
  function weekRange(dateStr) {
    var d = new Date(dateStr + 'T00:00:00Z');
    var dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    var start = new Date(d.getTime() - dow * 86400000);
    var end = new Date(start.getTime() + 6 * 86400000);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }

  function projectReportCsv(state, projectId) {
    var p = null;
    state.projects.forEach(function (x) { if (x.id === projectId) p = x; });
    var s = projectSummary(state, projectId);
    if (!p || !s) return '';
    var rows = [['Cost code', 'Budget', 'Actual', 'Remaining']];
    CODES.forEach(function (c) {
      var b = p.budgets[c] || 0;
      rows.push([c, b.toFixed(2), s.costByCode[c].toFixed(2), round2(b - s.costByCode[c]).toFixed(2)]);
    });
    rows.push(['TOTAL', s.budgetTotal.toFixed(2), s.costTotal.toFixed(2), s.budgetRemaining.toFixed(2)]);
    rows.push([]);
    rows.push(['Contract sum', p.contractSum.toFixed(2)]);
    rows.push(['Certified (gross)', s.certified.toFixed(2)]);
    rows.push(['Received (incl. advance)', s.received.toFixed(2)]);
    rows.push(['Due from client', s.clientOutstanding.toFixed(2)]);
    rows.push(['Retention held', s.retentionHeld.toFixed(2)]);
    rows.push(['Owed to suppliers and workers', s.owed.toFixed(2)]);
    rows.push(['Certified minus cost', s.margin.toFixed(2)]);
    if (s.boqTotal > 0) {
      rows.push(['BoQ total', s.boqTotal.toFixed(2)]);
      rows.push(['Value of work done (BoQ)', s.boqEarned.toFixed(2)]);
      rows.push(['Physical progress %', String(s.physicalPct)]);
    }
    return rowsToCsv(rows);
  }

  /* ---------- bill of quantities ---------- */
  function itemAmount(i) { return round2(i.qty * i.rate); }
  function itemEarned(i) { return round2(i.done * i.rate); }
  function isHeading(i) { return !(i.qty > 0) && !(i.rate > 0); }

  function boqSummary(project) {
    var total = sum(project.boq, itemAmount), earned = sum(project.boq, itemEarned);
    return {
      total: total, earned: earned,
      pct: total > 0 ? round2(earned / total * 100) : 0,
      count: project.boq.filter(function (i) { return !isHeading(i); }).length
    };
  }

  /* Gross value of work done that has not been certified yet. */
  function proposeCertGross(project) {
    var earned = boqSummary(project).earned;
    var certified = sum(project.certs, function (c) { return c.gross; });
    return Math.max(0, round2(earned - certified));
  }

  /* Total certified before this certificate and up to and including it (date, then id order). */
  function certCumulative(project, certId) {
    var list = project.certs.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; });
    var prev = 0, cum = null;
    list.forEach(function (c) {
      if (cum !== null) return;
      if (c.id === certId) cum = round2(prev + c.gross); else prev = round2(prev + c.gross);
    });
    return { previous: prev, cumulative: cum === null ? prev : cum };
  }

  function boqCsv(project) {
    var rows = [['No', 'Description', 'Unit', 'Qty', 'Rate', 'Amount', 'Done', 'Value done', 'Done %']];
    project.boq.forEach(function (i) {
      if (isHeading(i)) { rows.push([i.no, i.desc, '', '', '', '', '', '', '']); return; }
      rows.push([i.no, i.desc, i.unit, String(i.qty), i.rate.toFixed(2), itemAmount(i).toFixed(2), String(i.done),
        itemEarned(i).toFixed(2), i.qty > 0 ? String(round2(i.done / i.qty * 100)) : '']);
    });
    var s = boqSummary(project);
    rows.push(['', 'TOTAL', '', '', '', s.total.toFixed(2), '', s.earned.toFixed(2), String(s.pct)]);
    return rowsToCsv(rows);
  }

  /* Reads a bill of quantities from CSV. Returns { items: [...], skipped: n }.
     With a header row, columns are found by name (No, Description, Unit, Qty, Rate, Done);
     without one the order is No, Description, Unit, Qty, Rate. */
  function boqFromCsv(text) {
    var rows = parseCsv(text);
    var idx = { no: 0, desc: 1, unit: 2, qty: 3, rate: 4, done: -1 };
    if (rows.length && rows[0].some(function (c) { return /desc/i.test(c); })) {
      var head = rows.shift();
      idx = { no: -1, desc: -1, unit: -1, qty: -1, rate: -1, done: -1 };
      head.forEach(function (h, pos) {
        h = h.trim();
        if (/done|executed/i.test(h)) { if (idx.done < 0) idx.done = pos; }
        else if (/desc/i.test(h)) { if (idx.desc < 0) idx.desc = pos; }
        else if (/^(qty|quantity)/i.test(h)) { if (idx.qty < 0) idx.qty = pos; }
        else if (/rate|price/i.test(h)) { if (idx.rate < 0) idx.rate = pos; }
        else if (/^(unit|uom)$/i.test(h)) { if (idx.unit < 0) idx.unit = pos; }
        else if (/^(no\.?|item( no\.?)?|ref|code|s\/n)$/i.test(h)) { if (idx.no < 0) idx.no = pos; }
      });
    }
    function cell(r, k) { return idx[k] >= 0 && r[idx[k]] != null ? r[idx[k]] : ''; }
    function number(v) { return parseFloat(String(v).replace(/,/g, '')) || 0; }
    var items = [], skipped = 0;
    rows.forEach(function (r) {
      var it = sanitizeBoqItem({
        no: unquoteFormula(cell(r, 'no')), desc: unquoteFormula(cell(r, 'desc')), unit: unquoteFormula(cell(r, 'unit')),
        qty: number(cell(r, 'qty')), rate: number(cell(r, 'rate')), done: number(cell(r, 'done'))
      });
      if (it) items.push(it); else skipped++;
    });
    return { items: mapList(items, function (x) { return x; }, 3000), skipped: skipped };
  }

  return {
    LANGS: LANGS, CURRENCIES: CURRENCIES, THEMES: THEMES, CALENDARS: CALENDARS, CODES: CODES,
    newId: newId, todayStr: todayStr, isDate: isDate, round2: round2,
    sanitizeEntry: sanitizeEntry, sanitizeState: sanitizeState, defaultState: defaultState, migrateOld: migrateOld,
    sanitizeProject: sanitizeProject, sanitizeBill: sanitizeBill, sanitizeCert: sanitizeCert,
    sanitizeWorker: sanitizeWorker, sanitizeAttendance: sanitizeAttendance, sanitizePayment: sanitizePayment,
    hashPin: hashPin, newSalt: newSalt, validPin: validPin,
    buildCsv: buildCsv, parseCsv: parseCsv, entriesFromCsv: entriesFromCsv,
    totals: totals, filterEntries: filterEntries, monthOf: monthOf,
    monthTotals: monthTotals, categoryTotals: categoryTotals, shiftMonth: shiftMonth, lastMonths: lastMonths,
    billPaid: billPaid, billBalance: billBalance, certReceived: certReceived, certCalc: certCalc,
    projectBooks: projectBooks, projectSummary: projectSummary, supplierBalances: supplierBalances,
    payroll: payroll, markPaid: markPaid, weekRange: weekRange, projectReportCsv: projectReportCsv,
    sanitizeBoqItem: sanitizeBoqItem, itemAmount: itemAmount, itemEarned: itemEarned, isHeading: isHeading,
    boqSummary: boqSummary, proposeCertGross: proposeCertGross, certCumulative: certCumulative,
    boqCsv: boqCsv, boqFromCsv: boqFromCsv, photoIds: photoIds
  };
});
