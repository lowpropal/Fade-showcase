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
    var header = findHeader(rows, ['invoice_id']);
    if (!header) return rows;
    var salesMap = buildSalesMap(salesList);
    var salesNameIndex = header.indexes.sales_saat_ini != null ? header.indexes.sales_saat_ini : (header.indexes.sales_kpi != null ? header.indexes.sales_kpi : (header.indexes.sales_name != null ? header.indexes.sales_name : header.indexes.sales));
    var salesIdIndex = header.indexes.sales_id;
    if (salesNameIndex == null) {
      if (salesIdIndex != null) return rows;
      throw new Error('Kolom Sales_KPI atau Sales_Saat_Ini tidak ditemukan di Invoice_Collection.');
    }
    if (salesIdIndex == null) {
      salesIdIndex = rows[header.rowIndex].length;
      rows[header.rowIndex][salesIdIndex] = 'Sales_ID';
    }
    for (var i = header.rowIndex + 1; i < rows.length; i++) {
      var row = rows[i];
      if (!row || !row.some(function (value) { return String(value == null ? '' : value).trim() !== ''; })) continue;
      var existingSalesId = String(row[salesIdIndex] == null ? '' : row[salesIdIndex]).trim();
      var mappedExistingId = salesMap.get(normalizeName(existingSalesId));
      if (mappedExistingId) {
        row[salesIdIndex] = mappedExistingId;
        continue;
      }
      if (existingSalesId && (salesList || []).some(function (sales) { return sales && String(sales.id || '') === existingSalesId; })) continue;
      var salesName = normalizeName(row[salesNameIndex]);
      var salesId = salesMap.get(salesName);
      if (!salesId) throw new Error('Nama Sales pada Invoice_Collection tidak ditemukan di daftar akun: ' + String(row[salesNameIndex] || '(kosong)'));
      row[salesIdIndex] = salesId;
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
      function metric(headerName) {
        var index = header.indexes[headerName];
        return index == null ? null : root.FADE_VALIDATOR.parseNumber(row[index]);
      }
      targets.push({
        key: key,
        target: target,
        salesId: salesId,
        salesName: name,
        period: period,
        data: {
          salesName: name,
          salesType: String(row[header.indexes.jenis_sales] || '').trim(),
          qty: metric('qty_terjual'),
          revenue: metric('revenue_idr'),
          paid: metric('terbayar_idr'),
          outstanding: metric('outstanding_idr'),
          invoiceCount: metric('invoice_count'),
          clientCount: metric('client_count'),
          sourceRow: row
        }
      });
    }
    if (!targets.length) throw new Error('Sheet Sales_Monthly tidak memuat target yang dapat diimpor.');
    return targets;
  }

  function readSheetObjects(rawRows, requiredHeaders) {
    if (!Array.isArray(rawRows)) throw new Error('Sheet tidak terbaca.');
    var header = findHeader(rawRows, requiredHeaders);
    if (!header) throw new Error('Header sheet tidak sesuai dengan Master FADE.');
    return rawRows.slice(header.rowIndex + 1).filter(function (row) {
      return row && row.some(function (value) { return String(value == null ? '' : value).trim() !== ''; });
    }).map(function (row) {
      var item = {};
      Object.keys(header.indexes).forEach(function (key) { item[key] = row[header.indexes[key]]; });
      return item;
    });
  }

  function parseInvoiceDetails(rawRows) {
    var items = readSheetObjects(rawRows, ['invoice_id', 'sku', 'qty', 'net_idr']);
    var byInvoice = {};
    items.forEach(function (item) {
      var id = String(item.invoice_id || '').trim();
      if (!id) return;
      if (!byInvoice[id]) byInvoice[id] = [];
      byInvoice[id].push({
        sku: String(item.sku || '').trim(),
        name: String(item.nama_produk || '').trim(),
        category: String(item.kategori || '').trim(),
        status: String(item.status_baris || 'Terjual').trim(),
        qty: Number(item.qty || 0),
        unitPrice: Number(item.harga_satuan_idr || 0),
        subtotal: Number(item.net_idr || 0),
        discount: Number(item.potongan_baris_idr || 0),
        note: String(item.catatan || '').trim()
      });
    });
    return byInvoice;
  }

  function parseProductSummary(rawValue) {
    var raw = String(rawValue == null ? '' : rawValue).trim();
    if (!raw || raw.indexOf('|') < 0) return [];
    return raw.split(/\s*;\s*/).map(function (entry) {
      var parts = entry.split('|').map(function (part) { return part.trim(); });
      if (!parts[0]) return null;
      var identity = parts[0].match(/^(\S+)\s+([A-Z])\s+(.+)$/);
      var unitPriceLabel = (parts[3] || '').replace(/^@\s*/, '').trim();
      var subtotalLabel = (parts[4] || '').replace(/^net\s*/i, '').trim();
      var qtyMatch = String(parts[2] || '').match(/(-?\d[\d.,]*)/);
      return {
        sku: identity ? identity[1] : '',
        name: identity ? identity[3] : parts[0],
        status: parts[1] || 'Terjual',
        qty: qtyMatch ? Number(root.FADE_VALIDATOR.parseNumber(qtyMatch[1]) || 0) : 0,
        unitPrice: root.FADE_VALIDATOR.parseNumber(unitPriceLabel) || 0,
        unitPriceLabel: unitPriceLabel,
        subtotal: root.FADE_VALIDATOR.parseNumber(subtotalLabel) || 0,
        subtotalLabel: subtotalLabel
      };
    }).filter(Boolean);
  }

  function parseConsignmentBalances(rawRows, salesList) {
    var rows = readSheetObjects(rawRows, ['client_id', 'nama_toko', 'sku', 'qty_sisa']);
    var salesByName = buildSalesMap(salesList);
    return rows.map(function (row, rowIndex) {
      var clientId = String(row.client_id || '').trim();
      var sku = String(row.sku || '').trim();
      var salesName = String(row.sales_saat_ini || '').trim();
      var salesId = salesByName.get(normalizeName(salesName));
      var unassignedTemporaryStore = /^TMP[-_]/i.test(clientId) && !salesName;
      if (!salesId && !unassignedTemporaryStore) throw new Error('Sales_Saat_Ini tidak cocok dengan akun pada baris ' + (rowIndex + 1) + ': ' + (salesName || '(kosong)'));
      var quantities = [row.qty_titip, row.qty_terbayar, row.qty_retur_rusak, row.qty_sisa];
      if (quantities.some(function (value) { return value != null && String(value).trim() !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0); })) {
        throw new Error('Qty Consignment tidak valid pada baris ' + (rowIndex + 1) + '.');
      }
      return {
        id: clientId + ':' + sku + ':' + (rowIndex + 1),
        clientId: clientId,
        storeName: String(row.nama_toko || '').trim(),
        salesName: unassignedTemporaryStore ? 'Belum ditentukan' : salesName,
        salesId: salesId || null,
        sku: sku,
        productName: String(row.nama_produk || '').trim(),
        category: String(row.kategori || '').trim(),
        qtyConsigned: Number(row.qty_titip || 0),
        qtyPaid: Number(row.qty_terbayar || 0),
        qtyReturned: Number(row.qty_retur_rusak || 0),
        qtyRemaining: Number(row.qty_sisa || 0),
        remainingValue: Number(row.subtotal_sisa_idr || 0),
        physicalQty: row.qty_hitung_fisik == null ? null : Number(row.qty_hitung_fisik),
        stockStatus: String(row.status_stok || '').trim(),
        sourceNote: String(row.catatan || '').trim(),
        temporaryStoreId: /^TMP[-_]/i.test(clientId),
        source: 'FADE_Master_Consignment_FINAL'
      };
    }).filter(function (row) { return row.clientId && row.sku && row.storeName; });
  }

  root.FADE_MASTER_IMPORTER = {
    prepareInvoiceRows: prepareInvoiceRows,
    parseSalesTargets: parseSalesTargets,
    parseInvoiceDetails: parseInvoiceDetails,
    parseProductSummary: parseProductSummary,
    parseConsignmentBalances: parseConsignmentBalances
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
