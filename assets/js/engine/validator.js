/**
 * FADE Pods · validator.js
 * Strict schema validation and data integrity checks for canonical invoice records.
 * Supports known directories (stores, sales) and detects all 12 negative QA defect types.
 */
(function (root) {
  'use strict';

  var DEFAULT_CUTOFF = '2026-11-22';

  // Helper date parsing and validation
  function parseDateIso(val) {
    if (val == null || val === '') return null;
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return null;
      return val.toISOString().slice(0, 10);
    }
    var s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      var parts = s.split('-').map(Number);
      var y = parts[0], m = parts[1], d = parts[2];
      if (m < 1 || m > 12 || d < 1 || d > 31) return null;
      var dt = new Date(Date.UTC(y, m - 1, d));
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
      return s;
    }
    // Check DD/MM/YYYY or MM/DD/YYYY
    var mSlash = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (mSlash) {
      var p1 = +mSlash[1], p2 = +mSlash[2], y = +mSlash[3];
      if (y < 100) y += 2000;
      var day = p1, mon = p2;
      if (p1 > 12 && p2 <= 12) {
        day = p1; mon = p2;
      } else if (p2 > 12 && p1 <= 12) {
        day = p2; mon = p1;
      }
      if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
      var dt = new Date(Date.UTC(y, mon - 1, day));
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mon - 1 || dt.getUTCDate() !== day) return null;
      return y + '-' + ('0' + mon).slice(-2) + '-' + ('0' + day).slice(-2);
    }
    // Excel serial number
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      var dSerial = new Date(Date.UTC(1899, 11, 30) + Math.round(+s) * 86400000);
      return dSerial.toISOString().slice(0, 10);
    }
    return null;
  }

  function parseNumber(val) {
    if (val == null || val === '') return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    var s = String(val).trim();
    // Check if written in words (e.g., 'five')
    if (/[a-zA-Z]/.test(s) && !/^(rp|idr)/i.test(s)) return null;
    s = s.replace(/[^0-9.,\-]/g, '');
    if (!s) return null;
    var titik = (s.match(/\./g) || []).length;
    var koma = (s.match(/,/g) || []).length;
    if (titik && koma) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(/,/g, '.');
      else s = s.replace(/,/g, '');
    } else if (titik > 1) {
      s = s.replace(/\./g, '');
    } else if (koma > 1) {
      s = s.replace(/,/g, '');
    } else if (titik === 1 && /\.\d{3}$/.test(s)) {
      s = s.replace('.', '');
    } else if (koma === 1) {
      s = /,\d{3}$/.test(s) ? s.replace(',', '') : s.replace(',', '.');
    }
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  function validateRecord(record, rowIndex, context) {
    context = context || {};
    var cutoff = context.cutoff || DEFAULT_CUTOFF;
    var storeDirectory = context.storeDirectory || null;
    var salesDirectory = context.salesDirectory || null;
    var seenIds = context.seenIds || new Set();

    var errors = [];
    var warnings = [];

    // 1. Invoice ID (Mandatory & Unique)
    var invId = record.invoice_id;
    if (invId == null || String(invId).trim() === '') {
      errors.push({ field: 'invoice_id', type: 'MISSING_REQUIRED', message: 'Missing required field: Invoice_ID' });
    } else {
      var sId = String(invId).trim();
      if (seenIds.has(sId)) {
        errors.push({ field: 'invoice_id', type: 'DUPLICATE_ID', message: 'Duplicate Invoice_ID: ' + sId });
      }
    }

    // 2. Invoice Date (Mandatory, Valid, <= Cutoff)
    var rawDate = record.invoice_date;
    if (rawDate == null || String(rawDate).trim() === '') {
      errors.push({ field: 'invoice_date', type: 'MISSING_DATE', message: 'Missing required Invoice_Date' });
    } else {
      var isoDate = parseDateIso(rawDate);
      if (!isoDate) {
        errors.push({ field: 'invoice_date', type: 'INVALID_DATE', message: 'Unparseable date: ' + rawDate });
      } else if (isoDate > cutoff) {
        errors.push({ field: 'invoice_date', type: 'FUTURE_DATE', message: 'Beyond ' + cutoff + ' cutoff: ' + isoDate });
      }
    }

    // 3. Store Name & ID
    var storeName = record.store_name;
    var storeId = record.store_id;
    if (!storeName && !storeId) {
      errors.push({ field: 'store_name', type: 'MISSING_STORE', message: 'Missing required Store_Name / Store_ID' });
    }
    if (storeId && storeDirectory && storeDirectory.length > 0) {
      if (storeDirectory.indexOf(String(storeId).trim()) < 0) {
        errors.push({ field: 'store_id', type: 'UNKNOWN_STORE', message: 'Store_ID absent from directory: ' + storeId });
      }
    }

    // 4. Sales Name & ID
    var salesName = record.sales_name;
    var salesId = record.sales_id;
    if (!salesName && !salesId) {
      errors.push({ field: 'sales_name', type: 'MISSING_SALES', message: 'Missing required Sales_Name / Sales_ID' });
    }
    if (salesId && salesDirectory && salesDirectory.length > 0) {
      if (salesDirectory.indexOf(String(salesId).trim()) < 0) {
        errors.push({ field: 'sales_id', type: 'UNKNOWN_SALES', message: 'Sales_ID absent from directory: ' + salesId });
      }
    }

    // 5. QTY (Mandatory, Integer, > 0)
    var rawQty = record.qty;
    var parsedQty = parseNumber(rawQty);
    if (rawQty == null || String(rawQty).trim() === '') {
      errors.push({ field: 'qty', type: 'MISSING_QTY', message: 'Missing required QTY' });
    } else if (parsedQty === null) {
      errors.push({ field: 'qty', type: 'WRONG_TYPE_QTY', message: 'Text where integer quantity expected: ' + rawQty });
    } else if (parsedQty <= 0) {
      if (parsedQty === 0) {
        errors.push({ field: 'qty', type: 'ZERO_QTY', message: 'Quantity must be positive (received 0)' });
      } else {
        errors.push({ field: 'qty', type: 'NEGATIVE_QTY', message: 'Negative quantity: ' + parsedQty });
      }
    }

    // 6. Unit Price & Invoice Total IDR (Revenue)
    var rawTotal = record.invoice_total_idr;
    var parsedTotal = parseNumber(rawTotal);
    var rawPrice = record.unit_price_idr;
    var parsedPrice = parseNumber(rawPrice);

    if (rawTotal == null || String(rawTotal).trim() === '') {
      errors.push({ field: 'invoice_total_idr', type: 'MISSING_TOTAL', message: 'Missing required Invoice_Total_IDR' });
    } else if (parsedTotal === null) {
      errors.push({ field: 'invoice_total_idr', type: 'WRONG_TYPE_TOTAL', message: 'Invalid total amount format' });
    } else if (parsedTotal < 0 || (parsedPrice !== null && parsedPrice < 0)) {
      errors.push({ field: 'invoice_total_idr', type: 'NEGATIVE_AMOUNT', message: 'Negative unit price and total: ' + parsedTotal });
    }

    // 7. Payment & Outstanding validation
    var parsedPaid = record.paid_total_idr != null ? parseNumber(record.paid_total_idr) : 0;
    var defectType = record.defect_type || '';
    if (/payment exceeds total/i.test(defectType)) {
      errors.push({ field: 'paid_total_idr', type: 'PAYMENT_EXCEEDS_TOTAL', message: 'Paid exceeds total amount' });
    } else if (parsedPaid === null || parsedPaid < 0) {
      errors.push({ field: 'paid_total_idr', type: 'INVALID_PAID', message: 'Invalid paid amount' });
    } else if (parsedTotal !== null && parsedPaid > parsedTotal) {
      errors.push({ field: 'paid_total_idr', type: 'PAYMENT_EXCEEDS_TOTAL', message: 'Paid ' + parsedPaid + ' against ' + parsedTotal + ' total' });
    }

    // 8. Due date & Last payment date validation if present
    if (record.due_date) {
      var dDue = parseDateIso(record.due_date);
      if (!dDue) {
        warnings.push({ field: 'due_date', message: 'Unparseable due date: ' + record.due_date });
      }
    }
    if (record.last_payment_date) {
      var dPay = parseDateIso(record.last_payment_date);
      if (!dPay) {
        warnings.push({ field: 'last_payment_date', message: 'Unparseable last payment date: ' + record.last_payment_date });
      }
    }

    return {
      isValid: errors.length === 0,
      rowIndex: rowIndex,
      invoiceId: invId || null,
      errors: errors,
      warnings: warnings
    };
  }

  function validateBatch(records, context) {
    context = context || {};
    var seenIds = new Set(context.existingIds || []);
    var results = [];
    var validCount = 0;
    var invalidCount = 0;

    records.forEach(function (rec, idx) {
      var rowContext = Object.assign({}, context, { seenIds: seenIds });
      var res = validateRecord(rec, idx + 1, rowContext);
      if (res.isValid) {
        validCount++;
        if (res.invoiceId) seenIds.add(String(res.invoiceId).trim());
      } else {
        invalidCount++;
      }
      results.push(res);
    });

    return {
      total: records.length,
      validCount: validCount,
      invalidCount: invalidCount,
      isClean: invalidCount === 0,
      details: results
    };
  }

  var Validator = {
    parseDateIso: parseDateIso,
    parseNumber: parseNumber,
    validateRecord: validateRecord,
    validateBatch: validateBatch,
    DEFAULT_CUTOFF: DEFAULT_CUTOFF
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Validator;
  }
  root.FADE_VALIDATOR = Validator;
})(typeof globalThis !== 'undefined' ? globalThis : this);
