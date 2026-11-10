/* Gregorian and Ethiopian (Ge'ez) calendars behind one interface.
   The app always STORES dates as Gregorian ISO strings (YYYY-MM-DD); a calendar only decides how a date
   is shown, picked and grouped into months. Pure functions, no DOM access.

   Ethiopian calendar: 12 months of 30 days plus Pagume (5 days, or 6 in a leap year).
   A year Y is a leap year when Y % 4 === 3. Meskerem 1 falls on 11 September (12 September before a
   Gregorian leap year). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CBCal = factory();
})(this, function () {
  'use strict';

  var DAY_MS = 86400000;

  var ETH_MONTHS = {
    en: ['Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit', 'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'],
    om: ['Fuulbana', 'Onkololeessa', 'Sadaasa', 'Muddee', 'Amajjii', 'Guraandhala', 'Bitootessa', 'Ebla', 'Caamsaa', 'Waxabajjii', 'Adoolessa', 'Hagayya', 'Qaammee'],
    am: ['መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜን']
  };
  var GREG_MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

  function pad(n, w) { return String(n).padStart(w || 2, '0'); }

  /* ---- Gregorian ISO <-> days since 1970-01-01 ---- */
  function isoToDays(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var t = Date.UTC(y, mo - 1, d);
    var back = new Date(t);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null; // e.g. 2026-02-30
    return Math.round(t / DAY_MS);
  }
  function daysToIso(days) {
    var d = new Date(days * DAY_MS);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  /* ---- Ethiopian <-> days since 1970-01-01 ---- */
  // Meskerem 1, year 1 is day -716367 on this scale (JDN 1724221).
  var ETH_EPOCH = -716367;

  function ethLeap(y) { return y % 4 === 3; }
  function ethDaysInMonth(y, m) { return m < 13 ? 30 : (ethLeap(y) ? 6 : 5); }
  function ethValid(y, m, d) {
    return Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d) &&
      y >= 1 && y <= 9999 && m >= 1 && m <= 13 && d >= 1 && d <= ethDaysInMonth(y, m);
  }
  function ethToDays(y, m, d) {
    return ETH_EPOCH + (y - 1) * 365 + Math.floor(y / 4) + (m - 1) * 30 + (d - 1);
  }
  function ethFromDays(days) {
    var c = days - ETH_EPOCH;               // days since Meskerem 1, year 1
    var y = Math.floor((c - Math.floor((c + 366) / 1461)) / 365) + 1;
    var r = c - ((y - 1) * 365 + Math.floor(y / 4));
    return { y: y, m: Math.floor(r / 30) + 1, d: (r % 30) + 1 };
  }

  /* ---- the two calendars ---- */
  var gregorian = {
    id: 'gregorian',
    monthsInYear: 12,
    parts: function (iso) {
      if (isoToDays(iso) === null) return null;
      return { y: +iso.slice(0, 4), m: +iso.slice(5, 7), d: +iso.slice(8, 10) };
    },
    daysInMonth: function (y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); },
    fromParts: function (y, m, d) {
      var iso = pad(y, 4) + '-' + pad(m) + '-' + pad(d);
      return isoToDays(iso) === null ? '' : iso;
    },
    monthName: function (m) { return GREG_MONTHS[m - 1] || ''; },
    formatDate: function (iso) { return iso || ''; },
    monthKey: function (iso) { return String(iso || '').slice(0, 7); },
    shiftMonth: function (key, delta) {
      var y = parseInt(key.slice(0, 4), 10), m = parseInt(key.slice(5, 7), 10) - 1 + delta;
      y += Math.floor(m / 12);
      m = ((m % 12) + 12) % 12;
      return pad(y, 4) + '-' + pad(m + 1);
    },
    monthLabel: function (key) { return key; },
    shortLabel: function (key) { return key.slice(2); }
  };

  var ethiopian = {
    id: 'ethiopian',
    monthsInYear: 13,
    parts: function (iso) {
      var days = isoToDays(iso);
      return days === null ? null : ethFromDays(days);
    },
    daysInMonth: ethDaysInMonth,
    fromParts: function (y, m, d) {
      return ethValid(y, m, d) ? daysToIso(ethToDays(y, m, d)) : '';
    },
    monthName: function (m, lang) { return (ETH_MONTHS[lang] || ETH_MONTHS.en)[m - 1] || ''; },
    /* opts.suffix adds "E.C." (used on printed documents so nobody reads it as a Gregorian date) */
    formatDate: function (iso, lang, opts) {
      var p = ethiopian.parts(iso);
      if (!p) return iso || '';
      return p.d + ' ' + ethiopian.monthName(p.m, lang) + ' ' + p.y + (opts && opts.suffix ? ' E.C.' : '');
    },
    monthKey: function (iso) {
      var p = ethiopian.parts(iso);
      return p ? pad(p.y, 4) + '-' + pad(p.m) : '';
    },
    shiftMonth: function (key, delta) {
      var y = parseInt(key.slice(0, 4), 10), m = parseInt(key.slice(5, 7), 10) - 1 + delta;
      y += Math.floor(m / 13);
      m = ((m % 13) + 13) % 13;
      return pad(y, 4) + '-' + pad(m + 1);
    },
    monthLabel: function (key, lang) {
      return ethiopian.monthName(parseInt(key.slice(5, 7), 10), lang) + ' ' + parseInt(key.slice(0, 4), 10);
    },
    shortLabel: function (key) { return key.slice(2); }
  };

  function get(id) { return id === 'ethiopian' ? ethiopian : gregorian; }

  return {
    CALENDARS: ['gregorian', 'ethiopian'],
    get: get, gregorian: gregorian, ethiopian: ethiopian,
    ETH_MONTHS: ETH_MONTHS, ethLeap: ethLeap, isoToDays: isoToDays, daysToIso: daysToIso
  };
});
