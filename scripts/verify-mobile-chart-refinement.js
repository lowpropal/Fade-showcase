/**
 * Comprehensive Verification Script for FADE Pods Showcase v0.2
 * Mobile Chart Readability Refinement (Tahap 1)
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9930 + Math.floor(Math.random() * 30);
const HTTP_PORT = 8190 + Math.floor(Math.random() * 30);
const BASE_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(BASE_DIR, 'docs', 'screenshots', 'mobile_chart_improved');
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

async function setViewport(ws, width, height) {
  await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', {
    width: width,
    height: height,
    deviceScaleFactor: 2,
    mobile: width < 768,
    screenOrientation: { angle: 0, type: 'portraitPrimary' }
  });
  await sleep(100);
}

async function captureElementScreenshot(ws, filename, selector = '#trendChartCard') {
  // 1. Scroll element into view with generous top offset
  await evalScript(ws, `
    (function() {
      var el = document.querySelector('${selector}');
      if (el) {
        var r = el.getBoundingClientRect();
        var header = document.querySelector('.shell-mobile-header');
        var headerBottom = header && getComputedStyle(header).position === 'fixed'
          ? header.getBoundingClientRect().bottom
          : 0;
        var targetTop = Math.max(16, headerBottom + 12);
        window.scrollBy({ top: r.top - targetTop, behavior: 'instant' });
      }
    })()
  `);
  await sleep(200);

  // 2. Measure element relative to current viewport
  const rect = await evalScript(ws, `
    (function() {
      var el = document.querySelector('${selector}');
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight
      };
    })()
  `);

  if (!rect) throw new Error(`Element ${selector} not found`);

  // 3. Take unclipped viewport screenshot
  const fullCap = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
  const rawPath = path.join(SCREENSHOT_DIR, `_raw_${filename}`);
  fs.writeFileSync(rawPath, Buffer.from(fullCap.data, 'base64'));

  // 4. Crop via Python PIL
  const outPath = path.join(SCREENSHOT_DIR, filename);
  try {
    execSync(`python3 "${CROP_UTIL}" "${rawPath}" "${outPath}" ${rect.x} ${rect.y} ${rect.width} ${rect.height} 2 mobile`);
    if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
    return outPath;
  } catch (err) {
    console.error(`Crop failed for ${filename}:`, err.message);
    if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
    throw err;
  }
}

const adminSession = {
  role: 'admin',
  name: 'Administrator',
  title: 'Operational Admin',
  region: 'Semua Region',
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

async function openPage(ws, role, width, height, theme = 'dark', hash = '#dashboard') {
  await setViewport(ws, width, height);
  const sessionObj = role === 'admin' ? adminSession : salesSession;
  const pageUrl = role === 'admin'
    ? `http://127.0.0.1:${HTTP_PORT}/admin.html?demo=1&role=admin${hash}`
    : `http://127.0.0.1:${HTTP_PORT}/sales.html?demo=1&role=sales&sales=aru${hash}`;

  await sendCommand(ws, 'Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/index.html` });
  await sleep(300);

  await evalScript(ws, `
    localStorage.setItem('fade_showcase_session_v021', JSON.stringify(${JSON.stringify(sessionObj)}));
    localStorage.setItem('fade_showcase_theme_v02', '${theme}');
    if (window.FADE_STORE) {
      window.FADE_STORE.setActiveSession(${JSON.stringify(sessionObj)});
      window.FADE_STORE.setTheme('${theme}');
    }
  `);

  await sendCommand(ws, 'Page.navigate', { url: pageUrl });
  await sleep(800);

  // Apply theme class to documentElement immediately
  await evalScript(ws, `
    if ('${theme}' === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  `);

  // Wait for chart ready
  await evalScript(ws, `
    new Promise((resolve) => {
      var check = () => {
        if (window.FADE_TREND_CHART && window.FADE_TREND_CHART.points && window.FADE_TREND_CHART.points.length > 0) {
          resolve(true);
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    })
  `);
  await evalScript(ws, `
    window.scrollTo(0, 0);
  `);
  await sleep(400);
}

async function auditCurrentState(ws) {
  return await evalScript(ws, `
    (function() {
      var card = document.getElementById('trendChartCard');
      var container = document.getElementById('chartInteractiveContainer');
      var tip = document.getElementById('chartTooltip');
      var chart = window.FADE_TREND_CHART;

      var cardR = card ? card.getBoundingClientRect() : null;
      var contR = container ? container.getBoundingClientRect() : null;
      var isTipVisible = tip && !tip.classList.contains('hidden') && window.getComputedStyle(tip).display !== 'none';
      var tipR = isTipVisible ? tip.getBoundingClientRect() : null;
      var isDocked = tip ? tip.classList.contains('mobile-docked') : false;

      // X Axis labels
      var xLabels = Array.from(document.querySelectorAll('#chartXAxisLabels text')).map(function(t) {
        var r = t.getBoundingClientRect();
        return { text: t.textContent.trim(), x: r.x, width: r.width, left: r.left, right: r.right };
      });

      // Check collision between adjacent X labels (< 3px gap)
      var xCollisions = [];
      for (var i = 0; i < xLabels.length - 1; i++) {
        var gap = xLabels[i+1].left - xLabels[i].right;
        if (gap < 3) {
          xCollisions.push({
            pair: xLabels[i].text + ' vs ' + xLabels[i+1].text,
            gap: gap
          });
        }
      }

      // Check active point & active indicator
      var activeIdx = chart ? chart.activePointIndex : null;
      var activePoint = (chart && chart.points && activeIdx != null) ? chart.points[activeIdx] : null;

      // Tooltip overlap with active data point / line curve / bar
      var tipOverlapsPlot = false;
      var tipOverlapsActivePoint = false;
      var tooltipWithinChart = false;
      if (tipR && contR && chart && chart.BOUNDS) {
        tooltipWithinChart = tipR.left >= contR.left - 1 && tipR.right <= contR.right + 1 &&
          tipR.top >= contR.top - 1 && tipR.bottom <= contR.bottom + 1;
        // Plot area vertical span
        var plotTop = contR.top + (chart.BOUNDS.yMin * (contR.height / chart.BOUNDS.viewBoxHeight));
        var plotBottom = contR.top + (chart.BOUNDS.yMax * (contR.height / chart.BOUNDS.viewBoxHeight));

        // Tooltip overlaps plot if its bottom extends below plotTop + 2px
        if (tipR.bottom > plotTop + 2 && tipR.top < plotBottom) {
          tipOverlapsPlot = true;
        }

        // Tooltip overlaps active point coordinate
        if (activePoint) {
          var ptScreenX = contR.left + (activePoint.x * (contR.width / chart.BOUNDS.viewBoxWidth));
          var ptScreenY = contR.top + (activePoint.y * (contR.height / chart.BOUNDS.viewBoxHeight));
          if (ptScreenX >= tipR.left - 4 && ptScreenX <= tipR.right + 4 &&
              ptScreenY >= tipR.top - 4 && ptScreenY <= tipR.bottom + 4) {
            tipOverlapsActivePoint = true;
          }
        }
      }

      // Tooltip values
      var tipDate = document.getElementById('chartTooltipHtmlDate');
      var tipVal = document.getElementById('chartTooltipHtmlVal');
      var tipSubVal = document.getElementById('chartTooltipSubVal');

      return {
        cardWidth: cardR ? Math.round(cardR.width) : 0,
        containerWidth: contR ? Math.round(contR.width) : 0,
        containerHeight: contR ? Math.round(contR.height) : 0,
        chartType: chart ? chart.chartType : 'unknown',
        timeframe: chart ? chart.activeTimeframe : 'unknown',
        activeIdx: activeIdx,
        pointsCount: chart && chart.points ? chart.points.length : 0,
        bounds: chart ? chart.BOUNDS : null,
        isMobile: chart && chart.BOUNDS ? chart.BOUNDS.isMobile : false,
        isDocked: isDocked,
        isTipVisible: isTipVisible,
        tooltip: tipR ? {
          left: Math.round(tipR.left),
          top: Math.round(tipR.top),
          width: Math.round(tipR.width),
          height: Math.round(tipR.height),
          overlapsPlot: tipOverlapsPlot,
          overlapsActivePoint: tipOverlapsActivePoint,
          withinChart: tooltipWithinChart,
          dateText: tipDate ? tipDate.textContent.trim() : '',
          valText: tipVal ? tipVal.textContent.trim() : '',
          subValText: tipSubVal ? tipSubVal.textContent.trim() : ''
        } : null,
        xLabelsCount: xLabels.length,
        xCollisions: xCollisions,
        hasHorizontalOverflow: (document.documentElement.scrollWidth - document.documentElement.clientWidth) > 1,
        overflowDetails: Array.from(document.querySelectorAll('body *')).map(function (el) {
          var r = el.getBoundingClientRect();
          return { tag: el.tagName, id: el.id || '', className: typeof el.className === 'string' ? el.className.slice(0, 90) : '', right: Math.round(r.right * 10) / 10, width: Math.round(r.width * 10) / 10 };
        }).filter(function (r) { return r.width > 0 && r.right > window.innerWidth + 1; }).slice(0, 12)
      };
    })()
  `);
}

async function selectPoint(ws, idx) {
  await evalScript(ws, `
    if (window.FADE_TREND_CHART) {
      window.FADE_TREND_CHART.selectPoint(${idx});
    }
  `);
  await sleep(150);
}

async function dismissViaTapOutside(ws) {
  await evalScript(ws, `
    var evt = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(evt);
  `);
  await sleep(100);
}

async function dismissViaEsc(ws) {
  await evalScript(ws, `
    var evt = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true });
    document.dispatchEvent(evt);
  `);
  await sleep(100);
}

async function dismissViaCloseBtn(ws) {
  await evalScript(ws, `
    var btn = document.getElementById('chartTooltipCloseBtn');
    if (btn) btn.click();
  `);
  await sleep(100);
}

async function dismissViaNav(ws) {
  await evalScript(ws, `
    window.location.hash = '#invoices';
  `);
  await sleep(150);
}

async function run() {
  console.log('=== STARTING MOBILE CHART READABILITY REFINEMENT VERIFICATION ===');
  const server = await startHttpServer();

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--disable-background-networking',
    `--user-data-dir=/tmp/fade_mobile_chart_verify_${Date.now()}`
  ]);

  let ws = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      const data = await res.json();
      if (data && data.length > 0 && data[0].webSocketDebuggerUrl) {
        const WebSocket = global.WebSocket || require('ws');
        ws = new WebSocket(data[0].webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          ws.onopen = resolve;
          ws.onerror = reject;
        });
        break;
      }
    } catch (e) {
      await sleep(300);
    }
  }

  if (!ws) {
    console.error('Failed to connect to Chrome CDP.');
    server.close();
    chromeProc.kill();
    process.exit(1);
  }

  const consoleErrors = [];
  await sendCommand(ws, 'Page.enable');
  await sendCommand(ws, 'DOM.enable');
  await sendCommand(ws, 'Runtime.enable');
  ws.addEventListener('message', (evt) => {
    const data = JSON.parse(evt.data);
    if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
      consoleErrors.push(data.params.args.map(a => a.value || a.description).join(' '));
    }
  });

  const viewports = [
    { name: '390', w: 390, h: 844 },
    { name: '375', w: 375, h: 812 },
    { name: '430', w: 430, h: 932 },
    { name: '834', w: 834, h: 1194 },
    { name: '1440', w: 1440, h: 900 }
  ];

  const results = [];
  const responsiveTransitions = [];
  let totalAssertions = 0;
  let passedAssertions = 0;
  let failedAssertions = 0;

  function assert(condition, message) {
    totalAssertions++;
    if (condition) {
      passedAssertions++;
      return true;
    } else {
      failedAssertions++;
      console.error(`  [FAIL] ${message}`);
      return false;
    }
  }

  for (const vp of viewports) {
    console.log(`\n========================================`);
    console.log(`TESTING VIEWPORT: ${vp.w}x${vp.h} (${vp.name})`);
    console.log(`========================================`);

    const isMobile = vp.w < 768;

    for (const role of ['admin', 'sales']) {
      for (const theme of ['dark', 'light']) {
        const cfgKey = `${role}_${vp.name}_${theme}`;
        console.log(`\n--- Auditing: ${cfgKey} ---`);
        await openPage(ws, role, vp.w, vp.h, theme, '#dashboard');

        // 1. Initial Line 30D (Before Touch)
        const auditUntouched = await auditCurrentState(ws);
        assert(!auditUntouched.hasHorizontalOverflow, `${cfgKey} no horizontal overflow${auditUntouched.overflowDetails.length ? ': ' + JSON.stringify(auditUntouched.overflowDetails) : ''}`);
        assert(auditUntouched.xCollisions.length === 0, `${cfgKey} X-axis collision count === 0`);

        if (isMobile) {
          assert(auditUntouched.isMobile === true, `${cfgKey} chart bounds marks isMobile: true`);
          assert(auditUntouched.bounds.yMin === 48, `${cfgKey} chart bounds top margin yMin === 48`);
          assert(auditUntouched.bounds.xMin === 44, `${cfgKey} chart bounds Y-axis space xMin === 44`);
        } else {
          assert(auditUntouched.isMobile === false, `${cfgKey} desktop chart bounds marks isMobile: false`);
          assert(auditUntouched.bounds.yMin === 22, `${cfgKey} desktop chart bounds top margin yMin === 22`);
          assert(auditUntouched.bounds.xMin === 64, `${cfgKey} desktop chart bounds Y-axis space xMin === 64`);
        }

        const shotUntouched = `improved_${role}_line_30d_${vp.name}_${theme}_untouched.png`;
        await captureElementScreenshot(ws, shotUntouched);

        // 2. Select Point 0 (First Point Touch)
        await selectPoint(ws, 0);
        const auditPoint0 = await auditCurrentState(ws);
        assert(auditPoint0.isTipVisible === true, `${cfgKey} point 0 tooltip visible`);
        assert(auditPoint0.tooltip.withinChart === true, `${cfgKey} point 0 tooltip within chart`);
        assert(auditPoint0.tooltip.overlapsActivePoint === false, `${cfgKey} point 0 tooltip does not cover active point`);
        if (isMobile) {
          assert(auditPoint0.isDocked === true, `${cfgKey} point 0 tooltip isDocked: true`);
          assert(auditPoint0.tooltip.overlapsPlot === false, `${cfgKey} point 0 overlapsPlot: false`);
          assert(auditPoint0.tooltip.overlapsActivePoint === false, `${cfgKey} point 0 overlapsActivePoint: false`);
        } else {
          assert(auditPoint0.isDocked === false, `${cfgKey} desktop point 0 isDocked: false`);
        }
        const shotPoint0 = `improved_${role}_line_30d_${vp.name}_${theme}_point0.png`;
        await captureElementScreenshot(ws, shotPoint0);

        // 3. Select Point Middle (Middle Touch)
        const midIdx = Math.floor(auditUntouched.pointsCount / 2);
        await selectPoint(ws, midIdx);
        const auditPointMid = await auditCurrentState(ws);
        assert(auditPointMid.isTipVisible === true, `${cfgKey} point mid tooltip visible`);
        assert(auditPointMid.tooltip.withinChart === true, `${cfgKey} point mid tooltip within chart`);
        assert(auditPointMid.tooltip.overlapsActivePoint === false, `${cfgKey} point mid tooltip does not cover active point`);
        if (isMobile) {
          assert(auditPointMid.isDocked === true, `${cfgKey} point mid tooltip isDocked: true`);
          assert(auditPointMid.tooltip.overlapsPlot === false, `${cfgKey} point mid overlapsPlot: false`);
          assert(auditPointMid.tooltip.overlapsActivePoint === false, `${cfgKey} point mid overlapsActivePoint: false`);
        } else {
          assert(auditPointMid.isDocked === false, `${cfgKey} desktop point mid isDocked: false`);
        }
        const shotPointMid = `improved_${role}_line_30d_${vp.name}_${theme}_point_mid.png`;
        await captureElementScreenshot(ws, shotPointMid);

        // 4. Select Point Last (Last Point Touch)
        await selectPoint(ws, auditUntouched.pointsCount - 1);
        const auditPointLast = await auditCurrentState(ws);
        assert(auditPointLast.isTipVisible === true, `${cfgKey} point last tooltip visible`);
        assert(auditPointLast.tooltip.withinChart === true, `${cfgKey} point last tooltip within chart`);
        assert(auditPointLast.tooltip.overlapsActivePoint === false, `${cfgKey} point last tooltip does not cover active point`);
        if (isMobile) {
          assert(auditPointLast.isDocked === true, `${cfgKey} point last tooltip isDocked: true`);
          assert(auditPointLast.tooltip.overlapsPlot === false, `${cfgKey} point last overlapsPlot: false`);
          assert(auditPointLast.tooltip.overlapsActivePoint === false, `${cfgKey} point last overlapsActivePoint: false`);
        } else {
          assert(auditPointLast.isDocked === false, `${cfgKey} desktop point last isDocked: false`);
        }
        const shotPointLast = `improved_${role}_line_30d_${vp.name}_${theme}_point_last.png`;
        await captureElementScreenshot(ws, shotPointLast);

        // 5. Switch to Bar Mode 30D
        await evalScript(ws, `window.FADE_TREND_CHART.setChartType('bar')`);
        await sleep(150);
        await selectPoint(ws, midIdx);
        const auditBarMid = await auditCurrentState(ws);
        assert(auditBarMid.isTipVisible === true, `${cfgKey} bar mid tooltip visible`);
        assert(auditBarMid.tooltip.withinChart === true, `${cfgKey} bar mid tooltip within chart`);
        assert(auditBarMid.tooltip.overlapsActivePoint === false, `${cfgKey} bar mid tooltip does not cover active point`);
        if (isMobile) {
          assert(auditBarMid.isDocked === true, `${cfgKey} bar mid tooltip isDocked: true`);
          assert(auditBarMid.tooltip.overlapsPlot === false, `${cfgKey} bar mid overlapsPlot: false`);
          assert(auditBarMid.tooltip.overlapsActivePoint === false, `${cfgKey} bar mid overlapsActivePoint: false`);
        } else {
          assert(auditBarMid.isDocked === false, `${cfgKey} desktop bar mid isDocked: false`);
        }
        const shotBarMid = `improved_${role}_bar_30d_${vp.name}_${theme}_point_mid.png`;
        await captureElementScreenshot(ws, shotBarMid);

        // 6. Test 7D and 90D on 390 viewport
        if (vp.name === '390') {
          // 7D Line & Bar
          await evalScript(ws, `window.FADE_TREND_CHART.setTimeframe('7D'); window.FADE_TREND_CHART.setChartType('line');`);
          await sleep(150);
          await selectPoint(ws, 3);
          const audit7DLine = await auditCurrentState(ws);
          assert(audit7DLine.tooltip.overlapsPlot === false, `${cfgKey} 7D Line overlapsPlot: false`);
          await captureElementScreenshot(ws, `improved_${role}_line_7d_390_${theme}.png`);

          await evalScript(ws, `window.FADE_TREND_CHART.setChartType('bar');`);
          await sleep(150);
          await selectPoint(ws, 3);
          const audit7DBar = await auditCurrentState(ws);
          assert(audit7DBar.tooltip.overlapsPlot === false, `${cfgKey} 7D Bar overlapsPlot: false`);
          await captureElementScreenshot(ws, `improved_${role}_bar_7d_390_${theme}.png`);

          // 90D Line & Bar
          await evalScript(ws, `window.FADE_TREND_CHART.setTimeframe('90D'); window.FADE_TREND_CHART.setChartType('line');`);
          await sleep(150);
          await selectPoint(ws, 5);
          const audit90DLine = await auditCurrentState(ws);
          assert(audit90DLine.tooltip.overlapsPlot === false, `${cfgKey} 90D Line overlapsPlot: false`);
          await captureElementScreenshot(ws, `improved_${role}_line_90d_390_${theme}.png`);

          await evalScript(ws, `window.FADE_TREND_CHART.setChartType('bar');`);
          await sleep(150);
          await selectPoint(ws, 5);
          const audit90DBar = await auditCurrentState(ws);
          assert(audit90DBar.tooltip.overlapsPlot === false, `${cfgKey} 90D Bar overlapsPlot: false`);
          await captureElementScreenshot(ws, `improved_${role}_bar_90d_390_${theme}.png`);
        }

        // 7. Test Dismissal on mid point (tap outside, ESC, close button, hash navigation)
        if (vp.name === '390' && theme === 'dark') {
          // Test A: Tap outside
          await selectPoint(ws, midIdx);
          await dismissViaTapOutside(ws);
          const afterTapOutside = await auditCurrentState(ws);
          assert(afterTapOutside.isTipVisible === false, `${cfgKey} dismissal via outside tap works`);

          // Test B: ESC key
          await selectPoint(ws, midIdx);
          await dismissViaEsc(ws);
          const afterEsc = await auditCurrentState(ws);
          assert(afterEsc.isTipVisible === false, `${cfgKey} dismissal via ESC key works`);

          // Test C: Close button
          await selectPoint(ws, midIdx);
          await dismissViaCloseBtn(ws);
          const afterCloseBtn = await auditCurrentState(ws);
          assert(afterCloseBtn.isTipVisible === false, `${cfgKey} dismissal via close button works`);

          // Test D: Hash navigation
          await selectPoint(ws, midIdx);
          await dismissViaNav(ws);
          const afterNav = await auditCurrentState(ws);
          assert(afterNav.isTipVisible === false, `${cfgKey} dismissal via hash navigation works`);
          await evalScript(ws, `window.location.hash = '#dashboard';`);
          await sleep(150);
        }

        if (vp.name === '390' && theme === 'dark') {
          await evalScript(ws, `window.FADE_TREND_CHART.setChartType('line'); window.FADE_TREND_CHART.setTimeframe('30D');`);
          await sleep(150);
          const resizePointIdx = Math.floor(auditUntouched.pointsCount / 2);
          await selectPoint(ws, resizePointIdx);

          await setViewport(ws, 667, 375); // Mobile landscape, still below the mobile breakpoint.
          await sleep(400);
          const landscapeMobile = await auditCurrentState(ws);
          assert(!landscapeMobile.hasHorizontalOverflow, `${cfgKey} 667x375 landscape no horizontal overflow`);
          assert(landscapeMobile.xCollisions.length === 0, `${cfgKey} 667x375 landscape X-axis labels do not collide`);
          assert(landscapeMobile.isMobile === true, `${cfgKey} 667x375 stays in mobile chart layout`);
          assert(landscapeMobile.tooltip.withinChart === true, `${cfgKey} 667x375 tooltip stays within chart`);
          assert(landscapeMobile.tooltip.overlapsPlot === false, `${cfgKey} 667x375 tooltip does not cover plot`);
          assert(landscapeMobile.tooltip.overlapsActivePoint === false, `${cfgKey} 667x375 tooltip does not cover active point`);

          await setViewport(ws, 844, 390); // Tablet landscape crosses to the desktop shell.
          await sleep(400);
          const landscapeTablet = await auditCurrentState(ws);
          assert(!landscapeTablet.hasHorizontalOverflow, `${cfgKey} 844x390 landscape no horizontal overflow`);
          assert(landscapeTablet.xCollisions.length === 0, `${cfgKey} 844x390 landscape X-axis labels do not collide`);
          assert(landscapeTablet.isMobile === false, `${cfgKey} 844x390 uses the >=768 layout`);
          assert(landscapeTablet.tooltip.withinChart === true, `${cfgKey} 844x390 tooltip stays within chart`);
          assert(landscapeTablet.tooltip.overlapsActivePoint === false, `${cfgKey} 844x390 tooltip does not cover active point`);

          await setViewport(ws, 390, 844); // Restore portrait and verify the chart reflows back.
          await sleep(400);
          const restoredPortrait = await auditCurrentState(ws);
          assert(!restoredPortrait.hasHorizontalOverflow, `${cfgKey} restored 390x844 no horizontal overflow`);
          assert(restoredPortrait.xCollisions.length === 0, `${cfgKey} restored 390x844 X-axis labels do not collide`);
          assert(restoredPortrait.isMobile === true, `${cfgKey} restored 390x844 mobile chart layout`);
          assert(restoredPortrait.tooltip.withinChart === true, `${cfgKey} restored 390x844 tooltip stays within chart`);
          assert(restoredPortrait.tooltip.overlapsPlot === false, `${cfgKey} restored 390x844 tooltip does not cover plot`);
          assert(restoredPortrait.tooltip.overlapsActivePoint === false, `${cfgKey} restored 390x844 tooltip does not cover active point`);
          responsiveTransitions.push({
            role,
            theme,
            from: '390x844',
            states: [
              { viewport: '667x375', horizontalOverflow: landscapeMobile.hasHorizontalOverflow, xAxisCollisions: landscapeMobile.xCollisions.length, isMobile: landscapeMobile.isMobile, tooltipWithinChart: landscapeMobile.tooltip.withinChart, tooltipOverlapsPlot: landscapeMobile.tooltip.overlapsPlot, tooltipOverlapsActivePoint: landscapeMobile.tooltip.overlapsActivePoint },
              { viewport: '844x390', horizontalOverflow: landscapeTablet.hasHorizontalOverflow, xAxisCollisions: landscapeTablet.xCollisions.length, isMobile: landscapeTablet.isMobile, tooltipWithinChart: landscapeTablet.tooltip.withinChart, tooltipOverlapsActivePoint: landscapeTablet.tooltip.overlapsActivePoint },
              { viewport: '390x844 restored', horizontalOverflow: restoredPortrait.hasHorizontalOverflow, xAxisCollisions: restoredPortrait.xCollisions.length, isMobile: restoredPortrait.isMobile, tooltipWithinChart: restoredPortrait.tooltip.withinChart, tooltipOverlapsPlot: restoredPortrait.tooltip.overlapsPlot, tooltipOverlapsActivePoint: restoredPortrait.tooltip.overlapsActivePoint }
            ]
          });
          await evalScript(ws, `window.FADE_TREND_CHART.dismissTooltip();`);
        }

        results.push({
          cfgKey,
          viewport: `${vp.w}x${vp.h}`,
          role,
          theme,
          pointsCount: auditUntouched.pointsCount,
          isMobile,
          overlapsPlotPoint0: auditPoint0.tooltip ? auditPoint0.tooltip.overlapsPlot : false,
          overlapsPlotMid: auditPointMid.tooltip ? auditPointMid.tooltip.overlapsPlot : false,
          overlapsPlotLast: auditPointLast.tooltip ? auditPointLast.tooltip.overlapsPlot : false,
          overlapsPlotBarMid: auditBarMid.tooltip ? auditBarMid.tooltip.overlapsPlot : false
        });
      }
    }
  }

  // Console error assertion
  assert(consoleErrors.length === 0, `Zero console errors during testing (found: ${consoleErrors.length})`);
  if (consoleErrors.length > 0) {
    console.error('Console errors:', consoleErrors);
  }

  const reportPath = path.join(BASE_DIR, 'docs', 'mobile_chart_verification_results.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalAssertions,
    passedAssertions,
    failedAssertions,
    consoleErrors,
    results,
    responsiveTransitions
  }, null, 2));

  console.log('\n========================================');
  console.log('VERIFICATION COMPLETE');
  console.log(`Total Assertions:  ${totalAssertions}`);
  console.log(`Passed Assertions: ${passedAssertions}`);
  console.log(`Failed Assertions: ${failedAssertions}`);
  console.log(`Console Errors:    ${consoleErrors.length}`);
  console.log(`Report written to: ${reportPath}`);
  console.log('========================================\n');

  await sleep(500);
  server.close();
  chromeProc.kill('SIGKILL');

  if (failedAssertions > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});
