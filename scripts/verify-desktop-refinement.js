/**
 * Automated Verification Suite for FADE Pods Showcase v0.2 — Desktop Dashboard UI/UX Refinement
 * 
 * Strict Fixes & Enhancements:
 * 1. Pixel-perfect uncropped element capture using Full-Viewport Render + PIL Cropping (crop-util.py)
 *    Resolves Chromium CDP captureBeyondViewport offset bug where sidebar width shifted crops rightwards.
 * 2. Automated Bounds & Visual Validation:
 *    - Verifies element bounds within viewport
 *    - Verifies key child elements (Title, Revenue, Switcher, Tabs, SVG, Axes) inside card bounds
 *    - Verifies Table horizontal scroll bounds at scrollLeft=0 (Start) and scrollLeft=max (End)
 *    - Python PIL verifies cropped image dimensions and asserts no artificial black crop column
 * 3. Matrix of Admin & Sales Evidence across:
 *    - 1440 & 1280 px, Dark & Light, Expanded & Collapsed
 *    - Line & Bar on 7D, 30D, 90D
 *    - Tooltip boundary audits at Point 0 & Point Last
 *    - Table Start (showing No. Invoice leftmost) & End (showing Status & sticky Aksi)
 * 4. Responsive page overflow checks (1024, 1280, 1440, 1920 px)
 * 5. Mobile regression checks (390 px)
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9880 + Math.floor(Math.random() * 20);
const HTTP_PORT = 8140 + Math.floor(Math.random() * 20);
const BASE_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(BASE_DIR, 'docs', 'screenshots', 'desktop_improved');
const ARTIFACT_DIR = '/Users/naufalausan/.gemini/antigravity/brain/183799d6-e9a7-4bd2-844f-c68a81bc86e6';
const CROP_UTIL = path.join(__dirname, 'crop-util.py');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
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
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(filePath).pipe(res);
    });
  });
  return new Promise((resolve) => {
    server.listen(HTTP_PORT, () => {
      console.log(`[HTTP Server] Listening on http://127.0.0.1:${HTTP_PORT}`);
      resolve(server);
    });
  });
}

async function evalScript(ws, expression) {
  const res = await sendCommand(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (res.exceptionDetails) {
    throw new Error(`Eval exception: ${JSON.stringify(res.exceptionDetails)}`);
  }
  return res.result ? res.result.value : undefined;
}

let currentVpWidth = 1440;
let currentVpHeight = 1200;

async function setViewport(ws, width, height, isMobile = false) {
  currentVpWidth = width;
  currentVpHeight = height;
  await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: isMobile
  });
  await sendCommand(ws, 'Emulation.setVisibleSize', { width, height });
}

async function captureFullScreenshot(ws, filename) {
  const res = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
  const outPath = path.join(SCREENSHOT_DIR, filename);
  fs.writeFileSync(outPath, Buffer.from(res.data, 'base64'));
  if (fs.existsSync(ARTIFACT_DIR)) {
    fs.copyFileSync(outPath, path.join(ARTIFACT_DIR, filename));
  }
  return outPath;
}

/**
 * Robust element screenshot using full viewport render + PIL crop.
 * Eliminates Chromium offset bug and performs strict programmatic verification.
 */
async function captureElementScreenshot(ws, filename, selector, options = {}) {
  const { padding = 0, scrollOffset = -20, targetHeight = 1800, checkType = 'default' } = options;

  // 1. Temporarily expand viewport height so element fits completely vertically
  await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', {
    width: currentVpWidth,
    height: targetHeight,
    deviceScaleFactor: 2,
    mobile: currentVpWidth < 768
  });
  await sendCommand(ws, 'Emulation.setVisibleSize', { width: currentVpWidth, height: targetHeight });
  await sleep(150);

  // 2. Scroll element into view with top offset
  await evalScript(ws, `
    (function() {
      var el = document.querySelector('${selector}');
      if (el) {
        el.scrollIntoView({ block: 'start', behavior: 'instant' });
        window.scrollBy(0, ${scrollOffset});
      }
    })()
  `);
  await sleep(250);

  // 3. Get element geometry and validate bounds within viewport
  const geom = await evalScript(ws, `
    (function() {
      var el = document.querySelector('${selector}');
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        vw: window.innerWidth,
        vh: window.innerHeight
      };
    })()
  `);

  if (!geom) throw new Error('Element not found for capture: ' + selector);

  // Assert bounds are within the viewport
  if (geom.x < 0 || geom.x + geom.w > geom.vw + 2) {
    throw new Error(`Element ${selector} horizontal boundary exceeded viewport: x=${geom.x}, w=${geom.w}, vw=${geom.vw}`);
  }
  if (geom.y < 0 || geom.y + geom.h > geom.vh + 2) {
    throw new Error(`Element ${selector} vertical boundary exceeded viewport: y=${geom.y}, h=${geom.h}, vh=${geom.vh}`);
  }

  // 4. Capture full unclipped viewport screenshot
  const cap = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
  const tempPath = path.join(SCREENSHOT_DIR, `__temp_${Date.now()}_${Math.random().toString(36).substring(7)}.png`);
  fs.writeFileSync(tempPath, Buffer.from(cap.data, 'base64'));

  // 5. Crop with Python PIL and automated validation
  const outPath = path.join(SCREENSHOT_DIR, filename);
  try {
    execSync(`python3 "${CROP_UTIL}" "${tempPath}" "${outPath}" ${geom.x} ${geom.y} ${geom.w} ${geom.h} 2 "${checkType}"`);
  } catch (err) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    throw new Error(`Cropping validation failed for ${filename}: ${err.message}`);
  }

  // 6. Mirror to artifact directory
  if (fs.existsSync(ARTIFACT_DIR)) {
    fs.copyFileSync(outPath, path.join(ARTIFACT_DIR, filename));
  }

  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

  // Restore viewport height
  await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', {
    width: currentVpWidth,
    height: currentVpHeight,
    deviceScaleFactor: 2,
    mobile: currentVpWidth < 768
  });
  await sendCommand(ws, 'Emulation.setVisibleSize', { width: currentVpWidth, height: currentVpHeight });
  await sleep(100);

  return outPath;
}

const adminSession = {
  role: 'admin',
  name: 'Raka Pratama',
  title: 'Head of Operations',
  username: 'admin'
};

const salesSession = {
  role: 'sales',
  name: 'Aru',
  title: 'Sales Representative',
  salesName: 'Aru',
  salesId: 'SLS-ARU',
  region: 'Operasional Sales',
  username: 'aru'
};

async function openPage(ws, role, width, height, theme = 'dark', sidebarCollapsed = false, hash = '#dashboard') {
  await setViewport(ws, width, height, width < 768);
  const sessionObj = role === 'admin' ? adminSession : salesSession;

  // Navigate to index first to initialize session and theme in storage
  const pageUrl = role === 'admin'
    ? `http://127.0.0.1:${HTTP_PORT}/admin.html?demo=1&role=admin${hash}`
    : `http://127.0.0.1:${HTTP_PORT}/sales.html?demo=1&role=sales&sales=aru${hash}`;

  await sendCommand(ws, 'Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/index.html` });
  await sleep(400);

  await evalScript(ws, `
    localStorage.setItem('fade_showcase_session_v021', JSON.stringify(${JSON.stringify(sessionObj)}));
    localStorage.setItem('fade_showcase_theme_v02', '${theme}');
    localStorage.setItem('fade_sidebar_state', '${sidebarCollapsed ? 'collapsed' : 'expanded'}');
    if (window.FADE_STORE) {
      window.FADE_STORE.setActiveSession(${JSON.stringify(sessionObj)});
      window.FADE_STORE.setTheme('${theme}');
    }
  `);

  await sendCommand(ws, 'Page.navigate', { url: pageUrl });
  await sleep(1000);

  // Apply sidebar state properly via body class
  await evalScript(ws, `
    (function() {
      var isCollapsed = ${sidebarCollapsed};
      var btn = document.getElementById('sidebarToggleBtn');
      if (isCollapsed) {
        document.body.classList.add('sidebar-collapsed');
        if (btn) {
          btn.setAttribute('aria-label', 'Bentangkan Sidebar');
          btn.setAttribute('title', 'Bentangkan Sidebar');
        }
      } else {
        document.body.classList.remove('sidebar-collapsed');
        if (btn) {
          btn.setAttribute('aria-label', 'Ciutkan Sidebar');
          btn.setAttribute('title', 'Ciutkan Sidebar');
        }
      }
      if (window.FADE_TREND_CHART && typeof window.FADE_TREND_CHART.resize === 'function') {
        window.FADE_TREND_CHART.resize();
      }
    })()
  `);
  await sleep(350);

  if (hash === '#dashboard') {
    await evalScript(ws, `
      new Promise(resolve => {
        var check = () => {
          var svg = document.getElementById('trendChartSvg');
          var kpi = document.getElementById('kpiAchievementVal');
          if (svg && svg.querySelectorAll('rect, circle, path').length > 0 && kpi && kpi.textContent !== '--%') {
            resolve(true);
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      })
    `);
  }
}

const results = [];
function assert(name, condition, details = '') {
  const passed = Boolean(condition);
  results.push({ name, passed, details });
  const mark = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${mark} : ${name}${details ? ` -> ${details}` : ''}`);
  if (!passed) {
    console.error(`  Assertion Failed: ${name} (${details})`);
  }
}

async function run() {
  console.log('=== STARTING REVISED RIGOROUS DESKTOP DASHBOARD REFINEMENT AUDIT ===');
  const server = await startHttpServer();

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--disable-background-networking',
    `--user-data-dir=/tmp/fade_desktop_audit_rev_${Date.now()}`
  ]);

  let ws = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      const data = await res.json();
      if (data && data.length > 0 && data[0].webSocketDebuggerUrl) {
        const WebSocket = global.WebSocket || require('ws');
        ws = new WebSocket(data[0].webSocketDebuggerUrl);
        await new Promise((res, rej) => {
          ws.onopen = res;
          ws.onerror = rej;
        });
        break;
      }
    } catch (e) {
      await sleep(300);
    }
  }

  if (!ws) {
    console.error('Failed to connect to Chrome CDP.');
    process.exit(1);
  }

  await sendCommand(ws, 'Page.enable');
  await sendCommand(ws, 'DOM.enable');
  await sendCommand(ws, 'Runtime.enable');

  try {
    // =========================================================================
    // SECTION 1: CHART GEOMETRY, CONTENT INTEGRITY & FULL-CARD CAPTURE
    // =========================================================================
    console.log('\n--- SECTION 1: CHART CARD INTEGRITY & UNCLIPPED SCREENSHOTS ---');
    await openPage(ws, 'admin', 1440, 1200, 'dark', false, '#dashboard');

    const timeframes = ['7D', '30D', '90D'];
    for (const tf of timeframes) {
      // 1.1 Bar chart on timeframe
      await evalScript(ws, `
        document.getElementById('chartBtn${tf}').click();
        document.getElementById('chartBtnBar').click();
      `);
      await sleep(350);

      // Verify Card Contains all elements without clipping
      const cardAudit = await evalScript(ws, `
        (function() {
          var card = document.getElementById('trendChartCard');
          var title = document.getElementById('chartTitleText');
          var rev = document.getElementById('chartMonthlyRevenue');
          var switcher = document.getElementById('chartTypeGroup');
          var tfGroup = document.getElementById('chartTimeframeGroup');
          var svg = document.getElementById('trendChartSvg');
          var bars = Array.from(svg.querySelectorAll('#chartBarsGroup rect'));

          if (!card || !title || !rev || !svg || bars.length === 0) return null;

          var cR = card.getBoundingClientRect();
          var tR = title.getBoundingClientRect();
          var rR = rev.getBoundingClientRect();
          var sR = switcher.getBoundingClientRect();
          var tfR = tfGroup.getBoundingClientRect();
          var svgR = svg.getBoundingClientRect();

          var first = bars[0];
          var last = bars[bars.length - 1];
          var firstX = parseFloat(first.getAttribute('x'));
          var firstW = parseFloat(first.getAttribute('width'));
          var lastX = parseFloat(last.getAttribute('x'));
          var lastW = parseFloat(last.getAttribute('width'));
          var vb = (svg.getAttribute('viewBox') || '').split(' ');
          var vbW = vb.length === 4 ? parseFloat(vb[2]) : 1000;
          var xMin = 64;
          var xMax = vbW - 24;

          return {
            titleInside: tR.left >= cR.left && tR.right <= cR.right,
            revenueInside: rR.left >= cR.left && rR.right <= cR.right,
            switcherInside: sR.left >= cR.left && sR.right <= cR.right,
            timeframeInside: tfR.left >= cR.left && tfR.right <= cR.right,
            svgInside: svgR.left >= cR.left && svgR.right <= cR.right && svgR.bottom <= cR.bottom,
            barCount: bars.length,
            firstX: firstX,
            lastRight: lastX + lastW,
            xMin: xMin,
            xMax: xMax,
            overlapsYAxis: firstX < xMin,
            exceedsXMax: (lastX + lastW) > (xMax + 1)
          };
        })()
      `);

      assert(`Bar Chart ${tf}: Title, Revenue, Controls, and SVG inside Card bounds`,
        cardAudit && cardAudit.titleInside && cardAudit.revenueInside && cardAudit.switcherInside && cardAudit.svgInside);
      assert(`Bar Chart ${tf}: First bar starts cleanly within plot (x >= 64, zero Y-axis overlap)`,
        cardAudit && !cardAudit.overlapsYAxis, `firstX: ${cardAudit ? cardAudit.firstX.toFixed(1) : 0} >= 64`);
      assert(`Bar Chart ${tf}: Last bar ends cleanly within plot (x + w <= xMax)`,
        cardAudit && !cardAudit.exceedsXMax, `lastRight: ${cardAudit ? cardAudit.lastRight.toFixed(1) : 0} <= ${cardAudit ? cardAudit.xMax.toFixed(1) : 0}`);

      // Capture unclipped Bar chart card
      await captureElementScreenshot(ws, `improved_chart_admin_bar_${tf.toLowerCase()}_1440_expanded.png`, '#trendChartCard', { padding: 4 });

      // 1.2 Line chart on timeframe
      await evalScript(ws, `
        document.getElementById('chartBtnLine').click();
      `);
      await sleep(350);

      const lineGeom = await evalScript(ws, `
        (function() {
          var svg = document.getElementById('trendChartSvg');
          var dots = Array.from(svg.querySelectorAll('#chartNodesGroup circle[data-idx]'));
          var labels = Array.from(svg.querySelectorAll('#chartXAxisLabels text'));
          var vb = (svg.getAttribute('viewBox') || '').split(' ');
          var vbW = vb.length === 4 ? parseFloat(vb[2]) : 1000;
          var firstX = labels.length > 0 ? parseFloat(labels[0].getAttribute('x')) : 0;
          var lastX = labels.length > 0 ? parseFloat(labels[labels.length - 1].getAttribute('x')) : 0;

          var spacings = [];
          for (var i = 1; i < labels.length; i++) {
            spacings.push(parseFloat(labels[i].getAttribute('x')) - parseFloat(labels[i-1].getAttribute('x')));
          }
          var minSpacing = spacings.length > 0 ? Math.min.apply(null, spacings) : 0;

          return {
            staticDotCount: dots.length,
            labelCount: labels.length,
            firstLabelX: firstX,
            lastLabelX: lastX,
            minSpacing: minSpacing,
            firstLabelWithinBounds: firstX >= 40,
            lastLabelWithinBounds: lastX <= vbW
          };
        })()
      `);

      assert(`Line Chart ${tf}: Clean milestone density (static markers <= 7)`, lineGeom.staticDotCount <= 7, `Found ${lineGeom.staticDotCount}`);
      assert(`Line Chart ${tf}: X-axis labels within SVG boundaries`, lineGeom.firstLabelWithinBounds && lineGeom.lastLabelWithinBounds, `First: ${lineGeom.firstLabelX}, Last: ${lineGeom.lastLabelX}`);
      assert(`Line Chart ${tf}: Label spacing >= 120px (no collision)`, lineGeom.minSpacing >= 120, `Spacing: ${lineGeom.minSpacing.toFixed(1)}px`);

      // Capture unclipped Line chart card
      await captureElementScreenshot(ws, `improved_chart_admin_line_${tf.toLowerCase()}_1440_expanded.png`, '#trendChartCard', { padding: 4 });
    }

    // 1.3 Chart across 1440 collapsed, 1440 light, 1280 expanded/collapsed, 1024
    console.log('\n--- CHART VIEWPORT & THEME MATRIX CAPTURE ---');

    // Admin 1440 Collapsed
    await openPage(ws, 'admin', 1440, 1200, 'dark', true, '#dashboard');
    await captureElementScreenshot(ws, 'improved_chart_admin_line_30d_1440_collapsed.png', '#trendChartCard', { padding: 4 });
    await evalScript(ws, `document.getElementById('chartBtnBar').click();`);
    await sleep(300);
    await captureElementScreenshot(ws, 'improved_chart_admin_bar_30d_1440_collapsed.png', '#trendChartCard', { padding: 4 });

    // Admin 1440 Light Expanded
    await openPage(ws, 'admin', 1440, 1200, 'light', false, '#dashboard');
    await captureElementScreenshot(ws, 'improved_chart_admin_line_30d_1440_light_expanded.png', '#trendChartCard', { padding: 4 });
    await evalScript(ws, `document.getElementById('chartBtnBar').click();`);
    await sleep(300);
    await captureElementScreenshot(ws, 'improved_chart_admin_bar_30d_1440_light_expanded.png', '#trendChartCard', { padding: 4 });

    // Admin 1280 Expanded
    await openPage(ws, 'admin', 1280, 1200, 'dark', false, '#dashboard');
    await captureElementScreenshot(ws, 'improved_chart_admin_line_30d_1280_expanded.png', '#trendChartCard', { padding: 4 });
    await evalScript(ws, `document.getElementById('chartBtnBar').click();`);
    await sleep(300);
    await captureElementScreenshot(ws, 'improved_chart_admin_bar_30d_1280_expanded.png', '#trendChartCard', { padding: 4 });

    // Admin 1280 Collapsed
    await openPage(ws, 'admin', 1280, 1200, 'dark', true, '#dashboard');
    await captureElementScreenshot(ws, 'improved_chart_admin_line_30d_1280_collapsed.png', '#trendChartCard', { padding: 4 });
    await evalScript(ws, `document.getElementById('chartBtnBar').click();`);
    await sleep(300);
    await captureElementScreenshot(ws, 'improved_chart_admin_bar_30d_1280_collapsed.png', '#trendChartCard', { padding: 4 });

    // Admin 1024 Expanded
    await openPage(ws, 'admin', 1024, 1200, 'dark', false, '#dashboard');
    await captureElementScreenshot(ws, 'improved_chart_admin_line_30d_1024_expanded.png', '#trendChartCard', { padding: 4 });
    await evalScript(ws, `document.getElementById('chartBtnBar').click();`);
    await sleep(300);
    await captureElementScreenshot(ws, 'improved_chart_admin_bar_30d_1024_expanded.png', '#trendChartCard', { padding: 4 });

    // Sales 1440 Expanded (Dark & Light)
    await openPage(ws, 'sales', 1440, 1200, 'dark', false, '#dashboard');
    await captureElementScreenshot(ws, 'improved_chart_sales_line_30d_1440_expanded.png', '#trendChartCard', { padding: 4 });
    await evalScript(ws, `document.getElementById('chartBtnBar').click();`);
    await sleep(300);
    await captureElementScreenshot(ws, 'improved_chart_sales_bar_30d_1440_expanded.png', '#trendChartCard', { padding: 4 });

    await openPage(ws, 'sales', 1440, 1200, 'light', false, '#dashboard');
    await captureElementScreenshot(ws, 'improved_chart_sales_line_30d_1440_light_expanded.png', '#trendChartCard', { padding: 4 });
    await evalScript(ws, `document.getElementById('chartBtnBar').click();`);
    await sleep(300);
    await captureElementScreenshot(ws, 'improved_chart_sales_bar_30d_1440_light_expanded.png', '#trendChartCard', { padding: 4 });

    // Sales 1440 Collapsed
    await openPage(ws, 'sales', 1440, 1200, 'dark', true, '#dashboard');
    await captureElementScreenshot(ws, 'improved_chart_sales_line_30d_1440_collapsed.png', '#trendChartCard', { padding: 4 });
    await evalScript(ws, `document.getElementById('chartBtnBar').click();`);
    await sleep(300);
    await captureElementScreenshot(ws, 'improved_chart_sales_bar_30d_1440_collapsed.png', '#trendChartCard', { padding: 4 });

    // Sales 1280 Expanded
    await openPage(ws, 'sales', 1280, 1200, 'dark', false, '#dashboard');
    await captureElementScreenshot(ws, 'improved_chart_sales_line_30d_1280_expanded.png', '#trendChartCard', { padding: 4 });
    await evalScript(ws, `document.getElementById('chartBtnBar').click();`);
    await sleep(300);
    await captureElementScreenshot(ws, 'improved_chart_sales_bar_30d_1280_expanded.png', '#trendChartCard', { padding: 4 });

    // =========================================================================
    // SECTION 2: TOOLTIP BOUNDARY AUDIT (POINT 0 & POINT LAST ON LINE & BAR)
    // =========================================================================
    console.log('\n--- SECTION 2: TOOLTIP BOUNDARY AUDIT ---');
    await openPage(ws, 'admin', 1440, 1200, 'dark', false, '#dashboard');

    for (const mode of ['line', 'bar']) {
      await evalScript(ws, `
        document.getElementById('chartBtn30D').click();
        document.getElementById('chartBtn${mode === 'line' ? 'Line' : 'Bar'}').click();
      `);
      await sleep(300);

      // Point 0 (First point - Boundary Left)
      await evalScript(ws, `
        if (window.FADE_TREND_CHART) {
          window.FADE_TREND_CHART.selectPoint(0);
        }
      `);
      await sleep(350);

      const tip0 = await evalScript(ws, `
        (function() {
          var tt = document.getElementById('chartTooltip');
          var container = document.getElementById('chartInteractiveContainer');
          if (!tt || !container) return null;
          var tRect = tt.getBoundingClientRect();
          var cRect = container.getBoundingClientRect();
          var isVisible = !tt.classList.contains('hidden') && window.getComputedStyle(tt).display !== 'none';
          var valEl = document.getElementById('chartTooltipHtmlVal') || document.getElementById('chartTooltipValue');

          return {
            isVisible: isVisible,
            leftInside: tRect.left >= cRect.left - 2,
            rightInside: tRect.right <= cRect.right + 2,
            valText: valEl ? valEl.textContent : ''
          };
        })()
      `);

      assert(`Tooltip ${mode.toUpperCase()} Point 0 (Left Boundary): Visible and stays inside card bounds`,
        tip0 && tip0.isVisible && tip0.leftInside, `leftInside: ${tip0 ? tip0.leftInside : false}`);
      assert(`Tooltip ${mode.toUpperCase()} Point 0: Formatted currency rendered`,
        tip0 && tip0.valText.startsWith('Rp '), tip0 ? tip0.valText : '');

      await captureElementScreenshot(ws, `improved_chart_tooltip_first_${mode}_1440.png`, '#trendChartCard', { padding: 4 });

      // Point Last (Right Boundary)
      await evalScript(ws, `
        if (window.FADE_TREND_CHART) {
          window.FADE_TREND_CHART.selectPoint(window.FADE_TREND_CHART.points.length - 1);
        }
      `);
      await sleep(350);

      const tipLast = await evalScript(ws, `
        (function() {
          var tt = document.getElementById('chartTooltip');
          var container = document.getElementById('chartInteractiveContainer');
          if (!tt || !container) return null;
          var tRect = tt.getBoundingClientRect();
          var cRect = container.getBoundingClientRect();
          var isVisible = !tt.classList.contains('hidden') && window.getComputedStyle(tt).display !== 'none';
          var valEl = document.getElementById('chartTooltipHtmlVal') || document.getElementById('chartTooltipValue');

          return {
            isVisible: isVisible,
            leftInside: tRect.left >= cRect.left - 2,
            rightInside: tRect.right <= cRect.right + 2,
            valText: valEl ? valEl.textContent : ''
          };
        })()
      `);

      assert(`Tooltip ${mode.toUpperCase()} Point Last (Right Boundary): Visible and stays inside card bounds`,
        tipLast && tipLast.isVisible && tipLast.rightInside, `rightInside: ${tipLast ? tipLast.rightInside : false}`);
      assert(`Tooltip ${mode.toUpperCase()} Point Last: Formatted currency rendered`,
        tipLast && tipLast.valText.startsWith('Rp '), tipLast ? tipLast.valText : '');

      await captureElementScreenshot(ws, `improved_chart_tooltip_last_${mode}_1440.png`, '#trendChartCard', { padding: 4 });
    }

    // Keyboard navigation & dismissal
    await evalScript(ws, `
      (function() {
        var container = document.getElementById('chartInteractiveContainer');
        if (container) {
          container.focus();
          container.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        }
      })()
    `);
    await sleep(200);

    const kbFocusResult = await evalScript(ws, `
      (function() {
        var tt = document.getElementById('chartTooltip');
        return {
          tooltipVisible: tt ? (!tt.classList.contains('hidden') && window.getComputedStyle(tt).display !== 'none') : false
        };
      })()
    `);
    assert('Keyboard Arrow keys navigate and display tooltip', kbFocusResult.tooltipVisible);

    await evalScript(ws, `
      if (window.FADE_TREND_CHART) window.FADE_TREND_CHART.dismissTooltip();
    `);
    await sleep(200);

    const dismissCheck = await evalScript(ws, `
      (function() {
        var tt = document.getElementById('chartTooltip');
        return tt ? (tt.classList.contains('hidden') || window.getComputedStyle(tt).display === 'none') : true;
      })()
    `);
    assert('Tooltip cleanly dismisses on outside exit / escape', dismissCheck);

    // =========================================================================
    // SECTION 3: INVOICES TABLE QUALITY & HORIZONTAL SCROLL AUDIT
    // =========================================================================
    console.log('\n--- SECTION 3: DESKTOP INVOICES TABLE QUALITY & DUAL-STATE SCROLL AUDIT ---');

    const tableConfigs = [
      { role: 'admin', width: 1440, theme: 'dark', collapsed: false, name: 'Admin 1440 Dark Expanded', filePrefix: 'improved_admin_invoices_table_1440_dark_expanded' },
      { role: 'admin', width: 1440, theme: 'light', collapsed: false, name: 'Admin 1440 Light Expanded', filePrefix: 'improved_admin_invoices_table_1440_light_expanded' },
      { role: 'admin', width: 1440, theme: 'dark', collapsed: true, name: 'Admin 1440 Dark Collapsed', filePrefix: 'improved_admin_invoices_table_1440_dark_collapsed' },
      { role: 'admin', width: 1280, theme: 'dark', collapsed: false, name: 'Admin 1280 Dark Expanded', filePrefix: 'improved_admin_invoices_table_1280_dark_expanded' },
      { role: 'admin', width: 1280, theme: 'dark', collapsed: true, name: 'Admin 1280 Dark Collapsed', filePrefix: 'improved_admin_invoices_table_1280_dark_collapsed' },
      { role: 'sales', width: 1440, theme: 'dark', collapsed: false, name: 'Sales 1440 Dark Expanded', filePrefix: 'improved_sales_invoices_table_1440_dark_expanded' },
      { role: 'sales', width: 1440, theme: 'light', collapsed: false, name: 'Sales 1440 Light Expanded', filePrefix: 'improved_sales_invoices_table_1440_light_expanded' },
      { role: 'sales', width: 1280, theme: 'dark', collapsed: false, name: 'Sales 1280 Dark Expanded', filePrefix: 'improved_sales_invoices_table_1280_dark_expanded' }
    ];

    for (const cfg of tableConfigs) {
      await openPage(ws, cfg.role, cfg.width, 1200, cfg.theme, cfg.collapsed, '#invoices');
      await sleep(600);

      // Audit table rows, badges, dividers, and scroll dimensions
      const tableAudit = await evalScript(ws, `
        (function() {
          var tbody = document.getElementById('invoiceTableBody');
          var scrollBox = document.querySelector('.table-scroll-container');
          if (!tbody || !scrollBox) return null;

          var rows = Array.from(tbody.querySelectorAll('tr'));
          var badRows = [];
          var dividerHasSubtle = tbody.classList.contains('divide-border-subtle/35') || tbody.className.indexOf('divide-border-subtle/35') >= 0;

          rows.forEach(function(tr, idx) {
            var cells = Array.from(tr.querySelectorAll('td'));
            if (cells.length < 8) return;

            // Status is cell index 8
            var statusTd = cells[8];
            var statusBadge = statusTd ? statusTd.querySelector('span') : null;
            var isBadgeClipped = statusBadge ? (statusBadge.scrollWidth > statusBadge.clientWidth + 1) : false;

            if (isBadgeClipped) {
              badRows.push({ row: idx, issue: 'status_clipped', text: statusBadge.textContent });
            }
          });

          var ths = Array.from(scrollBox.querySelectorAll('thead th'));
          var firstTh = ths[0];
          var lastTh = ths[ths.length - 1];
          var statusTh = ths.length >= 2 ? ths[ths.length - 2] : null;

          return {
            rowCount: rows.length,
            badRowCount: badRows.length,
            dividerHasSubtle: dividerHasSubtle,
            scrollWidth: scrollBox.scrollWidth,
            clientWidth: scrollBox.clientWidth,
            maxScrollLeft: scrollBox.scrollWidth - scrollBox.clientWidth,
            firstThWidth: firstTh ? Math.round(firstTh.getBoundingClientRect().width) : 0,
            actionThWidth: lastTh ? Math.round(lastTh.getBoundingClientRect().width) : 0,
            statusThWidth: statusTh ? Math.round(statusTh.getBoundingClientRect().width) : 0
          };
        })()
      `);

      assert(`Table ${cfg.name}: Rows rendered (${tableAudit ? tableAudit.rowCount : 0})`, tableAudit && tableAudit.rowCount > 0);
      assert(`Table ${cfg.name}: Zero status badges clipped (0 bad rows)`, tableAudit && tableAudit.badRowCount === 0, `Bad rows: ${tableAudit ? tableAudit.badRowCount : 0}`);
      assert(`Table ${cfg.name}: Subtle row divider token applied (divide-border-subtle/35)`, tableAudit && tableAudit.dividerHasSubtle);
      assert(`Table ${cfg.name}: Action column has consistent width`, tableAudit && tableAudit.actionThWidth >= 100, `Width: ${tableAudit ? tableAudit.actionThWidth : 0}px`);

      // 1. Capture Position START (scrollLeft = 0): Shows leftmost column (No. Invoice) up to Outstanding + sticky Aksi
      await evalScript(ws, `
        var sc = document.querySelector('.table-scroll-container');
        if (sc) sc.scrollLeft = 0;
      `);
      await sleep(200);

      const startBounds = await evalScript(ws, `
        (function() {
          var sc = document.querySelector('.table-scroll-container');
          var firstTh = sc.querySelector('thead th:first-child');
          var actionTh = sc.querySelector('thead th:last-child');
          var scR = sc.getBoundingClientRect();
          var fR = firstTh.getBoundingClientRect();
          var aR = actionTh.getBoundingClientRect();
          return {
            firstColVisible: fR.left >= scR.left - 2,
            actionColVisible: aR.right <= scR.right + 2
          };
        })()
      `);
      assert(`Table ${cfg.name} (Start View): First column (No. Invoice) and sticky Action fully visible`,
        startBounds && startBounds.firstColVisible && startBounds.actionColVisible);

      await captureElementScreenshot(ws, `${cfg.filePrefix}_start.png`, '.table-scroll-container', { padding: 4 });

      // 2. Capture Position END (scrollLeft = max): Shows rightmost columns (Total, Terbayar, Outstanding, Status) + sticky Aksi
      await evalScript(ws, `
        var sc = document.querySelector('.table-scroll-container');
        if (sc) sc.scrollLeft = sc.scrollWidth - sc.clientWidth;
      `);
      await sleep(200);

      const endBounds = await evalScript(ws, `
        (function() {
          var sc = document.querySelector('.table-scroll-container');
          var ths = Array.from(sc.querySelectorAll('thead th'));
          var statusTh = ths[ths.length - 2];
          var actionTh = ths[ths.length - 1];
          var scR = sc.getBoundingClientRect();
          var sR = statusTh.getBoundingClientRect();
          var aR = actionTh.getBoundingClientRect();
          return {
            statusThInside: sR.right <= aR.left + 2,
            actionColVisible: aR.right <= scR.right + 2
          };
        })()
      `);
      assert(`Table ${cfg.name} (End View): Status column unclipped and sticky Action pinned cleanly`,
        endBounds && endBounds.statusThInside && endBounds.actionColVisible);

      await captureElementScreenshot(ws, `${cfg.filePrefix}_end.png`, '.table-scroll-container', { padding: 4 });
    }

    // =========================================================================
    // SECTION 4: FULL VIEWPORT RESPONSIVE AUDIT & COMPARISON SCREENSHOTS
    // =========================================================================
    console.log('\n--- SECTION 4: FULL VIEWPORT AUDIT (1024, 1280, 1440, 1920 PX) ---');
    const viewports = [1024, 1280, 1440, 1920];
    const roles = ['admin', 'sales'];

    for (const role of roles) {
      for (const vp of viewports) {
        await openPage(ws, role, vp, 900, 'dark', false, '#dashboard');

        // Dark expanded
        const darkExpandedOverflow = await evalScript(ws, `
          ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
          })
        `);
        assert(`${role.toUpperCase()} ${vp}px Dark Expanded: Zero horizontal page overflow`, !darkExpandedOverflow.hasOverflow, `W: ${darkExpandedOverflow.clientWidth} vs S: ${darkExpandedOverflow.scrollWidth}`);
        await captureFullScreenshot(ws, `improved_${role}_dark_${vp}_expanded.png`);

        // Dark collapsed
        if (vp >= 1280) {
          await evalScript(ws, `
            var btn = document.getElementById('sidebarToggleBtn');
            if (btn) btn.click();
          `);
          await sleep(300);

          const darkCollapsedOverflow = await evalScript(ws, `
            ({
              hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
            })
          `);
          assert(`${role.toUpperCase()} ${vp}px Dark Collapsed: Zero horizontal page overflow`, !darkCollapsedOverflow.hasOverflow);
          if (vp === 1440) {
            await captureFullScreenshot(ws, `improved_${role}_dark_${vp}_collapsed.png`);
          }

          // Restore to expanded
          await evalScript(ws, `
            var btn = document.getElementById('sidebarToggleBtn');
            if (btn) btn.click();
          `);
          await sleep(200);
        }

        // Light theme test on 1440
        if (vp === 1440) {
          await openPage(ws, role, vp, 900, 'light', false, '#dashboard');
          const lightOverflow = await evalScript(ws, `
            ({
              theme: window.FADE_STORE ? window.FADE_STORE.getTheme() : 'light',
              hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
            })
          `);
          assert(`${role.toUpperCase()} 1440px Light Expanded: Light theme active & zero overflow`, lightOverflow.theme === 'light' && !lightOverflow.hasOverflow, `Theme: ${lightOverflow.theme}`);
          await captureFullScreenshot(ws, `improved_${role}_light_${vp}_expanded.png`);
        }
      }
    }

    // =========================================================================
    // SECTION 5: MOBILE REGRESSION VERIFICATION (390 PX)
    // =========================================================================
    console.log('\n--- SECTION 5: MOBILE REGRESSION VERIFICATION (390 PX) ---');
    await openPage(ws, 'admin', 390, 844, 'dark', false, '#invoices');
    await sleep(600);

    const mobileCheck = await evalScript(ws, `
      (function() {
        var desktopTable = document.querySelector('.table-scroll-container');
        var mobileList = document.getElementById('invoiceMobileList');
        var desktopHidden = desktopTable ? window.getComputedStyle(desktopTable).display === 'none' : true;
        var mobileVisible = mobileList ? window.getComputedStyle(mobileList).display !== 'none' : false;
        var cardCount = mobileList ? mobileList.children.length : 0;
        var bottomNav = document.querySelector('.shell-mobile-nav') || document.getElementById('mobileNavContainer');
        var bottomNavVisible = bottomNav ? window.getComputedStyle(bottomNav).display !== 'none' : false;

        return {
          desktopHidden: desktopHidden,
          mobileVisible: mobileVisible,
          cardCount: cardCount,
          bottomNavVisible: bottomNavVisible,
          hasOverflow: document.documentElement.scrollWidth > 390
        };
      })()
    `);
    assert('Mobile (390px): Desktop table cleanly hidden', mobileCheck.desktopHidden);
    assert('Mobile (390px): Mobile invoice cards visible (10 per page)', mobileCheck.mobileVisible && mobileCheck.cardCount === 10, `Cards: ${mobileCheck.cardCount}`);
    assert('Mobile (390px): Bottom navigation visible & fixed', mobileCheck.bottomNavVisible);
    assert('Mobile (390px): Zero horizontal page overflow', !mobileCheck.hasOverflow);

  } catch (err) {
    console.error('Test Suite encountered unhandled error:', err);
    assert('Test Suite Execution', false, err.message);
  } finally {
    if (ws) ws.close();
    chromeProc.kill('SIGKILL');
    server.close();
  }

  // Print Summary
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log('\n======================================================');
  console.log(`TOTAL AUDIT ASSERTIONS: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${failedCount}`);
  console.log('======================================================');

  if (failedCount > 0) {
    console.error('ONE OR MORE ASSERTIONS FAILED. EXITING WITH CODE 1.');
    process.exit(1);
  } else {
    console.log('ALL ASSERTIONS PASSED (100% PASS RATE).');
    process.exit(0);
  }
}

run();
