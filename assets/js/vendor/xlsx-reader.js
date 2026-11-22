/**
 * FADE Pods Showcase v0.2 · Client-side XLSX & CSV Reader
 * Resilient zero-dependency reader using DecompressionStream, DOMParser, and pure CSV parser fallback.
 * Converts .xlsx, .csv, and plain text files into array-of-arrays for Importer ingestion.
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
      try {
        var ds = new DecompressionStream('deflate-raw');
        var s = new Blob([u8]).stream().pipeThrough(ds);
        return new Uint8Array(await new Response(s).arrayBuffer());
      } catch (e) {
        // Fallback if deflate-raw name is rejected
        var ds2 = new DecompressionStream('deflate');
        var s2 = new Blob([u8]).stream().pipeThrough(ds2);
        return new Uint8Array(await new Response(s2).arrayBuffer());
      }
    }
    throw new Error('Browser Anda tidak mendukung DecompressionStream. Gunakan Chrome, Edge, atau Safari terbaru.');
  }

  function parseCsvText(text) {
    if (!text || typeof text !== 'string') return [];
    var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var rows = [];

    // Detect delimiter: check comma vs semicolon vs tab in header line
    var headerCandidate = lines.find(function (l) { return l.trim().length > 0; }) || '';
    var delimiter = ',';
    var commaCount = (headerCandidate.match(/,/g) || []).length;
    var semiCount = (headerCandidate.match(/;/g) || []).length;
    var tabCount = (headerCandidate.match(/\t/g) || []).length;
    if (semiCount > commaCount && semiCount > tabCount) delimiter = ';';
    else if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line && i === lines.length - 1) continue;

      var row = [];
      var inQuotes = false;
      var curVal = '';

      for (var c = 0; c < line.length; c++) {
        var char = line[c];
        if (char === '"') {
          if (inQuotes && line[c + 1] === '"') {
            curVal += '"';
            c++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === delimiter && !inQuotes) {
          row.push(curVal.trim());
          curVal = '';
        } else {
          curVal += char;
        }
      }
      row.push(curVal.trim());

      // Only push non-empty rows
      if (row.some(function (cell) { return cell.length > 0; })) {
        rows.push(row);
      }
    }
    return rows;
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

      var lowerName = name.toLowerCase();
      // Only extract worksheets and shared strings to conserve memory
      if (!lowerName.startsWith('xl/worksheets/') && lowerName !== 'xl/sharedstrings.xml') {
        continue;
      }
      if (lowerName.includes('/_rels/')) {
        continue;
      }

      var lnl = u16(b, lho + 26), lel = u16(b, lho + 28), ds = lho + 30 + lnl + lel, data = b.slice(ds, ds + csize);
      out[lowerName] = method === 0 ? data : await inflateRaw(data);
    }
    return out;
  }

  function colIndexFromRef(ref) {
    var s = String(ref || 'A1').replace(/[0-9]/g, ''), n = 0;
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }

  async function parseXlsxFile(file) {
    if (!file) throw new Error('File tidak ditemukan.');

    var fileName = (file.name || '').toLowerCase();

    // 1. Check if file is CSV
    if (fileName.endsWith('.csv') || file.type === 'text/csv' || file.type === 'text/plain') {
      var csvText = await file.text();
      return parseCsvText(csvText);
    }

    // 2. Parse as XLSX (ZIP archive)
    var buffer = await file.arrayBuffer();
    var zip = null;
    try {
      zip = await readZip(buffer);
    } catch (zipErr) {
      // If ZIP fails, attempt CSV fallback in case file was exported as text
      try {
        var fallbackText = new TextDecoder('utf-8').decode(buffer);
        var parsed = parseCsvText(fallbackText);
        if (parsed.length > 1) return parsed;
      } catch (ignored) {}
      throw zipErr;
    }

    var dom = new DOMParser();
    var shared = [];

    // Locate sharedStrings.xml
    var sharedKey = Object.keys(zip).find(function (k) { return k.endsWith('sharedstrings.xml'); });
    if (sharedKey && zip[sharedKey]) {
      var sd = dom.parseFromString(new TextDecoder('utf-8').decode(zip[sharedKey]), 'application/xml');
      shared = [].slice.call(sd.getElementsByTagName('si')).map(function (si) {
        return [].slice.call(si.getElementsByTagName('t')).map(function (t) { return t.textContent; }).join('');
      });
    }

    // Locate primary worksheet (prefer sheet1.xml, otherwise first sheet found)
    var sheetKey = Object.keys(zip).find(function (k) { return k.endsWith('sheet1.xml'); });
    if (!sheetKey) {
      sheetKey = Object.keys(zip).find(function (k) { return k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml'); });
    }
    if (!sheetKey || !zip[sheetKey]) {
      throw new Error('Worksheet XML tidak ditemukan di dalam dokumen XLSX.');
    }

    var sh = dom.parseFromString(new TextDecoder('utf-8').decode(zip[sheetKey]), 'application/xml');
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
    parseXlsxFile: parseXlsxFile,
    parseCsvText: parseCsvText
  };

  root.FADE_XLSX_READER = XlsxReader;
})(typeof globalThis !== 'undefined' ? globalThis : this);
