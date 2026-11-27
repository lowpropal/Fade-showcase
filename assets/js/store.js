/**
 * FADE Pods Showcase v0.2 · Storage & State Manager
 * Standalone client-side data management using browser localStorage.
 */
(function (root) {
  'use strict';

  var STORAGE_KEYS = {
    INVOICES: 'fade_showcase_invoices_v021',
    REWARDS: 'fade_showcase_client_rewards_v1',
    TARGETS: 'fade_showcase_targets_v021',
    SALES_MONTHLY: 'fade_showcase_sales_monthly_v1',
    SALES: 'fade_showcase_sales_v021',
    STORES: 'fade_showcase_stores_v021',
    CONSIGNMENT: 'fade_showcase_consignment_v1',
    SESSION: 'fade_showcase_session_v021',
    THEME: 'fade_showcase_theme_v02',
    UPLOAD_LOG: 'fade_showcase_upload_history_v021',
    SNAPSHOTS: 'fade_showcase_upload_snapshots_v021',
    REWARD_SNAPSHOTS: 'fade_showcase_reward_snapshots_v1',
    AUDIT_LOG: 'fade_showcase_audit_log_v021',
    INITIALIZED: 'fade_showcase_initialized_v021'
  };
  var pendingBackendWrites = Promise.resolve();

  function trackBackendWrite(write, resource) {
    pendingBackendWrites = Promise.all([
      pendingBackendWrites.catch(function () {}),
      write
    ]).then(function () {
      return true;
    }).catch(async function () {
      try {
        hydrateFromBackend(await root.FADE_AUTH.loadDataset());
      } catch (reloadError) {
        clearSession();
        if (root.location) root.location.replace('./index.html?error=backend');
      }
      root.dispatchEvent(new CustomEvent('fade:backend-save-error', { detail: { resource: resource } }));
      throw new Error('Perubahan gagal disimpan ke server.');
    });
    pendingBackendWrites.catch(function () {});
    return pendingBackendWrites;
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
    if (root.FADE_AUTH) {
      return root.FADE_AUTH.loadDataset().then(hydrateFromBackend);
    }
    try {
      localStorage.setItem(STORAGE_KEYS.INVOICES, '[]');
      localStorage.setItem(STORAGE_KEYS.REWARDS, '[]');
      localStorage.setItem(STORAGE_KEYS.TARGETS, '{}');
      localStorage.setItem(STORAGE_KEYS.SALES, '[]');
      localStorage.setItem(STORAGE_KEYS.STORES, '[]');
      localStorage.setItem(STORAGE_KEYS.UPLOAD_LOG, '[]');
      localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    } catch (e) {
      console.error('Failed to reset store', e);
    }
  }

  function getInvoices() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.INVOICES);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveInvoices(invoices, options) {
    options = options || {};
    try {
      var previous = localStorage.getItem(STORAGE_KEYS.INVOICES);
      var previousIds = previous ? JSON.parse(previous).map(function (invoice) { return invoice.id || invoice.invoice_id; }) : [];
      localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(invoices));
      if (!options.skipBackend && root.FADE_AUTH && root.FADE_STORE.getActiveSession()) {
        trackBackendWrite(root.FADE_AUTH.persistInvoices(invoices, previousIds), 'invoice');
      }
      return true;
    } catch (e) {
      console.error('Failed to save invoices', e);
      return false;
    }
  }

  function getRewards() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.REWARDS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function getConsignmentBalances() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.CONSIGNMENT);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveConsignmentBalances(rows, options) {
    options = options || {};
    var normalized = Array.isArray(rows) ? rows : [];
    try {
      localStorage.setItem(STORAGE_KEYS.CONSIGNMENT, JSON.stringify(normalized));
      if (!options.skipBackend && root.FADE_AUTH && root.FADE_STORE.getActiveSession()) {
        trackBackendWrite(root.FADE_AUTH.persistConsignmentBalances(normalized), 'consignment');
      }
      return true;
    } catch (e) {
      console.error('Failed to save consignment balances', e);
      return false;
    }
  }

  function saveRewards(rewards, options) {
    options = options || {};
    try {
      var previous = localStorage.getItem(STORAGE_KEYS.REWARDS);
      var previousIds = previous ? JSON.parse(previous).map(function (reward) { return reward.id || reward.reward_id; }) : [];
      var normalized = Array.isArray(rewards) ? rewards : [];
      localStorage.setItem(STORAGE_KEYS.REWARDS, JSON.stringify(normalized));
      if (!options.skipBackend && root.FADE_AUTH && root.FADE_STORE.getActiveSession()) {
        trackBackendWrite(root.FADE_AUTH.persistRewards(normalized, previousIds), 'reward');
      }
      return true;
    } catch (e) {
      console.error('Failed to save client rewards', e);
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
      salesHistoris: data.salesHistoris || data.sales_historis || data.sales_lama || sName,
      salesSaatIni: data.salesSaatIni || data.sales_saat_ini || sName,
      salesKpi: data.salesKpi || data.sales_kpi || sName,
      picPerformance: data.picPerformance || data.pic_performance || data.sales_performance || data.salesKpi || data.sales_kpi || sName,
      productItems: Array.isArray(data.productItems) ? data.productItems : (Array.isArray(data.product_items) ? data.product_items : []),
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
      return parsed;
    } catch (e) {
      return {};
    }
  }

  function getSalesMonthlyMetrics() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.SALES_MONTHLY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveTargets(records, options) {
    options = options || {};
    try {
      var previous = getTargets();
      var next = {};
      (records || []).forEach(function (record) {
        if (record && record.key) next[record.key] = Number(record.target || 0);
      });
      localStorage.setItem(STORAGE_KEYS.TARGETS, JSON.stringify(next));
      if (Array.isArray(records)) {
        localStorage.setItem(STORAGE_KEYS.SALES_MONTHLY, JSON.stringify(records.map(function (record) {
          var data = record.data || {};
          var source = data.sourceRow || [];
          return {
            key: record.key,
            salesId: record.salesId || String(record.key || '').split('|')[0],
            salesName: data.salesName || record.salesName || '',
            period: record.period || String(record.key || '').split('|').pop(),
            qty: data.qty != null ? Number(data.qty) : Number(source[5] || 0),
            revenue: data.revenue != null ? Number(data.revenue) : Number(source[8] || 0),
            paid: data.paid != null ? Number(data.paid) : Number(source[9] || 0),
            outstanding: data.outstanding != null ? Number(data.outstanding) : Number(source[10] || 0),
            invoiceCount: data.invoiceCount != null ? Number(data.invoiceCount) : Number(source[11] || 0),
            clientCount: data.clientCount != null ? Number(data.clientCount) : Number(source[12] || 0)
          };
        })));
      }
      if (!options.skipBackend && root.FADE_AUTH && root.FADE_STORE.getActiveSession()) {
        trackBackendWrite(root.FADE_AUTH.persistTargets(records || [], Object.keys(previous)), 'target');
      }
      return { success: true, previous: previous, current: next };
    } catch (e) {
      return { success: false, reason: e.message };
    }
  }

  function getSalesList() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.SALES);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
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

  function getUniqueProductNames() {
    var set = new Set();
    [
      'FADE Core Pod 2ml',
      'FADE Plus Pod 2ml',
      'FADE Device Mini',
      'FADE Device Pro',
      'FADE - Cartridge Lite 3 In 1 V1',
      'FADE Ultra Single - Misty Sand',
      'FADE Fresh Series - Mint Fuel 30ml',
      'FADE Fruity Series - Mango Lush 30ml',
      'FADE Fruity Series - Lychee Breeze',
      'FADE Fruity Series - Grape Frost 30ml',
      'FADE Fruity Series - Kiwi Verde 30ml',
      'FADE Aero Bundling Kit - Ice Chrome'
    ].forEach(function (p) { set.add(p); });

    getInvoices().forEach(function (i) {
      var p = (i.productName || i.product_name || '').trim();
      if (p) set.add(p);
    });
    return Array.from(set).sort();
  }

  function getStoresList() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.STORES);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
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

  function hydrateFromBackend(dataset) {
    var targets = {};
    var salesMonthly = [];
    (dataset.targets || []).forEach(function (target) {
      targets[target.key] = target.target;
      var data = target.data || {};
      var source = data.sourceRow || [];
      salesMonthly.push({
        key: target.key,
        salesId: target.salesId || String(target.key || '').split('|')[0],
        salesName: data.salesName || target.salesName || '',
        period: String(target.key || '').split('|').pop(),
        qty: data.qty != null ? Number(data.qty) : Number(source[5] || 0),
        revenue: data.revenue != null ? Number(data.revenue) : Number(source[8] || 0),
        paid: data.paid != null ? Number(data.paid) : Number(source[9] || 0),
        outstanding: data.outstanding != null ? Number(data.outstanding) : Number(source[10] || 0),
        invoiceCount: data.invoiceCount != null ? Number(data.invoiceCount) : Number(source[11] || 0),
        clientCount: data.clientCount != null ? Number(data.clientCount) : Number(source[12] || 0)
      });
    });
    localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(dataset.invoices || []));
    localStorage.setItem(STORAGE_KEYS.REWARDS, JSON.stringify(dataset.rewards || []));
    localStorage.setItem(STORAGE_KEYS.TARGETS, JSON.stringify(targets));
    localStorage.setItem(STORAGE_KEYS.SALES_MONTHLY, JSON.stringify(salesMonthly));
    localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(dataset.sales || []));
    localStorage.setItem(STORAGE_KEYS.STORES, JSON.stringify(dataset.stores || []));
    localStorage.setItem(STORAGE_KEYS.CONSIGNMENT, JSON.stringify(dataset.consignment || []));
    localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  }

  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEYS.SESSION);
      [
        STORAGE_KEYS.INVOICES,
        STORAGE_KEYS.REWARDS,
        STORAGE_KEYS.TARGETS,
        STORAGE_KEYS.SALES_MONTHLY,
        STORAGE_KEYS.SALES,
        STORAGE_KEYS.STORES,
        STORAGE_KEYS.CONSIGNMENT,
        STORAGE_KEYS.UPLOAD_LOG,
        STORAGE_KEYS.SNAPSHOTS,
        STORAGE_KEYS.REWARD_SNAPSHOTS,
        STORAGE_KEYS.AUDIT_LOG,
        'fade_sales_docs_v1',
        STORAGE_KEYS.INITIALIZED
      ].forEach(function (key) { localStorage.removeItem(key); });
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

  function getSnapshots() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.SNAPSHOTS);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function hasSnapshot(uploadId) {
    if (!uploadId) return false;
    var sn = getSnapshots();
    return !!(sn[uploadId] && Array.isArray(sn[uploadId]) && sn[uploadId].length > 0);
  }

  function addAuditLog(entry) {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.AUDIT_LOG);
      var list = raw ? JSON.parse(raw) : [];
      list.unshift(entry);
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOG, JSON.stringify(list.slice(0, 100)));
    } catch (e) {}
  }

  function prepareUploadWithSnapshot(newInvoices, entry, newRewards, newTargets) {
    try {
      var currentInvoices = getInvoices();
      var uploadId = entry.id || ('upl_' + Date.now());
      entry.id = uploadId;
      entry.previousCount = currentInvoices.length;
      entry.hasSnapshot = true;

      // Save previous dataset snapshot
      var snapshots = getSnapshots();
      snapshots[uploadId] = currentInvoices;
      localStorage.setItem(STORAGE_KEYS.SNAPSHOTS, JSON.stringify(snapshots));
      var currentTargets = getTargets();
      if (Array.isArray(newTargets)) {
        var targetSnapshots = JSON.parse(localStorage.getItem(STORAGE_KEYS.SNAPSHOTS) || '{}');
        targetSnapshots[uploadId + ':targets'] = currentTargets;
        localStorage.setItem(STORAGE_KEYS.SNAPSHOTS, JSON.stringify(targetSnapshots));
      }

      if (Array.isArray(newRewards)) {
        var rewardSnapshots = JSON.parse(localStorage.getItem(STORAGE_KEYS.REWARD_SNAPSHOTS) || '{}');
        rewardSnapshots[uploadId] = getRewards();
        localStorage.setItem(STORAGE_KEYS.REWARD_SNAPSHOTS, JSON.stringify(rewardSnapshots));
        saveRewards(newRewards, { skipBackend: true });
      }

      saveInvoices(newInvoices, { skipBackend: true });
      if (Array.isArray(newTargets)) saveTargets(newTargets, { skipBackend: true });
      return {
        success: true,
        uploadId: uploadId,
        entry: entry,
        previousInvoiceIds: currentInvoices.map(function (invoice) { return invoice.id || invoice.invoice_id; }),
        previousRewardIds: Array.isArray(newRewards) ? (JSON.parse(localStorage.getItem(STORAGE_KEYS.REWARD_SNAPSHOTS) || '{}')[uploadId] || []).map(function (reward) { return reward.id || reward.reward_id || reward.rewardId; }) : [],
        previousTargets: currentTargets,
        previousTargetKeys: Object.keys(currentTargets)
      };
    } catch (e) {
      console.error('Failed to save upload with snapshot', e);
      return { success: false, reason: e.message };
    }
  }

  function finalizeUpload(entry, newInvoices, previousCount) {
    addUploadHistory(entry);
    addAuditLog({
      action: 'UPLOAD_SUCCESS',
      uploadId: entry.id,
      filename: entry.filename,
      timestamp: new Date().toISOString(),
      rowsIngested: newInvoices.length,
      previousCount: previousCount
    });
  }

  function saveUploadWithSnapshot(newInvoices, entry, newRewards, newTargets) {
    var prepared = prepareUploadWithSnapshot(newInvoices, entry, newRewards, newTargets);
    if (!prepared.success) return prepared;
    var previousCount = entry.previousCount;
    finalizeUpload(entry, newInvoices, previousCount);
    return { success: true, uploadId: prepared.uploadId };
  }

  async function saveUploadWithSnapshotAsync(newInvoices, entry, newRewards, newTargets) {
    var prepared = prepareUploadWithSnapshot(newInvoices, entry, newRewards, newTargets);
    if (!prepared.success) return prepared;
    if (!root.FADE_AUTH || !getActiveSession()) {
      finalizeUpload(entry, newInvoices, entry.previousCount);
      return { success: true, uploadId: prepared.uploadId };
    }

    try {
      var writes = [root.FADE_AUTH.persistInvoices(newInvoices, prepared.previousInvoiceIds)];
      if (Array.isArray(newRewards)) writes.push(root.FADE_AUTH.persistRewards(newRewards, prepared.previousRewardIds));
      if (Array.isArray(newTargets)) writes.push(root.FADE_AUTH.persistTargets(newTargets, prepared.previousTargetKeys));
      var results = await Promise.all(writes.map(function (write) {
        return write.then(function () { return null; }, function (error) { return error; });
      }));
      var writeError = results.find(function (error) { return error; });
      if (writeError) throw writeError;
      finalizeUpload(entry, newInvoices, entry.previousCount);
      return { success: true, uploadId: prepared.uploadId };
    } catch (error) {
      try {
        hydrateFromBackend(await root.FADE_AUTH.loadDataset());
      } catch (reloadError) {
        clearSession();
        window.location.replace('./index.html?error=backend');
      }
      var snapshots = getSnapshots();
      delete snapshots[prepared.uploadId];
      delete snapshots[prepared.uploadId + ':targets'];
      localStorage.setItem(STORAGE_KEYS.SNAPSHOTS, JSON.stringify(snapshots));
      var rewardSnapshots = JSON.parse(localStorage.getItem(STORAGE_KEYS.REWARD_SNAPSHOTS) || '{}');
      delete rewardSnapshots[prepared.uploadId];
      localStorage.setItem(STORAGE_KEYS.REWARD_SNAPSHOTS, JSON.stringify(rewardSnapshots));
      var backendError = error instanceof Error ? error : new Error(String(error));
      backendError.backendSave = true;
      throw backendError;
    }
  }

  async function rollbackUpload(uploadId) {
    try {
      var history = getUploadHistory();
      var entryIndex = history.findIndex(function (h) {
        return h.id === uploadId || h.timestamp === uploadId;
      });
      if (entryIndex === -1) {
        return { success: false, reason: 'Catatan unggahan tidak ditemukan dalam riwayat.' };
      }
      var entry = history[entryIndex];
      var snapshots = getSnapshots();
      var key = entry.id || entry.timestamp;
      var snapshot = snapshots[key];
      if (!snapshot || !Array.isArray(snapshot) || snapshot.length === 0) {
        return { success: false, reason: 'Snapshot pemulihan tidak tersedia untuk berkas ini.' };
      }

      // Restore invoices
      saveInvoices(snapshot);
      var rewardSnapshots = JSON.parse(localStorage.getItem(STORAGE_KEYS.REWARD_SNAPSHOTS) || '{}');
      if (Object.prototype.hasOwnProperty.call(rewardSnapshots, key)) {
        saveRewards(rewardSnapshots[key]);
        delete rewardSnapshots[key];
        localStorage.setItem(STORAGE_KEYS.REWARD_SNAPSHOTS, JSON.stringify(rewardSnapshots));
      }
      var targetSnapshotKey = key + ':targets';
      if (Object.prototype.hasOwnProperty.call(snapshots, targetSnapshotKey)) {
        var targetSnapshot = snapshots[targetSnapshotKey];
        var targetRecords = Object.keys(targetSnapshot).map(function (targetKey) {
          var parts = targetKey.split('|');
          return { key: targetKey, target: targetSnapshot[targetKey], salesId: parts[0], period: parts[1] };
        });
        saveTargets(targetRecords);
        delete snapshots[targetSnapshotKey];
      }

      await pendingBackendWrites;

      // Save internal audit log
      addAuditLog({
        action: 'ROLLBACK_UPLOAD',
        uploadId: key,
        filename: entry.filename,
        timestamp: new Date().toISOString(),
        restoredCount: snapshot.length,
        revertedCount: entry.rowsIngested
      });

      // Remove from active upload history list
      history.splice(entryIndex, 1);
      localStorage.setItem(STORAGE_KEYS.UPLOAD_LOG, JSON.stringify(history));

      // Remove snapshot
      delete snapshots[key];
      delete snapshots[targetSnapshotKey];
      localStorage.setItem(STORAGE_KEYS.SNAPSHOTS, JSON.stringify(snapshots));

      return {
        success: true,
        restoredCount: snapshot.length,
        filename: entry.filename
      };
    } catch (e) {
      console.error('Failed to rollback upload', e);
      return { success: false, reason: e.message };
    }
  }

  function deleteFailedUpload(identifier) {
    try {
      var history = getUploadHistory();
      var entryIndex = history.findIndex(function (h) {
        return h.id === identifier || h.timestamp === identifier;
      });
      if (entryIndex === -1) return false;
      var entry = history[entryIndex];
      history.splice(entryIndex, 1);
      localStorage.setItem(STORAGE_KEYS.UPLOAD_LOG, JSON.stringify(history));

      addAuditLog({
        action: 'DELETE_FAILED_UPLOAD_LOG',
        filename: entry.filename,
        timestamp: new Date().toISOString()
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  init();

  var Store = {
    init: init,
    hydrateFromBackend: hydrateFromBackend,
    resetToDefault: resetToDefault,
    getInvoices: getInvoices,
    saveInvoices: saveInvoices,
    getRewards: getRewards,
    getConsignmentBalances: getConsignmentBalances,
    saveConsignmentBalances: saveConsignmentBalances,
    saveRewards: saveRewards,
    saveTargets: saveTargets,
    addInvoice: addInvoice,
    updateInvoice: updateInvoice,
    deleteInvoice: deleteInvoice,
    recordPayment: recordPayment,
    generateNextInvoiceId: generateNextInvoiceId,
    getTargets: getTargets,
    getSalesMonthlyMetrics: getSalesMonthlyMetrics,
    waitForPendingWrites: function () { return pendingBackendWrites; },
    getSalesList: getSalesList,
    getUniqueSalesNames: getUniqueSalesNames,
    getUniqueStoreNames: getUniqueStoreNames,
    getUniqueProductNames: getUniqueProductNames,
    getStoresList: getStoresList,
    getActiveSession: getActiveSession,
    setActiveSession: setActiveSession,
    clearSession: clearSession,
    getTheme: getTheme,
    setTheme: setTheme,
    getUploadHistory: getUploadHistory,
    addUploadHistory: addUploadHistory,
    saveUploadWithSnapshot: saveUploadWithSnapshot,
    saveUploadWithSnapshotAsync: saveUploadWithSnapshotAsync,
    rollbackUpload: rollbackUpload,
    deleteFailedUpload: deleteFailedUpload,
    hasSnapshot: hasSnapshot,
    STORAGE_KEYS: STORAGE_KEYS
  };

  root.FADE_STORE = Store;
})(typeof globalThis !== 'undefined' ? globalThis : this);
