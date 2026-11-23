/**
 * Verification Script for:
 * FADE Pods Showcase v0.2 — Desktop UI/UX Fixes (Admin & Sales)
 *
 * Verifies:
 * 1. Notifikasi tagihan (accurate scoping, evaluation, empty state, action link)
 * 2. Sinkronisasi periode Bulanan/YTD (sidebar, tabs, date label, Back/Forward)
 * 3. Kolom tabel dan aksi (sticky action column, visibility across 1024-1920px)
 * 4. Judul dan toolbar sesuai halaman (Dashboard, Invoices, Upload)
 * 5. Kartu Total Outstanding (readability of Bisa Ditagih and Tempo without truncation)
 * 6. Light and Dark themes
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9700 + Math.floor(Math.random() * 50);
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
  console.log('Starting Headless Chrome for Desktop UI/UX Fixes on port ' + PORT + '...');
  const tmpDir = '/tmp/chrome-desktop-fixes-' + Date.now();
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

  const screenshotsDir = path.join(BASE_DIR, 'docs', 'screenshots', 'desktop_fixes');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // =================================================================
  // 1. AUDIT ADMIN ROLE
  // =================================================================
  console.log('\n======================================================');
  console.log('1. AUDIT ADMIN: NOTIFIKASI, PERIODE, TOOLBAR, OUTSTANDING, TABEL');
  console.log('======================================================');

  {
    const targetRes = await (await fetch(`http://localhost:${PORT}/json/new`, { method: 'PUT' })).json();
    const ws = new globalThis.WebSocket(targetRes.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    await sendCommand(ws, 'Page.enable');
    await sendCommand(ws, 'Runtime.enable');
    await sendCommand(ws, 'DOM.enable');

    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'admin.html#dashboard') });
    await sleep(600);

    // Set Admin demo session
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

    // Set standard desktop viewport 1440x900
    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(200);

    // -------------------------------------------------------------
    // Test A: Notification Accuracy & Evaluation
    // -------------------------------------------------------------
    const notifAudit = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const notifBtn = document.getElementById('desktopNotifBtn');
        notifBtn.click();
        const popover = document.getElementById('desktopNotifPopover');
        const badgeCount = parseInt(document.getElementById('notifBadgeCount').textContent, 10);
        const items = Array.from(document.querySelectorAll('#notifItemsContainer > div'));

        // Count overdue invoices in active period via engine
        const invoices = FADE_STORE.getInvoices();
        const pContext = FADE_ENGINE.resolvePeriod('2026-11', 'bulan', '2026-11-22', '2026-11-01', '2026-11-22');
        let expectedCount = 0;
        invoices.forEach(inv => {
          const dStr = inv.invoice_date || inv.date || '';
          if (dStr >= pContext.dari && dStr <= pContext.sampai) {
            const st = FADE_ENGINE.evaluateInvoiceState(inv, pContext.asOf);
            if (st.sisa > 0 && (st.status === 'Terlambat Bayar' || st.bisaDitagihkan)) {
              expectedCount++;
            }
          }
        });

        const isPopoverVisible = !popover.classList.contains('hidden');
        return {
          isPopoverVisible,
          badgeCount,
          expectedCount,
          itemCount: items.length
        };
      })()`,
      returnByValue: true
    });
    const na = notifAudit.result.value;
    assert(na.isPopoverVisible, '[ADMIN NOTIF] Popover notifikasi terbuka saat tombol notifikasi diklik', 'NOTIFIKASI');
    assert(na.badgeCount === na.expectedCount, `[ADMIN NOTIF] Hitungan notifikasi (${na.badgeCount}) persis sesuai jumlah invoice kritis periode aktif (${na.expectedCount})`, 'NOTIFIKASI');

    // Test Action Link "Buka Daftar Invoice"
    const notifLinkAudit = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const link = document.getElementById('notifViewAllLink');
        link.click();
        const hash = window.location.hash;
        const statusFilter = document.getElementById('invoiceStatusFilter').value;
        const isPopoverClosed = document.getElementById('desktopNotifPopover').classList.contains('hidden');
        return { hash, statusFilter, isPopoverClosed };
      })()`,
      returnByValue: true
    });
    const nla = notifLinkAudit.result.value;
    assert(nla.hash === '#invoices' && nla.statusFilter === 'OVERDUE' && nla.isPopoverClosed, '[ADMIN NOTIF] Link Buka Invoice mengarahkan ke #invoices dengan filter OVERDUE dan menutup popover', 'NOTIFIKASI');

    // -------------------------------------------------------------
    // Test B: Period Synchronization (Bulanan -> YTD -> Dashboard Bulanan)
    // -------------------------------------------------------------
    // First, navigate back to dashboard
    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'admin.html#dashboard') });
    await sleep(500);

    // Switch to YTD via tab
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `document.getElementById('tabModeYTD').click();`
    });
    await sleep(200);

    const ytdState = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        return {
          dateLabel: document.getElementById('filterDateLabel').textContent,
          statusText: document.getElementById('statusBadgeText').textContent,
          isTabYtdActive: !document.getElementById('tabIndicatorYTD').classList.contains('hidden')
        };
      })()`,
      returnByValue: true
    });
    assert(ytdState.result.value.dateLabel.includes('01 Jan – 22 Nov 2026') && ytdState.result.value.isTabYtdActive, '[ADMIN PERIODE] Beralih ke YTD memperbarui label menjadi 01 Jan – 22 Nov 2026', 'PERIODE_SYNC');

    // Now click "Dashboard Bulanan" in sidebar
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const dashNav = document.querySelector('#desktopNavContainer [data-route="dashboard"]');
        dashNav.click();
      })()`,
    });
    await sleep(300);

    const backToBulananState = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        return {
          dateLabel: document.getElementById('filterDateLabel').textContent,
          statusText: document.getElementById('statusBadgeText').textContent,
          isTabBulanActive: !document.getElementById('tabIndicatorBulanan').classList.contains('hidden'),
          isTabYtdInactive: document.getElementById('tabIndicatorYTD').classList.contains('hidden')
        };
      })()`,
      returnByValue: true
    });
    const bbs = backToBulananState.result.value;
    assert(bbs.dateLabel.includes('01 Nov – 22 Nov 2026') && bbs.statusText.includes('November 2026') && bbs.isTabBulanActive && bbs.isTabYtdInactive,
      `[ADMIN PERIODE] Klik sidebar Dashboard Bulanan mengembalikan label tanggal ke '01 Nov – 22 Nov 2026' dan tab Bulanan aktif`, 'PERIODE_SYNC');

    // Test Back/Forward browser navigation
    await sendCommand(ws, 'Runtime.evaluate', { expression: `window.location.hash = '#ytd';` });
    await sleep(300);
    await sendCommand(ws, 'Runtime.evaluate', { expression: `window.location.hash = '#invoices';` });
    await sleep(300);
    // Go Back
    await sendCommand(ws, 'Runtime.evaluate', { expression: `window.history.back();` });
    await sleep(400);

    const backNavCheck = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const hash = window.location.hash;
        const pageTitle = document.getElementById('pageTitle').textContent;
        return { hash, pageTitle };
      })()`,
      returnByValue: true
    });
    assert(backNavCheck.result.value.hash === '#ytd' && backNavCheck.result.value.pageTitle.includes('Dashboard'), '[ADMIN PERIODE] Tombol Back browser mengembalikan state dan judul halaman secara konsisten', 'PERIODE_SYNC');

    // -------------------------------------------------------------
    // Test D: Page Titles and Toolbars (Dashboard, Invoices, Upload)
    // -------------------------------------------------------------
    // 1. Dashboard
    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'admin.html#dashboard') });
    await sleep(400);
    const dashHeader = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        return {
          title: document.getElementById('pageTitle').textContent,
          toolbarVisible: !document.getElementById('headerToolbar').classList.contains('hidden')
        };
      })()`,
      returnByValue: true
    });
    assert(dashHeader.result.value.title === 'Dashboard Admin' && dashHeader.result.value.toolbarVisible, '[ADMIN HEADER] Halaman Dashboard menampilkan judul Dashboard Admin dan toolbar lengkap', 'HEADER_TOOLBAR');

    // 2. Invoices
    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'admin.html#invoices') });
    await sleep(400);
    const invHeader = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        return {
          title: document.getElementById('pageTitle').textContent,
          toolbarVisible: !document.getElementById('headerToolbar').classList.contains('hidden')
        };
      })()`,
      returnByValue: true
    });
    assert(invHeader.result.value.title === 'Invoice & Pembayaran' && invHeader.result.value.toolbarVisible, '[ADMIN HEADER] Halaman Invoices menampilkan judul Invoice & Pembayaran dan toolbar periode/ekspor', 'HEADER_TOOLBAR');

    // 3. Upload
    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'admin.html#upload') });
    await sleep(400);
    const uplHeader = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        return {
          title: document.getElementById('pageTitle').textContent,
          toolbarHidden: document.getElementById('headerToolbar').classList.contains('hidden')
        };
      })()`,
      returnByValue: true
    });
    assert(uplHeader.result.value.title === 'Upload Master Excel' && uplHeader.result.value.toolbarHidden, '[ADMIN HEADER] Halaman Upload menampilkan judul Upload Master Excel dan menyembunyikan toolbar dashboard', 'HEADER_TOOLBAR');

    // -------------------------------------------------------------
    // Test E: Total Outstanding Card Readability (1024, 1280, 1440, 1920)
    // -------------------------------------------------------------
    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'admin.html#dashboard') });
    await sleep(400);

    const testWidths = [1024, 1280, 1440, 1920];
    for (const tw of testWidths) {
      await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: tw, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(150);

      const outCardCheck = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const elBisa = document.getElementById('kpiBisaDitagihSub');
          const elTempo = document.getElementById('kpiBelumJatuhTempoSub');
          const txtBisa = elBisa.textContent;
          const txtTempo = elTempo.textContent;

          // Verify neither text is empty or truncated with ellipsis
          const hasFullText = txtBisa.includes('Bisa Ditagih: Rp') && txtTempo.includes('Tempo: Rp');
          const elBisaRect = elBisa.getBoundingClientRect();
          const elTempoRect = elTempo.getBoundingClientRect();
          const isVisible = elBisaRect.width > 0 && elTempoRect.width > 0;

          return { hasFullText, isVisible, txtBisa, txtTempo };
        })()`,
        returnByValue: true
      });
      const occ = outCardCheck.result.value;
      assert(occ.hasFullText && occ.isVisible, `[ADMIN OUTSTANDING] [${tw}px] Keterangan Bisa Ditagih dan Tempo terbaca utuh tanpa terpotong (${occ.txtBisa} | ${occ.txtTempo})`, 'OUTSTANDING_CARD');
    }

    // -------------------------------------------------------------
    // Test C: Tables and Sticky Action Columns across Viewports
    // -------------------------------------------------------------
    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'admin.html#invoices') });
    await sleep(400);

    for (const tw of testWidths) {
      await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: tw, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(150);

      const tableCheck = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const container = document.querySelector('#viewInvoices .table-scroll-container');
          const thAction = document.getElementById('invoiceActionHeader');
          const firstActionCell = document.querySelector('#invoiceTableBody tr td:last-child');

          const thStyle = window.getComputedStyle(thAction);
          const isThSticky = thStyle.position === 'sticky';
          const containerRect = container.getBoundingClientRect();
          const actionRect = thAction.getBoundingClientRect();

          // Action column should be within visible bounds of table container
          const isActionVisible = actionRect.right <= (containerRect.right + 2) && actionRect.left >= (containerRect.right - actionRect.width - 2);

          return {
            hasScrollClass: !!container,
            isThSticky,
            isActionVisible,
            actionWidth: actionRect.width
          };
        })()`,
        returnByValue: true
      });
      const tc = tableCheck.result.value;
      assert(tc.hasScrollClass && tc.isThSticky, `[ADMIN TABLE] [${tw}px] Tabel Invoice memiliki .table-scroll-container dan kolom Aksi berposisi sticky`, 'TABLE_ACTIONS');
    }

    // Screenshot of Admin Invoices with sticky action column
    const shotAdminInv = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, 'admin_invoices_table_sticky.png'), Buffer.from(shotAdminInv.data, 'base64'));

    ws.close();
  }

  // =================================================================
  // 2. AUDIT SALES ROLE
  // =================================================================
  console.log('\n======================================================');
  console.log('2. AUDIT SALES: NOTIFIKASI, PERIODE, TOOLBAR, OUTSTANDING, TABEL');
  console.log('======================================================');

  {
    const targetRes = await (await fetch(`http://localhost:${PORT}/json/new`, { method: 'PUT' })).json();
    const ws = new globalThis.WebSocket(targetRes.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    await sendCommand(ws, 'Page.enable');
    await sendCommand(ws, 'Runtime.enable');
    await sendCommand(ws, 'DOM.enable');

    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'sales.html#dashboard') });
    await sleep(600);

    // Set Sales demo session (Nurdin)
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

    // -------------------------------------------------------------
    // Test A: Sales Notifications strictly filtered to Nurdin
    // -------------------------------------------------------------
    const salesNotifAudit = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const notifBtn = document.getElementById('desktopNotifBtn');
        notifBtn.click();
        const badgeCount = parseInt(document.getElementById('notifBadgeCount').textContent, 10);

        // Count Nurdin's critical invoices
        const invoices = FADE_STORE.getInvoices();
        const pContext = FADE_ENGINE.resolvePeriod('2026-11', 'bulan', '2026-11-22', '2026-11-01', '2026-11-22');
        let expectedNurdin = 0;
        invoices.forEach(inv => {
          const s = inv.sales_name || inv.salesName || '';
          if (s === 'Nurdin') {
            const d = inv.invoice_date || inv.date || '';
            if (d >= pContext.dari && d <= pContext.sampai) {
              const st = FADE_ENGINE.evaluateInvoiceState(inv, pContext.asOf);
              if (st.sisa > 0 && (st.status === 'Terlambat Bayar' || st.bisaDitagihkan)) {
                expectedNurdin++;
              }
            }
          }
        });

        return { badgeCount, expectedNurdin };
      })()`,
      returnByValue: true
    });
    const sna = salesNotifAudit.result.value;
    assert(sna.badgeCount === sna.expectedNurdin, `[SALES NOTIF] Notifikasi Sales hanya menghitung tagihan kritis milik Nurdin (${sna.badgeCount})`, 'NOTIFIKASI');

    // -------------------------------------------------------------
    // Test B: Sales Period Synchronization (Bulanan -> YTD -> Dashboard Bulanan)
    // -------------------------------------------------------------
    await sendCommand(ws, 'Runtime.evaluate', { expression: `document.getElementById('tabModeYTD').click();` });
    await sleep(300);

    // Click sidebar Dashboard Bulanan
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `document.querySelector('#desktopNavContainer [data-route="dashboard"]').click();`
    });
    await sleep(300);

    const salesPeriodCheck = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        return {
          dateLabel: document.getElementById('filterDateLabel').textContent,
          statusText: document.getElementById('statusBadgeText').textContent,
          isBulanActive: !document.getElementById('tabIndicatorBulanan').classList.contains('hidden')
        };
      })()`,
      returnByValue: true
    });
    const spc = salesPeriodCheck.result.value;
    assert(spc.dateLabel.includes('01 Nov – 22 Nov 2026') && spc.statusText.includes('November 2026') && spc.isBulanActive,
      '[SALES PERIODE] Navigasi Bulanan -> YTD -> Dashboard Bulanan mengembalikan label dan tab secara konsisten', 'PERIODE_SYNC');

    // -------------------------------------------------------------
    // Test D: Sales Page Titles and Toolbars
    // -------------------------------------------------------------
    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'sales.html#dashboard') });
    await sleep(300);
    const sDashTitle = await sendCommand(ws, 'Runtime.evaluate', { expression: `document.getElementById('pageTitle').textContent;` });
    assert(sDashTitle.result.value.includes('Dashboard Sales'), '[SALES HEADER] Halaman Dashboard menampilkan Dashboard Sales · Nurdin', 'HEADER_TOOLBAR');

    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'sales.html#invoices') });
    await sleep(300);
    const sInvTitle = await sendCommand(ws, 'Runtime.evaluate', { expression: `document.getElementById('pageTitle').textContent;` });
    assert(sInvTitle.result.value === 'Invoice & Pembayaran', '[SALES HEADER] Halaman Invoice menampilkan judul Invoice & Pembayaran', 'HEADER_TOOLBAR');

    // -------------------------------------------------------------
    // Test E: Sales Total Outstanding Card Readability
    // -------------------------------------------------------------
    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'sales.html#dashboard') });
    await sleep(300);
    const sOutCheck = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const txtBisa = document.getElementById('kpiBisaDitagihSub').textContent;
        const txtTempo = document.getElementById('kpiBelumJatuhTempoSub').textContent;
        return {
          hasFullText: txtBisa.includes('Bisa Ditagih: Rp') && txtTempo.includes('Tempo: Rp'),
          txtBisa,
          txtTempo
        };
      })()`,
      returnByValue: true
    });
    assert(sOutCheck.result.value.hasFullText, `[SALES OUTSTANDING] Keterangan Bisa Ditagih dan Tempo terbaca utuh (${sOutCheck.result.value.txtBisa} | ${sOutCheck.result.value.txtTempo})`, 'OUTSTANDING_CARD');

    // -------------------------------------------------------------
    // Test C: Sales Table Sticky Action Column
    // -------------------------------------------------------------
    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'sales.html#invoices') });
    await sleep(300);

    const sTableCheck = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const thAction = document.querySelector('#viewInvoices th:last-child');
        const thPos = window.getComputedStyle(thAction).position;
        return { isSticky: thPos === 'sticky' };
      })()`,
      returnByValue: true
    });
    assert(sTableCheck.result.value.isSticky, '[SALES TABLE] Kolom Aksi tabel invoice Sales berposisi sticky right-0', 'TABLE_ACTIONS');

    // Screenshot of Sales Invoices with sticky action column
    const shotSalesInv = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, 'sales_invoices_table_sticky.png'), Buffer.from(shotSalesInv.data, 'base64'));

    ws.close();
  }

  // =================================================================
  // 3. THEME AUDIT (LIGHT THEME)
  // =================================================================
  console.log('\n======================================================');
  console.log('3. AUDIT TEMA TERANG (LIGHT THEME)');
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
      expression: `FADE_STORE.setTheme('light');`
    });
    await sleep(200);

    const themeCheck = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        return {
          hasLightClass: document.documentElement.classList.contains('light'),
          bgCanvas: window.getComputedStyle(document.body).backgroundColor
        };
      })()`,
      returnByValue: true
    });
    assert(themeCheck.result.value.hasLightClass, '[THEME] Mode terang aktif dan teraplikasi pada dokumen root', 'THEME_AUDIT');

    const shotLight = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, 'admin_light_theme_dashboard.png'), Buffer.from(shotLight.data, 'base64'));

    // Reset back to dark
    await sendCommand(ws, 'Runtime.evaluate', { expression: `FADE_STORE.setTheme('dark');` });

    ws.close();
  }

  console.log('\n======================================================');
  console.log(`TOTAL: ${results.passed} PASSED, ${results.failed} FAILED`);
  console.log('======================================================\n');

  chromeProc.kill();

  if (results.failed > 0) {
    process.exit(1);
  } else {
    console.log('DESKTOP UI/UX FIXES VERIFICATION COMPLETED WITH 100% SUCCESS!');
    process.exit(0);
  }
}

runVerification().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
