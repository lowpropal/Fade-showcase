/**
 * FADE Pods Showcase v0.2 · Client-side XLSX Reader
 * Zero-dependency pure browser reader using DecompressionStream and DOMParser.
 * Converts .xlsx File objects into array-of-arrays for Importer ingestion.
 */
(function (root) {
  'use strict';

  function u16(b, o) {
    return b[o] | (b[o + 1] << 8);
  }

  function u32(b, o) {
    return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  }

  async function inflateRaw(u8) {
    if (typeof DecompressionStream !== 'undefined') {
      var ds = new DecompressionStream('deflate-raw');
      var s = new Blob([u8]).stream().pipeThrough(ds);
      return new Uint8Array(await new Response(s).arrayBuffer());
    }
    throw new Error('DecompressionStream is not supported in this browser.');
  }

  async function readZip(buf) {
    var b = new Uint8Array(buf), eocd = -1;
    for (var i = b.length - 22; i >= 0 && i > b.length - 66000; i--) {
      if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('Bukan file arsip ZIP/XLSX yang valid.');
    var n = u16(b, eocd + 10), cd = u32(b, eocd + 16), out = {}, p = cd;
    for (var k = 0; k < n; k++) {
      if (u32(b, p) !== 0x02014b50) break;
      var method = u16(b, p + 10), csize = u32(b, p + 20), nl = u16(b, p + 28), el = u16(b, p + 30), cl = u16(b, p + 32), lho = u32(b, p + 42);
      var name = new TextDecoder().decode(b.slice(p + 46, p + 46 + nl));
      p += 46 + nl + el + cl;
      if (!/^xl\/(worksheets\/sheet1\.xml|sharedStrings\.xml)$/.test(name)) continue;
      var lnl = u16(b, lho + 26), lel = u16(b, lho + 28), ds = lho + 30 + lnl + lel, data = b.slice(ds, ds + csize);
      out[name] = method === 0 ? data : await inflateRaw(data);
    }
    return out;
  }

  function colIndexFromRef(ref) {
    var s = String(ref || 'A1').replace(/[0-9]/g, ''), n = 0;
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }

  async function parseXlsxFile(file) {
    var buffer = await file.arrayBuffer();
    var zip = await readZip(buffer);
    var dom = new DOMParser();
    var shared = [];

    if (zip['xl/sharedStrings.xml']) {
      var sd = dom.parseFromString(new TextDecoder('utf-8').decode(zip['xl/sharedStrings.xml']), 'application/xml');
      shared = [].slice.call(sd.getElementsByTagName('si')).map(function (si) {
        return [].slice.call(si.getElementsByTagName('t')).map(function (t) { return t.textContent; }).join('');
      });
    }

    if (!zip['xl/worksheets/sheet1.xml']) {
      throw new Error('sheet1.xml tidak ditemukan di dalam dokumen XLSX.');
    }

    var sh = dom.parseFromString(new TextDecoder('utf-8').decode(zip['xl/worksheets/sheet1.xml']), 'application/xml');
    var rows = [].slice.call(sh.getElementsByTagName('row')).map(function (r) {
      var arr = [];
      [].slice.call(r.getElementsByTagName('c')).forEach(function (c) {
        var idx = colIndexFromRef(c.getAttribute('r'));
        var t = c.getAttribute('t');
        var v = '';
        var vn = c.getElementsByTagName('v')[0];
        var isn = c.getElementsByTagName('t')[0];

        if (t === 's' && vn) {
          v = shared[+vn.textContent] || '';
        } else if (t === 'inlineStr' && isn) {
          v = isn.textContent;
        } else if (vn) {
          v = vn.textContent;
        }
        arr[idx] = v;
      });
      return arr;
    });

    return rows;
  }

  var XlsxReader = {
    parseXlsxFile: parseXlsxFile
  };

  root.FADE_XLSX_READER = XlsxReader;
})(typeof globalThis !== 'undefined' ? globalThis : this);
