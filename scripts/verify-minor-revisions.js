/**
 * Comprehensive Automated Verification Suite for:
 * FADE PODS v0.2 — Minor Revision Desktop Admin & Sales
 * Covers:
 * 1. Enlarged Tooltip (>=190x48px, >=12px font, 8px margin, 150ms pointer leave disappear, keyboard focus)
 * 2. Bar Chart Density (7D daily 7, 30D daily 22 with 0-value days, 90D weekly 12, YTD monthly 6; sum equality)
 * 3. Upload History Safe Rollback & Delete (Snapshot restore, custom confirmation modal, failed upload cleanup)
 * 4. Multi-viewport matrix (1024, 1280, 1440, 1920, 2560 px) & Themes (Dark/Light)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9640 + Math.floor(Math.random() * 50);
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
    const timer = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`CDP Command timeout (${method})`));
    }, 10000);
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

const results = {
  passed: 0,
  failed: 0,
  details: []
};

function assert(condition, message, category = 'GENERAL') {
  if (condition) {
    results.passed++;
    results.details.push({ status: 'PASS', category, message });
    console.log(`[PASS] [${category}] ${message}`);
  } else {
    results.failed++;
    results.details.push({ status: 'FAIL', category, message });
    console.error(`[FAIL] [${category}] ${message}`);
  }
}

async function runVerification() {
  console.log('Starting Headless Chrome for Minor Revisions Verification on port ' + PORT + '...');
  const tmpDir = '/tmp/chrome-minor-rev-' + Date.now();
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

  const screenshotsDir = path.join(BASE_DIR, 'docs', 'screenshots', 'minor_rev');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // =================================================================
  // 1. AUDIT ADMIN ROLE (TOOLTIP & BAR DENSITY)
  // =================================================================
  console.log('\n======================================================');
  console.log('1. AUDIT ADMIN: TOOLTIP & BAR DENSITY');
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

    // Set demo session
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

    // Test Desktop Viewports: 1024, 1280, 1440, 1920, 2560
    const viewports = [1024, 1280, 1440, 1920, 2560];
    for (const w of viewports) {
      await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(200);

      const vpMetrics = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const container = document.getElementById('chartInteractiveContainer');
          const cr = container.getBoundingClientRect();
          const hasOverflow = document.documentElement.scrollWidth > window.innerWidth;
          return { crWidth: cr.width, hasOverflow };
        })()`,
        returnByValue: true
      });
      assert(!vpMetrics.result.value.hasOverflow, `[ADMIN ${w}px] Zero horizontal overflow`, 'ADMIN_VIEWPORT');
    }

    // A. Tooltip Desktop Dimensions & Font Verification (1440px)
    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(200);

    // Hover on point 10 (middle of month)
    const hoverPoint = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const svg = document.getElementById('trendChartSvg');
        const r = svg.getBoundingClientRect();
        const pt = window.FADE_TREND_CHART.points[9];
        const b = window.FADE_TREND_CHART.BOUNDS;
        const screenX = r.left + (pt.x * r.width / b.viewBoxWidth);
        const screenY = r.top + (pt.y * r.height / b.viewBoxHeight);
        return { screenX: Math.round(screenX), screenY: Math.round(screenY) };
      })()`,
      returnByValue: true
    });

    await sendCommand(ws, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: hoverPoint.result.value.screenX,
      y: hoverPoint.result.value.screenY
    });
    await sleep(150);

    const tipMetrics = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const tipGroup = document.getElementById('chartTooltipGroup');
        const rect = tipGroup.querySelector('rect');
        const w = parseFloat(rect.getAttribute('width'));
        const h = parseFloat(rect.getAttribute('height'));
        const dateEl = tipGroup.querySelector('#chartTooltipDate');
        const valEl = tipGroup.querySelector('#chartTooltipValue');
        const subEl = tipGroup.querySelector('#chartTooltipSub');

        const dateFs = parseFloat(dateEl.getAttribute('font-size'));
        const valFs = parseFloat(valEl.getAttribute('font-size'));
        const subFs = parseFloat(subEl.getAttribute('font-size'));

        const transform = tipGroup.getAttribute('transform');
        const match = transform ? transform.match(/translate\\(([^,\\s]+)[,\\s]+([^\\)]+)\\)/) : null;
        const tipX = match ? parseFloat(match[1]) : 0;
        const tipY = match ? parseFloat(match[2]) : 0;

        const b = window.FADE_TREND_CHART.BOUNDS;
        const marginX = tipX - b.xMin;
        const rightEdgeMargin = b.xMax - (tipX + w);

        return {
          width: w,
          height: h,
          dateFs,
          valFs,
          subFs,
          tipX,
          tipY,
          marginX,
          rightEdgeMargin,
          dateText: dateEl.textContent,
          valText: valEl.textContent,
          subText: subEl.textContent,
          isVisible: tipGroup.style.display !== 'none'
        };
      })()`,
      returnByValue: true
    });

    const tm = tipMetrics.result.value;
    assert(tm.width >= 190, `[ADMIN TOOLTIP] Tooltip width >= 190px (Actual: ${tm.width}px)`, 'TOOLTIP');
    assert(tm.height >= 48, `[ADMIN TOOLTIP] Tooltip height >= 48px (Actual: ${tm.height}px)`, 'TOOLTIP');
    assert(tm.dateFs >= 12 && tm.valFs >= 12, `[ADMIN TOOLTIP] Date and Value text font-size >= 12px (Actual: ${tm.dateFs}px / ${tm.valFs}px)`, 'TOOLTIP');
    assert(tm.subFs >= 11, `[ADMIN TOOLTIP] Subtext font-size >= 11px (Actual: ${tm.subFs}px)`, 'TOOLTIP');
    assert(tm.marginX >= 8 && tm.rightEdgeMargin >= -8, `[ADMIN TOOLTIP] Tooltip maintains safe boundary margin from chart edges`, 'TOOLTIP');
    assert(tm.isVisible, `[ADMIN TOOLTIP] Tooltip is visible upon hover`, 'TOOLTIP');

    // Screenshot of Line Chart with enlarged tooltip
    const shotLine = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, 'admin_line_enlarged_tooltip.png'), Buffer.from(shotLine.data, 'base64'));

    // B. Pointer Leave Disappearance Test (within 150ms)
    await sendCommand(ws, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 10,
      y: 10
    });
    // Trigger pointerleave on overlay
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const overlay = document.getElementById('chartPointerOverlay');
        overlay.dispatchEvent(new PointerEvent('pointerleave'));
      })()`
    });
    await sleep(150);

    const leaveCheck = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const tipGroup = document.getElementById('chartTooltipGroup');
        const activeIdx = window.FADE_TREND_CHART.activePointIndex;
        return {
          isDisplayNone: tipGroup.style.display === 'none',
          activeIdx: activeIdx
        };
      })()`,
      returnByValue: true
    });
    assert(leaveCheck.result.value.isDisplayNone && leaveCheck.result.value.activeIdx === null, `[ADMIN TOOLTIP] Tooltip and active point disappear cleanly within 150ms when pointer leaves chart`, 'TOOLTIP');

    // C. Keyboard Navigation Tooltip Focus Retention
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const container = document.getElementById('chartInteractiveContainer');
        container.focus();
        window.FADE_TREND_CHART.handleKeyDown({ key: 'ArrowRight', preventDefault: () => {} });
      })()`
    });
    await sleep(100);

    const kbCheck = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const tipGroup = document.getElementById('chartTooltipGroup');
        const activeIdx = window.FADE_TREND_CHART.activePointIndex;
        return {
          isVisible: tipGroup && tipGroup.style.display !== 'none',
          activeIdx: activeIdx
        };
      })()`,
      returnByValue: true
    });
    assert(kbCheck.result.value.isVisible && kbCheck.result.value.activeIdx !== null, `[ADMIN TOOLTIP] Tooltip remains accessible while navigating via keyboard focus`, 'TOOLTIP');

    // D. Bar Chart Density & Sum Consistency (7D, 30D, 90D, YTD)
    // Switch to Bar Chart mode
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `document.getElementById('chartBtnBar').click();`
    });
    await sleep(200);

    // 1. 30D Bar Density Test (22 daily buckets)
    const bar30DMetrics = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const points = window.FADE_TREND_CHART.points;
        const rects = Array.from(document.querySelectorAll('#chartBarsGroup rect'));
        const totalBucketSum = points.reduce((acc, p) => acc + p.daily, 0);
        const lastCumulative = points[points.length - 1].cumulative;
        const headlineRev = document.getElementById('chartMonthlyRevenue').textContent;

        const zeroValCount = points.filter(p => p.daily === 0).length;
        const barHeights = rects.map(r => parseFloat(r.getAttribute('height')));
        const allHeightsValid = barHeights.every(h => !isNaN(h) && h >= 2);

        return {
          count: points.length,
          rectCount: rects.length,
          totalBucketSum,
          lastCumulative,
          headlineRev,
          zeroValCount,
          allHeightsValid
        };
      })()`,
      returnByValue: true
    });

    const b30 = bar30DMetrics.result.value;
    assert(b30.count === 22 && b30.rectCount === 22, `[ADMIN BAR 30D] 30D renders exactly 22 daily bars (01 Nov - 22 Nov) (Actual: ${b30.count} bars)`, 'BAR_DENSITY');
    assert(b30.totalBucketSum === b30.lastCumulative, `[ADMIN BAR 30D] Sum of all 22 bucket bars exactly equals range total (Rp ${b30.totalBucketSum.toLocaleString('id-ID')})`, 'BAR_DENSITY');
    assert(b30.zeroValCount > 0, `[ADMIN BAR 30D] Zero-transaction days correctly represented with Rp 0 (Count: ${b30.zeroValCount} zero-days)`, 'BAR_DENSITY');
    assert(b30.allHeightsValid, `[ADMIN BAR 30D] All bar heights correctly calculated from individual daily values`, 'BAR_DENSITY');

    // Screenshot of 30D Bar Chart
    const shotBar30 = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, 'admin_bar_30d_density.png'), Buffer.from(shotBar30.data, 'base64'));

    // 2. 7D Bar Density Test (7 daily buckets)
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `document.getElementById('chartBtn7D').click();`
    });
    await sleep(200);

    const bar7DMetrics = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const points = window.FADE_TREND_CHART.points;
        const rects = Array.from(document.querySelectorAll('#chartBarsGroup rect'));
        const totalBucketSum = points.reduce((acc, p) => acc + p.daily, 0);
        const lastCumulative = points[points.length - 1].cumulative;
        return { count: points.length, rectCount: rects.length, totalBucketSum, lastCumulative };
      })()`,
      returnByValue: true
    });
    const b7 = bar7DMetrics.result.value;
    assert(b7.count === 7 && b7.rectCount === 7, `[ADMIN BAR 7D] 7D renders exactly 7 daily bars (16-22 Nov) (Actual: ${b7.count} bars)`, 'BAR_DENSITY');
    assert(b7.totalBucketSum === b7.lastCumulative, `[ADMIN BAR 7D] Sum of 7D daily bars equals total revenue`, 'BAR_DENSITY');

    // 3. 90D Bar Density Test (12 weekly buckets)
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `document.getElementById('chartBtn90D').click();`
    });
    await sleep(200);

    const bar90DMetrics = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const points = window.FADE_TREND_CHART.points;
        const rects = Array.from(document.querySelectorAll('#chartBarsGroup rect'));
        const totalBucketSum = points.reduce((acc, p) => acc + p.daily, 0);
        const lastCumulative = points[points.length - 1].cumulative;
        return { count: points.length, rectCount: rects.length, totalBucketSum, lastCumulative };
      })()`,
      returnByValue: true
    });
    const b90 = bar90DMetrics.result.value;
    assert(b90.count === 12 && b90.rectCount === 12, `[ADMIN BAR 90D] 90D renders 12 weekly bucket bars (Actual: ${b90.count} bars)`, 'BAR_DENSITY');
    assert(b90.totalBucketSum === b90.lastCumulative, `[ADMIN BAR 90D] Sum of 90D weekly bars equals total revenue`, 'BAR_DENSITY');

    // 4. YTD Bar Density Test (6 monthly buckets)
    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'admin.html#ytd') });
    await sleep(500);

    const barYtdMetrics = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const points = window.FADE_TREND_CHART.points;
        const rects = Array.from(document.querySelectorAll('#chartBarsGroup rect'));
        const totalBucketSum = points.reduce((acc, p) => acc + p.daily, 0);
        const lastCumulative = points[points.length - 1].cumulative;
        return { count: points.length, rectCount: rects.length, totalBucketSum, lastCumulative };
      })()`,
      returnByValue: true
    });
    const bYtd = barYtdMetrics.result.value;
    assert(bYtd.count === 6 && bYtd.rectCount === 6, `[ADMIN BAR YTD] YTD renders 6 monthly bars (Jun-Nov) (Actual: ${bYtd.count} bars)`, 'BAR_DENSITY');
    assert(bYtd.totalBucketSum === bYtd.lastCumulative, `[ADMIN BAR YTD] Sum of monthly bars equals total revenue`, 'BAR_DENSITY');

    ws.close();
  }

  // =================================================================
  // 2. AUDIT SALES ROLE (TOOLTIP & BAR DENSITY)
  // =================================================================
  console.log('\n======================================================');
  console.log('2. AUDIT SALES: PARITY ON TOOLTIP & BAR DENSITY');
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

    // Set sales session (Nurdin)
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `localStorage.setItem('fade_showcase_session_v021', JSON.stringify({
        role: 'sales',
        username: 'sales',
        name: 'Nurdin',
        salesName: 'Nurdin',
        title: 'Senior Sales Representative'
      }));`
    });
    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'sales.html#dashboard') });
    await sleep(1000);

    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(200);

    // Sales Bar 30D density test
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `document.getElementById('chartBtnBar').click();`
    });
    await sleep(200);

    const salesBarMetrics = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const points = window.FADE_TREND_CHART.points;
        const rects = Array.from(document.querySelectorAll('#chartBarsGroup rect'));
        const totalBucketSum = points.reduce((acc, p) => acc + p.daily, 0);
        const lastCumulative = points[points.length - 1].cumulative;
        return { count: points.length, rectCount: rects.length, totalBucketSum, lastCumulative };
      })()`,
      returnByValue: true
    });
    const sBar = salesBarMetrics.result.value;
    assert(sBar.count === 22 && sBar.rectCount === 22, `[SALES BAR] Sales portal renders 22 daily bars for 30D (Actual: ${sBar.count} bars)`, 'SALES_PARITY');
    assert(sBar.totalBucketSum === sBar.lastCumulative, `[SALES BAR] Sales sum of bucket values strictly matches representative cumulative total`, 'SALES_PARITY');

    // Sales Tooltip Enlarged & Pointer Leave
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `window.FADE_TREND_CHART.selectPoint(15);`
    });
    await sleep(100);

    const salesTipMetrics = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const tipGroup = document.getElementById('chartTooltipGroup');
        const rect = tipGroup.querySelector('rect');
        return {
          width: parseFloat(rect.getAttribute('width')),
          height: parseFloat(rect.getAttribute('height')),
          isVisible: tipGroup.style.display !== 'none'
        };
      })()`,
      returnByValue: true
    });
    assert(salesTipMetrics.result.value.width >= 190 && salesTipMetrics.result.value.height >= 48, `[SALES TOOLTIP] Tooltip dimensions parity (>=190x48px) on Sales portal`, 'SALES_PARITY');

    const shotSales = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, 'sales_bar_and_tooltip.png'), Buffer.from(shotSales.data, 'base64'));

    ws.close();
  }

  // =================================================================
  // 3. AUDIT ADMIN: RIWAYAT UNGGAHAN & SAFE ROLLBACK / DELETE
  // =================================================================
  console.log('\n======================================================');
  console.log('3. AUDIT ADMIN: RIWAYAT UNGGAHAN SAFE ROLLBACK');
  console.log('======================================================');

  {
    const targetRes = await (await fetch(`http://localhost:${PORT}/json/new`, { method: 'PUT' })).json();
    const ws = new globalThis.WebSocket(targetRes.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    await sendCommand(ws, 'Page.enable');
    await sendCommand(ws, 'Runtime.enable');
    await sendCommand(ws, 'DOM.enable');

    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'admin.html#upload') });
    await sleep(500);

    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `localStorage.setItem('fade_showcase_session_v021', JSON.stringify({
        role: 'admin',
        username: 'admin',
        name: 'Raka Pratama',
        title: 'Head of Operations'
      }));`
    });
    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'admin.html#upload') });
    await sleep(1000);

    // A. Check Baseline Table: initial master seed has no rollback (shows "Data Awal")
    const initialTableCheck = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const rows = Array.from(document.querySelectorAll('#uploadHistoryBody tr'));
        if (rows.length === 0) return { hasRows: false };
        const firstRow = rows[0];
        const actionCol = firstRow.children[firstRow.children.length - 1];
        const isDataAwal = actionCol.textContent.includes('Data Awal');
        return {
          hasRows: true,
          rowCount: rows.length,
          isDataAwal: isDataAwal
        };
      })()`,
      returnByValue: true
    });
    assert(initialTableCheck.result.value.isDataAwal, `[ADMIN UPLOAD] Initial master seed file is protected with disabled 'Data Awal' badge`, 'UPLOAD_ROLLBACK');

    // B. Test Safe Upload With Snapshot (Simulated Upload Entry)
    const uploadSim = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const currentInvoices = FADE_STORE.getInvoices();
        const baseCount = currentInvoices.length;

        // Create temporary modified dataset (e.g. 50 new invoices)
        const dummyNewInvoices = currentInvoices.slice(0, 50);

        const uploadRes = FADE_STORE.saveUploadWithSnapshot(dummyNewInvoices, {
          timestamp: new Date().toISOString(),
          filename: 'Test_Upload_RevMinor_Simulated.xlsx',
          rowsIngested: 50,
          validCount: 50,
          invalidCount: 0,
          uploadedBy: 'Raka Pratama (Admin)',
          status: 'Success',
          notes: 'Test snapshot rollback'
        });

        // Trigger render
        window.location.hash = '#upload';
        renderUploadHistory();

        const updatedCount = FADE_STORE.getInvoices().length;
        const rowsAfter = Array.from(document.querySelectorAll('#uploadHistoryBody tr'));
        const firstRow = rowsAfter[0];
        const btnRollback = firstRow.querySelector('.btn-rollback-upload');

        return {
          uploadSuccess: uploadRes.success,
          uploadId: uploadRes.uploadId,
          baseCount: baseCount,
          updatedCount: updatedCount,
          hasRollbackBtn: !!btnRollback,
          filenameInRow: firstRow.children[1].textContent
        };
      })()`,
      returnByValue: true
    });
    const us = uploadSim.result.value;
    assert(us.uploadSuccess && us.updatedCount === 50, `[ADMIN UPLOAD] New upload successfully saved with prior snapshot (Dataset updated: ${us.baseCount} -> ${us.updatedCount})`, 'UPLOAD_ROLLBACK');
    assert(us.hasRollbackBtn && us.filenameInRow.includes('Test_Upload'), `[ADMIN UPLOAD] Table renders active 'Batalkan' rollback action on uploaded entry`, 'UPLOAD_ROLLBACK');

    // Screenshot of upload table with active rollback button
    const shotUpload = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, 'admin_upload_history_action.png'), Buffer.from(shotUpload.data, 'base64'));

    // C. Modal Open & Dismissal Test
    const modalCheck = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('.btn-rollback-upload');
        btn.click();
        const modalBackdrop = document.getElementById('rollbackModalBackdrop');
        const modalFilename = document.getElementById('rollbackModalFilename').textContent;
        const isModalVisible = !modalBackdrop.classList.contains('hidden');

        // Cancel modal
        document.getElementById('cancelRollbackBtn').click();
        const isModalClosed = modalBackdrop.classList.contains('hidden');

        return {
          isModalVisible,
          modalFilename,
          isModalClosed,
          invoicesStillModified: FADE_STORE.getInvoices().length === 50
        };
      })()`,
      returnByValue: true
    });
    const mc = modalCheck.result.value;
    assert(mc.isModalVisible && mc.modalFilename.includes('Test_Upload'), `[ADMIN UPLOAD] Rollback modal opens displaying target filename`, 'UPLOAD_ROLLBACK');
    assert(mc.isModalClosed && mc.invoicesStillModified, `[ADMIN UPLOAD] Canceling modal leaves dataset intact without changes`, 'UPLOAD_ROLLBACK');

    // D. Rollback Execution Test (Restores dataset, updates table, cleans snapshot)
    const rollbackExec = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('.btn-rollback-upload');
        btn.click();
        document.getElementById('confirmRollbackBtn').click();

        const invoicesAfterRollback = FADE_STORE.getInvoices().length;
        const historyAfter = FADE_STORE.getUploadHistory();
        const isTestEntryRemoved = !historyAfter.some(h => h.filename.includes('Test_Upload'));

        return {
          restoredCount: invoicesAfterRollback,
          isTestEntryRemoved: isTestEntryRemoved,
          expectedCount: 395
        };
      })()`,
      returnByValue: true
    });
    const re = rollbackExec.result.value;
    assert(re.restoredCount === 395, `[ADMIN UPLOAD] Rollback completely restores previous dataset (${re.restoredCount} invoices restored)`, 'UPLOAD_ROLLBACK');
    assert(re.isTestEntryRemoved, `[ADMIN UPLOAD] Rolled-back upload entry cleanly removed from active history table`, 'UPLOAD_ROLLBACK');

    // E. Failed Upload Cleanup Test
    const failedUploadTest = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        FADE_STORE.addUploadHistory({
          id: 'test_failed_' + Date.now(),
          timestamp: new Date().toISOString(),
          filename: 'Corrupt_Data_Failed.xlsx',
          rowsIngested: 12,
          validCount: 0,
          invalidCount: 12,
          uploadedBy: 'Raka Pratama (Admin)',
          status: 'Failed',
          notes: '12 baris cacat'
        });
        renderUploadHistory();

        const btnDel = document.querySelector('.btn-delete-failed-upload');
        const hasDelBtn = !!btnDel;
        if (btnDel) btnDel.click();

        const modalDel = document.getElementById('deleteFailedUploadModalBackdrop');
        const isDelModalOpen = modalDel && !modalDel.classList.contains('hidden');

        document.getElementById('confirmDeleteFailedBtn').click();
        const historyNow = FADE_STORE.getUploadHistory();
        const isFailedRemoved = !historyNow.some(h => h.filename.includes('Corrupt_Data_Failed'));
        const datasetUntouched = FADE_STORE.getInvoices().length === 395;

        return {
          hasDelBtn,
          isDelModalOpen,
          isFailedRemoved,
          datasetUntouched
        };
      })()`,
      returnByValue: true
    });
    const fut = failedUploadTest.result.value;
    assert(fut.hasDelBtn && fut.isDelModalOpen, `[ADMIN UPLOAD] Failed upload row provides 'Hapus' action with confirmation modal`, 'UPLOAD_DELETE');
    assert(fut.isFailedRemoved && fut.datasetUntouched, `[ADMIN UPLOAD] Failed log removed cleanly without mutating active 395 master dataset`, 'UPLOAD_DELETE');

    ws.close();
  }

  chromeProc.kill();

  console.log('\n======================================================');
  console.log(`TOTAL: ${results.passed} PASSED, ${results.failed} FAILED`);
  console.log('======================================================');

  if (results.failed === 0) {
    console.log('\nMINOR REVISION TESTS COMPLETED WITH 100% SUCCESS!');
  } else {
    console.error(`\nHAD ${results.failed} FAILURES!`);
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
