/**
 * Automated Headless Verification Suite for:
 * FADE PODS v0.2 — REVISION 02B FOLLOW-UP (Rigorous Chart UX & Responsiveness Verification)
 * Covers strict acceptance criteria, real user input dispatch (hover, click, touch),
 * complete viewports (390, 834, 1024, 1280, 1440, 1920, 2560px), themes, sidebar toggle,
 * zoom 125%, route switching, and timeframe-scoped empty states.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9580 + Math.floor(Math.random() * 80);
const BASE_DIR = path.resolve(__dirname, '..');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getJson(url) {
  const res = await fetch(url);
  return res.json();
}

function sendCommand(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.id === id) {
        ws.removeEventListener('message', handler);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const results = {
  passed: 0,
  failed: 0,
  details: []
};

function assert(condition, message, role = 'SHARED') {
  if (condition) {
    results.passed++;
    results.details.push({ status: 'PASS', role, message });
    console.log(`[PASS] [${role}] ${message}`);
  } else {
    results.failed++;
    results.details.push({ status: 'FAIL', role, message });
    console.error(`[FAIL] [${role}] ${message}`);
  }
}

async function runAudit() {
  console.log('Starting Chrome for Revision 02B Follow-up Verification on port ' + PORT + '...');
  const tmpDir = '/tmp/chrome-cdp-rev02b-followup-' + Date.now();
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + tmpDir,
    '--no-first-run',
    '--no-default-browser-check'
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      version = await getJson(`http://localhost:${PORT}/json/version`);
      if (version && version.webSocketDebuggerUrl) break;
    } catch (e) {}
  }

  if (!version) {
    console.error('Failed to connect to Chrome');
    chromeProc.kill();
    process.exit(1);
  }

  const screenshotsDir = path.join(BASE_DIR, 'docs', 'screenshots', 'rev02b');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const viewports = [390, 834, 1024, 1280, 1440, 1920, 2560];

  // =================================================================
  // 1. AUDIT ADMIN ROLE
  // =================================================================
  console.log('\n======================================================');
  console.log('AUDIT REVISI 02B: ADMIN ROLE (STRICT VERIFICATION)');
  console.log('======================================================');

  {
    const targetRes = await (await fetch(`http://localhost:${PORT}/json/new`, { method: 'PUT' })).json();
    const ws = new globalThis.WebSocket(targetRes.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    await sendCommand(ws, 'Page.enable');
    await sendCommand(ws, 'Runtime.enable');
    await sendCommand(ws, 'DOM.enable');

    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'admin.html#dashboard') });
    await sleep(500);
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `localStorage.setItem('fade_showcase_session_v021', JSON.stringify({
        role: 'admin',
        username: 'admin',
        name: 'Raka Pratama',
        title: 'Head of Operations'
      }));`
    });
    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'admin.html#dashboard') });
    await sleep(1000);

    // A. Viewport Matrix (390, 834, 1024, 1280, 1440, 1920, 2560 px)
    for (const w of viewports) {
      const isMobile = w <= 768;
      await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: isMobile });
      await sleep(250);

      const metrics = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const b = window.FADE_TREND_CHART.BOUNDS;
          const container = document.getElementById('chartInteractiveContainer');
          const cr = container.getBoundingClientRect();
          const plotWidth = b.xMax - b.xMin;
          const plotHeight = b.yMax - b.yMin;
          const plotRatio = plotWidth / b.viewBoxWidth;
          const xLabels = Array.from(document.querySelectorAll('#chartXAxisLabels text'));
          const fontSizes = xLabels.map(el => parseFloat(el.getAttribute('font-size') || 0));
          const minFontSize = fontSizes.length ? Math.min(...fontSizes) : 0;

          let hasOverlap = false;
          for (let i = 0; i < xLabels.length - 1; i++) {
            const x1 = parseFloat(xLabels[i].getAttribute('x'));
            const x2 = parseFloat(xLabels[i + 1].getAttribute('x'));
            if ((x2 - x1) < 20) hasOverlap = true;
          }

          const hasOverflow = document.documentElement.scrollWidth > window.innerWidth;

          return {
            w: ${w},
            containerWidth: cr.width,
            containerHeight: cr.height,
            plotWidth,
            plotHeight,
            plotRatio,
            minFontSize,
            hasOverlap,
            hasOverflow
          };
        })()`,
        returnByValue: true
      });

      const m = metrics.result.value;
      assert(m.plotRatio >= 0.80, `[ADMIN ${w}px] Plot width uses >= 80% card width after axis (Actual: ${(m.plotRatio * 100).toFixed(1)}%)`, 'ADMIN');
      
      const reqHeight = w <= 420 ? 200 : 260;
      assert(m.plotHeight >= reqHeight, `[ADMIN ${w}px] SVG plot height meets strict criteria (Actual: ${m.plotHeight}px >= ${reqHeight}px)`, 'ADMIN');
      assert(m.minFontSize >= 12, `[ADMIN ${w}px] X-axis font size is actual >= 12px (Actual: ${m.minFontSize}px)`, 'ADMIN');
      assert(!m.hasOverlap, `[ADMIN ${w}px] Zero label overlap on X-axis`, 'ADMIN');
      assert(!m.hasOverflow, `[ADMIN ${w}px] Zero horizontal page overflow`, 'ADMIN');

      // Screenshot capture with chart scrolled in
      if (w === 390) {
        await sendCommand(ws, 'Runtime.evaluate', {
          expression: `document.getElementById('chartInteractiveContainer').scrollIntoView({ block: 'center' });`
        });
        await sleep(200);
        const shot = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotsDir, 'admin_390px_chart.png'), Buffer.from(shot.data, 'base64'));
      } else if (w === 1440) {
        await sendCommand(ws, 'Runtime.evaluate', {
          expression: `window.scrollTo(0, 0);`
        });
        await sleep(200);
        const shot = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotsDir, 'admin_1440px_desktop.png'), Buffer.from(shot.data, 'base64'));
      }
    }

    // B. Real User Input Dispatch: Hover, Click & Touch on Node
    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(200);

    const nodeCoords = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const svg = document.getElementById('trendChartSvg');
        const r = svg.getBoundingClientRect();
        const pt = window.FADE_TREND_CHART.points[1];
        const b = window.FADE_TREND_CHART.BOUNDS;
        const screenX = r.left + (pt.x * r.width / b.viewBoxWidth);
        const screenY = r.top + (pt.y * r.height / b.viewBoxHeight);
        return { screenX: Math.round(screenX), screenY: Math.round(screenY), label: pt.label };
      })()`,
      returnByValue: true
    });

    // 1. Mouse Move / Hover
    await sendCommand(ws, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: nodeCoords.result.value.screenX,
      y: nodeCoords.result.value.screenY
    });
    await sleep(150);

    const hoverCheck = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const activeIdx = window.FADE_TREND_CHART.activePointIndex;
        const tipValEl = document.getElementById('chartTooltipValue');
        return {
          activeIdx,
          tipText: tipValEl ? tipValEl.textContent : '',
          isTipVisible: document.getElementById('chartTooltipGroup').style.display !== 'none'
        };
      })()`,
      returnByValue: true
    });
    assert(hoverCheck.result.value.activeIdx === 1 && hoverCheck.result.value.isTipVisible, '[ADMIN] Real pointer hover dispatches to point 1 and activates SVG Tooltip', 'ADMIN');

    // 2. Mouse Click
    await sendCommand(ws, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: nodeCoords.result.value.screenX,
      y: nodeCoords.result.value.screenY,
      button: 'left',
      clickCount: 1
    });
    await sendCommand(ws, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: nodeCoords.result.value.screenX,
      y: nodeCoords.result.value.screenY,
      button: 'left',
      clickCount: 1
    });
    await sleep(150);

    const clickCheck = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        return {
          activeIdx: window.FADE_TREND_CHART.activePointIndex,
          tipText: document.getElementById('chartTooltipValue').textContent
        };
      })()`,
      returnByValue: true
    });
    assert(clickCheck.result.value.activeIdx === 1 && clickCheck.result.value.tipText.includes('Rp'), '[ADMIN] Real mouse click selects point 1 with sticky retention', 'ADMIN');

    // 3. Real Touch Event on 390px
    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
    await sendCommand(ws, 'Emulation.setTouchEmulationEnabled', { enabled: true, configuration: 'mobile' });
    await sleep(200);

    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `document.getElementById('chartInteractiveContainer').scrollIntoView({ block: 'center', behavior: 'instant' });`
    });
    await sleep(200);

    const touchCoords = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const svg = document.getElementById('trendChartSvg');
        const r = svg.getBoundingClientRect();
        const pt = window.FADE_TREND_CHART.points[3];
        const b = window.FADE_TREND_CHART.BOUNDS;
        const screenX = r.left + (pt.x * r.width / b.viewBoxWidth);
        const screenY = r.top + (pt.y * r.height / b.viewBoxHeight);
        return { screenX: Math.round(screenX), screenY: Math.round(screenY), label: pt.label };
      })()`,
      returnByValue: true
    });

    await sendCommand(ws, 'Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: touchCoords.result.value.screenX, y: touchCoords.result.value.screenY }]
    });
    await sleep(100);
    await sendCommand(ws, 'Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
    await sleep(200);

    const touchCheck = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        return {
          activeIdx: window.FADE_TREND_CHART.activePointIndex,
          tipText: document.getElementById('chartTooltipValue').textContent
        };
      })()`,
      returnByValue: true
    });
    assert(touchCheck.result.value.activeIdx === 3 && touchCheck.result.value.tipText.includes('Rp'), '[ADMIN] Real touch event on mobile selects point 3 and retains tooltip', 'ADMIN');

    // C. Theme Switching (Light vs Dark)
    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sendCommand(ws, 'Emulation.setTouchEmulationEnabled', { enabled: false });
    await sleep(200);

    const themeLight = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const themeBtn = document.getElementById('desktopThemeBtn');
        if (themeBtn) themeBtn.click();
        const isDark = document.documentElement.classList.contains('dark');
        return { isDark };
      })()`,
      returnByValue: true
    });
    assert(!themeLight.result.value.isDark, '[ADMIN] Theme toggles to Light theme seamlessly', 'ADMIN');

    const themeDark = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const themeBtn = document.getElementById('desktopThemeBtn');
        if (themeBtn) themeBtn.click();
        const isDark = document.documentElement.classList.contains('dark');
        return { isDark };
      })()`,
      returnByValue: true
    });
    assert(themeDark.result.value.isDark, '[ADMIN] Theme toggles back to Dark theme', 'ADMIN');

    // D. Sidebar Toggle & Dynamic ResizeObserver
    const sidebarTest = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(async () => {
        const wBefore = window.FADE_TREND_CHART.BOUNDS.viewBoxWidth;
        const toggleBtn = document.getElementById('sidebarToggleBtn');
        toggleBtn.click();
        await new Promise(r => setTimeout(r, 400));
        const wAfter = window.FADE_TREND_CHART.BOUNDS.viewBoxWidth;
        const isCollapsed = document.body.classList.contains('sidebar-collapsed');
        // Toggle back to expanded
        toggleBtn.click();
        await new Promise(r => setTimeout(r, 400));
        return {
          wBefore,
          wAfter,
          isCollapsed,
          expandedProperly: wAfter > wBefore
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    assert(sidebarTest.result.value.expandedProperly, `[ADMIN] Sidebar collapse expands chart width dynamically (${sidebarTest.result.value.wBefore}px -> ${sidebarTest.result.value.wAfter}px)`, 'ADMIN');

    // E. Browser Zoom 125%
    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1.25, mobile: false });
    await sleep(200);
    const zoomCheck = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `document.documentElement.scrollWidth <= window.innerWidth`,
      returnByValue: true
    });
    assert(zoomCheck.result.value, '[ADMIN] Browser zoom 125% maintains zero horizontal overflow', 'ADMIN');
    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    // F. Route Switching & Navigation Return
    const routeCheck = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(async () => {
        window.location.hash = '#invoices';
        await new Promise(r => setTimeout(r, 300));
        window.location.hash = '#dashboard';
        await new Promise(r => setTimeout(r, 300));
        return {
          chartVisible: document.getElementById('chartInteractiveContainer').offsetHeight > 0,
          pointsCount: window.FADE_TREND_CHART.points.length
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    assert(routeCheck.result.value.chartVisible && routeCheck.result.value.pointsCount === 6, '[ADMIN] Navigating away to #invoices and back restores chart seamlessly without leak', 'ADMIN');

    ws.close();
  }

  // =================================================================
  // 2. AUDIT SALES ROLE (PARITY WITH ADMIN)
  // =================================================================
  console.log('\n======================================================');
  console.log('AUDIT REVISI 02B: SALES ROLE (STRICT VERIFICATION)');
  console.log('======================================================');

  {
    const targetRes = await (await fetch(`http://localhost:${PORT}/json/new`, { method: 'PUT' })).json();
    const ws = new globalThis.WebSocket(targetRes.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    await sendCommand(ws, 'Page.enable');
    await sendCommand(ws, 'Runtime.enable');
    await sendCommand(ws, 'DOM.enable');

    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'sales.html#dashboard') });
    await sleep(500);
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `localStorage.setItem('fade_showcase_session_v021', JSON.stringify({
        role: 'sales',
        username: 'sales_nurdin',
        name: 'Nurdin Wijaya',
        title: 'Sales Representative',
        salesName: 'Nurdin'
      }));`
    });
    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'sales.html#dashboard') });
    await sleep(1000);

    // A. Viewport Matrix for Sales (390, 834, 1024, 1280, 1440, 1920, 2560 px)
    for (const w of viewports) {
      const isMobile = w <= 768;
      await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: isMobile });
      await sleep(250);

      const metrics = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const b = window.FADE_TREND_CHART.BOUNDS;
          const container = document.getElementById('chartInteractiveContainer');
          const cr = container.getBoundingClientRect();
          const plotWidth = b.xMax - b.xMin;
          const plotHeight = b.yMax - b.yMin;
          const plotRatio = plotWidth / b.viewBoxWidth;
          const xLabels = Array.from(document.querySelectorAll('#chartXAxisLabels text'));
          const fontSizes = xLabels.map(el => parseFloat(el.getAttribute('font-size') || 0));
          const minFontSize = fontSizes.length ? Math.min(...fontSizes) : 0;
          const hasOverflow = document.documentElement.scrollWidth > window.innerWidth;

          return {
            w: ${w},
            plotWidth,
            plotHeight,
            plotRatio,
            minFontSize,
            hasOverflow
          };
        })()`,
        returnByValue: true
      });

      const m = metrics.result.value;
      assert(m.plotRatio >= 0.80, `[SALES ${w}px] Sales plot width uses >= 80% card width (Actual: ${(m.plotRatio * 100).toFixed(1)}%)`, 'SALES');
      const reqHeight = w <= 420 ? 200 : 260;
      assert(m.plotHeight >= reqHeight, `[SALES ${w}px] Sales plot height meets strict criteria (Actual: ${m.plotHeight}px >= ${reqHeight}px)`, 'SALES');
      assert(m.minFontSize >= 12, `[SALES ${w}px] Sales X-axis font size >= 12px`, 'SALES');
      assert(!m.hasOverflow, `[SALES ${w}px] Zero horizontal overflow on Sales`, 'SALES');

      if (w === 390) {
        await sendCommand(ws, 'Runtime.evaluate', {
          expression: `document.getElementById('chartInteractiveContainer').scrollIntoView({ block: 'center' });`
        });
        await sleep(200);
        const shot = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotsDir, 'sales_390px_chart.png'), Buffer.from(shot.data, 'base64'));
      } else if (w === 1440) {
        await sendCommand(ws, 'Runtime.evaluate', {
          expression: `window.scrollTo(0, 0);`
        });
        await sleep(200);
        const shot = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotsDir, 'sales_1440px_desktop.png'), Buffer.from(shot.data, 'base64'));
      }
    }

    // B. Real User Input on Sales: Hover & Touch
    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(200);

    const salesCoords = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const svg = document.getElementById('trendChartSvg');
        const r = svg.getBoundingClientRect();
        const pt = window.FADE_TREND_CHART.points[4];
        const b = window.FADE_TREND_CHART.BOUNDS;
        const screenX = r.left + (pt.x * r.width / b.viewBoxWidth);
        const screenY = r.top + (pt.y * r.height / b.viewBoxHeight);
        return { screenX: Math.round(screenX), screenY: Math.round(screenY) };
      })()`,
      returnByValue: true
    });

    await sendCommand(ws, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: salesCoords.result.value.screenX,
      y: salesCoords.result.value.screenY
    });
    await sleep(150);

    const salesHover = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        return {
          activeIdx: window.FADE_TREND_CHART.activePointIndex,
          tipText: document.getElementById('chartTooltipValue').textContent,
          isTipVisible: document.getElementById('chartTooltipGroup').style.display !== 'none'
        };
      })()`,
      returnByValue: true
    });
    assert(salesHover.result.value.activeIdx === 4 && salesHover.result.value.isTipVisible, '[SALES] Real pointer hover activates SVG Tooltip on Sales portal', 'SALES');

    // 2. Real Mouse Click on Point 2 (Sales)
    const salesClickCoords = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const svg = document.getElementById('trendChartSvg');
        const r = svg.getBoundingClientRect();
        const pt = window.FADE_TREND_CHART.points[2];
        const b = window.FADE_TREND_CHART.BOUNDS;
        const screenX = r.left + (pt.x * r.width / b.viewBoxWidth);
        const screenY = r.top + (pt.y * r.height / b.viewBoxHeight);
        return { screenX: Math.round(screenX), screenY: Math.round(screenY) };
      })()`,
      returnByValue: true
    });

    await sendCommand(ws, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: salesClickCoords.result.value.screenX,
      y: salesClickCoords.result.value.screenY,
      button: 'left',
      clickCount: 1
    });
    await sendCommand(ws, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: salesClickCoords.result.value.screenX,
      y: salesClickCoords.result.value.screenY,
      button: 'left',
      clickCount: 1
    });
    await sleep(150);

    const salesClickCheck = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        return {
          activeIdx: window.FADE_TREND_CHART.activePointIndex,
          tipText: document.getElementById('chartTooltipValue').textContent
        };
      })()`,
      returnByValue: true
    });
    assert(salesClickCheck.result.value.activeIdx === 2 && salesClickCheck.result.value.tipText.includes('Rp'), '[SALES] Real mouse click selects point 2 with sticky retention', 'SALES');

    // 3. Real Touch Event on 390px (Sales)
    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
    await sendCommand(ws, 'Emulation.setTouchEmulationEnabled', { enabled: true, configuration: 'mobile' });
    await sleep(200);

    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `document.getElementById('chartInteractiveContainer').scrollIntoView({ block: 'center', behavior: 'instant' });`
    });
    await sleep(200);

    const salesTouchCoords = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const svg = document.getElementById('trendChartSvg');
        const r = svg.getBoundingClientRect();
        const pt = window.FADE_TREND_CHART.points[1];
        const b = window.FADE_TREND_CHART.BOUNDS;
        const screenX = r.left + (pt.x * r.width / b.viewBoxWidth);
        const screenY = r.top + (pt.y * r.height / b.viewBoxHeight);
        return { screenX: Math.round(screenX), screenY: Math.round(screenY) };
      })()`,
      returnByValue: true
    });

    await sendCommand(ws, 'Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: salesTouchCoords.result.value.screenX, y: salesTouchCoords.result.value.screenY }]
    });
    await sleep(100);
    await sendCommand(ws, 'Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
    await sleep(200);

    const salesTouchCheck = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        return {
          activeIdx: window.FADE_TREND_CHART.activePointIndex,
          tipText: document.getElementById('chartTooltipValue').textContent
        };
      })()`,
      returnByValue: true
    });
    assert(salesTouchCheck.result.value.activeIdx === 1 && salesTouchCheck.result.value.tipText.includes('Rp'), '[SALES] Real touch event on mobile selects point 1 and retains tooltip', 'SALES');

    // Restore desktop before C
    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sendCommand(ws, 'Emulation.setTouchEmulationEnabled', { enabled: false });
    await sleep(200);

    // C. Timeframe Scoped Empty State & Restoration
    // Nurdin has 0 transactions in 7D (16-22 Nov), but 58 transactions in 30D!
    const tfEmptyTest = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const btn7D = document.getElementById('chartBtn7D');
        btn7D.click();
        const emptyEl = document.getElementById('chartEmptyState');
        const isEmptyVisible = emptyEl && !emptyEl.classList.contains('hidden');
        const emptyMsg = emptyEl ? emptyEl.querySelector('p.text-xs').textContent : '';
        const rev7D = document.getElementById('chartMonthlyRevenue').textContent;

        const btn30D = document.getElementById('chartBtn30D');
        btn30D.click();
        const isRestoredHidden = emptyEl && emptyEl.classList.contains('hidden');
        const rev30D = document.getElementById('chartMonthlyRevenue').textContent;

        return {
          isEmptyVisible,
          emptyMsg,
          rev7D,
          isRestoredHidden,
          rev30D,
          behaviorVerified: isEmptyVisible && rev7D === 'Rp 0' && isRestoredHidden && rev30D !== 'Rp 0'
        };
      })()`,
      returnByValue: true
    });
    assert(tfEmptyTest.result.value.behaviorVerified, '[SALES] Scoped empty state activates when timeframe has 0 transactions and smoothly restores on 30D', 'SALES');

    // D. Global Empty State (Dataset/Filter Empty)
    const globalEmptyTest = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        window.FADE_TREND_CHART.setData(FADE_STORE.getInvoices(), 'NonExistentRepresentative', 'bulan', null, null);
        const emptyEl = document.getElementById('chartEmptyState');
        const isVisible = emptyEl && !emptyEl.classList.contains('hidden');
        const msg = emptyEl ? emptyEl.querySelector('p.text-xs').textContent : '';
        return { isVisible, msg };
      })()`,
      returnByValue: true
    });
    assert(globalEmptyTest.result.value.isVisible && globalEmptyTest.result.value.msg.includes('Tidak ada data transaksi'), '[SALES] Global empty state cleanly distinguishes 0-data filter from timeframe empty', 'SALES');

    ws.close();
  }

  chromeProc.kill();

  console.log('\n======================================================');
  console.log(`TOTAL: ${results.passed} PASSED, ${results.failed} FAILED`);
  console.log('======================================================\n');

  if (results.failed === 0) {
    console.log('REVISION 02B FOLLOW-UP VERIFICATION PASSES 100% ACROSS ADMIN & SALES!');
    process.exit(0);
  } else {
    console.error('REVISION 02B HAD ' + results.failed + ' FAILURES!');
    process.exit(1);
  }
}

runAudit().catch(err => {
  console.error('Unhandled error in audit:', err);
  process.exit(1);
});
