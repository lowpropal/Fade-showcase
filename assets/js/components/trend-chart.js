/**
 * FADE Pods Showcase v0.2 · Interactive Trend Chart Component
 * High-fidelity interactive spline curve chart with timeframe filtering (7D/30D/90D),
 * dynamic data aggregation, SVG Catmull-Rom spline pathing, milestone nodes,
 * pointer tracking, floating tooltip pill, and keyboard accessibility.
 */
(function (root) {
  'use strict';

  var FADE_TREND_CHART = {
    activeTimeframe: '30D',
    activePointIndex: null,
    points: [],
    invoices: [],
    currentSalesFilter: 'all',
    currentMode: 'bulan',

    // ViewBox Coordinate Constants (matches Master Design 640x210)
    BOUNDS: {
      viewBoxWidth: 640,
      viewBoxHeight: 210,
      xMin: 55,
      xMax: 585,
      yMin: 28,
      yMax: 175
    },

    init: function () {
      this.bindControls();
    },

    bindControls: function () {
      var self = this;
      var btn7D = document.getElementById('chartBtn7D');
      var btn30D = document.getElementById('chartBtn30D');
      var btn90D = document.getElementById('chartBtn90D');

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

    setTimeframe: function (tf) {
      if (this.activeTimeframe === tf) return;
      this.activeTimeframe = tf;
      this.activePointIndex = null;
      this.updateButtonStyles();
      this.render();
    },

    updateButtonStyles: function () {
      var tf = this.activeTimeframe;
      var btn7D = document.getElementById('chartBtn7D');
      var btn30D = document.getElementById('chartBtn30D');
      var btn90D = document.getElementById('chartBtn90D');

      var activeClass = 'px-2.5 py-1 rounded-md bg-surface-1 text-text-primary font-semibold border border-border-default shadow-sm transition-colors cursor-pointer';
      var inactiveClass = 'px-2.5 py-1 rounded-md text-text-muted hover:text-text-primary transition-colors cursor-pointer';

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

    setData: function (invoices, salesFilter, mode) {
      this.invoices = invoices || [];
      this.currentSalesFilter = salesFilter || 'all';
      this.currentMode = mode || 'bulan';
      this.render();
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

      var milestones = [];
      if (this.activeTimeframe === '7D') {
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
        // 30D (Default Month Milestone View)
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

      return milestones.map(function (m) {
        var cumulative = 0;
        var daily = 0;
        filtered.forEach(function (inv) {
          var d = inv.date || inv.invoice_date;
          var rev = Number(inv.invoiceTotal || inv.invoice_total_idr || 0);
          if (d <= m.date && d >= startDate) {
            cumulative += rev;
          }
          if (d === m.date) {
            daily += rev;
          }
        });

        return {
          date: m.date,
          label: m.label,
          cumulative: cumulative,
          daily: daily
        };
      });
    },

    render: function () {
      var rawPoints = this.aggregatePoints();
      if (!rawPoints || rawPoints.length < 2) return;

      var b = this.BOUNDS;
      var totalPoints = rawPoints.length;

      // Find max cumulative value for Y scaling
      var maxVal = 1;
      rawPoints.forEach(function (p) {
        if (p.cumulative > maxVal) maxVal = p.cumulative;
      });

      // Scale ceiling to next clean multiple of 20M or 10M
      var maxMillions = Math.ceil(maxVal / 1000000);
      var scaleCeilingMillions = Math.max(20, Math.ceil(maxMillions / 20) * 20);
      var scaleCeiling = scaleCeilingMillions * 1000000;

      // Map raw points to SVG (x, y) coordinates
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

      // Default active point: index 4 for 30D (19 Nov) or the last point
      if (this.activePointIndex === null || this.activePointIndex >= totalPoints) {
        this.activePointIndex = (this.activeTimeframe === '30D' && totalPoints >= 5) ? 4 : (totalPoints - 1);
      }

      // Update Card Header Metrics
      var lastPoint = plottedPoints[plottedPoints.length - 1];
      var totalRev = lastPoint.cumulative;
      var revEl = document.getElementById('chartMonthlyRevenue');
      if (revEl) {
        var revJt = (totalRev / 1000000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' jt';
        revEl.textContent = 'Rp ' + revJt;
      }

      var periodEl = document.getElementById('chartPeriodLabel');
      if (periodEl) {
        if (this.activeTimeframe === '7D') {
          periodEl.textContent = '16 – 22 Nov 2026 (7 Hari)';
        } else if (this.activeTimeframe === '90D') {
          periodEl.textContent = '01 Sep – 22 Nov 2026 (90 Hari)';
        } else {
          periodEl.textContent = '01 – 22 Nov 2026';
        }
      }

      this.renderGrid(scaleCeilingMillions);
      this.renderSpline(plottedPoints);
      this.renderNodes(plottedPoints);
      this.renderXAxis(plottedPoints);
      this.updateActivePresentation();
    },

    renderGrid: function (maxMillions) {
      var b = this.BOUNDS;
      var gridContainer = document.getElementById('chartGridLines');
      var labelsContainer = document.getElementById('chartYAxisLabels');
      if (!gridContainer || !labelsContainer) return;

      var step = maxMillions / 4;
      var lines = [
        { y: b.yMin, label: maxMillions + 'jt' },
        { y: b.yMin + (b.yMax - b.yMin) * 0.25, label: (step * 3) + 'jt' },
        { y: b.yMin + (b.yMax - b.yMin) * 0.50, label: (step * 2) + 'jt' },
        { y: b.yMin + (b.yMax - b.yMin) * 0.75, label: step + 'jt' },
        { y: b.yMax, label: '0' }
      ];

      var gridHtml = '';
      var labelsHtml = '';

      lines.forEach(function (l, idx) {
        var y = Math.round(l.y);
        var isBase = idx === lines.length - 1;
        if (isBase) {
          gridHtml += '<line stroke="var(--border-default, #39393D)" stroke-width="1" x1="' + (b.xMin - 9) + '" x2="' + (b.xMax + 40) + '" y1="' + y + '" y2="' + y + '"></line>';
        } else {
          gridHtml += '<line stroke="var(--border-subtle, #2B2B2E)" stroke-dasharray="3 3" stroke-width="1" x1="' + (b.xMin - 9) + '" x2="' + (b.xMax + 40) + '" y1="' + y + '" y2="' + y + '"></line>';
        }

        labelsHtml += '<text fill="var(--text-muted, #8F8F93)" font-family="\'Plus Jakarta Sans\', sans-serif" font-size="11" text-anchor="end" x="' + (b.xMin - 17) + '" y="' + (y + 4) + '">' + l.label + '</text>';
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
      var tension = 0.32;

      for (var i = 0; i < pts.length - 1; i++) {
        var p0 = i > 0 ? pts[i - 1] : pts[i];
        var p1 = pts[i];
        var p2 = pts[i + 1];
        var p3 = i < pts.length - 2 ? pts[i + 2] : p2;

        var cp1x = p1.x + (p2.x - p0.x) * tension;
        var cp1y = p1.y + (p2.y - p0.y) * tension;
        var cp2x = p2.x - (p3.x - p1.x) * tension;
        var cp2y = p2.y - (p3.y - p1.y) * tension;

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
        circle.setAttribute('r', '3.5');
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
        text.setAttribute('y', '196');
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

      // Update Vertical Guide Line
      var guide = document.getElementById('chartGuideLine');
      if (guide) {
        guide.setAttribute('x1', pt.x);
        guide.setAttribute('x2', pt.x);
        guide.setAttribute('y1', pt.y);
        guide.setAttribute('y2', b.yMax);
      }

      // Update Active Node Elements
      var activeRing = document.getElementById('chartActiveNodeRing');
      var activePip = document.getElementById('chartActiveNodePip');
      if (activeRing && activePip) {
        activeRing.setAttribute('cx', pt.x);
        activeRing.setAttribute('cy', pt.y);
        activePip.setAttribute('cx', pt.x);
        activePip.setAttribute('cy', pt.y);
      }

      // Update Floating Tooltip Pill Position & Content
      var tooltipGroup = document.getElementById('chartTooltipGroup');
      if (tooltipGroup) {
        var tipWidth = 132;
        var tipX = pt.x > 340 ? (pt.x - tipWidth - 10) : (pt.x + 12);
        var tipY = Math.max(6, Math.min(136, pt.y - 20));

        tooltipGroup.setAttribute('transform', 'translate(' + tipX + ', ' + tipY + ')');

        var tipDate = document.getElementById('chartTooltipDate');
        var tipVal = document.getElementById('chartTooltipValue');
        var tipSub = document.getElementById('chartTooltipSub');

        if (tipDate) tipDate.textContent = pt.label + ' ·';
        if (tipVal) tipVal.textContent = 'Rp ' + (pt.cumulative / 1000000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' jt';

        if (tipSub) {
          if (pt.daily > 0) {
            tipSub.textContent = '+' + (pt.daily / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt transaksi';
          } else {
            tipSub.textContent = 'Stabil (' + pt.label + ')';
          }
        }
      }

      // Live region announcement for screen readers
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

      // Find closest point by x coordinate
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
      // Retain the current point without disruption
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
