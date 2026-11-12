/* Minimal .xlsx writer (no dependencies). Builds a workbook with styled cells, formulas
   (with cached values), merged cells and column widths, stored in an uncompressed zip.

   CBXlsx.build({ sheets: [{ name, cols: [width...], rows: [[cell...]...], merges: ['A1:B2'],
                              heights: { rowNumber: points }, landscape: true }] }) -> Uint8Array
   cell: null | number | string | { v: value, f: 'formula without =', s: style }
   style: { b, i, sz, font, h: left|center|right, v: top|center|bottom, wrap, border: 'thin'|'medium'|'thick',
            fill: 'RRGGBB', fmt: number format, color: 'RRGGBB' } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CBXlsx = factory();
})(this, function () {
  'use strict';

  function esc(v) {
    return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function colName(i) { // 0 -> A
    var s = '';
    i += 1;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  /* ---------- zip (store only) ---------- */
  var crcTable = null;
  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var u = unescape(encodeURIComponent(s)), out = new Uint8Array(u.length);
    for (var i = 0; i < u.length; i++) out[i] = u.charCodeAt(i);
    return out;
  }

  function zip(files) { // files: [{ name, data: string }]
    var parts = [], central = [], offset = 0;
    function u16(n) { return [n & 255, (n >>> 8) & 255]; }
    function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }
    files.forEach(function (f) {
      var name = utf8(f.name), data = utf8(f.data), crc = crc32(data);
      var local = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      parts.push(new Uint8Array(local), name, data);
      central.push({ name: name, crc: crc, size: data.length, offset: offset });
      offset += local.length + name.length + data.length;
    });
    var cdStart = offset, cdSize = 0;
    central.forEach(function (c) {
      var h = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21),
        u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset));
      parts.push(new Uint8Array(h), c.name);
      cdSize += h.length + c.name.length;
    });
    parts.push(new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(cdStart), u16(0))));
    var total = 0;
    parts.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(total), pos = 0;
    parts.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  /* ---------- styles ---------- */
  function Styles() {
    this.fonts = []; this.fills = []; this.borders = []; this.fmts = []; this.xfs = []; this.keys = {};
    this.fonts.push('<font><sz val="11"/><name val="Calibri"/></font>');
    this.fills.push('<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>');
    this.borders.push('<border><left/><right/><top/><bottom/><diagonal/></border>');
    this.xfs.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>');
  }
  Styles.prototype.idx = function (list, xml) {
    var i = list.indexOf(xml);
    if (i < 0) { list.push(xml); i = list.length - 1; }
    return i;
  };
  Styles.prototype.get = function (s) {
    if (!s) return 0;
    var key = JSON.stringify(s);
    if (this.keys[key] != null) return this.keys[key];
    var font = '<font>' + (s.b ? '<b/>' : '') + (s.i ? '<i/>' : '') + '<sz val="' + (s.sz || 11) + '"/>' +
      (s.color ? '<color rgb="FF' + s.color + '"/>' : '') + '<name val="' + esc(s.font || 'Calibri') + '"/></font>';
    var fontId = this.idx(this.fonts, font);
    var fillId = s.fill ? this.idx(this.fills, '<fill><patternFill patternType="solid"><fgColor rgb="FF' + s.fill + '"/><bgColor indexed="64"/></patternFill></fill>') : 0;
    var bs = s.border ? ('style="' + s.border + '"') : '';
    var side = function (n) { return s.border ? '<' + n + ' ' + bs + '><color auto="1"/></' + n + '>' : '<' + n + '/>'; };
    var borderId = s.border ? this.idx(this.borders, '<border>' + side('left') + side('right') + side('top') + side('bottom') + '<diagonal/></border>') : 0;
    var fmtId = 0;
    if (s.fmt) {
      var f = this.fmts.indexOf(s.fmt);
      if (f < 0) { this.fmts.push(s.fmt); f = this.fmts.length - 1; }
      fmtId = 164 + f;
    }
    var align = (s.h || s.v || s.wrap) ? '<alignment' + (s.h ? ' horizontal="' + s.h + '"' : '') + ' vertical="' + (s.v || 'center') + '"' + (s.wrap ? ' wrapText="1"' : '') + '/>' : '';
    this.xfs.push('<xf numFmtId="' + fmtId + '" fontId="' + fontId + '" fillId="' + fillId + '" borderId="' + borderId + '" xfId="0"' +
      (fmtId ? ' applyNumberFormat="1"' : '') + ' applyFont="1"' + (fillId ? ' applyFill="1"' : '') + (borderId ? ' applyBorder="1"' : '') +
      (align ? ' applyAlignment="1">' + align + '</xf>' : '/>'));
    this.keys[key] = this.xfs.length - 1;
    return this.keys[key];
  };
  Styles.prototype.xml = function () {
    var fm = this.fmts.map(function (f, i) { return '<numFmt numFmtId="' + (164 + i) + '" formatCode="' + esc(f) + '"/>'; }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (fm ? '<numFmts count="' + this.fmts.length + '">' + fm + '</numFmts>' : '') +
      '<fonts count="' + this.fonts.length + '">' + this.fonts.join('') + '</fonts>' +
      '<fills count="' + this.fills.length + '">' + this.fills.join('') + '</fills>' +
      '<borders count="' + this.borders.length + '">' + this.borders.join('') + '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="' + this.xfs.length + '">' + this.xfs.join('') + '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  };

  /* ---------- sheets ---------- */
  function sheetXml(sh, styles) {
    var rows = '';
    (sh.rows || []).forEach(function (row, r) {
      if (!row) return;
      var cells = '';
      row.forEach(function (cell, c) {
        if (cell == null) return;
        var o = (typeof cell === 'object') ? cell : { v: cell };
        var ref = colName(c) + (r + 1);
        var s = styles.get(o.s);
        var sa = s ? ' s="' + s + '"' : '';
        if (o.f != null) {
          var cached = typeof o.v === 'number' && isFinite(o.v) ? '<v>' + o.v + '</v>' : '';
          cells += '<c r="' + ref + '"' + sa + '><f>' + esc(o.f) + '</f>' + cached + '</c>';
        } else if (typeof o.v === 'number' && isFinite(o.v)) {
          cells += '<c r="' + ref + '"' + sa + '><v>' + o.v + '</v></c>';
        } else if (o.v == null || o.v === '') {
          cells += '<c r="' + ref + '"' + sa + '/>';
        } else {
          cells += '<c r="' + ref + '"' + sa + ' t="inlineStr"><is><t xml:space="preserve">' + esc(o.v) + '</t></is></c>';
        }
      });
      var h = sh.heights && sh.heights[r + 1];
      rows += '<row r="' + (r + 1) + '"' + (h ? ' ht="' + h + '" customHeight="1"' : '') + '>' + cells + '</row>';
    });
    var cols = (sh.cols || []).map(function (w, i) {
      return w ? '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>' : '';
    }).join('');
    var merges = (sh.merges || []).length
      ? '<mergeCells count="' + sh.merges.length + '">' + sh.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<sheetViews><sheetView workbookViewId="0"' + (sh.hideGrid ? ' showGridLines="0"' : '') + '/></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      (cols ? '<cols>' + cols + '</cols>' : '') +
      '<sheetData>' + rows + '</sheetData>' + merges +
      '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
      '<pageSetup paperSize="9" orientation="' + (sh.landscape ? 'landscape' : 'portrait') + '" fitToWidth="1" fitToHeight="0"/></worksheet>';
  }

  function build(wb) {
    var styles = new Styles();
    var sheets = wb.sheets;
    var sheetFiles = sheets.map(function (sh) { return sheetXml(sh, styles); });
    var files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets.map(function (s, i) { return '<sheet name="' + esc(s.name.slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
        '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: styles.xml() }
    ];
    sheetFiles.forEach(function (x, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: x }); });
    return zip(files);
  }

  return { build: build, colName: colName, crc32: crc32 };
});
