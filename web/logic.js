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
  var MODES = ['cash', 'bank', 'mobile', 'cheque', 'other'];
  var KINDS = ['customer', 'supplier', 'other'];
  var STAFF_ROLES = ['manager', 'accountant', 'cashier', 'viewer'];
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
  function round6(n) { return Math.round(n * 1e6) / 1e6; }
  /* BoQ quantities and unit rates keep up to 6 decimals (rates from a rate analysis are often like 515.58522);
     rounding them to 2 decimals shifts the totals. */
  function num6(v, min) { var n = Number(v); if (!isFinite(n) || n < min) n = min; return round6(n); }
  /* A rate as text: at least 2 and at most 6 decimals, no trailing zeros beyond 2. */
  function rateStr(n) {
    var x = round6(Number(n) || 0), t = x.toFixed(6).replace(/0+$/, '');
    var d = t.split('.'); if (d[1].length < 2) d[1] = (d[1] + '00').slice(0, 2);
    return d[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + d[1];
  }
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
      photos: photoIds(e.photos),
      mode: MODES.indexOf(e.mode) >= 0 ? e.mode : '',
      by: str(e.by, 40),
      contactId: validId(e.contactId) ? e.contactId : 0
    };
  }
  function uniqueEntries(list) { return mapList(list, sanitizeEntry); }

  /* ---------- contacts and businesses ---------- */
  function sanitizeContact(c) {
    if (!c || typeof c !== 'object') return null;
    var name = str(c.name, 60);
    if (!name) return null;
    return {
      id: validId(c.id) ? c.id : newId(),
      name: name,
      phone: str(c.phone, 30),
      email: str(c.email, 60),
      address: str(c.address, 80),
      kind: KINDS.indexOf(c.kind) >= 0 ? c.kind : 'other',
      note: str(c.note, 80)
    };
  }
  function sanitizeStaff(m) {
    if (!m || typeof m !== 'object') return null;
    var name = str(m.name, 60);
    if (!name) return null;
    return { id: validId(m.id) ? m.id : newId(), name: name, phone: str(m.phone, 30), role: STAFF_ROLES.indexOf(m.role) >= 0 ? m.role : 'cashier' };
  }
  function sanitizeBusiness(b) {
    if (!b || typeof b !== 'object') return null;
    var name = str(b.name, 40);
    if (!name) return null;
    return { id: str(b.id, 40) || ('biz' + newId()), name: name, staff: mapList(b.staff, sanitizeStaff, 200) };
  }

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
      due: isDate(b.due) ? b.due : '',
      amount: round2(a),
      payments: mapList(b.payments, sanitizePayment, 500),
      photos: photoIds(b.photos)
    };
  }

  /* BoQ quantities done at the time a certificate was made: { itemId: qty }. */
  function sanitizeSnap(m) {
    var out = {}, n = 0;
    if (m && typeof m === 'object') Object.keys(m).forEach(function (k) {
      var v = Number(m[k]);
      if (n < 3000 && /^\d{1,20}$/.test(k) && isFinite(v) && v > 0) { out[k] = round6(v); n++; }
    });
    return out;
  }

  /* Advance payment received: a % of the contract sum (the amount follows the %). Older data that only has an
     amount keeps that amount, and gets the % worked out from it. */
  /* Contract sum including VAT: the base for the advance payment received. */
  function contractWithVat(p) { return round2(num(p.contractSum, 0) * (1 + num(p.vat, 0, 100) / 100)); }

  function advanceOf(p) {
    var cs = contractWithVat(p), amount = num(p.advance, 0), pct;
    var given = p.advancePct != null && p.advancePct !== '' && isFinite(Number(p.advancePct));
    if (given) pct = Math.min(100, Math.max(0, Math.round(Number(p.advancePct) * 1e6) / 1e6));
    else pct = cs > 0 ? Math.min(100, Math.round(amount / cs * 1e8) / 1e6) : 0;
    if (cs > 0) amount = round2(cs * pct / 100);
    return { pct: pct, amount: amount };
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
      penalty: num(c.penalty, 0),
      whtReceipt: str(c.whtReceipt, 30),
      vatWhtReceipt: str(c.vatWhtReceipt, 30),
      receipts: mapList(c.receipts, sanitizePayment, 500),
      snap: sanitizeSnap(c.snap)
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
    var out = {
      id: validId(i.id) ? i.id : newId(),
      no: str(i.no, 20),
      desc: desc,
      unit: str(i.unit, 12),
      qty: num6(i.qty, 0),
      rate: num6(i.rate, 0),
      done: num6(i.done, 0)
    };
    if (i.kind === 'sum') { out.kind = 'sum'; out.no = ''; out.unit = ''; out.qty = 0; out.rate = 0; out.done = 0; }
    return out;
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
    var adv = advanceOf(p);
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
      advance: adv.amount,
      advancePct: adv.pct,
      recoveryPct: num(p.recoveryPct == null ? 20 : p.recoveryPct, 0, 100),
      vatWhtPct: num(p.vatWhtPct == null ? 50 : p.vatWhtPct, 0, 100),
      variation: num(p.variation, 0),
      rebate: num(p.rebate, 0, 100),
      contractor: str(p.contractor, 60),
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
      books: [{ id: 'main', name: 'Main', projectId: '', businessId: '', entries: [] }],
      projects: [],
      contacts: [],
      businesses: [],
      business: ''
    };
  }

  /* opts.keepPin: carry pinHash/pinSalt from raw (true for local storage, false for imports) */
  /* Link between a local book and its shared online copy. */
  function sanitizeSync(x) {
    if (!x || typeof x !== 'object' || !/^[a-z0-9]{6,20}$/.test(String(x.id || ''))) return null;
    function map(m, isNum) {
      var out = {}, n = 0;
      if (m && typeof m === 'object') Object.keys(m).forEach(function (k) {
        if (n < 20000 && /^\d{1,20}$/.test(k) && (isNum ? typeof m[k] === 'number' && isFinite(m[k]) : typeof m[k] === 'string' && m[k].length < 20)) { out[k] = m[k]; n++; }
      });
      return out;
    }
    return {
      id: x.id,
      role: x.role === 'owner' || x.role === 'edit' ? x.role : 'view',
      S: map(x.S, false), U: map(x.U, true),
      last: typeof x.last === 'number' && isFinite(x.last) ? x.last : 0,
      ix: x.ix === true,
      nm: typeof x.nm === 'string' ? x.nm.slice(0, 40) : ''
    };
  }

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
    s.contacts = mapList(raw.contacts, sanitizeContact, 2000);
    var biz = [], bSeen = {};
    (Array.isArray(raw.businesses) ? raw.businesses : []).slice(0, 20).forEach(function (rb) {
      var b = sanitizeBusiness(rb);
      if (!b) return;
      while (bSeen[b.id]) b.id = b.id + '_';
      bSeen[b.id] = true; biz.push(b);
    });
    s.businesses = biz;
    s.business = typeof raw.business === 'string' && bSeen[raw.business] ? raw.business : '';
    var cIds = {};
    s.contacts.forEach(function (c) { cIds[c.id] = true; });

    if (Array.isArray(raw.books)) {
      var books = [], seenIds = {};
      raw.books.slice(0, 50).forEach(function (b, i) {
        if (!b || typeof b !== 'object') return;
        var id = str(b.id, 40) || ('b' + (i + 1));
        while (seenIds[id]) id = id + '_';
        seenIds[id] = true;
        var nb = {
          id: id,
          name: str(b.name, 40) || ('Book ' + (books.length + 1)),
          projectId: pIds[b.projectId] ? b.projectId : '',
          businessId: bSeen[b.businessId] ? b.businessId : '',
          updated: isDate(b.updated) ? b.updated : '',
          entries: uniqueEntries(b.entries).map(function (e) { if (e.contactId && !cIds[e.contactId]) e.contactId = 0; return e; })
        };
        var sy = sanitizeSync(b.sync);
        if (sy) nb.sync = sy;
        else if (b.nolink === true) nb.nolink = true;
        books.push(nb);
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
      if (f && f.mode && e.mode !== f.mode) return false;
      if (f && f.by && e.by !== f.by) return false;
      if (f && f.category && e.category !== f.category) return false;
      if (f && f.contactId && e.contactId !== f.contactId) return false;
      if (q) {
        var hay = (e.category + ' ' + e.note + ' ' + e.party + ' ' + e.by + ' ' + (e.mode || '')).toLowerCase();
        if (f && f.contactText) hay += ' ' + f.contactText(e);
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  /* Running totals per contact over every book: money received from / paid to them. */
  function contactBalances(state) {
    var map = {};
    state.contacts.forEach(function (c) { map[c.id] = { cashIn: 0, cashOut: 0, net: 0, count: 0, last: '' }; });
    state.books.forEach(function (b) {
      b.entries.forEach(function (e) {
        var m = e.contactId && map[e.contactId];
        if (!m) return;
        if (e.type === 'in') m.cashIn = round2(m.cashIn + e.amount); else m.cashOut = round2(m.cashOut + e.amount);
        m.net = round2(m.cashIn - m.cashOut);
        m.count++;
        if (e.date > m.last) m.last = e.date;
      });
    });
    return map;
  }

  /* All entries of the given books (or all books) inside a date range, newest last, with the book name. */
  function rangeEntries(state, from, to, bookIds) {
    var out = [];
    state.books.forEach(function (b) {
      if (bookIds && bookIds.indexOf(b.id) < 0) return;
      filterEntries(b.entries, { from: from, to: to }).forEach(function (e) {
        var c = {}; Object.keys(e).forEach(function (k) { c[k] = e[k]; });
        c.bookId = b.id; c.book = b.name; out.push(c);
      });
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; });
  }

  /* Unpaid supplier bills and unpaid certificates, most urgent first.
     due: bill.due when set. level: overdue | soon (within `days`) | later | none. */
  function reminders(state, today, days) {
    var out = [];
    var soon = new Date(today + 'T00:00:00Z').getTime() + (days == null ? 7 : days) * 86400000;
    state.projects.forEach(function (p) {
      p.bills.forEach(function (b) {
        var bal = billBalance(b);
        if (bal <= 0) return;
        var level = 'none';
        if (b.due) {
          var t = new Date(b.due + 'T00:00:00Z').getTime();
          level = b.due < today ? 'overdue' : t <= soon ? 'soon' : 'later';
        }
        out.push({ kind: 'bill', projectId: p.id, project: p.name, id: b.id, who: b.supplier, desc: b.desc, due: b.due, amount: bal, level: level });
      });
      p.certs.forEach(function (c) {
        var bal = certCalc(p, c).balance;
        if (bal > 0) out.push({ kind: 'cert', projectId: p.id, project: p.name, id: c.id, who: c.no, desc: '', due: '', amount: bal, level: 'none' });
      });
    });
    var rank = { overdue: 0, soon: 1, later: 2, none: 3 };
    return out.sort(function (a, b) {
      return rank[a.level] - rank[b.level] || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0) || b.amount - a.amount;
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
       net payable = (gross + VAT) - retention (% of gross + VAT) - advance recovery - penalty
     Withholding tax (on the gross work) and the withheld share of VAT (50% of VAT, e.g. 7.5%) are NOT part of
     the certificate. They come off the net payable afterwards, and the client gives a receipt for each, so the
     cash to receive = net payable - withholding - VAT withheld. */
  function certCalc(project, cert) {
    var vat = round2(cert.gross * project.vat / 100);
    var retention = round2((cert.gross + vat) * project.retention / 100);   // retention is held on the work including VAT
    var wht = round2(cert.gross * project.wht / 100);
    var vatWht = round2(vat * (project.vatWhtPct == null ? 50 : project.vatWhtPct) / 100);
    var penalty = cert.penalty || 0;
    var payable = round2(cert.gross - retention - cert.advanceRecovery + vat - penalty);
    var cashDue = round2(payable - wht - vatWht);
    var received = certReceived(cert);
    return {
      gross: cert.gross, retention: retention, advanceRecovery: cert.advanceRecovery, penalty: penalty,
      vat: vat, payable: payable, wht: wht, vatWht: vatWht, cashDue: cashDue,
      received: received, balance: round2(cashDue - received)
    };
  }

  /* Advance repayment to suggest for a certificate: the project's % of the work including VAT,
     never more than the advance that is still unrecovered. */
  function suggestAdvanceRecovery(project, gross, exceptCertId) {
    var recovered = sum(project.certs, function (c) { return c.id === exceptCertId ? 0 : c.advanceRecovery; });
    var left = Math.max(0, round2(project.advance - recovered));
    var want = round2(gross * (1 + project.vat / 100) * (project.recoveryPct == null ? 20 : project.recoveryPct) / 100);
    return Math.min(left, want);
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
      received: round2(p.advance + receivedCerts + sum(calcs, function (c) { return c.wht + c.vatWht; })),
      taxWithheld: sum(calcs, function (c) { return c.wht + c.vatWht; }),
      clientOutstanding: round2(sum(calcs, function (c) { return c.cashDue; }) - receivedCerts),
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
    rows.push(['Received (incl. advance and tax withheld)', s.received.toFixed(2)]);
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
  // totals add the unrounded line amounts and round once at the end, like a spreadsheet SUM
  function rawSum(list, f) { return round2(list.reduce(function (a, i) { return a + f(i); }, 0)); }
  function isSumRow(i) { return i.kind === 'sum'; }
  function isHeading(i) { return i.kind !== 'sum' && !(i.qty > 0) && !(i.rate > 0); }
  /* Summary rows add up the items above them back to the previous summary row (or the top of the list).
     Returns { id: { amt, earned } }. Summary rows are never part of the grand total. */
  function boqSubtotals(project) {
    var out = {}, amt = 0, earned = 0;
    project.boq.forEach(function (i) {
      if (isSumRow(i)) { out[i.id] = { amt: round2(amt), earned: round2(earned) }; amt = 0; earned = 0; }
      else { amt += i.qty * i.rate; earned += i.done * i.rate; }
    });
    return out;
  }

  function boqSummary(project) {
    var total = rawSum(project.boq, function (i) { return i.qty * i.rate; }), earned = rawSum(project.boq, function (i) { return i.done * i.rate; });
    return {
      total: total, earned: earned,
      pct: total > 0 ? round2(earned / total * 100) : 0,
      count: project.boq.filter(function (i) { return !isHeading(i) && !isSumRow(i); }).length
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

  /* ---------- progress per certificate (for Excel export) ---------- */
  function boqSnapshot(project) {
    var m = {};
    project.boq.forEach(function (i) { if (i.done > 0) m[i.id] = i.done; });
    return m;
  }
  function sortedCerts(project) {
    return project.certs.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; });
  }
  /* Rows { item, prev, cur, total } for the BoQ. certId null = "now" (live quantities done, against the last certificate). */
  function boqProgress(project, certId) {
    var list = sortedCerts(project), idx = -1;
    list.forEach(function (c, k) { if (c.id === certId) idx = k; });
    var totalMap, prevMap;
    if (idx < 0) {
      totalMap = boqSnapshot(project);
      prevMap = list.length ? list[list.length - 1].snap : {};
    } else {
      var c = list[idx];
      totalMap = Object.keys(c.snap || {}).length ? c.snap : (idx === list.length - 1 ? boqSnapshot(project) : (idx > 0 ? list[idx - 1].snap : {}));
      prevMap = idx > 0 ? list[idx - 1].snap : {};
    }
    return project.boq.map(function (item) {
      var total = totalMap[item.id] || 0, prev = prevMap[item.id] || 0;
      if (prev > total) prev = total;
      return { item: item, prev: prev, cur: round6(total - prev), total: total };
    });
  }

  /* Sections for the summary: a heading with no number (or "2." / "A.") starts a section.
     "A. SUBSTRUCTURE" style headings (letter + dot) are groups of sections. */
  function boqSections(project) {
    var sections = [], cur = null;
    project.boq.forEach(function (i, idx) {
      if (isHeading(i) && (!i.no || /^(\d+|[A-Za-z])\.?$/.test(i.no))) {
        var group = /^[A-Za-z]\.\s/.test(i.desc) || /^[A-Za-z]\.?$/.test(i.no || '');
        cur = { title: (i.no && !/^[A-Za-z]\.?$/.test(i.no) ? i.no.replace(/\.?$/, '.') + ' ' : '') + i.desc, group: group, from: idx, to: idx, items: [] };
        sections.push(cur);
      } else {
        if (!cur) { cur = { title: 'Items', group: false, from: idx, to: idx, items: [] }; sections.push(cur); }
        cur.items.push(idx); cur.to = idx;
      }
    });
    return sections;
  }

  /* Amount in words, e.g. "Four Million five hundred seventy six thousand ... and 48/100 Birr only". */
  function amountWords(n, unit) {
    n = Math.abs(round2(n));
    var whole = Math.floor(n), cents = Math.round((n - whole) * 100);
    var ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    var tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    function below1000(x) {
      var out = [];
      if (x >= 100) { out.push(ones[Math.floor(x / 100)] + ' hundred'); x %= 100; }
      if (x >= 20) { out.push(tens[Math.floor(x / 10)] + (x % 10 ? '-' + ones[x % 10] : '')); }
      else if (x > 0) out.push(ones[x]);
      return out.join(' ');
    }
    var words;
    if (whole === 0) words = 'zero';
    else {
      var scales = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']], parts = [], rest = whole;
      scales.forEach(function (sc) {
        if (rest >= sc[0]) { parts.push(below1000(Math.floor(rest / sc[0])) + ' ' + sc[1]); rest = rest % sc[0]; }
      });
      if (rest > 0) parts.push(below1000(rest));
      words = parts.join(' ');
    }
    words = words.charAt(0).toUpperCase() + words.slice(1);
    return words + (cents ? ' and ' + String(cents).padStart(2, '0') + '/100' : '') + ' ' + (unit || 'Birr') + ' only';
  }

  function boqCsv(project) {
    var rows = [['No', 'Description', 'Unit', 'Qty', 'Rate', 'Amount', 'Done', 'Value done', 'Done %']];
    var subs = boqSubtotals(project);
    project.boq.forEach(function (i) {
      if (isSumRow(i)) { var sb = subs[i.id]; rows.push(['SUM', i.desc, '', '', '', sb.amt.toFixed(2), '', sb.earned.toFixed(2), '']); return; }
      if (isHeading(i)) { rows.push([i.no, i.desc, '', '', '', '', '', '', '']); return; }
      rows.push([i.no, i.desc, i.unit, String(i.qty), String(round6(i.rate)), itemAmount(i).toFixed(2), String(i.done),
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
      var isSum = String(cell(r, 'no')).trim().toUpperCase() === 'SUM';
      var it = sanitizeBoqItem({
        kind: isSum ? 'sum' : undefined,
        no: unquoteFormula(cell(r, 'no')), desc: unquoteFormula(cell(r, 'desc')), unit: unquoteFormula(cell(r, 'unit')),
        qty: number(cell(r, 'qty')), rate: number(cell(r, 'rate')), done: number(cell(r, 'done'))
      });
      if (it) items.push(it); else skipped++;
    });
    return { items: mapList(items, function (x) { return x; }, 3000), skipped: skipped };
  }

  return {
    MODES: MODES, KINDS: KINDS, STAFF_ROLES: STAFF_ROLES,
    sanitizeContact: sanitizeContact, sanitizeBusiness: sanitizeBusiness, contactBalances: contactBalances,
    rangeEntries: rangeEntries, reminders: reminders,
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
    sanitizeBoqItem: sanitizeBoqItem, contractWithVat: contractWithVat, itemAmount: itemAmount, rateStr: rateStr, rawSum: rawSum, itemEarned: itemEarned, isHeading: isHeading, isSumRow: isSumRow, boqSubtotals: boqSubtotals,
    suggestAdvanceRecovery: suggestAdvanceRecovery, boqSummary: boqSummary, proposeCertGross: proposeCertGross, certCumulative: certCumulative,
    boqSnapshot: boqSnapshot, sortedCerts: sortedCerts, boqProgress: boqProgress, boqSections: boqSections, amountWords: amountWords,
    boqCsv: boqCsv, boqFromCsv: boqFromCsv, photoIds: photoIds
  };
});
