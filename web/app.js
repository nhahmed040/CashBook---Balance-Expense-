(function () {
  'use strict';

  var L = window.CBLogic;
  var STORAGE_KEY = 'cashbook.data.v2';
  var OLD_KEY = 'cashbook.entries.v1';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- state ---------- */
  var state = loadState();
  var ui = {
    view: 'entries',
    q: '', type: 'all', from: '', to: '',
    month: L.monthOf(L.todayStr()),
    editingId: null
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

  /* ---------- i18n / formatting ---------- */
  function t(key, vars) {
    var dict = window.CB_I18N[state.settings.lang] || {};
    var s = dict[key] != null ? dict[key] : (window.CB_I18N.en[key] != null ? window.CB_I18N.en[key] : key);
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
    return s;
  }

  function money(n) {
    var cur = state.settings.currency;
    if (cur !== 'none') {
      try { return new Intl.NumberFormat('en', { style: 'currency', currency: cur }).format(n); } catch (e) { /* fall back */ }
    }
    return n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

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

  /* ---------- small helpers ---------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  function openModal(id) { $(id).classList.add('open'); }
  function closeModal(id) { $(id).classList.remove('open'); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------- rendering ---------- */
  function renderBooks() {
    var sel = $('bookSelect');
    sel.textContent = '';
    state.books.forEach(function (b) {
      var o = document.createElement('option');
      o.value = b.id;
      o.textContent = b.name;
      sel.appendChild(o);
    });
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
      meta.appendChild(el('div', 'detail', e.date + (e.note ? ' · ' + e.note : '')));
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
      if (e.category && !seen[e.category]) {
        seen[e.category] = true;
        var o = document.createElement('option');
        o.value = e.category;
        cl.appendChild(o);
      }
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
    $('monthLabel').textContent = ui.month;
    var m = L.monthTotals(entries, ui.month);
    $('mIn').textContent = money(m.cashIn);
    $('mOut').textContent = money(m.cashOut);
    $('mNet').textContent = money(m.balance);
    renderBars($('catOut'), L.categoryTotals(entries, ui.month, 'out'), 'out');
    renderBars($('catIn'), L.categoryTotals(entries, ui.month, 'in'), 'in');

    var months = L.lastMonths(entries, ui.month, 6);
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
        bar.title = p[0] === 'in' ? t('cash_in') + ': ' + money(p[1]) : t('cash_out') + ': ' + money(p[1]);
        pair.appendChild(bar);
      });
      col.appendChild(pair);
      col.appendChild(el('small', null, x.month.slice(2)));
      chart.appendChild(col);
    });
  }

  function renderSettings() {
    $('langSel').value = state.settings.lang;
    $('themeSel').value = state.settings.theme;
    var cs = $('curSel');
    cs.textContent = '';
    L.CURRENCIES.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c;
      o.textContent = c === 'none' ? '—' : c;
      cs.appendChild(o);
    });
    cs.value = state.settings.currency;

    var hasPin = !!state.settings.pinHash;
    $('pinStatus').textContent = hasPin ? t('pin_on') : t('pin_off');
    $('setPinBtn').textContent = hasPin ? t('change_pin') : t('set_pin');
    $('removePinBtn').hidden = !hasPin;
  }

  function renderAll() {
    applyTheme();
    applyStaticText();
    renderBooks();
    renderEntries();
    renderReports();
    renderSettings();
  }

  function showView(name) {
    ui.view = name;
    ['entries', 'reports', 'settings'].forEach(function (v) { $('view-' + v).hidden = v !== name; });
    Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === name);
    });
    document.body.className = 'view-' + name;
    window.scrollTo(0, 0);
  }

  /* ---------- entry add / edit ---------- */
  function openEntry(id) {
    ui.editingId = id || null;
    var e = null;
    if (id) {
      book().entries.forEach(function (x) { if (x.id === id) e = x; });
      if (!e) return;
    }
    $('entryTitle').textContent = e ? t('edit_entry') : t('add_entry');
    $('entryForm').elements.type.value = e ? e.type : 'in';
    $('amount').value = e ? e.amount : '';
    $('date').value = e ? e.date : L.todayStr();
    $('category').value = e ? e.category : '';
    $('note').value = e ? e.note : '';
    $('deleteEntry').hidden = !e;
    openModal('entryModal');
    if (!e) setTimeout(function () { $('amount').focus(); }, 50);
  }

  $('fab').addEventListener('click', function () { openEntry(null); });
  $('cancelEntry').addEventListener('click', function () { closeModal('entryModal'); });
  $('entryModal').addEventListener('click', function (ev) { if (ev.target === this) closeModal('entryModal'); });

  $('entryForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = $('entryForm');
    var draft = L.sanitizeEntry({
      id: ui.editingId || L.newId(),
      type: f.elements.type.value,
      amount: parseFloat($('amount').value),
      date: $('date').value,
      category: $('category').value,
      note: $('note').value
    });
    if (!draft) return;
    var entries = book().entries;
    if (ui.editingId) {
      for (var i = 0; i < entries.length; i++) if (entries[i].id === ui.editingId) entries[i] = draft;
    } else {
      entries.push(draft);
    }
    save();
    closeModal('entryModal');
    renderEntries();
    renderReports();
  });

  $('deleteEntry').addEventListener('click', function () {
    if (!ui.editingId || !window.confirm(t('confirm_delete'))) return;
    var b = book();
    b.entries = b.entries.filter(function (x) { return x.id !== ui.editingId; });
    save();
    closeModal('entryModal');
    renderEntries();
    renderReports();
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
  $('prevMonth').addEventListener('click', function () { ui.month = L.shiftMonth(ui.month, -1); renderReports(); });
  $('nextMonth').addEventListener('click', function () { ui.month = L.shiftMonth(ui.month, 1); renderReports(); });

  /* ---------- tabs ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
    b.addEventListener('click', function () {
      showView(b.getAttribute('data-view'));
      if (b.getAttribute('data-view') === 'reports') renderReports();
    });
  });

  /* ---------- books ---------- */
  $('bookSelect').addEventListener('change', function () {
    state.current = this.value;
    save();
    renderAll();
  });
  $('bookBtn').addEventListener('click', function () {
    $('bookName').value = '';
    $('deleteBook').hidden = state.books.length < 2;
    openModal('bookModal');
  });
  $('closeBook').addEventListener('click', function () { closeModal('bookModal'); });
  $('bookModal').addEventListener('click', function (ev) { if (ev.target === this) closeModal('bookModal'); });

  $('newBook').addEventListener('click', function () {
    var name = $('bookName').value.trim().slice(0, 40);
    if (!name) { $('bookName').focus(); return; }
    var id = 'b' + L.newId();
    state.books.push({ id: id, name: name, entries: [] });
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

  $('clearBtn').addEventListener('click', function () {
    if (!window.confirm(t('confirm_clear'))) return;
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

  function safeName(s) { return String(s).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'book'; }

  $('exportBtn').addEventListener('click', function () {
    saveFile('cashbook-' + safeName(book().name) + '-' + L.todayStr() + '.csv', 'text/csv', L.buildCsv(book().entries));
  });

  $('backupBtn').addEventListener('click', function () {
    var copy = JSON.parse(JSON.stringify(state));
    copy.settings.pinHash = '';
    copy.settings.pinSalt = '';
    saveFile('cashbook-backup-' + L.todayStr() + '.json', 'application/json', JSON.stringify(copy, null, 2));
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
          if (!parsed || !Array.isArray(parsed.books)) throw new Error('not a backup');
          if (!window.confirm(t('restore_confirm'))) return;
          var next = L.sanitizeState(parsed, { keepPin: false });
          next.settings.pinHash = state.settings.pinHash;
          next.settings.pinSalt = state.settings.pinSalt;
          state = next;
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
