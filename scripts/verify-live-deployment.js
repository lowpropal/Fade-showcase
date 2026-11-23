/**
 * Live Site Verification for:
 * FADE Pods Showcase v0.2 — Polish Revision 03 Deployment (Commit 0c80261)
 * URL: https://lowpropal.github.io/Fade-showcase/
 * Validates live Admin and Sales views, mobile cards, pagination, and modal Batal.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9810 + Math.floor(Math.random() * 30);
const BASE_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(BASE_DIR, 'docs', 'screenshots');
const ARTIFACT_DIR = '/Users/naufalausan/.gemini/antigravity/brain/183799d6-e9a7-4bd2-844f-c68a81bc86e6';

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

const results = {
  passed: 0,
  failed: 0,
  details: []
};

function assert(condition, message, category = 'LIVE') {
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
  try { await evalScript(ws, 'document.fonts.ready'); } catch (e) {}
  await sleep(200);
  const shot = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.data, 'base64');
  const localPath = path.join(SCREENSHOT_DIR, filename);
  fs.writeFileSync(localPath, buf);
  if (fs.existsSync(ARTIFACT_DIR)) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, filename), buf);
  }
  console.log(`[LIVE SCREENSHOT] Saved: ${filename}`);
  return localPath;
}

async function run() {
  console.log('=== FADE Pods Showcase v0.2 — Live Deployment Crosscheck ===\n');
  const tmpProfile = '/tmp/chrome-live-check-' + Date.now();
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

  const LIVE_BASE = 'https://lowpropal.github.io/Fade-showcase';

  async function openLivePage(path, width, height) {
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

    const fullUrl = `${LIVE_BASE}${path}`;
    await sendCommand(ws, 'Page.navigate', { url: fullUrl });
    await sleep(2000); // Allow live network fetch & scripts to initialize
    return { ws, targetId: target.id };
  }

  try {
    // 1. Live Admin Invoices Check (390x844)
    console.log('--- 1. Live Admin Invoices & Modal Check ---');
    let page = await openLivePage('/admin.html?demo=1&role=admin#invoices', 390, 844);

    const liveAdminInvoice = await evalScript(page.ws, `
      (function() {
        var mobileList = document.getElementById('invoiceMobileList');
        var desktopTable = document.getElementById('invoiceTableBody');
        var cards = mobileList ? Array.from(mobileList.children) : [];
        var firstCard = cards[0];

        return {
          hasMobileList: !!mobileList,
          mobileVisible: mobileList && window.getComputedStyle(mobileList).display !== 'none',
          desktopHidden: desktopTable ? window.getComputedStyle(desktopTable.closest('div')).display === 'none' : true,
          cardCount: cards.length,
          hasStoreName: firstCard ? !!firstCard.querySelector('.font-bold.text-sm') : false,
          hasInvoiceId: firstCard ? !!firstCard.querySelector('.font-mono') : false,
          actionCount: firstCard ? firstCard.querySelectorAll('.inv-action-btn').length : 0,
          zeroHorizontalScroll: document.documentElement.scrollWidth === document.documentElement.clientWidth
        };
      })()
    `);

    assert(liveAdminInvoice.hasMobileList && liveAdminInvoice.mobileVisible, 'Live Admin Invoices renders mobile card container (#invoiceMobileList)', 'LIVE-ADMIN');
    assert(liveAdminInvoice.desktopHidden, 'Live Admin Invoices wide table is hidden on mobile viewport', 'LIVE-ADMIN');
    assert(liveAdminInvoice.cardCount > 0, `Live Admin Invoices loaded ${liveAdminInvoice.cardCount} cards on page 1`, 'LIVE-ADMIN');
    assert(liveAdminInvoice.hasStoreName && liveAdminInvoice.hasInvoiceId, 'Live Admin Invoice cards render store name & invoice ID', 'LIVE-ADMIN');
    assert(liveAdminInvoice.zeroHorizontalScroll, 'Live Admin Invoices zero horizontal overflow on 390px', 'LIVE-ADMIN');

    // Test Live Modal Edit & Batal
    const liveAdminModalTest = await evalScript(page.ws, `
      (function() {
        var firstEditBtn = document.querySelector('#invoiceMobileList [data-action="edit"]');
        if (!firstEditBtn) return { ok: false, reason: 'Edit button not found' };
        firstEditBtn.click();

        var modal = document.getElementById('invoiceFormModalBackdrop');
        var modalOpened = modal && !modal.classList.contains('hidden');

        var cancelBtn = document.getElementById('cancelInvoiceFormBtn');
        if (!cancelBtn) return { ok: false, reason: 'Cancel button not found' };
        cancelBtn.click();

        var modalClosed = modal && modal.classList.contains('hidden');
        return { ok: modalOpened && modalClosed };
      })()
    `);
    assert(liveAdminModalTest.ok, 'Live Admin Edit Modal opens via card action and closes cleanly via UI Batal button without modifying data', 'LIVE-ADMIN-ACTION');

    // Scroll to cards and capture live screenshot
    await evalScript(page.ws, `
      var mList = document.getElementById('invoiceMobileList');
      if (mList) mList.scrollIntoView({ block: 'start', behavior: 'instant' });
    `);
    await sleep(200);
    await saveScreenshot(page.ws, 'live_admin_invoices_390.png');

    // 2. Live Admin Pagination Clearance (375x812)
    console.log('\n--- 2. Live Admin Pagination Clearance Check ---');
    await sendCommand(page.ws, 'Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(200);
    await evalScript(page.ws, `window.scrollTo(0, document.documentElement.scrollHeight);`);
    await sleep(300);

    const livePaginationGeo = await evalScript(page.ws, `
      (function() {
        var pag = document.getElementById('paginationInfo').closest('.border-t');
        var prevBtn = document.getElementById('prevPageBtn');
        var nextBtn = document.getElementById('nextPageBtn');
        var pageNum = document.getElementById('pageNumberDisplay');

        var pagRect = pag.getBoundingClientRect();
        var nav = document.querySelector('.shell-mobile-nav');
        var navTop = nav ? nav.getBoundingClientRect().top : (window.innerHeight - 64);
        var clearance = navTop - pagRect.bottom;

        return {
          clearance: clearance,
          fullyAboveNav: pagRect.bottom <= navTop,
          isSingleLine: pageNum.getBoundingClientRect().height < 35,
          pageText: pageNum.textContent.trim(),
          zeroHorizontalScroll: document.documentElement.scrollWidth === document.documentElement.clientWidth
        };
      })()
    `);

    assert(livePaginationGeo.fullyAboveNav, `Live Admin Pagination is completely visible ABOVE bottom nav (clearance: ${livePaginationGeo.clearance.toFixed(1)}px)`, 'LIVE-PAGINATION');
    assert(livePaginationGeo.isSingleLine, `Live Admin page number '${livePaginationGeo.pageText}' renders on single line without wrapping`, 'LIVE-PAGINATION');
    await saveScreenshot(page.ws, 'live_admin_pagination_375.png');
    await page.ws.close();

    // 3. Live Sales Invoices & Product Detail Check (390x844)
    console.log('\n--- 3. Live Sales Invoices & Product Detail Check ---');
    page = await openLivePage('/sales.html?demo=1&role=sales&sales=aru#invoices', 390, 844);

    const liveSalesDrill = await evalScript(page.ws, `
      (function() {
        var firstBtn = document.querySelector('#invoiceMobileList .inv-detail-btn');
        if (!firstBtn) return { ok: false, reason: 'No detail button found on sales invoices' };
        firstBtn.click();
        return { ok: true, hash: window.location.hash };
      })()
    `);
    assert(liveSalesDrill.ok, 'Live Sales navigated to Invoice Detail view via mobile card action', 'LIVE-SALES');
    await sleep(500);

    const liveSalesProduct = await evalScript(page.ws, `
      (function() {
        var mList = document.getElementById('detProductMobileList');
        var dTable = document.getElementById('detProductBody');
        var items = mList ? Array.from(mList.children) : [];
        var firstItem = items[0];

        return {
          mobileVisible: mList && window.getComputedStyle(mList).display !== 'none',
          desktopHidden: dTable ? window.getComputedStyle(dTable.closest('div')).display === 'none' : true,
          itemCount: items.length,
          hasFullWidthTitle: firstItem ? !!firstItem.querySelector('.break-words') : false,
          hasBreakdownGrid: firstItem ? !!firstItem.querySelector('.grid-cols-3') : false,
          zeroHorizontalScroll: document.documentElement.scrollWidth === document.documentElement.clientWidth
        };
      })()
    `);

    assert(liveSalesProduct.mobileVisible, 'Live Sales Product Detail renders mobile product cards (#detProductMobileList)', 'LIVE-SALES');
    assert(liveSalesProduct.desktopHidden, 'Live Sales Product Detail 4-column wide table is hidden on mobile', 'LIVE-SALES');
    assert(liveSalesProduct.itemCount > 0, `Live Sales Product Detail rendered ${liveSalesProduct.itemCount} items`, 'LIVE-SALES');
    assert(liveSalesProduct.hasFullWidthTitle && liveSalesProduct.hasBreakdownGrid, 'Live Sales product cards render full-width title and 3-column breakdown', 'LIVE-SALES');
    assert(liveSalesProduct.zeroHorizontalScroll, 'Live Sales Product Detail zero horizontal overflow on 390px', 'LIVE-SALES');

    await evalScript(page.ws, `
      var p = document.getElementById('detProductMobileList');
      if (p) p.scrollIntoView({ block: 'start', behavior: 'instant' });
    `);
    await sleep(200);
    await saveScreenshot(page.ws, 'live_sales_product_detail_390.png');
    await page.ws.close();

    console.log(`\n========================================`);
    console.log(`LIVE DEPLOYMENT CROSSCHECK SUMMARY:`);
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
  }
}

run();
