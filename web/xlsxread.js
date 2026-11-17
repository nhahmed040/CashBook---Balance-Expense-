/* Minimal .xlsx reader (no dependencies). Reads sheets as arrays of rows of plain values.

   CBXlsxRead.read(arrayBuffer) -> Promise<[{ name, rows: [[value...]...] }]>
   Values are numbers (cached results for formulas) or strings; empty cells are ''. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CBXlsxRead = factory();
})(this, function () {
  'use strict';

  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('no inflate'));
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }

  /* zip central directory -> { name: function() -> Promise<Uint8Array> } */
  function unzip(buf) {
    var b = new Uint8Array(buf), end = -1, i;
    for (i = b.length - 22; i >= Math.max(0, b.length - 65600); i--) {
      if (u32(b, i) === 0x06054b50) { end = i; break; }
    }
    if (end < 0) throw new Error('not a zip');
    var n = u16(b, end + 10), p = u32(b, end + 16), files = {};
    for (i = 0; i < n; i++) {
      if (u32(b, p) !== 0x02014b50) throw new Error('bad zip');
      var method = u16(b, p + 10), csize = u32(b, p + 20), nlen = u16(b, p + 28), elen = u16(b, p + 30), clen = u16(b, p + 32), off = u32(b, p + 42);
      var name = '';
      for (var k = 0; k < nlen; k++) name += String.fromCharCode(b[p + 46 + k]);
      files[name] = (function (method, csize, off) {
        return function () {
          var ln = u16(b, off + 26), le = u16(b, off + 28), start = off + 30 + ln + le;
          var data = b.subarray(start, start + csize);
          if (method === 0) return Promise.resolve(data);
          if (method === 8) return inflateRaw(data);
          return Promise.reject(new Error('unsupported zip method'));
        };
      })(method, csize, off);
      p += 46 + nlen + elen + clen;
    }
    return files;
  }

  function text(bytes) { return new TextDecoder('utf-8').decode(bytes); }
  function unesc(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, function (m, e) {
      if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'amp') return '&'; if (e === 'quot') return '"'; if (e === 'apos') return "'";
      var code = e.charAt(1) === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch (x) { return ''; }
    });
  }
  function textOf(xml) { // all <t> runs of a string item, without phonetic hints
    xml = xml.replace(/<rPh[\s\S]*?<\/rPh>/g, '');
    var out = '', re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, m;
    while ((m = re.exec(xml))) out += unesc(m[1]);
    return out;
  }
  function colIndex(ref) {
    var m = /^([A-Z]+)/.exec(ref), n = 0;
    if (!m) return -1;
    for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
    return n - 1;
  }

  function parseSheet(xml, shared) {
    var rows = [], rowRe = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g, rm, rowNo = 0;
    while ((rm = rowRe.exec(xml))) {
      var head = /<row\b[^>]*/.exec(rm[0])[0], rn = /\br="(\d+)"/.exec(head);
      rowNo = rn ? parseInt(rn[1], 10) : rowNo + 1;
      var row = [];
      if (rm[1]) {
        var cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, cm;
        while ((cm = cRe.exec(rm[1]))) {
          var attrs = cm[1], body = cm[2] || '';
          var ref = /\br="([A-Z]+\d+)"/.exec(attrs), ty = /\bt="(\w+)"/.exec(attrs);
          var ci = ref ? colIndex(ref[1]) : row.length;
          if (ci < 0 || ci > 200) continue;
          var v = /<v>([\s\S]*?)<\/v>/.exec(body), val = '';
          ty = ty ? ty[1] : 'n';
          if (ty === 's') val = v ? (shared[parseInt(v[1], 10)] || '') : '';
          else if (ty === 'inlineStr') val = textOf(body);
          else if (ty === 'str' || ty === 'e') val = v ? unesc(v[1]) : '';
          else if (ty === 'b') val = v && v[1] === '1' ? 1 : 0;
          else if (v) { var num = parseFloat(v[1]); val = isFinite(num) ? num : ''; }
          while (row.length < ci) row.push('');
          row[ci] = val;
        }
      }
      while (rows.length < rowNo - 1) rows.push([]);
      rows[rowNo - 1] = row;
      if (rows.length > 20000) break;
    }
    return rows;
  }

  function read(buf) {
    var files;
    try { files = unzip(buf); } catch (e) { return Promise.reject(e); }
    function get(name) { return files[name] ? files[name]().then(text) : Promise.resolve(''); }
    return Promise.all([get('xl/workbook.xml'), get('xl/_rels/workbook.xml.rels'), get('xl/sharedStrings.xml')]).then(function (r) {
      var shared = [], re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g, m;
      while ((m = re.exec(r[2]))) shared.push(m[1] ? textOf(m[1]) : '');
      var targets = {};
      (r[1].match(/<Relationship\b[^>]*>/g) || []).forEach(function (rel) {
        var id = /\bId="([^"]+)"/.exec(rel), tg = /\bTarget="([^"]+)"/.exec(rel);
        if (id && tg) targets[id[1]] = tg[1].charAt(0) === '/' ? tg[1].slice(1) : 'xl/' + tg[1];
      });
      var sheets = [];
      (r[0].match(/<sheet\b[^>]*>/g) || []).forEach(function (sh) {
        var nm = /\bname="([^"]*)"/.exec(sh), rid = /\br:id="([^"]+)"/.exec(sh);
        if (nm && rid && targets[rid[1]]) sheets.push({ name: unesc(nm[1]), path: targets[rid[1]] });
      });
      return sheets.reduce(function (chain, sh) {
        return chain.then(function (out) {
          return get(sh.path).then(function (xml) { out.push({ name: sh.name, rows: parseSheet(xml, shared) }); return out; });
        });
      }, Promise.resolve([]));
    });
  }

  return { read: read };
});
