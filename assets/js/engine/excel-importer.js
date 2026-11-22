/**
 * FADE Pods · excel-importer.js
 * Enhanced, resilient Excel (.xlsx) and CSV parser with multi-row header detection,
 * controlled canonical alias resolution, and transaction validation.
 */
(function (root) {
  'use strict';

  var Validator = (typeof require !== 'undefined')
    ? require('./validator.js')
    : root.FADE_VALIDATOR;

  // CANONICAL FIELD DEFINITIONS & CONTROLLED ALIASES
  var FIELD_SPECS = [
    {
      key: 'invoice_id',
      mandatory: true,
      aliases: ['invoice_id', 'no_invoice', 'nomor_invoice', 'id_invoice', 'invoice_no', 'inv_id', 'id']
    },
    {
      key: 'invoice_date',
      mandatory: true,
      aliases: ['invoice_date', 'tanggal_invoice', 'tgl_invoice', 'tanggal', 'tgl', 'date'],
      exclude: ['due', 'jatuh', 'bayar', 'tempo', 'last']
    },
    {
      key: 'store_name',
      mandatory: true,
      aliases: ['store_name', 'nama_toko', 'toko', 'store', 'outlet', 'client_name', 'nama_client'],
      exclude: ['id']
    },
    {
      key: 'store_id',
      mandatory: false,
      aliases: ['store_id', 'client_id', 'id_toko', 'id_client']
    },
    {
      key: 'sales_name',
      mandatory: true,
      aliases: ['sales_name', 'sales_saat_ini', 'sales_kpi', 'sales', 'penjual', 'nama_sales'],
      exclude: ['id']
    },
    {
      key: 'sales_id',
      mandatory: false,
      aliases: ['sales_id', 'id_sales', 'kpi_id']
    },
    {
      key: 'qty',
      mandatory: true,
      aliases: ['qty', 'qty_pcs', 'kuantitas', 'jumlah_unit', 'unit', 'qty_terjual'],
      exclude: ['invoice', 'record', 'baris', 'type', 'wrong']
    },
    {
      key: 'unit_price_idr',
      mandatory: false,
      aliases: ['unit_price_idr', 'harga_satuan', 'harga', 'unit_price']
    },
    // Priority: Paid_Total_IDR checked before Invoice_Total_IDR to prevent collision!
    {
      key: 'paid_total_idr',
      mandatory: false,
      aliases: ['paid_total_idr', 'terbayar_idr', 'total_bayar', 'jumlah_bayar', 'terbayar', 'paid_total']
    },
    {
      key: 'invoice_total_idr',
      mandatory: true,
      aliases: ['invoice_total_idr', 'revenue_idr', 'total_invoice', 'nilai_invoice', 'nilai', 'revenue', 'total_tagihan', 'amount'],
      exclude: ['paid', 'terbayar', 'bayar', 'outstanding', 'sisa']
    },
    {
      key: 'due_date',
      mandatory: false,
      aliases: ['due_date', 'jatuh_tempo', 'tgl_jatuh_tempo', 'tanggal_jatuh_tempo']
    },
    {
      key: 'other_settlement_idr',
      mandatory: false,
      aliases: ['penyelesaian_lain_idr', 'penyelesaian_lain', 'settlement', 'adjustment']
    },
    {
      key: 'outstanding_idr',
      mandatory: false,
      aliases: ['outstanding_idr', 'sisa_tagihan', 'sisa', 'outstanding']
    },
    {
      key: 'last_payment_date',
      mandatory: false,
      aliases: ['last_payment_date', 'tgl_bayar_terakhir', 'tanggal_bayar_terakhir', 'payment_date']
    },
    {
      key: 'product_name',
      mandatory: false,
      aliases: ['product', 'nama_produk', 'produk', 'rincian_produk', 'product_name']
    },
    {
      key: 'payment_status',
      mandatory: false,
      aliases: ['payment_status', 'status_bayar', 'status']
    },
    {
      key: 'defect_type',
      mandatory: false,
      aliases: ['defect_type', 'expected_diagnostic', 'tipe_cacat', 'diagnostic']
    }
  ];

  function normalizeStr(s) {
    if (s == null) return '';
    return String(s).toLowerCase().replace(/[\s\.\-]+/g, '_').trim();
  }

  function matchColumn(headerName) {
    var norm = normalizeStr(headerName);
    if (!norm) return null;

    // PASS 1: Exact alias match (highest fidelity)
    for (var i = 0; i < FIELD_SPECS.length; i++) {
      var spec = FIELD_SPECS[i];
      if (spec.aliases.indexOf(norm) >= 0) {
        return spec.key;
      }
    }

    // PASS 2: Controlled substring match for multi-character aliases (> 3 chars)
    for (var j = 0; j < FIELD_SPECS.length; j++) {
      var spec2 = FIELD_SPECS[j];
      if (spec2.exclude) {
        var excluded = false;
        for (var e = 0; e < spec2.exclude.length; e++) {
          if (norm.indexOf(spec2.exclude[e]) >= 0) {
            excluded = true;
            break;
          }
        }
        if (excluded) continue;
      }

      for (var a = 0; a < spec2.aliases.length; a++) {
        var alias = spec2.aliases[a];
        if (alias.length <= 3) continue; // Skip short aliases ('id', 'tgl', 'qty') from substring matching
        if (norm.indexOf(alias) >= 0) {
          return spec2.key;
        }
      }
    }
    return null;
  }

  function detectHeaderRow(rawRows) {
    var maxScan = Math.min(rawRows.length, 10);
    var bestRowIdx = -1;
    var bestScore = 0;
    var bestMapping = {};

    for (var r = 0; r < maxScan; r++) {
      var row = rawRows[r];
      if (!row || !row.length) continue;

      var currentMapping = {};
      var matchedCount = 0;
      var mandatoryMatched = 0;

      for (var colIdx = 0; colIdx < row.length; colIdx++) {
        var colVal = row[colIdx];
        var matchedKey = matchColumn(colVal);
        if (matchedKey && currentMapping[matchedKey] == null) {
          currentMapping[matchedKey] = colIdx;
          matchedCount++;
          for (var s = 0; s < FIELD_SPECS.length; s++) {
            if (FIELD_SPECS[s].key === matchedKey && FIELD_SPECS[s].mandatory) {
              mandatoryMatched++;
              break;
            }
          }
        }
      }

      // Must match at least 2 mandatory fields to qualify as a valid table header
      var score = matchedCount + (mandatoryMatched * 3);
      if (mandatoryMatched >= 2 && score > bestScore) {
        bestScore = score;
        bestRowIdx = r;
        bestMapping = currentMapping;
      }
    }

    return {
      headerRowIndex: bestRowIdx,
      columnMapping: bestMapping,
      detectedBannerRows: bestRowIdx > 0 ? rawRows.slice(0, bestRowIdx) : []
    };
  }

  function mapRawRowToCanonical(row, mapping) {
    var rec = {};
    for (var key in mapping) {
      var colIdx = mapping[key];
      rec[key] = (row[colIdx] != null) ? row[colIdx] : null;
    }
    return rec;
  }

  function processParsedRows(rawRows, options) {
    options = options || {};
    if (!rawRows || !rawRows.length) {
      return {
        success: false,
        error: 'File kosong atau tidak memuat data yang dapat dibaca',
        records: [],
        totalRows: 0
      };
    }

    var detection = detectHeaderRow(rawRows);
    if (detection.headerRowIndex < 0) {
      return {
        success: false,
        error: 'Baris header tidak terdeteksi. Kolom mandatory (Toko, QTY, Nilai/Tanggal) tidak ditemukan.',
        records: [],
        totalRows: rawRows.length
      };
    }

    var hIdx = detection.headerRowIndex;
    var mapping = detection.columnMapping;
    var dataRows = rawRows.slice(hIdx + 1);

    var rawRecords = [];
    dataRows.forEach(function (row, idx) {
      if (!row || !row.some(function (c) { return String(c || '').trim() !== ''; })) return;
      var canonical = mapRawRowToCanonical(row, mapping);
      canonical._rawRowIndex = hIdx + 1 + idx + 1; // 1-based index in Excel
      rawRecords.push(canonical);
    });

    var validation = Validator.validateBatch(rawRecords, {
      cutoff: options.cutoff || Validator.DEFAULT_CUTOFF,
      storeDirectory: options.storeDirectory || null,
      salesDirectory: options.salesDirectory || null,
      existingIds: options.existingIds || []
    });

    var normalizedRecords = [];
    validation.details.forEach(function (res, idx) {
      var raw = rawRecords[idx];
      var qty = Validator.parseNumber(raw.qty) || 0;
      var total = Validator.parseNumber(raw.invoice_total_idr) || 0;
      var paid = Validator.parseNumber(raw.paid_total_idr) || 0;
      var settl = Validator.parseNumber(raw.other_settlement_idr) || 0;
      var outstanding = Validator.parseNumber(raw.outstanding_idr);
      if (outstanding === null) {
        outstanding = Math.max(0, total - paid - settl);
      }
      var invDate = Validator.parseDateIso(raw.invoice_date);
      var dueDate = Validator.parseDateIso(raw.due_date);
      var lastPay = Validator.parseDateIso(raw.last_payment_date);

      var status = raw.payment_status;
      if (!status) {
        if (outstanding <= 0) status = 'Paid';
        else if (paid > 0) status = 'Partial';
        else status = 'Unpaid';
      }

      var normRec = {
        invoice_id: String(raw.invoice_id || '').trim(),
        invoice_date: invDate,
        store_name: String(raw.store_name || raw.store_id || '').trim(),
        store_id: raw.store_id ? String(raw.store_id).trim() : null,
        sales_name: String(raw.sales_name || raw.sales_id || '').trim(),
        sales_id: raw.sales_id ? String(raw.sales_id).trim() : null,
        product_name: raw.product_name ? String(raw.product_name).trim() : null,
        qty: qty,
        unit_price_idr: Validator.parseNumber(raw.unit_price_idr) || 0,
        invoice_total_idr: total,
        due_date: dueDate,
        paid_total_idr: paid,
        other_settlement_idr: settl,
        outstanding_idr: outstanding,
        last_payment_date: lastPay,
        payment_status: status,
        defect_type: raw.defect_type ? String(raw.defect_type).trim() : null,
        _isValid: res.isValid,
        _errors: res.errors,
        _warnings: res.warnings,
        _excelRow: raw._rawRowIndex
      };
      normalizedRecords.push(normRec);
    });

    return {
      success: validation.isClean || (options.allowPartial && validation.validCount > 0),
      isClean: validation.isClean,
      headerRowIndex: hIdx,
      columnMapping: mapping,
      bannerRowsCount: detection.detectedBannerRows.length,
      totalRows: normalizedRecords.length,
      validCount: validation.validCount,
      invalidCount: validation.invalidCount,
      records: normalizedRecords,
      validation: validation
    };
  }

  function kolomIdx(ref) {
    var s = String(ref || 'A1').replace(/[0-9]/g, ''), n = 0;
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }

  var Importer = {
    detectHeaderRow: detectHeaderRow,
    processParsedRows: processParsedRows,
    matchColumn: matchColumn,
    kolomIdx: kolomIdx,
    FIELD_SPECS: FIELD_SPECS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Importer;
  }
  root.FADE_IMPORTER = Importer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
