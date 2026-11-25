/**
 * Tahap 1: Baseline & Reproduction Script for Mobile Invoice UX Refinement
 * Measures DOM elements, captures baseline screenshots across 375, 390, 430, and 834 px,
 * and verifies the 8 reported findings on live and local.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9820 + Math.floor(Math.random() * 30);
const HTTP_PORT = 8094;
const BASE_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(BASE_DIR, 'docs', 'screenshots', 'baseline_ux');

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

async function saveScreenshot(ws, filename) {
  try { await evalScript(ws, 'document.fonts.ready'); } catch (e) {}
  await sleep(150);
  const shot = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.data, 'base64');
  const localPath = path.join(SCREENSHOT_DIR, filename);
  fs.writeFileSync(localPath, buf);
  console.log(`[BASELINE SCREENSHOT] Saved: ${filename}`);
  return localPath;
}

async function run() {
  console.log('=== Tahap 1: Baseline & Issue Reproduction ===\n');
  const server = await startHttpServer();
  const tmpProfile = '/tmp/chrome-baseline-' + Date.now();
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

  async function openPage(url, width, height) {
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

    const fullUrl = `http://127.0.0.1:${HTTP_PORT}${url}`;
    await sendCommand(ws, 'Page.navigate', { url: fullUrl });
    await sleep(400);

    await evalScript(ws, `
      localStorage.setItem('fade_showcase_session_v021', JSON.stringify(${JSON.stringify(adminSession)}));
      localStorage.setItem('fade_theme', 'dark');
      if (window.FADE_STORE) {
        FADE_STORE.setActiveSession(${JSON.stringify(adminSession)});
        FADE_STORE.setTheme('dark');
      }
      document.documentElement.classList.add('dark');
    `);
    await sendCommand(ws, 'Page.navigate', { url: fullUrl });
    await sleep(400);
    return { ws, targetId: target.id };
  }

  try {
    // 1. Measure Live/Baseline findings on 390px Admin Invoices
    console.log('--- Checking 8 Live Findings on 390px ---');
    const page390 = await openPage('/admin.html?demo=1&role=admin#invoices', 390, 844);

    const findings = await evalScript(page390.ws, `
      (function() {
        var searchInput = document.getElementById('invoiceSearchInput');
        var statusFilter = document.getElementById('invoiceStatusFilter');
        var mobileList = document.getElementById('invoiceMobileList');
        var cards = mobileList ? Array.from(mobileList.children) : [];
        var firstCard = cards[0];

        // Finding 4: Toolbar width measurements
        var searchWidth = searchInput ? searchInput.getBoundingClientRect().width : 0;
        var statusWidth = statusFilter ? statusFilter.getBoundingClientRect().width : 0;
        var toolbarWidth = searchInput ? searchInput.parentElement.parentElement.getBoundingClientRect().width : 0;

        // Finding 5: Stacked paddings
        var mainEl = document.querySelector('main');
        var sectionEl = document.getElementById('viewInvoices');
        var mainPadLeft = mainEl ? parseFloat(window.getComputedStyle(mainEl).paddingLeft) : 0;
        var secPadLeft = sectionEl ? parseFloat(window.getComputedStyle(sectionEl).paddingLeft) : 0;
        var cardPadLeft = firstCard ? parseFloat(window.getComputedStyle(firstCard).paddingLeft) : 0;
        var totalLeftPadding = mainPadLeft + secPadLeft + cardPadLeft;

        // Finding 6: Typography of invoice ID & date
        var idDateEl = firstCard ? firstCard.querySelector('.font-mono') : null;
        var idDateFontSize = idDateEl ? window.getComputedStyle(idDateEl).fontSize : 'none';

        // Finding 7: Number of cards on mobile
        var cardCount = cards.length;

        // Finding 8: Card action buttons
        var actionBtns = firstCard ? Array.from(firstCard.querySelectorAll('.inv-action-btn')) : [];
        var actionBtnNames = actionBtns.map(function(b) { return b.textContent.trim(); });

        return {
          searchWidth: searchWidth,
          statusWidth: statusWidth,
          toolbarWidth: toolbarWidth,
          mainPadLeft: mainPadLeft,
          secPadLeft: secPadLeft,
          cardPadLeft: cardPadLeft,
          totalLeftPadding: totalLeftPadding,
          idDateFontSize: idDateFontSize,
          cardCount: cardCount,
          actionCount: actionBtns.length,
          actionBtnNames: actionBtnNames
        };
      })()
    `);

    console.log('DOM Measurements on 390px:');
    console.log(`- Search input width: ${findings.searchWidth}px (toolbar width: ${findings.toolbarWidth}px)`);
    console.log(`- Status filter width: ${findings.statusWidth}px`);
    console.log(`- Stacked padding left: main (${findings.mainPadLeft}px) + section (${findings.secPadLeft}px) + card (${findings.cardPadLeft}px) = ${findings.totalLeftPadding}px total per side`);
    console.log(`- Invoice ID / Date font size: ${findings.idDateFontSize}`);
    console.log(`- Number of cards rendered on page 1: ${findings.cardCount}`);
    console.log(`- Action buttons on first card: ${findings.actionBtnNames.join(', ')}`);

    // Screenshot baseline 390px invoice list
    await evalScript(page390.ws, `
      var m = document.getElementById('invoiceMobileList');
      if (m) m.scrollIntoView({ block: 'start', behavior: 'instant' });
    `);
    await sleep(200);
    await saveScreenshot(page390.ws, 'baseline_admin_invoices_390.png');

    // Screenshot baseline single card
    await saveScreenshot(page390.ws, 'baseline_admin_card_390.png');

    // Finding 1: Check Edit modal product dropdown value on invoice
    console.log('\n--- Checking Finding 1 & 2: Edit Modal Product Dropdown & Footer ---');
    const editModalInfo = await evalScript(page390.ws, `
      (function() {
        var firstEditBtn = document.querySelector('#invoiceMobileList [data-action="edit"]');
        if (!firstEditBtn) return { error: 'No edit button' };
        firstEditBtn.click();

        var prodSelect = document.getElementById('formProductName');
        var selectVal = prodSelect ? prodSelect.value : null;
        var selectText = prodSelect && prodSelect.selectedIndex >= 0 ? prodSelect.options[prodSelect.selectedIndex].text : 'EMPTY';

        // Check footer visibility
        var footer = document.querySelector('#invoiceForm .border-t');
        var footerRect = footer ? footer.getBoundingClientRect() : null;
        var modalContent = document.querySelector('#invoiceFormModalBackdrop > div');
        var modalContentRect = modalContent ? modalContent.getBoundingClientRect() : null;

        var footerVisibleWithoutScroll = footerRect && modalContentRect && footerRect.bottom <= modalContentRect.bottom;

        return {
          selectVal: selectVal,
          selectText: selectText,
          footerRect: footerRect,
          modalContentRect: modalContentRect,
          footerVisibleWithoutScroll: footerVisibleWithoutScroll
        };
      })()
    `);
    console.log(`- Product dropdown selected value: "${editModalInfo.selectVal}" (text: "${editModalInfo.selectText}")`);
    console.log(`- Footer visible without scrolling inside modal: ${editModalInfo.footerVisibleWithoutScroll}`);

    await saveScreenshot(page390.ws, 'baseline_modal_edit_390.png');

    // Close edit modal
    await evalScript(page390.ws, `
      var cancel = document.getElementById('cancelInvoiceFormBtn');
      if (cancel) cancel.click();
    `);
    await sleep(200);

    // Finding 3: Payment modal Bayar Lunas height & other button heights
    console.log('\n--- Checking Finding 3: Payment Modal Bayar Lunas & Button Heights ---');
    const payModalInfo = await evalScript(page390.ws, `
      (function() {
        var firstPayBtn = document.querySelector('#invoiceMobileList [data-action="pay"]');
        if (!firstPayBtn) return { error: 'No pay button' };
        firstPayBtn.click();

        var quickBtn = document.getElementById('payFullQuickBtn');
        var quickRect = quickBtn ? quickBtn.getBoundingClientRect() : null;

        var closeBtn = document.getElementById('closePaymentModalBtn');
        var cancelBtn = document.getElementById('cancelPaymentModalBtn');
        var submitBtn = document.querySelector('#paymentForm button[type="submit"]');

        return {
          quickHeight: quickRect ? quickRect.height : 0,
          quickWidth: quickRect ? quickRect.width : 0,
          closeHeight: closeBtn ? closeBtn.getBoundingClientRect().height : 0,
          cancelHeight: cancelBtn ? cancelBtn.getBoundingClientRect().height : 0,
          submitHeight: submitBtn ? submitBtn.getBoundingClientRect().height : 0
        };
      })()
    `);
    console.log(`- Bayar Lunas quick button height: ${payModalInfo.quickHeight}px, width: ${payModalInfo.quickWidth}px`);
    console.log(`- Modal close button height: ${payModalInfo.closeHeight}px`);
    console.log(`- Modal cancel button height: ${payModalInfo.cancelHeight}px`);
    console.log(`- Modal submit button height: ${payModalInfo.submitHeight}px`);

    await saveScreenshot(page390.ws, 'baseline_modal_payment_390.png');

    await evalScript(page390.ws, `
      var cancel = document.getElementById('cancelPaymentModalBtn');
      if (cancel) cancel.click();
    `);
    await sleep(200);

    // Pagination baseline
    await evalScript(page390.ws, `window.scrollTo(0, document.documentElement.scrollHeight);`);
    await sleep(250);
    await saveScreenshot(page390.ws, 'baseline_pagination_390.png');

    await page390.ws.close();

    // 2. Capture baseline on 375, 430, and 834 px
    const widths = [375, 430, 834];
    for (const w of widths) {
      console.log(`\n--- Capturing Baseline on ${w}px ---`);
      const h = w === 834 ? 1194 : (w === 430 ? 932 : 812);
      const p = await openPage('/admin.html?demo=1&role=admin#invoices', w, h);
      await evalScript(p.ws, `
        var m = document.getElementById('invoiceMobileList');
        if (m) m.scrollIntoView({ block: 'start', behavior: 'instant' });
      `);
      await sleep(200);
      await saveScreenshot(p.ws, `baseline_admin_invoices_${w}.png`);
      await p.ws.close();
    }

    console.log('\n=== Tahap 1 Baseline Complete ===');
  } catch (err) {
    console.error('Error in baseline script:', err);
  } finally {
    try { chromeProc.kill(); } catch (e) {}
    try { server.close(); } catch (e) {}
  }
}

run();
