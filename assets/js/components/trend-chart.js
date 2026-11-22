/**
 * FADE Pods Showcase v0.2 · Interactive Trend Chart Component
 * High-fidelity interactive spline curve chart supporting Bulanan (7D/30D/90D),
 * YTD (monthly aggregation), and Custom Date Ranges with SVG Catmull-Rom spline pathing.
 */
(function (root) {
  'use strict';

  var FADE_TREND_CHART = {
    chartType: 'line', // 'line' | 'bar'
    activeTimeframe: '30D',
    activePointIndex: null,
    points: [],
    invoices: [],
    currentSalesFilter: 'all',
    currentMode: 'bulan',
    customStart: null,
    customEnd: null,

    BOUNDS: {
      viewBoxWidth: 640,
      viewBoxHeight: 220,
      xMin: 58,
      xMax: 585,
      yMin: 26,
      yMax: 182
    },

    init: function () {
      this.bindControls();
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
        overlay.addEventListener('pointerleave', function () {
          self.handlePointerLeave();
        });
        overlay.addEventListener('click', function (e) {
          self.handlePointerClick(e);
        });
      }

      var container = document.getElementById('chartInteractiveContainer');
      if (container) {
        container.addEventListener('keydown', function (e) {
          self.handleKeyDown(e);
        });
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

      var activeClass = 'px-2.5 py-1 rounded-md bg-surface-1 text-text-primary font-semibold border border-border-default shadow-sm transition-colors cursor-pointer';
      var inactiveClass = 'px-2.5 py-1 rounded-md text-text-muted hover:text-text-primary transition-colors cursor-pointer';

      var activeTypeClass = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-caption font-label bg-surface-1 text-accent font-semibold border border-border-default shadow-sm transition-colors cursor-pointer';
      var inactiveTypeClass = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-caption font-label text-text-muted hover:text-text-primary transition-colors cursor-pointer';

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

    formatShortDate: function (iso) {
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      var parts = iso.split('-');
      if (parts.length !== 3) return iso;
      var mIdx = parseInt(parts[1], 10) - 1;
      return parts[2] + ' ' + (months[mIdx] || parts[1]);
    },

    buildCustomMilestones: function (startIso, endIso) {
      var startMs = new Date(startIso + 'T00:00:00').getTime();
      var endMs = new Date(endIso + 'T00:00:00').getTime();
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

    aggregatePoints: function () {
      var self = this;
      var filtered = this.invoices.filter(function (inv) {
        if (self.currentSalesFilter !== 'all') {
          var s = inv.salesName || inv.sales_name;
          if (s !== self.currentSalesFilter) return false;
        }
        return true;
      });

      if (this.currentMode === 'ytd') {
        var months = [
          { ym: '2026-06', label: 'Jun' },
          { ym: '2026-07', label: 'Jul' },
          { ym: '2026-08', label: 'Agu' },
          { ym: '2026-09', label: 'Sep' },
          { ym: '2026-10', label: 'Okt' },
          { ym: '2026-11', label: 'Nov' }
        ];
        var runningCum = 0;
        return months.map(function (m) {
          var monthRev = 0;
          filtered.forEach(function (inv) {
            var d = inv.date || inv.invoice_date || '';
            if (d.slice(0, 7) === m.ym) {
              monthRev += Number(inv.invoiceTotal || inv.invoice_total_idr || 0);
            }
          });
          runningCum += monthRev;
          return {
            date: m.ym + '-28',
            label: m.label,
            cumulative: runningCum,
            daily: monthRev
          };
        });
      }

      var milestones = [];
      if (this.currentMode === 'custom' && this.customStart && this.customEnd) {
        milestones = this.buildCustomMilestones(this.customStart, this.customEnd);
      } else if (this.activeTimeframe === '7D') {
        milestones = [
          { date: '2026-11-16', label: '16 Nov' },
          { date: '2026-11-17', label: '17 Nov' },
          { date: '2026-11-18', label: '18 Nov' },
          { date: '2026-11-19', label: '19 Nov' },
          { date: '2026-11-20', label: '20 Nov' },
          { date: '2026-11-21', label: '21 Nov' },
          { date: '2026-11-22', label: '22 Nov' }
        ];
      } else if (this.activeTimeframe === '90D') {
        milestones = [
          { date: '2026-09-01', label: '01 Sep' },
          { date: '2026-09-15', label: '15 Sep' },
          { date: '2026-10-01', label: '01 Okt' },
          { date: '2026-10-15', label: '15 Okt' },
          { date: '2026-11-01', label: '01 Nov' },
          { date: '2026-11-15', label: '15 Nov' },
          { date: '2026-11-22', label: '22 Nov' }
        ];
      } else {
        milestones = [
          { date: '2026-11-01', label: '01 Nov' },
          { date: '2026-11-05', label: '05 Nov' },
          { date: '2026-11-10', label: '10 Nov' },
          { date: '2026-11-15', label: '15 Nov' },
          { date: '2026-11-19', label: '19 Nov' },
          { date: '2026-11-22', label: '22 Nov' }
        ];
      }

      var startDate = milestones[0].date;

      return milestones.map(function (m, idx) {
        var cumulative = 0;
        var periodDelta = 0;
        var prevDate = idx > 0 ? milestones[idx - 1].date : null;
        filtered.forEach(function (inv) {
          var d = inv.date || inv.invoice_date;
          var rev = Number(inv.invoiceTotal || inv.invoice_total_idr || 0);
          if (d <= m.date && d >= startDate) {
            cumulative += rev;
          }
          if (idx === 0 ? d === m.date : (d > prevDate && d <= m.date)) {
            periodDelta += rev;
          }
        });

        return {
          date: m.date,
          label: m.label,
          cumulative: cumulative,
          daily: periodDelta
        };
      });
    },

    render: function () {
      var rawPoints = this.aggregatePoints();
      if (!rawPoints || rawPoints.length < 2) return;

      var b = this.BOUNDS;
      var totalPoints = rawPoints.length;

      var maxVal = 1;
      rawPoints.forEach(function (p) {
        if (p.cumulative > maxVal) maxVal = p.cumulative;
      });

      var maxMillions = Math.max(10, Math.ceil(maxVal / 1000000));
      // Pick clean step multiple (multiples of 20jt for <=200jt, or 50jt/100jt for YTD)
      var stepUnit = maxMillions > 250 ? 100 : (maxMillions > 100 ? 40 : 20);
      var scaleCeilingMillions = Math.max(stepUnit, Math.ceil(maxMillions / stepUnit) * stepUnit);
      var scaleCeiling = scaleCeilingMillions * 1000000;

      var plottedPoints = rawPoints.map(function (p, idx) {
        var x = b.xMin + (idx / (totalPoints - 1)) * (b.xMax - b.xMin);
        var norm = Math.min(1, Math.max(0, p.cumulative / scaleCeiling));
        var y = b.yMax - norm * (b.yMax - b.yMin);
        return {
          date: p.date,
          label: p.label,
          cumulative: p.cumulative,
          daily: p.daily,
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10
        };
      });

      this.points = plottedPoints;

      if (this.activePointIndex === null || this.activePointIndex >= totalPoints) {
        this.activePointIndex = totalPoints - 1;
      }

      var lastPoint = plottedPoints[plottedPoints.length - 1];
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
        else titleEl.textContent = 'Tren Penjualan Bulanan';
      }

      var periodEl = document.getElementById('chartPeriodLabel');
      if (periodEl) {
        if (this.currentMode === 'ytd') {
          periodEl.textContent = 'Jun – Nov 2026 (YTD)';
        } else if (this.currentMode === 'custom' && this.customStart && this.customEnd) {
          periodEl.textContent = this.formatShortDate(this.customStart) + ' – ' + this.formatShortDate(this.customEnd);
        } else if (this.activeTimeframe === '7D') {
          periodEl.textContent = '16 – 22 Nov 2026 (7 Hari)';
        } else if (this.activeTimeframe === '90D') {
          periodEl.textContent = '01 Sep – 22 Nov 2026 (90 Hari)';
        } else {
          periodEl.textContent = '01 – 22 Nov 2026';
        }
      }

      this.renderGrid(scaleCeilingMillions);
      if (this.chartType === 'line') {
        this.renderSpline(plottedPoints);
        this.renderNodes(plottedPoints);
        var barsContainer = document.getElementById('chartBarsGroup');
        if (barsContainer) barsContainer.innerHTML = '';
        var activeRing = document.getElementById('chartActiveNodeRing');
        var activePip = document.getElementById('chartActiveNodePip');
        if (activeRing) activeRing.style.display = '';
        if (activePip) activePip.style.display = '';
      } else {
        var areaEl = document.getElementById('chartSplineArea');
        var strokeEl = document.getElementById('chartSplineStroke');
        var nodesContainer = document.getElementById('chartNodesGroup');
        if (areaEl) areaEl.setAttribute('d', '');
        if (strokeEl) strokeEl.setAttribute('d', '');
        if (nodesContainer) nodesContainer.innerHTML = '';
        var activeRing = document.getElementById('chartActiveNodeRing');
        var activePip = document.getElementById('chartActiveNodePip');
        if (activeRing) activeRing.style.display = 'none';
        if (activePip) activePip.style.display = 'none';
        this.renderBars(plottedPoints);
      }
      this.renderXAxis(plottedPoints);
      this.updateActivePresentation();
    },

    renderBars: function (points) {
      var self = this;
      var barsContainer = document.getElementById('chartBarsGroup');
      if (!barsContainer) return;
      barsContainer.innerHTML = '';

      var count = points.length;
      var availableWidth = (self.BOUNDS.xMax - self.BOUNDS.xMin);
      var barW = Math.max(12, Math.min(32, Math.round((availableWidth / count) * 0.55)));
      var activeIdx = self.activePointIndex;
      if (activeIdx === null || activeIdx < 0 || activeIdx >= points.length) {
        activeIdx = points.length - 1;
      }

      points.forEach(function (p, idx) {
        var barH = Math.max(6, self.BOUNDS.yMax - p.y);
        var barX = Math.round(p.x - (barW / 2));
        var barY = Math.round(p.y);
        var isHighlight = (idx === activeIdx);

        var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', barX);
        rect.setAttribute('y', barY);
        rect.setAttribute('width', barW);
        rect.setAttribute('height', barH);
        rect.setAttribute('rx', '4');
        rect.setAttribute('fill', isHighlight ? 'url(#barGradHighlight)' : 'url(#barGradDefault)');
        rect.setAttribute('stroke', isHighlight ? '#F28C45' : 'var(--border-default, #39393D)');
        rect.setAttribute('stroke-width', '1');
        rect.setAttribute('class', 'chart-bar cursor-pointer transition-all duration-150');
        rect.setAttribute('data-index', idx);
        rect.setAttribute('tabindex', '0');
        rect.setAttribute('role', 'button');
        rect.setAttribute('aria-label', p.label + ': Rp ' + (p.cumulative / 1000000).toFixed(1) + ' jt');

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
      var lines = [
        { y: b.yMin, label: Math.round(maxMillions) + 'jt' },
        { y: b.yMin + (b.yMax - b.yMin) * 0.25, label: Math.round(step * 3) + 'jt' },
        { y: b.yMin + (b.yMax - b.yMin) * 0.50, label: Math.round(step * 2) + 'jt' },
        { y: b.yMin + (b.yMax - b.yMin) * 0.75, label: Math.round(step) + 'jt' },
        { y: b.yMax, label: '0' }
      ];

      var gridHtml = '';
      var labelsHtml = '';

      lines.forEach(function (l, idx) {
        var y = Math.round(l.y);
        var isBase = idx === lines.length - 1;
        if (isBase) {
          gridHtml += '<line stroke="var(--border-default, #39393D)" stroke-width="1" x1="' + (b.xMin - 8) + '" x2="' + (b.xMax + 24) + '" y1="' + y + '" y2="' + y + '"></line>';
        } else {
          gridHtml += '<line stroke="var(--border-subtle, #2B2B2E)" stroke-dasharray="3 3" stroke-width="1" x1="' + (b.xMin - 8) + '" x2="' + (b.xMax + 24) + '" y1="' + y + '" y2="' + y + '"></line>';
        }

        labelsHtml += '<text fill="var(--text-muted, #8F8F93)" font-family="\'Plus Jakarta Sans\', sans-serif" font-size="11" text-anchor="end" x="' + (b.xMin - 16) + '" y="' + (y + 4) + '">' + l.label + '</text>';
      });

      gridContainer.innerHTML = gridHtml;
      labelsContainer.innerHTML = labelsHtml;
    },

    renderSpline: function (points) {
      var b = this.BOUNDS;
      var areaEl = document.getElementById('chartSplineArea');
      var strokeEl = document.getElementById('chartSplineStroke');
      if (!areaEl || !strokeEl) return;

      var curvePath = this.getCatmullRomBezierPath(points);
      strokeEl.setAttribute('d', curvePath);

      var firstPt = points[0];
      var lastPt = points[points.length - 1];
      var areaPath = curvePath + ' L ' + lastPt.x + ' ' + b.yMax + ' L ' + firstPt.x + ' ' + b.yMax + ' Z';
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
      points.forEach(function (p, idx) {
        var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', p.x);
        circle.setAttribute('cy', p.y);
        circle.setAttribute('r', '4');
        circle.setAttribute('fill', 'var(--bg-surface-1, #19191B)');
        circle.setAttribute('stroke', 'var(--border-strong, #55555A)');
        circle.setAttribute('stroke-width', '1.5');
        circle.setAttribute('class', 'chart-milestone-node cursor-pointer transition-all duration-150');
        circle.setAttribute('data-index', idx);
        circle.setAttribute('tabindex', '0');
        circle.setAttribute('role', 'button');
        circle.setAttribute('aria-label', p.label + ': Rp ' + (p.cumulative / 1000000).toFixed(1) + ' jt');

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
      var activeIdx = this.activePointIndex;

      points.forEach(function (p, idx) {
        var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', p.x);
        text.setAttribute('y', '204');
        text.setAttribute('font-family', "'Plus Jakarta Sans', sans-serif");
        text.setAttribute('font-size', '11');
        text.setAttribute('text-anchor', 'middle');

        var isActive = idx === activeIdx;
        if (isActive) {
          text.setAttribute('fill', 'var(--color-accent, #F28C45)');
          text.setAttribute('font-weight', '700');
        } else {
          text.setAttribute('fill', 'var(--text-muted, #8F8F93)');
          text.setAttribute('font-weight', '400');
        }

        text.textContent = p.label;
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
        idx = this.points.length - 1;
      }

      var pt = this.points[idx];
      var b = this.BOUNDS;

      var guide = document.getElementById('chartGuideLine');
      if (guide) {
        guide.setAttribute('x1', pt.x);
        guide.setAttribute('x2', pt.x);
        guide.setAttribute('y1', pt.y);
        guide.setAttribute('y2', b.yMax);
      }

      var activeRing = document.getElementById('chartActiveNodeRing');
      var activePip = document.getElementById('chartActiveNodePip');
      if (activeRing && activePip) {
        if (this.chartType === 'line') {
          activeRing.style.display = '';
          activePip.style.display = '';
          activeRing.setAttribute('cx', pt.x);
          activeRing.setAttribute('cy', pt.y);
          activePip.setAttribute('cx', pt.x);
          activePip.setAttribute('cy', pt.y);
        } else {
          activeRing.style.display = 'none';
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

      var tooltipGroup = document.getElementById('chartTooltipGroup');
      if (tooltipGroup) {
        var tipWidth = 148;
        var tipX = pt.x > 380 ? (pt.x - tipWidth - 12) : (pt.x + 12);
        var tipY = Math.max(4, Math.min(136, pt.y - 22));

        tooltipGroup.setAttribute('transform', 'translate(' + tipX + ', ' + tipY + ')');

        var tipDate = document.getElementById('chartTooltipDate');
        var tipVal = document.getElementById('chartTooltipValue');
        var tipSub = document.getElementById('chartTooltipSub');

        if (tipDate) tipDate.textContent = pt.label + ' ·';
        if (tipVal) tipVal.textContent = 'Rp ' + (pt.cumulative / 1000000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' jt';

        if (tipSub) {
          if (pt.daily > 0) {
            tipSub.textContent = '+' + (pt.daily / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt periode ini';
          } else {
            tipSub.textContent = 'Stabil (' + pt.label + ')';
          }
        }
      }

      var liveRegion = document.getElementById('chartLiveRegion');
      if (liveRegion) {
        liveRegion.textContent = pt.label + ', Kumulatif: Rp ' + (pt.cumulative / 1000000).toFixed(1) + ' juta';
      }
    },

    handlePointerMove: function (e) {
      if (!this.points || this.points.length === 0) return;
      var svg = document.getElementById('trendChartSvg');
      if (!svg) return;

      var rect = svg.getBoundingClientRect();
      var clientX = e.clientX;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
      }

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

    handlePointerLeave: function () {},

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
