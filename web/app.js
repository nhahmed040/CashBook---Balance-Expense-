(function () {
  'use strict';

  var L = window.CBLogic;
  var STORAGE_KEY = 'cashbook.data.v2'; // same key as 1.1: data is upgraded in place
  var OLD_KEY = 'cashbook.entries.v1';
  var SECTIONS = ['overview', 'boq', 'budget', 'bills', 'client', 'labour', 'diary', 'books'];

  var $ = function (id) { return document.getElementById(id); };
  var CAL = window.CBCal;

  /* ---------- state ---------- */
  var state = loadState();
  var ui = {
    view: 'entries', bookOpen: false, bookQ: '', bookSort: 'updated',
    q: '', type: 'all', from: '', to: '', mode: '', by: '', category: '', contactId: 0, cq: '', ckind: 'all', rFrom: '', rTo: '', rScope: 'book',
    month: CAL.get(state.settings.calendar).monthKey(L.todayStr()),
    editingId: null,
    projectId: '', section: 'overview',
    labourDate: L.todayStr()
  };

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return L.sanitizeState(JSON.parse(raw), { keepPin: true });
      var old = localStorage.getItem(OLD_KEY);
      if (old) return L.migrateOld(JSON.parse(old));
    } catch (e) { /* fall through to a fresh state */ }
    return L.sanitizeState(null, { keepPin: true });
  }

  /* small "pop" animation when a number changes */
  function setVal(node, text) {
    if (node.textContent === text) return;
    var had = node.textContent !== '';
    node.textContent = text;
    if (had) { node.classList.remove('bump'); void node.offsetWidth; node.classList.add('bump'); }
  }
  function buzz() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* ignore */ } }
  var rev = 0;                       // bumps on every local change (sync checks it)
  function saveRaw() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }
  /* each book remembers the day it last changed: a cheap fingerprint of its name and entries is compared on every save */
  var bookFp = {};
  function fingerprint(b) {
    var s = JSON.stringify([b.name, b.entries]), h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return h + ':' + s.length;
  }
  function touchBooks() {
    state.books.forEach(function (b) {
      var f = fingerprint(b);
      if (bookFp[b.id] !== undefined && bookFp[b.id] !== f) b.updated = L.todayStr();
      bookFp[b.id] = f;
    });
  }
  function save() {
    rev++;
    touchBooks();
    saveRaw();
    if (window.__scheduleSync) window.__scheduleSync();
  }
  function canEdit(b) { return !b.sync || b.sync.role !== 'view'; }

  function book() {
    for (var i = 0; i < state.books.length; i++) if (state.books[i].id === state.current) return state.books[i];
    state.current = state.books[0].id;
    return state.books[0];
  }
  function bookById(id) {
    for (var i = 0; i < state.books.length; i++) if (state.books[i].id === id) return state.books[i];
    return null;
  }
  function projectById(id) {
    for (var i = 0; i < state.projects.length; i++) if (state.projects[i].id === id) return state.projects[i];
    return null;
  }
  function currentProject() { return projectById(ui.projectId); }
  function projectOfBook(b) { return b && b.projectId ? projectById(b.projectId) : null; }
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ---------- i18n / formatting ---------- */
  function t(key, vars) {
    var dict = window.CB_I18N[state.settings.lang] || {};
    var s = dict[key] != null ? dict[key] : (window.CB_I18N.en[key] != null ? window.CB_I18N.en[key] : key);
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function codeLabel(c) { return t('code_' + c); }

  function money(n) {
    var cur = state.settings.currency;
    if (cur !== 'none') {
      try { return new Intl.NumberFormat('en', { style: 'currency', currency: cur }).format(n); } catch (e) { /* fall back */ }
    }
    return n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function pct(n) { return (Math.round(n * 10) / 10) + '%'; }

  function applyStaticText() {
    document.documentElement.lang = state.settings.lang === 'om' ? 'om' : state.settings.lang === 'am' ? 'am' : 'en';
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-ph]'), function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-aria]'), function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    $('fab').setAttribute('aria-label', t('add_entry'));
  }

  /* ---------- theme ---------- */
  var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    var th = state.settings.theme;
    var dark = th === 'dark' || (th === 'system' && darkQuery && darkQuery.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', applyTheme);

  /* ---------- calendar ---------- */
  function cal() { return CAL.get(state.settings.calendar); }
  /* Dates are stored as Gregorian ISO strings; this only changes how they are shown.
     suffix = true adds "E.C." (printed documents). */
  function fmtDate(iso, suffix) {
    if (!iso) return '';
    return cal().formatDate(iso, state.settings.lang, suffix ? { suffix: true } : undefined);
  }

  var nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

  function dropDate(input) {
    if (input._ethW) {
      if (input._ethW.parentNode) input._ethW.parentNode.removeChild(input._ethW);
      input._ethW = null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'value')) delete input.value; // back to the native property
    input.classList.remove('vh');
  }

  /* In Ethiopian mode a date input is kept (hidden) as the data holder and three selects
     (day, month, year) are shown instead. Setting input.value from code keeps them in step. */
  function makeDate(input, optional) {
    dropDate(input);
    var C = cal();
    if (C.id !== 'ethiopian') return;
    var lang = state.settings.lang;
    var wrap = el('div', 'ethdate');
    var dSel = document.createElement('select'), mSel = document.createElement('select'), ySel = document.createElement('select');
    dSel.setAttribute('aria-label', t('day'));
    mSel.setAttribute('aria-label', t('month'));
    ySel.setAttribute('aria-label', t('year'));
    wrap.appendChild(dSel); wrap.appendChild(mSel); wrap.appendChild(ySel);
    input.parentNode.insertBefore(wrap, input.nextSibling);
    input._ethW = wrap;
    input.classList.add('vh');
    var thisYear = C.parts(L.todayStr()).y;

    function fillDays(y, m) {
      var keep = dSel.value;
      dSel.textContent = '';
      if (optional) dSel.appendChild(option('', '—'));
      var n = y && m ? C.daysInMonth(y, m) : (m === 13 ? 5 : 30);
      for (var d = 1; d <= n; d++) dSel.appendChild(option(String(d), String(d)));
      if (keep && +keep > n) keep = String(n); // e.g. Pagume 6 -> 5 in a non-leap year
      dSel.value = keep || (optional ? '' : '1');
    }

    function sync() {
      var p = C.parts(nativeValue.get.call(input));
      var yearFrom = Math.min(thisYear - 12, p ? p.y : thisYear), yearTo = Math.max(thisYear + 8, p ? p.y : thisYear);
      mSel.textContent = ''; ySel.textContent = '';
      if (optional) { mSel.appendChild(option('', '—')); ySel.appendChild(option('', '—')); }
      for (var m = 1; m <= 13; m++) mSel.appendChild(option(String(m), C.monthName(m, lang)));
      for (var y = yearFrom; y <= yearTo; y++) ySel.appendChild(option(String(y), String(y)));
      if (p) {
        mSel.value = String(p.m); ySel.value = String(p.y);
        dSel.textContent = '';
        fillDays(p.y, p.m);
        dSel.value = String(p.d);
      } else if (optional) {
        mSel.value = ''; ySel.value = '';
        dSel.textContent = '';
        fillDays(0, 0);
      } else {
        // a required date is never left empty: start from today
        nativeValue.set.call(input, L.todayStr());
        sync();
      }
    }

    function write() {
      var y = +ySel.value, m = +mSel.value, d = +dSel.value;
      nativeValue.set.call(input, y && m && d ? C.fromParts(y, m, d) : '');
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    mSel.addEventListener('change', function () { fillDays(+ySel.value, +mSel.value); write(); });
    ySel.addEventListener('change', function () { fillDays(+ySel.value, +mSel.value); write(); });
    dSel.addEventListener('change', write);

    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function () { return nativeValue.get.call(input); },
      set: function (v) { nativeValue.set.call(input, v); sync(); }
    });
    sync();
  }

  function enhanceStaticDates() {
    makeDate($('date'), false);
    makeDate($('fromDate'), true);
    makeDate($('toDate'), true);
    makeDate($('rFrom'), true);
    makeDate($('rTo'), true);
  }

  /* ---------- small helpers ---------- */
  var toastTimer = null;
  function toast(msg, action) {
    var e = $('toast');
    e.textContent = msg;
    e.classList.toggle('hasact', !!action);
    if (action) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'toastact';
      b.textContent = action.label;
      b.addEventListener('click', function () { e.classList.remove('show'); clearTimeout(toastTimer); action.run(); });
      e.appendChild(b);
    }
    e.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { e.classList.remove('show'); }, action ? 7000 : 2600);
  }

  function openModal(id) { $(id).classList.add('open'); }
  function closeModal(id) { $(id).classList.remove('open'); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(label, cls, onClick) {
    var b = el('button', cls || '', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function option(value, label) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    return o;
  }
  function kv(label, value, cls, total) {
    var r = el('div', 'kvrow' + (total || cls === 'total' ? ' total' : ''));
    r.appendChild(el('span', null, label));
    var b = el('b', cls === 'pos' || cls === 'neg' ? cls : '', value);
    r.appendChild(b);
    return r;
  }
  function addDays(s, n) {
    var d = new Date(s + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function safeName(s) { return String(s).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'book'; }

  /* ---------- photos ---------- */
  var photoCache = {};
  function photoData(id) {
    if (photoCache[id]) return Promise.resolve(photoCache[id]);
    return window.CBPhotos.get(id).then(function (d) { if (d) photoCache[id] = d; return d; });
  }
  function newPhotoState(ids) { return { ids: (ids || []).slice(), added: [], removed: [] }; }
  function deletePhotoIds(ids) {
    (ids || []).forEach(function (id) { window.CBPhotos.del(id); delete photoCache[id]; });
  }
  function commitPhotos(st) { deletePhotoIds(st.removed); st.removed = []; st.added = []; }
  function rollbackPhotos(st) { deletePhotoIds(st.added); st.added = []; st.removed = []; }
  function entryPhotoIds(entries) {
    var ids = [];
    entries.forEach(function (e) { ids = ids.concat(e.photos || []); });
    return ids;
  }
  function allPhotoIds() {
    var ids = [];
    state.books.forEach(function (b) { ids = ids.concat(entryPhotoIds(b.entries)); });
    state.projects.forEach(function (p) {
      ids = ids.concat(p.photos);
      p.bills.forEach(function (b) { ids = ids.concat(b.photos); });
    });
    ids = ids.concat(L.trashPhotoIds(state.trash));
    return ids.filter(function (id, i) { return ids.indexOf(id) === i; });
  }

  /* ---------- Recently deleted (30 days) ---------- */
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  /* Put a removed item in the trash. Its photos stay on the phone until it is deleted for good. */
  function trashPut(kind, label, payload, ctx, photos, noUndo) {
    var rec = { id: L.newId(), kind: kind, label: String(label || '').slice(0, 120), deletedAt: Date.now(), payload: clone(payload), ctx: ctx || {}, photos: (photos || []).slice() };
    state.trash = [rec].concat(state.trash || []).slice(0, 200);
    if (!noUndo) pendingUndo = rec;
    return rec;
  }
  var pendingUndo = null;
  /* shows the "Deleted · Undo" message after save(); call once the screen is redrawn */
  function undoToast() {
    var rec = pendingUndo;
    pendingUndo = null;
    if (!rec) return;
    toast(t('deleted_toast', { n: rec.label }), { label: t('undo'), run: function () { if (trashRestore(rec)) { save(); renderAll(); toast(t('restored_item')); } } });
  }
  function trashDrop(rec) {
    state.trash = state.trash.filter(function (r) { return r.id !== rec.id; });
    var keep = {};
    L.trashPhotoIds(state.trash).concat(allPhotoIdsNoTrash()).forEach(function (id) { keep[id] = 1; });
    deletePhotoIds((rec.photos || []).filter(function (id) { return !keep[id]; }));
  }
  function allPhotoIdsNoTrash() {
    var ids = [];
    state.books.forEach(function (b) { ids = ids.concat(entryPhotoIds(b.entries)); });
    state.projects.forEach(function (p) { ids = ids.concat(p.photos); p.bills.forEach(function (b) { ids = ids.concat(b.photos); }); });
    return ids;
  }
  /* returns true when the item is back; the caller saves and redraws */
  function trashRestore(rec) {
    var x = L.trashRestoreItem(rec), c = rec.ctx || {}, pr, i;
    if (!x) { toast(t('restore_fail')); return false; }
    function proj() { return state.projects.filter(function (q) { return q.id === c.projectId; })[0]; }
    function freshId(list) { while (list.some(function (q) { return q.id === x.id; })) x.id = L.newId(); }
    switch (rec.kind) {
      case 'entry':
        var bk = state.books.filter(function (b) { return b.id === c.bookId; })[0] || book();
        freshId(bk.entries); bk.entries.push(x); break;
      case 'boqrow':
        pr = proj(); if (!pr) { toast(t('trash_no_parent')); return false; }
        freshId(pr.boq); i = Math.min(Math.max(Number(c.index) || 0, 0), pr.boq.length); pr.boq.splice(i, 0, x); break;
      case 'bill':
        pr = proj(); if (!pr) { toast(t('trash_no_parent')); return false; }
        freshId(pr.bills); pr.bills.push(x); break;
      case 'cert':
        pr = proj(); if (!pr) { toast(t('trash_no_parent')); return false; }
        freshId(pr.certs); pr.certs.push(x); break;
      case 'contact':
        freshId(state.contacts); state.contacts.push(x); break;
      case 'project':
        while (state.projects.some(function (q) { return q.id === x.id; })) x.id = x.id + '_';
        delete x.sync;
        state.projects.push(x); break;
      case 'book':
        while (state.books.some(function (b) { return b.id === x.id; })) x.id = x.id + '_';
        delete x.sync; delete x.nolink;
        if (!state.projects.some(function (q) { return q.id === x.projectId; })) x.projectId = '';
        if (!state.businesses.some(function (q) { return q.id === x.businessId; })) x.businessId = '';
        state.books.push(x); break;
    }
    state.trash = state.trash.filter(function (r) { return r.id !== rec.id; });
    return true;
  }
  /* photos of trash items that expired while the app was closed */
  function purgeExpiredTrashPhotos() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!raw || !Array.isArray(raw.trash)) return;
      var gone = {};
      raw.trash.forEach(function (r) { if (r && Array.isArray(r.photos) && Date.now() - Number(r.deletedAt) > L.TRASH_DAYS * 86400000) r.photos.forEach(function (id) { gone[id] = 1; }); });
      var keep = {};
      allPhotoIds().forEach(function (id) { keep[id] = 1; });
      deletePhotoIds(Object.keys(gone).map(Number).filter(function (id) { return !keep[id]; }));
    } catch (e) { /* ignore */ }
  }

  function viewPhoto(id, onRemove) {
    var img = $('photoImg');
    img.removeAttribute('src');
    $('photoMeta').textContent = '';
    $('photoRemove').hidden = !onRemove;
    $('photoRemove').onclick = function () { closeModal('photoView'); if (onRemove) onRemove(); };
    photoData(id).then(function (d) {
      if (d) img.src = d; else $('photoMeta').textContent = t('photo_missing');
    });
    openModal('photoView');
  }
  $('photoClose').addEventListener('click', function () { closeModal('photoView'); });
  $('photoView').addEventListener('click', function (ev) { if (ev.target === this) closeModal('photoView'); });

  function thumbButton(id, onClick) {
    var b = el('button', 'thumb', '🖼️');
    b.type = 'button';
    b.setAttribute('aria-label', t('photos'));
    photoData(id).then(function (d) {
      if (!d) return;
      var img = document.createElement('img');
      img.alt = '';
      img.src = d;
      b.textContent = '';
      b.appendChild(img);
    });
    b.addEventListener('click', onClick);
    return b;
  }

  /* Read-only strip of thumbnails; tapping one opens the viewer. */
  function thumbsOnly(container, ids) {
    if (!ids || !ids.length) return;
    var strip = el('div', 'photostrip');
    ids.forEach(function (id) { strip.appendChild(thumbButton(id, function () { viewPhoto(id, null); })); });
    container.appendChild(strip);
  }

  /* Editable strip. st = { ids, added, removed }. With a `live` callback, changes apply at once
     (and the callback receives the new id list); otherwise the owner commits or rolls back. */
  function photoWidget(container, st, live, withLabel) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.hidden = true;
    var camInput = document.createElement('input');
    camInput.type = 'file';
    camInput.accept = 'image/*';
    camInput.setAttribute('capture', 'environment');
    camInput.hidden = true;

    function removePhoto(id) {
      if (!window.confirm(t('confirm_remove_photo'))) return;
      st.ids = st.ids.filter(function (x) { return x !== id; });
      var wasAdded = st.added.indexOf(id) >= 0;
      if (wasAdded) {
        st.added = st.added.filter(function (x) { return x !== id; });
        deletePhotoIds([id]);
      } else if (live) {
        deletePhotoIds([id]);
      } else {
        st.removed.push(id);
      }
      if (live) live(st.ids);
      render();
    }

    function render() {
      container.textContent = '';
      if (withLabel) container.appendChild(el('span', 'photolabel', t('photos')));
      var strip = el('div', 'photostrip');
      st.ids.forEach(function (id) {
        strip.appendChild(thumbButton(id, function () { viewPhoto(id, function () { removePhoto(id); }); }));
      });
      if (st.ids.length < 12) strip.appendChild(btn('📷 ' + t('add_photo'), 'addphoto', function () {
        actionSheet(t('add_photo'), [
          { label: '📷 ' + t('take_photo'), run: function () { camInput.click(); } },
          { label: '🖼 ' + t('choose_photo'), run: function () { input.click(); } }
        ]);
      }));
      container.appendChild(strip);
      container.appendChild(input);
      container.appendChild(camInput);
    }

    function addFrom(inp) {
      var files = Array.prototype.slice.call(inp.files || [], 0, 12 - st.ids.length);
      inp.value = '';
      var failed = false;
      files.reduce(function (chain, file) {
        return chain.then(function () {
          return window.CBPhotos.fileToDataUrl(file).then(function (url) {
            var id = L.newId();
            return window.CBPhotos.put(id, url).then(function () {
              photoCache[id] = url;
              st.ids.push(id);
              st.added.push(id);
            });
          }).catch(function () { failed = true; });
        });
      }, Promise.resolve()).then(function () {
        if (failed) toast(t('photo_fail'));
        if (live) live(st.ids);
        render();
      });
    }
    input.addEventListener('change', function () { addFrom(input); });
    camInput.addEventListener('change', function () { addFrom(camInput); });

    render();
  }

  /* ---------- printing ---------- */
  function printDoc(title, html) {
    if (window.AndroidBridge && typeof window.AndroidBridge.printHtml === 'function') {
      window.AndroidBridge.printHtml(title, html);
      return;
    }
    var f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    f.onload = function () {
      try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast(t('print_failed')); }
      setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 60000);
    };
    f.srcdoc = html;
    document.body.appendChild(f);
  }

  function printCertificate(p, cert) {
    var title = (t('cert_title') + ' ' + (cert.no || '')).trim();
    printDoc(title, window.CBPrint.certificateHtml({
      t: t, money: money, lang: state.settings.lang, project: p, cert: cert,
      calc: L.certCalc(p, cert), varRows: L.boqVariation(p, cert.id).rows, varNo: L.variationOrderNo(p, cert.id), seq: L.certCumulative(p, cert.id), boq: p.boq.length ? p.boq : null, date: L.todayStr(),
      fmt: function (d) { return fmtDate(d, true); },
      itemAmount: L.itemAmount, rateStr: L.rateStr, itemEarned: L.itemEarned, isHeading: L.isHeading, isSumRow: L.isSumRow
    }));
  }

  function printStatement(p) {
    var certs = p.certs.slice().sort(function (a, c) { return a.date < c.date ? -1 : a.date > c.date ? 1 : a.id - c.id; });
    printDoc(t('statement_title') + ' – ' + p.name, window.CBPrint.statementHtml({
      t: t, money: money, lang: state.settings.lang, project: p, summary: L.projectSummary(state, p.id),
      codes: L.CODES, codeLabel: codeLabel, suppliers: L.supplierBalances(p), date: L.todayStr(),
      fmt: function (d) { return fmtDate(d, true); },
      certCalcs: certs.map(function (c) { return { cert: c, calc: L.certCalc(p, c) }; })
    }));
  }

  /* ---------- generic form dialog ---------- */
  var formStates = [];
  function rollbackForm() { formStates.forEach(rollbackPhotos); formStates = []; }

  /* opts: { title, fields:[{key,label,type,value,options,required,min,max,step,ph,text}], submitLabel,
             onSubmit(values) -> error string | null, onDelete() } */
  function openForm(opts) {
    rollbackForm();
    $('formTitle').textContent = opts.title;
    $('formErr').textContent = '';
    $('formSubmit').textContent = opts.submitLabel || t('save');
    var body = $('formBody');
    body.textContent = '';
    var inputs = {}, toggles = [];
    (opts.fields || []).forEach(function (f) {
      if (f.type === 'note') { var np = el('p', 'note', f.text); body.appendChild(np); if (f.showFor) toggles.push({ node: np, f: f }); return; }
      if (f.type === 'photos') {
        var holder = el('div');
        photoWidget(holder, f.state, null, true);
        body.appendChild(holder);
        formStates.push(f.state);
        return;
      }
      var label = el('label', 'field');
      label.appendChild(el('span', null, f.label));
      var input;
      if (f.type === 'select') {
        input = document.createElement('select');
        f.options.forEach(function (o) { input.appendChild(option(o.value, o.label)); });
        input.value = f.value != null ? String(f.value) : (f.options.length ? f.options[0].value : '');
      } else {
        input = document.createElement('input');
        input.type = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text';
        if (f.type === 'number') {
          input.step = f.step || 'any';
          input.inputMode = 'decimal';
          if (f.min != null) input.min = f.min;
          if (f.max != null) input.max = f.max;
        } else if (f.type !== 'date') {
          input.maxLength = f.max || 60;
        }
        if (f.ph) input.placeholder = f.ph;
        input.value = f.value != null ? f.value : '';
      }
      inputs[f.key] = { input: input, field: f, label: label };
      if (f.showFor) toggles.push({ node: label, f: f });
      if (f.type === 'number' && !f.noCalc) {
        var arow = el('div', 'amtrow');
        arow.appendChild(input);
        arow.appendChild(btn('🧮', 'calcbtn', function () { openCalculator(input.value, function (v) { input.value = v; input.dispatchEvent(new Event('input')); }); }));
        label.appendChild(arow);
      } else {
        label.appendChild(input);
      }
      if (f.type === 'date') makeDate(input, !f.required);
      body.appendChild(label);
    });
    function applyShow() {
      toggles.forEach(function (x) {
        var src = inputs[x.f.showFor.key];
        x.node.hidden = !src || x.f.showFor.values.indexOf(src.input.value) < 0;
      });
    }
    Object.keys(inputs).forEach(function (k) { if (inputs[k].field.type === 'select') inputs[k].input.addEventListener('change', applyShow); });
    applyShow();
    $('formDelete').hidden = !opts.onDelete;
    $('formForm').onsubmit = function (ev) {
      ev.preventDefault();
      var values = {};
      var missing = false;
      Object.keys(inputs).forEach(function (k) {
        var f = inputs[k].field, v = inputs[k].input.value;
        if (f.type === 'number') {
          var n = parseFloat(v);
          if (!isFinite(n)) n = NaN;
          if (f.required && !(n > 0) && !inputs[k].label.hidden) missing = true;
          values[k] = isFinite(n) ? n : 0;
        } else {
          v = v.trim();
          if (f.required && !v && !inputs[k].label.hidden) missing = true;
          values[k] = v;
        }
      });
      if (missing) { $('formErr').textContent = t('required'); return; }
      var err = opts.onSubmit(values);
      if (err) { $('formErr').textContent = err; return; }
      formStates.forEach(commitPhotos);
      formStates = [];
      closeModal('formModal');
    };
    $('formDelete').onclick = function () {
      if (opts.onDelete && opts.onDelete() !== false) { rollbackForm(); closeModal('formModal'); }
    };
    openModal('formModal');
    var first = body.querySelector('input,select');
    if (first && opts.focus !== false) setTimeout(function () { first.focus(); }, 60);
  }
  $('formCancel').addEventListener('click', function () { rollbackForm(); closeModal('formModal'); });
  $('formModal').addEventListener('click', function (ev) { if (ev.target === this) { rollbackForm(); closeModal('formModal'); } });

  /* ---------- linking helpers (bill payments / certificate receipts <-> cash entries) ---------- */
  function unlinkEntryEverywhere(entryId) {
    state.projects.forEach(function (p) {
      p.bills.forEach(function (b) { b.payments = b.payments.filter(function (x) { return x.entryId !== entryId; }); });
      p.certs.forEach(function (c) { c.receipts = c.receipts.filter(function (x) { return x.entryId !== entryId; }); });
    });
  }

  function removeEntryFromBook(bookId, entryId) {
    var b = bookById(bookId);
    if (!b) return;
    b.entries.forEach(function (e) { if (e.id === entryId) deletePhotoIds(e.photos); });
    b.entries = b.entries.filter(function (e) { return e.id !== entryId; });
  }

  function dropPaymentsOfBook(bookId) {
    state.projects.forEach(function (p) {
      p.bills.forEach(function (b) { b.payments = b.payments.filter(function (x) { return x.bookId !== bookId; }); });
      p.certs.forEach(function (c) { c.receipts = c.receipts.filter(function (x) { return x.bookId !== bookId; }); });
    });
  }

  function clearEntryLinks(kind, id) { // kind: 'billId' | 'certId'
    state.books.forEach(function (b) {
      b.entries.forEach(function (e) { if (e[kind] === id) e[kind] = 0; });
    });
  }

  function linkedBookOptions(project, withNone) {
    var opts = [];
    if (withNone) opts.push({ value: '', label: t('dont_record') });
    L.projectBooks(state, project.id).forEach(function (b) { opts.push({ value: b.id, label: b.name }); });
    return opts;
  }

  /* ---------- rendering: books / entries ---------- */
  function visibleBooks() {
    if (!state.business) return state.books;
    var list = state.books.filter(function (b) { return b.businessId === state.business; });
    return list.length ? list : state.books;
  }

  function renderBooks() {
    var sel = $('bookSelect');
    sel.textContent = '';
    var bs = $('bizSelect');
    bs.textContent = '';
    bs.hidden = !state.businesses.length;
    if (state.businesses.length) {
      bs.appendChild(option('', t('all_businesses')));
      state.businesses.forEach(function (x) { bs.appendChild(option(x.id, x.name)); });
      if (!byId(state.businesses, state.business)) state.business = '';
      bs.value = state.business;
    }
    var shown = visibleBooks();
    if (!shown.some(function (b) { return b.id === state.current; })) state.current = shown[0].id;
    shown.forEach(function (b) { sel.appendChild(option(b.id, (window.__bookIcon ? window.__bookIcon(b) : '') + b.name)); });
    sel.value = book().id;
  }

  function fillSelect(sel, first, items, current) {
    sel.textContent = '';
    sel.appendChild(option('', first));
    items.forEach(function (i) { sel.appendChild(option(i[0], i[1])); });
    sel.value = current != null && current !== 0 && sel.querySelector('option[value="' + String(current).replace(/"/g, '') + '"]') ? String(current) : '';
  }

  function fillFilters(b) {
    var ids = {}, cats = {}, bys = {};
    b.entries.forEach(function (e) {
      if (e.contactId) ids[e.contactId] = true;
      if (e.category) cats[e.category] = true;
      if (e.by) bys[e.by] = true;
    });
    var cs = state.contacts.filter(function (c) { return ids[c.id]; }).map(function (c) { return [String(c.id), c.name]; });
    fillSelect($('contactFilter'), t('all_contacts'), cs, ui.contactId);
    ui.contactId = Number($('contactFilter').value) || 0;
    fillSelect($('modeFilter'), t('all_modes'), L.MODES.map(function (m) { return [m, t('mode_' + m)]; }), ui.mode);
    ui.mode = $('modeFilter').value;
    fillSelect($('byFilter'), t('all_members'), Object.keys(bys).sort().map(function (x) { return [x, x]; }), ui.by);
    ui.by = $('byFilter').value;
    fillSelect($('catFilter'), t('all_categories'), Object.keys(cats).sort().map(function (x) { return [x, x]; }), ui.category);
    ui.category = $('catFilter').value;
  }

  function renderEntries() {
    var b = book();
    $('fab').classList.toggle('vo', !canEdit(b));
    var tot = L.totals(b.entries);
    setVal($('balance'), money(tot.balance));
    setVal($('totalIn'), money(tot.cashIn));
    setVal($('totalOut'), money(tot.cashOut));

    fillFilters(b);
    var filters = {
      q: ui.q, type: ui.type, from: ui.from, to: ui.to, mode: ui.mode, by: ui.by, category: ui.category, contactId: ui.contactId,
      contactText: function (e) { var c = e.contactId ? byId(state.contacts, e.contactId) : null; return c ? (c.name + ' ' + c.phone + ' ' + c.email).toLowerCase() : ''; }
    };
    var shown = L.filterEntries(b.entries, filters).sort(function (a, c) {
      return a.date < c.date ? 1 : a.date > c.date ? -1 : c.id - a.id;
    });

    var active = !!(ui.q || ui.type !== 'all' || ui.from || ui.to || ui.mode || ui.by || ui.category || ui.contactId);
    if (ui.mode || ui.by || ui.category || ui.contactId) $('moreFilters').open = true;
    var ft = $('filterTotals');
    if (active) {
      var s = L.totals(shown);
      ft.textContent = t('filtered') + ': +' + money(s.cashIn) + '  −' + money(s.cashOut) + '  = ' + money(s.balance);
      ft.hidden = false;
    } else {
      ft.hidden = true;
    }

    var list = $('list');
    list.textContent = '';
    var dayNet = {}, lastDay = null, today = L.todayStr();
    shown.forEach(function (e) { dayNet[e.date] = (dayNet[e.date] || 0) + (e.type === 'in' ? e.amount : -e.amount); });
    shown.forEach(function (e) {
      if (e.date !== lastDay) {
        lastDay = e.date;
        var dh = el('li', 'dayhead');
        var dl = el('span', null, fmtDate(e.date));
        if (e.date === today) dl.appendChild(el('span', 'chip', t('today')));
        dh.appendChild(dl);
        var dn = dayNet[e.date];
        dh.appendChild(el('span', 'dnet', (dn < 0 ? '\u2212' : '+') + money(Math.abs(dn))));
        list.appendChild(dh);
      }
      var li = el('li', 'item');
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.appendChild(el('span', 'ico ' + e.type, e.type === 'in' ? '\u2193' : '\u2191'));
      var meta = el('div', 'meta');
      meta.appendChild(el('div', 'title', e.category || (e.type === 'in' ? t('cash_in') : t('cash_out'))));
      var bits = [fmtDate(e.date)];
      if (e.code) bits.push(codeLabel(e.code));
      if (e.party) bits.push(e.party);
      if (e.mode) bits.push(t('mode_' + e.mode));
      if (e.by) bits.push('👤 ' + e.by);
      if (e.note) bits.push(e.note);
      if (e.photos && e.photos.length) bits.push('📷' + e.photos.length);
      meta.appendChild(el('div', 'detail', bits.join(' · ')));
      li.appendChild(meta);
      li.appendChild(el('span', 'amt ' + e.type, (e.type === 'in' ? '+' : '−') + money(e.amount)));
      var open = function () { openEntry(e.id); };
      li.addEventListener('click', open);
      li.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
      list.appendChild(li);
    });

    var emptyEl = $('empty');
    emptyEl.hidden = shown.length > 0;
    emptyEl.textContent = b.entries.length ? t('no_match') : t('no_entries');

    var cl = $('catList');
    cl.textContent = '';
    var seen = {};
    b.entries.forEach(function (e) {
      if (e.category && !seen[e.category]) { seen[e.category] = true; cl.appendChild(option(e.category, '')); }
    });
  }

  function renderBars(container, rows, cls) {
    container.textContent = '';
    if (!rows.length) { container.appendChild(el('p', 'muted small', t('no_data'))); return; }
    var max = rows[0].total || 1;
    rows.forEach(function (r) {
      var row = el('div', 'bar-row');
      var top = el('div', 'bar-top');
      top.appendChild(el('span', null, r.name || t('uncategorized')));
      top.appendChild(el('span', null, money(r.total)));
      var bar = el('div', 'bar ' + cls);
      var fill = document.createElement('i');
      fill.style.width = Math.max(2, Math.round((r.total / max) * 100)) + '%';
      bar.appendChild(fill);
      row.appendChild(top);
      row.appendChild(bar);
      container.appendChild(row);
    });
  }

  function renderReports() {
    var entries = book().entries;
    $('monthLabel').textContent = cal().monthLabel(ui.month, state.settings.lang);
    var m = L.monthTotals(entries, ui.month, cal());
    setVal($('mIn'), money(m.cashIn));
    setVal($('mOut'), money(m.cashOut));
    setVal($('mNet'), money(m.balance));
    initExportPanel();
    renderBars($('catOut'), L.categoryTotals(entries, ui.month, 'out', cal()), 'out');
    renderBars($('catIn'), L.categoryTotals(entries, ui.month, 'in', cal()), 'in');

    var months = L.lastMonths(entries, ui.month, 6, cal());
    var max = 0;
    months.forEach(function (x) { max = Math.max(max, x.cashIn, x.cashOut); });
    var chart = $('chart');
    chart.textContent = '';
    months.forEach(function (x) {
      var col = el('div', 'col');
      var pair = el('div', 'pair');
      [['in', x.cashIn], ['out', x.cashOut]].forEach(function (p) {
        var bar = el('i', p[0]);
        bar.style.height = max ? Math.round((p[1] / max) * 100) + '%' : '0%';
        bar.title = (p[0] === 'in' ? t('cash_in') : t('cash_out')) + ': ' + money(p[1]);
        pair.appendChild(bar);
      });
      col.appendChild(pair);
      col.appendChild(el('small', null, cal().shortLabel(x.month)));
      chart.appendChild(col);
    });
  }

  function renderSettings() {
    $('langSel').value = state.settings.lang;
    $('themeSel').value = state.settings.theme;
    $('calSel').value = state.settings.calendar;
    var cs = $('curSel');
    cs.textContent = '';
    L.CURRENCIES.forEach(function (c) { cs.appendChild(option(c, c === 'none' ? '—' : c)); });
    cs.value = state.settings.currency;

    var hasPin = !!state.settings.pinHash;
    $('pinStatus').textContent = hasPin ? t('pin_on') : t('pin_off');
    $('setPinBtn').textContent = hasPin ? t('change_pin') : t('set_pin');
    $('removePinBtn').hidden = !hasPin;
  }

  /* ---------- rendering: projects ---------- */
  function renderProjects() {
    var list = $('projList'), detail = $('projDetail');
    if (ui.projectId && !currentProject()) ui.projectId = '';
    list.hidden = !!ui.projectId;
    detail.hidden = !ui.projectId;
    document.body.classList.toggle('proj-detail', !!ui.projectId);
    if (ui.projectId) { renderProjectDetail(detail); return; }

    list.textContent = '';
    if (!state.projects.length) { list.appendChild(el('p', 'empty', t('no_projects'))); return; }
    list.appendChild(btn('💰 ' + t('forecast'), 'block', openForecast));
    state.projects.forEach(function (p) {
      var s = L.projectSummary(state, p.id);
      var card = el('div', 'pcard');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.appendChild(el('h3', null, (window.__projIcon ? window.__projIcon(p) : '') + p.name));
      if (p.client || p.location) card.appendChild(el('div', 'muted small', [p.client, p.location].filter(Boolean).join(' · ')));
      card.appendChild(kv(t('contract_sum'), money(s.contractSum)));
      card.appendChild(kv(t('due_from_client'), money(s.clientOutstanding)));
      if (s.budgetTotal > 0) {
        card.appendChild(kv(t('actual_cost') + ' / ' + t('budget'), money(s.costTotal) + ' / ' + money(s.budgetTotal), s.costTotal > s.budgetTotal ? 'neg' : ''));
        card.appendChild(budgetBar(s.costTotal, s.budgetTotal));
      } else {
        card.appendChild(kv(t('actual_cost'), money(s.costTotal)));
      }
      if (s.owed > 0) card.appendChild(kv(t('owed'), money(s.owed), 'neg'));
      if (s.certified > 0 || s.costTotal > 0) { var pfc = L.profitOutlook(state, p.id); card.appendChild(kv(t('pf_profit_now'), money(pfc.profitNow), pfc.profitNow < 0 ? 'neg' : 'pos')); }
      var open = function () { ui.projectId = p.id; ui.section = 'overview'; renderProjects(); window.scrollTo(0, 0); };
      card.addEventListener('click', open);
      card.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
      list.appendChild(card);
    });
  }

  /* Monthly progress: enter this period's quantities for every BoQ item on one screen */
  function openProgress(p) {
    var ov = el('div', 'overlay open sheetov'), m = el('div', 'modal importmodal progmodal');
    var items = p.boq.filter(L.isItemRow);
    var title = '', rows = [], vals = {}, onlyWork = false, filter = '';
    var head = null;
    /* Previous = quantities at the last certificate; Current = this payment; Up to date = previous + current */
    var prevMap = L.lockedSnap(p);
    function prevOf(it) { return Math.min(prevMap[it.id] || 0, it.done); }
    p.boq.forEach(function (it) {
      if (L.isGroupRow(it) || L.isLineRow(it)) head = it.desc;
      else if (L.isItemRow(it)) rows.push({ it: it, head: head });
    });
    /* differences under 0.01 are rounding leftovers, not work: leave the box empty */
    rows.forEach(function (r) { var c = L.round6(r.it.done - prevOf(r.it)); if (c >= 0.0099) vals[r.it.id] = c; });
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    var summaryBox = el('div', 'panel'), listBox = el('div', 'importlist progList');
    function todayVal(it) { var v = vals[it.id]; return v == null || v === '' || isNaN(v) ? 0 : Number(v); }
    function totals() {
      var period = 0, toDate = 0, total = 0;
      rows.forEach(function (r) { period += todayVal(r.it) * r.it.rate; toDate += (prevOf(r.it) + todayVal(r.it)) * r.it.rate; total += r.it.qty * r.it.rate; });
      var certified = L.round2(p.certs.reduce(function (a, c) { return a + c.gross; }, 0));
      return { period: L.round2(period), toDate: L.round2(toDate), total: L.round2(total), certified: certified };
    }
    function drawSummary() {
      var T = totals();
      summaryBox.textContent = '';
      summaryBox.appendChild(kv(t('pg_total'), money(T.total)));
      summaryBox.appendChild(kv(t('pg_certified'), money(T.certified)));
      summaryBox.appendChild(kv(t('pg_period'), money(T.period), T.period > 0 ? 'pos' : ''));
      summaryBox.appendChild(kv(t('pg_todate'), money(T.toDate) + (T.total > 0 ? ' (' + L.round2(T.toDate / T.total * 100) + '%)' : '')));
      summaryBox.appendChild(kv(t('pg_uncertified'), money(L.round2(T.toDate - T.certified)), T.toDate - T.certified < -0.005 ? 'neg' : ''));
      summaryBox.appendChild(kv(t('pg_left'), money(L.round2(T.total - T.toDate))));
    }
    function drawRows() {
      listBox.textContent = '';
      var last = null, shown = 0, q = filter.trim().toLowerCase();
      rows.forEach(function (r) {
        var it = r.it;
        if (q && (it.no + ' ' + it.desc).toLowerCase().indexOf(q) < 0) return;
        if (onlyWork && !todayVal(it)) return;
        if (r.head !== last) { last = r.head; if (r.head) listBox.appendChild(el('div', 'progHead', r.head)); }
        var row = el('div', 'improw progRow');
        var tx = el('span', 'stext');
        tx.appendChild(el('b', null, (it.no ? it.no + ' ' : '') + it.desc));
        var info = el('small', 'muted', '');
        tx.appendChild(info);
        row.appendChild(tx);
        var box = el('span', 'progIn');
        var inp = document.createElement('input');
        inp.type = 'number'; inp.step = 'any'; inp.min = '0'; inp.inputMode = 'decimal'; inp.placeholder = '0';
        inp.value = vals[it.id] != null && vals[it.id] !== '' ? vals[it.id] : '';
        var warn = el('small', 'neg', '');
        function upd() {
          var v = todayVal(it), pv = prevOf(it), cum = L.round2(pv + v), pct = it.qty > 0 ? Math.round(cum / it.qty * 100) : 0;
          info.textContent = it.unit + ' · BoQ ' + it.qty + ' · ' + t('pg_previous') + ' ' + pv + ' · ' + t('pg_upto') + ' ' + cum + ' (' + pct + '%)';
          warn.textContent = cum > it.qty + 1e-9 ? t('pg_exceeds', { n: L.round2(cum - it.qty) }) : '';
        }
        inp.addEventListener('input', function () { vals[it.id] = inp.value === '' ? '' : parseFloat(inp.value); upd(); drawSummary(); });
        inp.title = t('pg_current');
        var rest = L.round2(Math.max(0, it.qty - prevOf(it)));
        var fin = btn('100%', 'progfin', function () { vals[it.id] = rest; inp.value = rest || ''; upd(); drawSummary(); });
        box.appendChild(inp); box.appendChild(fin);
        row.appendChild(box);
        tx.appendChild(warn);
        upd();
        listBox.appendChild(row);
        shown++;
      });
      if (!shown) listBox.appendChild(el('p', 'muted small', t('no_data')));
    }
    function apply() {
      var n = 0;
      rows.forEach(function (r) {
        var tv = todayVal(r.it), nd = L.round6(prevOf(r.it) + tv);
        if (tv === 0 && Math.abs(r.it.done - prevOf(r.it)) < 0.0099) return;
        if (Math.abs(nd - r.it.done) > 1e-9) { r.it.done = nd; n++; }
      });
      return n;
    }
    m.appendChild(el('h2', null, t('progress_btn')));
    m.appendChild(el('p', 'muted small', t('pg_note')));
    m.appendChild(el('p', 'progcols', t('pg_cols')));
    var search = document.createElement('input');
    search.type = 'search'; search.placeholder = t('search_boq');
    search.addEventListener('input', function () { filter = search.value; drawRows(); });
    m.appendChild(search);
    var lab = el('label', 'check'), cb = document.createElement('input');
    cb.type = 'checkbox'; cb.addEventListener('change', function () { onlyWork = cb.checked; drawRows(); });
    lab.appendChild(cb); lab.appendChild(el('span', null, ' ' + t('pg_only_work')));
    m.appendChild(lab);
    m.appendChild(summaryBox); m.appendChild(listBox);
    var foot = el('div', 'progfoot');
    foot.appendChild(btn(t('pg_save'), '', function () {
      var n = apply();
      if (!n) { toast(t('pg_none')); return; }
      save(); renderAll(); close();
      var dr = L.draftCert(p);
      if (dr) toast(t('pg_saved', { n: n }), { label: t('cert_refresh'), run: function () { refreshDraftCert(p, dr, true); } });
      else toast(t('pg_saved', { n: n }));
    }));
    foot.appendChild(btn(t('pg_save_cert'), 'primary', function () {
      var n = apply();
      if (n) { save(); }
      var dr2 = L.draftCert(p);
      if (dr2) { close(); refreshDraftCert(p, dr2, true); return; }
      var proposed = L.proposeCertGross(p);
      close();
      if (proposed <= 0) { renderAll(); toast(t('nothing_to_certify')); return; }
      ui.section = 'client'; renderProjects();
      editCert(p, null, { gross: proposed });
    }));
    foot.appendChild(btn(t('cancel'), '', close));
    m.appendChild(foot);
    ov.appendChild(m);
    document.body.appendChild(ov);
    drawSummary(); drawRows();
  }

  /* Cash forecast: what should come in and what must go out */
  function openForecast() {
    var f = L.cashForecast(state, L.todayStr(), 30), T = f.totals;
    var ov = el('div', 'overlay open sheetov'), m = el('div', 'modal importmodal');
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    m.appendChild(el('h2', null, t('forecast')));
    var net = panel(null);
    net.appendChild(kv(t('fc_in_30'), money(L.round2(T.inOverdue + T.inSoon)), 'pos'));
    net.appendChild(kv(t('fc_out_30'), money(L.round2(T.outOverdue + T.outSoon)), 'neg'));
    net.appendChild(kv(t('fc_net'), money(T.net), T.net < 0 ? 'neg' : 'pos'));
    m.appendChild(net);
    function section(title, list, isIn) {
      var P = panel(title);
      if (!list.length) P.appendChild(el('p', 'muted small', t('no_data')));
      list.forEach(function (x) {
        var row = el('div', 'improw');
        var tx = el('span', 'stext');
        var name = isIn ? (x.project + ' · ' + x.who) : (x.wages ? x.project + ' · ' + t('fc_wages') : x.project + ' · ' + (x.who || t('uncategorized')) + (x.desc ? ' – ' + x.desc : ''));
        tx.appendChild(el('b', null, name));
        var sub = x.date ? (x.overdue ? t('fc_overdue') + ' ' : '') + fmtDate(x.date) : (isIn ? t('fc_no_date_in') : t('fc_no_date_out'));
        if (isIn) sub += ' · ' + t('cs_' + x.status);
        tx.appendChild(el('small', x.overdue ? 'neg' : 'muted', sub));
        row.appendChild(tx);
        row.appendChild(el('span', isIn ? 'pos' : 'neg', money(x.amount)));
        P.appendChild(row);
      });
      P.appendChild(kv(t('fc_total'), money(isIn ? T.inAll : T.outAll)));
      m.appendChild(P);
    }
    section(t('fc_money_in'), f.incoming, true);
    section(t('fc_money_out'), f.outgoing, false);
    m.appendChild(el('p', 'muted small', t('fc_note')));
    m.appendChild(btn(t('close'), 'block', close));
    ov.appendChild(m);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
  }

  function budgetBar(actual, budget) {
    var bar = el('div', 'bar ' + (actual > budget ? 'out' : 'in'));
    var fill = document.createElement('i');
    fill.style.width = Math.min(100, Math.max(2, Math.round(actual / (budget || 1) * 100))) + '%';
    bar.appendChild(fill);
    return bar;
  }

  /* ---------- statements ---------- */
  function statementModal(o) {
    var ov = el('div', 'overlay open sheetov'), m = el('div', 'modal importmodal');
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    m.appendChild(el('h2', null, o.title));
    m.appendChild(el('p', 'muted small', o.sub));
    var pn = panel(null);
    o.rows.forEach(function (r) {
      var row = el('div', 'improw'), tx = el('span', 'stext');
      tx.appendChild(el('b', null, r.a)); tx.appendChild(el('small', 'muted', r.b));
      row.appendChild(tx); row.appendChild(el('span', r.cls || '', r.c));
      pn.appendChild(row);
    });
    if (!o.rows.length) pn.appendChild(el('p', 'muted small', t('no_data')));
    o.totals.forEach(function (x) { pn.appendChild(kv(x[0], x[1], x[2])); });
    m.appendChild(pn);
    var br = el('div', 'btnrow');
    br.appendChild(btn(t('stmt_print'), 'primary', function () {
      printDoc(o.title, window.CBPrint.tableHtml({ title: o.title, lang: state.settings.lang, sub: o.sub, meta: o.meta, blocks: o.blocks, note: '' }));
    }));
    br.appendChild(btn(t('stmt_csv'), '', function () { saveFile(o.file + '-' + L.todayStr() + '.csv', 'text/csv', L.rowsToCsv(o.csv)); }));
    m.appendChild(br);
    m.appendChild(btn(t('close'), 'block', close));
    ov.appendChild(m);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
  }

  function pickSupplierStatement(p) {
    var names = L.supplierNames(p);
    if (!names.length) { toast(t('no_bills')); return; }
    function show(name) {
      var s = L.supplierStatement(p, name), label = name || t('uncategorized');
      var head = [{ h: t('date') }, { h: t('description') }, { h: t('stmt_billed'), n: 1 }, { h: t('paid'), n: 1 }, { h: t('balance_due'), n: 1 }];
      var rows = s.rows.map(function (r) { return [fmtDate(r.date), r.text, r.kind === 'bill' ? money(r.amount) : '', r.kind === 'pay' ? money(r.amount) : '', money(r.balance)]; });
      statementModal({
        title: t('supplier_stmt') + ': ' + label, sub: p.name + ' · ' + fmtDate(L.todayStr()),
        rows: s.rows.map(function (r) { return { a: (r.kind === 'pay' ? t('paid') + ' · ' : '') + (r.text || label), b: fmtDate(r.date) + ' · ' + t('balance_due') + ' ' + money(r.balance), c: money(r.amount), cls: r.kind === 'pay' ? 'pos' : 'neg' }; }),
        totals: [[t('stmt_billed'), money(s.billed)], [t('paid'), money(s.paid)], [t('balance_due'), money(s.balance), s.balance > 0 ? 'neg' : 'pos']],
        meta: [[t('project'), p.name], [t('supplier'), label]],
        blocks: [{ head: head, rows: rows, totals: [[t('stmt_billed'), money(s.billed)], [t('paid'), money(s.paid)], [t('balance_due'), money(s.balance), 'total']] }],
        csv: [head.map(function (h) { return h.h; })].concat(rows), file: 'statement-' + safeName(label)
      });
    }
    if (names.length === 1) return show(names[0]);
    actionSheet(t('supplier_stmt'), names.map(function (n) { return { label: n || t('uncategorized'), run: function () { show(n); } }; }));
  }

  function pickWorkerStatement(p, wk) {
    function show(w, from, to) {
      var s = L.workerStatement(p, w.id, from, to);
      var head = [{ h: t('date') }, { h: t('days'), n: 1 }, { h: t('rate'), n: 1 }, { h: t('amount'), n: 1 }, { h: t('paid') }];
      var rows = s.rows.map(function (r) { return [fmtDate(r.date), String(r.days), money(r.rate), money(r.amount), r.paid ? '✓' : '']; });
      statementModal({
        title: t('worker_stmt') + ': ' + w.name, sub: p.name + (from ? ' · ' + fmtDate(from) + ' – ' + fmtDate(to) : ''),
        rows: s.rows.map(function (r) { return { a: fmtDate(r.date) + ' · ' + r.days + ' ' + t('days'), b: money(r.rate) + (r.paid ? ' · ✓ ' + t('paid') : ''), c: money(r.amount), cls: r.paid ? 'pos' : 'neg' }; }),
        totals: [[t('days'), String(s.days)], [t('stmt_earned'), money(s.earned)], [t('paid'), money(s.paid)], [t('stmt_unpaid'), money(s.unpaid), s.unpaid > 0 ? 'neg' : 'pos']],
        meta: [[t('project'), p.name], [t('worker'), w.name + (w.role ? ' (' + w.role + ')' : '')]],
        blocks: [{ head: head, rows: rows, totals: [[t('days'), String(s.days)], [t('stmt_earned'), money(s.earned)], [t('paid'), money(s.paid)], [t('stmt_unpaid'), money(s.unpaid), 'total']] }],
        csv: [head.map(function (h) { return h.h; })].concat(rows), file: 'worker-' + safeName(w.name)
      });
    }
    function pickRange(w) {
      actionSheet(w.name, [
        { label: t('stmt_this_week'), run: function () { show(w, wk.from, wk.to); } },
        { label: t('stmt_this_month'), run: function () { var d = L.todayStr(); show(w, d.slice(0, 8) + '01', d.slice(0, 8) + '31'); } },
        { label: t('stmt_all'), run: function () { show(w, '', ''); } }
      ]);
    }
    if (p.workers.length === 1) return pickRange(p.workers[0]);
    actionSheet(t('worker_stmt'), p.workers.map(function (w) { return { label: w.name, run: function () { pickRange(w); } }; }));
  }

  /* ---------- site diary ---------- */
  var WEATHER_ICON = { sunny: '☀️', cloudy: '☁️', rain: '🌧️', windy: '💨', hot: '🥵' };
  function secDiary(body, p) {
    var pn = panel(t('diary'));
    pn.appendChild(btn(t('diary_add'), 'primary block', function () { editDiary(p, null); }));
    if ((p.diary || []).length) pn.appendChild(btn(t('diary_report'), 'block', function () { diaryReportPicker(p); }));
    body.appendChild(pn);
    var list = (p.diary || []).slice().sort(function (a, c) { return a.date < c.date ? 1 : a.date > c.date ? -1 : c.id - a.id; });
    if (!list.length) body.appendChild(el('p', 'empty', t('diary_empty')));
    list.forEach(function (d) {
      var card = panel(null);
      card.appendChild(el('h3', null, (WEATHER_ICON[d.weather] || '') + ' ' + fmtDate(d.date) + (d.workers ? ' · ' + d.workers + ' ' + t('diary_workers_short') : '')));
      if (d.work) card.appendChild(el('p', null, d.work));
      if (d.problems) card.appendChild(el('p', 'neg small', '⚠ ' + d.problems));
      if (d.visitors) card.appendChild(el('p', 'muted small', t('diary_visitors') + ': ' + d.visitors));
      thumbsOnly(card, d.photos);
      card.appendChild(btn(t('edit'), '', function () { editDiary(p, d); }));
      body.appendChild(card);
    });
  }

  function editDiary(p, d) {
    var isNew = !d, v0 = d || { date: L.todayStr(), weather: '', workers: '', work: '', problems: '', visitors: '' };
    var pst = newPhotoState(d ? d.photos : []);
    openForm({
      title: isNew ? t('diary_add') : t('edit'),
      fields: [
        { key: 'date', label: t('date'), type: 'date', value: v0.date, required: true },
        { key: 'weather', label: t('diary_weather'), type: 'select', value: v0.weather, options: [{ value: '', label: '—' }].concat(L.WEATHER.map(function (w) { return { value: w, label: WEATHER_ICON[w] + ' ' + t('wx_' + w) }; })) },
        { key: 'workers', label: t('diary_workers'), type: 'number', min: 0, noCalc: true, value: v0.workers },
        { key: 'work', label: t('diary_work'), type: 'text', value: v0.work, max: 1000 },
        { key: 'problems', label: t('diary_problems'), type: 'text', value: v0.problems, max: 600 },
        { key: 'visitors', label: t('diary_visitors'), type: 'text', value: v0.visitors, max: 200 },
        { key: 'photos', type: 'photos', state: pst }
      ],
      onSubmit: function (v) {
        var nd = L.sanitizeDiary({ id: d ? d.id : undefined, date: L.isDate(v.date) ? v.date : L.todayStr(), weather: v.weather, workers: v.workers, work: v.work, problems: v.problems, visitors: v.visitors, photos: pst.ids });
        if (!nd) return t('required');
        if (!p.diary) p.diary = [];
        if (isNew) p.diary.push(nd); else p.diary[p.diary.indexOf(d)] = nd;
        save(); renderAll();
        return null;
      },
      onDelete: isNew ? null : function () {
        if (!window.confirm(t('diary_confirm_delete'))) return false;
        p.diary = p.diary.filter(function (x) { return x.id !== d.id; });
        save(); renderAll();
        return true;
      }
    });
  }

  function diaryReportPicker(p) {
    var d = L.todayStr();
    function go(from, to, label) {
      var list = L.diaryRange(p, from, to);
      if (!list.length) { toast(t('no_data')); return; }
      var head = [{ h: t('date') }, { h: t('diary_weather') }, { h: t('diary_workers_short'), n: 1 }, { h: t('diary_work') }, { h: t('diary_problems') }];
      var rows = list.map(function (x) { return [fmtDate(x.date), x.weather ? t('wx_' + x.weather) : '', String(x.workers || ''), x.work, x.problems]; });
      var title = t('diary_report') + ': ' + p.name;
      printDoc(title, window.CBPrint.tableHtml({ title: title, lang: state.settings.lang, sub: label + ' · ' + fmtDate(from) + ' – ' + fmtDate(to), meta: [[t('project'), p.name], [t('client'), p.client]], blocks: [{ head: head, rows: rows }], note: '' }));
    }
    var wk = L.weekRange(d);
    actionSheet(t('diary_report'), [
      { label: t('stmt_this_week'), run: function () { go(wk.from, wk.to, t('stmt_this_week')); } },
      { label: t('stmt_this_month'), run: function () { go(d.slice(0, 8) + '01', d.slice(0, 8) + '31', t('stmt_this_month')); } },
      { label: t('stmt_all'), run: function () { var all = L.diaryRange(p, '', ''); go(all[0].date, all[all.length - 1].date, t('stmt_all')); } }
    ]);
  }

  /* ---------- search ---------- */
  function openSearch() {
    var ov = el('div', 'overlay open sheetov'), m = el('div', 'modal importmodal');
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    m.appendChild(el('h2', null, t('search')));
    var inp = document.createElement('input');
    inp.type = 'search'; inp.className = 'srchinp'; inp.placeholder = t('search_ph'); inp.maxLength = 60;
    m.appendChild(inp);
    var out = el('div'); m.appendChild(out);
    m.appendChild(btn(t('close'), 'block', close));
    function goProject(id, sec) { close(); ui.projectId = id; ui.section = sec; showView('projects'); renderProjects(); window.scrollTo(0, 0); }
    function line(a, b, c, run) {
      var row = el('div', 'improw'), tx = el('span', 'stext');
      tx.appendChild(el('b', null, a)); tx.appendChild(el('small', 'muted', b));
      row.appendChild(tx); if (c) row.appendChild(el('span', null, c));
      row.addEventListener('click', run); out.appendChild(row);
    }
    function group(title, n) { if (n) out.appendChild(el('div', 'srchgrp', title + ' (' + n + ')')); }
    function render() {
      out.textContent = '';
      var r = L.searchAll(state, inp.value, 8);
      var total = r.entries.length + r.bills.length + r.certs.length + r.contacts.length + r.boq.length + r.diary.length;
      if (inp.value.trim().length >= 2 && !total) out.appendChild(el('p', 'muted small', t('search_none')));
      group(t('entries'), r.entries.length);
      r.entries.forEach(function (x) {
        var e = x.entry;
        line((e.category || e.note || e.party || (e.type === 'in' ? t('cash_in') : t('cash_out'))), x.book + ' · ' + fmtDate(e.date) + (e.note && e.category ? ' · ' + e.note : ''), (e.type === 'out' ? '−' : '+') + money(e.amount),
          function () { close(); state.current = x.bookId; ui.bookOpen = true; save(); showView('entries'); renderAll(); openEntry(e.id); });
      });
      group(t('bills'), r.bills.length);
      r.bills.forEach(function (x) { line((x.bill.supplier || '') + (x.bill.desc ? ' – ' + x.bill.desc : ''), x.project + ' · ' + fmtDate(x.bill.date), money(x.bill.amount), function () { goProject(x.projectId, 'bills'); }); });
      group(t('client'), r.certs.length);
      r.certs.forEach(function (x) { line((x.cert.no || '') + ' ' + (x.cert.title || ''), x.project + ' · ' + fmtDate(x.cert.date), '', function () { goProject(x.projectId, 'client'); }); });
      group(t('boq'), r.boq.length);
      r.boq.forEach(function (x) { line((x.item.no || '') + ' ' + x.item.desc, x.project, '', function () { goProject(x.projectId, 'boq'); }); });
      group(t('diary'), r.diary.length);
      r.diary.forEach(function (x) { line(fmtDate(x.entry.date) + ' · ' + (x.entry.work || x.entry.problems || ''), x.project, '', function () { goProject(x.projectId, 'diary'); }); });
      group(t('contacts'), r.contacts.length);
      r.contacts.forEach(function (c) { line(c.name, [c.phone, c.email].filter(Boolean).join(' · '), '', function () { close(); showView('contacts'); renderAll(); }); });
    }
    inp.addEventListener('input', render);
    ov.appendChild(m);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
    inp.focus();
  }
  $('searchBtn').addEventListener('click', openSearch);

  /* ---------- quick add: tap a recent category ---------- */
  function renderCatChips() {
    var box = $('catChips'), type = $('entryForm').elements.type.value, cnt = {};
    box.textContent = '';
    state.books.forEach(function (b) { b.entries.forEach(function (e) { if (e.type === type && e.category) cnt[e.category] = (cnt[e.category] || 0) + 1; }); });
    Object.keys(cnt).sort(function (a, c) { return cnt[c] - cnt[a] || (a < c ? -1 : 1); }).slice(0, 6).forEach(function (c) {
      box.appendChild(btn(c, '', function () { $('category').value = c; }));
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('#entryForm input[name=type]'), function (r) { r.addEventListener('change', renderCatChips); });

  function renderProjectDetail(root) {
    var p = currentProject();
    root.textContent = '';
    root.appendChild(btn(t('back'), 'backlink', function () { ui.projectId = ''; renderProjects(); }));
    root.appendChild(el('h2', null, (window.__projIcon ? window.__projIcon(p) : '') + p.name));
    var seg = el('div', 'seg');
    SECTIONS.forEach(function (sec) {
      var label = sec === 'books' ? t('books_sec') : t(sec);
      var b = btn(label, ui.section === sec ? 'active' : '', function () { ui.section = sec; renderProjects(); });
      seg.appendChild(b);
    });
    root.appendChild(seg);
    var body = el('div', 'stack');
    root.appendChild(body);
    ({ overview: secOverview, boq: secBoq, budget: secBudget, bills: secBills, client: secClient, labour: secLabour, diary: secDiary, books: secBooks })[ui.section](body, p);
  }

  /* projects shared "view only": block every edit action, keep reading, printing and exporting */
  document.addEventListener('click', function (ev) {
    var p = currentProject();
    if (!p || !p.sync || p.sync.role !== 'view' || !$('projDetail').contains(ev.target)) return;
    var tg = ev.target.closest && ev.target.closest('button, .boqrow, .pay, input, select, textarea, label, [role=button]');
    if (!tg) return;
    var safe = ['print_statement', 'export_report', 'export_boq', 'export_boq_xlsx', 'print', 'export_cert_xlsx', 'stmt_print', 'stmt_csv', 'diary_report', 'supplier_stmt', 'worker_stmt'].map(function (k) { return t(k); });
    if (tg.closest('.seg') || tg.classList.contains('backlink') || tg.closest('[data-ro]') || safe.indexOf((tg.textContent || '').trim()) >= 0) return;
    ev.stopPropagation(); ev.preventDefault();
    toast(t('proj_view_only'));
  }, true);

  function panel(title) {
    var p = el('div', 'panel');
    if (title) p.appendChild(el('h2', null, title));
    return p;
  }

  /* --- overview --- */
  function secOverview(body, p) {
    var s = L.projectSummary(state, p.id);
    if (s.budgetTotal > 0 && s.costTotal > s.budgetTotal) {
      body.appendChild(el('div', 'warn', t('over_budget', { n: money(L.round2(s.costTotal - s.budgetTotal)) })));
    }
    var c = panel(t('client_section'));
    if (p.client) c.appendChild(kv(t('client_name'), p.client));
    if (p.location) c.appendChild(kv(t('location'), p.location));
    if (p.startDate || p.endDate) c.appendChild(kv(t('start_date') + ' – ' + t('end_date'), (p.startDate ? fmtDate(p.startDate) : '…') + ' → ' + (p.endDate ? fmtDate(p.endDate) : '…')));
    c.appendChild(kv(t('contract_sum'), money(s.contractSum)));
    if (p.vat > 0 && s.contractSum > 0) {
      c.appendChild(kv('+ ' + t('vat_amt') + ' (' + pct(p.vat) + ')', money(L.round2(L.contractWithVat(p) - s.contractSum))));
      c.appendChild(kv(t('contract_incl_vat'), money(L.contractWithVat(p)), 'total'));
      c.appendChild(kv(t('advance_paid') + ' (' + pct(p.advancePct) + ')', money(p.advance)));
    }
    c.appendChild(kv(t('certified'), money(s.certified) + ' (' + pct(s.pctComplete) + ' ' + t('pct_complete') + ')'));
    if (s.boqTotal > 0) c.appendChild(kv(t('physical_pct'), pct(s.physicalPct)));
    c.appendChild(kv(t('received'), money(s.received)));
    c.appendChild(kv(t('due_from_client'), money(s.clientOutstanding), s.clientOutstanding > 0 ? 'pos' : ''));
    c.appendChild(kv(t('retention_held'), money(s.retentionHeld)));
    c.appendChild(kv(t('advance_balance'), money(s.advanceBalance)));
    body.appendChild(c);

    var k = panel(t('cost_section'));
    if (s.budgetTotal > 0) {
      k.appendChild(kv(t('budget_total'), money(s.budgetTotal)));
      k.appendChild(kv(t('actual_cost'), money(s.costTotal)));
      k.appendChild(kv(t('remaining'), money(s.budgetRemaining), s.budgetRemaining < 0 ? 'neg' : 'pos'));
      k.appendChild(budgetBar(s.costTotal, s.budgetTotal));
    } else {
      k.appendChild(kv(t('actual_cost'), money(s.costTotal)));
    }
    k.appendChild(kv(t('owed'), money(s.owed), s.owed > 0 ? 'neg' : ''));
    k.appendChild(kv(t('margin'), money(s.margin), s.margin < 0 ? 'neg' : 'pos'));
    k.appendChild(el('p', 'note', t('cost_note')));
    body.appendChild(k);

    var pf = L.profitOutlook(state, p.id), pp = panel(t('profit_title'));
    pp.appendChild(kv(t('pf_certified'), money(pf.certified)));
    pp.appendChild(kv(t('pf_cost'), money(pf.cost)));
    pp.appendChild(kv(t('pf_profit_now'), money(pf.profitNow) + (pf.certified > 0 ? ' (' + pf.marginNow + '%)' : ''), pf.profitNow < 0 ? 'neg' : 'pos'));
    pp.appendChild(kv(t('pf_progress'), pf.physicalPct + '% ' + t('pf_work') + ' · ' + pf.spentPct + '% ' + t('pf_spent')));
    if (pf.forecastProfit !== null) {
      pp.appendChild(kv(t('pf_forecast_cost'), money(pf.forecastCost)));
      pp.appendChild(kv(t('pf_forecast_profit'), money(pf.forecastProfit) + ' (' + pf.forecastMargin + '%)', pf.forecastProfit < 0 ? 'neg' : 'pos'));
    }
    if (pf.budgetProfit !== null) pp.appendChild(kv(t('pf_budget_profit'), money(pf.budgetProfit), pf.budgetProfit < 0 ? 'neg' : 'pos'));
    if (pf.warn) pp.appendChild(el('div', 'warn', t('pf_warn_' + pf.warn)));
    if (pf.shares.length) {
      pp.appendChild(el('h3', null, t('pf_where')));
      pf.shares.forEach(function (x) {
        pp.appendChild(kv(codeLabel(x.code) + ' (' + x.pct + '%)', money(x.amount) + (x.over ? ' ⚠' : ''), x.over ? 'neg' : ''));
      });
    }
    var cs = L.costBySection(state, p.id);
    if (cs && cs.sections.length) {
      pp.appendChild(el('h3', null, t('pf_sections')));
      cs.sections.forEach(function (s) {
        pp.appendChild(kv(s.label.slice(0, 40) + (s.budget > 0 ? ' (' + s.pct + '%)' : ''), money(s.cost) + (s.budget > 0 ? ' / ' + money(s.budget) : '') + (s.over ? ' ⚠' : ''), s.over ? 'neg' : ''));
      });
      if (cs.untagged > 0) pp.appendChild(kv(t('pf_untagged'), money(cs.untagged)));
    }
    pp.appendChild(el('p', 'note', t('pf_note')));
    body.appendChild(pp);

    var ph = panel(t('site_photos'));
    var holder = el('div');
    photoWidget(holder, newPhotoState(p.photos), function (ids) { p.photos = L.photoIds(ids); save(); }, false);
    ph.appendChild(holder);
    body.appendChild(ph);

    var row = el('div', 'btnrow');
    row.appendChild(btn(t('print_statement'), '', function () { printStatement(p); }));
    row.appendChild(btn(t('edit_project'), '', function () { editProject(p); }));
    row.appendChild(btn(t('export_report'), '', function () {
      saveFile('cashbook-project-' + safeName(p.name) + '-' + L.todayStr() + '.csv', 'text/csv', L.projectReportCsv(state, p.id));
    }));
    body.appendChild(row);
    if (window.__projectSharePanel) body.appendChild(window.__projectSharePanel(p));
    body.appendChild(btn(t('delete'), 'danger block', function () {
      function proceed() {
        state.books.forEach(function (b) { if (b.projectId === p.id) b.projectId = ''; });
        var pph = p.photos.slice();
        p.bills.forEach(function (b) { pph = pph.concat(b.photos); });
        var rec = trashPut('project', p.name, p, {}, pph);
        delete rec.payload.sync;
        state.projects = state.projects.filter(function (x) { return x.id !== p.id; });
        ui.projectId = '';
        save(); renderAll(); undoToast();
      }
      if (p.sync && window.__projectRelease) { window.__projectRelease(p).then(function (ok) { if (ok) proceed(); }); return; }
      if (!window.confirm(t('confirm_delete_project'))) return;
      proceed();
    }));
  }

  /* --- bill of quantities --- */
  var boqTarget = null;

  function secBoq(body, p) {
    var s = L.boqSummary(p);
    var sm = L.projectSummary(state, p.id);
    var differs = s.total > 0 && Math.abs(s.total - p.contractSum) >= 0.01;

    var pn = panel(t('boq_title'));
    pn.appendChild(kv(t('boq_total'), money(s.total)));
    pn.appendChild(kv(t('work_value'), money(s.earned)));
    pn.appendChild(kv(t('physical_pct'), pct(s.pct)));
    pn.appendChild(budgetBar(s.earned, s.total || 1));
    pn.appendChild(kv(t('certified'), money(sm.certified)));
    if (differs && p.contractSum > 0) pn.appendChild(kv(t('boq_vs_contract'), money(L.round2(s.total - p.contractSum)), 'neg'));
    body.appendChild(pn);

    if (p.boq.some(function (i) { return L.isItemRow(i); })) body.appendChild(btn('📏 ' + t('progress_btn'), 'block', function () { openProgress(p); }));
    body.appendChild(btn(t('cert_from_progress'), 'primary block', function () {
      var proposed = L.proposeCertGross(p);
      if (s.total <= 0 || proposed <= 0) { toast(t('nothing_to_certify')); return; }
      ui.section = 'client';
      renderProjects();
      editCert(p, null, { gross: proposed });
    }));
    var row = el('div', 'btnrow');
    row.appendChild(btn(t('add_item'), '', function () { editRow(p, null, null, 'item'); }));
    row.appendChild(btn(t('add_row_type'), '', function () { editRow(p, null, null, 'line'); }));
    if (p.boq.length && !p.boq.some(L.isSumRow)) row.appendChild(btn(t('make_lines'), '', function () {
      if (!window.confirm(t('make_lines_ask'))) return;
      p.boq = L.migrateBoq(p.boq); save(); renderAll();
    }));
    row.appendChild(btn(t('import_boq'), '', function () { boqTarget = p; $('boqFile').click(); }));
    if (p.boq.length) row.appendChild(btn(t('export_boq'), '', function () {
      saveFile('cashbook-boq-' + safeName(p.name) + '-' + L.todayStr() + '.csv', 'text/csv', L.boqCsv(p));
    }));
    if (p.boq.length) row.appendChild(btn(t('export_boq_xlsx'), '', function () {
      saveWorkbook('Summary-BOQ-' + safeName(p.name), window.CBExcel.boqWorkbook(p));
    }));
    if (differs) row.appendChild(btn(t('set_contract_from_boq'), '', function () { p.contractSum = s.total; save(); renderAll(); }));
    body.appendChild(row);
    body.appendChild(el('p', 'note', t('boq_csv_note')));

    if (!p.boq.length) { body.appendChild(el('p', 'empty', t('no_items'))); return; }
    var list = panel(null);
    var subs = L.boqSubtotals(p), lineTotals = L.boqLineTotals(p);
    p.boq.forEach(function (it, pos) {
      var label = (it.no ? it.no + '  ' : '') + it.desc;
      function menuBtn() {
        var mb = btn('⋯', 'boqmenu', function (e) { if (e) e.stopPropagation(); boqRowMenu(p, it, pos); });
        mb.setAttribute('aria-label', t('row_menu'));
        return mb;
      }
      function typed(cls, tag, title, detail, amount) {
        var rw = el('div', 'boqrow typed ' + cls);
        var tp = el('div', 'boqtop');
        var mt = el('div', 'meta');
        mt.appendChild(el('span', 'boqtag', tag));
        mt.appendChild(el('div', 'title', title));
        if (detail) mt.appendChild(el('div', 'detail', detail));
        tp.appendChild(mt);
        if (amount != null) tp.appendChild(el('div', 'boqamt', amount));
        tp.addEventListener('click', function () { editRow(p, it); });
        rw.appendChild(tp);
        rw.appendChild(menuBtn());
        list.appendChild(rw);
      }
      if (L.isGroupRow(it)) { typed('grouprow', t('rt_group'), it.desc); return; }
      if (L.isLineRow(it)) {
        var lt = lineTotals[it.id];
        typed('linerow', t('rt_line'), it.desc, lt ? (lt.earned > 0 ? t('work_value') + ': ' + money(lt.earned) : '') : t('line_no_total'), lt ? money(lt.amt) : money(0));
        return;
      }
      if (L.isSumRow(it)) { typed('sumrow', t('rt_sum_tag'), it.desc, subs[it.id].earned > 0 ? t('work_value') + ': ' + money(subs[it.id].earned) : '', money(subs[it.id].amt)); return; }
      if (L.isHeading(it)) { typed('noterow', t('rt_note'), label); return; }
      var r = el('div', 'boqrow');
      var top = el('div', 'boqtop');
      var meta = el('div', 'meta');
      meta.appendChild(el('div', 'title', label));
      meta.appendChild(el('div', 'detail', it.qty + ' ' + it.unit + ' × ' + L.rateStr(it.rate) + ' = ' + money(L.itemAmount(it))));
      top.appendChild(meta);
      top.addEventListener('click', function () { editRow(p, it); });
      top.appendChild(menuBtn());
      r.appendChild(top);

      var dn = el('div', 'boqdone');
      var inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.step = 'any'; inp.inputMode = 'decimal'; inp.placeholder = '0';
      inp.value = it.done || '';
      inp.setAttribute('aria-label', it.desc + ' – ' + t('done_to_date'));
      inp.addEventListener('change', function () {
        var v = parseFloat(inp.value);
        it.done = isFinite(v) && v > 0 ? Math.round(v * 1e6) / 1e6 : 0;
        var floor = L.lockedSnap(p)[it.id] || 0;
        if (it.done < floor) { it.done = floor; toast(t('qty_locked', { n: floor })); }
        save(); renderProjects();
      });
      dn.appendChild(inp);
      var ratio = it.qty > 0 ? it.done / it.qty : 0;
      dn.appendChild(budgetBar(Math.min(it.done, it.qty), it.qty || 1));
      dn.appendChild(el('small', null, pct(ratio * 100)));
      r.appendChild(dn);
      if (it.done > it.qty) r.appendChild(el('div', 'overqty', t('over_qty')));
      if (it.done > 0) r.appendChild(el('div', 'detail', t('work_value') + ': ' + money(L.itemEarned(it))));
      list.appendChild(r);
    });
    body.appendChild(list);
  }

  /* Row menu: insert anywhere, move, edit, delete (like a spreadsheet). */
  function boqRowMenu(p, it, pos) {
    var title = (L.isSumRow(it) || L.isGroupRow(it) || L.isLineRow(it)) ? it.desc : ((it.no ? it.no + ' ' : '') + it.desc);
    var items = [
      { label: t('edit_item'), run: function () { editRow(p, it); } },
      { label: t('insert_above'), run: function () { editRow(p, null, pos, 'item'); } },
      { label: t('insert_below'), run: function () { editRow(p, null, pos + 1, 'item'); } }
    ];
    if (pos > 0) items.push({ label: t('move_up'), run: function () { p.boq.splice(pos, 1); p.boq.splice(pos - 1, 0, it); save(); renderAll(); } });
    if (pos < p.boq.length - 1) items.push({ label: t('move_down'), run: function () { p.boq.splice(pos, 1); p.boq.splice(pos + 1, 0, it); save(); renderAll(); } });
    items.push({ label: t('delete'), danger: true, run: function () {
      if (!window.confirm(t('cf_delete_row', { name: title }))) return;
      trashPut('boqrow', title, it, { projectId: p.id, index: pos });
      p.boq = p.boq.filter(function (a) { return a.id !== it.id; });
      save(); renderAll(); undoToast();
    } });
    actionSheet(title, items);
  }

  /* One form for every BoQ row type, chosen from a drop-down. */
  function rowKind(it) {
    if (!it) return 'item';
    if (L.isGroupRow(it)) return 'group';
    if (L.isLineRow(it)) return 'line';
    if (L.isSumRow(it)) return 'sum';
    return L.isHeading(it) ? 'note' : 'item';
  }
  function editRow(p, it, pos, kind0) {
    var isNew = !it;
    var x = it || { no: '', desc: '', unit: '', qty: '', rate: '' };
    var startKind = isNew ? (kind0 || 'item') : rowKind(it);
    var SHOW_NO = { key: 'kind', values: ['item', 'note'] }, SHOW_ITEM = { key: 'kind', values: ['item'] };
    openForm({
      title: isNew ? t('add_row') : t('edit_item'),
      fields: [
        { key: 'kind', label: t('row_type'), type: 'select', value: startKind, options: [
          { value: 'item', label: t('rt_item') }, { value: 'note', label: t('rt_note') }, { value: 'line', label: t('rt_line') },
          { value: 'sum', label: t('rt_sum') }, { value: 'group', label: t('rt_group') }] },
        { key: 'no', label: t('item_no'), type: 'text', value: x.no, max: 20, showFor: SHOW_NO },
        { key: 'desc', label: t('item_desc'), type: 'text', value: x.desc, max: 120 },
        { key: 'unit', label: t('unit'), type: 'text', value: x.unit, max: 12, showFor: SHOW_ITEM },
        { key: 'qty', label: t('qty'), type: 'number', min: 0, value: x.qty || '', showFor: SHOW_ITEM },
        { key: 'rate', label: t('rate'), type: 'number', min: 0, value: x.rate || '', showFor: SHOW_ITEM },
        { type: 'note', text: t('rt_item_note'), showFor: SHOW_ITEM },
        { type: 'note', text: t('rt_note_note'), showFor: { key: 'kind', values: ['note'] } },
        { type: 'note', text: t('rt_line_note'), showFor: { key: 'kind', values: ['line'] } },
        { type: 'note', text: t('rt_sum_note'), showFor: { key: 'kind', values: ['sum'] } },
        { type: 'note', text: t('rt_group_note'), showFor: { key: 'kind', values: ['group'] } }
      ],
      onSubmit: function (v) {
        var desc = v.desc;
        if (v.kind === 'sum' && !desc) desc = L.SUM_DEFAULT;
        if (!desc) return t('required');
        var f = { id: it ? it.id : 0, desc: desc, no: '', unit: '', qty: 0, rate: 0, done: it ? it.done : 0 };
        if (v.kind === 'item' || v.kind === 'note') f.no = v.no;
        if (v.kind === 'item') { f.unit = v.unit; f.qty = v.qty; f.rate = v.rate; }
        if (v.kind === 'note') f.done = 0;
        if (v.kind === 'line' || v.kind === 'sum' || v.kind === 'group') f.kind = v.kind;
        var ni = L.sanitizeBoqItem(f);
        if (!ni) return t('required');
        if (isNew) {
          if (p.boq.length >= 3000) return t('required');
          if (pos == null) p.boq.push(ni); else p.boq.splice(Math.max(0, Math.min(pos, p.boq.length)), 0, ni);
        } else {
          var at = p.boq.indexOf(it);
          if (at >= 0) p.boq[at] = ni;
        }
        save(); renderAll();
        return null;
      },
      onDelete: isNew ? null : function () {
        if (!window.confirm(t('cf_delete_row', { name: (it.no ? it.no + ' ' : '') + it.desc }))) return false;
        trashPut('boqrow', (it.no ? it.no + ' ' : '') + it.desc, it, { projectId: p.id, index: p.boq.indexOf(it) });
        p.boq = p.boq.filter(function (a) { return a.id !== it.id; });
        save(); renderAll(); undoToast();
        return true;
      }
    });
  }

  /* Excel BoQ import: pick the sheet, check the detected row types, then replace or add */
  function boqImportPreview(p, sheets) {
    var ov = el('div', 'overlay open sheetov'), m = el('div', 'modal importmodal');
    var cur = 0, mode = p.boq.length ? 'replace' : 'add', withDone = true;
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    var TAG = { item: 'rt_item', row: 'rt_note', line: 'rt_line', sum: 'rt_sum', group: 'rt_group' };
    function draw() {
      var res = sheets[cur].res;
      m.textContent = '';
      m.appendChild(el('h2', null, t('import_preview')));
      if (sheets.length > 1) {
        var sel = el('select');
        sheets.forEach(function (sh, i) { sel.appendChild(option(String(i), sh.name)); });
        sel.value = String(cur);
        sel.addEventListener('change', function () { cur = Number(sel.value); draw(); });
        m.appendChild(sel);
      }
      var total = 0;
      res.items.forEach(function (x) { if (x.type === 'item') total += x.item.qty * x.item.rate; });
      var c = res.counts;
      m.appendChild(el('p', 'small', t('import_counts', { i: c.item, r: c.row, l: c.line, g: c.group, s: c.sum, tot: money(total) })));
      if (res.skipped) m.appendChild(el('p', 'muted small', t('import_skipped', { n: res.skipped })));
      var list = el('div', 'importlist');
      res.items.forEach(function (x) {
        var r = el('div', 'improw imp-' + x.type);
        r.appendChild(el('span', 'boqtag', t(TAG[x.type])));
        var tx = el('span', 'stext');
        tx.appendChild(el('b', null, (x.item.no ? x.item.no + ' ' : '') + x.item.desc));
        if (x.type === 'item') tx.appendChild(el('small', 'muted', x.item.qty + ' ' + x.item.unit + ' × ' + x.item.rate + (withDone && x.item.done > 0 ? ' · ' + t('import_qty_done') + ' ' + x.item.done : '')));
        r.appendChild(tx);
        list.appendChild(r);
      });
      m.appendChild(list);
      if (res.withDone) {
        var dl = el('label', 'check'), dc = el('input');
        dc.type = 'checkbox'; dc.checked = withDone;
        dc.addEventListener('change', function () { withDone = dc.checked; draw(); });
        dl.appendChild(dc); dl.appendChild(el('span', null, ' ' + t('import_with_done', { n: res.withDone })));
        m.appendChild(dl);
      }
      if (p.boq.length) {
        var opts = el('div', 'impmode');
        [['replace', 'import_replace'], ['add', 'import_add']].forEach(function (o) {
          var lab = el('label', 'check'), rb = el('input');
          rb.type = 'radio'; rb.name = 'impmode'; rb.checked = mode === o[0];
          rb.addEventListener('change', function () { mode = o[0]; });
          lab.appendChild(rb); lab.appendChild(el('span', null, ' ' + t(o[1], { n: p.boq.length })));
          opts.appendChild(lab);
        });
        m.appendChild(opts);
      }
      m.appendChild(btn(t('import_do'), 'block primary', function () {
        if (mode === 'replace' && p.boq.length && !window.confirm(t('import_replace_confirm', { name: p.name, n: p.boq.length }))) return;
        var before = p.boq.slice();
        var next = res.items.map(function (x) { var i = x.item; i.id = L.newId(); if (!withDone) i.done = 0; return i; });
        p.boq = (mode === 'replace' ? next : p.boq.concat(next)).slice(0, 3000);
        p.boqLines = 2;
        save(); renderAll(); close();
        toast(t('import_done', { n: next.length }), { label: t('undo'), run: function () { p.boq = before; save(); renderAll(); } });
      }));
      m.appendChild(btn(t('cancel'), 'block', close));
    }
    draw();
    ov.appendChild(m);
    document.body.appendChild(ov);
  }

  $('boqFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    var input = this;
    var p = boqTarget;
    if (!file || !p) { input.value = ''; return; }
    var reader = new FileReader();
    reader.onerror = function () { toast(t('restore_fail')); input.value = ''; };
    if (/\.xlsx$/i.test(file.name) || (file.type || '').indexOf('spreadsheetml') >= 0) {
      reader.onload = function () {
        input.value = '';
        window.CBXlsxRead.read(reader.result).then(function (all) {
          var found = [];
          all.forEach(function (sh) { var res = L.boqFromRows(sh.rows); if (res && res.items.length) found.push({ name: sh.name + ' (' + res.items.length + ')', res: res, key: sh.name }); });
          found.sort(function (a, b) { return (/boq|bill|quantit/i.test(b.key) ? 1 : 0) - (/boq|bill|quantit/i.test(a.key) ? 1 : 0); });
          if (!found.length) { toast(t('import_no_boq')); return; }
          boqImportPreview(p, found);
        }).catch(function () { toast(t('restore_fail')); });
      };
      reader.readAsArrayBuffer(file);
      return;
    }
    reader.onload = function () {
      input.value = '';
      var res = L.boqFromCsv(String(reader.result || ''));
      if (!res.items.length) { toast(t('restore_fail')); return; }
      if (!window.confirm(t('boq_import_confirm', { n: res.items.length }))) return;
      res.items.forEach(function (i) { i.id = L.newId(); p.boq.push(i); });
      p.boq = p.boq.slice(0, 3000);
      save(); renderAll();
      toast(t('restored') + (res.skipped ? ' (' + res.skipped + ' ' + t('skipped') + ')' : ''));
    };
    reader.readAsText(file);
  });

  /* --- budget --- */
  function secBudget(body, p) {
    var s = L.projectSummary(state, p.id);
    var pn = panel(t('budget_by_code'));
    L.CODES.forEach(function (c) {
      var budget = p.budgets[c] || 0, actual = s.costByCode[c];
      if (!budget && !actual) return;
      var row = el('div', 'bar-row');
      var top = el('div', 'bar-top');
      top.appendChild(el('span', null, codeLabel(c)));
      var right = money(actual) + (budget ? ' / ' + money(budget) : ' (' + t('no_budget') + ')');
      var span = el('span', null, right);
      if (budget && actual > budget) span.style.color = 'var(--out)';
      top.appendChild(span);
      row.appendChild(top);
      if (budget) row.appendChild(budgetBar(actual, budget));
      pn.appendChild(row);
    });
    pn.appendChild(kv(t('budget_total'), money(s.budgetTotal), 'total'));
    pn.appendChild(kv(t('actual_cost'), money(s.costTotal)));
    pn.appendChild(kv(t('remaining'), money(s.budgetRemaining), s.budgetTotal > 0 ? (s.budgetRemaining < 0 ? 'neg' : 'pos') : ''));
    body.appendChild(pn);
    body.appendChild(btn(t('edit_budget'), 'primary block', function () { editBudget(p); }));
  }

  function editBudget(p) {
    openForm({
      title: t('edit_budget'),
      fields: L.CODES.map(function (c) {
        return { key: c, label: codeLabel(c), type: 'number', min: 0, value: p.budgets[c] || '' };
      }),
      onSubmit: function (v) {
        var b = {};
        L.CODES.forEach(function (c) { if (v[c] > 0) b[c] = L.round2(v[c]); });
        p.budgets = b;
        save(); renderAll();
        return null;
      },
      focus: false
    });
  }

  /* --- project details --- */
  function projectFields(p) {
    return [
      { key: 'name', label: t('proj_name'), type: 'text', value: p.name, required: true },
      { key: 'client', label: t('client_name'), type: 'text', value: p.client },
      { key: 'location', label: t('location'), type: 'text', value: p.location },
      { key: 'contractor', label: t('contractor_name'), type: 'text', value: p.contractor },
      { key: 'contractSum', label: t('contract_sum'), type: 'number', min: 0, value: p.contractSum || '' },
      { key: 'advancePct', label: t('advance_pct'), type: 'number', min: 0, max: 100, value: p.advancePct },
      { key: 'recoveryPct', label: t('recovery_pct'), type: 'number', min: 0, max: 100, value: p.recoveryPct },
      { key: 'vat', label: t('vat_pct'), type: 'number', min: 0, max: 100, value: p.vat },
      { key: 'retention', label: t('retention_pct'), type: 'number', min: 0, max: 100, value: p.retention },
      { key: 'wht', label: t('wht_pct'), type: 'number', min: 0, max: 100, value: p.wht },
      { key: 'vatWhtPct', label: t('vat_wht_pct'), type: 'number', min: 0, max: 100, value: p.vatWhtPct },
      { key: 'variation', label: t('variation_total'), type: 'number', min: 0, value: p.variation || '' },
      { key: 'rebate', label: t('rebate_pct'), type: 'number', min: 0, max: 100, value: p.rebate || '' },
      { key: 'startDate', label: t('start_date'), type: 'date', value: p.startDate },
      { key: 'endDate', label: t('end_date'), type: 'date', value: p.endDate },
      { key: 'approveDays', label: t('approve_days'), type: 'number', min: 1, max: 365, value: p.approveDays, noCalc: true },
      { key: 'payDays', label: t('pay_days'), type: 'number', min: 1, max: 365, value: p.payDays, noCalc: true }
    ];
  }
  function applyProjectValues(p, v) {
    p.name = v.name.slice(0, 60); p.client = v.client.slice(0, 60); p.location = v.location.slice(0, 60);
    p.contractSum = Math.max(0, L.round2(v.contractSum));
    p.advancePct = Math.min(100, Math.max(0, Math.round(v.advancePct * 1e6) / 1e6));
    p.recoveryPct = Math.min(100, Math.max(0, L.round2(v.recoveryPct)));
    p.vatWhtPct = Math.min(100, Math.max(0, L.round2(v.vatWhtPct)));
    p.vat = Math.min(100, Math.max(0, L.round2(v.vat)));
    // the advance received is a % of the contract sum including VAT
    p.advance = p.contractSum > 0 ? L.round2(L.contractWithVat(p) * p.advancePct / 100) : p.advance;
    p.wht = Math.min(100, Math.max(0, L.round2(v.wht)));
    p.retention = Math.min(100, Math.max(0, L.round2(v.retention)));
    p.contractor = v.contractor.slice(0, 60); p.variation = Math.max(0, L.round2(v.variation)); p.rebate = Math.min(100, Math.max(0, L.round2(v.rebate)));
    p.startDate = L.isDate(v.startDate) ? v.startDate : '';
    p.endDate = L.isDate(v.endDate) ? v.endDate : '';
    p.approveDays = Math.min(365, Math.max(1, Math.round(v.approveDays) || 14));
    p.payDays = Math.min(365, Math.max(1, Math.round(v.payDays) || 21));
  }
  function editProject(p) {
    openForm({
      title: t('edit_project'),
      fields: projectFields(p),
      onSubmit: function (v) { applyProjectValues(p, v); save(); renderAll(); return null; },
      focus: false
    });
  }
  function newProject() {
    // VAT 15%, retention 5%, withholding 3% and advance 20% are starting values only: set them to what your contract says.
    var p = L.sanitizeProject({ name: '', vat: 15, wht: 3, retention: 5, advancePct: 20, recoveryPct: 20, vatWhtPct: 50 }, state.projects.length + 1);
    p.name = '';
    openForm({
      title: t('new_project'),
      fields: projectFields(p),
      onSubmit: function (v) {
        applyProjectValues(p, v);
        state.projects.push(p);
        ui.projectId = p.id; ui.section = 'overview';
        save(); renderAll();
        return null;
      }
    });
  }

  /* --- supplier bills --- */
  function secBills(body, p) {
    var sb = L.supplierBalances(p);
    var pn = panel(t('unpaid_suppliers'));
    if (!sb.length) pn.appendChild(el('p', 'muted small', t('no_data')));
    sb.forEach(function (x) { pn.appendChild(kv(x.supplier || t('uncategorized'), money(x.balance), 'neg')); });
    if (sb.length || p.bills.length) pn.appendChild(btn(t('supplier_stmt'), 'block', function () { pickSupplierStatement(p); }));
    body.appendChild(pn);

    if (!p.bills.length) body.appendChild(el('p', 'empty', t('no_bills')));
    p.bills.slice().sort(function (a, c) { return a.date < c.date ? 1 : a.date > c.date ? -1 : c.id - a.id; }).forEach(function (bill) {
      var card = panel(null);
      card.appendChild(el('h3', null, (bill.supplier || t('uncategorized')) + (bill.desc ? ' – ' + bill.desc : '')));
      card.appendChild(el('div', 'muted small', fmtDate(bill.date) + ' · ' + codeLabel(bill.code)));
      card.appendChild(kv(t('bill_amount'), money(bill.amount)));
      thumbsOnly(card, bill.photos);
      card.appendChild(kv(t('paid'), money(L.billPaid(bill))));
      var bal = L.billBalance(bill);
      card.appendChild(kv(t('balance_due'), money(bal), bal > 0 ? 'neg' : 'pos'));
      bill.payments.forEach(function (pay) {
        var r = el('div', 'pay');
        r.appendChild(el('span', null, fmtDate(pay.date) + ' · ' + money(pay.amount)));
        r.appendChild(btn('✕', '', function () {
          if (!window.confirm(t('confirm_remove_payment'))) return;
          if (pay.entryId && pay.bookId) removeEntryFromBook(pay.bookId, pay.entryId);
          bill.payments = bill.payments.filter(function (x) { return x.id !== pay.id; });
          save(); renderAll();
        }));
        card.appendChild(r);
      });
      var row = el('div', 'btnrow');
      if (bal > 0) row.appendChild(btn(t('pay'), 'primary', function () { payBill(p, bill); }));
      row.appendChild(btn(t('edit_bill'), '', function () { editBill(p, bill); }));
      card.appendChild(row);
      body.appendChild(card);
    });
  }

  function codeOptions() {
    return L.CODES.map(function (c) { return { value: c, label: codeLabel(c) }; });
  }

  function editBill(p, bill) {
    var isNew = !bill;
    var b = bill || { date: L.todayStr(), supplier: '', code: 'materials', desc: '', amount: '', due: '' };
    var pst = newPhotoState(bill ? bill.photos : []);
    openForm({
      title: isNew ? t('add_bill') : t('edit_bill'),
      fields: [
        { key: 'date', label: t('date'), type: 'date', value: b.date, required: true },
        { key: 'supplier', label: t('supplier'), type: 'text', value: b.supplier, required: true },
        { key: 'code', label: t('cost_code'), type: 'select', options: codeOptions(), value: b.code }
      ].concat(L.costSections(p).length ? [{ key: 'sec', label: t('boq_section'), type: 'select', options: [{ value: '', label: t('none_opt') }].concat(L.costSections(p).map(function (s) { return { value: String(s.id), label: s.label.slice(0, 60) }; })), value: b.sec ? String(b.sec) : '' }] : []).concat([
        { key: 'desc', label: t('description'), type: 'text', value: b.desc, max: 80 },
        { key: 'amount', label: t('bill_amount'), type: 'number', min: 0.01, value: b.amount, required: true },
        { key: 'due', label: t('due_date'), type: 'date', value: b.due || '' },
        { key: 'photos', type: 'photos', state: pst }
      ]),
      onSubmit: function (v) {
        var date = L.isDate(v.date) ? v.date : L.todayStr();
        if (isNew) {
          var nb = L.sanitizeBill({ date: date, supplier: v.supplier, sec: Number(v.sec) || 0, code: v.code, desc: v.desc, amount: v.amount, due: v.due, photos: pst.ids });
          if (!nb) return t('required');
          p.bills.push(nb);
        } else {
          bill.date = date; bill.supplier = v.supplier.slice(0, 60); bill.code = v.code; bill.sec = Number(v.sec) || 0; bill.desc = v.desc.slice(0, 80);
          bill.amount = L.round2(v.amount);
          bill.due = L.isDate(v.due) ? v.due : '';
          bill.photos = L.photoIds(pst.ids);
        }
        save(); renderAll();
        return null;
      },
      onDelete: isNew ? null : function () {
        if (!window.confirm(t('confirm_delete_bill'))) return false;
        trashPut('bill', (bill.supplier || '') + ' ' + (bill.desc || ''), bill, { projectId: p.id }, bill.photos);
        clearEntryLinks('billId', bill.id);
        p.bills = p.bills.filter(function (x) { return x.id !== bill.id; });
        save(); renderAll(); undoToast();
        return true;
      }
    });
  }

  function payBill(p, bill) {
    var bal = L.billBalance(bill);
    var books = linkedBookOptions(p, true);
    openForm({
      title: t('pay') + ': ' + (bill.supplier || ''),
      fields: [
        { key: 'date', label: t('payment_date'), type: 'date', value: L.todayStr(), required: true },
        { key: 'amount', label: t('pay_amount'), type: 'number', min: 0.01, value: bal, required: true },
        { key: 'bookId', label: t('record_in_book'), type: 'select', options: books, value: books.length > 1 ? books[1].value : '' }
      ],
      onSubmit: function (v) {
        var date = L.isDate(v.date) ? v.date : L.todayStr();
        var amount = L.round2(v.amount);
        if (!window.confirm(t('cf_pay_bill', { amount: money(amount), name: bill.supplier || bill.desc || '' }))) return '\u00a0';
        var pay = { id: L.newId(), date: date, amount: amount, entryId: 0, bookId: '' };
        var target = v.bookId ? bookById(v.bookId) : null;
        if (target) {
          var e = L.sanitizeEntry({
            id: L.newId(), type: 'out', amount: amount, date: date,
            category: bill.desc || codeLabel(bill.code), note: '', code: bill.code, party: bill.supplier, billId: bill.id
          });
          target.entries.push(e);
          pay.entryId = e.id; pay.bookId = target.id;
        }
        bill.payments.push(L.sanitizePayment(pay));
        save(); renderAll();
        return null;
      }
    });
  }

  /* --- client certificates --- */
  function secClient(body, p) {
    var s = L.projectSummary(state, p.id);
    var info = panel(t('client_section'));
    info.appendChild(kv(t('contract_sum'), money(p.contractSum)));
    if (p.vat > 0 && p.contractSum > 0) info.appendChild(kv(t('contract_incl_vat'), money(L.contractWithVat(p))));
    info.appendChild(kv(t('advance_paid') + ' (' + pct(p.advancePct) + ')', money(p.advance)));
    info.appendChild(kv(t('cl_adv_repay', { p: pct(p.recoveryPct) }), money(s.advanceRecovered)));
    info.appendChild(kv(t('cl_adv_balance'), money(s.advanceBalance)));
    info.appendChild(kv(t('cl_vat', { p: pct(p.vat) }), money(s.vatTotal)));
    info.appendChild(kv(t('cl_retention', { p: pct(p.retention) }), money(s.retentionHeld)));
    info.appendChild(kv(t('cl_wht', { p: pct(p.wht) }), money(s.whtTotal)));
    info.appendChild(kv(t('cl_vat_wht', { p: pct(p.vatWhtPct) }), money(s.vatWhtTotal)));
    if (s.variationTotal > 0) info.appendChild(kv(t('variation_total_all'), money(s.variationTotal)));
    info.appendChild(el('p', 'note', t('cl_amounts_note')));
    info.appendChild(kv(t('due_from_client'), money(s.clientOutstanding), s.clientOutstanding > 0 ? 'pos' : '', 'total'));
    info.appendChild(el('p', 'note', t('cert_formula')));
    info.appendChild(btn(t('edit_project'), 'block', function () { editProject(p); }));
    body.appendChild(info);

    if (!p.certs.length) body.appendChild(el('p', 'empty', t('no_certs')));
    p.certs.slice().sort(function (a, c) { return a.date < c.date ? 1 : a.date > c.date ? -1 : c.id - a.id; }).forEach(function (cert) {
      var c = L.certCalc(p, cert);
      var card = panel(null);
      card.appendChild(el('h3', null, cert.no || t('client')));
      card.appendChild(el('div', 'muted small', fmtDate(cert.date)));
      var stKey = L.certStatus(cert, c);
      var stRow = el('div', 'statusrow');
      stRow.appendChild(el('span', 'statuschip st-' + stKey, t('cs_' + stKey)));
      var stDate = stKey === 'submitted' ? cert.sentDate : stKey === 'approved' ? cert.approvedDate : stKey === 'paid' ? cert.paidDate : '';
      if (stDate) stRow.appendChild(el('small', 'muted', fmtDate(stDate)));
      stRow.appendChild(btn(t('cs_change'), '', function () { changeCertStatus(p, cert); }));
      card.appendChild(stRow);
      if (L.certLocked(p, cert)) card.appendChild(el('div', 'muted small', t('cert_locked')));
      else card.appendChild(btn(t('cert_refresh'), 'block', function () { refreshDraftCert(p, cert, false); }));
      if (c.variation > 0) {
        card.appendChild(kv(t('work_excl_var'), money(c.work)));
        card.appendChild(kv('+ ' + t('variation_orders'), money(c.variation)));
      }
      card.appendChild(kv(t('gross'), money(c.gross)));
      if (c.variationOrder > 0) card.appendChild(kv('   ' + t('of_which') + ' ' + t('variation_order_n', { n: L.variationOrderNo(p, cert.id) }), money(c.variationOrder)));
      card.appendChild(kv('+ ' + t('vat_amt') + ' (' + pct(p.vat) + ')', money(c.vat)));
      card.appendChild(kv(t('work_incl_vat'), money(L.round2(c.gross + c.vat))));
      card.appendChild(kv('− ' + t('retention_amt') + ' (' + pct(p.retention) + ')', money(c.retention)));
      card.appendChild(kv('− ' + t('advance_recovery'), money(c.advanceRecovery)));
      if (c.penalty > 0) card.appendChild(kv('− ' + t('penalty'), money(c.penalty)));
      card.appendChild(kv(t('payable'), money(c.payable), 'total'));
      card.appendChild(el('h4', 'subhead', t('pay_to_contractor')));
      card.appendChild(kv('− ' + t('wht_amt') + ' (' + pct(p.wht) + ')', money(c.wht)));
      card.appendChild(kv('− ' + t('vat_wht_amt') + ' (' + pct(p.vatWhtPct) + ' ' + t('of_vat') + ')', money(c.vatWht)));
      card.appendChild(kv(t('cash_due'), money(c.cashDue), 'total'));
      card.appendChild(kv(t('wht_receipt'), cert.whtReceipt || t('receipt_missing'), cert.whtReceipt || !(c.wht > 0) ? '' : 'neg'));
      card.appendChild(kv(t('vat_wht_receipt'), cert.vatWhtReceipt || t('receipt_missing'), cert.vatWhtReceipt || !(c.vatWht > 0) ? '' : 'neg'));
      card.appendChild(kv(t('cash_received'), money(c.received)));
      card.appendChild(kv(t('tax_settled'), money(c.taxSettled)));
      card.appendChild(kv(t('balance_due'), money(c.balance), c.balance > 0 ? 'pos' : ''));
      cert.receipts.forEach(function (rc) {
        var r = el('div', 'pay');
        r.appendChild(el('span', null, fmtDate(rc.date) + ' · ' + money(rc.amount)));
        r.appendChild(btn('✕', '', function () {
          if (!window.confirm(t('confirm_remove_payment'))) return;
          if (rc.entryId && rc.bookId) removeEntryFromBook(rc.bookId, rc.entryId);
          cert.receipts = cert.receipts.filter(function (x) { return x.id !== rc.id; });
          save(); renderAll();
        }));
        card.appendChild(r);
      });
      var row = el('div', 'btnrow');
      if (c.balance > 0) row.appendChild(btn(t('receive'), 'primary', function () { receiveCert(p, cert); }));
      row.appendChild(btn(t('print'), '', function () { printCertificate(p, cert); }));
      row.appendChild(btn(t('export_cert_xlsx'), '', function () {
        saveWorkbook('Certificate-' + safeName(p.name) + '-' + safeName(cert.no || cert.date), window.CBExcel.certificateWorkbook(p, cert.id));
      }));
      row.appendChild(btn(t('variation_orders') + (cert.variations.length ? ' (' + cert.variations.length + ')' : ''), '', function () { variationList(p, cert); }));
      row.appendChild(btn(t('tax_receipts'), '', function () { editTaxReceipts(cert); }));
      row.appendChild(btn(t('edit_cert'), '', function () { editCert(p, cert); }));
      card.appendChild(row);
      body.appendChild(card);
    });
  }

  function refreshDraftCert(p, cert, quiet) {
    function go() {
      var g = L.refreshDraft(p, cert);
      save(); renderAll();
      toast(g > 0 ? t('cert_refreshed', { no: cert.no || '', gross: money(g) }) : t('nothing_to_certify'));
    }
    if (quiet) go(); else if (window.confirm(t('cert_refresh_confirm'))) go();
  }
  function changeCertStatus(p, cert) {
    var cur = L.certStatus(cert, L.certCalc(p, cert));
    actionSheet(t('cs_change') + ' – ' + (cert.no || ''), L.CERT_STATUSES.map(function (k) {
      return { label: (k === cur ? '✓ ' : '') + t('cs_' + k), run: function () {
        if (k === cur) return;
        if (k === 'draft') {
          if (L.sortedCerts(p).slice(-1)[0] !== cert) { toast(t('cert_unlock_old')); return; }
          if (!window.confirm(t('cert_unlock_confirm'))) return;
        } else if (L.draftCert(p) === cert && L.snapDiffers(p, cert)) {
          actionSheet(t('cert_stale'), [
            { label: t('cert_refresh_then'), run: function () { L.refreshDraft(p, cert); save(); setCertStatus(p, cert, k); } },
            { label: t('cert_keep_asis'), run: function () { setCertStatus(p, cert, k); } }
          ]);
          return;
        }
        setCertStatus(p, cert, k);
      } };
    }));
  }
  function setCertStatus(p, cert, k) {
    var field = { submitted: 'sentDate', approved: 'approvedDate', paid: 'paidDate' }[k];
    if (!field) {
      cert.status = 'draft'; cert.sentDate = ''; cert.approvedDate = ''; cert.paidDate = '';
      save(); renderAll(); return;
    }
    openForm({
      title: t('cs_' + k) + ' – ' + (cert.no || ''),
      fields: [{ key: 'date', label: t('cs_date_' + k), type: 'date', value: cert[field] || L.todayStr(), required: true }],
      onSubmit: function (v) {
        cert.status = k;
        cert[field] = v.date;
        if (k === 'draft' || k === 'submitted') { cert.approvedDate = ''; cert.paidDate = ''; }
        if (k === 'approved') cert.paidDate = '';
        if (k !== 'draft' && !cert.sentDate) cert.sentDate = v.date;
        if (k === 'paid' && !cert.approvedDate) cert.approvedDate = v.date;
        save(); renderAll();
        return null;
      }
    });
  }

  function editCert(p, cert, preset) {
    var isNew = !cert;
    var c = cert || { no: 'IPC-' + (p.certs.length + 1), date: L.todayStr(), gross: preset ? preset.gross : '', advanceRecovery: 0, penalty: 0 };
    var advModes = [{ value: 'auto', label: t('adv_auto') + ' (' + pct(p.recoveryPct) + ')' }, { value: 'manual', label: t('adv_manual') }];
    openForm({
      title: isNew ? t('add_cert') : t('edit_cert'),
      fields: [
        { key: 'no', label: t('cert_no'), type: 'text', value: c.no, max: 20 },
        { key: 'date', label: t('date'), type: 'date', value: c.date, required: true },
        { key: 'gross', label: cert && L.certVariation(cert) > 0 ? t('work_excl_var') : t('gross'), type: 'number', min: 0.01, value: cert ? L.round2(c.gross - L.certVariation(cert)) : c.gross, required: true },
        { key: 'advMode', label: t('advance_recovery'), type: 'select', options: advModes, value: isNew ? 'auto' : 'manual' },
        { key: 'advanceRecovery', label: t('adv_manual_amount'), type: 'number', min: 0, value: c.advanceRecovery || '' },
        { key: 'penalty', label: t('penalty'), type: 'number', min: 0, value: c.penalty || '' }
      ],
      onSubmit: function (v) {
        var date = L.isDate(v.date) ? v.date : L.todayStr();
        var varTotal = cert ? L.certVariation(cert) : 0;
        var gross = L.round2(v.gross + varTotal);
        // automatic = the project's repayment % of the work including VAT, never more than the advance still unrecovered
        var adv = v.advMode === 'auto' ? L.suggestAdvanceRecovery(p, gross, cert ? cert.id : 0) : Math.max(0, L.round2(v.advanceRecovery));
        var pen = Math.max(0, L.round2(v.penalty));
        if (isNew) {
          var nc = L.sanitizeCert({ no: v.no, date: date, gross: v.gross, advanceRecovery: adv, penalty: pen, snap: L.boqSnapshot(p) });
          if (!nc) return t('required');
          p.certs.push(nc);
        } else {
          cert.no = v.no.slice(0, 20); cert.date = date; cert.gross = gross;
          cert.advanceRecovery = adv; cert.penalty = pen;
        }
        save(); renderAll();
        return null;
      },
      onDelete: isNew ? null : function () {
        if (!window.confirm(t('confirm_delete_cert'))) return false;
        trashPut('cert', p.name + ' · ' + (cert.title || ('IPC ' + cert.no)), cert, { projectId: p.id });
        clearEntryLinks('certId', cert.id);
        p.certs = p.certs.filter(function (x) { return x.id !== cert.id; });
        save(); renderAll(); undoToast();
        return true;
      }
    });
  }

  /* Variation items of one certificate. They are added to the certificate's work before VAT. */
  function changeVariations(p, cert, fn) {
    var oldGross = cert.gross, base = L.round2(oldGross - L.certVariation(cert));
    var wasAuto = Math.abs(cert.advanceRecovery - L.suggestAdvanceRecovery(p, oldGross, cert.id)) < 0.01;
    fn();
    cert.gross = L.round2(base + L.certVariation(cert));
    if (wasAuto) cert.advanceRecovery = L.suggestAdvanceRecovery(p, cert.gross, cert.id);
    save(); renderAll();
  }
  function variationList(p, cert) {
    var items = cert.variations.map(function (v) {
      return { label: v.desc + ' · ' + money(L.itemAmount(v)), run: function () { editVariation(p, cert, v); } };
    });
    items.push({ label: '➕ ' + t('add_variation'), run: function () { editVariation(p, cert, null); } });
    actionSheet(t('variation_orders') + ' – ' + (cert.no || '') + (cert.variations.length ? ' (' + money(L.certVariation(cert)) + ')' : ''), items);
  }
  function editVariation(p, cert, v) {
    var isNew = !v;
    var x = v || { desc: '', unit: '', qty: '', rate: '' };
    openForm({
      title: isNew ? t('add_variation') : t('edit_variation'),
      fields: [
        { key: 'desc', label: t('item_desc'), type: 'text', value: x.desc, max: 120, required: true },
        { key: 'unit', label: t('unit'), type: 'text', value: x.unit, max: 12 },
        { key: 'qty', label: t('qty'), type: 'number', min: 0, value: x.qty || '' },
        { key: 'rate', label: t('rate'), type: 'number', min: 0, value: x.rate || '' },
        { type: 'note', text: t('variation_note') }
      ],
      onSubmit: function (f) {
        var nv = L.sanitizeVariation({ id: v ? v.id : 0, desc: f.desc, unit: f.unit, qty: f.qty, rate: f.rate });
        if (!nv) return t('required');
        changeVariations(p, cert, function () {
          if (isNew) cert.variations.push(nv);
          else { v.desc = nv.desc; v.unit = nv.unit; v.qty = nv.qty; v.rate = nv.rate; }
        });
        setTimeout(function () { variationList(p, cert); }, 0);
        return null;
      },
      onDelete: isNew ? null : function () {
        if (!window.confirm(t('cf_delete_row', { name: v.desc }))) return false;
        changeVariations(p, cert, function () { cert.variations = cert.variations.filter(function (a) { return a.id !== v.id; }); });
        return true;
      }
    });
  }

  function editTaxReceipts(cert) {
    openForm({
      title: t('tax_receipts'),
      fields: [
        { key: 'whtReceipt', label: t('wht_receipt'), type: 'text', value: cert.whtReceipt, max: 30 },
        { key: 'vatWhtReceipt', label: t('vat_wht_receipt'), type: 'text', value: cert.vatWhtReceipt, max: 30 }
      ],
      onSubmit: function (v) { cert.whtReceipt = v.whtReceipt.slice(0, 30); cert.vatWhtReceipt = v.vatWhtReceipt.slice(0, 30); save(); renderAll(); return null; }
    });
  }

  function receiveCert(p, cert) {
    var c = L.certCalc(p, cert);
    var books = linkedBookOptions(p, true);
    openForm({
      title: t('receive') + ': ' + (cert.no || ''),
      fields: [
        { key: 'date', label: t('payment_date'), type: 'date', value: L.todayStr(), required: true },
        { key: 'amount', label: t('pay_amount'), type: 'number', min: 0.01, value: c.balance, required: true },
        { key: 'bookId', label: t('record_in_book'), type: 'select', options: books, value: books.length > 1 ? books[1].value : '' }
      ],
      onSubmit: function (v) {
        var date = L.isDate(v.date) ? v.date : L.todayStr();
        var amount = L.round2(v.amount);
        if (!window.confirm(t('cf_receive', { amount: money(amount), name: cert.no || t('client') }))) return '\u00a0';
        var rc = { id: L.newId(), date: date, amount: amount, entryId: 0, bookId: '' };
        var target = v.bookId ? bookById(v.bookId) : null;
        if (target) {
          var e = L.sanitizeEntry({
            id: L.newId(), type: 'in', amount: amount, date: date,
            category: cert.no || t('client'), note: '', party: p.client, certId: cert.id
          });
          target.entries.push(e);
          rc.entryId = e.id; rc.bookId = target.id;
        }
        cert.receipts.push(L.sanitizePayment(rc));
        save(); renderAll();
        return null;
      }
    });
  }

  /* --- labour --- */
  function secLabour(body, p) {
    var wk = L.weekRange(ui.labourDate);
    var nav = el('div', 'monthnav');
    nav.appendChild(btn('‹', 'icon', function () { ui.labourDate = addDays(ui.labourDate, -7); renderProjects(); }));
    nav.appendChild(el('strong', null, t('week') + ' ' + fmtDate(wk.from) + ' – ' + fmtDate(wk.to)));
    nav.appendChild(btn('›', 'icon', function () { ui.labourDate = addDays(ui.labourDate, 7); renderProjects(); }));
    body.appendChild(nav);

    var pn = panel(t('attendance'));
    var dateRow = el('label', 'field');
    dateRow.appendChild(el('span', null, t('date')));
    var di = document.createElement('input');
    di.type = 'date';
    di.value = ui.labourDate;
    di.addEventListener('change', function () { if (L.isDate(di.value)) { ui.labourDate = di.value; renderProjects(); } });
    dateRow.appendChild(di);
    makeDate(di, false);
    pn.appendChild(dateRow);

    if (!p.workers.length) pn.appendChild(el('p', 'muted small', t('no_workers')));
    else pn.appendChild(btn(t('worker_stmt'), 'block', function () { pickWorkerStatement(p, wk); }));
    p.workers.forEach(function (w) {
      var row = p.attendance.filter(function (a) { return a.workerId === w.id && a.date === ui.labourDate; })[0] || null;
      var line = el('div', 'attrow');
      var meta = el('div', 'meta');
      meta.appendChild(el('div', 'title', w.name));
      meta.appendChild(el('div', 'detail', (w.role ? w.role + ' · ' : '') + money(row ? row.rate : w.rate)));
      meta.style.cursor = 'pointer';
      meta.addEventListener('click', function () { editWorker(p, w); });
      line.appendChild(meta);
      var inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.max = '3'; inp.step = '0.5'; inp.inputMode = 'decimal';
      inp.placeholder = '0';
      inp.value = row ? row.days : '';
      inp.setAttribute('aria-label', w.name + ' – ' + t('days'));
      if (row && row.paid) { inp.disabled = true; line.appendChild(el('span', 'paidmark', '✓')); }
      inp.addEventListener('change', function () {
        var days = Math.min(3, Math.max(0, parseFloat(inp.value) || 0));
        days = Math.round(days * 2) / 2;
        p.attendance = p.attendance.filter(function (a) { return !(a.workerId === w.id && a.date === ui.labourDate); });
        if (days > 0) {
          var a = L.sanitizeAttendance({ id: L.newId(), date: ui.labourDate, workerId: w.id, days: days, rate: w.rate, paid: false });
          if (a) p.attendance.push(a);
        }
        save(); renderProjects();
      });
      line.appendChild(inp);
      pn.appendChild(line);
    });
    body.appendChild(pn);

    var pr = L.payroll(p, wk.from, wk.to);
    var sum = panel(t('unpaid_wages'));
    if (!pr.rows.length) sum.appendChild(el('p', 'muted small', t('no_unpaid')));
    pr.rows.forEach(function (r) { sum.appendChild(kv(r.name + ' · ' + r.days + ' ' + t('days'), money(r.amount))); });
    if (pr.rows.length) {
      sum.appendChild(kv(t('unpaid_wages'), money(pr.total), 'total'));
      sum.appendChild(btn(t('mark_week_paid'), 'primary block', function () { payWeek(p, wk, pr); }));
    }
    body.appendChild(sum);
  }

  function editWorker(p, w) {
    var isNew = !w;
    var x = w || { name: '', role: '', rate: '' };
    openForm({
      title: isNew ? t('add_worker') : t('edit_worker'),
      fields: [
        { key: 'name', label: t('worker_name'), type: 'text', value: x.name, required: true },
        { key: 'role', label: t('role'), type: 'text', value: x.role, max: 40 },
        { key: 'rate', label: t('daily_rate'), type: 'number', min: 0, value: x.rate }
      ],
      onSubmit: function (v) {
        if (isNew) {
          var nw = L.sanitizeWorker({ name: v.name, role: v.role, rate: v.rate });
          if (!nw) return t('required');
          p.workers.push(nw);
        } else {
          w.name = v.name.slice(0, 60); w.role = v.role.slice(0, 40); w.rate = Math.max(0, L.round2(v.rate));
        }
        save(); renderAll();
        return null;
      },
      onDelete: isNew ? null : function () {
        if (!window.confirm(t('confirm_delete_worker'))) return false;
        p.workers = p.workers.filter(function (a) { return a.id !== w.id; });
        p.attendance = p.attendance.filter(function (a) { return a.workerId !== w.id; });
        save(); renderAll();
        return true;
      }
    });
  }

  function payWeek(p, wk, pr) {
    var books = linkedBookOptions(p, true);
    openForm({
      title: t('mark_week_paid'),
      fields: [
        { type: 'note', text: t('pay_wages_note', { from: fmtDate(wk.from), to: fmtDate(wk.to), total: money(pr.total) }) },
        { key: 'date', label: t('payment_date'), type: 'date', value: L.todayStr(), required: true },
        { key: 'bookId', label: t('record_in_book'), type: 'select', options: books, value: books.length > 1 ? books[1].value : '' }
      ],
      onSubmit: function (v) {
        var date = L.isDate(v.date) ? v.date : L.todayStr();
        if (!window.confirm(t('cf_wages', { total: money(pr.total), from: fmtDate(wk.from), to: fmtDate(wk.to) }))) return '\u00a0';
        var target = v.bookId ? bookById(v.bookId) : null;
        if (target) {
          target.entries.push(L.sanitizeEntry({
            id: L.newId(), type: 'out', amount: pr.total, date: date,
            category: codeLabel('labour'), note: t('wages_for', { from: fmtDate(wk.from), to: fmtDate(wk.to) }), code: 'labour', party: ''
          }));
        }
        L.markPaid(p, wk.from, wk.to);
        save(); renderAll();
        return null;
      }
    });
  }

  /* --- linked books --- */
  function secBooks(body, p) {
    var pn = panel(t('linked_books'));
    var linked = L.projectBooks(state, p.id);
    if (!linked.length) pn.appendChild(el('p', 'muted small', t('no_linked_books')));
    linked.forEach(function (b) {
      var tot = L.totals(b.entries);
      var card = el('div', 'sub');
      card.appendChild(el('h3', null, b.name));
      card.appendChild(kv(t('balance'), money(tot.balance), tot.balance < 0 ? 'neg' : 'pos'));
      card.appendChild(kv(t('cash_in'), money(tot.cashIn)));
      card.appendChild(kv(t('cash_out'), money(tot.cashOut)));
      var row = el('div', 'btnrow');
      row.appendChild(btn(t('open'), 'primary', function () { state.current = b.id; ui.bookOpen = true; save(); showView('entries'); renderAll(); }));
      row.appendChild(btn(t('unlink'), '', function () { b.projectId = ''; save(); renderAll(); }));
      card.appendChild(row);
      pn.appendChild(card);
    });
    body.appendChild(pn);
    body.appendChild(btn(t('link_book'), 'primary block', function () { linkBookForm(p); }));
  }

  function linkBookForm(p) {
    var free = state.books.filter(function (b) { return b.projectId !== p.id; });
    var opts = [{ value: '', label: t('none_opt') }].concat(free.map(function (b) { return { value: b.id, label: b.name }; }));
    openForm({
      title: t('link_book'),
      fields: [
        { key: 'existing', label: t('existing_book'), type: 'select', options: opts, value: '' },
        { key: 'name', label: t('or_new_book'), type: 'text', value: '', max: 40 }
      ],
      onSubmit: function (v) {
        if (v.name) {
          var id = 'b' + L.newId();
          state.books.push({ id: id, name: v.name.slice(0, 40), projectId: p.id, entries: [] });
        } else if (v.existing) {
          var b = bookById(v.existing);
          if (b) b.projectId = p.id;
        } else {
          return t('pick_book');
        }
        save(); renderAll();
        return null;
      }
    });
  }

  /* ---------- render all / views ---------- */
  function renderAll() {
    applyTheme();
    applyStaticText();
    enhanceStaticDates();
    renderBooks();
    renderBookList();
    applyEntriesScreen();
    renderEntries();
    renderProjects();
    renderContacts();
    renderReports();
    renderSettings();
    renderBiz();
    renderReminders();
    renderBackupState();
    if (window.__renderCloud) window.__renderCloud();
  }

  var VIEWS = ['entries', 'contacts', 'projects', 'reports', 'settings'];
  function showView(name) {
    ui.view = name;
    VIEWS.forEach(function (v) { $('view-' + v).hidden = v !== name; });
    Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === name);
    });
    document.body.classList.remove('view-entries', 'view-contacts', 'view-projects', 'view-reports', 'view-settings');
    document.body.classList.add('view-' + name);
    applyEntriesScreen();
    window.scrollTo(0, 0);
  }

  /* ---------- entry add / edit ---------- */
  var editingEntry = null;
  var entryPhotoSt = newPhotoState([]);

  function entryLinkOptions(project, type, current) {
    var opts = [option('', t('none_opt'))];
    if (type === 'out') {
      project.bills.forEach(function (b) {
        var bal = L.billBalance(b);
        if (bal > 0 || (current && current.billId === b.id)) {
          opts.push(option(String(b.id), (b.supplier || t('uncategorized')) + (b.desc ? ' – ' + b.desc : '') + ' (' + money(bal) + ')'));
        }
      });
    } else {
      project.certs.forEach(function (c) {
        var bal = L.certCalc(project, c).balance;
        if (bal > 0 || (current && current.certId === c.id)) {
          opts.push(option(String(c.id), (c.no || t('client')) + ' (' + money(bal) + ')'));
        }
      });
    }
    return opts;
  }

  function refreshEntryLinks() {
    var proj = projectOfBook(book());
    var box = $('entryProject');
    box.hidden = !proj;
    if (!proj) return;
    var type = $('entryForm').elements.type.value === 'out' ? 'out' : 'in';
    $('linkLabel').textContent = type === 'out' ? t('pays_bill') : t('client_cert');
    var sel = $('linkSel');
    var keep = sel.value;
    sel.textContent = '';
    entryLinkOptions(proj, type, editingEntry).forEach(function (o) { sel.appendChild(o); });
    sel.value = keep && sel.querySelector('option[value="' + keep + '"]') ? keep : '';
    $('codeSel').parentNode.hidden = type !== 'out';
    $('secField').hidden = type !== 'out' || $('secSel').options.length < 2;
  }

  function openEntry(id) {
    if (!canEdit(book())) { toast(t('view_only_note')); return; }
    ui.editingId = id || null;
    var e = null;
    if (id) {
      book().entries.forEach(function (x) { if (x.id === id) e = x; });
      if (!e) return;
    }
    editingEntry = e;
    entryPhotoSt = newPhotoState(e ? e.photos : []);
    photoWidget($('entryPhotos'), entryPhotoSt, null, true);
    $('entryTitle').textContent = e ? t('edit_entry') : t('add_entry');
    $('entryForm').elements.type.value = e ? e.type : 'in';
    $('amount').value = e ? e.amount : '';
    $('date').value = e ? e.date : L.todayStr();
    $('category').value = e ? e.category : '';
    $('note').value = e ? e.note : '';
    renderCatChips();
    $('deleteEntry').hidden = !e;
    fillContactSel(e ? e.contactId : 0);
    var ms = $('modeSel');
    ms.textContent = '';
    ms.appendChild(option('', t('mode_none')));
    L.MODES.forEach(function (m) { ms.appendChild(option(m, t('mode_' + m))); });
    ms.value = e ? e.mode : '';
    $('by').value = e ? e.by : myName();
    var bl = $('byList');
    bl.textContent = '';
    var bySeen = {};
    var biz = byId(state.businesses, book().businessId);
    var byNames = [myName()].concat(biz ? biz.staff.map(function (m) { return m.name; }) : [], book().entries.map(function (x) { return x.by; }));
    byNames.forEach(function (n) { if (n && !bySeen[n]) { bySeen[n] = true; bl.appendChild(option(n, '')); } });

    var proj = projectOfBook(book());
    if (proj) {
      var cs = $('codeSel');
      cs.textContent = '';
      cs.appendChild(option('', t('none_opt')));
      L.CODES.forEach(function (c) { cs.appendChild(option(c, codeLabel(c))); });
      cs.value = e ? e.code : '';
      var ss = $('secSel');
      ss.textContent = '';
      var secs = L.costSections(proj);
      if (secs.length) {
        ss.appendChild(option('', t('none_opt')));
        secs.forEach(function (s) { ss.appendChild(option(String(s.id), s.label.slice(0, 60))); });
      }
      ss.value = e && e.sec ? String(e.sec) : '';
      $('party').value = e ? e.party : '';
      var pl = $('partyList');
      pl.textContent = '';
      var seen = {};
      var names = [];
      book().entries.forEach(function (x) { if (x.party) names.push(x.party); });
      proj.bills.forEach(function (b) { if (b.supplier) names.push(b.supplier); });
      proj.workers.forEach(function (w) { names.push(w.name); });
      if (proj.client) names.push(proj.client);
      state.contacts.forEach(function (c) { names.push(c.name); });
      names.forEach(function (n) { if (!seen[n]) { seen[n] = true; pl.appendChild(option(n, '')); } });
      refreshEntryLinks();
      var cur = e ? (e.type === 'out' ? e.billId : e.certId) : 0;
      $('linkSel').value = cur ? String(cur) : '';
    } else {
      refreshEntryLinks();
    }
    openModal('entryModal');
    if (!e) setTimeout(function () { $('amount').focus(); }, 50);
  }

  $('fab').addEventListener('click', buzz);
  $('fab').addEventListener('click', function () {
    if (ui.view === 'projects') {
      var p = currentProject();
      if (!p) { newProject(); return; }
      ({ overview: function () { editProject(p); }, boq: function () { editRow(p, null, null, 'item'); }, budget: function () { editBudget(p); }, bills: function () { editBill(p, null); },
         client: function () { editCert(p, null); }, labour: function () { editWorker(p, null); }, books: function () { linkBookForm(p); } })[ui.section]();
      return;
    }
    openEntry(null);
  });
  $('cancelEntry').addEventListener('click', function () { rollbackPhotos(entryPhotoSt); closeModal('entryModal'); });
  $('entryModal').addEventListener('click', function (ev) { if (ev.target === this) { rollbackPhotos(entryPhotoSt); closeModal('entryModal'); } });
  Array.prototype.forEach.call(document.querySelectorAll('#entryForm input[name=type]'), function (r) {
    r.addEventListener('change', refreshEntryLinks);
  });

  $('linkSel').addEventListener('change', function () {
    var proj = projectOfBook(book());
    if (!proj || !this.value) return;
    var id = Number(this.value);
    var type = $('entryForm').elements.type.value;
    if (type === 'out') {
      var bill = byId(proj.bills, id);
      if (!bill) return;
      $('codeSel').value = bill.code;
      if (bill.sec && $('secSel').querySelector('option[value="' + bill.sec + '"]')) $('secSel').value = String(bill.sec);
      $('party').value = bill.supplier;
      if (!$('amount').value) $('amount').value = Math.max(0, L.billBalance(bill));
      if (!$('category').value) $('category').value = bill.desc || codeLabel(bill.code);
    } else {
      var cert = byId(proj.certs, id);
      if (!cert) return;
      $('party').value = proj.client;
      if (!$('amount').value) $('amount').value = Math.max(0, L.certCalc(proj, cert).balance);
      if (!$('category').value) $('category').value = cert.no || '';
    }
  });

  $('entryForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = $('entryForm');
    var b = book();
    var proj = projectOfBook(b);
    var type = f.elements.type.value === 'out' ? 'out' : 'in';
    var prev = editingEntry;

    var code = prev ? prev.code : '', party = prev ? prev.party : '';
    var billId = prev ? prev.billId : 0, certId = prev ? prev.certId : 0, sec = prev ? prev.sec : 0;
    if (proj) {
      code = type === 'out' ? $('codeSel').value : '';
      sec = type === 'out' ? Number($('secSel').value) || 0 : 0;
      party = $('party').value;
      var linkVal = Number($('linkSel').value) || 0;
      billId = type === 'out' ? linkVal : 0;
      certId = type === 'in' ? linkVal : 0;
    } else if (prev && prev.type !== type) {
      code = ''; billId = 0; certId = 0; sec = 0;
    }

    var contactId = Number($('contactSel').value) || 0;
    var contact = contactId ? byId(state.contacts, contactId) : null;
    if (contact) party = contact.name; else contactId = 0;
    var draft = L.sanitizeEntry({
      mode: $('modeSel').value, by: $('by').value, contactId: contactId,
      id: ui.editingId || L.newId(),
      type: type,
      amount: parseFloat($('amount').value),
      date: $('date').value,
      category: $('category').value,
      note: $('note').value,
      code: code, sec: sec, party: party, billId: billId, certId: certId, photos: entryPhotoSt.ids
    });
    if (!draft) return;

    var entries = b.entries;
    if (ui.editingId) {
      for (var i = 0; i < entries.length; i++) if (entries[i].id === ui.editingId) entries[i] = draft;
    } else {
      entries.push(draft);
    }
    // keep bill payments / certificate receipts in step with the cash entry
    unlinkEntryEverywhere(draft.id);
    if (proj && (draft.billId || draft.certId)) {
      var pay = L.sanitizePayment({ id: L.newId(), date: draft.date, amount: draft.amount, entryId: draft.id, bookId: b.id });
      var bill = draft.billId ? byId(proj.bills, draft.billId) : null;
      var cert = draft.certId ? byId(proj.certs, draft.certId) : null;
      if (bill && pay) bill.payments.push(pay);
      else if (cert && pay) cert.receipts.push(pay);
      else { draft.billId = 0; draft.certId = 0; }
    }
    commitPhotos(entryPhotoSt);
    save();
    closeModal('entryModal');
    renderAll();
  });

  $('deleteEntry').addEventListener('click', function () {
    if (!ui.editingId || !window.confirm(t('confirm_delete'))) return;
    var b = book();
    var ent = b.entries.filter(function (x) { return x.id === ui.editingId; })[0];
    unlinkEntryEverywhere(ui.editingId);
    deletePhotoIds(entryPhotoSt.removed);
    if (ent) trashPut('entry', (ent.category || ent.note || ent.party || '') + ' ' + money(ent.amount), ent, { bookId: b.id }, entryPhotoSt.ids);
    entryPhotoSt = newPhotoState([]);
    b.entries = b.entries.filter(function (x) { return x.id !== ui.editingId; });
    save();
    closeModal('entryModal');
    renderAll();
    undoToast();
  });

  /* ---------- filters ---------- */
  $('q').addEventListener('input', function () { ui.q = this.value; renderEntries(); });
  $('typeFilter').addEventListener('change', function () { ui.type = this.value; renderEntries(); });
  $('fromDate').addEventListener('change', function () { ui.from = this.value; renderEntries(); });
  $('toDate').addEventListener('change', function () { ui.to = this.value; renderEntries(); });
  $('contactFilter').addEventListener('change', function () { ui.contactId = Number(this.value) || 0; renderEntries(); });
  $('modeFilter').addEventListener('change', function () { ui.mode = this.value; renderEntries(); });
  $('byFilter').addEventListener('change', function () { ui.by = this.value; renderEntries(); });
  $('catFilter').addEventListener('change', function () { ui.category = this.value; renderEntries(); });
  $('clearFilters').addEventListener('click', function () {
    ui.mode = ''; ui.by = ''; ui.category = ''; ui.contactId = 0;
    ui.q = ''; ui.type = 'all'; ui.from = ''; ui.to = '';
    $('q').value = ''; $('typeFilter').value = 'all'; $('fromDate').value = ''; $('toDate').value = '';
    renderEntries();
  });

  /* ---------- contacts ---------- */
  function myName() { try { return window.__myName ? window.__myName() : ''; } catch (e) { return ''; } }

  function fillContactSel(current) {
    var sel = $('contactSel');
    sel.textContent = '';
    sel.appendChild(option('', t('no_contact_opt')));
    state.contacts.slice().sort(function (a, c) { return a.name.localeCompare(c.name); }).forEach(function (c) {
      sel.appendChild(option(String(c.id), c.name + (c.phone ? ' · ' + c.phone : '')));
    });
    if (hasPhoneBook) sel.appendChild(option('__phone', t('phonebook_opt')));
    sel.appendChild(option('__new', t('new_contact_opt')));
    sel.value = current && byId(state.contacts, current) ? String(current) : '';
    sel._prev = sel.value;
  }

  /* ---- phone book (Android contact picker; there is none in a plain browser) ---- */
  var hasPhoneBook = !!(window.AndroidBridge && typeof window.AndroidBridge.pickContact === 'function');
  var phonePick = null;
  function digits(v) { return String(v || '').replace(/\D/g, ''); }
  function pickFromPhone(done) { phonePick = done; window.AndroidBridge.pickContact(); }
  window.__onPhoneContact = function (name, phone) {
    var cb = phonePick; phonePick = null;
    if (!cb || !name) return;
    var d = digits(phone), found = null;
    if (d.length >= 7) state.contacts.forEach(function (c) { if (!found && digits(c.phone).slice(-9) === d.slice(-9)) found = c; });
    if (!found) {
      found = L.sanitizeContact({ id: L.newId(), name: name, phone: phone, kind: 'other' });
      if (!found) return;
      state.contacts.push(found);
      save(); renderAll();
    }
    cb(found);
  };

  $('contactSel').addEventListener('change', function () {
    var sel = this;
    if (sel.value === '__phone') {
      sel.value = sel._prev || '';
      pickFromPhone(function (c) { fillContactSel(c.id); applyContactToParty(c); });
      return;
    }
    if (sel.value === '__new') {
      sel.value = sel._prev || '';
      editContact(null, function (c) { fillContactSel(c.id); applyContactToParty(c); });
      return;
    }
    sel._prev = sel.value;
    var c = byId(state.contacts, Number(sel.value));
    if (c) applyContactToParty(c);
  });
  function applyContactToParty(c) { if (c && !$('entryProject').hidden) $('party').value = c.name; }

  function kindOptions(withAll) {
    var o = withAll ? [option('all', t('all_kinds'))] : [];
    L.KINDS.forEach(function (k) { o.push(option(k, t('kind_' + k))); });
    return o;
  }

  function editContact(contact, done) {
    var isNew = !contact;
    var c = contact || { name: '', phone: '', email: '', address: '', kind: 'customer', note: '' };
    openForm({
      title: isNew ? t('add_contact') : t('edit_contact'),
      fields: [
        { key: 'name', label: t('contact_name'), type: 'text', value: c.name, required: true },
        { key: 'kind', label: t('contact_kind'), type: 'select', options: L.KINDS.map(function (k) { return { value: k, label: t('kind_' + k) }; }), value: c.kind },
        { key: 'phone', label: t('contact_phone'), type: 'text', value: c.phone, max: 30 },
        { key: 'email', label: t('contact_email'), type: 'text', value: c.email },
        { key: 'address', label: t('contact_address'), type: 'text', value: c.address, max: 80 },
        { key: 'note', label: t('contact_note'), type: 'text', value: c.note, max: 80 }
      ],
      onSubmit: function (v) {
        var nc = L.sanitizeContact({ id: contact ? contact.id : L.newId(), name: v.name, kind: v.kind, phone: v.phone, email: v.email, address: v.address, note: v.note });
        if (!nc) return t('required');
        if (isNew) state.contacts.push(nc); else Object.keys(nc).forEach(function (k) { contact[k] = nc[k]; });
        var saved = isNew ? nc : contact;
        // entries keep the contact's name in their payee text so searches and exports match
        if (!isNew) state.books.forEach(function (b) { b.entries.forEach(function (e) { if (e.contactId === saved.id) e.party = saved.name; }); });
        save(); renderAll();
        if (done) done(saved);
        return null;
      },
      onDelete: isNew ? null : function () {
        if (!window.confirm(t('confirm_delete_contact'))) return false;
        trashPut('contact', contact.name, contact, {});
        state.books.forEach(function (b) { b.entries.forEach(function (e) { if (e.contactId === contact.id) e.contactId = 0; }); });
        state.contacts = state.contacts.filter(function (x) { return x.id !== contact.id; });
        if (ui.contactId === contact.id) ui.contactId = 0;
        save(); renderAll(); undoToast();
        return true;
      }
    });
  }

  function renderContacts() {
    var sel = $('ckind');
    var keep = ui.ckind;
    sel.textContent = '';
    kindOptions(true).forEach(function (o) { sel.appendChild(o); });
    sel.value = keep;
    var bal = L.contactBalances(state);
    var q = ui.cq.trim().toLowerCase();
    var list = state.contacts.filter(function (c) {
      if (ui.ckind !== 'all' && c.kind !== ui.ckind) return false;
      return !q || (c.name + ' ' + c.phone + ' ' + c.email + ' ' + c.address).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, c) { return a.name.localeCompare(c.name); });
    var ul = $('contactList');
    ul.textContent = '';
    var tin = 0, tout = 0;
    list.forEach(function (c) {
      var b = bal[c.id];
      tin += b.cashIn; tout += b.cashOut;
      var li = el('li', 'item contact');
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.appendChild(el('span', 'avatar', c.name.charAt(0).toUpperCase()));
      var meta = el('div', 'meta');
      meta.appendChild(el('div', 'title', c.name));
      meta.appendChild(el('div', 'detail', [t('kind_' + c.kind), c.phone, b.count ? t('entries_n', { n: b.count }) : ''].filter(Boolean).join(' · ')));
      if (b.count) meta.appendChild(el('div', 'detail', t('received_total') + ' ' + money(b.cashIn) + ' · ' + t('paid_total') + ' ' + money(b.cashOut)));
      li.appendChild(meta);
      var side = el('div', 'cside');
      if (b.count) side.appendChild(el('span', 'amt ' + (b.net >= 0 ? 'in' : 'out'), (b.net >= 0 ? '+' : '−') + money(Math.abs(b.net))));
      var acts = el('div', 'cacts');
      if (c.phone) { var a1 = el('a', null, '📞'); a1.href = 'tel:' + c.phone.replace(/[^0-9+]/g, ''); a1.addEventListener('click', function (ev) { ev.stopPropagation(); }); acts.appendChild(a1); }
      if (c.email) { var a2 = el('a', null, '✉️'); a2.href = 'mailto:' + c.email; a2.addEventListener('click', function (ev) { ev.stopPropagation(); }); acts.appendChild(a2); }
      if (b.count) {
        var a3 = el('a', null, '🔎');
        a3.href = '#';
        a3.addEventListener('click', function (ev) {
          ev.preventDefault(); ev.stopPropagation();
          ui.contactId = c.id; ui.q = ''; $('q').value = '';
          showView('entries'); renderEntries();
        });
        acts.appendChild(a3);
      }
      side.appendChild(acts);
      li.appendChild(side);
      var open = function () { editContact(c); };
      li.addEventListener('click', open);
      li.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
      ul.appendChild(li);
    });
    $('contactEmpty').hidden = list.length > 0;
    $('contactEmpty').textContent = state.contacts.length ? t('no_match') : t('no_contacts');
    $('contactTotals').textContent = list.length ? t('contacts_summary', { n: list.length, i: money(tin), o: money(tout) }) : '';
  }
  $('cq').addEventListener('input', function () { ui.cq = this.value; renderContacts(); });
  $('ckind').addEventListener('change', function () { ui.ckind = this.value; renderContacts(); });
  $('addContact').addEventListener('click', function () { editContact(null); });
  $('pickContact').hidden = !hasPhoneBook;
  $('pickContact').addEventListener('click', function () {
    pickFromPhone(function (c) { toast(c.name); editContact(c); });
  });

  /* ---------- businesses and staff ---------- */
  function renderBiz() {
    var P = $('bizPanel');
    P.textContent = '';
    P.appendChild(el('h2', null, t('businesses')));
    state.businesses.forEach(function (bz) {
      var card = el('div', 'bizcard');
      card.appendChild(el('h3', null, bz.name));
      var nb = state.books.filter(function (b) { return b.businessId === bz.id; }).length;
      card.appendChild(el('div', 'muted small', t('books') + ': ' + nb));
      if (!bz.staff.length) card.appendChild(el('p', 'muted small', t('no_staff')));
      bz.staff.forEach(function (m) {
        var r = el('button', 'staffrow');
        r.type = 'button';
        r.appendChild(el('span', 'avatar', m.name.charAt(0).toUpperCase()));
        var tx = el('span', 'stext');
        tx.appendChild(el('b', null, m.name));
        tx.appendChild(el('small', 'muted', [t('role_' + m.role), m.phone].filter(Boolean).join(' · ')));
        r.appendChild(tx);
        r.addEventListener('click', function () { editStaff(bz, m); });
        card.appendChild(r);
      });
      var row = el('div', 'btnrow');
      row.appendChild(btn(t('add_staff'), '', function () { editStaff(bz, null); }));
      row.appendChild(btn(t('rename_business'), '', function () { editBusiness(bz); }));
      card.appendChild(row);
      P.appendChild(card);
    });
    P.appendChild(btn(t('add_business'), 'block', function () { editBusiness(null); }));
    P.appendChild(el('p', 'muted small', t('staff_note')));
  }

  function editBusiness(bz) {
    openForm({
      title: bz ? t('rename_business') : t('add_business'),
      fields: [{ key: 'name', label: t('business_name'), type: 'text', value: bz ? bz.name : '', required: true, max: 40 }],
      onSubmit: function (v) {
        if (bz) bz.name = v.name.slice(0, 40);
        else {
          var nb = L.sanitizeBusiness({ id: 'biz' + L.newId(), name: v.name, staff: [] });
          state.businesses.push(nb);
          state.business = nb.id;
          var id = 'b' + L.newId();
          state.books.push({ id: id, name: nb.name, projectId: '', businessId: nb.id, entries: [] });
          state.current = id;
        }
        save(); renderAll();
        return null;
      },
      onDelete: bz ? function () {
        if (!window.confirm(t('confirm_delete_business'))) return false;
        state.books.forEach(function (b) { if (b.businessId === bz.id) b.businessId = ''; });
        state.businesses = state.businesses.filter(function (x) { return x.id !== bz.id; });
        if (state.business === bz.id) state.business = '';
        save(); renderAll();
        return true;
      } : null
    });
  }

  function editStaff(bz, m) {
    openForm({
      title: m ? t('edit_staff') : t('add_staff'),
      fields: [
        { key: 'name', label: t('staff_name'), type: 'text', value: m ? m.name : '', required: true },
        { key: 'phone', label: t('staff_phone'), type: 'text', value: m ? m.phone : '', max: 30 },
        { key: 'role', label: t('staff_role'), type: 'select', options: L.STAFF_ROLES.map(function (r) { return { value: r, label: t('role_' + r) }; }), value: m ? m.role : 'cashier' }
      ],
      onSubmit: function (v) {
        var ns = L.sanitizeBusiness({ id: bz.id, name: bz.name, staff: [{ id: m ? m.id : L.newId(), name: v.name, phone: v.phone, role: v.role }] }).staff[0];
        if (!ns) return t('required');
        if (m) Object.keys(ns).forEach(function (k) { m[k] = ns[k]; }); else bz.staff.push(ns);
        save(); renderAll();
        return null;
      },
      onDelete: m ? function () {
        bz.staff = bz.staff.filter(function (x) { return x.id !== m.id; });
        save(); renderAll();
        return true;
      } : null
    });
  }

  /* ---------- reminders: unpaid bills and certificates ---------- */
  var REM_KEY = 'cashbook.rem.v1', NOTIF_KEY = 'cashbook.notif.v1';
  function remMap() { try { return JSON.parse(localStorage.getItem(REM_KEY)) || {}; } catch (e) { return {}; } }
  function remSave(m) { try { localStorage.setItem(REM_KEY, JSON.stringify(m)); } catch (e) { /* ignore */ } renderReminders(); }
  function notifOn() { try { return localStorage.getItem(NOTIF_KEY) === '1'; } catch (e) { return false; } }

  function openReminderTarget(r) {
    ui.projectId = r.projectId;
    ui.section = r.kind === 'cert' ? 'client' : r.kind === 'wages' ? 'labour' : 'bills';
    showView('projects'); renderProjects(); renderReminders(); window.scrollTo(0, 0);
  }
  function reminderActions(r) {
    var p = projectById(r.projectId), key = L.reminderKey(r), items = [];
    items.push({ label: t('rem_open'), run: function () { openReminderTarget(r); } });
    if (p && r.kind === 'bill') {
      var bill = p.bills.filter(function (b) { return b.id === r.id; })[0];
      if (bill) items.push({ label: t('rem_paid'), run: function () { payBill(p, bill); } });
    }
    if (p && r.kind === 'cert') {
      var cert = p.certs.filter(function (c) { return c.id === r.id; })[0];
      if (cert) items.push({ label: t('rem_received'), run: function () { receiveCert(p, cert); } });
    }
    [1, 3, 7].forEach(function (n) {
      items.push({ label: t('rem_snooze', { n: n }), run: function () { var m = remMap(); m[key] = L.addDaysStr(L.todayStr(), n); remSave(m); toast(t('rem_snoozed', { n: n })); } });
    });
    items.push({ label: t('rem_hide'), run: function () { var m = remMap(); m[key] = 'hide'; remSave(m); toast(t('rem_hidden')); } });
    actionSheet((r.who || r.project || '') + ' · ' + money(r.amount), items);
  }

  /* ---------- phone notifications (Android app only) ---------- */
  var notifTimer = null;
  function hasNative() { return !!(window.AndroidBridge && window.AndroidBridge.setNotifications); }
  function syncNotifications() {
    if (!hasNative()) return;
    clearTimeout(notifTimer);
    notifTimer = setTimeout(function () {
      var events = [];
      if (notifOn()) {
        var seq = 0;
        L.notifyPlan(state, L.todayStr(), 14, remMap()).forEach(function (e) {
          var hm = e.time.split(':'), dp = e.date.split('-');
          var at = new Date(Number(dp[0]), Number(dp[1]) - 1, Number(dp[2]), Number(hm[0]), Number(hm[1]), 0).getTime();
          var title, text;
          if (e.kind === 'summary') {
            title = t('nt_summary_title', { n: e.n });
            text = (e.overdue ? t('nt_overdue', { n: e.overdue }) + '. ' : '') + e.items.map(function (r) { return (r.kind === 'wages' ? t('fc_wages') : r.who || r.desc || '') + ' ' + money(r.amount); }).join(', ');
          } else {
            var r = e.item;
            title = (r.kind === 'cert' ? t('nt_due_cert') : r.kind === 'wages' ? t('nt_due_wages') : t('nt_due_bill')) + (r.kind === 'wages' ? '' : ': ' + (r.who || r.desc || ''));
            text = [r.project, r.desc, money(r.amount)].filter(Boolean).join(' · ');
          }
          seq++;
          events.push({ id: seq, at: at, title: title, text: text });
        });
      }
      try { window.AndroidBridge.setNotifications(JSON.stringify(events)); } catch (e) { /* ignore */ }
    }, 1500);
  }
  function initNotifPanel() {
    var pn = $('notifPanel');
    if (!hasNative()) { pn.hidden = true; return; }
    pn.hidden = false;
    var cb = $('notifOn');
    function note() {
      var ok = true;
      try { ok = window.AndroidBridge.notificationsAllowed(); } catch (e) { /* ignore */ }
      $('notifNote').textContent = notifOn() && !ok ? t('nt_blocked') : t('nt_note');
    }
    cb.checked = notifOn();
    note();
    cb.addEventListener('change', function () {
      try { localStorage.setItem(NOTIF_KEY, cb.checked ? '1' : '0'); } catch (e) { /* ignore */ }
      if (cb.checked) { try { window.AndroidBridge.requestNotificationPermission(); } catch (e) { /* ignore */ } }
      syncNotifications(); setTimeout(note, 1500);
    });
    $('notifTest').addEventListener('click', function () {
      try { window.AndroidBridge.requestNotificationPermission(); window.AndroidBridge.testNotification(t('nt_test_title'), t('nt_test_text')); } catch (e) { /* ignore */ }
      toast(t('nt_test_sent'));
    });
    $('remReset').addEventListener('click', function () { remSave({}); toast(t('rem_restored')); });
  }

  function renderReminders() {
    var rmap = remMap(), today0 = L.todayStr();
    var list = L.reminders(state, today0, 7).filter(function (r) { return !L.reminderHidden(rmap, L.reminderKey(r), today0); });
    syncNotifications();
    var urgent = list.filter(function (r) { return r.level === 'overdue' || r.level === 'soon'; });
    var ban = $('remindBanner');
    ban.hidden = !urgent.length;
    ban.textContent = urgent.length ? t('bills_due_banner', { n: urgent.length }) : '';
    var box = $('remindBox');
    box.textContent = '';
    if (ui.projectId || !list.length) return;
    var pn = panel(t('reminders'));
    list.slice(0, 8).forEach(function (r) {
      var row = el('button', 'remrow ' + r.level);
      row.type = 'button';
      var tx = el('span', 'stext');
      tx.appendChild(el('b', null, r.kind === 'wages' ? t('fc_wages') : (r.kind === 'cert' ? t('unpaid_cert') + ': ' : '') + (r.who || '—')));
      var cnote = r.note ? t('cn_' + r.note.split(':')[0], { n: r.note.split(':')[1] }) : '';
      tx.appendChild(el('small', 'muted', [r.project, r.desc, cnote, r.due ? t('due_label') + ' ' + fmtDate(r.due) : ''].filter(Boolean).join(' · ')));
      row.appendChild(tx);
      row.appendChild(el('span', 'amt ' + (r.level === 'overdue' ? 'out' : ''), money(r.amount)));
      row.addEventListener('click', function () { reminderActions(r); });
      pn.appendChild(row);
    });
    box.appendChild(pn);
  }
  $('remindBanner').addEventListener('click', function () { showView('projects'); renderProjects(); renderReminders(); });
  initNotifPanel();

  /* ---------- report export (Excel / PDF) for a date range ---------- */
  function exportRange() {
    var from = L.isDate($('rFrom').value) ? $('rFrom').value : '', to = L.isDate($('rTo').value) ? $('rTo').value : '';
    ui.rFrom = from; ui.rTo = to; ui.rScope = $('rScope').value;
    var ids = ui.rScope === 'all' ? null : [book().id];
    return { from: from, to: to, ids: ids };
  }
  function initExportPanel() {
    var sel = $('rScope');
    sel.textContent = '';
    sel.appendChild(option('book', t('this_book') + ': ' + book().name));
    sel.appendChild(option('all', t('all_books_opt')));
    sel.value = ui.rScope;
    if (!ui.rFrom && !ui.rTo) {
      var today = L.todayStr(), pp = cal().parts(today);
      ui.rFrom = pp ? cal().fromParts(pp.y, pp.m, 1) : today;
      ui.rTo = today;
    }
    $('rFrom').value = ui.rFrom; $('rTo').value = ui.rTo;
  }
  $('rXlsx').addEventListener('click', function () {
    var r = exportRange();
    saveWorkbook('Cash-report', window.CBExcel.reportWorkbook({ state: state, from: r.from, to: r.to, bookIds: r.ids, title: t('report_title') }));
  });
  $('rPdf').addEventListener('click', function () {
    var r = exportRange();
    var list = L.rangeEntries(state, r.from, r.to, r.ids);
    var cn = {};
    state.contacts.forEach(function (c) { cn[c.id] = c.name; });
    function group(title, fn) {
      var m = {};
      list.forEach(function (e) {
        var k = fn(e) || '-';
        m[k] = m[k] || { i: 0, o: 0 };
        if (e.type === 'in') m[k].i += e.amount; else m[k].o += e.amount;
      });
      return { title: title, rows: Object.keys(m).sort().map(function (k) { return [k, L.round2(m[k].i), L.round2(m[k].o), L.round2(m[k].i - m[k].o)]; }) };
    }
    printDoc(t('report_title'), window.CBPrint.reportHtml({
      t: t, money: money, lang: state.settings.lang, title: t('report_title'), date: L.todayStr(),
      periodLabel: t('period') + ': ' + (r.from ? fmtDate(r.from) : '…') + ' – ' + (r.to ? fmtDate(r.to) : '…'),
      scopeLabel: r.ids ? book().name : t('all_books_opt'),
      totals: L.totals(list),
      groups: [group(t('by_category'), function (e) { return e.category; }), group(t('by_mode'), function (e) { return e.mode ? t('mode_' + e.mode) : ''; }),
        group(t('by_member'), function (e) { return e.by; }), group(t('by_contact'), function (e) { return e.contactId ? cn[e.contactId] : e.party; })],
      entries: list, fmt: function (d) { return fmtDate(d); }
    }));
  });

  /* ---------- reports nav ---------- */
  $('prevMonth').addEventListener('click', function () { ui.month = cal().shiftMonth(ui.month, -1); renderReports(); });
  $('nextMonth').addEventListener('click', function () { ui.month = cal().shiftMonth(ui.month, 1); renderReports(); });

  /* ---------- tabs ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-view');
      buzz();
      if (v === 'entries' && ui.view === 'entries') ui.bookOpen = false;   // tapping Entries again goes back to the list of books
      showView(v);
      if (v === 'reports') renderReports();
      if (v === 'projects') renderProjects();
      if (v === 'contacts') renderContacts();
    });
  });

  /* ---------- books ---------- */
  $('bookSelect').addEventListener('change', function () {
    state.current = this.value;
    save();
    renderAll();
  });
  function fillBookProject() {
    var sel = $('bookProject');
    sel.textContent = '';
    sel.appendChild(option('', t('no_project')));
    state.projects.forEach(function (p) { sel.appendChild(option(p.id, p.name)); });
    sel.value = book().projectId || '';
    $('bookProject').parentNode.hidden = !state.projects.length;
  }
  $('bookBtn').addEventListener('click', function () {
    $('bookName').value = '';
    $('deleteBook').hidden = state.books.length < 2;
    fillBookProject();
    fillBookBiz();
    openModal('bookModal');
  });
  function fillBookBiz() {
    var sel = $('bookBiz');
    sel.textContent = '';
    sel.appendChild(option('', t('no_business')));
    state.businesses.forEach(function (x) { sel.appendChild(option(x.id, x.name)); });
    sel.value = book().businessId || state.business || '';
    $('bookBizField').hidden = !state.businesses.length;
  }
  $('bookBiz').addEventListener('change', function () {
    book().businessId = this.value;
    save();
    renderAll();
  });
  $('bizSelect').addEventListener('change', function () {
    state.business = this.value;
    save();
    renderAll();
  });
  $('bookProject').addEventListener('change', function () {
    book().projectId = this.value;
    save();
    renderAll();
  });
  $('closeBook').addEventListener('click', function () { closeModal('bookModal'); });

  /* About */
  var APP_VERSION = '2.21.1', APP_BUILD = 42;
  $('aboutBtn').addEventListener('click', function () { $('aboutVersion').textContent = APP_VERSION + ' (build ' + APP_BUILD + ')'; openModal('aboutModal'); });
  $('aboutBackup').addEventListener('click', function () { closeModal('aboutModal'); var b = $('backupBtn'); b.scrollIntoView({ block: 'center' }); b.click(); });
  $('closeAbout').addEventListener('click', function () { closeModal('aboutModal'); });
  $('aboutModal').addEventListener('click', function (e) { if (e.target === this) closeModal('aboutModal'); });
  $('bookModal').addEventListener('click', function (ev) { if (ev.target === this) closeModal('bookModal'); });

  $('newBook').addEventListener('click', function () {
    var name = $('bookName').value.trim().slice(0, 40);
    if (!name) { $('bookName').focus(); return; }
    var id = 'b' + L.newId();
    state.books.push({ id: id, name: name, projectId: $('bookProject').value || '', businessId: $('bookBiz').value || state.business || '', updated: L.todayStr(), entries: [] });
    state.current = id;
    ui.bookOpen = true;
    save();
    closeModal('bookModal');
    renderAll();
  });
  $('renameBook').addEventListener('click', function () {
    var name = $('bookName').value.trim().slice(0, 40);
    if (!name) { $('bookName').focus(); return; }
    book().name = name;
    save();
    closeModal('bookModal');
    renderAll();
  });
  $('deleteBook').addEventListener('click', function () {
    if (state.books.length < 2) { toast(t('last_book')); return; }
    function proceed() {
      var cur = book().id;
      dropPaymentsOfBook(cur);
      trashPut('book', book().name, book(), {}, entryPhotoIds(book().entries));
      state.books = state.books.filter(function (b) { return b.id !== cur; });
      state.current = state.books[0].id;
      ui.bookOpen = false;
      save();
      closeModal('bookModal');
      renderAll();
      undoToast();
    }
    if (book().sync && window.__cloudRelease) {          // also removes / leaves the online copy first
      window.__cloudRelease(book()).then(function (ok) { if (ok) proceed(); });
      return;
    }
    if (!window.confirm(t('confirm_delete_book'))) return;
    proceed();
  });

  /* ---------- settings ---------- */
  $('langSel').addEventListener('change', function () { state.settings.lang = this.value; save(); renderAll(); });
  $('curSel').addEventListener('change', function () { state.settings.currency = this.value; save(); renderAll(); });
  $('themeSel').addEventListener('change', function () { state.settings.theme = this.value; save(); applyTheme(); });
  $('calSel').addEventListener('change', function () {
    state.settings.calendar = L.CALENDARS.indexOf(this.value) >= 0 ? this.value : 'gregorian';
    ui.month = cal().monthKey(L.todayStr());
    save();
    renderAll();
  });

  $('clearBtn').addEventListener('click', function () {
    if (!canEdit(book())) { toast(t('view_only_note')); return; }
    if (!window.confirm(t('confirm_clear'))) return;
    dropPaymentsOfBook(book().id);
    if (book().entries.length) trashPut('book', book().name + ' (' + t('cleared') + ')', book(), {}, entryPhotoIds(book().entries));
    book().entries = [];
    save();
    renderAll();
    undoToast();
  });

  /* ---------- PIN ---------- */
  function showLock() {
    if (!state.settings.pinHash) return;
    $('pinInput').value = '';
    $('lockMsg').textContent = '';
    $('lock').classList.add('open');
    setTimeout(function () { $('pinInput').focus(); }, 50);
  }

  $('lockForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var pin = $('pinInput').value;
    if (L.hashPin(pin, state.settings.pinSalt) === state.settings.pinHash) {
      $('lock').classList.remove('open');
      $('pinInput').value = '';
    } else {
      $('lockMsg').textContent = t('wrong_pin');
      $('pinInput').value = '';
    }
  });

  document.addEventListener('visibilitychange', function () { if (document.hidden) showLock(); });

  $('setPinBtn').addEventListener('click', function () {
    $('pin1').value = ''; $('pin2').value = ''; $('pinErr').textContent = '';
    openModal('pinModal');
    setTimeout(function () { $('pin1').focus(); }, 50);
  });
  $('cancelPin').addEventListener('click', function () { closeModal('pinModal'); });
  $('pinForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var a = $('pin1').value, b = $('pin2').value;
    if (!L.validPin(a)) { $('pinErr').textContent = t('pin_invalid'); return; }
    if (a !== b) { $('pinErr').textContent = t('pin_mismatch'); return; }
    var salt = L.newSalt();
    state.settings.pinSalt = salt;
    state.settings.pinHash = L.hashPin(a, salt);
    save();
    closeModal('pinModal');
    renderSettings();
  });
  $('removePinBtn').addEventListener('click', function () {
    if (!window.confirm(t('cf_remove_pin'))) return;
    state.settings.pinHash = '';
    state.settings.pinSalt = '';
    save();
    renderSettings();
  });

  /* ---------- files: export, backup, restore ---------- */
  function saveFile(name, mime, content) {
    if (window.AndroidBridge && typeof window.AndroidBridge.saveFile === 'function') {
      var where = window.AndroidBridge.saveFile(name, mime, content);
      toast(where ? t('saved') + ' ' + where : t('save_failed'));
      return !!where;
    }
    var blob = new Blob([content], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return true;
  }

  /* binary files (.xlsx): Android gets base64, the browser a normal download */
  function saveBinary(name, mime, bytes) {
    if (window.AndroidBridge && typeof window.AndroidBridge.saveFileB64 === 'function') {
      var bin = '';
      for (var i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      var where = window.AndroidBridge.saveFileB64(name, mime, btoa(bin));
      toast(where ? t('saved') + ' ' + where : t('save_failed'));
      return;
    }
    var blob = new Blob([bytes], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast(t('xlsx_saved'));
  }
  var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  function saveWorkbook(base, wb) {
    if (!wb) return;
    saveBinary(base + '-' + L.todayStr() + '.xlsx', XLSX_MIME, window.CBExcel.toBytes(wb));
  }

  $('exportBtn').addEventListener('click', function () {
    saveFile('cashbook-' + safeName(book().name) + '-' + L.todayStr() + '.csv', 'text/csv', L.buildCsv(book().entries));
  });

  /* ---------- backup: one file with all data and photos ---------- */
  var BACKUP_KEY = 'cashbook.backup.v1';   // when the last backup file was saved; never part of a backup
  var PREREST_KEY = 'cashbook.prerestore.v1'; // the data that was on the phone before the last restore
  function backupInfo() { try { return JSON.parse(localStorage.getItem(BACKUP_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function setBackupInfo(o) { try { localStorage.setItem(BACKUP_KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } }
  function dataCount() {
    var n = 0;
    state.books.forEach(function (b) { n += b.entries.length; });
    return { entries: n, projects: state.projects.length, contacts: state.contacts.length };
  }
  function hasData() { var c = dataCount(); return c.entries + c.projects + c.contacts > 0; }

  function buildBackup() {
    var copy = JSON.parse(JSON.stringify(state));
    copy.settings.pinHash = '';
    copy.settings.pinSalt = '';
    copy.backupVersion = 2;
    copy.savedAt = new Date().toISOString();
    copy.photos = {};
    var ids = allPhotoIds();
    return Promise.all(ids.map(function (id) {
      return photoData(id).then(function (d) { return [id, d]; }, function () { return [id, null]; });
    })).then(function (pairs) {
      var n = 0;
      pairs.forEach(function (x) { if (x[1]) { copy.photos[x[0]] = x[1]; n++; } });
      return { text: JSON.stringify(copy), photos: n };
    });
  }
  function doBackup() {
    return buildBackup().then(function (r) {
      var ok = saveFile('cashbook-backup-' + L.todayStr() + '.json', 'application/json', r.text);
      if (ok) {
        var c = dataCount();
        setBackupInfo({ last: Date.now(), entries: c.entries, projects: c.projects, photos: r.photos, snooze: 0 });
        renderBackupState();
      }
      return ok;
    });
  }
  $('backupBtn').addEventListener('click', function () { doBackup(); });

  function renderBackupState() {
    var info = backupInfo(), box = $('backupState');
    if (box) {
      if (info.last) {
        box.textContent = t('last_backup', { d: fmtDate(new Date(info.last).toISOString().slice(0, 10)), e: info.entries || 0, p: info.projects || 0 });
        box.className = 'muted small';
      } else {
        box.textContent = t('no_backup_yet');
        box.className = 'small bkwarn';
      }
    }
    var ban = $('backupBanner');
    if (ban) {
      var age = info.last ? (Date.now() - info.last) / 86400000 : 99;
      var show = hasData() && age >= 7 && !(info.snooze && Date.now() < info.snooze);
      ban.hidden = !show;
      if (show) {
        ban.textContent = '';
        ban.appendChild(el('span', 'bktext', info.last ? t('backup_overdue', { n: Math.floor(age) }) : t('backup_never')));
        var row = el('span', 'bkbtns');
        row.appendChild(btn(t('backup_now'), 'primary', function () { doBackup(); }));
        row.appendChild(btn(t('bk_later'), '', function () { var i = backupInfo(); i.snooze = Date.now() + 86400000; setBackupInfo(i); renderBackupState(); }));
        ban.appendChild(row);
      }
    }
    var pr = $('prerestoreBtn');
    if (pr) { var has = false; try { has = !!localStorage.getItem(PREREST_KEY); } catch (e) { /* ignore */ } pr.hidden = !has; }
    var tb = $('trashBtn');
    if (tb) tb.textContent = t('recently_deleted') + ' (' + (state.trash || []).length + ')';
  }

  /* put photos from a backup on the phone */
  function putPhotos(parsed) {
    var ids = Object.keys(parsed.photos || {}).filter(function (id) {
      var d = parsed.photos[id];
      return /^\d{1,16}$/.test(id) && typeof d === 'string' && d.indexOf('data:image/') === 0 && d.length < 4000000;
    });
    var n = 0;
    return ids.reduce(function (chain, id) {
      return chain.then(function () {
        return window.CBPhotos.put(id, parsed.photos[id]).then(function () { photoCache[Number(id)] = parsed.photos[id]; n++; }).catch(function () { /* skip */ });
      });
    }, Promise.resolve()).then(function () { return n; });
  }
  function restorePhotos(parsed) {
    putPhotos(parsed).then(function (n) {
      renderAll();
      toast(n ? t('photos_restored', { n: n }) : t('restore_fail'));
    });
  }

  /* Recently deleted */
  function openTrash() {
    var ov = el('div', 'overlay open sheetov'), m = el('div', 'modal');
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    function draw() {
      m.textContent = '';
      m.appendChild(el('h2', null, t('recently_deleted')));
      m.appendChild(el('p', 'muted small', t('trash_note')));
      if (!state.trash.length) m.appendChild(el('p', 'muted', t('trash_empty')));
      state.trash.forEach(function (rec) {
        var left = Math.max(0, L.TRASH_DAYS - Math.floor((Date.now() - rec.deletedAt) / 86400000));
        var row = el('div', 'trashrow');
        var tx = el('span', 'stext');
        tx.appendChild(el('b', null, rec.label || '—'));
        tx.appendChild(el('small', 'muted', t('trash_kind_' + rec.kind) + ' · ' + t('trash_days_left', { n: left })));
        row.appendChild(tx);
        row.appendChild(btn(t('restore_item'), 'primary', function () {
          if (trashRestore(rec)) { save(); renderAll(); toast(t('restored_item')); draw(); }
        }));
        row.appendChild(btn('✕', 'danger', function () {
          if (!window.confirm(t('trash_forever', { name: rec.label || '—' }))) return;
          trashDrop(rec); save(); renderBackupState(); draw();
        }));
        m.appendChild(row);
      });
      m.appendChild(btn(t('close'), 'block', close));
    }
    draw();
    ov.appendChild(m);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
  }
  $('trashBtn').addEventListener('click', openTrash);

  /* undo a restore: the previous data was kept on the phone */
  $('prerestoreBtn').addEventListener('click', function () {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(PREREST_KEY) || 'null'); } catch (e) { /* ignore */ }
    if (!raw || !Array.isArray(raw.books)) { toast(t('restore_fail')); return; }
    if (!window.confirm(t('prerestore_confirm'))) return;
    var next = L.sanitizeState(raw, { keepPin: false });
    next.settings.pinHash = state.settings.pinHash;
    next.settings.pinSalt = state.settings.pinSalt;
    state = next;
    ui.projectId = '';
    try { localStorage.removeItem(PREREST_KEY); } catch (e) { /* ignore */ }
    save(); renderAll();
    toast(t('restored'));
  });

  $('restoreBtn').addEventListener('click', function () { $('restoreFile').click(); });

  $('restoreFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    var input = this;
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { toast(t('restore_fail')); input.value = ''; };
    reader.onload = function () {
      input.value = '';
      var text = String(reader.result || '');
      try {
        if (/^\s*\{/.test(text.replace(/^﻿/, ''))) {
          var parsed = JSON.parse(text);
          if (parsed && parsed.cashbookPhotos) { restorePhotos(parsed); return; }
          if (!parsed || !Array.isArray(parsed.books)) throw new Error('not a backup');
          if (!window.confirm(t('restore_confirm'))) return;
          try { localStorage.setItem(PREREST_KEY, JSON.stringify(state)); } catch (e2) { /* too big: restore still works */ }
          var next = L.sanitizeState(parsed, { keepPin: false });
          next.settings.pinHash = state.settings.pinHash;
          next.settings.pinSalt = state.settings.pinSalt;
          state = next;
          ui.projectId = '';
          ui.month = cal().monthKey(L.todayStr());
          save();
          renderAll();
          toast(t('restored'));
          if (parsed.photos && typeof parsed.photos === 'object') putPhotos(parsed).then(function () { renderAll(); });
        } else {
          var res = L.entriesFromCsv(text);
          if (!res.entries.length) throw new Error('no rows');
          if (!window.confirm(t('import_confirm', { n: res.entries.length }))) return;
          if (!canEdit(book())) { toast(t('view_only_note')); return; }
          var entries = book().entries;
          res.entries.forEach(function (e) { e.id = L.newId(); entries.push(e); });
          save();
          renderAll();
          toast(t('restored') + (res.skipped ? ' (' + res.skipped + ' ' + t('skipped') + ')' : ''));
        }
      } catch (e) {
        toast(t('restore_fail'));
      }
    };
    reader.readAsText(file);
  });

  /* ---------- online sync (all books) and backup ---------- */
  (function () {
    var CS = window.CBSync;
    var CLOUD_KEY = 'cashbook.cloud.v1';   // sign-in and connection settings; never part of backups
    var cloud = CS.createCloud({
      fetch: function () { return window.fetch.apply(window, arguments); },
      store: {
        get: function () { try { return JSON.parse(localStorage.getItem(CLOUD_KEY) || '{}') || {}; } catch (e) { return {}; } },
        set: function (o) { try { localStorage.setItem(CLOUD_KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } }
      },
      now: function () { return Date.now(); },
      defaults: window.CB_CLOUD_DEFAULTS || {}
    });
    var info = {};            // online book id -> { meta, members } from the last sync
    var invite = '';          // last invite text shown
    var busy = false, again = false, timer = 0, advanced = false;
    var inviteRole = 'view', status = '', authMode = 'signin', profileOpen = false;
    var draft = { name: '', phone: '', company: '', role: '' };

    function errText(e) {
      var c = (e && e.code) || 'x';
      var m = { network: 'err_network', permission: 'err_permission', EMAIL_EXISTS: 'err_exists', INVALID_LOGIN_CREDENTIALS: 'err_login',
        INVALID_PASSWORD: 'err_login', EMAIL_NOT_FOUND: 'err_login', WEAK_PASSWORD: 'err_weak', INVALID_EMAIL: 'err_email',
        OPERATION_NOT_ALLOWED: 'err_provider', TOO_MANY_ATTEMPTS_TRY_LATER: 'err_many', API_KEY_INVALID: 'err_key',
        'not-configured': 'need_config', 'not-signed-in': 'need_signin' }[c];
      return m ? t(m) : t('err_generic', { c: c });
    }
    function fail(e) { toast(errText(e)); status = errText(e); renderCloud(); }
    function ready() { return cloud.signedIn(); }
    function linkedBooks() { return state.books.filter(function (b) { return !!b.sync; }); }
    function stamp(ms) { return ms ? new Date(ms).toLocaleString() : t('never'); }
    function roleName(r) { return t(r === 'owner' ? 'role_owner' : r === 'edit' ? 'role_edit' : 'view' === r ? 'role_view' : 'role_view'); }
    function roleOf(data) {
      var me = cloud.cfg().uid;
      if (!data || !data.meta) return null;
      return data.meta.owner === me ? 'owner' : (data.members && data.members[me] && data.members[me].role) || null;
    }
    function others(id) { var i = info[id]; return i ? Object.keys(i.members || {}).length : 0; }

    /* icon in front of the book name: cloud = only mine, people = shared, eye = view only, phone = not synced */
    window.__myName = function () { var c = cloud.cfg(); return (c && c.profile && c.profile.name) || ''; };

    window.__bookIcon = function (b) {
      if (!b.sync) return b.nolink ? '📱 ' : '';
      if (b.sync.role === 'view') return '👁 ';
      if (b.sync.role === 'edit') return '👥 ';
      return others(b.sync.id) ? '👥 ' : '☁️ ';
    };

    /* ----- linking books to the online copy ----- */
    function linkBook(b) {
      var id = CS.newBookId();
      return cloud.createBook(id, b.name).then(function () {
        delete b.nolink;
        b.sync = { id: id, role: 'owner', S: {}, U: {}, last: 0, ix: false };
        saveRaw();
      });
    }
    function ensureLinked() {
      var chain = Promise.resolve(false);
      state.books.slice().forEach(function (b) {
        if (b.sync || b.nolink || !b.entries.length) return;       // empty books are linked when they get their first entry
        chain = chain.then(function (ch) { return linkBook(b).then(function () { return true; }); });
      });
      return chain;
    }
    /* books of mine (and ones shared with me) that this phone does not have yet */
    function pullIndex() {
      return cloud.indexGet().then(function (idx) {
        idx = idx || {};
        var have = {}, added = false;
        state.books.forEach(function (b) { if (b.sync) have[b.sync.id] = 1; });
        var chain = Promise.resolve();
        Object.keys(idx).filter(function (id) { return !have[id]; }).forEach(function (id) {
          chain = chain.then(function () {
            return cloud.getBook(id).catch(function (e) { if (e && e.code === 'permission') return null; throw e; }).then(function (data) {
              var role = roleOf(data);
              if (!role) return cloud.indexDelete(id);
              info[id] = { meta: data.meta, members: data.members || {} };
              var nb = { id: 'b' + L.newId(), name: String(data.meta.name || 'Book').slice(0, 40), projectId: '', entries: [],
                         sync: { id: id, role: role, S: {}, U: {}, last: 0, ix: true } };
              state.books.push(nb); added = true;
            });
          });
        });
        return chain.then(function () {
          if (added && state.books.length > 1) {
            // a brand-new phone starts with one empty "Main" book: drop it once real books arrived
            var empties = state.books.filter(function (b) { return !b.sync && !b.nolink && !b.entries.length && !b.projectId; });
            if (empties.length === 1 && state.books.filter(function (b) { return !b.sync; }).length === 1) {
              state.books = state.books.filter(function (b) { return b !== empties[0]; });
              if (!state.books.some(function (b) { return b.id === state.current; })) state.current = state.books[0].id;
            }
          }
          if (added) saveRaw();
          return added;
        });
      });
    }

    /* ----- sync ----- */
    function syncBook(b) {
      var sy = b.sync, startRev = rev;
      return cloud.getBook(sy.id).catch(function (e) {
        if (e && e.code === 'permission') return null;      // removed from the book, or it was deleted online
        throw e;
      }).then(function (data) {
        var role = roleOf(data);
        if (!role) return { gone: true };
        info[sy.id] = { meta: data.meta, members: data.members || {} };
        var r = CS.merge({ local: b.entries, S: sy.S, U: sy.U, remote: data.entries || null, role: role, now: Date.now(), sanitize: L.sanitizeEntry });
        var chain = cloud.pushEntries(sy.id, r.push);
        var nameOnline = data.meta.name, renamed = false, adopt = '';
        if (role === 'owner') {
          if (b.name !== sy.nm && nameOnline !== b.name) { chain = chain.then(function () { return cloud.setBookName(sy.id, b.name); }); renamed = true; }   // renamed on this phone
          else if (b.name === sy.nm && nameOnline && nameOnline !== b.name) adopt = nameOnline;                                                        // renamed on my other phone
        } else if (nameOnline && nameOnline !== b.name) adopt = nameOnline;
        if (!sy.ix || renamed) chain = chain.then(function () { return cloud.indexPut(sy.id, renamed ? b.name : (adopt || b.name), role); });
        return chain.then(function () {
          if (rev !== startRev) { again = true; return { changed: false }; }   // edited meanwhile: merge again next round
          var changed = r.changed || sy.role !== role;
          b.entries = r.entries; sy.S = r.S; sy.U = r.U; sy.role = role; sy.last = Date.now(); sy.ix = true;
          if (adopt) { b.name = adopt; changed = true; }
          sy.nm = b.name;
          return { changed: changed };
        });
      });
    }
    /* ----- shared projects ----- */
    var pinfo = {};           // online project id -> { meta, members }
    var pRoleOpen = 'view', pInvite = '';
    function linkedProjects() { return state.projects.filter(function (p) { return !!p.sync; }); }
    function projectRoleOf(data) {
      var me = cloud.cfg().uid;
      if (!data || !data.meta) return null;
      return data.meta.owner === me ? 'owner' : (data.members && data.members[me] && data.members[me].role) || null;
    }
    function linkProject(p) {
      var id = CS.newProjectId();
      return cloud.createProject(id, p.name).then(function () {
        p.sync = { id: id, role: 'owner', S: {}, U: {}, last: 0, ix: false, fresh: false, st: 0 };
        saveRaw();
      });
    }
    function pullProjectIndex() {
      return cloud.pIndexGet().then(function (idx) {
        idx = idx || {};
        var have = {}, added = false;
        state.projects.forEach(function (p) { if (p.sync) have[p.sync.id] = 1; });
        var chain = Promise.resolve();
        Object.keys(idx).filter(function (id) { return !have[id]; }).forEach(function (id) {
          chain = chain.then(function () {
            return cloud.getProject(id).catch(function (e) { if (e && e.code === 'permission') return null; throw e; }).then(function (data) {
              var role = projectRoleOf(data);
              if (!role) return cloud.pIndexDelete(id);
              pinfo[id] = { meta: data.meta, members: data.members || {} };
              var np = L.sanitizeProject({ id: 'p' + L.newId(), name: String(data.meta.name || 'Project').slice(0, 60), boqLines: 2 }, 1);
              np.sync = { id: id, role: role, S: {}, U: {}, last: 0, ix: true, fresh: true, st: 0 };
              state.projects.push(np); added = true;
            });
          });
        });
        return chain.then(function () { if (added) saveRaw(); return added; });
      });
    }
    function syncProject(p) {
      var sy = p.sync, startRev = rev;
      var recs = sy.fresh ? {} : L.projectRecords(p);
      var dirty = Object.keys(recs).some(function (k) { return sy.S[k] !== CS.rsig(recs[k]); }) ||
        Object.keys(sy.S).some(function (k) { return sy.S[k] !== '-' && !(k in recs); });
      if (sy.fresh) dirty = true;
      return cloud.getProjectStamp(sy.id).catch(function (e) {
        if (e && e.code === 'permission') return null;
        throw e;
      }).then(function (stamp) {
        if (stamp === null) {
          // either no stamp yet (nothing pushed) or no access: ask for the whole project to find out
          if (!sy.ix && !dirty) return { changed: false };
        }
        if (stamp != null && !dirty && sy.ix && stamp === sy.st) return { changed: false };
        return cloud.getProject(sy.id).catch(function (e) { if (e && e.code === 'permission') return null; throw e; }).then(function (data) {
          var role = projectRoleOf(data);
          if (!role) return { gone: true };
          pinfo[sy.id] = { meta: data.meta, members: data.members || {} };
          var r = CS.mergeRecs({ local: recs, S: sy.S, U: sy.U, remote: data.rec || null, canWrite: role !== 'view', now: Date.now() });
          var chain = cloud.pushRecs(sy.id, r.push), pushed = Object.keys(r.push).length > 0;
          if (!sy.ix) chain = chain.then(function () { return cloud.pIndexPut(sy.id, p.name, role); });
          return chain.then(function () {
            if (rev !== startRev) { again = true; return { changed: false }; }
            if (r.changed || sy.fresh) L.applyProjectRecords(p, r.merged);
            var after = L.projectRecords(p), S = {};
            Object.keys(after).forEach(function (k) { S[k] = CS.rsig(after[k]); });
            Object.keys(r.U).forEach(function (k) { if (!(k in after)) S[k] = '-'; });
            var sy2 = p.sync;
            sy2.S = S; sy2.U = r.U; sy2.role = role; sy2.last = Date.now(); sy2.ix = true; sy2.fresh = false;
            sy2.st = pushed ? 0 : (Number(data.stamp) || 0);
            if (r.conflicts) toast(t('proj_conflicts', { n: r.conflicts }));
            return { changed: r.changed || role !== sy.role };
          });
        });
      });
    }
    function syncAll(manual) {
      if (!ready()) { if (manual) toast(t('need_signin')); return Promise.resolve(); }
      if (busy) { again = true; return Promise.resolve(); }
      busy = true; again = false; dot('busy');
      var changed = false, projFail = '';
      return pullIndex().then(function (added) {
        if (added) changed = true;
        return ensureLinked();
      }).then(function (linked) {
        if (linked) changed = true;
        var chain = Promise.resolve();
        linkedBooks().forEach(function (b) {
          chain = chain.then(function () { return syncBook(b); }).then(function (r) {
            if (r.gone) {
              toast(t('sync_gone', { n: b.name }));
              var gid = b.sync.id; delete b.sync; b.nolink = true; changed = true;
              cloud.indexDelete(gid).catch(function () { /* ignore */ });
            } else if (r.changed) changed = true;
          });
        });
        return chain;
      }).then(function () {
        return pullProjectIndex().then(function (added) { if (added) changed = true; });
      }).then(function () {
        var chain = Promise.resolve();
        linkedProjects().forEach(function (p) {
          chain = chain.then(function () { return syncProject(p); }).then(function (r) {
            if (r.gone) {
              toast(t('sync_gone', { n: p.name }));
              var gid = p.sync.id; delete p.sync; changed = true;
              cloud.pIndexDelete(gid).catch(function () { /* ignore */ });
            } else if (r.changed) changed = true;
          }, function (e) { if (e && e.code === 'network') throw e; projFail = errText(e); });
        });
        return chain;
      }).then(function () {
        busy = false; status = projFail || t('synced'); dot(projFail ? 'err' : 'ok');
        saveRaw();
        if (changed) renderAll(); else renderCloud();
        if (manual) toast(t('synced'));
        if (again) { again = false; schedule(300); }
      }, function (e) { busy = false; if (manual) fail(e); else { status = errText(e); renderCloud(); } dot('err'); });
    }
    function schedule(ms) {
      if (!ready()) return;
      clearTimeout(timer);
      timer = setTimeout(function () { syncAll(false); }, ms == null ? 2500 : ms);
    }
    window.__scheduleSync = function () { schedule(); };
    window.__syncNow = function () { return syncAll(true); };

    /* deleting a synced book also removes (owner) or leaves (member) the online copy, otherwise it would come back */
    window.__cloudRelease = function (b) {
      var owner = b.sync.role === 'owner';
      if (!window.confirm(t(owner ? 'confirm_delete_book_online' : 'confirm_leave_delete'))) return Promise.resolve(false);
      if (!ready()) { toast(t('need_signin')); return Promise.resolve(false); }
      var id = b.sync.id, me = cloud.cfg().uid;
      return (owner ? cloud.deleteBook(id) : cloud.removeMember(id, me)).then(function () {
        return cloud.indexDelete(id);
      }).then(function () { return true; }, function (e) { fail(e); return false; });
    };

    /* ----- backup of everything (also projects) ----- */
    function backupText() {
      var copy = JSON.parse(JSON.stringify(state));
      delete copy.settings.pinHash; delete copy.settings.pinSalt;
      copy.books.forEach(function (b) { delete b.sync; delete b.nolink; });
      copy.projects.forEach(function (p) { delete p.sync; });
      return JSON.stringify(copy);
    }
    function backupNow(quiet) {
      return cloud.backupPut(backupText()).then(function () {
        cloud.patchCfg({ lastBackup: Date.now() });
        if (!quiet) toast(t('cloud_backup_done'));
        renderCloud();
      }, function (e) { if (!quiet) fail(e); });
    }
    function restoreNow() {
      cloud.backupGet().then(function (b) {
        if (!b || typeof b.data !== 'string') { toast(t('cloud_no_backup')); return; }
        if (!window.confirm(t('cloud_restore_confirm'))) return;
        var parsed = JSON.parse(b.data);
        var next = L.sanitizeState(parsed, { keepPin: false });
        next.settings.pinHash = state.settings.pinHash;
        next.settings.pinSalt = state.settings.pinSalt;
        next.books.forEach(function (nb) { nb.nolink = true; });      // restored copies stay on this phone until you sync them again
        state = next; ui.projectId = ''; ui.month = cal().monthKey(L.todayStr());
        save(); renderAll(); toast(t('restored'));
      }).catch(fail);
    }

    /* ----- sharing ----- */
    function makeInvite() {
      var b = book();
      cloud.createInvite(b.sync.id, inviteRole).then(function (code) { invite = b.sync.id + '.' + code; renderCloud(); }).catch(fail);
    }
    function joinBook(text) {
      var p = CS.parseShare(text);
      if (!p) { toast(t('bad_code')); return; }
      if (!ready()) { toast(t('need_signin')); return; }
      if (p.bookId.indexOf('sp') === 0) { joinProjectCode(p); return; }
      if (state.books.some(function (b) { return b.sync && b.sync.id === p.bookId; })) { toast(t('already_joined')); return; }
      cloud.join(p.bookId, p.code, p.role).then(function () { return cloud.getBook(p.bookId); }).then(function (data) {
        if (!data || !data.meta) throw { code: 'permission' };
        var nb = { id: 'b' + L.newId(), name: String(data.meta.name || 'Shared').slice(0, 40), projectId: '', entries: [],
                   sync: { id: p.bookId, role: p.role, S: {}, U: {}, last: 0, ix: false } };
        state.books.push(nb); state.current = nb.id;
        save(); toast(t('joined', { n: nb.name }));
        return syncAll(false);
      }).then(function () { renderAll(); }).catch(function (e) { fail(e && e.code ? e : { code: 'permission' }); });
    }
    function joinProjectCode(p) {
      if (state.projects.some(function (x) { return x.sync && x.sync.id === p.bookId; })) { toast(t('already_joined')); return; }
      cloud.joinProject(p.bookId, p.code, p.role).then(function () { return cloud.getProject(p.bookId); }).then(function (data) {
        if (!data || !data.meta) throw { code: 'permission' };
        var np = L.sanitizeProject({ id: 'p' + L.newId(), name: String(data.meta.name || 'Project').slice(0, 60), boqLines: 2 }, 1);
        np.sync = { id: p.bookId, role: p.role, S: {}, U: {}, last: 0, ix: false, fresh: true, st: 0 };
        state.projects.push(np);
        save(); toast(t('joined', { n: np.name }));
        return syncAll(false);
      }).then(function () { renderAll(); }).catch(function (e) { fail(e && e.code ? e : { code: 'permission' }); });
    }
    /* deleting a shared project: the owner removes the online copy, a member just leaves */
    window.__projectRelease = function (p) {
      var owner = p.sync.role === 'owner';
      if (!window.confirm(t(owner ? 'confirm_delete_proj_online' : 'confirm_leave_proj_delete'))) return Promise.resolve(false);
      if (!ready()) { toast(t('need_signin')); return Promise.resolve(false); }
      var id = p.sync.id, me = cloud.cfg().uid;
      return (owner ? cloud.deleteProject(id) : cloud.removePMember(id, me, false)).then(function () { return cloud.pIndexDelete(id); }).then(function () { return true; }, function (e) { fail(e); return false; });
    };
    function leaveProject(p) {
      if (!window.confirm(t('confirm_leave_proj'))) return;
      var id = p.sync.id, me = cloud.cfg().uid;
      cloud.removePMember(id, me, false).then(function () { return cloud.pIndexDelete(id); }).then(function () {
        delete p.sync; save(); renderAll();
      }, fail);
    }
    window.__projIcon = function (p) {
      if (!p.sync) return '';
      if (p.sync.role === 'view') return '👁 ';
      if (p.sync.role === 'edit') return '👥 ';
      var i = pinfo[p.sync.id];
      return i && Object.keys(i.members || {}).length ? '👥 ' : '☁️ ';
    };
    /* the "share this project" panel shown on the project overview */
    window.__projectSharePanel = function (p) {
      var P = panel(t('proj_share_title'));
      P.setAttribute('data-ro', '1');
      if (!ready()) { P.appendChild(el('p', 'muted small', t('proj_share_signin'))); return P; }
      if (!p.sync) {
        P.appendChild(el('p', 'muted small', t('proj_share_intro')));
        P.appendChild(btn(t('proj_share_btn'), 'block', function () {
          linkProject(p).then(function () { return syncAll(true); }).then(function () { renderAll(); }, fail);
        }));
        return P;
      }
      var sy = p.sync, inf = pinfo[sy.id];
      P.appendChild(el('p', 'muted small', t('sharing_on', { r: roleName(sy.role) }) + ' · ' + t('last_sync', { t: stamp(sy.last) })));
      P.appendChild(btn(t('sync_now'), 'block', function () { syncAll(true); }));
      if (sy.role === 'view') {
        P.appendChild(el('p', 'muted small', t('proj_view_only')));
        P.appendChild(btn(t('leave_proj'), 'block danger', function () { leaveProject(p); }));
      } else if (sy.role === 'edit') {
        P.appendChild(el('p', 'muted small', t('proj_edit_note')));
        P.appendChild(btn(t('leave_proj'), 'block danger', function () { leaveProject(p); }));
      }
      if (sy.role === 'owner') {
        P.appendChild(el('p', 'muted small', t('proj_edit_note')));
        var ir = el('label', 'field'); ir.appendChild(el('span', null, t('invite_as')));
        var rs = document.createElement('select');
        rs.appendChild(option('view', t('role_view'))); rs.appendChild(option('edit', t('role_edit')));
        rs.value = pRoleOpen; rs.addEventListener('change', function () { pRoleOpen = this.value; });
        ir.appendChild(rs); P.appendChild(ir);
        function rerender() { renderProjects(); }
        P.appendChild(btn(t('make_invite'), 'block', function () {
          cloud.createPInvite(sy.id, pRoleOpen).then(function (code) { pInvite = sy.id + '.' + code; rerender(); }).catch(fail);
        }));
        if (pInvite && pInvite.indexOf(sy.id) === 0) {
          P.appendChild(el('p', 'muted small', t('invite_text')));
          var box = document.createElement('input'); box.type = 'text'; box.readOnly = true; box.value = pInvite; box.className = 'code';
          P.appendChild(box);
          P.appendChild(btn(t('copy'), 'block', function () {
            box.select();
            try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(pInvite); else document.execCommand('copy'); toast(t('copied')); } catch (e) { /* by hand */ }
          }));
        }
        P.appendChild(btn(t('revoke_invites'), 'block', function () {
          if (!window.confirm(t('cf_revoke', { name: p.name }))) return;
          cloud.revokePInvites(sy.id).then(function () { pInvite = ''; toast(t('invites_revoked')); rerender(); }, fail);
        }));
        if (inf) {
          var uids = Object.keys(inf.members || {});
          if (uids.length) P.appendChild(el('h3', null, t('members')));
          uids.forEach(function (uid) {
            var m = inf.members[uid], r2 = el('div', 'member');
            r2.appendChild(el('span', 'mname', m.name ? m.name + ' (' + (m.email || '') + ')' : (m.email || uid)));
            var acts = el('div', 'acts');
            var sel = document.createElement('select');
            sel.appendChild(option('view', t('role_view'))); sel.appendChild(option('edit', t('role_edit'))); sel.value = m.role;
            sel.addEventListener('change', function () { cloud.setPRole(sy.id, uid, this.value).then(function () { m.role = sel.value; }, fail); });
            acts.appendChild(sel);
            acts.appendChild(btn(t('remove'), 'danger', function () {
              if (!window.confirm(t('cf_remove_member', { name: m.name || m.email || uid, book: p.name }))) return;
              cloud.removePMember(sy.id, uid, true).then(function () { delete inf.members[uid]; rerender(); }, fail);
            }));
            r2.appendChild(acts);
            P.appendChild(r2);
          });
        }
      }
      return P;
    };

    function leaveBook(b) {
      if (!window.confirm(t('confirm_leave'))) return;
      var id = b.sync.id, me = cloud.cfg().uid;
      cloud.removeMember(id, me).then(function () { return cloud.indexDelete(id); }).then(function () {
        delete b.sync; b.nolink = true; save(); renderAll();
      }, fail);
    }

    /* ----- panel ----- */
    function field(label, type, value, id, ph) {
      var l = el('label', 'field'); l.appendChild(el('span', null, label));
      var i = document.createElement('input'); i.type = type; i.id = id; i.value = value || ''; i.autocomplete = 'off';
      i.setAttribute('autocapitalize', type === 'text' && /Name|Co|Job/.test(id) ? 'words' : 'off'); i.spellcheck = false;
      if (ph) i.placeholder = ph;
      l.appendChild(i); return l;
    }
    function val(id) { var e = $(id); return e ? e.value.trim() : ''; }
    function profileFields(P, p) {
      P.appendChild(field(t('full_name'), 'text', p.name, 'pName'));
      P.appendChild(field(t('phone'), 'tel', p.phone, 'pPhone'));
      P.appendChild(field(t('company'), 'text', p.company, 'pCompany'));
      P.appendChild(field(t('job_role'), 'text', p.role, 'pRole'));
    }
    function readProfile() { return { name: val('pName'), phone: val('pPhone'), company: val('pCompany'), role: val('pRole') }; }

    function submitAuth() {
      var c = cloud.cfg();
      var db = CS.cleanDbUrl($('cDb') ? val('cDb') : c.dbUrl);
      if (!db) { toast(t('bad_db_url')); return; }
      var key = ($('cKey') ? val('cKey') : c.apiKey || '').replace(/["'\s,]/g, '');
      var mail = val('cMail'), pw = $('cPass').value;
      if (!key || !mail || !pw) { toast(t('need_config')); return; }
      var prof = null;
      if (authMode === 'signup') {
        prof = readProfile(); draft = prof;
        if (!prof.name) { toast(t('need_name')); $('pName').focus(); return; }
        if (pw !== $('cPass2').value) { toast(t('pw_mismatch')); return; }
      }
      cloud.patchCfg({ dbUrl: db, apiKey: key, email: mail });
      var p = authMode === 'signup'
        ? cloud.signUp(mail, pw).then(function () { return cloud.profilePut(prof); })
        : cloud.signIn(mail, pw).then(function () { return cloud.profileGet().catch(function () { return null; }); });
      p.then(function () { status = ''; renderAll(); syncAll(false); backupNow(true); }, fail);
    }

    function renderCloud() {
      var P = $('cloudPanel');
      if (!P) return;
      if (P.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;   // do not disturb typing
      var c = cloud.cfg(), b = book();
      P.textContent = '';
      P.appendChild(el('h2', null, '☁️ ' + t('cloud_title')));
      P.appendChild(el('p', 'muted small', t('cloud_intro')));

      if (!ready()) {
        var D = window.CB_CLOUD_DEFAULTS || {};
        if (window.AndroidBridge && window.AndroidBridge.googleSignIn && D.googleClientId) {
          var gb = btn('', 'block google', function () { window.AndroidBridge.googleSignIn(D.googleClientId); });
          gb.appendChild(el('b', 'gmark', 'G')); gb.appendChild(document.createTextNode(' ' + t('continue_google')));
          P.appendChild(gb);
          P.appendChild(el('p', 'muted small center', t('or_email')));
        }
        var tabs = el('div', 'seg');
        [['signin', t('sign_in')], ['signup', t('sign_up')]].forEach(function (x) {
          var bt = btn(x[1], authMode === x[0] ? 'on' : '', function () {
            if ($('cMail')) cloud.patchCfg({ email: val('cMail') });
            if ($('pName')) draft = readProfile();
            authMode = x[0]; renderCloud();
          });
          tabs.appendChild(bt);
        });
        P.appendChild(tabs);
        P.appendChild(field(t('email'), 'email', c.email, 'cMail'));
        P.appendChild(field(t('password'), 'password', '', 'cPass'));
        if (authMode === 'signup') {
          P.appendChild(field(t('confirm_password'), 'password', '', 'cPass2'));
          P.appendChild(el('p', 'muted small', t('about_you')));
          profileFields(P, draft);
        }
        P.appendChild(btn(authMode === 'signup' ? t('sign_up') : t('sign_in'), 'primary block', submitAuth));
        P.appendChild(btn(t('advanced'), 'block', function () { advanced = !advanced; renderCloud(); }));
        if (advanced) {
          P.appendChild(field(t('db_url'), 'url', c.dbUrl, 'cDb'));
          P.appendChild(field(t('api_key'), 'text', c.apiKey, 'cKey'));
        }
      } else {
        var pr = c.profile || {};
        var who = el('div', 'who');
        who.appendChild(el('div', 'avatar', (pr.name || c.email || '?').trim().charAt(0).toUpperCase()));
        var wt = el('div', 'whotext');
        wt.appendChild(el('strong', null, pr.name || c.email || ''));
        wt.appendChild(el('span', 'muted small', [pr.role, pr.company].filter(Boolean).join(' · ') || c.email || ''));
        who.appendChild(wt);
        P.appendChild(who);
        if (!pr.name) { profileOpen = true; P.appendChild(el('p', 'muted small', t('complete_profile'))); }
        P.appendChild(btn(t('my_profile'), 'block', function () { profileOpen = !profileOpen; renderCloud(); }));
        if (profileOpen) {
          profileFields(P, pr.name ? pr : draft);
          P.appendChild(btn(t('save'), 'primary block', function () {
            var p2 = readProfile();
            if (!p2.name) { toast(t('need_name')); return; }
            cloud.profilePut(p2).then(function () { toast(t('profile_saved')); profileOpen = false; renderCloud(); }, fail);
          }));
        }

        P.appendChild(el('p', 'muted small', t('all_books_synced', { n: linkedBooks().length })));
        P.appendChild(btn(t('sync_now'), 'primary block', function () { syncAll(true); }));
        P.appendChild(btn(t('cloud_backup_now'), 'block', function () { backupNow(false); }));
        P.appendChild(btn(t('cloud_restore'), 'block', restoreNow));
        P.appendChild(el('p', 'muted small', t('cloud_last_backup', { t: stamp(c.lastBackup) })));

        P.appendChild(el('h2', null, window.__bookIcon(b) + b.name));
        if (!b.sync) {
          P.appendChild(el('p', 'muted small', t(b.nolink ? 'book_local_only' : 'book_syncs_later')));
          P.appendChild(btn(t('sync_this_book'), 'block', function () {
            linkBook(b).then(function () { return syncAll(true); }).then(function () { renderAll(); }, fail);
          }));
        } else {
          var sy = b.sync, inf = info[sy.id];
          P.appendChild(el('p', 'muted small', t('sharing_on', { r: roleName(sy.role) }) + ' · ' + t('last_sync', { t: stamp(sy.last) })));
          if (sy.role === 'view') P.appendChild(el('p', 'muted small', t('view_only_note')));
          if (sy.role === 'owner') {
            P.appendChild(el('h2', null, t('share_with')));
            var ir = el('label', 'field'); ir.appendChild(el('span', null, t('invite_as')));
            var rs = document.createElement('select');
            rs.appendChild(option('view', t('role_view'))); rs.appendChild(option('edit', t('role_edit')));
            rs.value = inviteRole; rs.addEventListener('change', function () { inviteRole = this.value; });
            ir.appendChild(rs); P.appendChild(ir);
            P.appendChild(btn(t('make_invite'), 'block', makeInvite));
            if (invite) {
              P.appendChild(el('p', 'muted small', t('invite_text')));
              var box = document.createElement('input'); box.type = 'text'; box.readOnly = true; box.value = invite; box.className = 'code'; box.id = 'inviteBox';
              P.appendChild(box);
              P.appendChild(btn(t('copy'), 'block', function () {
                box.select();
                try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(invite); else document.execCommand('copy'); toast(t('copied')); } catch (e) { /* user can copy by hand */ }
              }));
            }
            P.appendChild(btn(t('revoke_invites'), 'block', function () {
              if (!window.confirm(t('cf_revoke', { name: b.name }))) return;
              cloud.revokeInvites(sy.id).then(function () { invite = ''; toast(t('invites_revoked')); renderCloud(); }, fail);
            }));
            if (inf) {
              var uids = Object.keys(inf.members);
              if (uids.length) P.appendChild(el('h2', null, t('members')));
              uids.forEach(function (uid) {
                var m = inf.members[uid], r2 = el('div', 'member');
                r2.appendChild(el('span', 'mname', m.name ? m.name + ' (' + (m.email || '') + ')' : (m.email || uid)));
                var acts = el('div', 'acts');
                var sel = document.createElement('select');
                sel.appendChild(option('view', t('role_view'))); sel.appendChild(option('edit', t('role_edit'))); sel.value = m.role;
                sel.addEventListener('change', function () { cloud.setRole(sy.id, uid, this.value).then(function () { m.role = sel.value; }, fail); });
                acts.appendChild(sel);
                acts.appendChild(btn(t('remove'), 'danger', function () {
                  if (!window.confirm(t('cf_remove_member', { name: m.name || m.email || uid, book: b.name }))) return;
                  cloud.removeMember(sy.id, uid).then(function () { delete inf.members[uid]; renderCloud(); renderBooks(); }, fail);
                }));
                r2.appendChild(acts);
                P.appendChild(r2);
              });
            }
          } else {
            P.appendChild(btn(t('leave_book'), 'block danger', function () { leaveBook(b); }));
          }
        }

        P.appendChild(el('h2', null, t('join_title')));
        P.appendChild(field(t('join_ph'), 'text', '', 'cJoin'));
        P.appendChild(btn(t('join'), 'block primary', function () { joinBook(val('cJoin')); }));
        if (status) P.appendChild(el('p', 'muted small', status));
        P.appendChild(btn(t('sign_out'), 'block', function () { if (!window.confirm(t('cf_signout'))) return; cloud.signOut(); invite = ''; status = ''; renderAll(); }));
      }

    }
    /* result of the Android Google account chooser */
    window.__onGoogle = function (token, err) {
      if (err || !token) {
        if (/Cancellation/.test(err || '')) return;
        toast(/NoCredential/.test(err || '') ? t('google_no_account') : t('google_failed', { c: err || '?' }));
        return;
      }
      cloud.signInGoogle(token).then(function (b) {
        return cloud.profileGet().catch(function () { return null; }).then(function (p) {
          if (!p) { draft = { name: b.displayName || '', phone: '', company: '', role: '' }; profileOpen = true; }
          status = ''; renderAll(); syncAll(false); backupNow(true);
        });
      }, fail);
    };
    window.__renderCloud = function () { renderCloud(); dot(); };

    /* small status light in the header: green = synced, spinning = working, red = last attempt failed */
    function dot(cls) {
      var d = $('syncDot');
      if (!d) return;
      d.hidden = !ready();
      if (cls) { d.className = 'sync ' + cls; d.setAttribute('title', cls === 'err' ? status : t('synced')); }
      else if (!d.className || d.className === 'sync') d.className = 'sync ok';
    }
    $('syncDot').addEventListener('click', function () { syncAll(true); });

    /* ----- start: sync when the app opens / returns, then every 30 s ----- */
    function auto() { if (!document.hidden) syncAll(false); }
    document.addEventListener('visibilitychange', auto);
    setInterval(auto, 30000);
    setTimeout(function () {
      auto();
      var c = cloud.cfg();
      if (ready() && (!c.lastBackup || Date.now() - c.lastBackup > 86400000)) backupNow(true);
    }, 1500);
  })();

  /* ---------- the list of books (home of the Entries tab) ---------- */
  function lastEntryDate(b) {
    var d = '';
    b.entries.forEach(function (e) { if (e.date > d) d = e.date; });
    return d;
  }
  function applyEntriesScreen() {
    $('booksHome').hidden = ui.bookOpen;
    $('bookScreen').hidden = !ui.bookOpen;
    document.body.classList.toggle('books-home', !ui.bookOpen);
    if (ui.bookOpen) {
      var b = book(), bz = b.businessId ? byId(state.businesses, b.businessId) : null;
      $('bookTitle').textContent = b.name;
      $('bookSub').textContent = (window.__bookIcon ? window.__bookIcon(b) : '') + (bz ? bz.name : '');
    }
  }

  /* Calculator: type or tap an expression such as 12*350+1500; "Use result" puts the answer in the field. */
  function openCalculator(initial, onUse) {
    var ov = el('div', 'overlay open sheetov'), m = el('div', 'modal calcmodal');
    var expr = initial && isFinite(parseFloat(initial)) ? String(parseFloat(initial)) : '';
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    m.appendChild(el('h2', null, t('calculator')));
    var disp = document.createElement('input');
    disp.type = 'text'; disp.className = 'calcdisp'; disp.inputMode = 'none'; disp.value = expr; disp.setAttribute('autocomplete', 'off');
    var res = el('div', 'calcres');
    function show() {
      var v = L.calcEval(expr);
      res.textContent = expr ? (isNaN(v) ? '…' : '= ' + money(v).replace(/^[^\d-]*/, '')) : '';
      res.className = 'calcres' + (isNaN(v) && expr ? ' muted' : '');
    }
    disp.addEventListener('input', function () { expr = disp.value; show(); });
    m.appendChild(disp); m.appendChild(res);
    var keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '%', '⌫'];
    var grid = el('div', 'calcgrid');
    keys.forEach(function (k) {
      grid.appendChild(btn(k, 'calckey' + ('÷×−+'.indexOf(k) >= 0 ? ' op' : ''), function () {
        if (k === 'C') expr = '';
        else if (k === '⌫') expr = expr.slice(0, -1);
        else expr += k;
        disp.value = expr; show();
      }));
    });
    m.appendChild(grid);
    var eq = btn('=', 'block', function () {
      var v = L.calcEval(expr);
      if (!isNaN(v)) { expr = String(v); disp.value = expr; show(); }
    });
    m.appendChild(eq);
    m.appendChild(btn(t('use_result'), 'block primary', function () {
      var v = L.calcEval(expr);
      if (isNaN(v)) { toast(t('calc_bad')); return; }
      close(); onUse(String(v));
    }));
    m.appendChild(btn(t('cancel'), 'block', close));
    ov.appendChild(m);
    document.body.appendChild(ov);
    show();
  }
  $('calcBtn').addEventListener('click', function () { openCalculator($('amount').value, function (v) { $('amount').value = v; }); });

  function actionSheet(title, items) {
    var ov = el('div', 'overlay open sheetov'), m = el('div', 'modal');
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    m.appendChild(el('h2', null, title));
    items.forEach(function (it) {
      m.appendChild(btn(it.label, 'block' + (it.danger ? ' danger' : ''), function () { close(); it.run(); }));
    });
    m.appendChild(btn(t('cancel'), 'block', close));
    ov.appendChild(m);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
  }

  function openBookById(id) {
    state.current = id;
    ui.bookOpen = true;
    save();
    renderAll();
    window.scrollTo(0, 0);
  }

  function bookMenu(b) {
    var items = [
      { label: t('m_rename'), run: function () {
        openForm({ title: t('m_rename'), fields: [{ key: 'name', label: t('book_name'), type: 'text', value: b.name, required: true, max: 40 }],
          onSubmit: function (v) { b.name = v.name.slice(0, 40); save(); renderAll(); return null; } });
      } },
      { label: t('m_export'), run: function () {
        saveFile('cashbook-' + safeName(b.name) + '-' + L.todayStr() + '.csv', 'text/csv', L.buildCsv(b.entries));
      } },
      { label: t('m_share'), run: function () {
        state.current = b.id; ui.bookOpen = false; save(); showView('settings'); renderAll();
        var cp = $('cloudPanel'); if (cp && cp.scrollIntoView) cp.scrollIntoView();
      } }
    ];
    if (state.projects.length) items.push({ label: t('m_project'), run: function () {
      var opts = [{ value: '', label: t('no_project') }].concat(state.projects.map(function (p) { return { value: p.id, label: p.name }; }));
      openForm({ title: t('m_project'), fields: [{ key: 'p', label: t('project'), type: 'select', options: opts, value: b.projectId || '' }],
        onSubmit: function (v) { b.projectId = v.p; save(); renderAll(); return null; } });
    } });
    if (state.businesses.length) items.push({ label: t('m_business'), run: function () {
      var opts = [{ value: '', label: t('no_business') }].concat(state.businesses.map(function (x) { return { value: x.id, label: x.name }; }));
      openForm({ title: t('m_business'), fields: [{ key: 'b', label: t('business'), type: 'select', options: opts, value: b.businessId || '' }],
        onSubmit: function (v) { b.businessId = v.b; save(); renderAll(); return null; } });
    } });
    items.push({ label: t('m_delete'), danger: true, run: function () {
      if (state.books.length < 2) { toast(t('last_book')); return; }
      function proceed() {
        dropPaymentsOfBook(b.id);
        trashPut('book', b.name, b, {}, entryPhotoIds(b.entries));
        state.books = state.books.filter(function (x) { return x.id !== b.id; });
        if (state.current === b.id) state.current = state.books[0].id;
        save(); renderAll(); undoToast();
      }
      if (b.sync && window.__cloudRelease) { window.__cloudRelease(b).then(function (ok) { if (ok) proceed(); }); return; }
      if (window.confirm(t('confirm_delete_book'))) proceed();
    } });
    actionSheet(b.name, items);
  }

  function renderBookList() {
    var bz = state.business ? byId(state.businesses, state.business) : null;
    $('bizName').textContent = bz ? bz.name : (state.businesses.length ? t('all_businesses') : t('my_books'));
    var sortSel = $('bookSort');
    if (!sortSel.options.length) {
      [['updated', t('sort_updated')], ['name', t('sort_name')], ['balance', t('sort_balance')]].forEach(function (o) { sortSel.appendChild(option(o[0], o[1])); });
    }
    sortSel.value = ui.bookSort;
    var q = ui.bookQ.trim().toLowerCase();
    var rows = visibleBooks().filter(function (b) { return !q || b.name.toLowerCase().indexOf(q) >= 0; }).map(function (b) {
      return { b: b, bal: L.totals(b.entries).balance, upd: b.updated || lastEntryDate(b) };
    });
    rows.sort(function (x, y) {
      if (ui.bookSort === 'name') return x.b.name.localeCompare(y.b.name);
      if (ui.bookSort === 'balance') return y.bal - x.bal;
      return (y.upd || '').localeCompare(x.upd || '') || x.b.name.localeCompare(y.b.name);
    });
    var ul = $('bookList');
    ul.textContent = '';
    rows.forEach(function (r) {
      var li = el('li', 'bookrow');
      li.tabIndex = 0;
      li.appendChild(el('span', 'bicon', '📘'));
      var mid = el('div', 'bmid');
      mid.appendChild(el('b', 'bname', (window.__bookIcon ? window.__bookIcon(r.b) : '') + r.b.name));
      mid.appendChild(el('small', 'bupd', r.upd ? t('updated_on') + ' ' + fmtDate(r.upd) : t('no_entries_short')));
      li.appendChild(mid);
      li.appendChild(el('span', 'bbal ' + (r.bal < 0 ? 'neg' : 'pos'), money(r.bal)));
      var mb = btn('⋮', 'bmenu', function (ev) { ev.stopPropagation(); bookMenu(r.b); });
      mb.setAttribute('aria-label', t('books'));
      li.appendChild(mb);
      li.addEventListener('click', function () { openBookById(r.b.id); });
      li.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') openBookById(r.b.id); });
      ul.appendChild(li);
    });
    $('noBooks').hidden = rows.length > 0;
  }

  $('backBooks').addEventListener('click', function () { ui.bookOpen = false; renderAll(); window.scrollTo(0, 0); });
  $('bookSort').addEventListener('change', function () { ui.bookSort = this.value; renderBookList(); });
  $('bookSearchBtn').addEventListener('click', function () {
    var inp = $('bookSearch');
    inp.hidden = !inp.hidden;
    if (inp.hidden) { inp.value = ''; ui.bookQ = ''; renderBookList(); } else inp.focus();
  });
  $('bookSearch').addEventListener('input', function () { ui.bookQ = this.value; renderBookList(); });
  $('addBookCard').addEventListener('click', function () {
    var fields = [{ key: 'name', label: t('book_name'), type: 'text', value: '', required: true, max: 40 }];
    if (state.projects.length) fields.push({ key: 'p', label: t('project'), type: 'select', options: [{ value: '', label: t('no_project') }].concat(state.projects.map(function (p) { return { value: p.id, label: p.name }; })), value: '' });
    openForm({ title: t('add_new_book'), fields: fields, onSubmit: function (v) {
      var id = 'b' + L.newId();
      state.books.push({ id: id, name: v.name.slice(0, 40), projectId: v.p || '', businessId: state.business || '', updated: L.todayStr(), entries: [] });
      state.current = id; ui.bookOpen = true;
      save(); renderAll();
      return null;
    } });
  });
  $('bizBar').addEventListener('click', function () {
    if (!state.businesses.length) { editBusiness(null); return; }
    var items = [{ label: t('all_businesses'), run: function () { state.business = ''; save(); renderAll(); } }];
    state.businesses.forEach(function (x) { items.push({ label: x.name, run: function () { state.business = x.id; save(); renderAll(); } }); });
    items.push({ label: '+ ' + t('add_business'), run: function () { editBusiness(null); } });
    actionSheet(t('switch_business'), items);
  });
  $('staffBtn').addEventListener('click', function () {
    var bz = state.business ? byId(state.businesses, state.business) : null;
    if (!bz) { if (!state.businesses.length) editBusiness(null); else toast(t('pick_business_first')); return; }
    editStaff(bz, null);
  });

  /* ---------- first-time guide ---------- */
  function showGuide() {
    var ov = el('div', 'overlay open sheetov'), m = el('div', 'modal');
    function close() {
      try { localStorage.setItem('cashbook.guide.v1', '1'); } catch (e) { /* ignore */ }
      if (ov.parentNode) ov.parentNode.removeChild(ov);
    }
    m.appendChild(el('h2', null, t('guide_title')));
    [1, 2, 3, 4].forEach(function (i) { m.appendChild(el('p', null, t('guide_' + i))); });
    m.appendChild(btn(t('guide_ok'), 'primary block', close));
    ov.appendChild(m);
    document.body.appendChild(ov);
  }
  (function () {
    var seen = false;
    try { seen = !!localStorage.getItem('cashbook.guide.v1'); } catch (e) { seen = true; }
    var empty = !state.projects.length && state.books.every(function (b) { return !b.entries.length; });
    if (!seen && empty && !navigator.webdriver) setTimeout(showGuide, 400);
  })();
  var gb = document.createElement('button');
  gb.type = 'button'; gb.className = 'block'; gb.textContent = t('guide_show');
  gb.addEventListener('click', function () { $('closeAbout').click(); showGuide(); });
  $('aboutBackup').parentNode.insertBefore(gb, $('aboutBackup'));

  /* ---------- start ---------- */
  touchBooks();                      // remember how each book looks now, so only later changes count as an update
  showView('entries');
  purgeExpiredTrashPhotos();
  renderAll();
  showLock();
})();
