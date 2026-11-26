(function (root) {
  'use strict';

  var drawer, backdrop, title, subtitle, content, backButton, closeButton;
  var state = null;
  var returnFocus = null;
  var focusInvoiceId = null;
  var closeTimer = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function storeName(invoice) {
    return String(invoice.store_name || invoice.storeName || '').trim();
  }

  function invoiceDate(invoice) {
    return invoice.invoice_date || invoice.date || '';
  }

  function invoiceId(invoice) {
    return invoice.invoice_id || invoice.id || '-';
  }

  function money(value) {
    return 'Rp ' + Number(value || 0).toLocaleString('id-ID');
  }

  function readableMonth(key) {
    var date = new Date(key + '-01T00:00:00');
    return isNaN(date.getTime()) ? key : date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  }

  function evaluate(invoice) {
    return root.FADE_ENGINE.evaluateInvoiceState(invoice, state.snapshot);
  }

  function show() {
    if (!drawer || !backdrop) return;
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = null;
    backdrop.classList.remove('hidden');
    drawer.classList.remove('hidden', 'translate-x-full');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden');
    closeButton.focus();
  }

  function close() {
    if (!drawer || !backdrop) return;
    drawer.classList.add('translate-x-full');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('overflow-hidden');
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(function () {
      drawer.classList.add('hidden');
      backdrop.classList.add('hidden');
      if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
      returnFocus = null;
      closeTimer = null;
    }, 180);
  }

  function groupInvoices(list) {
    var groups = {};
    list.forEach(function (invoice) {
      var date = invoiceDate(invoice);
      var key = date.slice(0, 7) || 'unknown';
      if (!groups[key]) groups[key] = { key: key, count: 0, qty: 0, total: 0 };
      groups[key].count += 1;
      groups[key].qty += Number(invoice.qty || 0);
      groups[key].total += evaluate(invoice).revenue;
    });
    return Object.keys(groups).sort().reverse().map(function (key) { return groups[key]; });
  }

  function renderDirectory() {
    state.mode = 'directory';
    state.storeName = '';
    title.textContent = 'Cari toko';
    subtitle.textContent = state.periodInvoices.length + ' invoice pada periode dashboard';
    backButton.classList.add('hidden');
    content.innerHTML = '<label class="flex flex-col gap-1.5 text-xs font-medium text-text-secondary">Cari nama toko<input id="storeDrawerSearch" type="search" class="min-h-11 w-full px-3 rounded-lg bg-surface-2 border border-border-default text-text-primary placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" placeholder="Contoh: Fin Vapor" autocomplete="off"></label><p id="storeDrawerCount" class="text-[11px] text-text-muted"></p><div id="storeDrawerList" class="flex flex-col gap-2"></div>';
    var input = document.getElementById('storeDrawerSearch');
    input.value = state.query || '';
    input.addEventListener('input', function () {
      state.query = input.value;
      renderStoreList();
    });
    renderStoreList();
    show();
    input.focus();
  }

  function renderStoreList() {
    var grouped = {};
    state.periodInvoices.forEach(function (invoice) {
      var name = storeName(invoice);
      if (!name) return;
      var key = name.toLocaleLowerCase('id-ID');
      if (!grouped[key]) grouped[key] = { name: name, count: 0, qty: 0, total: 0 };
      grouped[key].count += 1;
      grouped[key].qty += Number(invoice.qty || 0);
      grouped[key].total += evaluate(invoice).revenue;
    });
    var query = (state.query || '').toLocaleLowerCase('id-ID').trim();
    var stores = Object.keys(grouped).map(function (key) { return grouped[key]; })
      .filter(function (store) { return !query || store.name.toLocaleLowerCase('id-ID').indexOf(query) >= 0; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'id-ID'); });
    var list = document.getElementById('storeDrawerList');
    var count = document.getElementById('storeDrawerCount');
    count.textContent = stores.length + ' toko';
    if (!stores.length) {
      var emptyMessage = query
        ? 'Tidak ada toko yang cocok dengan pencarian.'
        : 'Data toko belum tersedia pada periode dashboard ini.';
      list.innerHTML = '<p class="p-4 rounded-lg bg-surface-2 border border-border-subtle text-text-muted">' + emptyMessage + '</p>';
      return;
    }
    list.innerHTML = stores.map(function (store) {
      return '<button type="button" data-store-name="' + esc(store.name) + '" class="min-h-14 w-full p-3 rounded-lg bg-surface-2 border border-border-subtle text-left hover:border-accent/50 active:border-accent/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"><span class="flex items-center justify-between gap-3"><strong class="min-w-0 truncate text-text-primary">' + esc(store.name) + '</strong><span class="shrink-0 text-[11px] text-text-muted">' + store.count + ' invoice</span></span><span class="mt-1 flex justify-between gap-3 text-[11px] text-text-secondary"><span>' + store.qty.toLocaleString('id-ID') + ' pcs</span><span class="tabular-nums">' + money(store.total) + '</span></span></button>';
    }).join('');
    list.querySelectorAll('[data-store-name]').forEach(function (button) {
      button.addEventListener('click', function () { openStore(button.getAttribute('data-store-name')); });
    });
  }

  function renderStoreDetail() {
    var key = state.storeName.toLocaleLowerCase('id-ID');
    var invoices = state.allInvoices.filter(function (invoice) {
      return storeName(invoice).toLocaleLowerCase('id-ID') === key;
    }).sort(function (a, b) { return invoiceDate(b).localeCompare(invoiceDate(a)); });
    var qty = invoices.reduce(function (sum, invoice) { return sum + Number(invoice.qty || 0); }, 0);
    var total = invoices.reduce(function (sum, invoice) { return sum + evaluate(invoice).revenue; }, 0);
    var months = groupInvoices(invoices);
    var rewards = state.rewards.filter(function (reward) {
      return String(reward.storeName || '').trim().toLocaleLowerCase('id-ID') === key;
    });

    state.mode = 'detail';
    title.textContent = state.storeName;
    subtitle.textContent = invoices.length + ' invoice dalam cakupan akun';
    backButton.classList.remove('hidden');
    var monthRows = months.length ? months.map(function (month) {
      return '<div class="flex items-center justify-between gap-3 py-2 border-b border-border-subtle last:border-0"><span class="text-text-primary">' + esc(month.key === 'unknown' ? 'Bulan tidak tercatat' : readableMonth(month.key)) + '</span><span class="text-right text-text-secondary tabular-nums">' + money(month.total) + '<small class="block text-text-muted">' + month.count + ' invoice · ' + month.qty.toLocaleString('id-ID') + ' pcs</small></span></div>';
    }).join('') : '<p class="text-text-muted">Belum ada histori pembelian untuk toko ini.</p>';
    var rewardRows = rewards.length ? rewards.map(function (reward) {
      var status = reward.salesStatus || reward.sourceStatus || 'Status belum diisi di sumber';
      var month = reward.programMonth || reward.sourceInvoiceMonth || 'Periode tidak dicantumkan';
      var amount = reward.totalReward != null && reward.totalReward !== '' ? '<span class="shrink-0 text-right text-text-secondary tabular-nums">' + money(reward.totalReward) + '<small class="block text-text-muted">reward tercatat</small></span>' : '';
      return '<article class="p-3 rounded-lg bg-surface-2 border border-border-subtle flex items-center justify-between gap-3"><div class="min-w-0"><strong class="block text-text-primary">' + esc(month) + '</strong><span class="block mt-1 text-[11px] text-text-muted">' + esc(status) + '</span></div>' + amount + '</article>';
    }).join('') : '<p class="text-text-muted">Belum ada catatan reward untuk toko ini di Master Excel.</p>';
    var invoiceRows = invoices.length ? invoices.map(function (invoice) {
      var status = evaluate(invoice);
      var id = invoiceId(invoice);
      return '<button type="button" data-invoice-id="' + esc(id) + '" class="min-h-14 w-full p-3 rounded-lg bg-surface-2 border border-border-subtle text-left hover:border-accent/50 active:border-accent/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"><span class="flex items-center justify-between gap-3"><strong class="min-w-0 truncate text-text-primary">' + esc(id) + '</strong><span class="shrink-0 text-[11px] text-text-secondary">' + esc(status.status) + '</span></span><span class="mt-1 flex items-center justify-between gap-3 text-[11px] text-text-muted"><span>' + esc(invoiceDate(invoice) || 'Tanggal tidak tercatat') + '</span><span class="text-right tabular-nums">' + money(status.revenue) + '<small class="block">Sisa ' + money(status.sisa) + '</small></span></span></button>';
    }).join('') : '<p class="text-text-muted">Belum ada invoice untuk toko ini.</p>';

    content.innerHTML = '<section aria-label="Ringkasan toko" class="grid grid-cols-2 gap-2 p-3 rounded-lg bg-surface-2 border border-border-subtle"><div><span class="block text-text-muted">Total invoice</span><strong class="mt-1 block text-text-primary">' + invoices.length.toLocaleString('id-ID') + '</strong></div><div><span class="block text-text-muted">Total pembelian</span><strong class="mt-1 block text-text-primary tabular-nums">' + money(total) + '</strong></div><div class="col-span-2 text-[11px] text-text-secondary">' + qty.toLocaleString('id-ID') + ' pcs dalam histori yang dapat diakses</div></section><section aria-labelledby="storeDrawerMonthlyTitle"><h4 id="storeDrawerMonthlyTitle" class="mb-2 font-semibold text-text-primary">Pembelian per bulan</h4><div class="p-3 rounded-lg bg-surface-1 border border-border-subtle">' + monthRows + '</div></section><section aria-labelledby="storeDrawerRewardTitle"><div class="mb-2 flex items-center justify-between gap-3"><h4 id="storeDrawerRewardTitle" class="font-semibold text-text-primary">Reward dari sumber</h4><span class="text-[10px] text-text-muted">Tanpa hitung tier baru</span></div><div class="flex flex-col gap-2">' + rewardRows + '</div></section><section aria-labelledby="storeDrawerInvoicesTitle"><h4 id="storeDrawerInvoicesTitle" class="mb-2 font-semibold text-text-primary">Invoice &amp; status pembayaran</h4><div class="flex flex-col gap-2">' + invoiceRows + '</div></section>';
    content.querySelectorAll('[data-invoice-id]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-invoice-id');
        focusInvoiceId = id;
        if (typeof state.onInvoice === 'function') state.onInvoice(id, state.storeName);
      });
    });
    if (focusInvoiceId) {
      var returnButton = Array.prototype.find.call(content.querySelectorAll('[data-invoice-id]'), function (button) {
        return button.getAttribute('data-invoice-id') === focusInvoiceId;
      });
      if (returnButton) returnButton.focus();
      focusInvoiceId = null;
    }
  }

  function openStore(name) {
    if (!state || !name) return;
    if (drawer.classList.contains('hidden')) returnFocus = document.activeElement;
    state.storeName = name;
    renderStoreDetail();
    show();
  }

  function openDirectory(options) {
    state = {
      periodInvoices: options.periodInvoices || [],
      allInvoices: options.allInvoices || [],
      rewards: options.rewards || [],
      snapshot: options.snapshot || '2026-11-22',
      onInvoice: options.onInvoice,
      query: '',
      storeName: '',
      mode: 'directory'
    };
    returnFocus = document.activeElement;
    renderDirectory();
  }

  function back() {
    if (!state || state.mode !== 'detail') return;
    state.storeName = '';
    renderDirectory();
  }

  function handleKeys(event) {
    if (!drawer || drawer.classList.contains('hidden')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    var focusable = drawer.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]');
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function init() {
    drawer = document.getElementById('storeDetailDrawer');
    backdrop = document.getElementById('storeDetailBackdrop');
    title = document.getElementById('storeDrawerTitle');
    subtitle = document.getElementById('storeDrawerSubtitle');
    content = document.getElementById('storeDrawerContent');
    backButton = document.getElementById('storeDrawerBackBtn');
    closeButton = document.getElementById('storeDrawerCloseBtn');
    if (!drawer) return;
    closeButton.addEventListener('click', close);
    backButton.addEventListener('click', back);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', handleKeys);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  root.FADE_STORE_DRAWER = { openDirectory: openDirectory, openStore: openStore, close: close };
})(window);
