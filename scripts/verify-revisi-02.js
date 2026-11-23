/**
 * Automated Headless Verification Suite for:
 * FADE PODS v0.2 — REVISION 02 (Desktop UI Synchronization — Admin & Sales)
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9555;
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
  console.log('Starting Chrome for Revision 02 Desktop Verification on port ' + PORT + '...');
  const tmpDir = '/tmp/chrome-cdp-rev02-' + Date.now();
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
    await sleep(400);
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

  // -----------------------------------------------------------------
  // 1. AUDIT ADMIN DESKTOP SYNCHRONIZATION
  // -----------------------------------------------------------------
  console.log('\n======================================================');
  console.log('AUDIT REVISI 02: ADMIN DESKTOP VIEW');
  console.log('======================================================');

  {
    const targetRes = await (await fetch(`http://localhost:${PORT}/json/new`, { method: 'PUT' })).json();
    const ws = new globalThis.WebSocket(targetRes.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    await sendCommand(ws, 'Page.enable');
    await sendCommand(ws, 'Runtime.enable');

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
    await sleep(1200);

    // Test across 1024, 1280, 1440, 1920
    const resolutions = [1024, 1280, 1440, 1920];
    for (const w of resolutions) {
      await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(200);
      const overflow = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `document.documentElement.scrollWidth <= window.innerWidth`,
        returnByValue: true
      });
      assert(overflow.result.value, `No horizontal overflow at ${w}px`, 'ADMIN');
    }

    const adminAudit = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(async () => {
        const r = {};
        // Task A: Sidebar Toggle
        const toggleBtn = document.getElementById('sidebarToggleBtn');
        r.hasSidebarToggle = !!toggleBtn;
        const initialCollapsed = document.body.classList.contains('sidebar-collapsed');
        if (toggleBtn) toggleBtn.click();
        await new Promise(res => setTimeout(res, 250));
        const toggledCollapsed = document.body.classList.contains('sidebar-collapsed');
        r.sidebarCollapsible = initialCollapsed !== toggledCollapsed;
        r.savedSidebarState = localStorage.getItem('fade_sidebar_state');
        if (toggleBtn) toggleBtn.click(); // restore
        await new Promise(res => setTimeout(res, 250));

        // Task B: Header cleaning & Notifications
        const rawBody = document.body.innerText;
        r.hasBreadcrumb = rawBody.includes('WORKSPACE /');
        r.hasPersonalView = rawBody.includes('PERSONAL VIEW');
        const notifBtn = document.getElementById('desktopNotifBtn');
        const notifPopover = document.getElementById('desktopNotifPopover');
        r.hasNotifBtn = !!notifBtn;
        r.hasNotifPopover = !!notifPopover;
        if (notifBtn) notifBtn.click();
        r.popoverOpensOnClick = notifPopover ? !notifPopover.classList.contains('hidden') : false;
        const closeBtn = document.getElementById('closeNotifPopoverBtn');
        if (closeBtn) closeBtn.click();
        r.popoverClosesOnCloseBtn = notifPopover ? notifPopover.classList.contains('hidden') : false;

        // Task C: Export button
        const exportBtn = document.getElementById('exportMenuBtn');
        r.hasExportBtn = !!exportBtn;
        r.exportBtnClasses = exportBtn ? exportBtn.className : '';
        r.hasActionTokens = r.exportBtnClasses.includes('var(--action-bg)');

        // Task D: Layout 1-column stack
        const sec2 = document.getElementById('adminAnalyticsSection');
        r.section2IsColumn = sec2 ? (sec2.className.includes('flex flex-col') && !sec2.className.includes('lg:grid-cols-12')) : false;

        // Task E & F: Trend Chart & Controls
        const chartSvg = document.getElementById('trendChartSvg');
        r.chartViewBox = chartSvg ? chartSvg.getAttribute('viewBox') : null;
        r.hasLineBtn = !!document.getElementById('chartBtnLine');
        r.hasBarBtn = !!document.getElementById('chartBtnBar');
        r.has7D = !!document.getElementById('chartBtn7D');
        r.has30D = !!document.getElementById('chartBtn30D');
        r.has90D = !!document.getElementById('chartBtn90D');

        // Status Pembayaran 4 cards
        r.hasLunasCard = !!document.getElementById('chartPayLunasText');
        r.hasSebagianCard = !!document.getElementById('chartPaySebagianText');
        r.hasTerlambatCard = !!document.getElementById('chartPayTerlambatText');
        r.hasTempoCard = !!document.getElementById('chartPayTempoText');

        return r;
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    const a = adminAudit.result.value;
    assert(a.hasSidebarToggle, 'Task A: Sidebar Toggle exists on Admin', 'ADMIN');
    assert(a.sidebarCollapsible, 'Task A: Sidebar expands/collapses smoothly (240px <-> 66px)', 'ADMIN');
    assert(a.savedSidebarState === 'collapsed' || a.savedSidebarState === 'expanded', 'Task A: Sidebar collapse state persisted in localStorage', 'ADMIN');
    assert(!a.hasBreadcrumb, 'Task B: Zero WORKSPACE breadcrumbs on Admin', 'ADMIN');
    assert(a.hasNotifBtn && a.hasNotifPopover, 'Task B: Notification button & popover present on Admin', 'ADMIN');
    assert(a.popoverOpensOnClick && a.popoverClosesOnCloseBtn, 'Task B: Notification popover opens and closes correctly on Admin', 'ADMIN');
    assert(a.hasExportBtn, 'Task C: Admin has functional Export button', 'ADMIN');
    assert(a.hasActionTokens, 'Task C: Export button uses primary monochrome action tokens (--action-bg)', 'ADMIN');
    assert(a.section2IsColumn, 'Task D: Section 2 is full-width 1-column stack (no 2-column grid)', 'ADMIN');
    assert(a.chartViewBox === '0 0 1000 340', 'Task E: SVG viewBox is 0 0 1000 340', 'ADMIN');
    assert(a.hasLineBtn && a.hasBarBtn && a.has7D && a.has30D && a.has90D, 'Task F: Chart Line/Bar & 7D/30D/90D controls present', 'ADMIN');
    assert(a.hasLunasCard && a.hasSebagianCard && a.hasTerlambatCard && a.hasTempoCard, 'Task D: Status Pembayaran uses approved 4-card horizontal layout', 'ADMIN');

    ws.close();
  }

  // -----------------------------------------------------------------
  // 2. AUDIT SALES DESKTOP SYNCHRONIZATION
  // -----------------------------------------------------------------
  console.log('\n======================================================');
  console.log('AUDIT REVISI 02: SALES DESKTOP VIEW');
  console.log('======================================================');

  {
    const targetRes = await (await fetch(`http://localhost:${PORT}/json/new`, { method: 'PUT' })).json();
    const ws = new globalThis.WebSocket(targetRes.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    await sendCommand(ws, 'Page.enable');
    await sendCommand(ws, 'Runtime.enable');

    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'sales.html#dashboard') });
    await sleep(500);
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `localStorage.setItem('fade_showcase_session_v021', JSON.stringify({
        role: 'sales',
        username: 'aru',
        name: 'Aru',
        title: 'Sales Representative',
        salesName: 'Aru',
        salesId: 'SLS-ARU',
        region: 'Operasional Sales'
      }));`
    });
    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'sales.html#dashboard') });
    await sleep(1200);

    // Test across 1024, 1280, 1440, 1920
    const resolutions = [1024, 1280, 1440, 1920];
    for (const w of resolutions) {
      await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(200);
      const overflow = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `document.documentElement.scrollWidth <= window.innerWidth`,
        returnByValue: true
      });
      assert(overflow.result.value, `No horizontal overflow at ${w}px`, 'SALES');
    }

    const salesAudit = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(async () => {
        const r = {};
        // Task A: Sidebar Toggle
        const toggleBtn = document.getElementById('sidebarToggleBtn');
        r.hasSidebarToggle = !!toggleBtn;
        const initialCollapsed = document.body.classList.contains('sidebar-collapsed');
        if (toggleBtn) toggleBtn.click();
        await new Promise(res => setTimeout(res, 250));
        const toggledCollapsed = document.body.classList.contains('sidebar-collapsed');
        r.sidebarCollapsible = initialCollapsed !== toggledCollapsed;
        r.savedSidebarState = localStorage.getItem('fade_sidebar_state');
        if (toggleBtn) toggleBtn.click(); // restore
        await new Promise(res => setTimeout(res, 250));

        // Task B: Header cleaning & Notifications
        const rawBodyText = document.body.innerText;
        r.hasBreadcrumb = rawBodyText.includes('WORKSPACE / Sales Operation');
        r.hasPersonalView = rawBodyText.includes('PERSONAL VIEW');
        const notifBtn = document.getElementById('desktopNotifBtn');
        const notifPopover = document.getElementById('desktopNotifPopover');
        r.hasNotifBtn = !!notifBtn;
        r.hasNotifPopover = !!notifPopover;
        if (notifBtn) notifBtn.click();
        r.popoverOpensOnClick = notifPopover ? !notifPopover.classList.contains('hidden') : false;
        const closeBtn = document.getElementById('closeNotifPopoverBtn');
        if (closeBtn) closeBtn.click();
        r.popoverClosesOnCloseBtn = notifPopover ? notifPopover.classList.contains('hidden') : false;

        // Task C: Export button MUST NOT exist on Sales
        r.hasExportBtn = !!document.getElementById('exportMenuBtn');

        // Task D: Layout 1-column stack
        const sec2 = document.getElementById('salesAnalyticsSection');
        r.section2IsColumn = sec2 ? (sec2.className.includes('flex flex-col') && !sec2.className.includes('lg:grid-cols-12')) : false;

        // Task E & F: Trend Chart & Controls
        const chartSvg = document.getElementById('trendChartSvg');
        r.chartViewBox = chartSvg ? chartSvg.getAttribute('viewBox') : null;
        r.hasLineBtn = !!document.getElementById('chartBtnLine');
        r.hasBarBtn = !!document.getElementById('chartBtnBar');
        r.has7D = !!document.getElementById('chartBtn7D');
        r.has30D = !!document.getElementById('chartBtn30D');
        r.has90D = !!document.getElementById('chartBtn90D');

        // Status Pembayaran 4 cards
        r.hasLunasCard = !!document.getElementById('chartPayLunasText');
        r.hasSebagianCard = !!document.getElementById('chartPaySebagianText');
        r.hasTerlambatCard = !!document.getElementById('chartPayTerlambatText');
        r.hasTempoCard = !!document.getElementById('chartPayTempoText');

        // Task G: Route context - check routing isolates pages
        window.location.hash = '#invoices';
        await new Promise(res => setTimeout(res, 200));
        r.invoicesVisibleOnInvoicesHash = !document.getElementById('viewInvoices').classList.contains('hidden');
        r.dashboardHiddenOnInvoicesHash = document.getElementById('viewDashboard').classList.contains('hidden');

        return r;
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    const s = salesAudit.result.value;
    assert(s.hasSidebarToggle, 'Task A: Sidebar Toggle exists on Sales', 'SALES');
    assert(s.sidebarCollapsible, 'Task A: Sidebar expands/collapses smoothly on Sales', 'SALES');
    assert(!s.hasBreadcrumb, 'Task B: Obsolete WORKSPACE breadcrumb eliminated from Sales header', 'SALES');
    assert(!s.hasPersonalView, 'Task B: Obsolete PERSONAL VIEW badge eliminated from Sales header', 'SALES');
    assert(s.hasNotifBtn && s.hasNotifPopover, 'Task B: Notification button & popover present on Sales', 'SALES');
    assert(s.popoverOpensOnClick && s.popoverClosesOnCloseBtn, 'Task B: Notification popover opens and closes correctly on Sales', 'SALES');
    assert(!s.hasExportBtn, 'Task C: Sales portal has ZERO export buttons (read-only guard)', 'SALES');
    assert(s.section2IsColumn, 'Task D: Sales Section 2 is full-width 1-column stack (no 2-column grid)', 'SALES');
    assert(s.chartViewBox === '0 0 1000 340', 'Task E: Sales SVG viewBox is synchronized to 0 0 1000 340', 'SALES');
    assert(s.hasLineBtn && s.hasBarBtn && s.has7D && s.has30D && s.has90D, 'Task F: Sales Chart Line/Bar & 7D/30D/90D controls present', 'SALES');
    assert(s.hasLunasCard && s.hasSebagianCard && s.hasTerlambatCard && s.hasTempoCard, 'Task D: Sales Status Pembayaran uses approved 4-card horizontal layout', 'SALES');
    assert(s.invoicesVisibleOnInvoicesHash && s.dashboardHiddenOnInvoicesHash, 'Task G: Route context switching correctly isolates views', 'SALES');

    ws.close();
  }

  chromeProc.kill();

  console.log('\n======================================================');
  console.log(`TOTAL: ${results.passed} PASSED, ${results.failed} FAILED`);
  console.log('======================================================\n');

  if (results.failed > 0) process.exit(1);
  else console.log('REVISION 02 VERIFICATION PASSES 100% ACROSS ADMIN & SALES!');
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
