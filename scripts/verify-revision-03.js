/**
 * Comprehensive Verification & Evidence Capture for:
 * FADE Pods Showcase v0.2 — Revision 03 (Mobile Shell, Dashboard, Chart & Navigation)
 * Updated with strict KPI truncation assertions, viewport-centered chart screenshots,
 * and representative Sales data (Aru, 129 invoices).
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9750 + Math.floor(Math.random() * 40);
const HTTP_PORT = 8089;
const BASE_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(BASE_DIR, 'docs', 'screenshots');
const ARTIFACT_DIR = '/Users/naufalausan/.gemini/antigravity/brain/183799d6-e9a7-4bd2-844f-c68a81bc86e6';

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
    server.listen(HTTP_PORT, '127.0.0.1', () => {
      console.log(`[HTTP Server] Listening on http://127.0.0.1:${HTTP_PORT}`);
      resolve(server);
    });
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

async function waitForElement(ws, selector, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const exists = await evalScript(ws, `!!document.querySelector('${selector}')`);
      if (exists) return true;
    } catch (e) {}
    await sleep(100);
  }
  return false;
}

async function evalScript(ws, expression) {
  const res = await sendCommand(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (res.exceptionDetails) {
    const desc = res.exceptionDetails.exception ? (res.exceptionDetails.exception.description || res.exceptionDetails.exception.value) : '';
    throw new Error(`${res.exceptionDetails.text}: ${desc}`);
  }
  return res.result ? res.result.value : undefined;
}

async function saveScreenshot(ws, filename) {
  const shot = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.data, 'base64');
  const localPath = path.join(SCREENSHOT_DIR, filename);
  fs.writeFileSync(localPath, buf);
  if (fs.existsSync(ARTIFACT_DIR)) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, filename), buf);
  }
  console.log(`[SCREENSHOT] Saved: ${filename}`);
  return localPath;
}

async function scrollChartIntoView(ws) {
  await evalScript(ws, `
    (function() {
      var chartCard = document.getElementById('chartInteractiveContainer')
        ? document.getElementById('chartInteractiveContainer').closest('.rounded-xl')
        : document.getElementById('salesAnalyticsSection');
      if (chartCard) {
        var headerOffset = 68;
        var r = chartCard.getBoundingClientRect();
        window.scrollTo(0, Math.max(0, window.scrollY + r.top - headerOffset));
      }
    })()
  `);
  await sleep(350);
}

async function run() {
  console.log('=== FADE Pods Showcase v0.2 — Revision 03 Verification ===');
  const server = await startHttpServer();
  const tmpProfile = '/tmp/chrome-rev3-' + Date.now();
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmpProfile}`,
    '--no-first-run',
    '--no-default-browser-check'
  ], { stdio: 'ignore' });

  for (let i = 0; i < 40; i++) {
    await sleep(300);
    try {
      const v = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
      if (v.webSocketDebuggerUrl) break;
    } catch (e) {}
  }

  const adminSession = {
    username: 'admin',
    name: 'Raka Pratama',
    role: 'admin',
    title: 'Head of Operations'
  };

  // Official representative demo account with 129 invoices and full active transactions
  const salesSession = {
    username: 'aru',
    name: 'Aru',
    role: 'sales',
    salesName: 'Aru',
    title: 'Sales Representative'
  };

  // Empty state test account with 0 transactions
  const emptySalesSession = {
    username: 'budi',
    name: 'Budi Santoso',
    role: 'sales',
    salesName: 'Budi Santoso',
    title: 'Senior Field Sales'
  };

  async function openPage(url, sessionData, width, height, theme = 'dark') {
    const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' })).json();
    const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    await sendCommand(ws, 'Page.enable');
    await sendCommand(ws, 'Runtime.enable');
    await sendCommand(ws, 'DOM.enable');
    await sendCommand(ws, 'CSS.enable');

    ws.addEventListener('message', (evt) => {
      try {
        const d = JSON.parse(evt.data);
        if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
          console.error('[BROWSER CONSOLE ERROR]', d.params.args.map(a => a.value || a.description));
        }
        if (d.method === 'Runtime.exceptionThrown') {
          console.error('[BROWSER UNCAUGHT EXCEPTION]', d.params.exceptionDetails);
        }
      } catch (e) {}
    });
    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: width < 768
    });

    const [pathPart, hashPart] = url.split('#');
    const queryJoiner = pathPart.includes('?') ? '&' : '?';
    const salesParam = sessionData.salesName ? `&sales=${encodeURIComponent(sessionData.username || sessionData.salesName)}` : '';
    const fullUrl = `http://127.0.0.1:${HTTP_PORT}${pathPart}${queryJoiner}demo=1&role=${sessionData.role}${salesParam}${hashPart ? '#' + hashPart : ''}`;
    await sendCommand(ws, 'Page.navigate', { url: fullUrl });
    await sleep(400);

    await evalScript(ws, `
      localStorage.setItem('fade_showcase_session_v021', JSON.stringify(${JSON.stringify(sessionData)}));
      localStorage.setItem('fade_theme', '${theme}');
      if (window.FADE_STORE) {
        FADE_STORE.setActiveSession(${JSON.stringify(sessionData)});
        FADE_STORE.setTheme('${theme}');
      }
      document.documentElement.classList.toggle('dark', '${theme}' === 'dark');
      document.documentElement.classList.toggle('light', '${theme}' === 'light');
    `);
    await sendCommand(ws, 'Page.navigate', { url: fullUrl });
    await sleep(400);
    await waitForElement(ws, '#pageTitle, header', 6000);

    return { ws, targetId: target.id };
  }

  try {
    // ==========================================
    // FASE 1: MOBILE SHELL & NAV (390×844)
    // ==========================================
    console.log('\n--- FASE 1: Mobile Shell & Nav Audit (Admin 390px) ---');
    let page = await openPage('/admin.html#dashboard', adminSession, 390, 844, 'dark');

    // 1.1 Header tests
    const adminHeader = await evalScript(page.ws, `
      (function() {
        var h = document.getElementById('mobileHeaderContainer');
        var rect = h.getBoundingClientRect();
        var contentDiv = h.querySelector('div');
        var cRect = contentDiv ? contentDiv.getBoundingClientRect() : rect;
        var wordmark = h.querySelector('.font-black') || h.querySelector('.font-bold') || h.querySelector('span');
        var themeBtn = document.getElementById('mobileThemeBtn');
        var notifBtn = document.getElementById('mobileNotifBtn');
        var tRect = themeBtn.getBoundingClientRect();
        var nRect = notifBtn.getBoundingClientRect();
        var hasAdminBadge = !!h.querySelector('#headerRoleBadge');
        var hasLogoutBtn = !!h.querySelector('#mobileLogoutBtn');
        return {
          headerWidth: rect.width,
          headerHeight: rect.height,
          contentHeight: cRect.height,
          wordmarkText: wordmark ? wordmark.textContent.trim() : '',
          themeBtnW: tRect.width,
          themeBtnH: tRect.height,
          notifBtnW: nRect.width,
          notifBtnH: nRect.height,
          hasAdminBadge: hasAdminBadge,
          hasLogoutBtn: hasLogoutBtn
        };
      })()
    `);

    assert(adminHeader.headerWidth === 390, 'Admin mobile header spans full viewport (390px)', 'FASE-1');
    assert(Math.round(adminHeader.contentHeight) === 64, `Admin mobile header content height is 64px (measured: ${adminHeader.contentHeight}px)`, 'FASE-1');
    assert(adminHeader.wordmarkText === 'FADE', 'Wordmark FADE rendered on left', 'FASE-1');
    assert(adminHeader.themeBtnW === 36 && adminHeader.themeBtnH === 36, 'Theme button is 36×36px', 'FASE-1');
    assert(adminHeader.notifBtnW === 36 && adminHeader.notifBtnH === 36, 'Notif button is 36×36px', 'FASE-1');
    assert(!adminHeader.hasAdminBadge, 'ADMIN role badge correctly removed from mobile header', 'FASE-1');
    assert(!adminHeader.hasLogoutBtn, 'Logout button correctly removed from mobile header', 'FASE-1');

    // 1.2 Bottom nav tests (Admin: 5 items)
    const adminNav = await evalScript(page.ws, `
      (function() {
        var nav = document.getElementById('mobileNavContainer');
        var rect = nav.getBoundingClientRect();
        var items = Array.from(nav.querySelectorAll('.mobile-nav-item'));
        var routes = items.map(function(el) { return el.getAttribute('data-route'); });
        var minTouchTarget = items.every(function(el) {
          var r = el.getBoundingClientRect();
          return r.width >= 44 && r.height >= 44;
        });
        var activeItem = nav.querySelector('.mobile-nav-item.text-accent');
        var hasOrangeIndicator = activeItem ? !activeItem.querySelector('.mobile-nav-indicator').classList.contains('hidden') : false;
        return {
          navWidth: rect.width,
          navHeight: rect.height,
          itemCount: items.length,
          routes: routes,
          minTouchTarget: minTouchTarget,
          activeRoute: activeItem ? activeItem.getAttribute('data-route') : '',
          hasOrangeIndicator: hasOrangeIndicator
        };
      })()
    `);

    assert(adminNav.navWidth === 390, 'Admin bottom nav grid spans full viewport (390px)', 'FASE-1');
    assert(adminNav.itemCount === 5, 'Admin bottom nav has exactly 5 items (Dashboard, YTD, Invoice, Upload, Profil)', 'FASE-1');
    assert(JSON.stringify(adminNav.routes) === JSON.stringify(['dashboard', 'ytd', 'invoices', 'upload', 'profile']), 'Admin routes match specification', 'FASE-1');
    assert(adminNav.minTouchTarget, 'Every bottom nav item touch target >= 44px', 'FASE-1');
    assert(adminNav.activeRoute === 'dashboard' && adminNav.hasOrangeIndicator, 'Dashboard active with orange indicator', 'FASE-1');

    // 1.3 Route switching scroll reset test
    await evalScript(page.ws, `window.scrollTo(0, 400);`);
    let scrollBefore = await evalScript(page.ws, `window.scrollY`);
    assert(scrollBefore > 0, `Scrolled down before route switch (scrollY: ${scrollBefore}px)`, 'FASE-1');

    await evalScript(page.ws, `window.location.hash = '#invoices';`);
    await sleep(300);
    let scrollAfter = await evalScript(page.ws, `window.scrollY`);
    assert(scrollAfter === 0, `Route switch to Invoices resets scroll to top (scrollY: ${scrollAfter}px)`, 'FASE-1');

    // 1.4 Profil -> Keluar -> Batal modal test
    await evalScript(page.ws, `window.location.hash = '#profile';`);
    await sleep(300);
    const profileModalTest = await evalScript(page.ws, `
      (function() {
        var btnLogout = document.getElementById('profileLogoutBtn') || document.querySelector('#profileModal button[onclick*="logout"]');
        if (!btnLogout) return { ok: false, reason: 'Logout button in profile not found' };
        btnLogout.click();
        var modal = document.getElementById('logoutConfirmModalBackdrop') || document.getElementById('logoutConfirmModal');
        var modalShown = modal && !modal.classList.contains('hidden');
        var cancelBtn = document.getElementById('cancelLogoutBtn');
        if (cancelBtn) cancelBtn.click();
        var modalDismissed = modal && modal.classList.contains('hidden');
        return { ok: modalShown && modalDismissed, modalShown: modalShown, modalDismissed: modalDismissed };
      })()
    `);
    assert(profileModalTest.ok, 'Admin Profil -> Keluar -> Batal modal operates smoothly without redirect', 'FASE-1');

    // Return to dashboard and take Phase 1 screenshot (Admin Dark & Light)
    await evalScript(page.ws, `window.location.hash = '#dashboard';`);
    await sleep(300);
    await saveScreenshot(page.ws, 'checkpoint1_admin_dark_390.png');

    await evalScript(page.ws, `applyTheme('light');`);
    await sleep(200);
    await saveScreenshot(page.ws, 'checkpoint1_admin_light_390.png');
    await page.ws.close();

    // Now verify Sales 390px (Phase 1) with Representative Account (Aru)
    console.log('\n--- FASE 1: Mobile Shell & Nav Audit (Sales 390px - Aru) ---');
    page = await openPage('/sales.html#dashboard', salesSession, 390, 844, 'dark');

    const salesHeader = await evalScript(page.ws, `
      (function() {
        var h = document.getElementById('mobileHeaderContainer');
        var rect = h.getBoundingClientRect();
        var contentDiv = h.querySelector('div');
        var cRect = contentDiv ? contentDiv.getBoundingClientRect() : rect;
        var wordmark = h.querySelector('.font-black') || h.querySelector('.font-bold') || h.querySelector('span');
        var themeBtn = document.getElementById('mobileThemeBtn');
        var notifBtn = document.getElementById('mobileNotifBtn');
        var tRect = themeBtn.getBoundingClientRect();
        var nRect = notifBtn.getBoundingClientRect();
        var hasSalesBadge = !!h.querySelector('#headerRoleBadge');
        var hasLogoutBtn = !!h.querySelector('#mobileLogoutBtn');
        return {
          headerWidth: rect.width,
          headerHeight: rect.height,
          contentHeight: cRect.height,
          wordmarkText: wordmark ? wordmark.textContent.trim() : '',
          themeBtnW: tRect.width,
          themeBtnH: tRect.height,
          notifBtnW: nRect.width,
          notifBtnH: nRect.height,
          hasSalesBadge: hasSalesBadge,
          hasLogoutBtn: hasLogoutBtn
        };
      })()
    `);

    assert(salesHeader.headerWidth === 390, 'Sales mobile header spans full viewport (390px)', 'FASE-1');
    assert(Math.round(salesHeader.contentHeight) === 64, `Sales mobile header content height is 64px (measured: ${salesHeader.contentHeight}px)`, 'FASE-1');
    assert(salesHeader.themeBtnW === 36 && salesHeader.notifBtnW === 36, 'Sales Theme and Notif buttons are 36×36px', 'FASE-1');
    assert(!salesHeader.hasSalesBadge && !salesHeader.hasLogoutBtn, 'Sales badge & Logout removed from header', 'FASE-1');

    const salesNav = await evalScript(page.ws, `
      (function() {
        var nav = document.getElementById('mobileNavContainer');
        var rect = nav.getBoundingClientRect();
        var items = Array.from(nav.querySelectorAll('.mobile-nav-item'));
        var routes = items.map(function(el) { return el.getAttribute('data-route'); });
        var minTouchTarget = items.every(function(el) {
          var r = el.getBoundingClientRect();
          return r.width >= 44 && r.height >= 44;
        });
        return {
          navWidth: rect.width,
          itemCount: items.length,
          routes: routes,
          minTouchTarget: minTouchTarget
        };
      })()
    `);

    assert(salesNav.navWidth === 390, 'Sales bottom nav grid spans full viewport (390px)', 'FASE-1');
    assert(salesNav.itemCount === 4, 'Sales bottom nav has exactly 4 items (Dashboard, YTD, Invoice, Profil)', 'FASE-1');
    assert(JSON.stringify(salesNav.routes) === JSON.stringify(['dashboard', 'ytd', 'invoices', 'profile']), 'Sales routes match specification', 'FASE-1');
    assert(salesNav.minTouchTarget, 'Sales bottom nav touch targets >= 44px', 'FASE-1');

    // Sales Profil -> Keluar -> Batal test
    await evalScript(page.ws, `window.location.hash = '#profile';`);
    await sleep(400);
    const salesProfileModalTest = await evalScript(page.ws, `
      (function() {
        var btnLogout = document.getElementById('btnProfileLogout');
        if (!btnLogout) return { ok: false, reason: 'btnProfileLogout not found' };
        btnLogout.click();
        var backdrop = document.getElementById('accountModalBackdrop');
        var modalShown = backdrop && !backdrop.classList.contains('hidden');
        if (window.closeAccountModal) window.closeAccountModal();
        var modalDismissed = backdrop && backdrop.classList.contains('hidden');
        return { ok: modalShown && modalDismissed, modalShown: modalShown, modalDismissed: modalDismissed };
      })()
    `);
    assert(salesProfileModalTest.ok, 'Sales Profil -> Keluar -> Batal modal operates correctly', 'FASE-1');

    await evalScript(page.ws, `window.location.hash = '#dashboard';`);
    await sleep(300);
    await saveScreenshot(page.ws, 'checkpoint1_sales_dark_390.png');

    await evalScript(page.ws, `(window.applyTheme ? window.applyTheme('light') : (window.FADE_STORE && FADE_STORE.setTheme('light')));`);
    await sleep(200);
    await saveScreenshot(page.ws, 'checkpoint1_sales_light_390.png');
    await page.ws.close();

    // ==========================================
    // FASE 2: DASHBOARD HIERARCHY, KPI TRUNCATION & ZERO OVERFLOW
    // ==========================================
    console.log('\n--- FASE 2: KPI Card Truncation & Measurement Assertions (Admin 375px) ---');
    page = await openPage('/admin.html#dashboard', adminSession, 375, 812, 'dark');

    // 2.1 Zero horizontal scroll assertion
    const adminOverflow375 = await evalScript(page.ws, `
      ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth
      })
    `);
    assert(adminOverflow375.scrollWidth === adminOverflow375.clientWidth, `Admin 375px has zero horizontal scroll (scrollWidth: ${adminOverflow375.scrollWidth} === clientWidth: ${adminOverflow375.clientWidth})`, 'FASE-2');

    // 2.2 Deep DOM geometry check for KPI Cards on 375px
    const adminKpiDeepAudit = await evalScript(page.ws, `
      (function() {
        function checkElement(id) {
          var el = document.getElementById(id);
          if (!el) return { exists: false };
          var r = el.getBoundingClientRect();
          var style = window.getComputedStyle(el);
          return {
            exists: true,
            id: id,
            text: el.textContent.trim(),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            width: r.width,
            fontSize: style.fontSize,
            isTruncated: el.scrollWidth > el.clientWidth,
            hasEllipsis: el.textContent.indexOf('...') !== -1
          };
        }

        var qtyCard = document.querySelector('[data-kpi="qty"]');
        var qtyLabel = qtyCard ? qtyCard.querySelector('span:first-child') : null;
        var outstandingCard = document.querySelector('[data-kpi="outstanding"]');
        var outstandingLabel = outstandingCard ? outstandingCard.querySelector('span:first-child') : null;

        return {
          qtyVal: checkElement('kpiQtyVal'),
          qtyLabel: qtyLabel ? {
            text: qtyLabel.textContent.trim(),
            scrollWidth: qtyLabel.scrollWidth,
            clientWidth: qtyLabel.clientWidth,
            isTruncated: qtyLabel.scrollWidth > qtyLabel.clientWidth,
            hasEllipsis: qtyLabel.textContent.indexOf('...') !== -1
          } : null,
          revenueVal: checkElement('kpiRevenueVal'),
          pembayaranVal: checkElement('kpiPembayaranVal'),
          outstandingVal: checkElement('kpiOutstandingVal'),
          outstandingLabel: outstandingLabel ? {
            text: outstandingLabel.textContent.trim(),
            scrollWidth: outstandingLabel.scrollWidth,
            clientWidth: outstandingLabel.clientWidth,
            isTruncated: outstandingLabel.scrollWidth > outstandingLabel.clientWidth,
            hasEllipsis: outstandingLabel.textContent.indexOf('...') !== -1
          } : null,
          bisaDitagihVal: checkElement('kpiBisaDitagihVal'),
          belumJatuhTempoVal: checkElement('kpiBelumJatuhTempoVal')
        };
      })()
    `);

    console.log('Admin 375px KPI Deep Audit:', JSON.stringify(adminKpiDeepAudit, null, 2));

    assert(!adminKpiDeepAudit.qtyLabel.isTruncated && !adminKpiDeepAudit.qtyLabel.hasEllipsis, `Admin 375px QTY Penjualan label not truncated (${adminKpiDeepAudit.qtyLabel.text})`, 'KPI-UNCLIPPED');
    assert(!adminKpiDeepAudit.qtyVal.isTruncated && !adminKpiDeepAudit.qtyVal.hasEllipsis, `Admin 375px QTY value not truncated (${adminKpiDeepAudit.qtyVal.text})`, 'KPI-UNCLIPPED');
    assert(!adminKpiDeepAudit.revenueVal.isTruncated && !adminKpiDeepAudit.revenueVal.hasEllipsis, `Admin 375px Revenue value not truncated (${adminKpiDeepAudit.revenueVal.text})`, 'KPI-UNCLIPPED');
    assert(!adminKpiDeepAudit.pembayaranVal.isTruncated && !adminKpiDeepAudit.pembayaranVal.hasEllipsis, `Admin 375px Pembayaran value not truncated (${adminKpiDeepAudit.pembayaranVal.text})`, 'KPI-UNCLIPPED');
    assert(!adminKpiDeepAudit.outstandingVal.isTruncated && !adminKpiDeepAudit.outstandingVal.hasEllipsis, `Admin 375px Total Outstanding value not truncated (${adminKpiDeepAudit.outstandingVal.text}, scrollW: ${adminKpiDeepAudit.outstandingVal.scrollWidth} <= clientW: ${adminKpiDeepAudit.outstandingVal.clientWidth})`, 'KPI-UNCLIPPED');
    assert(!adminKpiDeepAudit.bisaDitagihVal.isTruncated && !adminKpiDeepAudit.bisaDitagihVal.hasEllipsis, `Admin 375px Bisa Ditagih value fully legible (${adminKpiDeepAudit.bisaDitagihVal.text})`, 'KPI-UNCLIPPED');
    assert(!adminKpiDeepAudit.belumJatuhTempoVal.isTruncated && !adminKpiDeepAudit.belumJatuhTempoVal.hasEllipsis, `Admin 375px Tempo value fully legible (${adminKpiDeepAudit.belumJatuhTempoVal.text})`, 'KPI-UNCLIPPED');

    // 2.3 Admin Perbandingan Kinerja Sales Mobile List
    const adminComparisonMobile = await evalScript(page.ws, `
      (function() {
        var mobileList = document.getElementById('comparisonMobileList');
        var desktopTable = document.getElementById('salesComparisonTableBody');
        var cards = mobileList ? mobileList.children : [];
        return {
          mobileVisible: mobileList && window.getComputedStyle(mobileList).display !== 'none',
          cardCount: cards.length,
          desktopHidden: desktopTable ? window.getComputedStyle(desktopTable.closest('table')).display === 'none' || window.getComputedStyle(desktopTable.closest('div')).display === 'none' : true
        };
      })()
    `);

    assert(adminComparisonMobile.mobileVisible, 'Admin Perbandingan Kinerja Sales displays mobile cards on narrow screens', 'FASE-2');
    assert(adminComparisonMobile.cardCount === 7, `Admin Perbandingan Kinerja Sales renders all 7 sales team cards (count: ${adminComparisonMobile.cardCount})`, 'FASE-2');
    assert(adminComparisonMobile.desktopHidden, 'Admin desktop wide table is hidden on mobile', 'FASE-2');

    // 2.4 Date Filter Popover containment
    const datePopoverAdmin = await evalScript(page.ws, `
      (function() {
        var btn = document.getElementById('dateFilterBtn');
        btn.click();
        var pop = document.getElementById('dateFilterPopover');
        var r = pop.getBoundingClientRect();
        btn.click();
        return {
          left: r.left,
          right: r.right,
          width: r.width,
          viewportWidth: window.innerWidth,
          isContained: r.left >= 0 && r.right <= window.innerWidth
        };
      })()
    `);
    assert(datePopoverAdmin.isContained, `Date filter popover is completely within viewport bounds (left: ${datePopoverAdmin.left}px, right: ${datePopoverAdmin.right}px <= ${datePopoverAdmin.viewportWidth}px)`, 'FASE-2');

    await saveScreenshot(page.ws, 'checkpoint2_admin_section_375.png');
    await page.ws.close();

    // Check Sales (Aru) Dashboard on 375px
    console.log('\n--- FASE 2: Sales (Aru) KPI Truncation & Card Reflow (375px) ---');
    page = await openPage('/sales.html#dashboard', salesSession, 375, 812, 'dark');

    const salesOverflow375 = await evalScript(page.ws, `
      ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      })
    `);
    assert(salesOverflow375.scrollWidth === salesOverflow375.clientWidth, `Sales 375px has zero horizontal scroll (scrollWidth: ${salesOverflow375.scrollWidth} === clientWidth: ${salesOverflow375.clientWidth})`, 'FASE-2');

    const salesKpiDeepAudit = await evalScript(page.ws, `
      (function() {
        function checkElement(id) {
          var el = document.getElementById(id);
          if (!el) return { exists: false };
          return {
            exists: true,
            id: id,
            text: el.textContent.trim(),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            isTruncated: el.scrollWidth > el.clientWidth,
            hasEllipsis: el.textContent.indexOf('...') !== -1
          };
        }

        var qtyCard = document.querySelector('[data-kpi="qty"]');
        var qtyLabel = qtyCard ? qtyCard.querySelector('span:first-child') : null;

        return {
          qtyVal: checkElement('kpiQtyVal'),
          qtyLabel: qtyLabel ? {
            text: qtyLabel.textContent.trim(),
            scrollWidth: qtyLabel.scrollWidth,
            clientWidth: qtyLabel.clientWidth,
            isTruncated: qtyLabel.scrollWidth > qtyLabel.clientWidth,
            hasEllipsis: qtyLabel.textContent.indexOf('...') !== -1
          } : null,
          revenueVal: checkElement('kpiRevenueVal'),
          pembayaranVal: checkElement('kpiPembayaranVal'),
          outstandingVal: checkElement('kpiOutstandingVal'),
          bisaDitagihVal: checkElement('kpiBisaDitagihVal'),
          belumJatuhTempoVal: checkElement('kpiBelumJatuhTempoVal')
        };
      })()
    `);

    console.log('Sales (Aru) 375px KPI Deep Audit:', JSON.stringify(salesKpiDeepAudit, null, 2));

    assert(!salesKpiDeepAudit.qtyLabel.isTruncated && !salesKpiDeepAudit.qtyLabel.hasEllipsis, `Sales 375px QTY Penjualan label not truncated (${salesKpiDeepAudit.qtyLabel.text})`, 'KPI-UNCLIPPED');
    assert(!salesKpiDeepAudit.qtyVal.isTruncated && !salesKpiDeepAudit.qtyVal.hasEllipsis, `Sales 375px QTY value not truncated (${salesKpiDeepAudit.qtyVal.text})`, 'KPI-UNCLIPPED');
    assert(!salesKpiDeepAudit.revenueVal.isTruncated && !salesKpiDeepAudit.revenueVal.hasEllipsis, `Sales 375px Revenue value not truncated (${salesKpiDeepAudit.revenueVal.text})`, 'KPI-UNCLIPPED');
    assert(!salesKpiDeepAudit.pembayaranVal.isTruncated && !salesKpiDeepAudit.pembayaranVal.hasEllipsis, `Sales 375px Pembayaran value not truncated (${salesKpiDeepAudit.pembayaranVal.text})`, 'KPI-UNCLIPPED');
    assert(!salesKpiDeepAudit.outstandingVal.isTruncated && !salesKpiDeepAudit.outstandingVal.hasEllipsis, `Sales 375px Total Outstanding value not truncated (${salesKpiDeepAudit.outstandingVal.text})`, 'KPI-UNCLIPPED');
    assert(!salesKpiDeepAudit.bisaDitagihVal.isTruncated && !salesKpiDeepAudit.bisaDitagihVal.hasEllipsis, `Sales 375px Bisa Ditagih value fully legible (${salesKpiDeepAudit.bisaDitagihVal.text})`, 'KPI-UNCLIPPED');
    assert(!salesKpiDeepAudit.belumJatuhTempoVal.isTruncated && !salesKpiDeepAudit.belumJatuhTempoVal.hasEllipsis, `Sales 375px Tempo value fully legible (${salesKpiDeepAudit.belumJatuhTempoVal.text})`, 'KPI-UNCLIPPED');

    const salesDashInvoicesMobile = await evalScript(page.ws, `
      (function() {
        var mList = document.getElementById('dashInvoiceMobileList');
        var dTable = document.getElementById('dashInvoiceTableBody');
        var cards = mList ? mList.children : [];
        return {
          mListVisible: mList && window.getComputedStyle(mList).display !== 'none',
          cardCount: cards.length,
          dTableHidden: dTable ? window.getComputedStyle(dTable.closest('div')).display === 'none' : false
        };
      })()
    `);

    assert(salesDashInvoicesMobile.mListVisible, 'Sales Dashboard renders mobile stacked cards for invoices', 'FASE-2');
    assert(salesDashInvoicesMobile.cardCount > 0, `Sales Dashboard mobile invoice card count > 0 (rendered: ${salesDashInvoicesMobile.cardCount})`, 'FASE-2');
    assert(salesDashInvoicesMobile.dTableHidden, 'Sales wide table wrapper is hidden on mobile', 'FASE-2');

    await saveScreenshot(page.ws, 'checkpoint2_sales_section_375.png');
    await page.ws.close();

    // ==========================================
    // FASE 3: TREND CHART MOBILE POLISH & VIEWPORT CAPTURE
    // ==========================================
    console.log('\n--- FASE 3: Trend Chart Mobile Polish & Viewport Capture ---');

    // Test Matrix: Admin & Sales across 375, 390, 430 in Dark & Light
    // 3.1 Admin 390px (Primary Verification)
    page = await openPage('/admin.html#dashboard', adminSession, 390, 844, 'dark');

    // Check X-axis tick decimation (30D)
    const tickAnalysis = await evalScript(page.ws, `
      (function() {
        var labelsContainer = document.getElementById('chartXAxisLabels');
        var texts = Array.from(labelsContainer.querySelectorAll('text'));
        var labels = texts.map(function(t) {
          return {
            text: t.textContent.trim(),
            x: parseFloat(t.getAttribute('x')),
            fill: t.getAttribute('fill')
          };
        });
        var minGap = Infinity;
        for (var i = 1; i < labels.length; i++) {
          var gap = labels[i].x - labels[i - 1].x;
          if (gap < minGap) minGap = gap;
        }
        var has19Nov = labels.some(function(l) { return l.text.indexOf('19 Nov') >= 0; });
        var has22Nov = labels.some(function(l) { return l.text.indexOf('22 Nov') >= 0; });
        return {
          count: labels.length,
          labels: labels.map(function(l) { return l.text; }),
          minGap: minGap,
          has19Nov: has19Nov,
          has22Nov: has22Nov
        };
      })()
    `);

    console.log('Mobile 30D Visible Ticks:', tickAnalysis.labels);
    assert(tickAnalysis.minGap >= 55, `Minimum gap between X-axis ticks is >= 55px (measured min gap: ${tickAnalysis.minGap.toFixed(1)}px)`, 'FASE-3');
    assert(tickAnalysis.has22Nov, 'Active latest checkpoint 22 Nov is prominently rendered', 'FASE-3');
    assert(!tickAnalysis.has19Nov || tickAnalysis.minGap >= 50, '19 Nov and 22 Nov tick collision completely resolved on mobile', 'FASE-3');

    // Tooltip bounding check
    const tooltipMobileCheck = await evalScript(page.ws, `
      (function() {
        window.FADE_TREND_CHART.selectPoint(window.FADE_TREND_CHART.points.length - 1);
        var tipGroup = document.getElementById('chartTooltipGroup');
        var trans = tipGroup.getAttribute('transform');
        var match = /translate\\(([^,\\s]+)[,\\s]+([^\\)]+)\\)/.exec(trans);
        var tipX = parseFloat(match[1]);
        var tipY = parseFloat(match[2]);
        var b = window.FADE_TREND_CHART.BOUNDS;
        return {
          tipX: tipX,
          tipY: tipY,
          viewBoxWidth: b.viewBoxWidth,
          viewBoxHeight: b.viewBoxHeight,
          isWithinBounds: tipX >= 8 && (tipX + 196) <= b.viewBoxWidth && tipY >= 8
        };
      })()
    `);
    assert(tooltipMobileCheck.isWithinBounds, `Mobile tooltip safely bounded inside SVG canvas (tipX: ${tooltipMobileCheck.tipX}px + 196px <= viewBox: ${tooltipMobileCheck.viewBoxWidth}px)`, 'FASE-3');

    // Outside tap dismiss test
    const dismissTest = await evalScript(page.ws, `
      (function() {
        var tipGroup = document.getElementById('chartTooltipGroup');
        var initiallyVisible = tipGroup && tipGroup.style.display !== 'none';
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        var dismissed = tipGroup && tipGroup.style.display === 'none';
        return { initiallyVisible: initiallyVisible, dismissed: dismissed };
      })()
    `);
    assert(dismissTest.dismissed, 'Tooltip and active indicators successfully dismiss when tapping outside the chart', 'FASE-3');

    // Re-select active point and verify physical touch selection
    const touchSelectTest = await evalScript(page.ws, `
      (function() {
        var node = document.querySelector('.chart-milestone-node[data-index="0"]');
        if (node) {
          node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          return window.FADE_TREND_CHART.activePointIndex === 0;
        }
        return false;
      })()
    `);
    assert(touchSelectTest, 'Milestone node selection via direct touch/click triggers active point index 0', 'FASE-3');

    // Scroll chart card directly into view and capture Line & Bar on 390px
    await evalScript(page.ws, `window.FADE_TREND_CHART.selectPoint(window.FADE_TREND_CHART.points.length - 1);`);
    await scrollChartIntoView(page.ws);

    // Verify chart card is in viewport
    const chartVisibility = await evalScript(page.ws, `
      (function() {
        var card = document.getElementById('chartInteractiveContainer').closest('.rounded-xl');
        var r = card.getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          isInViewport: r.top >= 60 && r.top < window.innerHeight
        };
      })()
    `);
    assert(chartVisibility.isInViewport, `Chart card is correctly framed in mobile viewport before capture (top: ${chartVisibility.top}px)`, 'FASE-3');

    await saveScreenshot(page.ws, 'checkpoint3_chart_line_390.png');

    // Switch to Bar and capture
    await evalScript(page.ws, `document.getElementById('chartBtnBar').click();`);
    await sleep(250);
    await evalScript(page.ws, `window.FADE_TREND_CHART.selectPoint(window.FADE_TREND_CHART.points.length - 1);`);
    await scrollChartIntoView(page.ws);
    await saveScreenshot(page.ws, 'checkpoint3_chart_bar_390.png');
    await page.ws.close();

    // 3.2 Admin 375px Line & Bar
    page = await openPage('/admin.html#dashboard', adminSession, 375, 812, 'dark');
    await evalScript(page.ws, `window.FADE_TREND_CHART.selectPoint(window.FADE_TREND_CHART.points.length - 1);`);
    await scrollChartIntoView(page.ws);
    await saveScreenshot(page.ws, 'checkpoint3_chart_line_375.png');

    await evalScript(page.ws, `document.getElementById('chartBtnBar').click();`);
    await sleep(250);
    await evalScript(page.ws, `window.FADE_TREND_CHART.selectPoint(window.FADE_TREND_CHART.points.length - 1);`);
    await scrollChartIntoView(page.ws);
    await saveScreenshot(page.ws, 'checkpoint3_chart_bar_375.png');
    await page.ws.close();

    // 3.3 Admin 430px Line & Bar
    page = await openPage('/admin.html#dashboard', adminSession, 430, 932, 'dark');
    await evalScript(page.ws, `window.FADE_TREND_CHART.selectPoint(window.FADE_TREND_CHART.points.length - 1);`);
    await scrollChartIntoView(page.ws);
    await saveScreenshot(page.ws, 'checkpoint3_chart_line_430.png');

    await evalScript(page.ws, `document.getElementById('chartBtnBar').click();`);
    await sleep(250);
    await evalScript(page.ws, `window.FADE_TREND_CHART.selectPoint(window.FADE_TREND_CHART.points.length - 1);`);
    await scrollChartIntoView(page.ws);
    await saveScreenshot(page.ws, 'checkpoint3_chart_bar_430.png');
    await page.ws.close();

    // 3.4 Sales (Aru) Chart Verification (375, 390, 430px)
    console.log('\n--- FASE 3: Sales (Aru) Trend Chart Polish (375px, 390px, 430px) ---');
    page = await openPage('/sales.html#dashboard', salesSession, 390, 844, 'dark');
    await evalScript(page.ws, `window.FADE_TREND_CHART.selectPoint(window.FADE_TREND_CHART.points.length - 1);`);
    await scrollChartIntoView(page.ws);
    await saveScreenshot(page.ws, 'checkpoint3_sales_chart_line_390.png');

    await evalScript(page.ws, `document.getElementById('chartBtnBar').click();`);
    await sleep(250);
    await evalScript(page.ws, `window.FADE_TREND_CHART.selectPoint(window.FADE_TREND_CHART.points.length - 1);`);
    await scrollChartIntoView(page.ws);
    await saveScreenshot(page.ws, 'checkpoint3_sales_chart_bar_390.png');
    await page.ws.close();

    // Sales 375px Line & Bar
    page = await openPage('/sales.html#dashboard', salesSession, 375, 812, 'dark');
    await evalScript(page.ws, `window.FADE_TREND_CHART.selectPoint(window.FADE_TREND_CHART.points.length - 1);`);
    await scrollChartIntoView(page.ws);
    await saveScreenshot(page.ws, 'checkpoint3_sales_chart_line_375.png');

    await evalScript(page.ws, `document.getElementById('chartBtnBar').click();`);
    await sleep(250);
    await evalScript(page.ws, `window.FADE_TREND_CHART.selectPoint(window.FADE_TREND_CHART.points.length - 1);`);
    await scrollChartIntoView(page.ws);
    await saveScreenshot(page.ws, 'checkpoint3_sales_chart_bar_375.png');
    await page.ws.close();

    // Sales 430px Line & Bar
    page = await openPage('/sales.html#dashboard', salesSession, 430, 932, 'dark');
    await evalScript(page.ws, `window.FADE_TREND_CHART.selectPoint(window.FADE_TREND_CHART.points.length - 1);`);
    await scrollChartIntoView(page.ws);
    await saveScreenshot(page.ws, 'checkpoint3_sales_chart_line_430.png');

    await evalScript(page.ws, `document.getElementById('chartBtnBar').click();`);
    await sleep(250);
    await evalScript(page.ws, `window.FADE_TREND_CHART.selectPoint(window.FADE_TREND_CHART.points.length - 1);`);
    await scrollChartIntoView(page.ws);
    await saveScreenshot(page.ws, 'checkpoint3_sales_chart_bar_430.png');
    await page.ws.close();

    // ==========================================
    // ISOLATED LABELED CHECK: SALES EMPTY STATE
    // ==========================================
    console.log('\n--- [EMPTY-STATE CHECK] Sales Account with 0 Invoices (Budi Santoso) ---');
    page = await openPage('/sales.html#dashboard', emptySalesSession, 390, 844, 'dark');
    const emptyStateAudit = await evalScript(page.ws, `
      (function() {
        var qty = document.getElementById('kpiQtyVal').textContent.trim();
        var rev = document.getElementById('kpiRevenueVal').textContent.trim();
        var invCount = document.getElementById('kpiInvoicesVal').textContent.trim();
        var emptyTip = document.getElementById('chartMonthlyRevenue') ? document.getElementById('chartMonthlyRevenue').textContent.trim() : '';
        return {
          qty: qty,
          rev: rev,
          invCount: invCount,
          emptyTip: emptyTip
        };
      })()
    `);
    console.log('Empty State Audit Results:', emptyStateAudit);
    assert(emptyStateAudit.qty === '0 pcs', '[EMPTY-STATE CHECK] QTY Penjualan correctly displays 0 pcs', 'EMPTY-STATE');
    assert(emptyStateAudit.rev === 'Rp 0', '[EMPTY-STATE CHECK] Revenue correctly displays Rp 0', 'EMPTY-STATE');
    assert(emptyStateAudit.invCount === '0 Invoice', '[EMPTY-STATE CHECK] Invoice count correctly displays 0 Invoice', 'EMPTY-STATE');
    await saveScreenshot(page.ws, 'audit_sales_empty_state_390.png');
    await page.ws.close();

    // ==========================================
    // FASE 4: MULTI-DEVICE & MULTI-THEME AUDIT
    // ==========================================
    console.log('\n--- FASE 4: Multi-Device Matrix Audit (Admin & Representative Sales Aru) ---');
    const viewports = [
      { name: 'iphone_se_mini', w: 375, h: 812, desc: '375×812' },
      { name: 'iphone_standard', w: 390, h: 844, desc: '390×844' },
      { name: 'iphone_pro_max', w: 430, h: 932, desc: '430×932' },
      { name: 'tablet_ipad', w: 834, h: 1194, desc: '834×1194' }
    ];

    for (const vp of viewports) {
      for (const theme of ['dark', 'light']) {
        // Admin Audit
        page = await openPage('/admin.html#dashboard', adminSession, vp.w, vp.h, theme);
        const adminCheck = await evalScript(page.ws, `
          ({
            zeroOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
            scrollW: document.documentElement.scrollWidth,
            clientW: document.documentElement.clientWidth
          })
        `);
        assert(adminCheck.zeroOverflow, `Admin ${vp.desc} [${theme.toUpperCase()}] zero horizontal overflow`, 'FASE-4');
        if (vp.w === 834 || vp.w === 430) {
          await saveScreenshot(page.ws, `audit_admin_${vp.name}_${theme}.png`);
        }
        await page.ws.close();

        // Sales (Aru) Audit
        page = await openPage('/sales.html#dashboard', salesSession, vp.w, vp.h, theme);
        const salesCheck = await evalScript(page.ws, `
          ({
            zeroOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
            scrollW: document.documentElement.scrollWidth,
            clientW: document.documentElement.clientWidth
          })
        `);
        assert(salesCheck.zeroOverflow, `Sales (Aru) ${vp.desc} [${theme.toUpperCase()}] zero horizontal overflow`, 'FASE-4');
        if (vp.w === 834 || vp.w === 430) {
          await saveScreenshot(page.ws, `audit_sales_${vp.name}_${theme}.png`);
        }
        await page.ws.close();
      }
    }

    console.log(`\n========================================`);
    console.log(`VERIFICATION SUMMARY:`);
    console.log(`Passed: ${results.passed}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`========================================\n`);

  } catch (err) {
    console.error('Execution error:', err);
  } finally {
    try { chromeProc.kill(); } catch (e) {}
    try { server.close(); } catch (e) {}
  }
}

run();
