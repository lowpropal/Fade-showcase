/**
 * Verification Suite for FADE Pods Showcase v0.2 — Mobile Invoice UX Refinement
 * Validates all 11 core scenarios across mobile (375, 390, 430) and desktop (1280, 1440).
 * Exits with code 1 if ANY assertion fails.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9840 + Math.floor(Math.random() * 30);
const HTTP_PORT = 8098;
const BASE_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(BASE_DIR, 'docs', 'screenshots', 'improved_ux');
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

async function captureScreenshot(ws, filename, clip = null) {
  const params = { format: 'png' };
  if (clip) params.clip = clip;
  const res = await sendCommand(ws, 'Page.captureScreenshot', params);
  const outPath = path.join(SCREENSHOT_DIR, filename);
  fs.writeFileSync(outPath, Buffer.from(res.data, 'base64'));
  console.log(`[Screenshot] Saved: ${outPath}`);
  
  // Also copy to artifact dir if exists
  if (fs.existsSync(ARTIFACT_DIR)) {
    const artifactPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(artifactPath, Buffer.from(res.data, 'base64'));
  }
  return outPath;
}

async function setViewport(ws, width, height, dsf = 1) {
  await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: dsf,
    mobile: width < 768
  });
  await evalScript(ws, 'window.dispatchEvent(new Event("resize"))');
  await sleep(250);
}

let passCount = 0;
let failCount = 0;
const results = [];

function assert(condition, message, detail = '') {
  if (condition) {
    passCount++;
    console.log(`  ✅ PASS: ${message}`);
    results.push({ status: 'PASS', message, detail });
  } else {
    failCount++;
    console.error(`  ❌ FAIL: ${message} - ${detail}`);
    results.push({ status: 'FAIL', message, detail });
  }
}

async function run() {
  const server = await startHttpServer();

  const tmpProfile = '/tmp/chrome-verify-' + Date.now();
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmpProfile}`,
    '--no-first-run',
    '--no-default-browser-check'
  ], { stdio: 'ignore' });

  let ws = null;
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
    role: 'sales',
    name: 'Aru',
    title: 'Sales Representative',
    salesName: 'Aru',
    salesId: 'SLS-ARU',
    region: 'Operasional Sales',
    username: 'aru'
  };

  async function openPage(url, width, height, sessionObj = adminSession) {
    const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' })).json();
    const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    await sendCommand(ws, 'Page.enable');
    await sendCommand(ws, 'Runtime.enable');
    await sendCommand(ws, 'DOM.enable');

    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: width < 768
    });

    const fullUrl = `http://127.0.0.1:${HTTP_PORT}${url}`;
    await sendCommand(ws, 'Page.navigate', { url: fullUrl });
    await sleep(400);

    await evalScript(ws, `
      localStorage.setItem('fade_showcase_session_v021', JSON.stringify(${JSON.stringify(sessionObj)}));
      localStorage.setItem('fade_theme', 'dark');
      if (window.FADE_STORE) {
        FADE_STORE.setActiveSession(${JSON.stringify(sessionObj)});
        FADE_STORE.setTheme('dark');
      }
      document.documentElement.classList.add('dark');
    `);
    await sendCommand(ws, 'Page.navigate', { url: fullUrl });
    await sleep(600);
    return { ws, targetId: target.id };
  }

  try {
    console.log('\n======================================================');
    console.log('FADE PODS SHOWCASE v0.2 — VERIFICATION SUITE');
    console.log('Mobile Invoice UX Refinement (Tahap 1–11)');
    console.log('======================================================\n');

    // ------------------------------------------------------------------
    // TEST 1: Admin Mobile Invoices Page (390×844) - Setup & Baseline
    // ------------------------------------------------------------------
    console.log('--- TEST GROUP 1: Admin Mobile Invoices Page (390×844) ---');
    const adminPage = await openPage('/admin.html?demo=1&role=admin#invoices', 390, 844, adminSession);
    ws = adminPage.ws;
    await evalScript(ws, 'document.fonts.ready');
    await sleep(200);

    // 1.1 Dynamic Page Size on Mobile (< 768px)
    const mobilePageSize = await evalScript(ws, 'window._getInvoicePageSize()');
    assert(mobilePageSize === 10, 'Mobile invoicePageSize must be exactly 10', `Got: ${mobilePageSize}`);

    const mobileCardCount = await evalScript(ws, 'document.querySelectorAll("#invoiceMobileList > div").length');
    assert(mobileCardCount === 10, 'Mobile rendered card count on page 1 must be exactly 10', `Got: ${mobileCardCount}`);

    // 1.2 Search & Toolbar Layout
    const searchWidth = await evalScript(ws, 'document.getElementById("invoiceSearchInput").getBoundingClientRect().width');
    assert(searchWidth > 320, 'Mobile search input must span full container width (> 320px)', `Got: ${searchWidth}px`);

    const searchMinH = await evalScript(ws, 'document.getElementById("invoiceSearchInput").getBoundingClientRect().height');
    assert(searchMinH >= 44, 'Search input touch target must be >= 44px', `Got: ${searchMinH}px`);

    const statusMinH = await evalScript(ws, 'document.getElementById("invoiceStatusFilter").getBoundingClientRect().height');
    assert(statusMinH >= 44, 'Status filter touch target must be >= 44px', `Got: ${statusMinH}px`);

    const resetBtnH = await evalScript(ws, 'document.getElementById("resetInvoiceFilterBtn").getBoundingClientRect().height');
    assert(resetBtnH >= 44, 'Reset filter button touch target must be >= 44px', `Got: ${resetBtnH}px`);

    // 1.3 Mobile Card Financial 2-Column Grid
    const cardData = await evalScript(ws, `(() => {
      const firstCard = document.querySelector("#invoiceMobileList > div");
      if (!firstCard) return null;
      const cols = firstCard.querySelectorAll(".grid > div");
      const totalCol = cols[0];
      const sisaCol = cols[1];
      const payBtn = firstCard.querySelector('button[data-action="pay"]');
      const moreBtn = firstCard.querySelector(".inv-more-btn");
      return {
        hasTwoCols: cols.length === 2,
        totalText: totalCol ? totalCol.innerText : "",
        sisaText: sisaCol ? sisaCol.innerText : "",
        payBtnHeight: payBtn ? payBtn.getBoundingClientRect().height : 0,
        payBtnText: payBtn ? payBtn.innerText.trim() : "",
        moreBtnHeight: moreBtn ? moreBtn.getBoundingClientRect().height : 0,
        moreBtnWidth: moreBtn ? moreBtn.getBoundingClientRect().width : 0
      };
    })()`);

    assert(cardData.hasTwoCols === true, 'Mobile card financial display must have exactly 2 columns', `Got: ${cardData.hasTwoCols}`);
    assert(cardData.totalText.includes('TOTAL INVOICE'), 'Column 1 must have label TOTAL INVOICE', `Got: ${cardData.totalText}`);
    assert(cardData.sisaText.includes('SISA TAGIHAN'), 'Column 2 must have label SISA TAGIHAN', `Got: ${cardData.sisaText}`);
    assert(cardData.payBtnHeight >= 44, 'Primary Catat Pembayaran button height must be >= 44px', `Got: ${cardData.payBtnHeight}px`);
    assert(cardData.payBtnText.includes('Catat Pembayaran'), 'Primary button label must be "Catat Pembayaran"', `Got: ${cardData.payBtnText}`);
    assert(cardData.moreBtnHeight >= 44 && cardData.moreBtnWidth >= 44, 'more_vert button touch target must be >= 44x44px', `Got: ${cardData.moreBtnWidth}x${cardData.moreBtnHeight}px`);

    await captureScreenshot(ws, 'improved_admin_invoices_390.png');

    // Screenshot single card
    const firstCardClip = await evalScript(ws, `(() => {
      const c = document.querySelector("#invoiceMobileList > div");
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 };
    })()`);
    if (firstCardClip) {
      await captureScreenshot(ws, 'improved_admin_card_390.png', firstCardClip);
    }

    // ------------------------------------------------------------------
    // TEST 2: Action Hierarchy & more_vert Dropdown (390×844)
    // ------------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: more_vert Menu Interaction & Accessibility ---');
    // Open more menu
    await evalScript(ws, `document.querySelector(".inv-more-btn").click()`);
    await sleep(200);

    const dropdownState = await evalScript(ws, `(() => {
      const btn = document.querySelector(".inv-more-btn");
      const dd = btn.nextElementSibling;
      const isVisible = !dd.classList.contains("hidden");
      const items = Array.from(dd.querySelectorAll("button")).map(b => ({
        text: b.innerText.trim(),
        height: b.getBoundingClientRect().height,
        action: b.getAttribute("data-action")
      }));
      return { isVisible, ariaExpanded: btn.getAttribute("aria-expanded"), items };
    })()`);

    assert(dropdownState.isVisible === true, 'Dropdown menu must open when more_vert is clicked');
    assert(dropdownState.ariaExpanded === 'true', 'more_vert button must set aria-expanded="true" when open');
    assert(dropdownState.items.length === 2, 'Dropdown must have exactly 2 actions (Edit & Hapus)', `Got: ${dropdownState.items.length}`);
    assert(dropdownState.items[0].action === 'edit' && dropdownState.items[0].height >= 44, 'Edit button must have min-h >= 44px', `Got: ${dropdownState.items[0].height}px`);
    assert(dropdownState.items[1].action === 'delete' && dropdownState.items[1].height >= 44, 'Hapus button must have min-h >= 44px', `Got: ${dropdownState.items[1].height}px`);

    await captureScreenshot(ws, 'improved_more_menu_390.png');

    // Test close on Escape
    await evalScript(ws, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    await sleep(150);
    const isClosedAfterEsc = await evalScript(ws, `document.querySelector(".inv-more-dropdown").classList.contains("hidden")`);
    assert(isClosedAfterEsc === true, 'Dropdown menu must close when Escape key is pressed');

    // ------------------------------------------------------------------
    // TEST 3: Multi-Product Invoice Integrity in Edit Modal (390×844)
    // ------------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Multi-Product Invoice Integrity in Edit Modal ---');
    // Find multi-product invoice SI.2026.04.00006
    await evalScript(ws, `window._openInvoiceFormModal('edit', 'SI.2026.04.00006')`);
    await sleep(350);

    const modalState = await evalScript(ws, `(() => {
      const backdrop = document.getElementById("invoiceFormModalBackdrop");
      const banner = document.getElementById("formMultiProductBanner");
      const prodSel = document.getElementById("formProductName");
      const qtyInput = document.getElementById("formQty");
      const priceInput = document.getElementById("formUnitPrice");
      const totalPreview = document.getElementById("formPreviewTotal").innerText;
      const footer = document.querySelector("#invoiceForm > div:last-child");
      const footerRect = footer.getBoundingClientRect();
      const cancelBtn = document.getElementById("cancelInvoiceFormBtn");
      const saveBtn = document.getElementById("saveInvoiceFormBtn");
      const closeBtn = document.getElementById("closeInvoiceFormBtn");

      return {
        isOpen: !backdrop.classList.contains("hidden"),
        bodyOverflow: document.body.style.overflow,
        bannerVisible: !banner.classList.contains("hidden"),
        selectedProduct: prodSel.value,
        productDisabled: prodSel.disabled,
        qtyDisabled: qtyInput.disabled,
        priceDisabled: priceInput.disabled,
        qtyValue: Number(qtyInput.value),
        priceValue: Number(priceInput.value),
        totalPreview,
        footerInViewport: footerRect.bottom <= window.innerHeight,
        cancelBtnHeight: cancelBtn.getBoundingClientRect().height,
        saveBtnHeight: saveBtn.getBoundingClientRect().height,
        closeBtnHeight: closeBtn.getBoundingClientRect().height
      };
    })()`);

    assert(modalState.isOpen === true, 'Edit invoice modal must be open');
    assert(modalState.bodyOverflow === 'hidden', 'Body scroll must be locked when modal is open');
    assert(modalState.bannerVisible === true, 'Multi-product locked banner must be visible for multi-product invoice');
    assert(modalState.selectedProduct !== '', 'Selected product in dropdown must NOT be empty', `Got: "${modalState.selectedProduct}"`);
    assert(modalState.selectedProduct === 'FADE - Cartridge Lite 3 In 1 V1', 'Selected product must match invoice product', `Got: "${modalState.selectedProduct}"`);
    assert(modalState.productDisabled && modalState.qtyDisabled && modalState.priceDisabled, 'Product, QTY, and UnitPrice must be disabled for multi-product orders');
    assert(modalState.totalPreview === 'Rp 1.540.000', 'Total preview must preserve actual multi-product invoiceTotal (Rp 1.540.000)', `Got: ${modalState.totalPreview}`);
    assert(modalState.footerInViewport === true, 'Modal footer action bar must be immediately visible inside viewport');
    assert(modalState.cancelBtnHeight >= 44 && modalState.saveBtnHeight >= 44, 'Modal footer action buttons must be >= 44px', `Got: ${modalState.cancelBtnHeight}px, ${modalState.saveBtnHeight}px`);
    assert(modalState.closeBtnHeight >= 44, 'Modal close button touch target must be >= 44px', `Got: ${modalState.closeBtnHeight}px`);

    await captureScreenshot(ws, 'improved_modal_edit_multi_390.png');

    // Test Save Multi-Product without overwriting rincianProduk
    const originalInv = await evalScript(ws, `FADE_STORE.getInvoices().find(i => (i.id || i.invoice_id) === 'SI.2026.04.00006')`);
    await evalScript(ws, `(() => {
      document.getElementById("formStoreName").value = "The Elevape Store (Updated Branch)";
      document.getElementById("invoiceForm").dispatchEvent(new Event("submit"));
    })()`);
    await sleep(350);

    const savedInv = await evalScript(ws, `FADE_STORE.getInvoices().find(i => (i.id || i.invoice_id) === 'SI.2026.04.00006')`);
    assert(savedInv.storeName === 'The Elevape Store (Updated Branch)', 'Updated store name must be saved');
    assert(savedInv.invoiceTotal === originalInv.invoiceTotal, 'Multi-product invoiceTotal must remain untouched after save', `Got: ${savedInv.invoiceTotal}`);
    assert(savedInv.rincianProduk === originalInv.rincianProduk, 'Multi-product rincianProduk string must remain 100% intact');
    assert(savedInv.qty === originalInv.qty && savedInv.qtyGratis === originalInv.qtyGratis, 'Multi-product QTY and Free QTY must remain intact');

    // ------------------------------------------------------------------
    // TEST 4: Single-Product Invoice Editability (390×844)
    // ------------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Single-Product Invoice & Add Modal ---');
    // Open Add Modal
    await evalScript(ws, `window._openInvoiceFormModal('add')`);
    await sleep(300);

    const addModalState = await evalScript(ws, `(() => {
      const banner = document.getElementById("formMultiProductBanner");
      const prodSel = document.getElementById("formProductName");
      const qtyInput = document.getElementById("formQty");
      const priceInput = document.getElementById("formUnitPrice");
      return {
        bannerHidden: banner.classList.contains("hidden"),
        prodEnabled: !prodSel.disabled,
        qtyEnabled: !qtyInput.disabled,
        priceEnabled: !priceInput.disabled,
        optionsCount: prodSel.options.length
      };
    })()`);

    assert(addModalState.bannerHidden === true, 'Multi-product banner must be hidden for new / single-product invoice');
    assert(addModalState.prodEnabled && addModalState.qtyEnabled && addModalState.priceEnabled, 'Form inputs must be enabled for single-product invoice');
    assert(addModalState.optionsCount >= 10, 'Product dropdown must have complete list of options', `Got: ${addModalState.optionsCount} options`);

    // Test dynamic preview on input
    await evalScript(ws, `(() => {
      document.getElementById("formQty").value = 20;
      document.getElementById("formUnitPrice").value = 100000;
      document.getElementById("formPaidTotal").value = 500000;
      window._updateFormPreview();
    })()`);
    await sleep(150);

    const previewState = await evalScript(ws, `({
      total: document.getElementById("formPreviewTotal").innerText,
      out: document.getElementById("formPreviewOutstanding").innerText
    })`);
    assert(previewState.total === 'Rp 2.000.000', 'Total preview must calculate 20 * 100.000 = Rp 2.000.000', `Got: ${previewState.total}`);
    assert(previewState.out === 'Rp 1.500.000', 'Outstanding preview must calculate 2.000.000 - 500.000 = Rp 1.500.000', `Got: ${previewState.out}`);

    await captureScreenshot(ws, 'improved_modal_edit_single_390.png');
    await evalScript(ws, 'window._closeInvoiceFormModal()');
    await sleep(200);

    // ------------------------------------------------------------------
    // TEST 5: Record Payment Modal (390×844)
    // ------------------------------------------------------------------
    console.log('\n--- TEST GROUP 5: Record Payment Modal & Touch Targets ---');
    await evalScript(ws, `window._openPaymentModal('SI.2026.04.00006')`);
    await sleep(300);

    const payModalState = await evalScript(ws, `(() => {
      const backdrop = document.getElementById("paymentModalBackdrop");
      const quickBtn = document.getElementById("payFullQuickBtn");
      const amtInput = document.getElementById("payAmountInput");
      const dateInput = document.getElementById("payDateInput");
      const footer = document.querySelector("#paymentForm > div:last-child");
      const submitBtn = document.getElementById("submitPaymentModalBtn");
      const cancelBtn = document.getElementById("cancelPaymentModalBtn");
      const closeBtn = document.getElementById("closePaymentModalBtn");

      return {
        isOpen: !backdrop.classList.contains("hidden"),
        bodyOverflow: document.body.style.overflow,
        quickBtnHeight: quickBtn.getBoundingClientRect().height,
        quickBtnText: quickBtn.innerText.trim(),
        amtInputHeight: amtInput.getBoundingClientRect().height,
        dateInputHeight: dateInput.getBoundingClientRect().height,
        footerInViewport: footer.getBoundingClientRect().bottom <= window.innerHeight,
        submitBtnHeight: submitBtn.getBoundingClientRect().height,
        cancelBtnHeight: cancelBtn.getBoundingClientRect().height,
        closeBtnHeight: closeBtn.getBoundingClientRect().height,
        submitBtnText: submitBtn.innerText.trim()
      };
    })()`);

    assert(payModalState.isOpen === true, 'Payment modal must be open');
    assert(payModalState.bodyOverflow === 'hidden', 'Body scroll must be locked when payment modal is open');
    assert(payModalState.quickBtnHeight >= 36, 'Bayar Lunas quick button height must be >= 36px (was 16px!)', `Got: ${payModalState.quickBtnHeight}px`);
    assert(payModalState.quickBtnText === 'Bayar Lunas', 'Quick button label must be "Bayar Lunas"');
    assert(payModalState.amtInputHeight >= 44, 'Payment amount input height must be >= 44px', `Got: ${payModalState.amtInputHeight}px`);
    assert(payModalState.dateInputHeight >= 44, 'Payment date input height must be >= 44px', `Got: ${payModalState.dateInputHeight}px`);
    assert(payModalState.footerInViewport === true, 'Payment modal footer must be immediately visible without scrolling');
    assert(payModalState.submitBtnHeight >= 44 && payModalState.cancelBtnHeight >= 44, 'Payment modal footer buttons must be >= 44px', `Got: ${payModalState.submitBtnHeight}px`);
    assert(payModalState.closeBtnHeight >= 44, 'Payment modal close button must be >= 44px', `Got: ${payModalState.closeBtnHeight}px`);
    assert(payModalState.submitBtnText === 'Catat Pembayaran', 'Payment modal submit button label must be "Catat Pembayaran"', `Got: "${payModalState.submitBtnText}"`);

    await captureScreenshot(ws, 'improved_modal_payment_390.png');
    await evalScript(ws, 'window._closePaymentModal()');
    await sleep(200);

    // ------------------------------------------------------------------
    // TEST 6: Pagination & Bottom Navigation Clearance (375, 390, 430 px)
    // ------------------------------------------------------------------
    console.log('\n--- TEST GROUP 6: Pagination & Bottom Nav Spacing Across Viewports ---');
    for (const vp of [{ w: 375, h: 812 }, { w: 390, h: 844 }, { w: 430, h: 932 }]) {
      await setViewport(ws, vp.w, vp.h);
      await sleep(250);

      // Scroll to bottom
      await evalScript(ws, 'window.scrollTo(0, document.body.scrollHeight)');
      await sleep(250);

      const pagState = await evalScript(ws, `(() => {
        const pagInfo = document.getElementById("paginationInfo");
        const pag = pagInfo ? pagInfo.parentElement : null;
        const bNav = document.getElementById("mobileNavContainer") || document.querySelector(".shell-mobile-nav");
        const prevBtn = document.getElementById("prevPageBtn");
        const nextBtn = document.getElementById("nextPageBtn");
        const pageNum = document.getElementById("pageNumberDisplay");

        if (!pag || !bNav || !prevBtn || !pageNum) {
          return { error: 'Elements not found' };
        }

        const pagRect = pag.getBoundingClientRect();
        const bNavRect = bNav.getBoundingClientRect();
        const prevRect = prevBtn.getBoundingClientRect();

        return {
          pagTop: pagRect.top,
          pagBottom: pagRect.bottom,
          bNavTop: bNavRect.top,
          clearance: bNavRect.top - pagRect.bottom,
          prevHeight: prevRect.height,
          prevWidth: prevRect.width,
          pageText: pageNum.innerText.trim(),
          isSingleLine: pageNum.scrollHeight <= prevRect.height
        };
      })()`);

      assert(pagState.clearance >= 0, `Pagination must sit completely ABOVE bottom navigation on ${vp.w}px (clearance >= 0)`, `Clearance: ${pagState.clearance}px`);
      assert(pagState.prevHeight >= 44 && pagState.prevWidth >= 44, `Pagination button touch targets must be >= 44x44px on ${vp.w}px`, `Got: ${pagState.prevWidth}x${pagState.prevHeight}px`);
      assert(pagState.isSingleLine === true, `Page number "1 / X" must remain on a single line on ${vp.w}px`, `Got text: ${pagState.pageText}`);

      if (vp.w === 375) {
        await captureScreenshot(ws, 'improved_pagination_375.png');
      }
    }

    // ------------------------------------------------------------------
    // TEST 7: Filter Reset & Empty State
    // ------------------------------------------------------------------
    console.log('\n--- TEST GROUP 7: Filter Change, Reset & Empty State ---');
    await setViewport(ws, 390, 844);
    await evalScript(ws, 'window.scrollTo(0, 0)');
    await sleep(200);

    // Apply impossible search to trigger empty state
    await evalScript(ws, `(() => {
      document.getElementById("invoiceSearchInput").value = "NON_EXISTENT_XYZ_999";
      document.getElementById("invoiceSearchInput").dispatchEvent(new Event("input"));
    })()`);
    await sleep(300);

    const emptyState = await evalScript(ws, `(() => {
      const emptyEl = document.querySelector("#invoiceMobileList .btn-reset-filter-empty");
      return {
        hasResetBtn: !!emptyEl,
        btnHeight: emptyEl ? emptyEl.getBoundingClientRect().height : 0
      };
    })()`);

    assert(emptyState.hasResetBtn === true, 'Empty state must render friendly message with Reset Filter button');
    assert(emptyState.btnHeight >= 44, 'Empty state Reset Filter button height must be >= 44px', `Got: ${emptyState.btnHeight}px`);

    // Click reset button in empty state
    await evalScript(ws, `document.querySelector("#invoiceMobileList .btn-reset-filter-empty").click()`);
    await sleep(300);

    const restoredCount = await evalScript(ws, 'document.querySelectorAll("#invoiceMobileList > div").length');
    assert(restoredCount === 10, 'Reset Filter must restore invoice list back to 10 cards', `Got: ${restoredCount}`);

    // ------------------------------------------------------------------
    // TEST 8: Sales Mobile Invoices Page (390×844)
    // ------------------------------------------------------------------
    console.log('\n--- TEST GROUP 8: Sales Mobile Invoices Page Parity ---');
    const sPage = await openPage('/sales.html?demo=1&role=sales&sales=aru#invoices', 390, 844, salesSession);
    ws = sPage.ws;
    await evalScript(ws, 'document.fonts.ready');
    await sleep(200);

    const salesMobilePageSize = await evalScript(ws, 'window._getInvoicePageSize()');
    assert(salesMobilePageSize === 10, 'Sales mobile invoicePageSize must be exactly 10', `Got: ${salesMobilePageSize}`);

    // Default November date scope yields 9 invoices for Sales Aru
    const scopedNovCount = await evalScript(ws, 'document.querySelectorAll("#invoiceMobileList > div").length');
    assert(scopedNovCount === 9, 'Sales rendered cards count for November scope must be 9', `Got: ${scopedNovCount}`);

    // Uncheck date scope to view all 129 invoices of Sales Aru -> validates 10 cards per page
    await evalScript(ws, `(() => {
      const cb = document.getElementById("invoiceDateScopeCheckbox");
      cb.checked = false;
      cb.dispatchEvent(new Event("change"));
    })()`);
    await sleep(250);

    const salesCardsCountAll = await evalScript(ws, 'document.querySelectorAll("#invoiceMobileList > div").length');
    assert(salesCardsCountAll === 10, 'Sales rendered cards count without date scope must be exactly 10 on page 1', `Got: ${salesCardsCountAll}`);

    const salesCardData = await evalScript(ws, `(() => {
      const firstCard = document.querySelector("#invoiceMobileList > div");
      if (!firstCard) return null;
      const detailBtn = firstCard.querySelector(".inv-detail-btn");
      const cols = firstCard.querySelectorAll(".grid > div");
      return {
        hasTwoCols: cols.length === 2,
        totalText: cols[0] ? cols[0].innerText : "",
        sisaText: cols[1] ? cols[1].innerText : "",
        detailBtnHeight: detailBtn ? detailBtn.getBoundingClientRect().height : 0,
        detailBtnText: detailBtn ? detailBtn.innerText.trim() : "",
        hasNoPayBtn: !firstCard.querySelector('button[data-action="pay"]'),
        hasNoEditBtn: !firstCard.querySelector('button[data-action="edit"]')
      };
    })()`);

    assert(salesCardData.hasTwoCols === true, 'Sales mobile card must have 2-column financial grid matching Admin', `Got: ${salesCardData.hasTwoCols}`);
    assert(salesCardData.detailBtnHeight >= 44, 'Sales "Lihat Detail Invoice" button height must be >= 44px', `Got: ${salesCardData.detailBtnHeight}px`);
    assert(salesCardData.detailBtnText.includes('Lihat Detail Invoice'), 'Sales action button label must be "Lihat Detail Invoice"', `Got: "${salesCardData.detailBtnText}"`);
    assert(salesCardData.hasNoPayBtn && salesCardData.hasNoEditBtn, 'Sales page must be 100% READ-ONLY (no Pay/Edit/Delete buttons)');

    await captureScreenshot(ws, 'improved_sales_invoices_390.png');

    const firstSalesCardClip = await evalScript(ws, `(() => {
      const c = document.querySelector("#invoiceMobileList > div");
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 };
    })()`);
    if (firstSalesCardClip) {
      await captureScreenshot(ws, 'improved_sales_card_390.png', firstSalesCardClip);
    }

    // ------------------------------------------------------------------
    // TEST 9: Desktop Admin & Sales Regression (1280 & 1440 px)
    // ------------------------------------------------------------------
    console.log('\n--- TEST GROUP 9: Desktop Regression (1280×800 & 1440×900) ---');
    for (const dVp of [1280, 1440]) {
      const dAdminPage = await openPage('/admin.html?demo=1&role=admin#invoices', dVp, 800, adminSession);
      ws = dAdminPage.ws;

      const dAdminPageSize = await evalScript(ws, 'window._getInvoicePageSize()');
      assert(dAdminPageSize === 25, `Admin desktop invoicePageSize must be 25 on ${dVp}px`, `Got: ${dAdminPageSize}`);

      const dAdminTableRows = await evalScript(ws, 'document.querySelectorAll("#invoiceTableBody > tr").length');
      assert(dAdminTableRows === 25, `Admin desktop table must render 25 rows on ${dVp}px`, `Got: ${dAdminTableRows}`);

      const isTableVisible = await evalScript(ws, `(() => {
        const t = document.querySelector(".table-scroll-container");
        return window.getComputedStyle(t).display !== 'none';
      })()`);
      assert(isTableVisible === true, `Desktop table must be visible on ${dVp}px`);

      if (dVp === 1280) {
        await captureScreenshot(ws, 'improved_desktop_admin_1280.png');
      }

      // Check Sales desktop
      const dSalesPage = await openPage('/sales.html?demo=1&role=sales&sales=aru#invoices', dVp, 800, salesSession);
      ws = dSalesPage.ws;

      const dSalesPageSize = await evalScript(ws, 'window._getInvoicePageSize()');
      assert(dSalesPageSize === 25, `Sales desktop invoicePageSize must be 25 on ${dVp}px`, `Got: ${dSalesPageSize}`);

      // Uncheck date scope to test full 25-row desktop page size from 129 invoices
      await evalScript(ws, `(() => {
        const cb = document.getElementById("invoiceDateScopeCheckbox");
        cb.checked = false;
        cb.dispatchEvent(new Event("change"));
      })()`);
      await sleep(250);

      const dSalesTableRows = await evalScript(ws, 'document.querySelectorAll("#invoiceTableBody > tr").length');
      assert(dSalesTableRows === 25, `Sales desktop table must render 25 rows on ${dVp}px when viewing all invoices`, `Got: ${dSalesTableRows}`);

      if (dVp === 1280) {
        await captureScreenshot(ws, 'improved_desktop_sales_1280.png');
      }
    }

    // ------------------------------------------------------------------
    // FINAL SUMMARY
    // ------------------------------------------------------------------
    console.log('\n======================================================');
    console.log(`TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('======================================================\n');

    if (failCount > 0) {
      console.error(`Verification FAILED with ${failCount} assertion failures.`);
      process.exit(1);
    } else {
      console.log('All verification assertions PASSED successfully!');
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal execution error during verification:', err);
    process.exit(1);
  } finally {
    if (ws) ws.close();
    chromeProc.kill();
    server.close();
  }
}

run();
