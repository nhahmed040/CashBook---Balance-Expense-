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
      sec: validId(e.sec) ? e.sec : 0,
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
      sec: validId(b.sec) ? b.sec : 0,
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

  function sanitizeVariation(v) {
    if (!v || typeof v !== 'object') return null;
    var desc = str(v.desc, 120);
    if (!desc) return null;
    return { id: validId(v.id) ? v.id : newId(), desc: desc, unit: str(v.unit, 12), qty: num6(v.qty, 0), rate: num6(v.rate, 0) };
  }
  /* Variation orders added to one certificate (they are part of its gross work, before VAT). */
  function certVariation(cert) {
    return rawSum(cert.variations || [], function (v) { return v.qty * v.rate; });
  }
  /* Project variation total: the larger of the figure typed in project details and what the certificates carry. */
  function variationTotal(p) {
    var certified = round2((p.certs || []).reduce(function (a, c) { return a + certCalcVariation(p, c); }, 0));
    return Math.max(round2(num(p.variation, 0)), certified);
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
      variations: mapList(c.variations, sanitizeVariation, 200),
      status: CERT_STATUSES.indexOf(c.status) >= 0 ? c.status : '',
      sentDate: isDate(c.sentDate) ? c.sentDate : '',
      approvedDate: isDate(c.approvedDate) ? c.approvedDate : '',
      paidDate: isDate(c.paidDate) ? c.paidDate : '',
      snap: sanitizeSnap(c.snap)
    };
  }
  /* Certificate follow-up: Draft -> Submitted -> Approved -> Paid. An empty status is worked out from the receipts. */
  var CERT_STATUSES = ['draft', 'submitted', 'approved', 'paid'];
  var CERT_APPROVE_DAYS = 14, CERT_PAY_DAYS = 21;
  function certStatus(cert, calc) {
    if (cert.status) return cert.status;
    return calc && calc.received > 0 && calc.balance <= 0 ? 'paid' : 'draft';
  }
  function daysSince(date, today) {
    return Math.floor((new Date(today + 'T00:00:00Z').getTime() - new Date(date + 'T00:00:00Z').getTime()) / 86400000);
  }

  function sanitizeWorker(w) {
    if (!w || typeof w !== 'object') return null;
    var name = str(w.name, 60);
    if (!name) return null;
    return { id: validId(w.id) ? w.id : newId(), name: name, role: str(w.role, 40), rate: num(w.rate, 0) };
  }

  /* Site diary: one entry per day (several allowed). Photos stay on the phone. */
  var WEATHER = ['sunny', 'cloudy', 'rain', 'windy', 'hot'];
  function sanitizeDiary(d) {
    if (!d || typeof d !== 'object' || !isDate(d.date)) return null;
    var out = {
      id: validId(d.id) ? d.id : newId(), date: d.date,
      weather: WEATHER.indexOf(d.weather) >= 0 ? d.weather : '',
      workers: Math.round(num(d.workers, 0, 100000)),
      work: str(d.work, 1000), problems: str(d.problems, 600), visitors: str(d.visitors, 200),
      photos: photoIds(d.photos)
    };
    return out.work || out.problems || out.visitors || out.photos.length || out.workers ? out : null;
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
    var desc = str(i.desc, 2000);
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
    if (i.kind === 'sum' || i.kind === 'group' || i.kind === 'line') { out.kind = i.kind; out.no = ''; out.unit = ''; out.qty = 0; out.rate = 0; out.done = 0; }
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
    var out = {
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
      approveDays: p.approveDays == null || p.approveDays === '' ? CERT_APPROVE_DAYS : Math.round(num(p.approveDays, 1, 365)),
      payDays: p.payDays == null || p.payDays === '' ? CERT_PAY_DAYS : Math.round(num(p.payDays, 1, 365)),
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
      diary: mapList(p.diary, sanitizeDiary, 3000),
      attendance: Object.keys(attMap).map(function (k) { return attMap[k]; }),
      boq: p.boqLines >= 2 ? mapList(p.boq, sanitizeBoqItem, 3000) : migrateBoq(mapList(p.boq, sanitizeBoqItem, 3000), p.boqLines ? 1 : 0),
      boqLines: 2,
      photos: photoIds(p.photos)
    };
    var psy = sanitizeProjSync(p.sync);
    if (psy) out.sync = psy;
    return out;
  }

  /* ---------- shared projects: the project as separate records ---------- */
  function sanitizeProjSync(x) {
    if (!x || typeof x !== 'object' || !/^[a-z0-9]{6,20}$/.test(String(x.id || ''))) return undefined;
    function map(m, isNum) {
      var out = {}, n = 0;
      if (m && typeof m === 'object') Object.keys(m).forEach(function (k) {
        if (n < 60000 && /^(info|ord|[bclwad]\d{1,20})$/.test(k) && (isNum ? typeof m[k] === 'number' && isFinite(m[k]) : typeof m[k] === 'string' && m[k].length < 20)) { out[k] = m[k]; n++; }
      });
      return out;
    }
    return {
      id: x.id, role: x.role === 'owner' || x.role === 'edit' ? x.role : 'view',
      S: map(x.S, false), U: map(x.U, true),
      last: typeof x.last === 'number' && isFinite(x.last) ? x.last : 0,
      ix: x.ix === true, fresh: x.fresh === true,
      st: typeof x.st === 'number' && isFinite(x.st) ? x.st : 0
    };
  }
  var REC_LISTS = { b: 'boq', c: 'certs', l: 'bills', w: 'workers', a: 'attendance', d: 'diary' };
  /* key -> record. Photos stay on the phone (they are not shared). */
  function projectRecords(p) {
    var recs = {}, info = {};
    Object.keys(p).forEach(function (k) {
      if (k === 'id' || k === 'sync' || k === 'photos' || k === 'boqLines' || Array.isArray(p[k])) return;
      info[k] = p[k];
    });
    recs.info = JSON.parse(JSON.stringify(info));
    recs.ord = { ids: p.boq.map(function (i) { return i.id; }) };
    Object.keys(REC_LISTS).forEach(function (pre) {
      (p[REC_LISTS[pre]] || []).forEach(function (x) {
        var c = JSON.parse(JSON.stringify(x));
        delete c.photos;
        recs[pre + x.id] = c;
      });
    });
    return recs;
  }
  /* put merged records back into p (in place). Returns p. */
  function applyProjectRecords(p, merged) {
    var lists = { boq: [], certs: [], bills: [], workers: [], attendance: [], diary: [] }, ord = (merged.ord && merged.ord.ids) || [], pos = {};
    ord.forEach(function (id, i) { pos[id] = i; });
    var localBills = {}, localDiary = {};
    p.bills.forEach(function (b) { localBills[b.id] = b; });
    (p.diary || []).forEach(function (d) { localDiary[d.id] = d; });
    Object.keys(merged).forEach(function (k) {
      var pre = k.charAt(0), list = REC_LISTS[pre];
      if (!list || k === 'info' || k === 'ord' || !/^[bclwad]\d+$/.test(k)) return;
      var rec = JSON.parse(JSON.stringify(merged[k]));
      if (pre === 'l' && localBills[rec.id]) rec.photos = localBills[rec.id].photos;
      if (pre === 'd' && localDiary[rec.id]) rec.photos = localDiary[rec.id].photos;
      lists[list].push(rec);
    });
    lists.boq.sort(function (x, y) {
      var px = pos[x.id] == null ? 1e9 : pos[x.id], py = pos[y.id] == null ? 1e9 : pos[y.id];
      return px - py || x.id - y.id;
    });
    ['certs', 'bills', 'workers', 'attendance', 'diary'].forEach(function (l) { lists[l].sort(function (x, y) { return x.id - y.id; }); });
    var raw = Object.assign({}, merged.info || {}, lists, { id: p.id, boqLines: 2, photos: p.photos, sync: p.sync });
    var clean = sanitizeProject(raw, 1);
    Object.keys(p).forEach(function (k) { delete p[k]; });
    Object.assign(p, clean);
    return p;
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
      business: '',
      trash: []
    };
  }

  /* ---------- Recently deleted: removed items stay recoverable for 30 days ---------- */
  var TRASH_DAYS = 30, TRASH_MAX = 200;
  var TRASH_KINDS = ['entry', 'boqrow', 'bill', 'cert', 'contact', 'project', 'book'];
  function sanitizeTrash(list, now) {
    var out = [], seen = {};
    now = now || Date.now();
    (Array.isArray(list) ? list : []).forEach(function (r) {
      if (!r || typeof r !== 'object' || TRASH_KINDS.indexOf(r.kind) < 0) return;
      if (!r.payload || typeof r.payload !== 'object') return;
      var at = Number(r.deletedAt);
      if (!isFinite(at) || at <= 0 || now - at > TRASH_DAYS * 86400000) return;
      var id = validId(r.id) ? r.id : newId();
      if (seen[id]) return;
      seen[id] = true;
      out.push({
        id: id, kind: r.kind, label: str(r.label, 120), deletedAt: at, payload: r.payload,
        ctx: r.ctx && typeof r.ctx === 'object' ? r.ctx : {},
        photos: (Array.isArray(r.photos) ? r.photos : []).filter(validId).slice(0, 2000)
      });
    });
    out.sort(function (a, b) { return b.deletedAt - a.deletedAt; });
    return out.slice(0, TRASH_MAX);
  }
  /* Photos still needed by items in the trash (so they are not removed early). */
  function trashPhotoIds(trash) {
    var ids = [];
    (trash || []).forEach(function (r) { ids = ids.concat(r.photos || []); });
    return ids;
  }
  /* Clean copy of a trashed payload, ready to be put back (null if unusable). */
  function trashRestoreItem(rec) {
    var x = rec.payload;
    switch (rec.kind) {
      case 'entry': return sanitizeEntry(x);
      case 'boqrow': return sanitizeBoqItem(x);
      case 'bill': return sanitizeBill(x);
      case 'cert': return sanitizeCert(x);
      case 'contact': return sanitizeContact(x);
      case 'project': return sanitizeProject(x, 1);
      case 'book':
        var b = sanitizeState({ books: [x], projects: [], contacts: [] }, {}).books[0];
        if (b && !(x && Array.isArray(x.entries) && x.entries.length) && b.entries.length === 0) b.name = str(x && x.name, 40) || b.name;
        return b;
    }
    return null;
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
    s.trash = sanitizeTrash(raw.trash);
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
        var cc = certCalc(p, c), bal = cc.balance, st = certStatus(c, cc);
        if (bal > 0 && st !== 'paid') {
          var level = 'none', note = '', d;
          if (st === 'submitted' && c.sentDate && (d = daysSince(c.sentDate, today)) >= (p.approveDays || CERT_APPROVE_DAYS)) { level = 'overdue'; note = 'submitted:' + d; }
          else if (st === 'approved' && c.approvedDate && (d = daysSince(c.approvedDate, today)) >= (p.payDays || CERT_PAY_DAYS)) { level = 'overdue'; note = 'approved:' + d; }
          else if (st === 'draft' && (d = daysSince(c.date, today)) >= 7) { level = 'later'; note = 'draft:' + d; }
          out.push({ kind: 'cert', projectId: p.id, project: p.name, id: c.id, who: c.no, desc: '', note: note, status: st, due: '', amount: bal, level: level });
        }
      });
      var un = p.attendance.filter(function (a) { return !a.paid; });
      if (un.length) {
        var oldest = un.reduce(function (m, a) { return a.date < m ? a.date : m; }, un[0].date), dw = daysSince(oldest, today);
        out.push({ kind: 'wages', projectId: p.id, project: p.name, id: 0, who: '', desc: '', note: 'wages:' + dw, due: '', amount: round2(sum(un, function (a) { return a.days * a.rate; })), level: dw >= 7 ? 'overdue' : 'later' });
      }
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
    var variation = certVariation(cert);
    var taxSettled = round2((cert.whtReceipt ? wht : 0) + (cert.vatWhtReceipt ? vatWht : 0));
    return {
      variationOrder: certCalcVariation(project, cert), taxSettled: taxSettled,
      gross: cert.gross, variation: variation, work: round2(cert.gross - variation), retention: retention, advanceRecovery: cert.advanceRecovery, penalty: penalty,
      vat: vat, payable: payable, wht: wht, vatWht: vatWht, cashDue: cashDue,
      received: received, balance: round2(payable - taxSettled - received)
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
      received: round2(p.advance + payableTotal),
      vatTotal: sum(calcs, function (c) { return c.vat; }), whtTotal: sum(calcs, function (c) { return c.wht; }), vatWhtTotal: sum(calcs, function (c) { return c.vatWht; }),
      variationTotal: variationTotal(p),
      taxWithheld: sum(calcs, function (c) { return c.wht + c.vatWht; }),
      clientOutstanding: sum(calcs, function (c) { return c.balance; }),
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
    rows.push(['Received (Net Payments + Advance)', s.received.toFixed(2)]);
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
  function isGroupRow(i) { return i.kind === 'group'; }
  function isLineRow(i) { return i.kind === 'line'; }
  function isItemRow(i) { return !isHeading(i) && !isSumRow(i) && !isGroupRow(i) && !isLineRow(i); }
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

  /* ---------- certificate lock ----------
     Only the latest certificate can be a draft. It follows the live progress. Every earlier
     certificate, and any certificate that is submitted, approved or paid, is locked: its saved
     quantities are frozen and new progress counts for the next payment. */
  function certLocked(project, cert) {
    var list = sortedCerts(project), last = list[list.length - 1];
    return cert !== last || certStatus(cert, certCalc(project, cert)) !== 'draft';
  }
  function draftCert(project) {
    var list = sortedCerts(project), last = list[list.length - 1];
    return last && !certLocked(project, last) ? last : null;
  }
  /* Quantities of the last locked certificate: the quantities that can no longer go down. */
  function lockedSnap(project) {
    var out = {};
    sortedCerts(project).forEach(function (c) { if (certLocked(project, c)) out = c.snap || {}; });
    return out;
  }
  function snapDiffers(project, cert) {
    var now = boqSnapshot(project), then = cert.snap || {}, diff = false;
    Object.keys(now).concat(Object.keys(then)).forEach(function (k) { if (Math.abs((now[k] || 0) - (then[k] || 0)) > 1e-9) diff = true; });
    return diff;
  }
  /* Bring a draft certificate up to date with the live progress. Returns the new gross, or 0 if nothing to certify. */
  function refreshDraft(project, cert) {
    var others = sum(project.certs, function (c) { return c === cert ? 0 : c.gross; });
    var work = Math.max(0, round2(boqSummary(project).earned - others));
    cert.snap = boqSnapshot(project);
    if (work <= 0) return 0;
    cert.gross = round2(work + certVariation(cert));
    return cert.gross;
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

  /* Row types: item, plain row, 'line' (Summary line: a title whose value is the next total below it),
     'sum' (Total carried to summary: adds up the items above it back to the previous total) and 'group'.
     Older projects are converted once (p.boqLines): 0 = guessed headings, 1 = v2.6 where totals carried section titles. */
  var SUM_DEFAULT = 'Total carried to summary';
  function migrateBoq(boq, from) {
    if (!boq.length) return boq;
    if (from === 1) return migrateBoqV1(boq);
    var secs = boqSections({ boq: boq }), insertAfter = {}, group = {}, line = {};
    secs.forEach(function (sec) {
      if (sec.group) { group[sec.from] = true; return; }
      var total = 0;
      sec.items.forEach(function (idx) { var it = boq[idx]; if (!isHeading(it) && !isSumRow(it)) total += it.qty * it.rate; });
      if (total > 0) { line[sec.from] = sec.title; if (!isSumRow(boq[sec.to])) insertAfter[sec.to] = true; }
    });
    var out = [];
    boq.forEach(function (it, idx) {
      if (group[idx]) {
        var g = JSON.parse(JSON.stringify(it)); g.kind = 'group'; g.desc = it.desc.replace(/^[A-Za-z]\.\s*/, '') || it.desc;
        out.push(sanitizeBoqItem(g));
      } else if (line[idx] !== undefined && isHeading(it) && !isSumRow(it)) {
        out.push(sanitizeBoqItem({ id: it.id, kind: 'line', desc: line[idx] }));
      } else out.push(it);
      if (insertAfter[idx]) out.push(sanitizeBoqItem({ kind: 'sum', desc: SUM_DEFAULT }));
    });
    return out;
  }
  /* v2.6 data: a total row held the section title. Turn that title into a Summary line at the start of its segment. */
  function migrateBoqV1(boq) {
    var res = [], start = 0;
    for (var i = 0; i < boq.length; i++) {
      var it = boq[i];
      if (isGroupRow(it)) { res.push(it); start = res.length; continue; }
      if (isSumRow(it)) {
        var title = it.desc;
        if (title && title !== SUM_DEFAULT) {
          var seg = res.slice(start), hit = -1;
          seg.forEach(function (x, k) { if (hit < 0 && isHeading(x) && !isSumRow(x) && !isGroupRow(x) && (x.no ? x.no.replace(/\.?$/, '.') + ' ' : '') + x.desc === title) hit = start + k; });
          if (hit >= 0) res[hit] = sanitizeBoqItem({ id: res[hit].id, kind: 'line', desc: title });
          else res.splice(start, 0, sanitizeBoqItem({ kind: 'line', desc: title }));
          res.push(sanitizeBoqItem({ id: it.id, kind: 'sum', desc: SUM_DEFAULT }));
        } else res.push(it);
        start = res.length;
        continue;
      }
      res.push(it);
    }
    return res;
  }
  /* Value of every Summary line: the next total below it, before the next Summary line or group title. */
  function boqLineTotals(project) {
    var subs = boqSubtotals(project), out = {}, open = null;
    project.boq.forEach(function (it) {
      if (isLineRow(it)) { open = it.id; out[it.id] = null; }
      else if (isGroupRow(it)) open = null;
      else if (isSumRow(it) && open != null && out[open] === null) { out[open] = { sumId: it.id, amt: subs[it.id].amt, earned: subs[it.id].earned }; open = null; }
    });
    return out;
  }

  /* Variation order from exceed quantities: BoQ items whose executed quantity, up to and including this certificate,
     goes over the contract quantity. Only the excess added since the previous certificate counts for this one. */
  function boqVariation(project, certId) {
    var rows = [];
    boqProgress(project, certId).forEach(function (p) {
      var it = p.item;
      if (isHeading(it) || isSumRow(it) || !(it.qty > 0)) return;
      var exTotal = Math.max(0, p.total - it.qty), exPrev = Math.max(0, p.prev - it.qty);
      var exceed = round6(exTotal - exPrev);
      if (exceed > 0) rows.push({ item: it, contractQty: it.qty, rate: it.rate, executed: p.total, prevVaried: round6(exPrev), exceed: exceed, amount: exceed * it.rate });
    });
    return { rows: rows, total: rawSum(rows, function (r) { return r.amount; }) };
  }
  /* Variation order number: 1, 2, 3 ... counting only the certificates that have one. 0 = none. */
  function variationOrderNo(project, certId) {
    var n = 0, found = 0;
    sortedCerts(project).forEach(function (c) {
      if (certCalcVariation(project, c) > 0) { n++; if (c.id === certId) found = n; }
    });
    return found;
  }
  function certCalcVariation(project, cert) { return round2(boqVariation(project, cert.id).total + certVariation(cert)); }

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
      if (isLineRow(i)) { rows.push(['LINE', i.desc, '', '', '', '', '', '', '']); return; }
      if (isGroupRow(i)) { rows.push(['GROUP', i.desc, '', '', '', '', '', '', '']); return; }
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
      var mark = String(cell(r, 'no')).trim().toUpperCase(), isSum = mark === 'SUM';
      var it = sanitizeBoqItem({
        kind: isSum ? 'sum' : (mark === 'GROUP' ? 'group' : (mark === 'LINE' ? 'line' : undefined)),
        no: unquoteFormula(cell(r, 'no')), desc: unquoteFormula(cell(r, 'desc')), unit: unquoteFormula(cell(r, 'unit')),
        qty: number(cell(r, 'qty')), rate: number(cell(r, 'rate')), done: number(cell(r, 'done'))
      });
      if (it) items.push(it); else skipped++;
    });
    return { items: mapList(items, function (x) { return x; }, 3000), skipped: skipped };
  }

  /* ---------- BoQ from an Excel sheet (rows of cell values) ----------
     Finds the header row (Description + Qty + Rate), then types every row:
       qty and rate filled          -> item
       "Total carried to summary"   -> sum
       "A. Substructure"            -> group title
       "2. Concrete work"           -> summary line
       other text-only rows         -> plain row
       GRAND TOTAL / VAT rows       -> left out (the app works them out)
     Returns null when the sheet has no BoQ header. */
  function boqFromRows(rows) {
    var head = -1, idx = null, r, c;
    function cellText(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
    for (r = 0; r < Math.min(rows.length, 60) && head < 0; r++) {
      var cur = { no: -1, desc: -1, unit: -1, qty: -1, rate: -1, cur: -1, todate: -1 };
      (rows[r] || []).forEach(function (h, pos) {
        h = cellText(h);
        if (!h) return;
        var QTY = '(qty|qnty|qu[a-z]{0,3}nti?ty)';   // also the typos seen in real sheets: Quntity, Quantty
        if (/^(d[ei]s[a-z]{0,3}ript[a-z]*|descr|particulars|work description|item description)/i.test(h)) { if (cur.desc < 0) cur.desc = pos; }
        else if (/^(unit|uom|u\/m)\.?$/i.test(h)) { if (cur.unit < 0) cur.unit = pos; }
        else if (new RegExp('^(to\\s*date|cumulative|up\\s*to\\s*date)\\s+' + QTY + '\\.?$', 'i').test(h)) { if (cur.todate < 0) cur.todate = pos; }
        else if (new RegExp('^(current|this\\s+(month|period|bill)|executed|done)\\s+' + QTY + '\\.?$', 'i').test(h)) { if (cur.cur < 0) cur.cur = pos; }
        else if (new RegExp('^(total\\s+|contract\\s+|bill\\s+|original\\s+)?' + QTY + '\\.?$', 'i').test(h)) { if (cur.qty < 0) cur.qty = pos; }
        else if (/^(unit |contract )?(rate|price)/i.test(h)) { if (cur.rate < 0) cur.rate = pos; }
        else if (/^(bill\s+|item\s+)?(item( no\.?)?|no\.?|ref\.?|code|s\/n|sn|#)$/i.test(h)) { if (cur.no < 0) cur.no = pos; }
      });
      if (cur.desc >= 0 && cur.qty >= 0 && cur.rate >= 0) { head = r; idx = cur; }
    }
    if (head < 0) return null;
    if (idx.no < 0 && idx.desc > 0) idx.no = idx.desc - 1;
    var doneCol = idx.todate >= 0 ? idx.todate : idx.cur;
    function num(v) {
      if (typeof v === 'number') return isFinite(v) ? v : 0;
      var n = parseFloat(String(v == null ? '' : v).replace(/,/g, ''));
      return isFinite(n) ? n : 0;
    }
    var items = [], counts = { item: 0, row: 0, line: 0, group: 0, sum: 0 }, skipped = 0, withDone = 0;
    for (r = head + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var rawDesc = String(row[idx.desc] == null ? '' : row[idx.desc]);
      var two = /^\s*[A-Z]\s*[.)]\s+\S[^\n]*?(?:\n|\s{4,})\s*\d{1,2}\s*[.)]\s*\S/.exec(rawDesc);
      if (two && !(num(row[idx.qty]) > 0)) {   // "A. Substructure" and "1. Excavation" in one cell
        var parts = rawDesc.trim().split(/\n+|\s{4,}/);
        var g = sanitizeBoqItem({ kind: 'group', desc: cellText(parts[0]) }), ln = sanitizeBoqItem({ kind: 'line', desc: cellText(parts.slice(1).join(' ')) });
        if (g && ln) { counts.group++; counts.line++; items.push({ item: g, type: 'group' }, { item: ln, type: 'line' }); continue; }
      }
      var desc = cellText(row[idx.desc]), no = idx.no >= 0 ? cellText(row[idx.no]) : '';
      var unit = idx.unit >= 0 ? cellText(row[idx.unit]) : '';
      var qty = num(row[idx.qty]), rate = num(row[idx.rate]);
      if (!desc && !no) continue;
      if (!desc) { desc = no; no = ''; }
      var low = desc.toLowerCase();
      if (/_{3,}|^(name|signature|date)\s*:|^(contractor|site\s+supervisor|supervisor|approved\s+by|prepared\s+by|checked\s+by|client|consultant)\s*(\/.*)?$/.test(low) && !(qty > 0 && rate > 0)) continue;   // signature block under the table
      var it = null, kind;
      if (/carried\s+to\s+summary|^(sub\s*-?\s*)?total\s+(to\s+)?summary/.test(low)) {
        kind = 'sum'; it = { kind: 'sum', desc: desc.replace(/\.{2,}.*$/, '').replace(/[:.\s]+$/, '') };
      } else if (/^(grand\s+total|total\b|sub\s*-?\s*total|vat\b|\d+\s*%\s*vat|contingenc)/.test(low) && !(qty > 0 && rate > 0)) {
        skipped++; continue;
      } else if (qty > 0 && rate > 0) {
        kind = 'item'; it = { no: no, desc: desc, unit: unit, qty: qty, rate: rate, done: doneCol >= 0 ? Math.max(0, num(row[doneCol])) : 0 };
        if (it.done > 0) withDone++;
      } else if (!no && !unit && /^[A-Z]\s*[.)]\s+\S/.test(desc)) {
        kind = 'group'; it = { kind: 'group', desc: desc };
      } else if (/^\d{1,2}\s*\.?$/.test(no) && !unit && !(qty > 0) && !(rate > 0)) {
        kind = 'line'; it = { kind: 'line', desc: no.replace(/\.$/, '') + '. ' + desc };
      } else if (!no && !unit && /^\d{1,2}\s*[.)]\s*\S/.test(desc) && !/^\d{1,2}\s*[.)]\s*\d/.test(desc)) {
        kind = 'line'; it = { kind: 'line', desc: desc };
      } else {
        kind = 'row'; it = { no: no, desc: desc, unit: unit, qty: qty, rate: rate };
      }
      var clean = sanitizeBoqItem(it);
      if (!clean) { skipped++; continue; }
      counts[kind]++;
      items.push({ item: clean, type: kind });
    }
    return { items: items.slice(0, 3000), counts: counts, skipped: skipped, headerRow: head + 1, withDone: withDone, hasDoneCol: doneCol >= 0 };
  }

  /* Calculator: + - * / (also x, ×, ÷, −), brackets, decimals, unary minus, and "%" after a number. NaN when it does not make sense. */
  function calcEval(text) {
    var src = String(text == null ? '' : text).replace(/×|x|X/g, '*').replace(/÷/g, '/').replace(/−|–/g, '-').replace(/,/g, '').replace(/\s+/g, '');
    var i = 0;
    if (!src || src.length > 200 || /[^0-9+\-*\/().%]/.test(src)) return NaN;
    function num() {
      var m = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
      if (!m) return NaN;
      i += m[1].length;
      var v = parseFloat(m[1]);
      while (src.charAt(i) === '%') { v = v / 100; i++; }
      return v;
    }
    function factor() {
      var c = src.charAt(i);
      if (c === '-') { i++; return -factor(); }
      if (c === '+') { i++; return factor(); }
      if (c === '(') {
        i++;
        var v = expr();
        if (src.charAt(i) !== ')') return NaN;
        i++;
        while (src.charAt(i) === '%') { v = v / 100; i++; }
        return v;
      }
      return num();
    }
    function term() {
      var v = factor();
      while (i < src.length && (src.charAt(i) === '*' || src.charAt(i) === '/')) {
        var op = src.charAt(i++), r = factor();
        v = op === '*' ? v * r : v / r;
      }
      return v;
    }
    function expr() {
      var v = term();
      while (i < src.length && (src.charAt(i) === '+' || src.charAt(i) === '-')) {
        var op = src.charAt(i++), r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    var out = expr();
    if (i !== src.length || !isFinite(out)) return NaN;
    return Math.round(out * 1e8) / 1e8;
  }

  /* Profit so far and where the project is heading.
     now = work certified (gross, before VAT) - all costs; the forecast scales costs by the share of the BoQ done. */
  function profitOutlook(state, projectId) {
    var s = projectSummary(state, projectId), p = null;
    if (!s) return null;
    state.projects.forEach(function (x) { if (x.id === projectId) p = x; });
    var value = round2(s.contractSum + (s.variationTotal || 0));
    var out = {
      value: value, certified: s.certified, cost: s.costTotal,
      profitNow: round2(s.certified - s.costTotal),
      marginNow: s.certified > 0 ? round2((s.certified - s.costTotal) / s.certified * 100) : 0,
      physicalPct: s.physicalPct, spentPct: value > 0 ? round2(s.costTotal / value * 100) : 0,
      forecastCost: null, forecastProfit: null, forecastMargin: null, budgetProfit: null, warn: '', shares: []
    };
    if (s.boqTotal > 0 && s.physicalPct >= 10 && s.costTotal > 0) {
      out.forecastCost = round2(s.costTotal / (s.physicalPct / 100));
      out.forecastProfit = round2(value - out.forecastCost);
      out.forecastMargin = value > 0 ? round2(out.forecastProfit / value * 100) : 0;
    }
    if (s.budgetTotal > 0 && value > 0) out.budgetProfit = round2(value - s.budgetTotal);
    if (s.physicalPct > 0 && out.spentPct > s.physicalPct + 10) out.warn = 'spend';
    else if (out.forecastProfit !== null && out.forecastProfit < 0) out.warn = 'loss';
    CODES.forEach(function (c) {
      var v = s.costByCode[c] || 0;
      if (v > 0) out.shares.push({ code: c, amount: v, pct: s.costTotal > 0 ? round2(v / s.costTotal * 100) : 0, budget: p.budgets[c] || 0, over: (p.budgets[c] || 0) > 0 && v > p.budgets[c] });
    });
    out.shares.sort(function (a, b) { return b.amount - a.amount; });
    return out;
  }

  /* ---------- cost control per BoQ section ---------- */
  /* A section starts at a summary line (or, with none, a group heading) and runs to the next one.
     Its budget is the contract value of the items under it. */
  function costSections(project) {
    var kind = project.boq.some(function (i) { return i.kind === 'line'; }) ? 'line' : 'group';
    var out = [], cur = null;
    project.boq.forEach(function (i) {
      if (i.kind === kind) { cur = { id: i.id, label: ((i.no ? i.no + ' ' : '') + i.desc).trim(), budget: 0 }; out.push(cur); }
      else if (cur && !isHeading(i) && !isSumRow(i)) cur.budget = round2(cur.budget + i.qty * i.rate);
    });
    return out;
  }
  /* Cost booked against each section (bills, plus cash-out entries not already counted through a bill). */
  function costBySection(state, projectId) {
    var p = null;
    state.projects.forEach(function (x) { if (x.id === projectId) p = x; });
    if (!p) return null;
    var secs = costSections(p), map = {}, untagged = 0;
    secs.forEach(function (s) { s.cost = 0; map[s.id] = s; });
    function add(sec, amount) { if (map[sec]) map[sec].cost = round2(map[sec].cost + amount); else untagged = round2(untagged + amount); }
    p.bills.forEach(function (b) { add(b.sec, b.amount); });
    projectBooks(state, projectId).forEach(function (bk) {
      bk.entries.forEach(function (e) { if (e.type === 'out' && !e.billId) add(e.sec, e.amount); });
    });
    secs.forEach(function (s) { s.pct = s.budget > 0 ? round2(s.cost / s.budget * 100) : 0; s.over = s.budget > 0 && s.cost > s.budget; });
    return { sections: secs.filter(function (s) { return s.cost > 0 || s.budget > 0; }), untagged: untagged };
  }

  /* ---------- statements ---------- */
  /* All bills and payments of one supplier, oldest first, with a running balance (what you owe). */
  function supplierStatement(project, supplier) {
    var ev = [];
    project.bills.forEach(function (b) {
      if ((b.supplier || '') !== (supplier || '')) return;
      ev.push({ date: b.date, kind: 'bill', text: b.desc || '', amount: b.amount, order: b.id });
      b.payments.forEach(function (p) { ev.push({ date: p.date, kind: 'pay', text: b.desc || '', amount: p.amount, order: p.id }); });
    });
    ev.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.kind === 'bill' ? -1 : 1) - (b.kind === 'bill' ? -1 : 1) || a.order - b.order; });
    var bal = 0, billed = 0, paid = 0;
    ev.forEach(function (e) {
      if (e.kind === 'bill') { bal = round2(bal + e.amount); billed = round2(billed + e.amount); } else { bal = round2(bal - e.amount); paid = round2(paid + e.amount); }
      e.balance = bal;
    });
    return { rows: ev, billed: billed, paid: paid, balance: bal };
  }
  function supplierNames(project) {
    var seen = {}, out = [];
    project.bills.forEach(function (b) { var k = b.supplier || ''; if (!seen[k]) { seen[k] = 1; out.push(k); } });
    return out.sort();
  }
  /* A worker's days and wages between two dates (all dates when empty). */
  function workerStatement(project, workerId, from, to) {
    var rows = project.attendance.filter(function (a) {
      return a.workerId === workerId && (!from || a.date >= from) && (!to || a.date <= to);
    }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; }).map(function (a) {
      return { date: a.date, days: a.days, rate: a.rate, amount: round2(a.days * a.rate), paid: a.paid };
    });
    return { rows: rows, days: sum(rows, function (r) { return r.days; }), earned: round2(sum(rows, function (r) { return r.amount; })),
      paid: round2(sum(rows, function (r) { return r.paid ? r.amount : 0; })), unpaid: round2(sum(rows, function (r) { return r.paid ? 0 : r.amount; })) };
  }
  /* Diary entries between two dates, oldest first. */
  function diaryRange(project, from, to) {
    return (project.diary || []).filter(function (d) { return (!from || d.date >= from) && (!to || d.date <= to); })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; });
  }

  /* ---------- reminders: snooze / hide, and the phone notification plan ---------- */
  function reminderKey(r) { return r.kind + ':' + r.projectId + ':' + r.id; }
  /* map: key -> 'hide' (until restored) or a date (hidden until that day). */
  function reminderHidden(map, key, today) {
    var v = map && map[key];
    return v === 'hide' || (isDate(v) && v > today);
  }
  /* What to notify about over the next days: a summary at 08:00 each day that has urgent items,
     and up to 3 single notifications at 09:00 for items that fall due that day. */
  function notifyPlan(state, today, days, map) {
    var out = [];
    for (var i = 0; i < days; i++) {
      var d = addDaysStr(today, i);
      var list = reminders(state, d, 3).filter(function (r) { return !reminderHidden(map, reminderKey(r), d); });
      var urgent = list.filter(function (r) { return r.level === 'overdue' || r.level === 'soon'; });
      if (urgent.length) {
        out.push({ date: d, time: '08:00', kind: 'summary', n: urgent.length,
          overdue: urgent.filter(function (r) { return r.level === 'overdue'; }).length, items: urgent.slice(0, 3) });
      }
      list.filter(function (r) { return r.due === d; }).slice(0, 3).forEach(function (r) { out.push({ date: d, time: '09:00', kind: 'due', item: r }); });
    }
    return out;
  }

  /* ---------- search ---------- */
  function searchAll(state, query, limit) {
    var q = String(query || '').trim().toLowerCase(), max = limit || 8, out = { entries: [], bills: [], certs: [], contacts: [], boq: [], diary: [] };
    if (q.length < 2) return out;
    function has() { for (var i = 0; i < arguments.length; i++) if (String(arguments[i] == null ? '' : arguments[i]).toLowerCase().indexOf(q) >= 0) return true; return false; }
    state.books.forEach(function (b) {
      b.entries.forEach(function (e) {
        if (out.entries.length < max * 3 && has(e.note, e.category, e.party, e.amount, e.date)) out.entries.push({ bookId: b.id, book: b.name, entry: e });
      });
    });
    state.projects.forEach(function (p) {
      p.bills.forEach(function (b) { if (out.bills.length < max && has(b.supplier, b.desc, b.amount)) out.bills.push({ projectId: p.id, project: p.name, bill: b }); });
      p.certs.forEach(function (c) { if (out.certs.length < max && has(c.no, c.title, c.date, c.gross)) out.certs.push({ projectId: p.id, project: p.name, cert: c }); });
      p.boq.forEach(function (i) { if (out.boq.length < max && has(i.no, i.desc)) out.boq.push({ projectId: p.id, project: p.name, item: i }); });
      (p.diary || []).forEach(function (d) { if (out.diary.length < max && has(d.work, d.problems, d.visitors, d.date)) out.diary.push({ projectId: p.id, project: p.name, entry: d }); });
    });
    state.contacts.forEach(function (c) { if (out.contacts.length < max && has(c.name, c.phone, c.email, c.company, c.note)) out.contacts.push(c); });
    out.entries = out.entries.slice(0, max * 3);
    return out;
  }

  function addDaysStr(date, n) {
    var d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  /* Money expected in and owed out. Certificates: expected = approval date + payment days (submitted: + approval days too).
     Bills: the due date. Workers' unpaid wages are owed now. `horizon` = days ahead that count as "coming". */
  function cashForecast(state, today, horizon) {
    horizon = horizon || 30;
    var end = addDaysStr(today, horizon), inc = [], out = [];
    state.projects.forEach(function (p) {
      p.certs.forEach(function (c) {
        var cc = certCalc(p, c), st = certStatus(c, cc);
        if (cc.balance <= 0 || st === 'paid') return;
        var exp = '';
        if (st === 'approved' && c.approvedDate) exp = addDaysStr(c.approvedDate, p.payDays || CERT_PAY_DAYS);
        else if (st === 'submitted' && c.sentDate) exp = addDaysStr(c.sentDate, (p.approveDays || CERT_APPROVE_DAYS) + (p.payDays || CERT_PAY_DAYS));
        inc.push({ projectId: p.id, project: p.name, id: c.id, who: c.no, status: st, amount: cc.balance, date: exp, overdue: !!exp && exp < today, soon: !!exp && exp >= today && exp <= end });
      });
      p.bills.forEach(function (b) {
        var bal = billBalance(b);
        if (bal <= 0) return;
        out.push({ projectId: p.id, project: p.name, id: b.id, who: b.supplier, desc: b.desc, amount: bal, date: b.due || '', overdue: !!b.due && b.due < today, soon: !!b.due && b.due >= today && b.due <= end });
      });
      var wages = sum(p.attendance, function (a) { return a.paid ? 0 : a.days * a.rate; });
      if (wages > 0) out.push({ projectId: p.id, project: p.name, id: 0, who: '', desc: 'wages', wages: true, amount: round2(wages), date: today, overdue: false, soon: true });
    });
    function by(a, b) { return (a.date || '9999') < (b.date || '9999') ? -1 : (a.date || '9999') > (b.date || '9999') ? 1 : b.amount - a.amount; }
    inc.sort(by); out.sort(by);
    function tot(list, f) { return round2(sum(list.filter(f), function (x) { return x.amount; })); }
    var t = {
      inOverdue: tot(inc, function (x) { return x.overdue; }), inSoon: tot(inc, function (x) { return x.soon; }),
      inLater: tot(inc, function (x) { return !x.overdue && !x.soon && x.date; }), inUnknown: tot(inc, function (x) { return !x.date; }),
      outOverdue: tot(out, function (x) { return x.overdue; }), outSoon: tot(out, function (x) { return x.soon; }),
      outLater: tot(out, function (x) { return !x.overdue && !x.soon && x.date; }), outUnknown: tot(out, function (x) { return !x.date; })
    };
    t.inAll = round2(t.inOverdue + t.inSoon + t.inLater + t.inUnknown);
    t.outAll = round2(t.outOverdue + t.outSoon + t.outLater + t.outUnknown);
    t.net = round2(t.inOverdue + t.inSoon - t.outOverdue - t.outSoon);
    return { incoming: inc, outgoing: out, totals: t, horizon: horizon };
  }

  return {
    addDaysStr: addDaysStr, reminderKey: reminderKey, reminderHidden: reminderHidden, notifyPlan: notifyPlan, costSections: costSections, costBySection: costBySection, rowsToCsv: rowsToCsv, supplierStatement: supplierStatement, supplierNames: supplierNames, workerStatement: workerStatement, diaryRange: diaryRange, searchAll: searchAll, sanitizeDiary: sanitizeDiary, WEATHER: WEATHER,
    cashForecast: cashForecast, profitOutlook: profitOutlook,
    calcEval: calcEval,
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
    sanitizeBoqItem: sanitizeBoqItem, contractWithVat: contractWithVat, itemAmount: itemAmount, rateStr: rateStr, rawSum: rawSum, itemEarned: itemEarned, boqVariation: boqVariation, variationOrderNo: variationOrderNo, migrateBoq: migrateBoq, boqLineTotals: boqLineTotals, SUM_DEFAULT: SUM_DEFAULT, isLineRow: isLineRow, isItemRow: isItemRow, isGroupRow: isGroupRow, sanitizeVariation: sanitizeVariation, certVariation: certVariation, variationTotal: variationTotal, isHeading: isHeading, isSumRow: isSumRow, boqSubtotals: boqSubtotals,
    suggestAdvanceRecovery: suggestAdvanceRecovery, boqSummary: boqSummary, proposeCertGross: proposeCertGross, certCumulative: certCumulative,
    certLocked: certLocked, draftCert: draftCert, lockedSnap: lockedSnap, snapDiffers: snapDiffers, refreshDraft: refreshDraft,
    round6: round6, boqSnapshot: boqSnapshot, sortedCerts: sortedCerts, boqProgress: boqProgress, boqSections: boqSections, amountWords: amountWords,
    boqCsv: boqCsv, boqFromCsv: boqFromCsv, boqFromRows: boqFromRows, projectRecords: projectRecords, applyProjectRecords: applyProjectRecords, sanitizeProjSync: sanitizeProjSync, CERT_STATUSES: CERT_STATUSES, certStatus: certStatus, photoIds: photoIds,
    TRASH_DAYS: TRASH_DAYS, sanitizeTrash: sanitizeTrash, trashPhotoIds: trashPhotoIds, trashRestoreItem: trashRestoreItem
  };
});
