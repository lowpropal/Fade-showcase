/**
 * FADE Pods · business-engine.js
 * Unified business logic & formula calculation engine for Admin and Sales.
 * Single source of truth ensuring 100% calculation parity.
 */
(function (root) {
  'use strict';

  var MS_PER_DAY = 86400000;

  function d(isoStr) {
    if (!isoStr) return null;
    return new Date(isoStr + 'T00:00:00');
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function lastDayOfMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  // Invoice State calculation as of a specific date
  function evaluateInvoiceState(inv, asOfIso) {
    var asOfDate = d(asOfIso);
    var rev = Number(inv.invoice_total_idr != null ? inv.invoice_total_idr : (inv.invoiceTotal != null ? inv.invoiceTotal : (inv.revenue || inv.r || 0)));
    var settl = Number(inv.other_settlement_idr != null ? inv.other_settlement_idr : (inv.otherSettlement != null ? inv.otherSettlement : (inv.penyelesaian || inv.o || 0)));
    var paidTotal = Number(inv.paid_total_idr != null ? inv.paid_total_idr : (inv.paidTotal != null ? inv.paidTotal : (inv.terbayar || inv.p || 0)));
    var lastPayDate = inv.last_payment_date || inv.lastPaymentDate || inv.tglBayarTerakhir || inv.lp;

    var paidAsOf = (lastPayDate && d(lastPayDate) <= asOfDate) ? paidTotal : (asOfDate ? paidTotal : 0);
    var sisa = Math.max(0, rev - settl - paidAsOf);

    var status = 'Belum Jatuh Tempo';
    var hariTelat = 0;
    var bisaDitagihkan = false;
    var isPartial = (paidAsOf > 0 && sisa > 0);

    var dueDateStr = inv.due_date || inv.dueDate || inv.jatuhTempo || inv.du;
    if (sisa <= 0) {
      status = 'Lunas';
      bisaDitagihkan = false;
      hariTelat = 0;
    } else if (!dueDateStr) {
      status = 'Belum Jatuh Tempo';
      bisaDitagihkan = false;
      hariTelat = null;
    } else {
      var dueDate = d(dueDateStr);
      if (dueDate > asOfDate) {
        status = 'Belum Jatuh Tempo';
        bisaDitagihkan = false;
        hariTelat = 0;
      } else if (dueDate.getTime() === asOfDate.getTime()) {
        status = 'Belum Jatuh Tempo';
        bisaDitagihkan = true;
        hariTelat = 0;
      } else {
        bisaDitagihkan = true;
        hariTelat = Math.max(1, Math.round((asOfDate - dueDate) / MS_PER_DAY));
        status = 'Terlambat Bayar';
      }
    }

    return {
      revenue: rev,
      dibayar: paidAsOf,
      penyelesaian: settl,
      sisa: sisa,
      status: status,
      isPartial: isPartial,
      hariTerlambat: hariTelat,
      bisaDitagihkan: bisaDitagihkan,
      dueDate: dueDateStr
    };
  }

  // Period Boundaries Resolver (Bulanan, YTD, or Custom Date Range)
  function resolvePeriod(periode, mode, snapshotCutoff, startDate, endDate) {
    snapshotCutoff = snapshotCutoff || '2026-11-22';

    if (mode === 'custom' && startDate && endDate) {
      var dari = startDate <= endDate ? startDate : endDate;
      var sampai = startDate <= endDate ? endDate : startDate;
      var effectiveAsOf = sampai > snapshotCutoff ? snapshotCutoff : sampai;
      return {
        mode: 'custom',
        dari: dari,
        sampai: sampai,
        asOf: effectiveAsOf,
        label: dari + ' s/d ' + sampai
      };
    }

    if (mode === 'ytd') {
      var yr = periode ? periode.slice(0, 4) : snapshotCutoff.slice(0, 4);
      return {
        mode: 'ytd',
        dari: yr + '-01-01',
        sampai: snapshotCutoff,
        asOf: snapshotCutoff,
        label: '1 Januari ' + yr + ' sampai ' + snapshotCutoff
      };
    } else {
      var p = periode || snapshotCutoff.slice(0, 7);
      var y = +p.slice(0, 4), m = +p.slice(5, 7);
      var endDay = lastDayOfMonth(y, m);
      var monthEndIso = y + '-' + pad(m) + '-' + pad(endDay);
      var effectiveMonthAsOf = monthEndIso > snapshotCutoff ? snapshotCutoff : monthEndIso;
      return {
        mode: 'bulan',
        periode: p,
        dari: y + '-' + pad(m) + '-01',
        sampai: monthEndIso,
        asOf: effectiveMonthAsOf,
        label: 'Bulan ' + p + ' (As of ' + effectiveMonthAsOf + ')'
      };
    }
  }

  // Filter dataset by role scope
  function filterByScope(invoices, role, userSalesName, selectedSales) {
    if (role === 'sales') {
      return invoices.filter(function (i) {
        var sName = i.sales_name || i.salesName || i.sales || i.s;
        return sName === userSalesName;
      });
    }
    if (!selectedSales || selectedSales === 'all') {
      return invoices;
    }
    return invoices.filter(function (i) {
      var sName = i.sales_name || i.salesName || i.sales || i.s;
      return sName === selectedSales;
    });
  }

  // Core Metric Aggregator
  function calculateSummary(invoices, targets, options) {
    options = options || {};
    var role = options.role || 'admin';
    var userSales = options.userSales || null;
    var selectedSales = options.selectedSales || 'all';
    var mode = options.mode || 'bulan';
    var periode = options.periode || '2026-11';
    var snapshot = options.snapshot || '2026-11-22';

    var pContext = resolvePeriod(periode, mode, snapshot, options.startDate, options.endDate);
    var scopedInvoices = filterByScope(invoices, role, userSales, selectedSales);

    var inRangeInvoices = scopedInvoices.filter(function (i) {
      var dStr = i.invoice_date || i.date || i.tanggal || i.d;
      return dStr >= pContext.dari && dStr <= pContext.sampai;
    });

    var totalQty = 0;
    var totalRevenue = 0;
    var totalSettlement = 0;
    var uniqueStores = new Set();

    inRangeInvoices.forEach(function (i) {
      var q = Number(i.qty != null ? i.qty : (i.q || 0));
      var r = Number(i.invoice_total_idr != null ? i.invoice_total_idr : (i.invoiceTotal != null ? i.invoiceTotal : (i.revenue || i.r || 0)));
      var o = Number(i.other_settlement_idr != null ? i.other_settlement_idr : (i.otherSettlement != null ? i.otherSettlement : (i.penyelesaian || i.o || 0)));
      totalQty += q;
      totalRevenue += r;
      totalSettlement += o;
      var store = i.store_name || i.storeName || i.toko || i.t;
      if (store) uniqueStores.add(store);
    });

    // Payments attributed to period
    var totalPayments = 0;
    scopedInvoices.forEach(function (i) {
      var lastPay = i.last_payment_date || i.lastPaymentDate || i.tglBayarTerakhir || i.lp;
      var paid = Number(i.paid_total_idr != null ? i.paid_total_idr : (i.paidTotal != null ? i.paidTotal : (i.terbayar || i.p || 0)));
      if (paid > 0 && lastPay && lastPay >= pContext.dari && lastPay <= pContext.sampai) {
        totalPayments += paid;
      }
    });

    // Outstanding evaluation as of pContext.asOf
    var bisaDitagihkan = 0;
    var belumJatuhTempo = 0;
    var invoiceOutstandingCount = 0;
    var invoiceTerlambatCount = 0;

    scopedInvoices.forEach(function (i) {
      var invDate = i.invoice_date || i.date || i.tanggal || i.d;
      if (invDate <= pContext.asOf) {
        var st = evaluateInvoiceState(i, pContext.asOf);
        if (st.sisa > 0) {
          invoiceOutstandingCount++;
          if (st.bisaDitagihkan) {
            bisaDitagihkan += st.sisa;
          } else {
            belumJatuhTempo += st.sisa;
          }
        }
        if (st.status === 'Terlambat Bayar') {
          invoiceTerlambatCount++;
        }
      }
    });

    var totalOutstanding = bisaDitagihkan + belumJatuhTempo;

    // Target and Achievement
    var targetValue = 0;
    var activeSalesKey = role === 'sales' ? userSales : (selectedSales === 'all' ? null : selectedSales);

    if (targets && typeof targets === 'object') {
      if (mode === 'bulan') {
        if (activeSalesKey) {
          targetValue = Number(targets[activeSalesKey + '|' + periode] || 0);
        } else {
          for (var k in targets) {
            if (k.endsWith('|' + periode)) {
              targetValue += Number(targets[k] || 0);
            }
          }
        }
      } else {
        var startMonth = pContext.dari.slice(0, 7);
        var endMonth = pContext.sampai.slice(0, 7);
        for (var tk in targets) {
          var parts = tk.split('|');
          var s = parts[0], m = parts[1];
          if (!activeSalesKey || s === activeSalesKey) {
            if (m >= startMonth && m <= endMonth) {
              targetValue += Number(targets[tk] || 0);
            }
          }
        }
      }
    }

    var achievementPct = targetValue > 0 ? +((totalQty / targetValue) * 100).toFixed(2) : null;

    return {
      role: role,
      salesScope: activeSalesKey || 'all',
      period: pContext,
      totalQty: totalQty,
      totalDataTerinput: inRangeInvoices.length,
      totalInvoicesInScope: scopedInvoices.length,
      revenue: totalRevenue,
      penyelesaianLain: totalSettlement,
      pembayaranMasuk: totalPayments,
      bisaDitagihkan: bisaDitagihkan,
      belumJatuhTempo: belumJatuhTempo,
      totalOutstanding: totalOutstanding,
      invoiceOutstandingCount: invoiceOutstandingCount,
      invoiceTerlambatCount: invoiceTerlambatCount,
      tokoUnikCount: uniqueStores.size,
      target: targetValue || null,
      achievement: achievementPct
    };
  }

  // Cross-Sales Comparison (Admin Only)
  function calculateComparison(invoices, targets, options) {
    options = options || {};
    var pContext = resolvePeriod(options.periode, options.mode, options.snapshot, options.startDate, options.endDate);
    var metric = options.metric || 'qty';

    var salesMap = {};
    invoices.forEach(function (i) {
      var sName = i.sales_name || i.salesName || i.sales || i.s || 'Unassigned';
      if (!salesMap[sName]) {
        salesMap[sName] = [];
      }
      salesMap[sName].push(i);
    });

    var rows = [];
    for (var sName in salesMap) {
      var sInvs = salesMap[sName];
      var sSummary = calculateSummary(sInvs, targets, {
        role: 'sales',
        userSales: sName,
        mode: options.mode,
        periode: options.periode,
        snapshot: options.snapshot,
        startDate: options.startDate,
        endDate: options.endDate
      });

      var val = 0;
      if (metric === 'qty') val = sSummary.totalQty;
      else if (metric === 'revenue') val = sSummary.revenue;
      else if (metric === 'pembayaran') val = sSummary.pembayaranMasuk;
      else if (metric === 'outstanding') val = sSummary.totalOutstanding;

      rows.push({
        sales: sName,
        value: val,
        qty: sSummary.totalQty,
        revenue: sSummary.revenue,
        pembayaran: sSummary.pembayaranMasuk,
        outstanding: sSummary.totalOutstanding,
        target: sSummary.target,
        achievement: sSummary.achievement,
        summary: sSummary
      });
    }

    rows.sort(function (a, b) {
      return b.value - a.value;
    });

    var maxValue = rows.length > 0 ? Math.max.apply(null, rows.map(function (r) { return r.value; })) : 1;

    return {
      metric: metric,
      period: pContext,
      maxValue: maxValue || 1,
      rows: rows
    };
  }

  function calculateMonthlyQtyBars(invoices, options) {
    options = options || {};
    var scoped = filterByScope(invoices, options.role, options.userSales, options.selectedSales);
    var monthly = {};

    scoped.forEach(function (i) {
      var dStr = i.invoice_date || i.date || i.tanggal || i.d;
      if (!dStr) return;
      var m = dStr.slice(0, 7);
      var q = Number(i.qty != null ? i.qty : (i.q || 0));
      monthly[m] = (monthly[m] || 0) + q;
    });

    var sortedMonths = Object.keys(monthly).sort();
    var maxQty = sortedMonths.length > 0 ? Math.max.apply(null, sortedMonths.map(function (m) { return monthly[m]; })) : 1;

    return sortedMonths.map(function (m) {
      return {
        month: m,
        qty: monthly[m],
        heightPct: +(monthly[m] / maxQty * 100).toFixed(1)
      };
    });
  }

  var Engine = {
    evaluateInvoiceState: evaluateInvoiceState,
    resolvePeriod: resolvePeriod,
    filterByScope: filterByScope,
    calculateSummary: calculateSummary,
    calculateComparison: calculateComparison,
    calculateMonthlyQtyBars: calculateMonthlyQtyBars
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Engine;
  }
  root.FADE_ENGINE = Engine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
