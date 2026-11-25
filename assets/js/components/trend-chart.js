/**
 * FADE Pods Showcase v0.2 · Interactive Trend Chart Component
 * Revision 02B: Dynamic Container-Aware Geometry, Unified Tooltip Contract,
 * Zero-Value / Empty-State Handling, and Timeframe Synchronization.
 */
(function (root) {
  'use strict';

  var FADE_TREND_CHART = {
    chartType: 'line', // 'line' | 'bar'
    activeTimeframe: '30D', // '7D' | '30D' | '90D'
    activePointIndex: null,
    points: [],
    invoices: [],
    currentSalesFilter: 'all',
    currentMode: 'bulan', // 'bulan' | 'ytd' | 'custom'
    customStart: null,
    customEnd: null,
    _initialized: false,
    _resizeObserver: null,
    _resizeRaf: null,
    _boundDocumentKeydown: null,
    _boundWindowKeydown: null,
    _boundNavDismiss: null,
    _boundOutsidePointer: null,

    BOUNDS: {
      viewBoxWidth: 1000,
      viewBoxHeight: 340,
      xMin: 64,
      xMax: 960,
      yMin: 24,
      yMax: 290,
      isMobile: false
    },

    init: function () {
      if (this._initialized) {
        this.render();
        return;
      }
      this._initialized = true;

      this.bindControls();
      this.setupResizeObserver();
    },

    setupResizeObserver: function () {
      var self = this;
      var container = document.getElementById('chartInteractiveContainer');

      if (container && typeof window.ResizeObserver !== 'undefined') {
        if (this._resizeObserver) {
          try { this._resizeObserver.disconnect(); } catch (e) {}
        }
        this._resizeObserver = new ResizeObserver(function () {
          if (self._resizeRaf) cancelAnimationFrame(self._resizeRaf);
          self._resizeRaf = requestAnimationFrame(function () {
            self.render();
          });
        });
        this._resizeObserver.observe(container);
      } else {
        window.addEventListener('resize', function () {
          if (self._resizeRaf) cancelAnimationFrame(self._resizeRaf);
          self._resizeRaf = requestAnimationFrame(function () {
            self.render();
          });
        });
      }
    },

    resize: function () {
      var container = document.getElementById('chartInteractiveContainer');
      if (container && container.offsetParent === null) {
        return;
      }
      this.render();
    },

    calculateBounds: function () {
      var container = document.getElementById('chartInteractiveContainer');
      var w = 1000;
      var h = 340;

      if (container) {
        var rect = container.getBoundingClientRect();
        if (rect.width > 0) w = Math.round(rect.width);
        if (rect.height > 0) h = Math.round(rect.height);
      }

      if (w < 280) w = 280;
      if (h < 220) h = 220;

      var vpW = (typeof window !== 'undefined' && (window.innerWidth || (document.documentElement && document.documentElement.clientWidth))) || w;
      var isMobile = vpW < 768;
      // Give the plot more horizontal room on phones while keeping a clear Y-axis gutter.
      var yAxisSpace = isMobile ? 38 : 50;
      var rightMargin = 8;
      // Reserve a consistent top lane for the selected-value tooltip on every viewport.
      var topMargin = 56;
      var bottomMargin = isMobile ? 32 : 42;

      this.BOUNDS = {
        viewBoxWidth: w,
        viewBoxHeight: h,
        xMin: yAxisSpace,
        xMax: Math.max(yAxisSpace + 100, w - rightMargin),
        yMin: topMargin,
        yMax: Math.max(topMargin + 100, h - bottomMargin),
        isMobile: isMobile
      };

      var svg = document.getElementById('trendChartSvg');
      if (svg) {
        svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      }

      return this.BOUNDS;
    },

    bindControls: function () {
      var self = this;
      var btnLine = document.getElementById('chartBtnLine');
      var btnBar = document.getElementById('chartBtnBar');
      var btn7D = document.getElementById('chartBtn7D');
      var btn30D = document.getElementById('chartBtn30D');
      var btn90D = document.getElementById('chartBtn90D');

      if (btnLine) {
        btnLine.addEventListener('click', function () {
          self.setChartType('line');
        });
      }
      if (btnBar) {
        btnBar.addEventListener('click', function () {
          self.setChartType('bar');
        });
      }

      if (btn7D) {
        btn7D.addEventListener('click', function () {
          self.setTimeframe('7D');
        });
      }
      if (btn30D) {
        btn30D.addEventListener('click', function () {
          self.setTimeframe('30D');
        });
      }
      if (btn90D) {
        btn90D.addEventListener('click', function () {
          self.setTimeframe('90D');
        });
      }

      var overlay = document.getElementById('chartPointerOverlay');
      if (overlay) {
        overlay.addEventListener('pointermove', function (e) {
          self.handlePointerMove(e);
        });
        overlay.addEventListener('pointerdown', function (e) {
          self.handlePointerClick(e);
        });
        overlay.addEventListener('pointerleave', function (e) {
          self.handlePointerLeave(e);
        });
        overlay.addEventListener('click', function (e) {
          self.handlePointerClick(e);
        });
        overlay.addEventListener('touchstart', function (e) {
          self.handlePointerMove(e);
        }, { passive: true });
        overlay.addEventListener('touchmove', function (e) {
          self.handlePointerMove(e);
        }, { passive: true });
        overlay.addEventListener('touchend', function (e) {
          self.handlePointerMove(e);
        }, { passive: true });
      }

      var container = document.getElementById('chartInteractiveContainer');
      if (container) {
        container.addEventListener('keydown', function (e) {
          self.handleKeyDown(e);
        });
        container.addEventListener('blur', function (e) {
          self.handlePointerLeave(e);
        });
      }

      // Outside tap listener: dismiss tooltip & indicators when tapping outside chart on mobile/desktop
      this._boundOutsidePointer = function (e) {
        var chartBox = document.getElementById('chartInteractiveContainer');
        if (chartBox && !chartBox.contains(e.target)) {
          self.dismissTooltip();
        }
      };
      document.addEventListener('pointerdown', this._boundOutsidePointer);

      // Close button on mobile docked tooltip
      var closeBtn = document.getElementById('chartTooltipCloseBtn');
      if (closeBtn) {
        closeBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          e.preventDefault();
          self.dismissTooltip();
        });
      }

      // Escape key listener to close active tooltip / focus
      var escHandler = function (e) {
        if (e.key === 'Escape' || e.keyCode === 27) {
          self.activePointIndex = null;
          self.dismissTooltip();
        }
      };
      this._boundDocumentKeydown = escHandler;
      this._boundWindowKeydown = escHandler;
      document.addEventListener('keydown', this._boundDocumentKeydown);
      window.addEventListener('keydown', this._boundWindowKeydown);

      // Clean dismissal when navigating between hash sections or browser history
      var navDismissHandler = function () {
        self.activePointIndex = null;
        self.dismissTooltip();
      };
      this._boundNavDismiss = navDismissHandler;
      window.addEventListener('hashchange', this._boundNavDismiss);
      window.addEventListener('popstate', this._boundNavDismiss);
    },

    destroy: function () {
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
        this._resizeObserver = null;
      }
      if (this._resizeRaf) {
        cancelAnimationFrame(this._resizeRaf);
        this._resizeRaf = null;
      }
      if (this._boundDocumentKeydown) document.removeEventListener('keydown', this._boundDocumentKeydown);
      if (this._boundWindowKeydown) window.removeEventListener('keydown', this._boundWindowKeydown);
      if (this._boundNavDismiss) {
        window.removeEventListener('hashchange', this._boundNavDismiss);
        window.removeEventListener('popstate', this._boundNavDismiss);
      }
      if (this._boundOutsidePointer) document.removeEventListener('pointerdown', this._boundOutsidePointer);
      this._boundDocumentKeydown = null;
      this._boundWindowKeydown = null;
      this._boundNavDismiss = null;
      this._boundOutsidePointer = null;
      this._initialized = false;
      this.dismissTooltip();
    },

    dismissTooltip: function () {
      this.activePointIndex = null;
      var tooltipGroup = document.getElementById('chartTooltipGroup');
      if (tooltipGroup) tooltipGroup.style.display = 'none';
      var tipHtml = document.getElementById('chartTooltip');
      if (tipHtml) {
        tipHtml.classList.add('hidden');
        tipHtml.classList.remove('chart-docked');
        tipHtml.style.display = 'none';
      }
      var guideLine = document.getElementById('chartGuideLine');
      if (guideLine) guideLine.style.display = 'none';
      var activeRing = document.getElementById('chartActiveNodeRing');
      if (activeRing) activeRing.style.display = 'none';
      ['chartActiveNodePip', 'chartActiveNodeDot'].forEach(function (id) {
        var indicator = document.getElementById(id);
        if (indicator) indicator.style.display = 'none';
      });
      var barsContainer = document.getElementById('chartBarsGroup');
      if (barsContainer) {
        var bars = barsContainer.querySelectorAll('rect');
        bars.forEach(function (rect) {
          rect.setAttribute('fill', 'url(#barGradDefault)');
          rect.setAttribute('stroke', 'var(--border-default, #39393D)');
          rect.setAttribute('stroke-width', '1');
        });
      }
      if (this.points && this.points.length > 0) {
        this.renderXAxis(this.points);
      }
    },

    setChartType: function (type) {
      if (this.chartType === type) return;
      this.chartType = type;
      this.updateButtonStyles();
      this.render();
    },

    setTimeframe: function (tf) {
      if (this.activeTimeframe === tf) return;
      this.activeTimeframe = tf;
      this.activePointIndex = null;
      this.updateButtonStyles();
      this.render();
    },

    updateButtonStyles: function () {
      var tf = this.activeTimeframe;
      var cType = this.chartType;
      var btnLine = document.getElementById('chartBtnLine');
      var btnBar = document.getElementById('chartBtnBar');
      var btn7D = document.getElementById('chartBtn7D');
      var btn30D = document.getElementById('chartBtn30D');
      var btn90D = document.getElementById('chartBtn90D');
      var tfGroup = document.getElementById('chartTimeframeGroup');

      if (tfGroup) {
        tfGroup.style.display = this.currentMode === 'bulan' ? 'flex' : 'none';
      }

      var activeClass = 'h-full px-3 py-1 rounded-md bg-surface-1 text-text-primary font-semibold border border-border-default shadow-sm transition-colors cursor-pointer flex items-center justify-center';
      var inactiveClass = 'h-full px-3 py-1 rounded-md text-text-muted hover:text-text-primary transition-colors cursor-pointer flex items-center justify-center';

      var activeTypeClass = 'inline-flex items-center gap-1.5 h-full px-3 py-1 rounded-md text-caption font-label bg-surface-1 text-accent font-semibold border border-border-default shadow-sm transition-colors cursor-pointer justify-center';
      var inactiveTypeClass = 'inline-flex items-center gap-1.5 h-full px-3 py-1 rounded-md text-caption font-label text-text-muted hover:text-text-primary transition-colors cursor-pointer justify-center';

      if (btnLine) {
        btnLine.className = cType === 'line' ? activeTypeClass : inactiveTypeClass;
        btnLine.setAttribute('aria-pressed', cType === 'line');
      }
      if (btnBar) {
        btnBar.className = cType === 'bar' ? activeTypeClass : inactiveTypeClass;
        btnBar.setAttribute('aria-pressed', cType === 'bar');
      }

      if (btn7D) {
        btn7D.className = tf === '7D' ? activeClass : inactiveClass;
        btn7D.setAttribute('aria-selected', tf === '7D');
      }
      if (btn30D) {
        btn30D.className = tf === '30D' ? activeClass : inactiveClass;
        btn30D.setAttribute('aria-selected', tf === '30D');
      }
      if (btn90D) {
        btn90D.className = tf === '90D' ? activeClass : inactiveClass;
        btn90D.setAttribute('aria-selected', tf === '90D');
      }
    },

    setData: function (invoices, salesFilter, mode, startDate, endDate) {
      this.invoices = invoices || [];
      this.currentSalesFilter = salesFilter || 'all';
      this.currentMode = mode || 'bulan';
      this.customStart = startDate || null;
      this.customEnd = endDate || null;
      this.activePointIndex = null;
      this.updateButtonStyles();
      this.render();
    },

    getFilteredInvoices: function () {
      var self = this;
      return this.invoices.filter(function (inv) {
        if (self.currentSalesFilter !== 'all') {
          var s = inv.salesName || inv.sales_name;
          if (s !== self.currentSalesFilter) return false;
        }
        return true;
      });
    },

    formatShortDate: function (iso) {
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      var parts = iso.split('-');
      if (parts.length !== 3) return iso;
      var mIdx = parseInt(parts[1], 10) - 1;
      return parts[2] + ' ' + (months[mIdx] || parts[1]);
    },

    buildCustomMilestones: function (startIso, endIso) {
      var startMs = new Date(startIso + 'T00:00:00Z').getTime();
      var endMs = new Date(endIso + 'T00:00:00Z').getTime();
      if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) {
        return [
          { date: startIso, label: this.formatShortDate(startIso) },
          { date: endIso || startIso, label: this.formatShortDate(endIso || startIso) }
        ];
      }
      var steps = 6;
      var result = [];
      for (var i = 0; i < steps; i++) {
        var t = startMs + ((endMs - startMs) * (i / (steps - 1)));
        var iso = new Date(t).toISOString().slice(0, 10);
        result.push({ date: iso, label: this.formatShortDate(iso) });
      }
      return result;
    },

    aggregatePoints: function (filtered) {
      if (this.currentMode === 'ytd') {
        var months = [
          { ym: '2026-06', startDate: '2026-06-01', endDate: '2026-06-30', date: '2026-06-30', label: 'Jun' },
          { ym: '2026-07', startDate: '2026-07-01', endDate: '2026-07-31', date: '2026-07-31', label: 'Jul' },
          { ym: '2026-08', startDate: '2026-08-01', endDate: '2026-08-31', date: '2026-08-31', label: 'Agu' },
          { ym: '2026-09', startDate: '2026-09-01', endDate: '2026-09-30', date: '2026-09-30', label: 'Sep' },
          { ym: '2026-10', startDate: '2026-10-01', endDate: '2026-10-31', date: '2026-10-31', label: 'Okt' },
          { ym: '2026-11', startDate: '2026-11-01', endDate: '2026-11-22', date: '2026-11-22', label: 'Nov' }
        ];
        var runningCum = 0;
        return months.map(function (m) {
          var monthRev = 0;
          filtered.forEach(function (inv) {
            var d = inv.date || inv.invoice_date || '';
            if (d >= m.startDate && d <= m.endDate) {
              monthRev += Number(inv.invoiceTotal || inv.invoice_total_idr || 0);
            }
          });
          runningCum += monthRev;
          return {
            date: m.date,
            label: m.label,
            startDate: m.startDate,
            endDate: m.endDate,
            cumulative: runningCum,
            daily: monthRev
          };
        });
      }

      var buckets = [];
      if (this.currentMode === 'custom' && this.customStart && this.customEnd) {
        var startMs = new Date(this.customStart + 'T00:00:00Z').getTime();
        var endMs = new Date(this.customEnd + 'T00:00:00Z').getTime();
        var diffDays = Math.max(0, Math.round((endMs - startMs) / (24 * 3600 * 1000)));
        if (diffDays <= 31) {
          for (var cd = 0; cd <= diffDays; cd++) {
            var cIso = new Date(startMs + cd * 24 * 3600 * 1000).toISOString().slice(0, 10);
            buckets.push({
              date: cIso,
              label: this.formatShortDate(cIso),
              startDate: cIso,
              endDate: cIso
            });
          }
        } else {
          var milestones = this.buildCustomMilestones(this.customStart, this.customEnd);
          for (var cm = 0; cm < milestones.length; cm++) {
            var bucketStart = cm > 0
              ? new Date(new Date(milestones[cm - 1].date + 'T00:00:00Z').getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10)
              : milestones[0].date;
            buckets.push({
              date: milestones[cm].date,
              label: milestones[cm].label,
              startDate: bucketStart,
              endDate: milestones[cm].date
            });
          }
        }
      } else {
        var rangeEnd = this.customEnd || '2026-11-22';
        var rangeDays = this.activeTimeframe === '7D' ? 7 : (this.activeTimeframe === '90D' ? 90 : 30);
        var rangeEndMs = new Date(rangeEnd + 'T00:00:00Z').getTime();
        var rangeStartMs = rangeEndMs - ((rangeDays - 1) * 24 * 60 * 60 * 1000);
        var rangeStart = new Date(rangeStartMs).toISOString().slice(0, 10);

        if (this.activeTimeframe === '90D') {
          // Keep the 90 daily observations, grouped into readable seven-day bars.
          for (var weekStartMs = rangeStartMs; weekStartMs <= rangeEndMs; weekStartMs += 7 * 24 * 60 * 60 * 1000) {
            var weekEndMs = Math.min(weekStartMs + (6 * 24 * 60 * 60 * 1000), rangeEndMs);
            var weekStart = new Date(weekStartMs).toISOString().slice(0, 10);
            var weekEnd = new Date(weekEndMs).toISOString().slice(0, 10);
            buckets.push({
              date: weekEnd,
              label: this.formatShortDate(weekStart) + '–' + this.formatShortDate(weekEnd),
              startDate: weekStart,
              endDate: weekEnd
            });
          }
        } else {
          // 7D and 30D always represent the full selected number of calendar days.
          for (var dayMs = rangeStartMs; dayMs <= rangeEndMs; dayMs += 24 * 60 * 60 * 1000) {
            var dayIso = new Date(dayMs).toISOString().slice(0, 10);
            buckets.push({
              date: dayIso,
              label: this.formatShortDate(dayIso),
              startDate: dayIso,
              endDate: dayIso
            });
          }
        }
      }

      var runningTotal = 0;
      return buckets.map(function (b, idx) {
        var bucketRev = 0;
        filtered.forEach(function (inv) {
          var d = inv.date || inv.invoice_date || '';
          if (d >= b.startDate && d <= b.endDate) {
            bucketRev += Number(inv.invoiceTotal || inv.invoice_total_idr || 0);
          }
        });
        runningTotal += bucketRev;
        return {
          date: b.date,
          label: b.label,
          startDate: b.startDate,
          endDate: b.endDate,
          cumulative: runningTotal,
          daily: bucketRev
        };
      });
    },

    setEmptyState: function (isEmpty, message, subtitle) {
      var emptyEl = document.getElementById('chartEmptyState');
      var tooltip = document.getElementById('chartTooltip');
      var tooltipGroup = document.getElementById('chartTooltipGroup');

      if (isEmpty) {
        this.dismissTooltip();
        if (!emptyEl) {
          var container = document.getElementById('chartInteractiveContainer');
          if (container) {
            emptyEl = document.createElement('div');
            emptyEl.id = 'chartEmptyState';
            emptyEl.className = 'absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-surface-1/90 backdrop-blur-sm rounded-lg z-20';
            emptyEl.innerHTML =
              '<span class="material-symbols-outlined text-[36px] text-text-muted mb-2">bar_chart</span>' +
              '<p class="text-xs font-semibold text-text-primary">' + (message || 'Tidak ada data transaksi') + '</p>' +
              '<p class="text-[11px] text-text-muted mt-1 max-w-xs">' + (subtitle || 'Ubah rentang waktu atau filter sales.') + '</p>';
            container.appendChild(emptyEl);
          }
        } else {
          emptyEl.classList.remove('hidden');
          var pMsg = emptyEl.querySelector('p.text-xs');
          if (pMsg) pMsg.textContent = message || 'Tidak ada data transaksi';
          var pSub = emptyEl.querySelector('p.text-\\[11px\\]') || emptyEl.querySelectorAll('p')[1];
          if (pSub) pSub.textContent = subtitle || 'Ubah rentang waktu atau filter sales.';
        }

        // Clean SVG elements
        var areaEl = document.getElementById('chartSplineArea');
        var strokeEl = document.getElementById('chartSplineStroke');
        var nodesContainer = document.getElementById('chartNodesGroup');
        var barsContainer = document.getElementById('chartBarsGroup');
        var gridContainer = document.getElementById('chartGridLines');
        var yLabelsContainer = document.getElementById('chartYAxisLabels');
        var xLabelsContainer = document.getElementById('chartXAxisLabels');
        var activeRing = document.getElementById('chartActiveNodeRing');
        var guide = document.getElementById('chartGuideLine');

        if (areaEl) areaEl.setAttribute('d', '');
        if (strokeEl) strokeEl.setAttribute('d', '');
        if (nodesContainer) nodesContainer.innerHTML = '';
        if (barsContainer) barsContainer.innerHTML = '';
        if (gridContainer) gridContainer.innerHTML = '';
        if (yLabelsContainer) yLabelsContainer.innerHTML = '';
        if (xLabelsContainer) xLabelsContainer.innerHTML = '';
        if (activeRing) activeRing.style.display = 'none';
        ['chartActiveNodePip', 'chartActiveNodeDot'].forEach(function (id) {
          var indicator = document.getElementById(id);
          if (indicator) indicator.style.display = 'none';
        });
        if (guide) guide.style.display = 'none';
        if (tooltip) tooltip.classList.add('hidden');
        if (tooltipGroup) tooltipGroup.style.display = 'none';

        var revEl = document.getElementById('chartMonthlyRevenue');
        if (revEl) revEl.textContent = 'Rp 0';
        var growthEl = document.getElementById('chartTrendGrowth');
        if (growthEl) {
          growthEl.innerHTML = '<span class="material-symbols-outlined text-[15px] text-text-muted">info</span><span class="text-text-muted">Tidak ada transaksi</span>';
        }

        var titleEl = document.getElementById('chartTitleText');
        if (titleEl) {
          if (this.currentMode === 'ytd') titleEl.textContent = 'Tren Penjualan YTD';
          else if (this.currentMode === 'custom') titleEl.textContent = 'Tren Penjualan (Rentang Kustom)';
          else titleEl.textContent = 'Tren Penjualan ' + (this.activeTimeframe === '7D' ? '7 Hari' : (this.activeTimeframe === '90D' ? '90 Hari' : '30 Hari'));
        }

        var periodEl = document.getElementById('chartPeriodLabel');
        if (periodEl) {
          if (this.currentMode === 'custom' && this.customStart && this.customEnd) {
            periodEl.textContent = this.formatShortDate(this.customStart) + ' – ' + this.formatShortDate(this.customEnd);
          } else if (this.currentMode === 'ytd') {
            periodEl.textContent = 'Jun – Nov 2026 (YTD)';
          } else {
            var periodEnd = this.customEnd || '2026-11-22';
            var dayCount = this.activeTimeframe === '7D' ? 7 : (this.activeTimeframe === '90D' ? 90 : 30);
            var periodStart = new Date(new Date(periodEnd + 'T00:00:00Z').getTime() - ((dayCount - 1) * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
            periodEl.textContent = this.formatShortDate(periodStart) + ' – ' + this.formatShortDate(periodEnd) + ' (' + dayCount + ' Hari)';
          }
        }
      } else {
        if (emptyEl) emptyEl.classList.add('hidden');
        var guideEl = document.getElementById('chartGuideLine');
        if (guideEl) guideEl.style.display = '';
      }
    },

    render: function () {
      var filteredInvoices = this.getFilteredInvoices();
      if (!filteredInvoices || filteredInvoices.length === 0) {
        this.setEmptyState(true, 'Tidak ada data transaksi untuk filter ini', 'Coba ganti filter sales atau pilih Semua Sales.');
        return;
      }

      var rawPoints = this.aggregatePoints(filteredInvoices);
      if (!rawPoints || rawPoints.length === 0) {
        this.setEmptyState(true, 'Rentang waktu tidak valid', 'Pilih tanggal awal dan akhir yang valid.');
        return;
      }

      // Check the full bucket range, including the first day of each weekly period.
      var rangeStartDate = rawPoints[0].startDate || rawPoints[0].date;
      var rangeEndDate = rawPoints[rawPoints.length - 1].endDate || rawPoints[rawPoints.length - 1].date;
      var hasTransactionsInRange = filteredInvoices.some(function (inv) {
        var d = inv.date || inv.invoice_date || '';
        return d >= rangeStartDate && d <= rangeEndDate;
      });

      if (!hasTransactionsInRange) {
        var tfName = this.currentMode === 'custom' ? 'rentang tanggal ini' : (this.activeTimeframe === '7D' ? '7 hari terakhir' : (this.activeTimeframe === '90D' ? '90 hari terakhir' : 'rentang waktu ini'));
        var emptyHint = this.currentMode === 'custom' ? 'Pilih tanggal lain untuk melihat transaksi.' : 'Pilih rentang 30D atau 90D untuk melihat riwayat penjualan lainnya.';
        this.setEmptyState(true, 'Tidak ada transaksi pada ' + tfName, emptyHint);
        return;
      }

      this.setEmptyState(false);
      var b = this.calculateBounds();
      var totalPoints = rawPoints.length;
      var isBarMode = this.chartType === 'bar';

      // Line and Bar both show the value for each displayed bucket.
      // The cumulative total stays in the summary and tooltip as context.
      var maxBarVal = 0;
      rawPoints.forEach(function (p) {
        if (p.daily > maxBarVal) maxBarVal = p.daily;
      });
      var barScaleCeilingMillions = this.getNiceScaleCeiling(maxBarVal / 1000000);
      var barScaleCeiling = barScaleCeilingMillions * 1000000;

      // Use the same bucket-value scale for both chart types.
      var activeCeilingMillions = barScaleCeilingMillions;

      var availableWidth = (b.xMax - b.xMin);
      var slotWidth = totalPoints > 0 ? (availableWidth / totalPoints) : availableWidth;

      var plottedPoints = rawPoints.map(function (p, idx) {
        var x;
        if (isBarMode) {
          x = b.xMin + (idx + 0.5) * slotWidth;
        } else {
          x = totalPoints === 1 ? b.xMin + availableWidth / 2 : b.xMin + (idx / (totalPoints - 1)) * availableWidth;
        }
        var normLine = Math.min(1, Math.max(0, p.daily / barScaleCeiling));
        var yLine = b.yMax - normLine * (b.yMax - b.yMin);

        var normBar = Math.min(1, Math.max(0, p.daily / barScaleCeiling));
        var yBar = b.yMax - normBar * (b.yMax - b.yMin);
        var barH = p.daily > 0 ? Math.max(4, Math.round(normBar * (b.yMax - b.yMin))) : 0;

        return {
          date: p.date,
          label: p.label,
          cumulative: p.cumulative,
          daily: p.daily,
          x: Math.round(x * 10) / 10,
          y: Math.round(yLine * 10) / 10,
          barY: Math.round(yBar * 10) / 10,
          barHeight: barH,
          slotWidth: slotWidth
        };
      });

      this.points = plottedPoints;
      this.activeCeilingMillions = activeCeilingMillions;

      this.updateSummaryPresentation(plottedPoints);
      this.renderGrid(activeCeilingMillions);

      if (this.chartType === 'line') {
        this.renderSpline(plottedPoints);
        this.renderNodes(plottedPoints);
        var barsContainer = document.getElementById('chartBarsGroup');
        if (barsContainer) barsContainer.innerHTML = '';
        var activeRing = document.getElementById('chartActiveNodeRing');
        var activePip = document.getElementById('chartActiveNodePip') || document.getElementById('chartActiveNodeDot');
        if (activeRing) activeRing.style.display = '';
        if (activePip) activePip.style.display = '';
      } else {
        var areaEl = document.getElementById('chartSplineArea');
        var strokeEl = document.getElementById('chartSplineStroke');
        var nodesContainer = document.getElementById('chartNodesGroup');
        if (areaEl) areaEl.setAttribute('d', '');
        if (strokeEl) strokeEl.setAttribute('d', '');
        if (nodesContainer) nodesContainer.innerHTML = '';
        var activeRing2 = document.getElementById('chartActiveNodeRing');
        var activePip2 = document.getElementById('chartActiveNodePip') || document.getElementById('chartActiveNodeDot');
        if (activeRing2) activeRing2.style.display = 'none';
        if (activePip2) activePip2.style.display = 'none';
        this.renderBars(plottedPoints);
      }

      this.renderXAxis(plottedPoints);
      if (this.activePointIndex !== null) {
        this.updateActivePresentation();
      } else {
        this.dismissTooltip();
      }
    },

    updateSummaryPresentation: function (points) {
      var lastPoint = points[points.length - 1];
      var totalRev = lastPoint.cumulative;
      var revEl = document.getElementById('chartMonthlyRevenue');
      if (revEl) {
        var revJt = (totalRev / 1000000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' jt';
        revEl.textContent = 'Rp ' + revJt;
      }

      var titleEl = document.getElementById('chartTitleText');
      if (titleEl) {
        if (this.currentMode === 'ytd') titleEl.textContent = 'Tren Penjualan YTD';
        else if (this.currentMode === 'custom') titleEl.textContent = 'Tren Penjualan (Rentang Kustom)';
        else titleEl.textContent = 'Tren Penjualan ' + (this.activeTimeframe === '7D' ? '7 Hari' : (this.activeTimeframe === '90D' ? '90 Hari' : '30 Hari'));
      }

      var periodEl = document.getElementById('chartPeriodLabel');
      if (periodEl) {
        if (this.currentMode === 'ytd') {
          periodEl.textContent = 'Jun – Nov 2026 (YTD)';
        } else if (this.currentMode === 'custom' && this.customStart && this.customEnd) {
          periodEl.textContent = this.formatShortDate(this.customStart) + ' – ' + this.formatShortDate(this.customEnd);
        } else {
          var periodEnd = this.customEnd || '2026-11-22';
          var dayCount = this.activeTimeframe === '7D' ? 7 : (this.activeTimeframe === '90D' ? 90 : 30);
          var periodStart = new Date(new Date(periodEnd + 'T00:00:00Z').getTime() - ((dayCount - 1) * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
          periodEl.textContent = this.formatShortDate(periodStart) + ' – ' + this.formatShortDate(periodEnd) + ' (' + dayCount + ' Hari)';
        }
      }

      var growthEl = document.getElementById('chartTrendGrowth');
      if (growthEl) {
        var timeLabel = this.activeTimeframe === '7D' ? '7 hari terakhir' : (this.activeTimeframe === '90D' ? '90 hari terakhir' : 'tersinkron');
        if (totalRev === 0) {
          growthEl.innerHTML = '<span class="material-symbols-outlined text-[15px] text-text-muted">info</span><span class="text-text-muted">Tidak ada transaksi</span>';
        } else {
          growthEl.innerHTML = '<span class="material-symbols-outlined text-[15px]">trending_up</span><span>Rp ' + (totalRev / 1000000).toFixed(1) + ' jt (' + timeLabel + ')</span>';
        }
      }
    },

    renderBars: function (points) {
      var self = this;
      var barsContainer = document.getElementById('chartBarsGroup');
      if (!barsContainer) return;
      barsContainer.innerHTML = '';

      var count = points.length;
      var availableWidth = (self.BOUNDS.xMax - self.BOUNDS.xMin);
      var slotWidth = count > 0 ? (availableWidth / count) : availableWidth;
      var barW = Math.max(8, Math.min(44, Math.round(slotWidth * 0.52)));
      if (count > 15) barW = Math.max(6, Math.min(22, Math.round(slotWidth * 0.58)));
      else if (count <= 7) barW = Math.max(16, Math.min(44, Math.round(slotWidth * 0.44)));

      var activeIdx = self.activePointIndex;

      points.forEach(function (p, idx) {
        var isHighlight = (idx === activeIdx);
        var barX = Math.round(p.x - (barW / 2));
        var hasValue = p.daily > 0;
        var barH = hasValue ? p.barHeight : 2;
        var barY = hasValue ? p.barY : (self.BOUNDS.yMax - 2);

        var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', barX);
        rect.setAttribute('y', barY);
        rect.setAttribute('width', barW);
        rect.setAttribute('height', barH);
        rect.setAttribute('rx', barW > 12 ? '4' : '2');
        rect.setAttribute('fill', isHighlight ? 'url(#barGradHighlight)' : (hasValue ? 'url(#barGradDefault)' : 'var(--bg-surface-2, #2B2B2E)'));
        rect.setAttribute('stroke', isHighlight ? '#F28C45' : (hasValue ? 'var(--border-default, #39393D)' : 'var(--border-subtle, #333336)'));
        rect.setAttribute('stroke-width', isHighlight ? '1.5' : '1');
        rect.setAttribute('class', 'chart-bar cursor-pointer transition-all duration-150');
        rect.setAttribute('data-index', idx);
        rect.setAttribute('tabindex', '0');
        rect.setAttribute('role', 'button');
        rect.setAttribute('aria-label', p.label + ': Rp ' + (p.daily / 1000000).toFixed(1) + ' jt (Kumulatif: Rp ' + (p.cumulative / 1000000).toFixed(1) + ' jt)');

        rect.addEventListener('click', function () {
          self.selectPoint(idx);
        });
        rect.addEventListener('focus', function () {
          self.selectPoint(idx);
        });

        barsContainer.appendChild(rect);
      });
    },

    renderGrid: function (maxMillions) {
      var b = this.BOUNDS;
      var gridContainer = document.getElementById('chartGridLines');
      var labelsContainer = document.getElementById('chartYAxisLabels');
      if (!gridContainer || !labelsContainer) return;

      var step = maxMillions / 4;
      var precision = step < 0.01 ? 3 : (step < 0.1 ? 2 : (step < 1 ? 1 : 0));
      var formatAxisTick = function (value) {
        return value.toLocaleString('id-ID', {
          minimumFractionDigits: precision,
          maximumFractionDigits: precision
        }) + 'jt';
      };
      var lines = [
        { y: b.yMin, label: formatAxisTick(maxMillions) },
        { y: b.yMin + (b.yMax - b.yMin) * 0.25, label: formatAxisTick(step * 3) },
        { y: b.yMin + (b.yMax - b.yMin) * 0.50, label: formatAxisTick(step * 2) },
        { y: b.yMin + (b.yMax - b.yMin) * 0.75, label: formatAxisTick(step) },
        { y: b.yMax, label: '0' }
      ];

      var gridHtml = '';
      var labelsHtml = '';

      lines.forEach(function (l, idx) {
        var y = Math.round(l.y);
        var isBase = idx === lines.length - 1;
        if (isBase) {
          gridHtml += '<line stroke="var(--border-default, #39393D)" stroke-width="1" x1="' + (b.xMin - 6) + '" x2="' + (b.xMax + 6) + '" y1="' + y + '" y2="' + y + '"></line>';
        } else {
          gridHtml += '<line stroke="var(--border-subtle, #2B2B2E)" stroke-dasharray="3 3" stroke-width="1" x1="' + (b.xMin - 6) + '" x2="' + (b.xMax + 6) + '" y1="' + y + '" y2="' + y + '"></line>';
        }

        labelsHtml += '<text fill="var(--text-muted, #8F8F93)" font-family="\'Plus Jakarta Sans\', sans-serif" font-size="' + (b.isMobile ? '11' : '12') + '" text-anchor="end" x="' + (b.xMin - 6) + '" y="' + (y + 4) + '">' + l.label + '</text>';
      });

      gridContainer.innerHTML = gridHtml;
      labelsContainer.innerHTML = labelsHtml;
    },

    getNiceScaleCeiling: function (maxMillions) {
      if (!Number.isFinite(maxMillions) || maxMillions <= 0) return 1;
      var paddedMax = maxMillions * 1.05;
      var magnitude = Math.pow(10, Math.floor(Math.log10(paddedMax)));
      var normalized = paddedMax / magnitude;
      var niceMultipliers = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10];
      var multiplier = niceMultipliers.find(function (candidate) { return candidate >= normalized; }) || 10;
      return multiplier * magnitude;
    },

    renderSpline: function (points) {
      var b = this.BOUNDS;
      var areaEl = document.getElementById('chartSplineArea');
      var strokeEl = document.getElementById('chartSplineStroke');
      if (!areaEl || !strokeEl) return;

      var curvePath = points.length === 1 ? 'M ' + points[0].x + ' ' + points[0].y : this.getCatmullRomBezierPath(points);
      strokeEl.setAttribute('d', curvePath);

      var firstPt = points[0];
      var lastPt = points[points.length - 1];
      var areaPath = points.length === 1 ? '' : curvePath + ' L ' + lastPt.x + ' ' + b.yMax + ' L ' + firstPt.x + ' ' + b.yMax + ' Z';
      areaEl.setAttribute('d', areaPath);
    },

    getCatmullRomBezierPath: function (pts) {
      if (pts.length < 2) return '';
      var path = 'M ' + pts[0].x + ' ' + pts[0].y;
      var tension = 0.28;

      for (var i = 0; i < pts.length - 1; i++) {
        var p0 = i > 0 ? pts[i - 1] : pts[i];
        var p1 = pts[i];
        var p2 = pts[i + 1];
        var p3 = i < pts.length - 2 ? pts[i + 2] : p2;

        var cp1x = p1.x + (p2.x - p0.x) * tension;
        var cp1y = Math.min(this.BOUNDS.yMax, Math.max(this.BOUNDS.yMin, p1.y + (p2.y - p0.y) * tension));
        var cp2x = p2.x - (p3.x - p1.x) * tension;
        var cp2y = Math.min(this.BOUNDS.yMax, Math.max(this.BOUNDS.yMin, p2.y - (p3.y - p1.y) * tension));

        path += ' C ' + cp1x.toFixed(1) + ' ' + cp1y.toFixed(1) + ', ' + cp2x.toFixed(1) + ' ' + cp2y.toFixed(1) + ', ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
      }
      return path;
    },

    renderNodes: function (points) {
      var self = this;
      var nodesContainer = document.getElementById('chartNodesGroup');
      if (!nodesContainer) return;

      nodesContainer.innerHTML = '';
      var count = points.length;

      // In dense timeframes (30D/90D), avoid rendering 22 static dots that clutter the spline.
      // Render subtle milestone nodes at key checkpoints; active node ring & pip dynamically highlight any point.
      var milestoneIndices = [];
      if (count <= 7) {
        for (var i = 0; i < count; i++) milestoneIndices.push(i);
      } else if (count <= 14) {
        for (var j = 0; j < count; j += 2) milestoneIndices.push(j);
        if (milestoneIndices[milestoneIndices.length - 1] !== count - 1) milestoneIndices.push(count - 1);
      } else {
        // 30D: show five milestone nodes distributed across the full daily series.
        milestoneIndices = [0, 5, 10, 15, count - 1];
      }

      milestoneIndices.forEach(function (idx) {
        var p = points[idx];
        if (!p) return;
        var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', p.x);
        circle.setAttribute('cy', p.y);
        circle.setAttribute('r', '3.5');
        circle.setAttribute('fill', 'var(--bg-surface-1, #19191B)');
        circle.setAttribute('stroke', 'var(--border-strong, #55555A)');
        circle.setAttribute('stroke-width', '1.5');
        circle.setAttribute('class', 'chart-milestone-node cursor-pointer transition-all duration-150');
        circle.setAttribute('data-index', idx);
        circle.setAttribute('tabindex', '0');
        circle.setAttribute('role', 'button');
        circle.setAttribute('aria-label', p.label + ': Rp ' + (p.daily / 1000000).toFixed(1) + ' jt (Penjualan per periode)');

        circle.addEventListener('click', function () {
          self.selectPoint(idx);
        });
        circle.addEventListener('focus', function () {
          self.selectPoint(idx);
        });

        nodesContainer.appendChild(circle);
      });
    },

    renderXAxis: function (points) {
      var container = document.getElementById('chartXAxisLabels');
      if (!container) return;

      container.innerHTML = '';
      var b = this.BOUNDS;
      var activeIdx = this.activePointIndex;
      var count = points.length;
      if (count === 0) return;

      // Keep the selected range's detail while preventing labels from colliding.
      var displayIndices = [];
      var maxLabels;
      if (this.currentMode === 'ytd' || (this.currentMode !== 'custom' && this.activeTimeframe === '7D')) {
        maxLabels = count;
      } else if (this.currentMode === 'custom') {
        maxLabels = count <= 8 ? count : (count > 15 ? 5 : 4);
      } else if (this.activeTimeframe === '90D') {
        maxLabels = 4;
      } else {
        maxLabels = 5;
      }
      maxLabels = Math.min(count, maxLabels);
      if (maxLabels === 1) {
        displayIndices.push(0);
      } else {
        for (var tick = 0; tick < maxLabels; tick++) {
          displayIndices.push(Math.round(tick * (count - 1) / (maxLabels - 1)));
        }
      }

      var activePoint = (activeIdx != null && activeIdx >= 0 && activeIdx < count) ? points[activeIdx] : null;
      var candidates = displayIndices.slice();
      if (candidates.indexOf(0) < 0) candidates.push(0);
      if (candidates.indexOf(count - 1) < 0) candidates.push(count - 1);
      if (activePoint && candidates.indexOf(activeIdx) < 0) candidates.push(activeIdx);

      var tickFontSize = b.isMobile ? 11 : 12;
      var useCompactDailyTicks = b.isMobile && this.currentMode !== 'custom' && this.currentMode !== 'ytd' && this.activeTimeframe === '7D';
      var useCompactWeeklyTicks = b.isMobile && this.currentMode !== 'custom' && this.currentMode !== 'ytd' && this.activeTimeframe === '90D';
      var prioritizedTicks = candidates.map(function (idx) {
        var point = points[idx];
        var fullLabel = String(point.label || '');
        var label = useCompactDailyTicks
          ? String(point.date || '').slice(8, 10)
          : (useCompactWeeklyTicks ? fullLabel.split('–')[0] : fullLabel);
        var width = Math.max(tickFontSize * (useCompactDailyTicks ? 1.25 : 3), label.length * tickFontSize * 0.58);
        var anchor = b.isMobile && idx === 0 ? 'start' : (b.isMobile && idx === count - 1 ? 'end' : 'middle');
        var left = anchor === 'start' ? point.x : (anchor === 'end' ? point.x - width : point.x - width / 2);
        var priority = idx === activeIdx ? 3 : ((idx === 0 || idx === count - 1) ? 2 : 1);
        return { index: idx, left: left, right: left + width, priority: priority };
      }).sort(function (a, b) {
        return b.priority - a.priority || a.index - b.index;
      });

      var acceptedTicks = [];
      prioritizedTicks.forEach(function (candidate) {
        var tickGap = b.isMobile ? 4 : 8;
        var overlaps = acceptedTicks.some(function (accepted) {
          return candidate.left < accepted.right + tickGap && candidate.right + tickGap > accepted.left;
        });
        if (!overlaps) acceptedTicks.push(candidate);
      });

      var finalIndices = acceptedTicks.map(function (tick) { return tick.index; });
      finalIndices.sort(function (a, b) { return a - b; });

      finalIndices.forEach(function (idx) {
        var p = points[idx];
        if (!p) return;
        var isActive = (idx === activeIdx);

        var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', p.x);
        text.setAttribute('y', b.yMax + (b.isMobile ? 20 : 24));
        text.setAttribute('font-family', "'Plus Jakarta Sans', sans-serif");
        text.setAttribute('font-size', b.isMobile ? '11' : '12');

        if (b.isMobile && idx === 0) {
          text.setAttribute('text-anchor', 'start');
        } else if (b.isMobile && idx === count - 1) {
          text.setAttribute('text-anchor', 'end');
        } else {
          text.setAttribute('text-anchor', 'middle');
        }

        if (isActive) {
          text.setAttribute('fill', 'var(--color-accent, #F28C45)');
          text.setAttribute('font-weight', '700');
        } else {
          text.setAttribute('fill', 'var(--text-muted, #8F8F93)');
          text.setAttribute('font-weight', '400');
        }

        text.textContent = useCompactDailyTicks
          ? p.date.slice(8, 10)
          : (useCompactWeeklyTicks ? String(p.label || '').split('–')[0] : p.label);
        container.appendChild(text);
      });
    },

    selectPoint: function (idx) {
      if (idx < 0 || idx >= this.points.length) return;
      this.activePointIndex = idx;
      this.updateActivePresentation();
      this.renderXAxis(this.points);
    },

    updateActivePresentation: function () {
      if (!this.points || this.points.length === 0) return;
      var idx = this.activePointIndex;
      if (idx === null || idx < 0 || idx >= this.points.length) {
        this.dismissTooltip();
        return;
      }

      var pt = this.points[idx];
      var b = this.BOUNDS;

      var guide = document.getElementById('chartGuideLine');
      if (guide) {
        guide.style.display = '';
        guide.setAttribute('x1', pt.x);
        guide.setAttribute('x2', pt.x);
        guide.setAttribute('y1', pt.y);
        guide.setAttribute('y2', b.yMax);
      }

      var activeRing = document.getElementById('chartActiveNodeRing');
      var activePip = document.getElementById('chartActiveNodePip') || document.getElementById('chartActiveNodeDot');
      if (activeRing) {
        if (this.chartType === 'line') {
          activeRing.style.display = '';
          activeRing.setAttribute('cx', pt.x);
          activeRing.setAttribute('cy', pt.y);
        } else {
          activeRing.style.display = 'none';
        }
      }
      if (activePip) {
        if (this.chartType === 'line') {
          activePip.style.display = '';
          activePip.setAttribute('cx', pt.x);
          activePip.setAttribute('cy', pt.y);
        } else {
          activePip.style.display = 'none';
        }
      }

      if (this.chartType === 'bar') {
        var barsContainer = document.getElementById('chartBarsGroup');
        if (barsContainer) {
          var bars = barsContainer.querySelectorAll('rect');
          bars.forEach(function (rect, bIdx) {
            if (bIdx === idx) {
              rect.setAttribute('fill', 'url(#barGradHighlight)');
              rect.setAttribute('stroke', '#F28C45');
            } else {
              rect.setAttribute('fill', 'url(#barGradDefault)');
              rect.setAttribute('stroke', 'var(--border-default, #39393D)');
            }
          });
        }
      }

      var isBar = (this.chartType === 'bar');
      // Keep the tooltip's primary metric consistent: sales in the selected bucket.
      var tipFormattedVal = 'Rp ' + (pt.daily / 1000000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' jt';
      var tipSubText = 'Kumulatif: Rp ' + (pt.cumulative / 1000000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' jt';

      // 1. Primary Polished HTML Tooltip (with Dynamic Viewport Clamping)
      var tipHtml = document.getElementById('chartTooltip');
      if (tipHtml) {
        tipHtml.classList.remove('hidden');
        tipHtml.style.display = 'block';

        var tipDate = document.getElementById('chartTooltipHtmlDate');
        var tipVal = document.getElementById('chartTooltipHtmlVal');
        var tipSub = document.getElementById('chartTooltipHtmlSub');
        var tipBadge = document.getElementById('chartTooltipTypeBadge');
        var tipValLabel = document.getElementById('chartTooltipValLabel');
        var tipSubLabel = document.getElementById('chartTooltipSubLabel');
        var tipSubVal = document.getElementById('chartTooltipSubVal');

        if (tipDate) tipDate.textContent = pt.label;
        if (tipVal) tipVal.textContent = tipFormattedVal;
        if (tipBadge) {
          var tipBucketType = 'Harian';
          if (this.currentMode === 'ytd') {
            tipBucketType = 'Bulanan';
          } else if (this.activeTimeframe === '90D') {
            tipBucketType = 'Mingguan';
          } else if (this.currentMode === 'custom' && this.customStart && this.customEnd) {
            var customStartMs = new Date(this.customStart + 'T00:00:00Z').getTime();
            var customEndMs = new Date(this.customEnd + 'T00:00:00Z').getTime();
            if (Math.round((customEndMs - customStartMs) / (24 * 3600 * 1000)) > 31) tipBucketType = 'Mingguan';
          }
          tipBadge.textContent = tipBucketType;
        }
        var compactTooltipLabels = ((window.innerWidth || document.documentElement.clientWidth) < 360);
        if (tipValLabel) {
          tipValLabel.textContent = compactTooltipLabels ? 'Jual' : 'Penjualan';
          tipValLabel.setAttribute('aria-label', 'Penjualan');
        }
        if (tipSubLabel) {
          tipSubLabel.textContent = compactTooltipLabels ? 'Kum.' : 'Kumulatif';
          tipSubLabel.setAttribute('aria-label', 'Kumulatif');
        }
        if (tipSubVal) {
          tipSubVal.textContent = 'Rp ' + (pt.cumulative / 1000000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' jt';
        } else if (tipSub) {
          tipSub.textContent = tipSubText;
        }

        tipHtml.classList.add('chart-docked');
        tipHtml.style.left = '0px';
        tipHtml.style.right = '0px';
        tipHtml.style.top = '4px';
        tipHtml.style.width = 'auto';
        tipHtml.style.maxWidth = 'none';
      }

      // 2. Synchronized SVG Tooltip (Fallback & Accessible SVG Parity)
      var tooltipGroup = document.getElementById('chartTooltipGroup');
      if (tooltipGroup) {
        var svgTipW = 196;
        var svgTipH = 50;
        var targetYSvg = isBar ? (pt.daily > 0 ? pt.barY : b.yMax) : pt.y;
        var tipXSvg, tipYSvg;

        if (b.isMobile) {
          var idealX = pt.x - (svgTipW / 2);
          tipXSvg = Math.max(8, Math.min(b.viewBoxWidth - svgTipW - 8, idealX));
          tipYSvg = targetYSvg - svgTipH - 12 >= b.yMin ? targetYSvg - svgTipH - 12 : Math.min(b.yMax - svgTipH - 6, targetYSvg + 16);
        } else {
          tipXSvg = pt.x > (b.viewBoxWidth - 215)
            ? Math.max(b.xMin + 8, pt.x - svgTipW - 14)
            : Math.min(b.xMax - svgTipW - 8, pt.x + 14);
          tipYSvg = Math.max(b.yMin + 8, Math.min(b.yMax - svgTipH - 8, targetYSvg - (svgTipH / 2)));
        }

        tooltipGroup.setAttribute('transform', 'translate(' + tipXSvg + ', ' + tipYSvg + ')');
        var svgTipDate = tooltipGroup.querySelector('#chartTooltipDate');
        var svgTipVal = tooltipGroup.querySelector('#chartTooltipValue');
        var svgTipSub = tooltipGroup.querySelector('#chartTooltipSub');

        if (svgTipDate) svgTipDate.textContent = pt.label + ' ·';
        if (svgTipVal) {
          var dateLen = (pt.label || '').length;
          var valX = dateLen > 7 ? 88 : 78;
          svgTipVal.setAttribute('x', valX);
          svgTipVal.textContent = tipFormattedVal;
        }
        if (svgTipSub) svgTipSub.textContent = tipSubText;
        // Keep SVG tooltip synchronized; display is hidden while HTML tooltip is active to avoid double boxes
        tooltipGroup.style.display = tipHtml ? 'none' : '';
      }

      var liveRegion = document.getElementById('chartLiveRegion');
      if (liveRegion) {
        liveRegion.textContent = pt.label + ', Penjualan: ' + tipFormattedVal + ', Kumulatif: Rp ' + (pt.cumulative / 1000000).toFixed(1) + ' juta';
      }
    },

    handlePointerMove: function (e) {
      if (this._leaveTimeout) {
        clearTimeout(this._leaveTimeout);
        this._leaveTimeout = null;
      }
      if (!this.points || this.points.length === 0) return;
      var svg = document.getElementById('trendChartSvg');
      if (!svg) return;

      var rect = svg.getBoundingClientRect();
      var clientX = e.clientX;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
      } else if (e.changedTouches && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
      }

      if (clientX == null || isNaN(clientX)) return;

      var relX = (clientX - rect.left) * (this.BOUNDS.viewBoxWidth / rect.width);

      var closestIdx = 0;
      var minDistance = Infinity;

      this.points.forEach(function (p, idx) {
        var dist = Math.abs(p.x - relX);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = idx;
        }
      });

      if (closestIdx !== this.activePointIndex) {
        this.selectPoint(closestIdx);
      }
    },

    handlePointerLeave: function () {
      if (!this.BOUNDS.isMobile) {
        var self = this;
        if (this._leaveTimeout) clearTimeout(this._leaveTimeout);
        this._leaveTimeout = setTimeout(function () {
          var container = document.getElementById('chartInteractiveContainer');
          var hasKbFocus = container && (document.activeElement === container || container.contains(document.activeElement));
          if (!hasKbFocus) {
            self.activePointIndex = null;
            self.dismissTooltip();
          }
        }, 100);
      }
    },

    handlePointerClick: function (e) {
      this.handlePointerMove(e);
    },

    handleKeyDown: function (e) {
      if (!this.points || this.points.length === 0) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        var prev = Math.max(0, (this.activePointIndex || 0) - 1);
        this.selectPoint(prev);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        var next = Math.min(this.points.length - 1, (this.activePointIndex || 0) + 1);
        this.selectPoint(next);
      }
    }
  };

  root.FADE_TREND_CHART = FADE_TREND_CHART;
})(typeof window !== 'undefined' ? window : this);
