/* Pure data logic for CashBook: no DOM access, so it can be unit-tested in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CBLogic = factory();
})(this, function () {
  'use strict';

  var LANGS = ['en', 'om', 'am'];
  var CURRENCIES = ['ETB', 'USD', 'EUR', 'GBP', 'KES', 'SAR', 'AED', 'none'];
  var THEMES = ['system', 'light', 'dark'];

  var idCounter = 0;
  function newId() {
    idCounter += 1;
    return Date.now() * 1000 + (idCounter % 1000);
  }

  function round2(n) { return Math.round(n * 100) / 100; }
  function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
  function isDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function sanitizeEntry(e) {
    if (!e || typeof e !== 'object') return null;
    var amt = Number(e.amount);
    if (!isFinite(amt) || amt <= 0) return null;
    return {
      id: (typeof e.id === 'number' && isFinite(e.id)) ? e.id : newId(),
      type: e.type === 'out' ? 'out' : 'in',
      amount: round2(amt),
      date: isDate(e.date) ? e.date : todayStr(),
      category: str(e.category, 40),
      note: str(e.note, 80)
    };
  }

  function uniqueEntries(list) {
    var seen = {};
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (raw) {
      var e = sanitizeEntry(raw);
      if (!e) return;
      while (seen[e.id]) e.id = newId();
      seen[e.id] = true;
      out.push(e);
    });
    return out;
  }

  function defaultState() {
    return {
      v: 2,
      current: 'main',
      settings: { lang: 'en', currency: 'ETB', theme: 'system', pinHash: '', pinSalt: '' },
      books: [{ id: 'main', name: 'Main', entries: [] }]
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
    if (keepPin && typeof rs.pinHash === 'string' && typeof rs.pinSalt === 'string' && rs.pinHash && rs.pinSalt) {
      s.settings.pinHash = rs.pinHash.slice(0, 64);
      s.settings.pinSalt = rs.pinSalt.slice(0, 64);
    }

    if (Array.isArray(raw.books)) {
      var books = [];
      var seenIds = {};
      raw.books.slice(0, 50).forEach(function (b, i) {
        if (!b || typeof b !== 'object') return;
        var id = str(b.id, 40) || ('b' + (i + 1));
        while (seenIds[id]) id = id + '_';
        seenIds[id] = true;
        books.push({ id: id, name: str(b.name, 40) || ('Book ' + (books.length + 1)), entries: uniqueEntries(b.entries) });
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

  /* --- PIN hashing (casual lock, not strong crypto) --- */
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

  /* --- CSV --- */
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

  function buildCsv(entries) {
    var rows = [['Date', 'Type', 'Amount', 'Category', 'Remark']];
    sortedForExport(entries).forEach(function (e) {
      rows.push([e.date, e.type === 'in' ? 'Cash in' : 'Cash out', e.amount.toFixed(2), e.category, e.note]);
    });
    return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
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
    var idx = { date: 0, type: 1, amount: 2, category: 3, remark: 4 };
    if (rows.length && /^date$/i.test(rows[0][0].trim())) {
      var head = rows.shift().map(function (h) { return h.trim().toLowerCase(); });
      ['date', 'type', 'amount', 'category', 'remark'].forEach(function (k) {
        var p = head.indexOf(k);
        if (p >= 0) idx[k] = p;
      });
    }
    var out = [], skipped = 0;
    rows.forEach(function (r) {
      var amount = parseFloat(String(r[idx.amount] || '').replace(/,/g, ''));
      var e = sanitizeEntry({
        type: /out/i.test(r[idx.type] || '') ? 'out' : 'in',
        amount: amount,
        date: (r[idx.date] || '').trim(),
        category: unquoteFormula(r[idx.category] || ''),
        note: unquoteFormula(r[idx.remark] || '')
      });
      if (e) out.push(e); else skipped++;
    });
    return { entries: uniqueEntries(out), skipped: skipped };
  }

  /* --- totals, filters, reports --- */
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
      if (q && (e.category + ' ' + e.note).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function monthOf(date) { return date.slice(0, 7); }

  function monthTotals(entries, month) {
    return totals(entries.filter(function (e) { return monthOf(e.date) === month; }));
  }

  function categoryTotals(entries, month, type) {
    var map = {};
    entries.forEach(function (e) {
      if (e.type !== type || monthOf(e.date) !== month) return;
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

  function lastMonths(entries, endMonth, n) {
    var out = [];
    for (var k = n - 1; k >= 0; k--) {
      var m = shiftMonth(endMonth, -k);
      var t = monthTotals(entries, m);
      out.push({ month: m, cashIn: t.cashIn, cashOut: t.cashOut });
    }
    return out;
  }

  return {
    LANGS: LANGS, CURRENCIES: CURRENCIES, THEMES: THEMES,
    newId: newId, todayStr: todayStr, isDate: isDate,
    sanitizeEntry: sanitizeEntry, sanitizeState: sanitizeState, defaultState: defaultState, migrateOld: migrateOld,
    hashPin: hashPin, newSalt: newSalt, validPin: validPin,
    buildCsv: buildCsv, parseCsv: parseCsv, entriesFromCsv: entriesFromCsv,
    totals: totals, filterEntries: filterEntries, monthOf: monthOf,
    monthTotals: monthTotals, categoryTotals: categoryTotals, shiftMonth: shiftMonth, lastMonths: lastMonths
  };
});
