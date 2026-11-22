/**
 * FADE Pods Showcase v0.2 · Storage & State Manager
 * Standalone client-side data management using browser localStorage.
 */
(function (root) {
  'use strict';

  var STORAGE_KEYS = {
    INVOICES: 'fade_showcase_invoices_v02',
    TARGETS: 'fade_showcase_targets_v02',
    SALES: 'fade_showcase_sales_v02',
    STORES: 'fade_showcase_stores_v02',
    SESSION: 'fade_showcase_session_v02',
    THEME: 'fade_showcase_theme_v02',
    UPLOAD_LOG: 'fade_showcase_upload_history_v02',
    INITIALIZED: 'fade_showcase_initialized_v02'
  };

  function getSeed() {
    return root.FADE_SYNTHETIC_SEED || {
      meta: { isSynthetic: true },
      sales: [],
      stores: [],
      targets: {},
      invoices: []
    };
  }

  function init() {
    try {
      var isInit = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
      if (!isInit || !localStorage.getItem(STORAGE_KEYS.INVOICES)) {
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
          timestamp: '2026-11-22T08:00:00Z',
          filename: '01_Master_Import_Candidate.xlsx',
          rowsIngested: seed.invoices.length,
          status: 'Success',
          notes: 'Initial synthetic showcase seed'
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

  function getTargets() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.TARGETS);
      return raw ? JSON.parse(raw) : getSeed().targets;
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
    // Default session: Admin
    return {
      role: 'admin',
      name: 'Raka Pratama',
      title: 'Administrator',
      salesName: null
    };
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

  // Initialize store immediately
  init();

  var Store = {
    init: init,
    resetToDefault: resetToDefault,
    getInvoices: getInvoices,
    saveInvoices: saveInvoices,
    getTargets: getTargets,
    getSalesList: getSalesList,
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
