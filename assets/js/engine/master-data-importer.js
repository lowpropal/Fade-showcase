(function (root) {
  'use strict';

  function normalizeHeader(value) {
    return String(value == null ? '' : value).toLowerCase().replace(/[\s.\-]+/g, '_').trim();
  }

  function normalizeName(value) {
    return String(value == null ? '' : value).trim().toLocaleLowerCase('id-ID').replace(/\s+/g, ' ');
  }

  function buildSalesMap(salesList) {
    var map = new Map();
    (salesList || []).forEach(function (sales) {
      if (!sales || !sales.id) return;
      [sales.name, sales.salesName, sales.username].forEach(function (name) {
        var key = normalizeName(name);
        if (key) map.set(key, sales.id);
      });
    });
    return map;
  }

  function findHeader(rows, required) {
    for (var i = 0; i < Math.min(rows.length, 10); i++) {
      var row = rows[i] || [];
      var indexes = {};
      row.forEach(function (value, index) { indexes[normalizeHeader(value)] = index; });
      if (required.every(function (key) { return indexes[key] != null; })) return { rowIndex: i, indexes: indexes };
    }
    return null;
  }

  function prepareInvoiceRows(rawRows, salesList) {
    if (!Array.isArray(rawRows)) throw new Error('Sheet Invoice_Collection tidak terbaca.');
    var rows = rawRows.map(function (row) { return Array.isArray(row) ? row.slice() : []; });
    var header = findHeader(rows, ['invoice_id', 'sales_kpi', 'kpi_id']);
    if (!header) return rows;
    if (header.indexes.sales_id != null) return rows;

    var salesMap = buildSalesMap(salesList);
    var kpiIndex = header.indexes.kpi_id;
    var salesNameIndex = header.indexes.sales_kpi;
    rows[header.rowIndex][kpiIndex] = 'Sales_ID';
    for (var i = header.rowIndex + 1; i < rows.length; i++) {
      var row = rows[i];
      if (!row || !row.some(function (value) { return String(value == null ? '' : value).trim() !== ''; })) continue;
      var salesName = normalizeName(row[salesNameIndex]);
      var salesId = salesMap.get(salesName);
      if (!salesId) throw new Error('Nama Sales pada Invoice_Collection tidak ditemukan di daftar akun: ' + String(row[salesNameIndex] || '(kosong)'));
      row[kpiIndex] = salesId;
    }
    return rows;
  }

  function parseMonth(value) {
    var raw = String(value == null ? '' : value).trim();
    var match = raw.match(/^(\d{4})[-/](\d{1,2})(?:[-/].*)?$/);
    if (match) {
      var month = Number(match[2]);
      if (month >= 1 && month <= 12) return match[1] + '-' + String(month).padStart(2, '0');
    }
    if (/^\d{5}(?:\.\d+)?$/.test(raw)) {
      var date = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(raw)) * 86400000);
      return date.toISOString().slice(0, 7);
    }
    if (root.FADE_VALIDATOR && typeof root.FADE_VALIDATOR.parseDateIso === 'function') {
      var iso = root.FADE_VALIDATOR.parseDateIso(raw);
      if (iso) return iso.slice(0, 7);
    }
    return null;
  }

  function parseSalesTargets(rawRows, salesList) {
    if (!Array.isArray(rawRows)) return null;
    var header = findHeader(rawRows, ['periode', 'sales', 'target_pcs']);
    if (!header) throw new Error('Header Periode, Sales, atau Target_PCS tidak ditemukan di Sales_Monthly.');

    var salesMap = buildSalesMap(salesList);
    var targets = [];
    var keys = new Set();
    for (var i = header.rowIndex + 1; i < rawRows.length; i++) {
      var row = rawRows[i] || [];
      if (!row.some(function (value) { return String(value == null ? '' : value).trim() !== ''; })) continue;
      var name = String(row[header.indexes.sales] || '').trim();
      var salesId = salesMap.get(normalizeName(name));
      var period = parseMonth(row[header.indexes.periode]);
      var rawTarget = row[header.indexes.target_pcs];
      var target = rawTarget == null || String(rawTarget).trim() === '' ? 0 : root.FADE_VALIDATOR.parseNumber(rawTarget);
      if (!salesId || !period || target == null || target < 0) {
        throw new Error('Baris ' + (i + 1) + ' di Sales_Monthly memiliki Sales, periode, atau target yang tidak valid.');
      }
      var key = salesId + '|' + period;
      if (keys.has(key)) throw new Error('Target ganda untuk ' + name + ' pada ' + period + '.');
      keys.add(key);
      targets.push({ key: key, target: target, salesId: salesId, period: period, data: { sourceRow: row } });
    }
    if (!targets.length) throw new Error('Sheet Sales_Monthly tidak memuat target yang dapat diimpor.');
    return targets;
  }

  root.FADE_MASTER_IMPORTER = {
    prepareInvoiceRows: prepareInvoiceRows,
    parseSalesTargets: parseSalesTargets
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
