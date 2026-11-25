/**
 * Baseline Audit & Reproduction Script for FADE Pods Showcase v0.2
 * Mobile Chart Readability (Tahap 1)
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9910 + Math.floor(Math.random() * 20);
const HTTP_PORT = 8170 + Math.floor(Math.random() * 20);
const BASE_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(BASE_DIR, 'docs', 'screenshots', 'mobile_chart_baseline');
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

let currentVpWidth = 390;
let currentVpHeight = 844;

async function setViewport(ws, width, height) {
  currentVpWidth = width;
  currentVpHeight = height;
  await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: width < 768
  });
  await sendCommand(ws, 'Emulation.setVisibleSize', { width, height });
}

async function captureElementScreenshot(ws, filename, selector = '#trendChartCard') {
  // 1. Scroll element into view with generous top offset
  await evalScript(ws, `
    (function() {
      var el = document.querySelector('${selector}');
      if (el) {
        var r = el.getBoundingClientRect();
        window.scrollBy({ top: r.top - 16, behavior: 'instant' });
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
    fs.unlinkSync(rawPath);
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
  await sleep(200);
}

async function auditCurrentChart(ws) {
  return await evalScript(ws, `
    (function() {
      var card = document.getElementById('trendChartCard');
      var container = document.getElementById('chartInteractiveContainer');
      var svg = document.getElementById('trendChartSvg');
      var tip = document.getElementById('chartTooltip');
      var chart = window.FADE_TREND_CHART;
      
      var cardR = card ? card.getBoundingClientRect() : null;
      var contR = container ? container.getBoundingClientRect() : null;
      var tipR = (tip && !tip.classList.contains('hidden') && window.getComputedStyle(tip).display !== 'none') ? tip.getBoundingClientRect() : null;

      // X Axis labels
      var xLabels = Array.from(document.querySelectorAll('#chartXAxisLabels text')).map(function(t) {
        var r = t.getBoundingClientRect();
        return { text: t.textContent.trim(), x: r.x, width: r.width, left: r.left, right: r.right };
      });

      // Check collision between adjacent X labels (< 6px gap)
      var xCollisions = [];
      for (var i = 0; i < xLabels.length - 1; i++) {
        var gap = xLabels[i+1].left - xLabels[i].right;
        if (gap < 4) {
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
      if (tipR && contR) {
        // Plot area vertical span
        var plotTop = contR.top + (chart.BOUNDS.yMin * (contR.height / chart.BOUNDS.viewBoxHeight));
        var plotBottom = contR.top + (chart.BOUNDS.yMax * (contR.height / chart.BOUNDS.viewBoxHeight));
        
        // Check if tooltip vertical range intersects main plot area
        if (tipR.bottom > plotTop && tipR.top < plotBottom) {
          tipOverlapsPlot = true;
        }

        // Check if tooltip covers the active point coordinate
        if (activePoint) {
          var ptScreenX = contR.left + (activePoint.x * (contR.width / chart.BOUNDS.viewBoxWidth));
          var ptScreenY = contR.top + (activePoint.y * (contR.height / chart.BOUNDS.viewBoxHeight));
          if (ptScreenX >= tipR.left - 6 && ptScreenX <= tipR.right + 6 &&
              ptScreenY >= tipR.top - 6 && ptScreenY <= tipR.bottom + 6) {
            tipOverlapsActivePoint = true;
          }
        }
      }

      // Header controls overflow or wrap
      var typeGroup = document.getElementById('chartTypeGroup');
      var tfGroup = document.getElementById('chartTimeframeGroup');
      var headerRow = typeGroup ? typeGroup.parentElement : null;

      return {
        cardWidth: cardR ? Math.round(cardR.width) : 0,
        containerWidth: contR ? Math.round(contR.width) : 0,
        containerHeight: contR ? Math.round(contR.height) : 0,
        chartType: chart ? chart.chartType : 'unknown',
        timeframe: chart ? chart.activeTimeframe : 'unknown',
        activeIdx: activeIdx,
        pointsCount: chart && chart.points ? chart.points.length : 0,
        bounds: chart ? chart.BOUNDS : null,
        tooltip: tipR ? {
          left: Math.round(tipR.left),
          top: Math.round(tipR.top),
          width: Math.round(tipR.width),
          height: Math.round(tipR.height),
          overlapsPlot: tipOverlapsPlot,
          overlapsActivePoint: tipOverlapsActivePoint
        } : null,
        xLabelsCount: xLabels.length,
        xCollisions: xCollisions,
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    })()
  `);
}

async function run() {
  console.log('=== STARTING AUDIT & REPRODUCTION OF MOBILE CHART READABILITY ===');
  const server = await startHttpServer();

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--disable-background-networking',
    `--user-data-dir=/tmp/fade_mobile_chart_audit_${Date.now()}`
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

  await sendCommand(ws, 'Page.enable');
  await sendCommand(ws, 'DOM.enable');
  await sendCommand(ws, 'Runtime.enable');

  const baselineAuditResults = {};

  try {
    const viewports = [
      { name: '375', w: 375, h: 812 },
      { name: '390', w: 390, h: 844 },
      { name: '430', w: 430, h: 932 },
      { name: '834', w: 834, h: 1194 }
    ];

    const roles = ['admin', 'sales'];
    const themes = ['dark', 'light'];

    for (const vp of viewports) {
      for (const role of roles) {
        for (const theme of themes) {
          const cfgKey = `${role}_${vp.name}_${theme}`;
          console.log(`\n--- Auditing: ${cfgKey} ---`);
          await openPage(ws, role, vp.w, vp.h, theme, '#dashboard');

          // 1. Initial Line 30D (Before Touch)
          const auditUntouched = await auditCurrentChart(ws);
          console.log(`Untouched 30D Line: cardW=${auditUntouched.cardWidth}, xLabels=${auditUntouched.xLabelsCount}, collisions=${auditUntouched.xCollisions.length}`);
          const shotUntouched = `baseline_${role}_line_30d_${vp.name}_${theme}_untouched.png`;
          await captureElementScreenshot(ws, shotUntouched);

          // 2. Select Point 0 (First Point Touch)
          await evalScript(ws, `window.FADE_TREND_CHART.selectPoint(0)`);
          await sleep(150);
          const auditPoint0 = await auditCurrentChart(ws);
          console.log(`Point 0 Line: tipOverlapsPlot=${auditPoint0.tooltip?.overlapsPlot}, tipOverlapsActivePoint=${auditPoint0.tooltip?.overlapsActivePoint}`);
          const shotPoint0 = `baseline_${role}_line_30d_${vp.name}_${theme}_point0.png`;
          await captureElementScreenshot(ws, shotPoint0);

          // 3. Select Point Middle (Middle Touch)
          const midIdx = Math.floor(auditUntouched.pointsCount / 2);
          await evalScript(ws, `window.FADE_TREND_CHART.selectPoint(${midIdx})`);
          await sleep(150);
          const auditPointMid = await auditCurrentChart(ws);
          console.log(`Point Mid Line: tipOverlapsPlot=${auditPointMid.tooltip?.overlapsPlot}, tipOverlapsActivePoint=${auditPointMid.tooltip?.overlapsActivePoint}`);
          const shotPointMid = `baseline_${role}_line_30d_${vp.name}_${theme}_point_mid.png`;
          await captureElementScreenshot(ws, shotPointMid);

          // 4. Select Point Last (Last Point Touch)
          await evalScript(ws, `window.FADE_TREND_CHART.selectPoint(${auditUntouched.pointsCount - 1})`);
          await sleep(150);
          const auditPointLast = await auditCurrentChart(ws);
          console.log(`Point Last Line: tipOverlapsPlot=${auditPointLast.tooltip?.overlapsPlot}, tipOverlapsActivePoint=${auditPointLast.tooltip?.overlapsActivePoint}`);
          const shotPointLast = `baseline_${role}_line_30d_${vp.name}_${theme}_point_last.png`;
          await captureElementScreenshot(ws, shotPointLast);

          // 5. Switch to Bar Mode 30D
          await evalScript(ws, `window.FADE_TREND_CHART.setChartType('bar')`);
          await sleep(150);
          await evalScript(ws, `window.FADE_TREND_CHART.selectPoint(${midIdx})`);
          await sleep(150);
          const auditBarMid = await auditCurrentChart(ws);
          console.log(`Point Mid Bar: tipOverlapsPlot=${auditBarMid.tooltip?.overlapsPlot}, tipOverlapsActivePoint=${auditBarMid.tooltip?.overlapsActivePoint}`);
          const shotBarMid = `baseline_${role}_bar_30d_${vp.name}_${theme}_point_mid.png`;
          await captureElementScreenshot(ws, shotBarMid);

          // 6. Test 7D and 90D on 390 viewport
          if (vp.name === '390' && theme === 'dark') {
            // 7D Line & Bar
            await evalScript(ws, `window.FADE_TREND_CHART.setTimeframe('7D'); window.FADE_TREND_CHART.setChartType('line');`);
            await sleep(150);
            await captureElementScreenshot(ws, `baseline_${role}_line_7d_390_dark.png`);

            await evalScript(ws, `window.FADE_TREND_CHART.setChartType('bar');`);
            await sleep(150);
            await captureElementScreenshot(ws, `baseline_${role}_bar_7d_390_dark.png`);

            // 90D Line & Bar
            await evalScript(ws, `window.FADE_TREND_CHART.setTimeframe('90D'); window.FADE_TREND_CHART.setChartType('line');`);
            await sleep(150);
            await captureElementScreenshot(ws, `baseline_${role}_line_90d_390_dark.png`);

            await evalScript(ws, `window.FADE_TREND_CHART.setChartType('bar');`);
            await sleep(150);
            await captureElementScreenshot(ws, `baseline_${role}_bar_90d_390_dark.png`);
          }

          baselineAuditResults[cfgKey] = {
            untouched: auditUntouched,
            point0: auditPoint0,
            pointMid: auditPointMid,
            pointLast: auditPointLast,
            barMid: auditBarMid
          };
        }
      }
    }

    fs.writeFileSync(path.join(BASE_DIR, 'docs', 'mobile_chart_baseline_audit.json'), JSON.stringify(baselineAuditResults, null, 2));
    console.log('\n[Baseline Audit Saved to docs/mobile_chart_baseline_audit.json]');
  } catch (err) {
    console.error('Audit encountered error:', err);
  } finally {
    if (ws) ws.close();
    chromeProc.kill('SIGKILL');
    server.close();
  }
}

run();
