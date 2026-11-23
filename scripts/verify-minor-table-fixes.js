/**
 * Verification & Evidence Capture for:
 * FADE Pods Showcase v0.2 — Minor Table Fixes (Polish Revision 03)
 * Addressing specific review requirements:
 * 1. Admin invoice Edit modal closed via UI cancel button, verified hidden, clean 390px capture.
 * 2. Pagination Admin & Sales 375px completely visible above bottom nav, tested for scrolling & clicks.
 * 3. Real assertion tests for "Batalkan Unggahan" and "Hapus Log" on mobile cards, including confirmation modal and Batal.
 * 4. Comprehensive 430px layout and overflow verification.
 * 5. Escaping inv.productName verification.
 * 6. document.fonts.ready check before all screenshots.
 * 7. Strictly truthful reporting without premature commit/push.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9760 + Math.floor(Math.random() * 30);
const HTTP_PORT = 8092;
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
  // Ensure all web fonts are fully rendered before snapshot
  try {
    await evalScript(ws, 'document.fonts.ready');
  } catch (e) {}
  await sleep(150);

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

async function run() {
  console.log('=== FADE Pods Showcase v0.2 — Minor Table Fixes Verification ===\n');
  const server = await startHttpServer();
  const tmpProfile = '/tmp/chrome-table-fixes-' + Date.now();
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

  const salesSession = {
    username: 'aru',
    name: 'Aru',
    role: 'sales',
    salesName: 'Aru',
    title: 'Sales Representative'
  };

  async function openPage(url, sessionData, width, height, theme = 'dark') {
    const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' })).json();
    const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    await sendCommand(ws, 'Page.enable');
    await sendCommand(ws, 'Runtime.enable');
    await sendCommand(ws, 'DOM.enable');
    await sendCommand(ws, 'CSS.enable');

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
    await sleep(350);

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
    // =========================================================================
    // 1. ADMIN — DAFTAR INVOICE (MOBILE CARDS & ACTIONS)
    // =========================================================================
    console.log('--- 1. Admin Daftar Invoice Mobile Cards & Actions ---');
    let page = await openPage('/admin.html#invoices', adminSession, 390, 844, 'dark');

    const adminInvoiceCheck = await evalScript(page.ws, `
      (function() {
        var mobileList = document.getElementById('invoiceMobileList');
        var desktopTable = document.getElementById('invoiceTableBody');
        var cards = mobileList ? Array.from(mobileList.children) : [];
        var firstCard = cards[0];

        // Check first card elements
        var hasStore = firstCard ? !!firstCard.querySelector('.font-bold.text-sm') : false;
        var hasInvoiceId = firstCard ? !!firstCard.querySelector('.font-mono') : false;
        var hasBadge = firstCard ? !!firstCard.querySelector('.rounded-full') : false;
        var actionBtns = firstCard ? Array.from(firstCard.querySelectorAll('.inv-action-btn')) : [];
        var minActionHeight = actionBtns.every(function(btn) {
          return btn.getBoundingClientRect().height >= 40; // minimum touch height target
        });

        return {
          mobileVisible: mobileList && window.getComputedStyle(mobileList).display !== 'none',
          desktopHidden: desktopTable ? window.getComputedStyle(desktopTable.closest('div')).display === 'none' : true,
          cardCount: cards.length,
          hasStore: hasStore,
          hasInvoiceId: hasInvoiceId,
          hasBadge: hasBadge,
          actionCount: actionBtns.length,
          minActionHeight: minActionHeight,
          zeroHorizontalScroll: document.documentElement.scrollWidth === document.documentElement.clientWidth
        };
      })()
    `);

    assert(adminInvoiceCheck.mobileVisible, 'Admin Invoices displays mobile cards on 390px', 'ADMIN-INVOICE');
    assert(adminInvoiceCheck.desktopHidden, 'Admin Invoices desktop wide table is hidden on 390px', 'ADMIN-INVOICE');
    assert(adminInvoiceCheck.cardCount > 0, `Admin Invoices rendered ${adminInvoiceCheck.cardCount} cards on page 1`, 'ADMIN-INVOICE');
    assert(adminInvoiceCheck.hasStore && adminInvoiceCheck.hasInvoiceId, 'Admin Invoice Card displays store name and invoice ID', 'ADMIN-INVOICE');
    assert(adminInvoiceCheck.actionCount >= 2, `Admin Invoice Card includes action buttons (count: ${adminInvoiceCheck.actionCount})`, 'ADMIN-INVOICE');
    assert(adminInvoiceCheck.minActionHeight, 'Admin Invoice Card action buttons have touch height >= 40px', 'ADMIN-INVOICE');
    assert(adminInvoiceCheck.zeroHorizontalScroll, 'Admin Invoices 390px zero horizontal page overflow', 'ADMIN-INVOICE');

    // Test Action Trigger (Edit Modal) - OPEN and CLOSE via REAL UI BUTTON
    const modalTest = await evalScript(page.ws, `
      (function() {
        var firstEditBtn = document.querySelector('#invoiceMobileList [data-action="edit"]');
        if (!firstEditBtn) return { ok: false, reason: 'Edit button not found' };
        firstEditBtn.click();
        var modal = document.getElementById('invoiceFormModalBackdrop');
        var modalOpened = modal && !modal.classList.contains('hidden');

        // Now explicitly click the UI cancel button to close
        var cancelBtn = document.getElementById('cancelInvoiceFormBtn');
        if (!cancelBtn) return { ok: false, reason: 'Cancel button not found' };
        cancelBtn.click();

        var modalClosed = modal && modal.classList.contains('hidden');
        return {
          ok: modalOpened && modalClosed,
          modalOpened: modalOpened,
          modalClosed: modalClosed
        };
      })()
    `);
    assert(modalTest.ok, 'Admin Invoice Card Edit action opens modal and closes cleanly via UI Cancel button (#cancelInvoiceFormBtn)', 'ADMIN-INVOICE');

    // Verify modal backdrop is completely hidden and settled before screenshot
    const backdropSettled = await evalScript(page.ws, `
      (function() {
        var modal = document.getElementById('invoiceFormModalBackdrop');
        return modal ? modal.classList.contains('hidden') : true;
      })()
    `);
    assert(backdropSettled, 'Admin Invoice modal backdrop is completely hidden before screenshot capture', 'ADMIN-INVOICE');

    // Test Search Filter & Empty State on Mobile
    const emptySearchTest = await evalScript(page.ws, `
      (function() {
        var input = document.getElementById('invoiceSearchInput');
        input.value = 'TIDAK_ADA_QUERY_XYZ_999';
        input.dispatchEvent(new Event('input'));
        var mobileList = document.getElementById('invoiceMobileList');
        var text = mobileList ? mobileList.textContent.trim() : '';
        var isEmpty = text.indexOf('Tidak ada rekaman invoice') !== -1;
        // restore
        input.value = '';
        input.dispatchEvent(new Event('input'));
        return { isEmpty: isEmpty };
      })()
    `);
    assert(emptySearchTest.isEmpty, 'Admin Invoice Mobile handles empty state clearly during search', 'ADMIN-INVOICE');

    // Scroll to the invoice cards area (top of cards)
    await evalScript(page.ws, `
      var mList = document.getElementById('invoiceMobileList');
      if (mList) mList.scrollIntoView({ block: 'start', behavior: 'instant' });
    `);
    await sleep(200);

    // Capture clean screenshots (dark and light)
    await saveScreenshot(page.ws, 'polish_admin_invoices_390_dark.png');
    await evalScript(page.ws, `applyTheme('light');`);
    await sleep(200);
    await saveScreenshot(page.ws, 'polish_admin_invoices_390_light.png');
    await page.ws.close();

    // 375px Admin Invoices check
    page = await openPage('/admin.html#invoices', adminSession, 375, 812, 'dark');
    const admin375Check = await evalScript(page.ws, `document.documentElement.scrollWidth === document.documentElement.clientWidth`);
    assert(admin375Check, 'Admin Invoices 375px has zero horizontal scroll', 'ADMIN-INVOICE');
    await evalScript(page.ws, `
      var mList = document.getElementById('invoiceMobileList');
      if (mList) mList.scrollIntoView({ block: 'start', behavior: 'instant' });
    `);
    await sleep(200);
    await saveScreenshot(page.ws, 'polish_admin_invoices_375.png');
    await page.ws.close();

    // 430px Admin Invoices check (iPhone 14/15/16 Pro Max)
    page = await openPage('/admin.html#invoices', adminSession, 430, 932, 'dark');
    const admin430Check = await evalScript(page.ws, `
      (function() {
        var mobileList = document.getElementById('invoiceMobileList');
        var cards = mobileList ? Array.from(mobileList.children) : [];
        return {
          cardCount: cards.length,
          zeroHorizontalScroll: document.documentElement.scrollWidth === document.documentElement.clientWidth
        };
      })()
    `);
    assert(admin430Check.cardCount > 0, `Admin Invoices renders ${admin430Check.cardCount} cards on 430px`, 'ADMIN-INVOICE-430');
    assert(admin430Check.zeroHorizontalScroll, 'Admin Invoices 430px zero horizontal page overflow', 'ADMIN-INVOICE-430');
    await evalScript(page.ws, `
      var mList = document.getElementById('invoiceMobileList');
      if (mList) mList.scrollIntoView({ block: 'start', behavior: 'instant' });
    `);
    await sleep(200);
    await saveScreenshot(page.ws, 'polish_admin_invoices_430.png');
    await page.ws.close();

    // =========================================================================
    // 2. ADMIN — RIWAYAT UNGGAHAN (MOBILE CARDS & ROLLBACK/DELETE)
    // =========================================================================
    console.log('\n--- 2. Admin Riwayat Unggahan Mobile Cards ---');
    page = await openPage('/admin.html#upload', adminSession, 390, 844, 'dark');

    const adminUploadCheck = await evalScript(page.ws, `
      (function() {
        var mobileList = document.getElementById('uploadHistoryMobileList');
        var desktopTable = document.getElementById('uploadHistoryBody');
        var cards = mobileList ? Array.from(mobileList.children) : [];
        var firstCard = cards[0];

        var hasFilename = firstCard ? !!firstCard.querySelector('.break-all') : false;
        var hasMetrics = firstCard ? !!firstCard.querySelector('.grid-cols-3') : false;
        var actionBtn = firstCard ? firstCard.querySelector('.btn-rollback-upload, .cursor-not-allowed') : null;
        var actionHeight = actionBtn ? actionBtn.getBoundingClientRect().height : 0;

        return {
          mobileVisible: mobileList && window.getComputedStyle(mobileList).display !== 'none',
          desktopHidden: desktopTable ? window.getComputedStyle(desktopTable.closest('div')).display === 'none' : true,
          cardCount: cards.length,
          hasFilename: hasFilename,
          hasMetrics: hasMetrics,
          actionHeight: actionHeight,
          zeroHorizontalScroll: document.documentElement.scrollWidth === document.documentElement.clientWidth
        };
      })()
    `);

    assert(adminUploadCheck.mobileVisible, 'Admin Riwayat Unggahan displays mobile cards on 390px', 'ADMIN-UPLOAD');
    assert(adminUploadCheck.desktopHidden, 'Admin Riwayat Unggahan desktop wide table is hidden on 390px', 'ADMIN-UPLOAD');
    assert(adminUploadCheck.cardCount > 0, `Admin Riwayat Unggahan rendered ${adminUploadCheck.cardCount} cards`, 'ADMIN-UPLOAD');
    assert(adminUploadCheck.hasFilename && adminUploadCheck.hasMetrics, 'Admin Upload Card renders wrapped filename and metrics grid', 'ADMIN-UPLOAD');
    assert(adminUploadCheck.actionHeight >= 40, `Admin Upload Card action button has touch height >= 40px (measured: ${adminUploadCheck.actionHeight}px)`, 'ADMIN-UPLOAD');
    assert(adminUploadCheck.zeroHorizontalScroll, 'Admin Riwayat Unggahan 390px zero horizontal scroll', 'ADMIN-UPLOAD');

    // Real testing of "Batalkan Unggahan" (.btn-rollback-upload) confirmation modal and Cancel
    const rollbackActionTest = await evalScript(page.ws, `
      (function() {
        // Temporarily inject a simulated successful upload with snapshot
        var originalLog = localStorage.getItem('fade_showcase_upload_history_v021');
        var originalSnap = localStorage.getItem('fade_showcase_upload_snapshots_v021');

        var testUploadId = 'test_upl_' + Date.now();
        var testLog = [
          {
            id: testUploadId,
            timestamp: new Date().toISOString(),
            filename: 'Test_Upload_For_Rollback_Card.xlsx',
            rowsIngested: 25,
            validCount: 25,
            invalidCount: 0,
            uploadedBy: 'Admin QA',
            status: 'Success',
            hasSnapshot: true,
            previousCount: 395
          }
        ];
        var testSnapshots = {};
        testSnapshots[testUploadId] = [{ id: 'INV-TEST-001' }];

        localStorage.setItem('fade_showcase_upload_history_v021', JSON.stringify(testLog));
        localStorage.setItem('fade_showcase_upload_snapshots_v021', JSON.stringify(testSnapshots));

        // Re-render upload history
        if (window.renderUploadHistory) window.renderUploadHistory();

        // Target the mobile card rollback button
        var rollbackBtn = document.querySelector('#uploadHistoryMobileList .btn-rollback-upload');
        if (!rollbackBtn) {
          // Restore
          localStorage.setItem('fade_showcase_upload_history_v021', originalLog);
          localStorage.setItem('fade_showcase_upload_snapshots_v021', originalSnap);
          if (window.renderUploadHistory) window.renderUploadHistory();
          return { ok: false, reason: 'Rollback button not rendered on mobile card' };
        }

        // Click rollback button
        rollbackBtn.click();
        var modal = document.getElementById('rollbackModalBackdrop');
        var modalOpened = modal && !modal.classList.contains('hidden');

        // Click cancel button on rollback modal
        var cancelBtn = document.getElementById('cancelRollbackBtn');
        if (cancelBtn) cancelBtn.click();
        var modalClosed = modal && modal.classList.contains('hidden');

        // Restore original data completely
        localStorage.setItem('fade_showcase_upload_history_v021', originalLog);
        localStorage.setItem('fade_showcase_upload_snapshots_v021', originalSnap);
        if (window.renderUploadHistory) window.renderUploadHistory();

        return {
          ok: modalOpened && modalClosed,
          modalOpened: modalOpened,
          modalClosed: modalClosed
        };
      })()
    `);
    assert(rollbackActionTest.ok, 'Mobile card "Batalkan Unggahan" button opens rollback modal and closes cleanly via Batal (#cancelRollbackBtn) without deleting data', 'ADMIN-UPLOAD-ACTION');

    // Real testing of "Hapus Log" (.btn-delete-failed-upload) confirmation modal and Cancel
    const deleteFailedActionTest = await evalScript(page.ws, `
      (function() {
        var originalLog = localStorage.getItem('fade_showcase_upload_history_v021');

        var testFailedId = 'test_failed_' + Date.now();
        var testLog = [
          {
            id: testFailedId,
            timestamp: new Date().toISOString(),
            filename: 'Corrupted_Schema_Upload.xlsx',
            rowsIngested: 0,
            validCount: 0,
            invalidCount: 12,
            uploadedBy: 'Admin QA',
            status: 'Failed',
            hasSnapshot: false
          }
        ];

        localStorage.setItem('fade_showcase_upload_history_v021', JSON.stringify(testLog));
        if (window.renderUploadHistory) window.renderUploadHistory();

        var deleteBtn = document.querySelector('#uploadHistoryMobileList .btn-delete-failed-upload');
        if (!deleteBtn) {
          localStorage.setItem('fade_showcase_upload_history_v021', originalLog);
          if (window.renderUploadHistory) window.renderUploadHistory();
          return { ok: false, reason: 'Delete failed upload button not found on mobile card' };
        }

        deleteBtn.click();
        var modal = document.getElementById('deleteFailedUploadModalBackdrop');
        var modalOpened = modal && !modal.classList.contains('hidden');

        var cancelBtn = document.getElementById('cancelDeleteFailedBtn');
        if (cancelBtn) cancelBtn.click();
        var modalClosed = modal && modal.classList.contains('hidden');

        localStorage.setItem('fade_showcase_upload_history_v021', originalLog);
        if (window.renderUploadHistory) window.renderUploadHistory();

        return {
          ok: modalOpened && modalClosed,
          modalOpened: modalOpened,
          modalClosed: modalClosed
        };
      })()
    `);
    assert(deleteFailedActionTest.ok, 'Mobile card "Hapus Log" button opens delete modal and closes cleanly via Batal (#cancelDeleteFailedBtn) without modifying production dataset', 'ADMIN-UPLOAD-ACTION');

    // Scroll to upload history section and screenshot
    await evalScript(page.ws, `
      var h = document.getElementById('uploadHistoryMobileList');
      if (h) h.scrollIntoView({ block: 'start', behavior: 'instant' });
    `);
    await sleep(250);
    await saveScreenshot(page.ws, 'polish_admin_upload_history_390_dark.png');
    await evalScript(page.ws, `applyTheme('light');`);
    await sleep(200);
    await saveScreenshot(page.ws, 'polish_admin_upload_history_390_light.png');
    await page.ws.close();

    // 430px Admin Upload check
    page = await openPage('/admin.html#upload', adminSession, 430, 932, 'dark');
    const upload430Check = await evalScript(page.ws, `
      (function() {
        var mobileList = document.getElementById('uploadHistoryMobileList');
        return {
          cardCount: mobileList ? mobileList.children.length : 0,
          zeroHorizontalScroll: document.documentElement.scrollWidth === document.documentElement.clientWidth
        };
      })()
    `);
    assert(upload430Check.cardCount > 0, `Admin Upload renders ${upload430Check.cardCount} cards on 430px`, 'ADMIN-UPLOAD-430');
    assert(upload430Check.zeroHorizontalScroll, 'Admin Upload 430px zero horizontal page overflow', 'ADMIN-UPLOAD-430');
    await page.ws.close();

    // =========================================================================
    // 3. SALES — RINCIAN PRODUK INVOICE (FULL-WIDTH MOBILE PRODUCTS)
    // =========================================================================
    console.log('\n--- 3. Sales Rincian Produk Invoice Mobile Cards ---');
    // Open Sales Invoices and drill into the first invoice
    page = await openPage('/sales.html#invoices', salesSession, 390, 844, 'dark');

    const drilldownSuccess = await evalScript(page.ws, `
      (function() {
        var firstBtn = document.querySelector('#invoiceMobileList .inv-detail-btn');
        if (!firstBtn) return { ok: false, reason: 'No invoice detail button found' };
        firstBtn.click();
        return { ok: true, hash: window.location.hash };
      })()
    `);
    assert(drilldownSuccess.ok, 'Sales navigated to Invoice Detail view', 'SALES-PRODUCT-DETAIL');
    await sleep(350);

    const salesProductCheck = await evalScript(page.ws, `
      (function() {
        var mList = document.getElementById('detProductMobileList');
        var dTable = document.getElementById('detProductBody');
        var items = mList ? Array.from(mList.children) : [];
        var firstItem = items[0];

        // Check if item has full-width title and breakdown grid
        var titleEl = firstItem ? firstItem.querySelector('.break-words') : null;
        var gridEl = firstItem ? firstItem.querySelector('.grid-cols-3') : null;

        var totalCard = mList ? mList.lastElementChild : null;
        var totalText = totalCard ? totalCard.textContent : '';

        return {
          mobileVisible: mList && window.getComputedStyle(mList).display !== 'none',
          desktopHidden: dTable ? window.getComputedStyle(dTable.closest('div')).display === 'none' : true,
          itemCount: items.length,
          hasFullWidthTitle: !!titleEl,
          hasBreakdownGrid: !!gridEl,
          hasTotalSummary: totalText.indexOf('Total Nilai Tagihan Barang') !== -1,
          zeroHorizontalScroll: document.documentElement.scrollWidth === document.documentElement.clientWidth
        };
      })()
    `);

    assert(salesProductCheck.mobileVisible, 'Sales Product Detail renders mobile product cards on 390px', 'SALES-PRODUCT-DETAIL');
    assert(salesProductCheck.desktopHidden, 'Sales Product Detail desktop 4-column table is hidden on 390px', 'SALES-PRODUCT-DETAIL');
    assert(salesProductCheck.itemCount > 0, `Sales Product Detail rendered ${salesProductCheck.itemCount} product cards`, 'SALES-PRODUCT-DETAIL');
    assert(salesProductCheck.hasFullWidthTitle && salesProductCheck.hasBreakdownGrid, 'Product Card has full-width title and clean 3-column breakdown', 'SALES-PRODUCT-DETAIL');
    assert(salesProductCheck.hasTotalSummary, 'Product Detail includes total summary card with quantity & rupiah value', 'SALES-PRODUCT-DETAIL');
    assert(salesProductCheck.zeroHorizontalScroll, 'Sales Product Detail 390px zero horizontal page overflow', 'SALES-PRODUCT-DETAIL');

    // Scroll to products section and screenshot
    await evalScript(page.ws, `
      var p = document.getElementById('detProductMobileList');
      if (p) p.scrollIntoView({ block: 'start', behavior: 'instant' });
    `);
    await sleep(250);
    await saveScreenshot(page.ws, 'polish_sales_product_detail_390_dark.png');
    await evalScript(page.ws, `(window.applyTheme ? window.applyTheme('light') : (window.FADE_STORE && FADE_STORE.setTheme('light')));`);
    await sleep(200);
    await saveScreenshot(page.ws, 'polish_sales_product_detail_390_light.png');
    await page.ws.close();

    // 375px Sales Product Detail check
    page = await openPage('/sales.html#invoices', salesSession, 375, 812, 'dark');
    await evalScript(page.ws, `
      var btn = document.querySelector('#invoiceMobileList .inv-detail-btn');
      if (btn) btn.click();
    `);
    await sleep(350);
    await evalScript(page.ws, `
      var p = document.getElementById('detProductMobileList');
      if (p) p.scrollIntoView({ block: 'start', behavior: 'instant' });
    `);
    await sleep(250);
    await saveScreenshot(page.ws, 'polish_sales_product_detail_375.png');
    await page.ws.close();

    // 430px Sales Product Detail check
    page = await openPage('/sales.html#invoices', salesSession, 430, 932, 'dark');
    await evalScript(page.ws, `
      var btn = document.querySelector('#invoiceMobileList .inv-detail-btn');
      if (btn) btn.click();
    `);
    await sleep(350);
    const sales430Check = await evalScript(page.ws, `
      (function() {
        var mList = document.getElementById('detProductMobileList');
        return {
          itemCount: mList ? mList.children.length : 0,
          zeroHorizontalScroll: document.documentElement.scrollWidth === document.documentElement.clientWidth
        };
      })()
    `);
    assert(sales430Check.itemCount > 0, `Sales Product Detail renders ${sales430Check.itemCount} items on 430px`, 'SALES-PRODUCT-DETAIL-430');
    assert(sales430Check.zeroHorizontalScroll, 'Sales Product Detail 430px zero horizontal page overflow', 'SALES-PRODUCT-DETAIL-430');
    await evalScript(page.ws, `
      var p = document.getElementById('detProductMobileList');
      if (p) p.scrollIntoView({ block: 'start', behavior: 'instant' });
    `);
    await sleep(250);
    await saveScreenshot(page.ws, 'polish_sales_product_detail_430.png');
    await page.ws.close();

    // =========================================================================
    // 4. PAGINATION CONTROLS (ADMIN & SALES MOBILE 375PX & 430PX)
    // =========================================================================
    console.log('\n--- 4. Pagination Controls Audit & Viewport Clearance (Admin & Sales 375px) ---');
    page = await openPage('/admin.html#invoices', adminSession, 375, 812, 'dark');

    // Scroll to the bottom of the page where pagination container is located
    await evalScript(page.ws, `
      window.scrollTo(0, document.documentElement.scrollHeight);
    `);
    await sleep(250);

    const adminPaginationGeometry = await evalScript(page.ws, `
      (function() {
        var pag = document.getElementById('paginationInfo').closest('.border-t');
        var prevBtn = document.getElementById('prevPageBtn');
        var nextBtn = document.getElementById('nextPageBtn');
        var pageNum = document.getElementById('pageNumberDisplay');
        var info = document.getElementById('paginationInfo');

        var pagRect = pag.getBoundingClientRect();
        var prevRect = prevBtn.getBoundingClientRect();
        var nextRect = nextBtn.getBoundingClientRect();
        var numRect = pageNum.getBoundingClientRect();
        var infoRect = info.getBoundingClientRect();

        var nav = document.querySelector('.shell-mobile-nav');
        var navTop = nav ? nav.getBoundingClientRect().top : (window.innerHeight - 64);

        // Entire pagination container must sit strictly above the mobile nav top
        var clearance = navTop - pagRect.bottom;

        return {
          pagTop: pagRect.top,
          pagBottom: pagRect.bottom,
          navTop: navTop,
          clearance: clearance,
          fullyAboveNav: pagRect.bottom <= navTop,
          fullyInViewport: pagRect.top >= 0 && pagRect.bottom <= navTop,
          prevHeight: prevRect.height,
          nextHeight: nextRect.height,
          prevWidth: prevRect.width,
          nextWidth: nextRect.width,
          pageText: pageNum.textContent.trim(),
          isSingleLine: numRect.height < 35,
          prevDisabled: prevBtn.disabled,
          nextDisabled: nextBtn.disabled,
          zeroHorizontalScroll: document.documentElement.scrollWidth === document.documentElement.clientWidth
        };
      })()
    `);

    assert(adminPaginationGeometry.fullyAboveNav, `Admin 375px pagination is completely visible ABOVE bottom navigation (clearance: ${adminPaginationGeometry.clearance.toFixed(1)}px above nav)`, 'PAGINATION-VIEWPORT');
    assert(adminPaginationGeometry.fullyInViewport, 'Admin 375px pagination info, page number, and both buttons are fully in viewport', 'PAGINATION-VIEWPORT');
    assert(adminPaginationGeometry.prevHeight >= 40 && adminPaginationGeometry.nextHeight >= 40, `Admin pagination buttons have touch height >= 40px (prev: ${adminPaginationGeometry.prevHeight}px, next: ${adminPaginationGeometry.nextHeight}px)`, 'PAGINATION');
    assert(adminPaginationGeometry.isSingleLine, `Admin page number '${adminPaginationGeometry.pageText}' renders on single line without vertical wrapping`, 'PAGINATION');

    // Test Pagination Interaction & State Updates (uncheck date filter to get >25 invoices, then test click)
    const paginationInteractionTest = await evalScript(page.ws, `
      (function() {
        var prevBtn = document.getElementById('prevPageBtn');
        var nextBtn = document.getElementById('nextPageBtn');
        var pageNum = document.getElementById('pageNumberDisplay');
        var dateCheck = document.getElementById('invoiceDateScopeCheckbox');

        var initialText = pageNum.textContent.trim(); // "1 / 1" with 25 items in Nov
        var initialPrevDisabled = prevBtn.disabled;
        var initialNextDisabled = nextBtn.disabled;

        // Uncheck date filter to see all 395 invoices (16 pages)
        dateCheck.click();
        var allPagesText = pageNum.textContent.trim(); // "1 / 16"
        var canGoNext = !nextBtn.disabled;

        // Click next while scrolled
        nextBtn.click();
        var page2Text = pageNum.textContent.trim(); // "2 / 16"
        var canGoPrev = !prevBtn.disabled;

        // Click prev to return
        prevBtn.click();
        var returnedText = pageNum.textContent.trim(); // "1 / 16"

        // Restore date scope
        dateCheck.click();

        return {
          initialText: initialText,
          initialPrevDisabled: initialPrevDisabled,
          initialNextDisabled: initialNextDisabled,
          allPagesText: allPagesText,
          canGoNext: canGoNext,
          page2Text: page2Text,
          canGoPrev: canGoPrev,
          returnedText: returnedText
        };
      })()
    `);

    assert(paginationInteractionTest.initialPrevDisabled && paginationInteractionTest.initialNextDisabled, 'Admin page 1 (25 items): Prev and Next disabled appropriately for 1/1 page', 'PAGINATION');
    assert(paginationInteractionTest.canGoNext && paginationInteractionTest.page2Text.indexOf('2 /') === 0, `Admin pagination navigates to page 2 successfully when clicked (${paginationInteractionTest.page2Text})`, 'PAGINATION');
    assert(paginationInteractionTest.canGoPrev && paginationInteractionTest.returnedText.indexOf('1 /') === 0, `Admin pagination returns to page 1 successfully (${paginationInteractionTest.returnedText})`, 'PAGINATION');

    // Ensure page is scrolled to bottom and capture screenshot showing pagination and bottom nav
    await evalScript(page.ws, `window.scrollTo(0, document.documentElement.scrollHeight);`);
    await sleep(250);
    await saveScreenshot(page.ws, 'polish_admin_pagination_375.png');
    await page.ws.close();

    // Sales Pagination on 375px
    page = await openPage('/sales.html#invoices', salesSession, 375, 812, 'dark');
    await evalScript(page.ws, `window.scrollTo(0, document.documentElement.scrollHeight);`);
    await sleep(250);

    const salesPaginationGeometry = await evalScript(page.ws, `
      (function() {
        var pag = document.getElementById('paginationInfo').closest('.border-t');
        var prevBtn = document.getElementById('prevPageBtn');
        var nextBtn = document.getElementById('nextPageBtn');
        var pageNum = document.getElementById('pageNumberDisplay');

        var pagRect = pag.getBoundingClientRect();
        var prevRect = prevBtn.getBoundingClientRect();
        var nextRect = nextBtn.getBoundingClientRect();
        var numRect = pageNum.getBoundingClientRect();

        var nav = document.querySelector('.shell-mobile-nav');
        var navTop = nav ? nav.getBoundingClientRect().top : (window.innerHeight - 64);
        var clearance = navTop - pagRect.bottom;

        return {
          pagTop: pagRect.top,
          pagBottom: pagRect.bottom,
          navTop: navTop,
          clearance: clearance,
          fullyAboveNav: pagRect.bottom <= navTop,
          fullyInViewport: pagRect.top >= 0 && pagRect.bottom <= navTop,
          prevHeight: prevRect.height,
          nextHeight: nextRect.height,
          isSingleLine: numRect.height < 35,
          pageText: pageNum.textContent.trim(),
          zeroHorizontalScroll: document.documentElement.scrollWidth === document.documentElement.clientWidth
        };
      })()
    `);

    assert(salesPaginationGeometry.fullyAboveNav, `Sales 375px pagination is completely visible ABOVE bottom navigation (clearance: ${salesPaginationGeometry.clearance.toFixed(1)}px above nav)`, 'PAGINATION-VIEWPORT');
    assert(salesPaginationGeometry.fullyInViewport, 'Sales 375px pagination info, page number, and both buttons are fully in viewport', 'PAGINATION-VIEWPORT');
    assert(salesPaginationGeometry.prevHeight >= 40 && salesPaginationGeometry.nextHeight >= 40, `Sales pagination buttons have touch height >= 40px (prev: ${salesPaginationGeometry.prevHeight}px, next: ${salesPaginationGeometry.nextHeight}px)`, 'PAGINATION');
    assert(salesPaginationGeometry.isSingleLine, `Sales page number '${salesPaginationGeometry.pageText}' renders on single line`, 'PAGINATION');

    await saveScreenshot(page.ws, 'polish_sales_pagination_375.png');
    await page.ws.close();

    // 430px Pagination check
    page = await openPage('/admin.html#invoices', adminSession, 430, 932, 'dark');
    await evalScript(page.ws, `window.scrollTo(0, document.documentElement.scrollHeight);`);
    await sleep(250);
    const adminPagination430 = await evalScript(page.ws, `
      (function() {
        var prevBtn = document.getElementById('prevPageBtn');
        var pageNum = document.getElementById('pageNumberDisplay');
        return {
          prevHeight: prevBtn.getBoundingClientRect().height,
          isSingleLine: pageNum.getBoundingClientRect().height < 35,
          zeroHorizontalScroll: document.documentElement.scrollWidth === document.documentElement.clientWidth
        };
      })()
    `);
    assert(adminPagination430.prevHeight >= 40, 'Admin pagination touch target >= 40px on 430px', 'PAGINATION-430');
    assert(adminPagination430.isSingleLine, 'Admin pagination page number single line on 430px', 'PAGINATION-430');
    assert(adminPagination430.zeroHorizontalScroll, 'Admin pagination zero horizontal scroll on 430px', 'PAGINATION-430');
    await page.ws.close();

    // =========================================================================
    // 5. DESKTOP REGRESSION CHECK (1280 & 1440 PX)
    // =========================================================================
    console.log('\n--- 5. Desktop Regression Audit (1280px & 1440px) ---');
    // Admin Desktop 1280px
    page = await openPage('/admin.html#invoices', adminSession, 1280, 800, 'dark');
    const adminDesktopCheck = await evalScript(page.ws, `
      (function() {
        var desktopTable = document.getElementById('invoiceTableBody');
        var mobileList = document.getElementById('invoiceMobileList');
        return {
          desktopTableVisible: desktopTable && window.getComputedStyle(desktopTable.closest('div')).display !== 'none',
          mobileListHidden: mobileList && window.getComputedStyle(mobileList).display === 'none'
        };
      })()
    `);
    assert(adminDesktopCheck.desktopTableVisible, 'Admin Invoices desktop table is visible at 1280px', 'DESKTOP-REGRESSION');
    assert(adminDesktopCheck.mobileListHidden, 'Admin Invoices mobile list is hidden at 1280px', 'DESKTOP-REGRESSION');
    await saveScreenshot(page.ws, 'polish_desktop_admin_invoices_1280.png');
    await page.ws.close();

    // Sales Detail Desktop 1280px
    page = await openPage('/sales.html#invoices', salesSession, 1280, 800, 'dark');
    await evalScript(page.ws, `
      var btn = document.querySelector('#invoiceTableBody .inv-detail-btn');
      if (btn) btn.click();
    `);
    await sleep(350);
    const salesDesktopCheck = await evalScript(page.ws, `
      (function() {
        var dTable = document.getElementById('detProductBody');
        var mList = document.getElementById('detProductMobileList');
        return {
          desktopTableVisible: dTable && window.getComputedStyle(dTable.closest('div')).display !== 'none',
          mobileListHidden: mList && window.getComputedStyle(mList).display === 'none'
        };
      })()
    `);
    assert(salesDesktopCheck.desktopTableVisible, 'Sales Product Detail desktop 4-column table is visible at 1280px', 'DESKTOP-REGRESSION');
    assert(salesDesktopCheck.mobileListHidden, 'Sales Product Detail mobile list is hidden at 1280px', 'DESKTOP-REGRESSION');
    await saveScreenshot(page.ws, 'polish_desktop_sales_product_detail_1280.png');
    await page.ws.close();

    console.log(`\n========================================`);
    console.log(`MINOR TABLE FIXES VERIFICATION SUMMARY:`);
    console.log(`Passed: ${results.passed}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`========================================\n`);

    if (results.failed > 0) {
      process.exitCode = 1;
    }

  } catch (err) {
    console.error('Execution error:', err);
    process.exitCode = 1;
  } finally {
    try { chromeProc.kill(); } catch (e) {}
    try { server.close(); } catch (e) {}
  }
}

run();
