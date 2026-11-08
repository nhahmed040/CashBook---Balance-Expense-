(function () {
  'use strict';

  var STORAGE_KEY = 'cashbook.entries.v1';

  var form = document.getElementById('entryForm');
  var amountEl = document.getElementById('amount');
  var dateEl = document.getElementById('date');
  var categoryEl = document.getElementById('category');
  var noteEl = document.getElementById('note');
  var listEl = document.getElementById('list');
  var emptyEl = document.getElementById('empty');
  var filterEl = document.getElementById('filter');
  var balanceEl = document.getElementById('balance');
  var totalInEl = document.getElementById('totalIn');
  var totalOutEl = document.getElementById('totalOut');

  var entries = load();

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) { /* storage unavailable: keep working in memory */ }
  }

  function today() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function fmt(n) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function totals() {
    var cashIn = 0, cashOut = 0;
    entries.forEach(function (e) {
      if (e.type === 'in') cashIn += e.amount; else cashOut += e.amount;
    });
    return { cashIn: cashIn, cashOut: cashOut, balance: cashIn - cashOut };
  }

  function render() {
    var t = totals();
    balanceEl.textContent = fmt(t.balance);
    totalInEl.textContent = fmt(t.cashIn);
    totalOutEl.textContent = fmt(t.cashOut);

    var filter = filterEl.value;
    var shown = entries
      .filter(function (e) { return filter === 'all' || e.type === filter; })
      .sort(function (a, b) {
        return a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id;
      });

    listEl.textContent = '';
    shown.forEach(function (e) {
      var li = document.createElement('li');
      li.className = 'item';

      var meta = document.createElement('div');
      meta.className = 'meta';
      var title = document.createElement('div');
      title.className = 'title';
      title.textContent = e.category || (e.type === 'in' ? 'Cash in' : 'Cash out');
      var detail = document.createElement('div');
      detail.className = 'detail';
      detail.textContent = e.date + (e.note ? ' · ' + e.note : '');
      meta.appendChild(title);
      meta.appendChild(detail);

      var right = document.createElement('div');
      right.className = 'right';
      var amt = document.createElement('span');
      amt.className = 'amt ' + e.type;
      amt.textContent = (e.type === 'in' ? '+' : '−') + fmt(e.amount);
      var del = document.createElement('button');
      del.className = 'del';
      del.type = 'button';
      del.setAttribute('aria-label', 'Delete entry');
      del.textContent = '✕';
      del.addEventListener('click', function () {
        entries = entries.filter(function (x) { return x.id !== e.id; });
        save();
        render();
      });
      right.appendChild(amt);
      right.appendChild(del);

      li.appendChild(meta);
      li.appendChild(right);
      listEl.appendChild(li);
    });

    emptyEl.hidden = shown.length > 0;
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    // Neutralise spreadsheet formula injection
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function exportCsv() {
    var rows = [['Date', 'Type', 'Amount', 'Category', 'Remark']];
    entries
      .slice()
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; })
      .forEach(function (e) {
        rows.push([e.date, e.type === 'in' ? 'Cash in' : 'Cash out', e.amount.toFixed(2), e.category, e.note]);
      });
    var csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n');
    // Inside the Android app, downloads of blob: links don't work: use the native bridge.
    if (window.AndroidBridge && typeof window.AndroidBridge.saveCsv === 'function') {
      window.AndroidBridge.saveCsv('cashbook-' + today() + '.csv', csv);
      return;
    }
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'cashbook-' + today() + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var amount = parseFloat(amountEl.value);
    if (!isFinite(amount) || amount <= 0) return;
    var type = form.elements.type.value === 'out' ? 'out' : 'in';
    entries.push({
      id: Date.now() + Math.floor(Math.random() * 1000),
      type: type,
      amount: Math.round(amount * 100) / 100,
      date: dateEl.value || today(),
      category: categoryEl.value.trim(),
      note: noteEl.value.trim()
    });
    save();
    amountEl.value = '';
    categoryEl.value = '';
    noteEl.value = '';
    amountEl.focus();
    render();
  });

  filterEl.addEventListener('change', render);
  document.getElementById('exportBtn').addEventListener('click', exportCsv);
  document.getElementById('clearBtn').addEventListener('click', function () {
    if (entries.length && window.confirm('Delete all entries? This cannot be undone.')) {
      entries = [];
      save();
      render();
    }
  });

  dateEl.value = today();
  render();
})();
