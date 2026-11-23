const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9444;
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

async function runAudit() {
  console.log('Starting Chrome for Audit Reconciliation on port ' + PORT + '...');
  const tmpDir = '/tmp/chrome-cdp-recon-' + Date.now();
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
    await sleep(500);
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

  const results = {};

  // 1. Audit index.html (Login)
  {
    const targetRes = await (await fetch(`http://localhost:${PORT}/json/new`, { method: 'PUT' })).json();
    const ws = new globalThis.WebSocket(targetRes.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    await sendCommand(ws, 'Page.enable');
    await sendCommand(ws, 'Runtime.enable');
    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    await sendCommand(ws, 'Page.navigate', { url: 'file://' + path.join(BASE_DIR, 'index.html') });
    await sleep(1000);

    const loginRes = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const themeBtn = document.getElementById('theme-toggle') || document.querySelector('[aria-label*="tema"], [aria-label*="Tema"]');
        const initialTheme = document.documentElement.className;
        const initialThemeIcon = themeBtn ? themeBtn.textContent.trim() : null;
        if (themeBtn) themeBtn.click();
        const toggledTheme = document.documentElement.className;
        const toggledThemeIcon = themeBtn ? themeBtn.textContent.trim() : null;

        const submitBtn = document.getElementById('btn-submit');
        const submitBtnStyle = submitBtn ? window.getComputedStyle(submitBtn) : {};
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');

        const demoBtns = Array.from(document.querySelectorAll('[data-fill-user]')).map(b => ({
          user: b.getAttribute('data-fill-user'),
          role: b.getAttribute('data-fill-role')
        }));

        const salesDropdownOptions = Array.from(document.querySelectorAll('#sales-select option')).map(o => o.value);

        return {
          title: document.title,
          themeToggleWorks: initialTheme !== toggledTheme,
          initialTheme,
          toggledTheme,
          initialThemeIcon,
          toggledThemeIcon,
          submitBtnBg: submitBtnStyle.backgroundColor,
          submitBtnColor: submitBtnStyle.color,
          hasUsernameInput: !!usernameInput,
          hasPasswordInput: !!passwordInput,
          demoBtnsCount: demoBtns.length,
          salesDropdownCount: salesDropdownOptions.length,
          salesDropdownOptions: salesDropdownOptions.slice(0, 7)
        };
      })()`,
      returnByValue: true
    });
    results.login = loginRes.result.value;
    ws.close();
  }

  // 2. Audit admin.html
  {
    const targetRes = await (await fetch(`http://localhost:${PORT}/json/new`, { method: 'PUT' })).json();
    const ws = new globalThis.WebSocket(targetRes.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    await sendCommand(ws, 'Page.enable');
    await sendCommand(ws, 'Runtime.enable');
    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    // Set Admin session
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
    await sleep(1500);

    const adminRes = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(async () => {
        // Theme toggle
        const themeBtn = document.getElementById('desktopThemeBtn');
        const initialTheme = document.documentElement.className;
        if (themeBtn) themeBtn.click();
        const toggledTheme = document.documentElement.className;
        const bgSurface1 = window.getComputedStyle(document.querySelector('.bg-surface-1')).backgroundColor;
        if (themeBtn) themeBtn.click(); // switch back

        // KPI values
        const kpis = {
          achievement: document.getElementById('kpiAchievementVal')?.textContent,
          qty: document.getElementById('kpiQtyVal')?.textContent,
          revenue: document.getElementById('kpiRevenueVal')?.textContent,
          pembayaran: document.getElementById('kpiPembayaranVal')?.textContent,
          outstanding: document.getElementById('kpiOutstandingVal')?.textContent,
          invoices: document.getElementById('kpiInvoicesVal')?.textContent
        };

        // Comparison table rows
        const compRows = Array.from(document.querySelectorAll('#comparisonTableBody tr')).map(tr => {
          const cells = Array.from(tr.querySelectorAll('td')).map(c => c.textContent.trim());
          return cells[0] || '';
        });

        // Test Drawer Scroll (K-04)
        const outstandingCard = document.querySelector('[data-kpi="outstanding"]');
        if (outstandingCard) outstandingCard.click();
        await new Promise(r => setTimeout(r, 100));
        const drawer = document.getElementById('kpiDrawer');
        const drawerContent = document.getElementById('drawerContent');
        const drawerScrollHeight = drawerContent ? drawerContent.scrollHeight : 0;
        const drawerClientHeight = drawerContent ? drawerContent.clientHeight : 0;
        const drawerCanScroll = drawerScrollHeight > drawerClientHeight;
        const drawerCardsCount = drawerContent ? drawerContent.querySelectorAll('.rounded-lg').length : 0;
        const drawerCloseBtn = document.getElementById('drawerCloseBtn');
        if (drawerCloseBtn) drawerCloseBtn.click();

        // Test Invoice Status filter (K-03)
        window.location.hash = '#invoices';
        await new Promise(r => setTimeout(r, 200));
        const statusFilter = document.getElementById('invoiceStatusFilter');
        const statusCounts = {};
        if (statusFilter) {
          const options = Array.from(statusFilter.options).map(o => o.value);
          for (const opt of options) {
            statusFilter.value = opt;
            statusFilter.dispatchEvent(new Event('change'));
            await new Promise(r => setTimeout(r, 50));
            const countText = document.getElementById('invoiceCountBadge')?.textContent || '';
            statusCounts[opt] = countText;
          }
          statusFilter.value = 'all';
          statusFilter.dispatchEvent(new Event('change'));
        }

        // Test Sales filter dropdown
        const salesFilter = document.getElementById('salesFilterSelect');
        const salesOptions = salesFilter ? Array.from(salesFilter.options).map(o => o.value) : [];

        // Check 8-point Desktop UI
        const sidebarToggle = document.getElementById('sidebarToggleBtn');
        const desktopNotif = document.getElementById('desktopNotifBtn');
        const section2 = document.getElementById('adminAnalyticsSection');
        const chartH = document.getElementById('chartInteractiveContainer')?.clientHeight;
        const chartViewBox = document.getElementById('trendChartSvg')?.getAttribute('viewBox');

        return {
          themeToggleWorks: initialTheme !== toggledTheme,
          lightBgSurface1: bgSurface1,
          kpis,
          compRowsCount: compRows.length,
          compRows: compRows.slice(0, 8),
          drawerCanScroll,
          drawerScrollHeight,
          drawerClientHeight,
          drawerCardsCount,
          statusCounts,
          salesOptions,
          hasSidebarToggle: !!sidebarToggle,
          hasDesktopNotif: !!desktopNotif,
          section2Class: section2?.className,
          chartH,
          chartViewBox
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    results.admin = adminRes.result.value;
    ws.close();
  }

  // 3. Audit sales.html
  {
    const targetRes = await (await fetch(`http://localhost:${PORT}/json/new`, { method: 'PUT' })).json();
    const ws = new globalThis.WebSocket(targetRes.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    await sendCommand(ws, 'Page.enable');
    await sendCommand(ws, 'Runtime.enable');
    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    // Set Sales session (Aru)
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
    await sleep(1500);

    const salesRes = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(async () => {
        // Sales isolation check
        const kpis = {
          achievement: document.getElementById('kpiAchievementVal')?.textContent,
          qty: document.getElementById('kpiQtyVal')?.textContent,
          revenue: document.getElementById('kpiRevenueVal')?.textContent,
          pembayaran: document.getElementById('kpiPembayaranVal')?.textContent,
          outstanding: document.getElementById('kpiOutstandingVal')?.textContent,
          invoices: document.getElementById('kpiInvoicesVal')?.textContent
        };

        // Check if Upload menu exists in DOM
        const uploadNav = document.querySelector('[data-route="upload"]');
        const uploadHashBlocked = await (async () => {
          window.location.hash = '#upload';
          await new Promise(r => setTimeout(r, 100));
          return window.location.hash;
        })();

        // Invoice count for Aru
        window.location.hash = '#invoices';
        await new Promise(r => setTimeout(r, 100));
        const invBadge = document.getElementById('invoiceCountBadge')?.textContent;

        return {
          salesName: document.getElementById('headerUserName')?.textContent,
          kpis,
          hasUploadInNav: !!uploadNav,
          uploadHashBlocked,
          invoicesCountText: invBadge
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    results.sales = salesRes.result.value;
    ws.close();
  }

  chromeProc.kill();
  console.log(JSON.stringify(results, null, 2));
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
