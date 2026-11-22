/**
 * FADE Pods Showcase v0.2 · Storage & State Manager
 * Standalone client-side data management using browser localStorage.
 */
(function (root) {
  'use strict';

  var STORAGE_KEYS = {
    INVOICES: 'fade_showcase_invoices_v021',
    TARGETS: 'fade_showcase_targets_v021',
    SALES: 'fade_showcase_sales_v021',
    STORES: 'fade_showcase_stores_v021',
    SESSION: 'fade_showcase_session_v021',
    THEME: 'fade_showcase_theme_v02',
    UPLOAD_LOG: 'fade_showcase_upload_history_v021',
    INITIALIZED: 'fade_showcase_initialized_v021'
  };

  function getSeed() {
    return root.FADE_SYNTHETIC_SEED || {
      meta: { isSynthetic: false },
      sales: [],
      stores: [],
      targets: {},
      invoices: []
    };
  }

  function init() {
    try {
      var isInit = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
      var rawInvoices = localStorage.getItem(STORAGE_KEYS.INVOICES);
      // Auto-reset if not initialized or if legacy dummy data (QA26- prefix) detected
      var hasDummy = false;
      if (rawInvoices) {
        try {
          var parsed = JSON.parse(rawInvoices);
          if (Array.isArray(parsed) && parsed.length > 0) {
            var firstId = String(parsed[0].id || parsed[0].invoice_id || '');
            if (firstId.startsWith('QA26-') || firstId.includes('SYN-')) {
              hasDummy = true;
            }
          }
        } catch (e) {
          hasDummy = true;
        }
      }

      if (!isInit || !rawInvoices || hasDummy) {
        resetToDefault();
      }
    } catch (e) {
      console.warn('localStorage access failed, using in-memory state', e);
    }
  }

  function resetToDefault() {
    var seed = getSeed();
    try {
      localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(seed.invoices));
      localStorage.setItem(STORAGE_KEYS.TARGETS, JSON.stringify(seed.targets));
      localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(seed.sales));
      localStorage.setItem(STORAGE_KEYS.STORES, JSON.stringify(seed.stores));
      localStorage.setItem(STORAGE_KEYS.UPLOAD_LOG, JSON.stringify([
        {
          timestamp: '2026-11-18T17:00:00Z',
          filename: 'FADE_Master_2_Sheet_18Nov2026.xlsx',
          rowsIngested: seed.invoices.length,
          validCount: seed.invoices.length,
          invalidCount: 0,
          uploadedBy: 'Administrator',
          status: 'Success',
          notes: 'Master Data Cut-off 18 Nov 2026 (Sheet 1: Invoice_Collection, Sheet 2: Sales_Monthly)'
        }
      ]));
      localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    } catch (e) {
      console.error('Failed to reset store', e);
    }
  }

  function getInvoices() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.INVOICES);
      return raw ? JSON.parse(raw) : getSeed().invoices;
    } catch (e) {
      return getSeed().invoices;
    }
  }

  function saveInvoices(invoices) {
    try {
      localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(invoices));
      return true;
    } catch (e) {
      console.error('Failed to save invoices', e);
      return false;
    }
  }

  function normalizeInvoiceRecord(data) {
    var qty = Math.max(1, Number(data.qty || 1));
    var unitPrice = Math.max(0, Number(data.unitPrice != null ? data.unitPrice : (data.unit_price_idr || 0)));
    var invoiceTotal = data.invoiceTotal != null ? Number(data.invoiceTotal) : (qty * unitPrice);
    var otherSettlement = Math.max(0, Number(data.otherSettlement != null ? data.otherSettlement : (data.other_settlement_idr || data.penyelesaianLain || 0)));
    var paidTotal = Math.max(0, Math.min(invoiceTotal - otherSettlement, Number(data.paidTotal != null ? data.paidTotal : (data.paid_total_idr || 0))));
    var outstanding = Math.max(0, invoiceTotal - otherSettlement - paidTotal);
    var status = outstanding <= 0 ? 'PAID' : (paidTotal > 0 ? 'PARTIAL' : 'UNPAID');

    var sName = (data.salesName || data.sales_name || data.salesKpi || '').trim();
    var sId = data.salesId || data.sales_id || ('SLS-' + (sName ? sName.toUpperCase().slice(0, 3) : 'CUSTOM'));

    return {
      id: data.id || data.invoice_id || generateNextInvoiceId(),
      date: data.date || data.invoice_date || '2026-11-18',
      periode: data.periode || (data.date ? data.date.slice(0, 7) : '2026-11'),
      storeId: data.storeId || data.store_id || data.clientId || 'ST-CUSTOM',
      storeName: (data.storeName || data.store_name || '').trim(),
      salesId: sId,
      salesName: sName,
      salesHistoris: data.salesHistoris || sName,
      salesSaatIni: data.salesSaatIni || sName,
      salesKpi: sName,
      productName: (data.productName || data.product_name || 'FADE Products').trim(),
      qty: qty,
      qtyGratis: Number(data.qtyGratis || data.qty_gratis_pcs || 0),
      unitPrice: unitPrice,
      invoiceTotal: invoiceTotal,
      dueDate: data.dueDate || data.due_date || null,
      paidTotal: paidTotal,
      otherSettlement: otherSettlement,
      outstanding: outstanding,
      lastPaymentDate: paidTotal > 0 ? (data.lastPaymentDate || data.last_payment_date || data.date || '2026-11-18') : null,
      status: status,
      statusBayarRaw: data.statusBayarRaw || (status === 'PAID' ? 'Lunas' : (status === 'PARTIAL' ? 'Sebagian Terbayar' : 'Belum Bayar')),
      jenisPartner: data.jenisPartner || data.partnerType || 'Retail',
      statusAkun: data.statusAkun || data.accountStatus || 'Aktif',
      rincianProduk: data.rincianProduk || data.rincian_produk || ''
    };
  }

  function generateNextInvoiceId() {
    var list = getInvoices();
    var maxNum = 39;
    list.forEach(function (inv) {
      var id = String(inv.id || inv.invoice_id || '');
      var m = id.match(/SI\.2026\.11\.(\d+)/i);
      if (m) {
        var n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    var next = maxNum + 1;
    return 'SI.2026.11.' + String(next).padStart(5, '0');
  }

  function addInvoice(data) {
    var list = getInvoices();
    var rec = normalizeInvoiceRecord(data);
    // Ensure unique ID
    var exists = list.some(function (i) { return (i.id || i.invoice_id) === rec.id; });
    if (exists) {
      rec.id = generateNextInvoiceId();
    }
    list.unshift(rec);
    saveInvoices(list);
    return rec;
  }

  function updateInvoice(id, updates) {
    var list = getInvoices();
    var idx = list.findIndex(function (i) { return (i.id || i.invoice_id) === id; });
    if (idx === -1) return null;
    var merged = Object.assign({}, list[idx], updates, { id: id });
    var updated = normalizeInvoiceRecord(merged);
    list[idx] = updated;
    saveInvoices(list);
    return updated;
  }

  function deleteInvoice(id) {
    var list = getInvoices();
    var filtered = list.filter(function (i) { return (i.id || i.invoice_id) !== id; });
    if (filtered.length === list.length) return false;
    saveInvoices(filtered);
    return true;
  }

  function recordPayment(id, amount, paymentDate) {
    var list = getInvoices();
    var idx = list.findIndex(function (i) { return (i.id || i.invoice_id) === id; });
    if (idx === -1) return null;
    var inv = list[idx];
    var currentPaid = Number(inv.paidTotal != null ? inv.paidTotal : (inv.paid_total_idr || 0));
    var addAmt = Math.max(0, Number(amount || 0));
    var updated = normalizeInvoiceRecord(Object.assign({}, inv, {
      paidTotal: currentPaid + addAmt,
      lastPaymentDate: paymentDate || '2026-11-22'
    }));
    list[idx] = updated;
    saveInvoices(list);
    return updated;
  }

  function getTargets() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.TARGETS);
      var parsed = raw ? JSON.parse(raw) : {};
      return Object.assign({}, getSeed().targets, parsed);
    } catch (e) {
      return getSeed().targets;
    }
  }

  function getSalesList() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.SALES);
      return raw ? JSON.parse(raw) : getSeed().sales;
    } catch (e) {
      return getSeed().sales;
    }
  }

  function getUniqueSalesNames() {
    var set = new Set();
    getInvoices().forEach(function (i) {
      var s = i.salesName || i.sales_name;
      if (s) set.add(s);
    });
    if (set.size === 0) {
      getSalesList().forEach(function (s) {
        if (s.name) set.add(s.name);
      });
    }
    return Array.from(set).sort();
  }

  function getUniqueStoreNames() {
    var set = new Set();
    getStoresList().forEach(function (st) {
      if (st.name) set.add(st.name);
    });
    getInvoices().forEach(function (i) {
      var st = i.storeName || i.store_name;
      if (st) set.add(st);
    });
    return Array.from(set).sort();
  }

  function getStoresList() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.STORES);
      return raw ? JSON.parse(raw) : getSeed().stores;
    } catch (e) {
      return getSeed().stores;
    }
  }

  function getActiveSession() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.SESSION);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function setActiveSession(session) {
    try {
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEYS.SESSION);
    } catch (e) {}
  }

  function getTheme() {
    try {
      return localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
    } catch (e) {
      return 'dark';
    }
  }

  function setTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
    } catch (e) {}
  }

  function getUploadHistory() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.UPLOAD_LOG);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function addUploadHistory(entry) {
    try {
      var list = getUploadHistory();
      list.unshift(entry);
      localStorage.setItem(STORAGE_KEYS.UPLOAD_LOG, JSON.stringify(list.slice(0, 50)));
    } catch (e) {}
  }

  init();

  var Store = {
    init: init,
    resetToDefault: resetToDefault,
    getInvoices: getInvoices,
    saveInvoices: saveInvoices,
    addInvoice: addInvoice,
    updateInvoice: updateInvoice,
    deleteInvoice: deleteInvoice,
    recordPayment: recordPayment,
    generateNextInvoiceId: generateNextInvoiceId,
    getTargets: getTargets,
    getSalesList: getSalesList,
    getUniqueSalesNames: getUniqueSalesNames,
    getUniqueStoreNames: getUniqueStoreNames,
    getStoresList: getStoresList,
    getActiveSession: getActiveSession,
    setActiveSession: setActiveSession,
    clearSession: clearSession,
    getTheme: getTheme,
    setTheme: setTheme,
    getUploadHistory: getUploadHistory,
    addUploadHistory: addUploadHistory,
    STORAGE_KEYS: STORAGE_KEYS
  };

  root.FADE_STORE = Store;
})(typeof globalThis !== 'undefined' ? globalThis : this);
