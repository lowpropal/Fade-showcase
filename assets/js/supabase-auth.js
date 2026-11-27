(function (root) {
  'use strict';

  var supabaseUrl = 'https://nduzczauaibgwjuwhuod.supabase.co';
  var publishableKey = 'sb_publishable_SsBG3rG52DWnHWyOgkiM0w_UwTITF3-';
  var client = root.supabase && typeof root.supabase.createClient === 'function'
    ? root.supabase.createClient(supabaseUrl, publishableKey)
    : null;
  var writeQueue = Promise.resolve();

  if (!client) {
    root.FADE_AUTH = {
      restoreSession: async function () { return null; },
      signIn: async function () { throw new Error('Layanan login belum tersedia. Muat ulang halaman dan coba lagi.'); },
      signOut: async function () { root.FADE_STORE.clearSession(); },
      routeForRole: function (role) { return role === 'sales' ? './sales.html#dashboard' : './admin.html#dashboard'; },
      loadDataset: async function () { throw new Error('Data dashboard belum bisa dimuat.'); },
      persistInvoices: async function () { throw new Error('Layanan penyimpanan belum tersedia.'); },
      persistRewards: async function () { throw new Error('Layanan penyimpanan belum tersedia.'); },
      persistTargets: async function () { throw new Error('Layanan penyimpanan belum tersedia.'); },
      persistConsignmentBalances: async function () { throw new Error('Layanan penyimpanan belum tersedia.'); },
      loadUploadHistory: async function () { throw new Error('Layanan riwayat unggahan belum tersedia.'); },
      persistUploadHistory: async function () { throw new Error('Layanan riwayat unggahan belum tersedia.'); },
      deleteUploadHistory: async function () { throw new Error('Layanan riwayat unggahan belum tersedia.'); }
    };
    return;
  }

  function toAppSession(profile, user) {
    var roleTitles = {
      admin: 'Head of Operations',
      sales_manager: 'Sales Manager',
      sales: 'Sales Representative'
    };

    return {
      userId: user.id,
      role: profile.app_role,
      name: profile.display_name,
      title: roleTitles[profile.app_role],
      salesName: profile.app_role === 'sales' ? profile.display_name : null,
      salesId: profile.sales_id || null,
      region: profile.app_role === 'sales' ? 'Operasional Sales' : null
    };
  }

  async function getProfile(user) {
    var result = await client
      .from('fade_profiles')
      .select('app_role, sales_id, display_name')
      .eq('user_id', user.id)
      .single();

    if (result.error || !result.data) {
      await client.auth.signOut({ scope: 'local' });
      return null;
    }

    return toAppSession(result.data, user);
  }

  async function restoreSession() {
    var authResult = await client.auth.getUser();
    if (authResult.error || !authResult.data.user) {
      root.FADE_STORE.clearSession();
      return null;
    }

    var appSession = await getProfile(authResult.data.user);
    if (!appSession) {
      root.FADE_STORE.clearSession();
      return null;
    }

    root.FADE_STORE.setActiveSession(appSession);
    return appSession;
  }

  async function signIn(username, password) {
    var normalizedUsername = String(username || '').trim().toLowerCase();
    if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
      throw new Error('Username atau kata sandi tidak sesuai.');
    }

    var authResult = await client.auth.signInWithPassword({
      email: normalizedUsername + '@fade.invalid',
      password: String(password || '')
    });

    if (authResult.error || !authResult.data.user) {
      throw new Error('Username atau kata sandi tidak sesuai.');
    }

    var appSession = await getProfile(authResult.data.user);
    if (!appSession) {
      throw new Error('Akun belum memiliki izin akses FADE. Hubungi Admin.');
    }

    root.FADE_STORE.setActiveSession(appSession);
    return appSession;
  }

  async function signOut() {
    await writeQueue.catch(function () {});
    var result = await client.auth.signOut({ scope: 'local' });
    root.FADE_STORE.clearSession();
    if (result.error) throw result.error;
  }

  async function fetchAllRows(buildQuery) {
    var pageSize = 500;
    var rows = [];
    for (var start = 0; ; start += pageSize) {
      var result = await buildQuery().range(start, start + pageSize - 1);
      if (result.error) throw result.error;
      rows = rows.concat(result.data || []);
      if (!result.data || result.data.length < pageSize) return rows;
    }
  }

  async function loadDataset() {
    var results = await Promise.all([
      fetchAllRows(function () { return client.from('fade_invoices').select('*').order('invoice_date', { ascending: false }).order('id'); }),
      fetchAllRows(function () { return client.from('fade_targets').select('*').order('period').order('sales_id'); }),
      fetchAllRows(function () { return client.from('fade_sales').select('*').order('name').order('id'); }),
      fetchAllRows(function () { return client.from('fade_stores').select('*').order('name').order('id'); }),
      fetchAllRows(function () { return client.from('fade_rewards').select('*').order('period', { ascending: false }).order('id'); }),
      fetchAllRows(function () { return client.from('fade_consignment_balances').select('*').order('store_name').order('sku'); }).catch(function (error) {
        if (error && (error.code === '42P01' || error.code === 'PGRST205')) return [];
        throw error;
      })
    ]);

    return {
      invoices: results[0].map(function (row) {
        return Object.assign({}, row.data || {}, {
          id: row.id,
          salesId: row.sales_id,
          storeId: row.store_id,
          storeName: row.store_name,
          date: row.invoice_date,
          invoiceTotal: Number(row.invoice_total),
          paidTotal: Number(row.paid_total),
          outstanding: Number(row.outstanding)
        });
      }),
      targets: results[1].map(function (row) {
        var period = String(row.period).slice(0, 7);
        return { key: row.sales_id + '|' + period, target: Number(row.target_qty), data: row.data || {} };
      }),
      sales: results[2].map(function (row) {
        return Object.assign({}, row.data || {}, {
          id: row.id,
          name: row.name,
          username: row.username,
          active: row.is_active,
          targetMonthly: Number(row.target_monthly)
        });
      }),
      stores: results[3].map(function (row) {
        return Object.assign({}, row.data || {}, {
          id: row.id,
          name: row.name,
          partnerType: row.partner_type,
          accountStatus: row.account_status
        });
      }),
      rewards: results[4].map(function (row) {
        var source = row.data || {};
        return Object.assign({}, source, {
          id: row.id,
          rewardId: source.rewardId || source.Reward_ID || source.reward_id || null,
          storeId: row.store_id || source.Client_ID || source.clientId || null,
          storeName: source.storeName || source.Nama_Toko || source.nama_toko || '',
          period: row.period || source.Bulan_Program || source.programMonth || null,
          programMonth: source.programMonth || source.Bulan_Program || source.bulan_program || '',
          sourceInvoiceMonth: source.sourceInvoiceMonth || source.Bulan_Invoice_Sumber || source.bulan_invoice_sumber || '',
          sourceStatus: source.sourceStatus || source.Status_Reward_Sumber || source.status_reward_sumber || '',
          salesStatus: source.salesStatus || source.Status_Reward_Untuk_Sales || source.status_reward_untuk_sales || '',
          totalReward: source.totalReward != null ? source.totalReward : (source.Total_Reward_IDR != null ? source.Total_Reward_IDR : source.total_reward_idr)
        });
      }),
      consignment: results[5].map(function (row) {
        return Object.assign({}, row.data || {}, {
          id: row.id,
          clientId: row.client_id,
          storeName: row.store_name,
          salesId: row.sales_id,
          sku: row.sku,
          productName: row.product_name,
          qtyConsigned: Number(row.qty_consigned || 0),
          qtyPaid: Number(row.qty_paid || 0),
          qtyReturned: Number(row.qty_returned || 0),
          qtyRemaining: Number(row.qty_remaining || 0),
          remainingValue: Number(row.remaining_value || 0),
          stockStatus: row.stock_status || ''
        });
      })
    };
  }

  async function loadUploadHistory() {
    var session = root.FADE_STORE.getActiveSession();
    if (!session || session.role !== 'admin') return [];
    var result = await client.from('fade_upload_history').select('*').order('uploaded_at', { ascending: false }).limit(100);
    if (result.error) throw result.error;
    return (result.data || []).map(function (row) {
      return {
        id: row.id,
        timestamp: row.uploaded_at,
        filename: row.filename,
        rowsIngested: Number(row.rows_ingested || 0),
        validCount: Number(row.valid_count || 0),
        invalidCount: Number(row.invalid_count || 0),
        uploadedBy: row.uploaded_by || 'Admin',
        status: row.status,
        hasSnapshot: Boolean(row.has_snapshot),
        previousCount: Number(row.previous_count || 0),
        previousUploadId: row.previous_upload_id || null,
        notes: row.notes || ''
      };
    });
  }

  function serializeUploadHistory(entry) {
    return {
      id: String(entry.id || entry.timestamp),
      uploaded_at: entry.timestamp || new Date().toISOString(),
      filename: String(entry.filename || 'File tanpa nama'),
      rows_ingested: Number(entry.rowsIngested || 0),
      valid_count: Number(entry.validCount || 0),
      invalid_count: Number(entry.invalidCount || 0),
      uploaded_by: String(entry.uploadedBy || 'Admin'),
      status: entry.status === 'RolledBack' ? 'RolledBack' : (entry.status === 'Success' ? 'Success' : 'Failed'),
      has_snapshot: Boolean(entry.hasSnapshot),
      previous_count: Number(entry.previousCount || 0),
      previous_upload_id: entry.previousUploadId || null,
      notes: String(entry.notes || '')
    };
  }

  function persistUploadHistory(entry) {
    var session = root.FADE_STORE.getActiveSession();
    if (!session || session.role !== 'admin') return Promise.reject(new Error('Riwayat unggahan hanya dapat dikelola oleh Admin.'));
    return enqueueWrite(async function () {
      var result = await client.from('fade_upload_history').upsert(serializeUploadHistory(entry), { onConflict: 'id' });
      if (result.error) throw result.error;
    });
  }

  function deleteUploadHistory(uploadId) {
    var session = root.FADE_STORE.getActiveSession();
    if (!session || session.role !== 'admin') return Promise.reject(new Error('Riwayat unggahan hanya dapat dikelola oleh Admin.'));
    return enqueueWrite(async function () {
      var result = await client.from('fade_upload_history').delete().eq('id', String(uploadId));
      if (result.error) throw result.error;
    });
  }

  function serializeInvoice(invoice) {
    return {
      id: invoice.id || invoice.invoice_id,
      sales_id: invoice.salesId || invoice.sales_id,
      store_id: invoice.storeId || invoice.store_id || null,
      store_name: invoice.storeName || invoice.store_name || '',
      invoice_date: invoice.date || invoice.invoice_date,
      invoice_total: Number(invoice.invoiceTotal || invoice.invoice_total || 0),
      paid_total: Number(invoice.paidTotal || invoice.paid_total || 0),
      outstanding: Number(invoice.outstanding || 0),
      data: invoice
    };
  }

  function enqueueWrite(task) {
    writeQueue = writeQueue.then(task, task);
    return writeQueue;
  }

  function missingStoresForInvoices(invoices) {
    var known = new Set((root.FADE_STORE.getStoresList() || []).map(function (store) {
      return String(store.id || store.store_id || '');
    }));
    var pending = new Map();
    invoices.forEach(function (invoice) {
      var id = String(invoice.storeId || invoice.store_id || invoice.clientId || '');
      var name = String(invoice.storeName || invoice.store_name || '').trim();
      if (!id || !name || known.has(id) || pending.has(id)) return;
      pending.set(id, {
        id: id,
        name: name,
        partner_type: invoice.jenisPartner || invoice.partnerType || null,
        account_status: invoice.statusAkun || invoice.accountStatus || null,
        data: invoice.sourceRow || {}
      });
    });
    return Array.from(pending.values());
  }

  async function persistMissingStores(invoices) {
    var stores = missingStoresForInvoices(invoices);
    if (!stores.length) return;
    var result = await client.from('fade_stores').upsert(stores, { onConflict: 'id' });
    if (result.error) throw result.error;
  }

  function persistInvoices(invoices, previousIds) {
    var session = root.FADE_STORE.getActiveSession();
    if (!session || session.role !== 'admin') return Promise.reject(new Error('Perubahan ini hanya dapat disimpan oleh Admin.'));
    return enqueueWrite(async function () {
      await persistMissingStores(invoices);
      if (invoices.length) {
        var upsert = await client.from('fade_invoices').upsert(invoices.map(serializeInvoice), { onConflict: 'id' });
        if (upsert.error) throw upsert.error;
      }

      var nextIds = new Set(invoices.map(function (invoice) { return String(invoice.id || invoice.invoice_id); }));
      var removedIds = (previousIds || []).filter(function (id) { return !nextIds.has(String(id)); });
      if (removedIds.length) {
        var deletion = await client.from('fade_invoices').delete().in('id', removedIds);
        if (deletion.error) throw deletion.error;
      }
    });
  }

  function persistRewards(rewards, previousIds) {
    var session = root.FADE_STORE.getActiveSession();
    if (!session || session.role !== 'admin') return Promise.reject(new Error('Perubahan reward hanya dapat disimpan oleh Admin.'));
    return enqueueWrite(async function () {
      var rewardStoreInvoices = rewards.map(function (reward) {
        return {
          storeId: reward.storeId || reward.store_id || reward.clientId || reward.client_id,
          storeName: reward.storeName || reward.store_name,
          jenisPartner: reward.jenisPartner || reward.partnerType,
          statusAkun: reward.statusAkun || reward.accountStatus
        };
      });
      await persistMissingStores(rewardStoreInvoices);
      var records = rewards.filter(function (reward) {
        return Boolean(reward.id || reward.reward_id || reward.rewardId);
      }).map(function (reward) {
        var month = String(reward.period || reward.sourceInvoiceMonth || reward.source_invoice_month || reward.bulanInvoiceSumber || '').slice(0, 10);
        return {
          id: reward.id || reward.reward_id || reward.rewardId,
          store_id: reward.storeId || reward.store_id || reward.clientId || reward.client_id,
          period: month.length === 7 ? month + '-01' : month,
          data: reward
        };
      });
      if (records.length) {
        var upsert = await client.from('fade_rewards').upsert(records, { onConflict: 'id' });
        if (upsert.error) throw upsert.error;
      }

      var nextIds = new Set(records.map(function (reward) { return String(reward.id); }));
      var removedIds = (previousIds || []).filter(function (id) { return !nextIds.has(String(id)); });
      if (removedIds.length) {
        var deletion = await client.from('fade_rewards').delete().in('id', removedIds);
        if (deletion.error) throw deletion.error;
      }
    });
  }

  function persistTargets(targets, previousKeys) {
    var session = root.FADE_STORE.getActiveSession();
    if (!session || session.role !== 'admin') return Promise.reject(new Error('Perubahan target hanya dapat disimpan oleh Admin.'));
    return enqueueWrite(async function () {
      var records = (targets || []).map(function (target) {
        var parts = String(target.key || '').split('|');
        var period = String(target.period || parts[1] || '').slice(0, 7);
        return {
          sales_id: target.salesId || parts[0],
          period: period + '-01',
          target_qty: Number(target.target || 0),
          data: target.data || {}
        };
      }).filter(function (target) { return target.sales_id && /^\d{4}-\d{2}-01$/.test(target.period); });

      if (records.length) {
        var upsert = await client.from('fade_targets').upsert(records, { onConflict: 'sales_id,period' });
        if (upsert.error) throw upsert.error;
      }

      var nextKeys = new Set((targets || []).map(function (target) { return String(target.key || ''); }));
      var removals = {};
      (previousKeys || []).forEach(function (key) {
        if (nextKeys.has(String(key))) return;
        var parts = String(key).split('|');
        if (parts.length !== 2) return;
        if (!removals[parts[0]]) removals[parts[0]] = [];
        removals[parts[0]].push(parts[1] + '-01');
      });
      for (var salesId in removals) {
        var deletion = await client.from('fade_targets').delete().eq('sales_id', salesId).in('period', removals[salesId]);
        if (deletion.error) throw deletion.error;
      }
    });
  }

  function persistConsignmentBalances(rows) {
    var session = root.FADE_STORE.getActiveSession();
    if (!session || session.role !== 'admin') return Promise.reject(new Error('Impor saldo consignment hanya dapat dilakukan oleh Admin.'));
    return enqueueWrite(async function () {
      var payload = (rows || []).map(function (row) {
        return {
          id: row.id,
          client_id: row.clientId,
          store_name: row.storeName,
          sales_id: row.salesId || null,
          sales_name: row.salesName || '',
          sku: row.sku,
          product_name: row.productName || '',
          category: row.category || '',
          qty_consigned: Number(row.qtyConsigned || 0),
          qty_paid: Number(row.qtyPaid || 0),
          qty_returned: Number(row.qtyReturned || 0),
          qty_remaining: Number(row.qtyRemaining || 0),
          remaining_value: Number(row.remainingValue || 0),
          physical_qty: row.physicalQty == null ? null : Number(row.physicalQty),
          stock_status: row.stockStatus || '',
          data: row
        };
      });
      var result = await client.rpc('fade_replace_consignment_balances', { payload: payload });
      if (result.error) throw result.error;
    });
  }

  function routeForRole(role) {
    return role === 'sales' ? './sales.html#dashboard' : './admin.html#dashboard';
  }

  root.FADE_AUTH = {
    client: client,
    restoreSession: restoreSession,
    signIn: signIn,
    signOut: signOut,
    routeForRole: routeForRole,
    loadDataset: loadDataset,
    loadUploadHistory: loadUploadHistory,
    persistUploadHistory: persistUploadHistory,
    deleteUploadHistory: deleteUploadHistory,
    persistInvoices: persistInvoices,
    persistRewards: persistRewards,
    persistTargets: persistTargets,
    persistConsignmentBalances: persistConsignmentBalances
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
