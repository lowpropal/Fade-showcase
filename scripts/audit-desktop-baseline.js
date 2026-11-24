/**
 * FADE Pods Showcase v0.2 — Desktop Dashboard Baseline Audit & Capture
 * Measures chart geometry, axis margins, bar/line bounds, tooltip positioning,
 * toolbar layout, and table spacing across 1024, 1280, 1440, and 1920 px.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9855;
const HTTP_PORT = 8110;
const BASE_DIR = path.resolve(__dirname, '..');
const BASELINE_SS_DIR = path.join(BASE_DIR, 'docs', 'screenshots', 'desktop_baseline');
const ARTIFACT_DIR = '/Users/naufalausan/.gemini/antigravity/brain/183799d6-e9a7-4bd2-844f-c68a81bc86e6';

if (!fs.existsSync(BASELINE_SS_DIR)) {
  fs.mkdirSync(BASELINE_SS_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendCommand(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`CDP Command timeout (${method})`));
    }, 15000);
    const handler = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.id === id) {
        clearTimeout(timer);
        ws.removeEventListener('message', handler);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function startHttpServer() {
  const server = http.createServer((req, res) => {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.join(BASE_DIR, reqPath);
    if (!filePath.startsWith(BASE_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found: ' + reqPath);
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      fs.createReadStream(filePath).pipe(res);
    });
  });

  return new Promise(resolve => {
    server.listen(HTTP_PORT, '127.0.0.1', () => {
      console.log(`[HTTP] Test server listening on http://127.0.0.1:${HTTP_PORT}`);
      resolve(server);
    });
  });
}

async function main() {
  const httpServer = await startHttpServer();
  const tmpDir = '/tmp/chrome-baseline-desktop-' + Date.now();
  console.log('[CDP] Launching Chrome headless...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + tmpDir,
    '--no-first-run',
    '--no-default-browser-check'
  ], { stdio: 'ignore' });

  for (let i = 0; i < 40; i++) {
    await sleep(350);
    try {
      const v = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
      if (v.webSocketDebuggerUrl) {
        console.log('[CDP] Chrome ready');
        break;
      }
    } catch (e) {}
  }

  const auditReport = {
    viewports: {},
    chartAudit: {},
    toolbarAudit: {},
    tableAudit: {}
  };

  const adminSession = { role: 'admin', username: 'admin', name: 'Raka Pratama', title: 'Head of Operations' };
  const salesSession = { role: 'sales', username: 'aru', name: 'Aru', title: 'Sales Representative', salesName: 'Aru', salesId: 'SLS-ARU', region: 'Operasional Sales' };

  async function openPage(role, sessionData, theme, width, height, sidebarCollapsed = false) {
    const pageUrl = role === 'admin'
      ? `http://127.0.0.1:${HTTP_PORT}/admin.html?demo=1&role=admin#dashboard`
      : `http://127.0.0.1:${HTTP_PORT}/sales.html?demo=1&role=sales&sales=aru#dashboard`;

    const targetRes = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' })).json();
    const ws = new globalThis.WebSocket(targetRes.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    await sendCommand(ws, 'Page.enable');
    await sendCommand(ws, 'Runtime.enable');
    await sendCommand(ws, 'DOM.enable');
    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

    // Navigate once to set localStorage
    await sendCommand(ws, 'Page.navigate', { url: pageUrl });
    await sleep(400);

    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `
        localStorage.setItem('fade_showcase_session_v021', JSON.stringify(${JSON.stringify(sessionData)}));
        localStorage.setItem('fade_showcase_theme_v02', '${theme}');
        localStorage.setItem('fade_sidebar_state', '${sidebarCollapsed ? 'collapsed' : 'expanded'}');
      `
    });

    await sendCommand(ws, 'Page.navigate', { url: pageUrl });
    await sleep(700);

    // Ensure theme and sidebar state applied
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `
        if (window.FADE_STORE) window.FADE_STORE.setTheme('${theme}');
        var sidebar = document.getElementById('desktopSidebar');
        var mainContent = document.getElementById('mainContentArea');
        if (sidebar && mainContent) {
          if (${sidebarCollapsed}) {
            sidebar.classList.add('w-[66px]');
            sidebar.classList.remove('w-[240px]');
            mainContent.classList.add('md:ml-[66px]');
            mainContent.classList.remove('md:ml-[240px]');
          } else {
            sidebar.classList.add('w-[240px]');
            sidebar.classList.remove('w-[66px]');
            mainContent.classList.add('md:ml-[240px]');
            mainContent.classList.remove('md:ml-[66px]');
          }
        }
        if (window.FADE_TREND_CHART) window.FADE_TREND_CHART.resize();
      `
    });
    await sleep(400);
    return ws;
  }

  async function takeScreenshot(ws, filename) {
    await sendCommand(ws, 'Runtime.evaluate', { expression: `document.fonts.ready` });
    await sleep(200);
    const shot = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
    const localPath = path.join(BASELINE_SS_DIR, filename);
    const artifactPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(localPath, Buffer.from(shot.data, 'base64'));
    try { fs.writeFileSync(artifactPath, Buffer.from(shot.data, 'base64')); } catch (e) {}
    console.log(`[SCREENSHOT] Saved: ${filename}`);
  }

  // =========================================================================
  // 1. CAPTURE BASELINE SCREENSHOTS (1024, 1280, 1440, 1920)
  // =========================================================================
  console.log('\n--- 1. Taking Baseline Desktop Screenshots ---');
  const viewports = [
    { w: 1024, h: 768, name: '1024' },
    { w: 1280, h: 800, name: '1280' },
    { w: 1440, h: 900, name: '1440' },
    { w: 1920, h: 1080, name: '1920' }
  ];

  for (const vp of viewports) {
    // Admin Dark (expanded)
    let ws = await openPage('admin', adminSession, 'dark', vp.w, vp.h, false);
    await takeScreenshot(ws, `baseline_admin_dark_${vp.name}_expanded.png`);
    ws.close();

    // Admin Light (expanded)
    ws = await openPage('admin', adminSession, 'light', vp.w, vp.h, false);
    await takeScreenshot(ws, `baseline_admin_light_${vp.name}_expanded.png`);
    ws.close();

    // Admin Dark (collapsed)
    ws = await openPage('admin', adminSession, 'dark', vp.w, vp.h, true);
    await takeScreenshot(ws, `baseline_admin_dark_${vp.name}_collapsed.png`);
    ws.close();

    // Sales Dark (expanded)
    ws = await openPage('sales', salesSession, 'dark', vp.w, vp.h, false);
    await takeScreenshot(ws, `baseline_sales_dark_${vp.name}_expanded.png`);
    ws.close();
  }

  // =========================================================================
  // 2. AUDIT CHART GEOMETRY, AXIS, TICKS, BARS, LINE & TOOLTIP
  // =========================================================================
  console.log('\n--- 2. Auditing Chart Geometry (Line & Bar on 7D, 30D, 90D) ---');
  {
    const ws = await openPage('admin', adminSession, 'dark', 1280, 800, false);

    const timeframes = ['7D', '30D', '90D'];
    const types = ['line', 'bar'];

    for (const tf of timeframes) {
      for (const ct of types) {
        const auditKey = `${ct}_${tf}`;
        const data = await sendCommand(ws, 'Runtime.evaluate', {
          returnByValue: true,
          expression: `
            (function() {
              window.FADE_TREND_CHART.setChartType('${ct}');
              window.FADE_TREND_CHART.setTimeframe('${tf}');
              var b = window.FADE_TREND_CHART.BOUNDS;
              var svg = document.getElementById('trendChartSvg');
              var svgRect = svg ? svg.getBoundingClientRect() : null;
              var container = document.getElementById('chartInteractiveContainer');
              var containerRect = container ? container.getBoundingClientRect() : null;
              var points = window.FADE_TREND_CHART.points || [];

              // Y-axis space
              var yLabelsGroup = document.getElementById('chartYAxisLabels');
              var yLabels = yLabelsGroup ? Array.from(yLabelsGroup.querySelectorAll('text')).map(t => ({
                text: t.textContent,
                x: parseFloat(t.getAttribute('x')),
                y: parseFloat(t.getAttribute('y'))
              })) : [];

              // X-axis ticks
              var xLabelsGroup = document.getElementById('chartXAxisLabels');
              var xLabels = xLabelsGroup ? Array.from(xLabelsGroup.querySelectorAll('text')).map(t => ({
                text: t.textContent,
                x: parseFloat(t.getAttribute('x')),
                y: parseFloat(t.getAttribute('y'))
              })) : [];

              // First and last bar bounds (if bar)
              var barBounds = null;
              if ('${ct}' === 'bar') {
                var barsGroup = document.getElementById('chartBarsGroup');
                var rects = barsGroup ? Array.from(barsGroup.querySelectorAll('rect')) : [];
                if (rects.length > 0) {
                  var firstRect = rects[0];
                  var lastRect = rects[rects.length - 1];
                  barBounds = {
                    count: rects.length,
                    firstBar: {
                      x: parseFloat(firstRect.getAttribute('x')),
                      width: parseFloat(firstRect.getAttribute('width')),
                      leftEdge: parseFloat(firstRect.getAttribute('x')),
                      rightEdge: parseFloat(firstRect.getAttribute('x')) + parseFloat(firstRect.getAttribute('width')),
                      plotXMin: b.xMin,
                      isLeftClippedOrOverlapY: parseFloat(firstRect.getAttribute('x')) < b.xMin
                    },
                    lastBar: {
                      x: parseFloat(lastRect.getAttribute('x')),
                      width: parseFloat(lastRect.getAttribute('width')),
                      leftEdge: parseFloat(lastRect.getAttribute('x')),
                      rightEdge: parseFloat(lastRect.getAttribute('x')) + parseFloat(lastRect.getAttribute('width')),
                      plotXMax: b.xMax,
                      isRightClipped: (parseFloat(lastRect.getAttribute('x')) + parseFloat(lastRect.getAttribute('width'))) > b.xMax
                    }
                  };
                }
              }

              // Nodes count in Line mode
              var nodesGroup = document.getElementById('chartNodesGroup');
              var nodeCircles = nodesGroup ? nodesGroup.querySelectorAll('circle').length : 0;

              // Tooltip test on point 0, mid, and last
              function getTooltipInfoAt(idx) {
                window.FADE_TREND_CHART.selectPoint(idx);
                var ttGroup = document.getElementById('chartTooltipGroup');
                var ttTransform = ttGroup ? ttGroup.getAttribute('transform') : '';
                var match = /translate\\(([^,]+),\\s*([^)]+)\\)/.exec(ttTransform);
                var tx = match ? parseFloat(match[1]) : 0;
                var ty = match ? parseFloat(match[2]) : 0;
                var pt = points[idx];
                var ttDate = ttGroup ? ttGroup.querySelector('#chartTooltipDate').textContent : '';
                var ttVal = ttGroup ? ttGroup.querySelector('#chartTooltipValue').textContent : '';
                var ttValX = ttGroup ? parseFloat(ttGroup.querySelector('#chartTooltipValue').getAttribute('x')) : 0;
                return {
                  pointIndex: idx,
                  pointX: pt ? pt.x : 0,
                  pointY: pt ? pt.y : 0,
                  tooltipX: tx,
                  tooltipY: ty,
                  tooltipWidth: 196,
                  tooltipHeight: 50,
                  isCoveringNode: (Math.abs(tx + 98 - (pt ? pt.x : 0)) < 70 && Math.abs(ty + 25 - (pt ? pt.y : 0)) < 30),
                  exceedsPlotRight: (tx + 196) > b.viewBoxWidth,
                  exceedsPlotLeft: tx < 0,
                  textDate: ttDate,
                  textValue: ttVal,
                  textValXCoord: ttValX
                };
              }

              var tooltips = {
                first: getTooltipInfoAt(0),
                mid: getTooltipInfoAt(Math.floor(points.length / 2)),
                last: getTooltipInfoAt(points.length - 1)
              };

              return {
                chartType: '${ct}',
                timeframe: '${tf}',
                bounds: b,
                containerRect,
                totalPoints: points.length,
                nodeCircles,
                yLabels,
                xLabels,
                barBounds,
                tooltips
              };
            })()
          `
        });

        auditReport.chartAudit[auditKey] = data.result.value;
        console.log(`[AUDIT] ${auditKey}:`, JSON.stringify({
          bounds: data.result.value.bounds,
          totalPoints: data.result.value.totalPoints,
          nodeCircles: data.result.value.nodeCircles,
          barBounds: data.result.value.barBounds,
          tooltipsFirst: {
            ptX: data.result.value.tooltips.first.pointX,
            ttX: data.result.value.tooltips.first.tooltipX,
            exceedsLeft: data.result.value.tooltips.first.exceedsPlotLeft
          },
          tooltipsLast: {
            ptX: data.result.value.tooltips.last.pointX,
            ttX: data.result.value.tooltips.last.tooltipX,
            exceedsRight: data.result.value.tooltips.last.exceedsPlotRight
          }
        }, null, 2));
      }
    }

    // =========================================================================
    // 3. AUDIT TOOLBAR & TABLES AT 1280 & 1024
    // =========================================================================
    console.log('\n--- 3. Auditing Toolbar & Tables ---');
    const tbAudit = await sendCommand(ws, 'Runtime.evaluate', {
      returnByValue: true,
      expression: `
        (function() {
          var headerToolbar = document.getElementById('headerToolbar');
          var periodTabs = document.querySelector('[aria-label="Periode Tampilan"]');
          var dateBtn = document.getElementById('dateFilterBtn');
          var salesScope = document.getElementById('salesScopeContainer');
          var exportAction = document.getElementById('exportActionContainer');

          var compTable = document.getElementById('comparisonTableBody');
          var compRows = compTable ? Array.from(compTable.querySelectorAll('tr')).map(r => {
            var tds = Array.from(r.querySelectorAll('td'));
            return {
              cells: tds.map(td => ({ text: td.textContent.trim(), classes: td.className }))
            };
          }) : [];

          return {
            toolbar: {
              periodTabsRect: periodTabs ? periodTabs.getBoundingClientRect() : null,
              dateBtnRect: dateBtn ? dateBtn.getBoundingClientRect() : null,
              salesScopeRect: salesScope ? salesScope.getBoundingClientRect() : null,
              exportActionRect: exportAction ? exportAction.getBoundingClientRect() : null
            },
            comparisonRowsCount: compRows.length,
            firstCompRow: compRows[0] || null
          };
        })()
      `
    });
    auditReport.toolbarAudit = tbAudit.result.value;

    ws.close();
  }

  // Save audit report to disk
  const auditReportPath = path.join(BASE_DIR, 'docs', 'desktop_baseline_audit.json');
  fs.writeFileSync(auditReportPath, JSON.stringify(auditReport, null, 2));
  console.log(`\n[AUDIT REPORT] Written to: ${auditReportPath}`);

  chromeProc.kill();
  httpServer.close();
  console.log('\nBaseline capture and audit completed successfully.');
}

main().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
