(function () {
  'use strict';

  var L = window.CBLogic;
  var STORAGE_KEY = 'cashbook.data.v2'; // same key as 1.1: data is upgraded in place
  var OLD_KEY = 'cashbook.entries.v1';
  var SECTIONS = ['overview', 'boq', 'budget', 'bills', 'client', 'labour', 'books'];

  var $ = function (id) { return document.getElementById(id); };
  var CAL = window.CBCal;

  /* ---------- state ---------- */
  var state = loadState();
  var ui = {
    view: 'entries',
    q: '', type: 'all', from: '', to: '',
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

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }

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
  }

  /* ---------- small helpers ---------- */
  var toastTimer = null;
  function toast(msg) {
    var e = $('toast');
    e.textContent = msg;
    e.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { e.classList.remove('show'); }, 2600);
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
    return ids.filter(function (id, i) { return ids.indexOf(id) === i; });
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
      if (st.ids.length < 12) strip.appendChild(btn('📷 ' + t('add_photo'), 'addphoto', function () { input.click(); }));
      container.appendChild(strip);
      container.appendChild(input);
    }

    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || [], 0, 12 - st.ids.length);
      input.value = '';
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
    });

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
      calc: L.certCalc(p, cert), seq: L.certCumulative(p, cert.id), boq: p.boq.length ? p.boq : null, date: L.todayStr(),
      fmt: function (d) { return fmtDate(d, true); },
      itemAmount: L.itemAmount, itemEarned: L.itemEarned, isHeading: L.isHeading
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
    var inputs = {};
    (opts.fields || []).forEach(function (f) {
      if (f.type === 'note') { body.appendChild(el('p', 'note', f.text)); return; }
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
      inputs[f.key] = { input: input, field: f };
      label.appendChild(input);
      if (f.type === 'date') makeDate(input, !f.required);
      body.appendChild(label);
    });
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
          if (f.required && !(n > 0)) missing = true;
          values[k] = isFinite(n) ? n : 0;
        } else {
          v = v.trim();
          if (f.required && !v) missing = true;
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
  function renderBooks() {
    var sel = $('bookSelect');
    sel.textContent = '';
    state.books.forEach(function (b) { sel.appendChild(option(b.id, b.name)); });
    sel.value = book().id;
  }

  function renderEntries() {
    var b = book();
    var tot = L.totals(b.entries);
    $('balance').textContent = money(tot.balance);
    $('totalIn').textContent = money(tot.cashIn);
    $('totalOut').textContent = money(tot.cashOut);

    var filters = { q: ui.q, type: ui.type, from: ui.from, to: ui.to };
    var shown = L.filterEntries(b.entries, filters).sort(function (a, c) {
      return a.date < c.date ? 1 : a.date > c.date ? -1 : c.id - a.id;
    });

    var active = !!(ui.q || ui.type !== 'all' || ui.from || ui.to);
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
    shown.forEach(function (e) {
      var li = el('li', 'item');
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      var meta = el('div', 'meta');
      meta.appendChild(el('div', 'title', e.category || (e.type === 'in' ? t('cash_in') : t('cash_out'))));
      var bits = [fmtDate(e.date)];
      if (e.code) bits.push(codeLabel(e.code));
      if (e.party) bits.push(e.party);
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
    $('mIn').textContent = money(m.cashIn);
    $('mOut').textContent = money(m.cashOut);
    $('mNet').textContent = money(m.balance);
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
    state.projects.forEach(function (p) {
      var s = L.projectSummary(state, p.id);
      var card = el('div', 'pcard');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.appendChild(el('h3', null, p.name));
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
      var open = function () { ui.projectId = p.id; ui.section = 'overview'; renderProjects(); window.scrollTo(0, 0); };
      card.addEventListener('click', open);
      card.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
      list.appendChild(card);
    });
  }

  function budgetBar(actual, budget) {
    var bar = el('div', 'bar ' + (actual > budget ? 'out' : 'in'));
    var fill = document.createElement('i');
    fill.style.width = Math.min(100, Math.max(2, Math.round(actual / (budget || 1) * 100))) + '%';
    bar.appendChild(fill);
    return bar;
  }

  function renderProjectDetail(root) {
    var p = currentProject();
    root.textContent = '';
    root.appendChild(btn(t('back'), 'backlink', function () { ui.projectId = ''; renderProjects(); }));
    root.appendChild(el('h2', null, p.name));
    var seg = el('div', 'seg');
    SECTIONS.forEach(function (sec) {
      var label = sec === 'books' ? t('books_sec') : t(sec);
      var b = btn(label, ui.section === sec ? 'active' : '', function () { ui.section = sec; renderProjects(); });
      seg.appendChild(b);
    });
    root.appendChild(seg);
    var body = el('div', 'stack');
    root.appendChild(body);
    ({ overview: secOverview, boq: secBoq, budget: secBudget, bills: secBills, client: secClient, labour: secLabour, books: secBooks })[ui.section](body, p);
  }

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
    body.appendChild(btn(t('delete'), 'danger block', function () {
      if (!window.confirm(t('confirm_delete_project'))) return;
      state.books.forEach(function (b) { if (b.projectId === p.id) b.projectId = ''; });
      deletePhotoIds(p.photos);
      p.bills.forEach(function (b) { deletePhotoIds(b.photos); });
      state.projects = state.projects.filter(function (x) { return x.id !== p.id; });
      ui.projectId = '';
      save(); renderAll();
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

    body.appendChild(btn(t('cert_from_progress'), 'primary block', function () {
      var proposed = L.proposeCertGross(p);
      if (s.total <= 0 || proposed <= 0) { toast(t('nothing_to_certify')); return; }
      ui.section = 'client';
      renderProjects();
      editCert(p, null, { gross: proposed });
    }));
    var row = el('div', 'btnrow');
    row.appendChild(btn(t('add_item'), '', function () { editBoqItem(p, null); }));
    row.appendChild(btn(t('import_boq'), '', function () { boqTarget = p; $('boqFile').click(); }));
    if (p.boq.length) row.appendChild(btn(t('export_boq'), '', function () {
      saveFile('cashbook-boq-' + safeName(p.name) + '-' + L.todayStr() + '.csv', 'text/csv', L.boqCsv(p));
    }));
    if (differs) row.appendChild(btn(t('set_contract_from_boq'), '', function () { p.contractSum = s.total; save(); renderAll(); }));
    body.appendChild(row);
    body.appendChild(el('p', 'note', t('boq_csv_note')));

    if (!p.boq.length) { body.appendChild(el('p', 'empty', t('no_items'))); return; }
    var list = panel(null);
    p.boq.forEach(function (it) {
      var label = (it.no ? it.no + '  ' : '') + it.desc;
      if (L.isHeading(it)) {
        var h = el('div', 'boqrow heading', label);
        h.style.cursor = 'pointer';
        h.addEventListener('click', function () { editBoqItem(p, it); });
        list.appendChild(h);
        return;
      }
      var r = el('div', 'boqrow');
      var top = el('div', 'boqtop');
      var meta = el('div', 'meta');
      meta.appendChild(el('div', 'title', label));
      meta.appendChild(el('div', 'detail', it.qty + ' ' + it.unit + ' × ' + money(it.rate) + ' = ' + money(L.itemAmount(it))));
      top.appendChild(meta);
      top.addEventListener('click', function () { editBoqItem(p, it); });
      r.appendChild(top);

      var dn = el('div', 'boqdone');
      var inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.step = 'any'; inp.inputMode = 'decimal'; inp.placeholder = '0';
      inp.value = it.done || '';
      inp.setAttribute('aria-label', it.desc + ' – ' + t('done_to_date'));
      inp.addEventListener('change', function () {
        var v = parseFloat(inp.value);
        it.done = isFinite(v) && v > 0 ? Math.round(v * 1000) / 1000 : 0;
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

  function editBoqItem(p, it) {
    var isNew = !it;
    var x = it || { no: '', desc: '', unit: '', qty: '', rate: '' };
    openForm({
      title: isNew ? t('add_item') : t('edit_item'),
      fields: [
        { key: 'no', label: t('item_no'), type: 'text', value: x.no, max: 20 },
        { key: 'desc', label: t('item_desc'), type: 'text', value: x.desc, max: 120, required: true },
        { key: 'unit', label: t('unit'), type: 'text', value: x.unit, max: 12 },
        { key: 'qty', label: t('qty'), type: 'number', min: 0, value: x.qty || '' },
        { key: 'rate', label: t('rate'), type: 'number', min: 0, value: x.rate || '' },
        { type: 'note', text: t('heading_note') }
      ],
      onSubmit: function (v) {
        if (isNew) {
          var ni = L.sanitizeBoqItem({ no: v.no, desc: v.desc, unit: v.unit, qty: v.qty, rate: v.rate });
          if (!ni) return t('required');
          p.boq.push(ni);
        } else {
          it.no = v.no.slice(0, 20); it.desc = v.desc.slice(0, 120); it.unit = v.unit.slice(0, 12);
          it.qty = Math.max(0, Math.round(v.qty * 1000) / 1000); it.rate = Math.max(0, L.round2(v.rate));
        }
        save(); renderAll();
        return null;
      },
      onDelete: isNew ? null : function () {
        if (!window.confirm(t('confirm_delete_item'))) return false;
        p.boq = p.boq.filter(function (a) { return a.id !== it.id; });
        save(); renderAll();
        return true;
      }
    });
  }

  $('boqFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    var input = this;
    var p = boqTarget;
    if (!file || !p) { input.value = ''; return; }
    var reader = new FileReader();
    reader.onerror = function () { toast(t('restore_fail')); input.value = ''; };
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
      { key: 'contractSum', label: t('contract_sum'), type: 'number', min: 0, value: p.contractSum || '' },
      { key: 'advance', label: t('advance_paid'), type: 'number', min: 0, value: p.advance || '' },
      { key: 'vat', label: t('vat_pct'), type: 'number', min: 0, max: 100, value: p.vat },
      { key: 'wht', label: t('wht_pct'), type: 'number', min: 0, max: 100, value: p.wht },
      { key: 'retention', label: t('retention_pct'), type: 'number', min: 0, max: 100, value: p.retention },
      { key: 'startDate', label: t('start_date'), type: 'date', value: p.startDate },
      { key: 'endDate', label: t('end_date'), type: 'date', value: p.endDate }
    ];
  }
  function applyProjectValues(p, v) {
    p.name = v.name.slice(0, 60); p.client = v.client.slice(0, 60); p.location = v.location.slice(0, 60);
    p.contractSum = Math.max(0, L.round2(v.contractSum)); p.advance = Math.max(0, L.round2(v.advance));
    p.vat = Math.min(100, Math.max(0, L.round2(v.vat))); p.wht = Math.min(100, Math.max(0, L.round2(v.wht)));
    p.retention = Math.min(100, Math.max(0, L.round2(v.retention)));
    p.startDate = L.isDate(v.startDate) ? v.startDate : '';
    p.endDate = L.isDate(v.endDate) ? v.endDate : '';
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
    // VAT 15% and retention 5% are starting values only: set them to what your contract says.
    var p = L.sanitizeProject({ name: '', vat: 15, wht: 0, retention: 5 }, state.projects.length + 1);
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
    var b = bill || { date: L.todayStr(), supplier: '', code: 'materials', desc: '', amount: '' };
    var pst = newPhotoState(bill ? bill.photos : []);
    openForm({
      title: isNew ? t('add_bill') : t('edit_bill'),
      fields: [
        { key: 'date', label: t('date'), type: 'date', value: b.date, required: true },
        { key: 'supplier', label: t('supplier'), type: 'text', value: b.supplier, required: true },
        { key: 'code', label: t('cost_code'), type: 'select', options: codeOptions(), value: b.code },
        { key: 'desc', label: t('description'), type: 'text', value: b.desc, max: 80 },
        { key: 'amount', label: t('bill_amount'), type: 'number', min: 0.01, value: b.amount, required: true },
        { key: 'photos', type: 'photos', state: pst }
      ],
      onSubmit: function (v) {
        var date = L.isDate(v.date) ? v.date : L.todayStr();
        if (isNew) {
          var nb = L.sanitizeBill({ date: date, supplier: v.supplier, code: v.code, desc: v.desc, amount: v.amount, photos: pst.ids });
          if (!nb) return t('required');
          p.bills.push(nb);
        } else {
          bill.date = date; bill.supplier = v.supplier.slice(0, 60); bill.code = v.code; bill.desc = v.desc.slice(0, 80);
          bill.amount = L.round2(v.amount);
          bill.photos = L.photoIds(pst.ids);
        }
        save(); renderAll();
        return null;
      },
      onDelete: isNew ? null : function () {
        if (!window.confirm(t('confirm_delete_bill'))) return false;
        deletePhotoIds(bill.photos);
        clearEntryLinks('billId', bill.id);
        p.bills = p.bills.filter(function (x) { return x.id !== bill.id; });
        save(); renderAll();
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
    info.appendChild(kv(t('advance_paid'), money(p.advance)));
    info.appendChild(kv(t('vat_pct'), pct(p.vat)));
    info.appendChild(kv(t('wht_pct'), pct(p.wht)));
    info.appendChild(kv(t('retention_pct'), pct(p.retention)));
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
      card.appendChild(kv(t('gross'), money(c.gross)));
      card.appendChild(kv('− ' + t('retention_amt'), money(c.retention)));
      card.appendChild(kv('− ' + t('advance_recovery'), money(c.advanceRecovery)));
      card.appendChild(kv('+ ' + t('vat_amt'), money(c.vat)));
      card.appendChild(kv('− ' + t('wht_amt'), money(c.wht)));
      card.appendChild(kv(t('payable'), money(c.payable), 'total'));
      card.appendChild(kv(t('received'), money(c.received)));
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
      row.appendChild(btn(t('edit_cert'), '', function () { editCert(p, cert); }));
      card.appendChild(row);
      body.appendChild(card);
    });
  }

  function editCert(p, cert, preset) {
    var isNew = !cert;
    var c = cert || { no: 'IPC-' + (p.certs.length + 1), date: L.todayStr(), gross: preset ? preset.gross : '', advanceRecovery: '' };
    openForm({
      title: isNew ? t('add_cert') : t('edit_cert'),
      fields: [
        { key: 'no', label: t('cert_no'), type: 'text', value: c.no, max: 20 },
        { key: 'date', label: t('date'), type: 'date', value: c.date, required: true },
        { key: 'gross', label: t('gross'), type: 'number', min: 0.01, value: c.gross, required: true },
        { key: 'advanceRecovery', label: t('advance_recovery'), type: 'number', min: 0, value: c.advanceRecovery || '' }
      ],
      onSubmit: function (v) {
        var date = L.isDate(v.date) ? v.date : L.todayStr();
        if (isNew) {
          var nc = L.sanitizeCert({ no: v.no, date: date, gross: v.gross, advanceRecovery: v.advanceRecovery });
          if (!nc) return t('required');
          p.certs.push(nc);
        } else {
          cert.no = v.no.slice(0, 20); cert.date = date; cert.gross = L.round2(v.gross);
          cert.advanceRecovery = Math.max(0, L.round2(v.advanceRecovery));
        }
        save(); renderAll();
        return null;
      },
      onDelete: isNew ? null : function () {
        if (!window.confirm(t('confirm_delete_cert'))) return false;
        clearEntryLinks('certId', cert.id);
        p.certs = p.certs.filter(function (x) { return x.id !== cert.id; });
        save(); renderAll();
        return true;
      }
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
      row.appendChild(btn(t('open'), 'primary', function () { state.current = b.id; save(); showView('entries'); renderAll(); }));
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
    renderEntries();
    renderProjects();
    renderReports();
    renderSettings();
  }

  var VIEWS = ['entries', 'projects', 'reports', 'settings'];
  function showView(name) {
    ui.view = name;
    VIEWS.forEach(function (v) { $('view-' + v).hidden = v !== name; });
    Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === name);
    });
    document.body.classList.remove('view-entries', 'view-projects', 'view-reports', 'view-settings');
    document.body.classList.add('view-' + name);
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
  }

  function openEntry(id) {
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
    $('deleteEntry').hidden = !e;

    var proj = projectOfBook(book());
    if (proj) {
      var cs = $('codeSel');
      cs.textContent = '';
      cs.appendChild(option('', t('none_opt')));
      L.CODES.forEach(function (c) { cs.appendChild(option(c, codeLabel(c))); });
      cs.value = e ? e.code : '';
      $('party').value = e ? e.party : '';
      var pl = $('partyList');
      pl.textContent = '';
      var seen = {};
      var names = [];
      book().entries.forEach(function (x) { if (x.party) names.push(x.party); });
      proj.bills.forEach(function (b) { if (b.supplier) names.push(b.supplier); });
      proj.workers.forEach(function (w) { names.push(w.name); });
      if (proj.client) names.push(proj.client);
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

  $('fab').addEventListener('click', function () {
    if (ui.view === 'projects') {
      var p = currentProject();
      if (!p) { newProject(); return; }
      ({ overview: function () { editProject(p); }, boq: function () { editBoqItem(p, null); }, budget: function () { editBudget(p); }, bills: function () { editBill(p, null); },
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
    var billId = prev ? prev.billId : 0, certId = prev ? prev.certId : 0;
    if (proj) {
      code = type === 'out' ? $('codeSel').value : '';
      party = $('party').value;
      var linkVal = Number($('linkSel').value) || 0;
      billId = type === 'out' ? linkVal : 0;
      certId = type === 'in' ? linkVal : 0;
    } else if (prev && prev.type !== type) {
      code = ''; billId = 0; certId = 0;
    }

    var draft = L.sanitizeEntry({
      id: ui.editingId || L.newId(),
      type: type,
      amount: parseFloat($('amount').value),
      date: $('date').value,
      category: $('category').value,
      note: $('note').value,
      code: code, party: party, billId: billId, certId: certId, photos: entryPhotoSt.ids
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
    unlinkEntryEverywhere(ui.editingId);
    deletePhotoIds(entryPhotoSt.ids.concat(entryPhotoSt.removed));
    entryPhotoSt = newPhotoState([]);
    b.entries = b.entries.filter(function (x) { return x.id !== ui.editingId; });
    save();
    closeModal('entryModal');
    renderAll();
  });

  /* ---------- filters ---------- */
  $('q').addEventListener('input', function () { ui.q = this.value; renderEntries(); });
  $('typeFilter').addEventListener('change', function () { ui.type = this.value; renderEntries(); });
  $('fromDate').addEventListener('change', function () { ui.from = this.value; renderEntries(); });
  $('toDate').addEventListener('change', function () { ui.to = this.value; renderEntries(); });
  $('clearFilters').addEventListener('click', function () {
    ui.q = ''; ui.type = 'all'; ui.from = ''; ui.to = '';
    $('q').value = ''; $('typeFilter').value = 'all'; $('fromDate').value = ''; $('toDate').value = '';
    renderEntries();
  });

  /* ---------- reports nav ---------- */
  $('prevMonth').addEventListener('click', function () { ui.month = cal().shiftMonth(ui.month, -1); renderReports(); });
  $('nextMonth').addEventListener('click', function () { ui.month = cal().shiftMonth(ui.month, 1); renderReports(); });

  /* ---------- tabs ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-view');
      showView(v);
      if (v === 'reports') renderReports();
      if (v === 'projects') renderProjects();
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
    openModal('bookModal');
  });
  $('bookProject').addEventListener('change', function () {
    book().projectId = this.value;
    save();
    renderAll();
  });
  $('closeBook').addEventListener('click', function () { closeModal('bookModal'); });
  $('bookModal').addEventListener('click', function (ev) { if (ev.target === this) closeModal('bookModal'); });

  $('newBook').addEventListener('click', function () {
    var name = $('bookName').value.trim().slice(0, 40);
    if (!name) { $('bookName').focus(); return; }
    var id = 'b' + L.newId();
    state.books.push({ id: id, name: name, projectId: $('bookProject').value || '', entries: [] });
    state.current = id;
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
    if (!window.confirm(t('confirm_delete_book'))) return;
    var cur = book().id;
    dropPaymentsOfBook(cur);
    deletePhotoIds(entryPhotoIds(book().entries));
    state.books = state.books.filter(function (b) { return b.id !== cur; });
    state.current = state.books[0].id;
    save();
    closeModal('bookModal');
    renderAll();
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
    if (!window.confirm(t('confirm_clear'))) return;
    dropPaymentsOfBook(book().id);
    deletePhotoIds(entryPhotoIds(book().entries));
    book().entries = [];
    save();
    renderAll();
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
      return;
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
  }

  $('exportBtn').addEventListener('click', function () {
    saveFile('cashbook-' + safeName(book().name) + '-' + L.todayStr() + '.csv', 'text/csv', L.buildCsv(book().entries));
  });

  $('backupBtn').addEventListener('click', function () {
    var copy = JSON.parse(JSON.stringify(state));
    copy.settings.pinHash = '';
    copy.settings.pinSalt = '';
    saveFile('cashbook-backup-' + L.todayStr() + '.json', 'application/json', JSON.stringify(copy, null, 2));
  });

  $('backupPhotosBtn').addEventListener('click', function () {
    var ids = allPhotoIds();
    if (!ids.length) { toast(t('photos_none')); return; }
    Promise.all(ids.map(function (id) { return photoData(id).then(function (d) { return [id, d]; }); })).then(function (pairs) {
      var photos = {}, n = 0;
      pairs.forEach(function (x) { if (x[1]) { photos[x[0]] = x[1]; n++; } });
      if (!n) { toast(t('photos_none')); return; }
      saveFile('cashbook-photos-' + L.todayStr() + '.json', 'application/json', JSON.stringify({ cashbookPhotos: 1, photos: photos }));
    });
  });

  function restorePhotos(parsed) {
    var ids = Object.keys(parsed.photos || {}).filter(function (id) {
      var d = parsed.photos[id];
      return /^\d{1,16}$/.test(id) && typeof d === 'string' && d.indexOf('data:image/') === 0 && d.length < 4000000;
    });
    var n = 0;
    ids.reduce(function (chain, id) {
      return chain.then(function () {
        return window.CBPhotos.put(id, parsed.photos[id]).then(function () { photoCache[Number(id)] = parsed.photos[id]; n++; }).catch(function () { /* skip */ });
      });
    }, Promise.resolve()).then(function () {
      renderAll();
      toast(n ? t('photos_restored', { n: n }) : t('restore_fail'));
    });
  }

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
          var next = L.sanitizeState(parsed, { keepPin: false });
          next.settings.pinHash = state.settings.pinHash;
          next.settings.pinSalt = state.settings.pinSalt;
          state = next;
          ui.projectId = '';
          ui.month = cal().monthKey(L.todayStr());
          save();
          renderAll();
          toast(t('restored'));
        } else {
          var res = L.entriesFromCsv(text);
          if (!res.entries.length) throw new Error('no rows');
          if (!window.confirm(t('import_confirm', { n: res.entries.length }))) return;
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

  /* ---------- start ---------- */
  showView('entries');
  renderAll();
  showLock();
})();
