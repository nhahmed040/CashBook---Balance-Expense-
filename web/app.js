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
  function save() {
    rev++;
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
      itemAmount: L.itemAmount, rateStr: L.rateStr, itemEarned: L.itemEarned, isHeading: L.isHeading
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
    if (p.boq.length) row.appendChild(btn(t('export_boq_xlsx'), '', function () {
      saveWorkbook('Summary-BOQ-' + safeName(p.name), window.CBExcel.boqWorkbook(p));
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
      meta.appendChild(el('div', 'detail', it.qty + ' ' + it.unit + ' × ' + L.rateStr(it.rate) + ' = ' + money(L.itemAmount(it))));
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
        it.done = isFinite(v) && v > 0 ? Math.round(v * 1e6) / 1e6 : 0;
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
          it.qty = Math.max(0, Math.round(v.qty * 1e6) / 1e6); it.rate = Math.max(0, Math.round(v.rate * 1e6) / 1e6);
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
      { key: 'endDate', label: t('end_date'), type: 'date', value: p.endDate }
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
        { key: 'code', label: t('cost_code'), type: 'select', options: codeOptions(), value: b.code },
        { key: 'desc', label: t('description'), type: 'text', value: b.desc, max: 80 },
        { key: 'amount', label: t('bill_amount'), type: 'number', min: 0.01, value: b.amount, required: true },
        { key: 'due', label: t('due_date'), type: 'date', value: b.due || '' },
        { key: 'photos', type: 'photos', state: pst }
      ],
      onSubmit: function (v) {
        var date = L.isDate(v.date) ? v.date : L.todayStr();
        if (isNew) {
          var nb = L.sanitizeBill({ date: date, supplier: v.supplier, code: v.code, desc: v.desc, amount: v.amount, due: v.due, photos: pst.ids });
          if (!nb) return t('required');
          p.bills.push(nb);
        } else {
          bill.date = date; bill.supplier = v.supplier.slice(0, 60); bill.code = v.code; bill.desc = v.desc.slice(0, 80);
          bill.amount = L.round2(v.amount);
          bill.due = L.isDate(v.due) ? v.due : '';
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
    if (p.vat > 0 && p.contractSum > 0) info.appendChild(kv(t('contract_incl_vat'), money(L.contractWithVat(p))));
    info.appendChild(kv(t('advance_paid') + ' (' + pct(p.advancePct) + ')', money(p.advance)));
    info.appendChild(kv(t('recovery_pct'), pct(p.recoveryPct)));
    info.appendChild(kv(t('vat_pct'), pct(p.vat)));
    info.appendChild(kv(t('retention_pct'), pct(p.retention)));
    info.appendChild(kv(t('wht_pct'), pct(p.wht)));
    info.appendChild(kv(t('vat_wht_pct'), pct(p.vatWhtPct)));
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
      row.appendChild(btn(t('tax_receipts'), '', function () { editTaxReceipts(cert); }));
      row.appendChild(btn(t('edit_cert'), '', function () { editCert(p, cert); }));
      card.appendChild(row);
      body.appendChild(card);
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
        { key: 'gross', label: t('gross'), type: 'number', min: 0.01, value: c.gross, required: true },
        { key: 'advMode', label: t('advance_recovery'), type: 'select', options: advModes, value: isNew ? 'auto' : 'manual' },
        { key: 'advanceRecovery', label: t('adv_manual_amount'), type: 'number', min: 0, value: c.advanceRecovery || '' },
        { key: 'penalty', label: t('penalty'), type: 'number', min: 0, value: c.penalty || '' }
      ],
      onSubmit: function (v) {
        var date = L.isDate(v.date) ? v.date : L.todayStr();
        var gross = L.round2(v.gross);
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
        clearEntryLinks('certId', cert.id);
        p.certs = p.certs.filter(function (x) { return x.id !== cert.id; });
        save(); renderAll();
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
    renderContacts();
    renderReports();
    renderSettings();
    renderBiz();
    renderReminders();
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
        state.books.forEach(function (b) { b.entries.forEach(function (e) { if (e.contactId === contact.id) e.contactId = 0; }); });
        state.contacts = state.contacts.filter(function (x) { return x.id !== contact.id; });
        if (ui.contactId === contact.id) ui.contactId = 0;
        save(); renderAll();
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
  function renderReminders() {
    var list = L.reminders(state, L.todayStr(), 7);
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
      tx.appendChild(el('b', null, (r.kind === 'cert' ? t('unpaid_cert') + ': ' : '') + (r.who || '—')));
      tx.appendChild(el('small', 'muted', [r.project, r.desc, r.due ? t('due_label') + ' ' + fmtDate(r.due) : ''].filter(Boolean).join(' · ')));
      row.appendChild(tx);
      row.appendChild(el('span', 'amt ' + (r.level === 'overdue' ? 'out' : ''), money(r.amount)));
      row.addEventListener('click', function () { ui.projectId = r.projectId; ui.section = r.kind === 'cert' ? 'client' : 'bills'; renderProjects(); window.scrollTo(0, 0); });
      pn.appendChild(row);
    });
    box.appendChild(pn);
  }
  $('remindBanner').addEventListener('click', function () { showView('projects'); renderProjects(); });

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
  var APP_VERSION = '2.1.1';
  $('aboutBtn').addEventListener('click', function () { $('aboutVersion').textContent = APP_VERSION; openModal('aboutModal'); });
  $('closeAbout').addEventListener('click', function () { closeModal('aboutModal'); });
  $('aboutModal').addEventListener('click', function (e) { if (e.target === this) closeModal('aboutModal'); });
  $('bookModal').addEventListener('click', function (ev) { if (ev.target === this) closeModal('bookModal'); });

  $('newBook').addEventListener('click', function () {
    var name = $('bookName').value.trim().slice(0, 40);
    if (!name) { $('bookName').focus(); return; }
    var id = 'b' + L.newId();
    state.books.push({ id: id, name: name, projectId: $('bookProject').value || '', businessId: $('bookBiz').value || state.business || '', entries: [] });
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
    function proceed() {
      var cur = book().id;
      dropPaymentsOfBook(cur);
      deletePhotoIds(entryPhotoIds(book().entries));
      state.books = state.books.filter(function (b) { return b.id !== cur; });
      state.current = state.books[0].id;
      save();
      closeModal('bookModal');
      renderAll();
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
    var busy = false, again = false, timer = 0, rulesShown = false, advanced = false;
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
    function syncAll(manual) {
      if (!ready()) { if (manual) toast(t('need_signin')); return Promise.resolve(); }
      if (busy) { again = true; return Promise.resolve(); }
      busy = true; again = false; dot('busy');
      var changed = false;
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
        busy = false; status = t('synced'); dot('ok');
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
        P.appendChild(btn(t('sign_out'), 'block', function () { cloud.signOut(); invite = ''; status = ''; renderAll(); }));
      }

      P.appendChild(btn(t('show_rules'), 'block', function () { rulesShown = !rulesShown; renderCloud(); }));
      if (rulesShown) {
        var ta = document.createElement('textarea'); ta.readOnly = true; ta.value = JSON.stringify(CS.RULES, null, 2);
        P.appendChild(ta);
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

  /* ---------- start ---------- */
  showView('entries');
  renderAll();
  showLock();
})();
