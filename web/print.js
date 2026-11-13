/* Builds printable HTML for payment certificates and project statements.
   Pure functions: no DOM access. Every dynamic value is escaped. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CBPrint = factory();
})(this, function () {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var CSS = [
    '@page { size: A4; margin: 14mm; }',
    '* { box-sizing: border-box; }',
    'body { font-family: "Noto Sans Ethiopic", "Segoe UI", Roboto, Arial, sans-serif; color: #111; font-size: 11pt; line-height: 1.35; margin: 0; }',
    'h1 { font-size: 17pt; margin: 0 0 2pt; }',
    'h2 { font-size: 12pt; margin: 14pt 0 4pt; border-bottom: 1px solid #999; padding-bottom: 2pt; }',
    '.sub { color: #444; margin: 0 0 8pt; }',
    'table { width: 100%; border-collapse: collapse; margin: 4pt 0; }',
    'tr { page-break-inside: avoid; }',
    'thead { display: table-header-group; }',
    'th, td { padding: 3pt 5pt; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }',
    'th { background: #f0f0f0; font-size: 10pt; }',
    'td.n, th.n { text-align: right; white-space: nowrap; }',
    'tr.total td { font-weight: bold; border-top: 2px solid #111; border-bottom: 2px solid #111; }',
    'tr.head td { font-weight: bold; background: #f7f7f7; }',
    '.meta td { border: 0; padding: 1pt 5pt 1pt 0; }',
    '.meta td:first-child { color: #444; width: 32%; }',
    '.sign { display: flex; gap: 24pt; margin-top: 36pt; }',
    '.sign div { flex: 1; border-top: 1px solid #111; padding-top: 3pt; font-size: 10pt; }',
    '.note { color: #555; font-size: 9pt; margin-top: 8pt; }',
    '.pb { page-break-before: always; }'
  ].join('\n');

  function page(title, lang, body) {
    return '<!doctype html><html lang="' + esc(lang || 'en') + '"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(title) + '</title>' +
      '<style>' + CSS + '</style></head><body>' + body + '</body></html>';
  }

  function metaRows(pairs) {
    var h = '<table class="meta">';
    pairs.forEach(function (p) {
      if (p[1] == null || p[1] === '') return;
      h += '<tr><td>' + esc(p[0]) + '</td><td>' + esc(p[1]) + '</td></tr>';
    });
    return h + '</table>';
  }

  function row(label, value, cls) {
    return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + esc(label) + '</td><td class="n">' + esc(value) + '</td></tr>';
  }

  function signatures(d) {
    return '<div class="sign"><div>' + esc(d.t('contractor')) + '<br>' + esc(d.t('signature')) +
      '</div><div>' + esc(d.t('consultant')) + '<br>' + esc(d.t('signature')) + '</div></div>';
  }

  /* d: { t, money, lang, project, cert, calc, seq:{previous,cumulative}, boq:[items]|null, date, itemAmount, itemEarned, isHeading } */
  function certificateHtml(d) {
    var p = d.project, c = d.cert, k = d.calc, t = d.t, m = d.money;
    var fd = d.fmt || function (x) { return x; };
    var title = t('cert_title') + ' ' + (c.no || '');
    var h = '<h1>' + esc(title) + '</h1><p class="sub">' + esc(p.name) + '</p>';
    h += metaRows([
      [t('client_name'), p.client], [t('location'), p.location], [t('date'), fd(c.date)],
      [t('contract_sum'), m(p.contractSum)], [t('prepared'), fd(d.date)]
    ]);

    h += '<h2>' + esc(t('valuation')) + '</h2><table>';
    h += row(t('prev_certified'), m(d.seq.previous));
    h += row(t('gross'), m(k.gross));
    h += row(t('cum_certified'), m(d.seq.cumulative), 'head');
    h += row('+ ' + t('vat_amt') + ' (' + p.vat + '%)', m(k.vat));
    h += row(t('work_incl_vat'), m(k.gross + k.vat), 'head');
    h += row('− ' + t('retention_amt') + ' (' + p.retention + '%)', m(k.retention));
    h += row('− ' + t('advance_recovery'), m(k.advanceRecovery));
    if (k.penalty > 0) h += row('− ' + t('penalty'), m(k.penalty));
    h += row(t('payable'), m(k.payable), 'total');
    h += '</table>';
    h += '<p class="note">' + esc(t('cert_formula')) + '</p>';

    if (d.boq && d.boq.length) {
      h += '<h2 class="pb">' + esc(t('work_done')) + '</h2><table><thead><tr><th>' + esc(t('item_no')) + '</th><th>' + esc(t('item_desc')) +
        '</th><th>' + esc(t('unit')) + '</th><th class="n">' + esc(t('qty')) + '</th><th class="n">' + esc(t('rate')) +
        '</th><th class="n">' + esc(t('done_to_date')) + '</th><th class="n">' + esc(t('amount')) + '</th></tr></thead><tbody>';
      var total = 0, earned = 0;
      d.boq.forEach(function (i) {
        if (d.isHeading(i)) {
          h += '<tr class="head"><td>' + esc(i.no) + '</td><td colspan="6">' + esc(i.desc) + '</td></tr>';
          return;
        }
        total += d.itemAmount(i);
        earned += d.itemEarned(i);
        h += '<tr><td>' + esc(i.no) + '</td><td>' + esc(i.desc) + '</td><td>' + esc(i.unit) + '</td><td class="n">' + esc(i.qty) +
          '</td><td class="n">' + esc(m(i.rate)) + '</td><td class="n">' + esc(i.done) + '</td><td class="n">' + esc(m(d.itemEarned(i))) + '</td></tr>';
      });
      h += '<tr class="total"><td colspan="6">' + esc(t('work_value')) + ' / ' + esc(t('boq_total')) + ': ' + esc(m(total)) + '</td><td class="n">' + esc(m(earned)) + '</td></tr></tbody></table>';
    }
    h += signatures(d);
    return page(title, d.lang, h);
  }

  /* d: { t, money, lang, project, summary, codes:[...], codeLabel(c), suppliers:[{supplier,balance}], date, certCalcs:[{cert,calc}], wages } */
  function statementHtml(d) {
    var p = d.project, s = d.summary, t = d.t, m = d.money;
    var fd = d.fmt || function (x) { return x; };
    var title = t('statement_title') + ' – ' + p.name;
    var h = '<h1>' + esc(t('statement_title')) + '</h1><p class="sub">' + esc(p.name) + '</p>';
    h += metaRows([
      [t('client_name'), p.client], [t('location'), p.location],
      [t('start_date'), fd(p.startDate)], [t('end_date'), fd(p.endDate)], [t('prepared'), fd(d.date)]
    ]);

    h += '<h2>' + esc(t('client_section')) + '</h2><table>';
    h += row(t('contract_sum'), m(s.contractSum));
    h += row(t('certified'), m(s.certified) + ' (' + s.pctComplete + '%)');
    if (s.boqTotal > 0) h += row(t('physical_pct'), s.physicalPct + '% (' + m(s.boqEarned) + ' / ' + m(s.boqTotal) + ')');
    h += row(t('retention_held'), m(s.retentionHeld));
    h += row(t('advance_balance'), m(s.advanceBalance));
    h += row(t('received'), m(s.received));
    h += row(t('due_from_client'), m(s.clientOutstanding), 'total');
    h += '</table>';

    if (d.certCalcs.length) {
      h += '<h2>' + esc(t('client')) + ' – ' + esc(t('cert_title')) + '</h2><table><tr><th>' + esc(t('cert_no')) + '</th><th>' + esc(t('date')) +
        '</th><th class="n">' + esc(t('gross')) + '</th><th class="n">' + esc(t('payable')) + '</th><th class="n">' + esc(t('received')) +
        '</th><th class="n">' + esc(t('balance_due')) + '</th></tr>';
      d.certCalcs.forEach(function (x) {
        h += '<tr><td>' + esc(x.cert.no) + '</td><td>' + esc(fd(x.cert.date)) + '</td><td class="n">' + esc(m(x.calc.gross)) + '</td><td class="n">' +
          esc(m(x.calc.payable)) + '</td><td class="n">' + esc(m(x.calc.received)) + '</td><td class="n">' + esc(m(x.calc.balance)) + '</td></tr>';
      });
      h += '</table>';
    }

    h += '<h2>' + esc(t('cost_section')) + '</h2><table><tr><th>' + esc(t('cost_code')) + '</th><th class="n">' + esc(t('budget')) +
      '</th><th class="n">' + esc(t('actual_cost')) + '</th><th class="n">' + esc(t('remaining')) + '</th></tr>';
    d.codes.forEach(function (c) {
      var b = p.budgets[c] || 0, a = s.costByCode[c];
      if (!b && !a) return;
      h += '<tr><td>' + esc(d.codeLabel(c)) + '</td><td class="n">' + esc(b ? m(b) : '') + '</td><td class="n">' + esc(m(a)) + '</td><td class="n">' +
        esc(b ? m(Math.round((b - a) * 100) / 100) : '') + '</td></tr>';
    });
    var hasBudget = s.budgetTotal > 0;
    h += '<tr class="total"><td>' + esc(hasBudget ? t('budget_total') : t('actual_cost')) + '</td><td class="n">' + esc(hasBudget ? m(s.budgetTotal) : '') +
      '</td><td class="n">' + esc(m(s.costTotal)) + '</td><td class="n">' + esc(hasBudget ? m(s.budgetRemaining) : '') + '</td></tr></table>';

    h += '<h2>' + esc(t('owed')) + '</h2><table>';
    if (!d.suppliers.length && !(s.wagesUnpaid > 0)) h += '<tr><td>' + esc(t('no_data')) + '</td><td></td></tr>';
    d.suppliers.forEach(function (x) { h += row(x.supplier || t('uncategorized'), m(x.balance)); });
    if (s.wagesUnpaid > 0) h += row(t('unpaid_wages'), m(s.wagesUnpaid));
    h += row(t('owed'), m(s.owed), 'total');
    h += '</table>';
    h += '<p class="note">' + esc(t('margin')) + ': ' + esc(m(s.margin)) + '</p>';
    h += signatures(d);
    return page(title, d.lang, h);
  }

  /* Cash report for a date range: totals, groups and the entry list. */
  function reportHtml(d) {
    var h = '<h1>' + esc(d.title) + '</h1><p class="sub">' + esc(d.periodLabel) + '</p>';
    h += metaRows([[d.t('prepared'), d.date], [d.t('books'), d.scopeLabel]]);
    h += '<table><tr class="total"><td>' + esc(d.t('cash_in')) + '</td><td class="n">' + esc(d.money(d.totals.cashIn)) + '</td></tr>' +
      '<tr class="total"><td>' + esc(d.t('cash_out')) + '</td><td class="n">' + esc(d.money(d.totals.cashOut)) + '</td></tr>' +
      '<tr class="total"><td>' + esc(d.t('balance')) + '</td><td class="n">' + esc(d.money(d.totals.balance)) + '</td></tr></table>';
    d.groups.forEach(function (g) {
      if (!g.rows.length) return;
      h += '<h2>' + esc(g.title) + '</h2><table><thead><tr><th></th><th class="n">' + esc(d.t('cash_in')) + '</th><th class="n">' + esc(d.t('cash_out')) + '</th><th class="n">' + esc(d.t('net')) + '</th></tr></thead><tbody>';
      g.rows.forEach(function (r) {
        h += '<tr><td>' + esc(r[0]) + '</td><td class="n">' + esc(d.money(r[1])) + '</td><td class="n">' + esc(d.money(r[2])) + '</td><td class="n">' + esc(d.money(r[3])) + '</td></tr>';
      });
      h += '</tbody></table>';
    });
    h += '<h2>' + esc(d.t('entries')) + '</h2><table><thead><tr><th>' + esc(d.t('date')) + '</th><th>' + esc(d.t('category')) + ' / ' + esc(d.t('contact')) + '</th><th class="n">' + esc(d.t('cash_in')) + '</th><th class="n">' + esc(d.t('cash_out')) + '</th></tr></thead><tbody>';
    d.entries.forEach(function (e) {
      var sub = [e.party, e.mode ? d.t('mode_' + e.mode) : '', e.by, e.note].filter(Boolean).join(' · ');
      h += '<tr><td>' + esc(d.fmt(e.date)) + '</td><td>' + esc(e.category || '') + (sub ? '<br><span class="note">' + esc(sub) + '</span>' : '') + '</td>' +
        '<td class="n">' + (e.type === 'in' ? esc(d.money(e.amount)) : '') + '</td><td class="n">' + (e.type === 'out' ? esc(d.money(e.amount)) : '') + '</td></tr>';
    });
    h += '</tbody></table>';
    return page(d.title, d.lang, h);
  }

  return { esc: esc, certificateHtml: certificateHtml, statementHtml: statementHtml, reportHtml: reportHtml };
});
