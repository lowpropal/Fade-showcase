const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = globalThis.WebSocket;

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9223;
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

async function main() {
  console.log('Testing Admin Dashboard Desktop UI Revisions...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=/tmp/chrome-cdp-verify-desktop',
    '--no-first-run',
    '--no-default-browser-check'
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    try {
      version = await getJson(`http://localhost:${PORT}/json/version`);
      if (version && version.webSocketDebuggerUrl) break;
    } catch (e) {}
  }

  if (!version) {
    console.error('Failed to start Chrome');
    chromeProc.kill();
    process.exit(1);
  }

  const targetRes = await (await fetch(`http://localhost:${PORT}/json/new`, { method: 'PUT' })).json();
  const ws = new WebSocket(targetRes.webSocketDebuggerUrl);

  await new Promise(res => ws.addEventListener('open', res));
  await sendCommand(ws, 'Page.enable');
  await sendCommand(ws, 'Runtime.enable');
  await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });

  // Navigate to admin.html and set admin session
  const adminUrl = 'file://' + path.join(BASE_DIR, 'admin.html#dashboard');
  await sendCommand(ws, 'Page.navigate', { url: adminUrl });
  await sleep(1000);

  // Set active admin session in localStorage and reload
  await sendCommand(ws, 'Runtime.evaluate', {
    expression: `
      localStorage.setItem('fade_showcase_session_v021', JSON.stringify({
        role: 'admin',
        username: 'admin',
        name: 'Raka Pratama',
        title: 'Admin'
      }));
    `
  });
  await sendCommand(ws, 'Page.navigate', { url: adminUrl });
  await sleep(1500);

  // Check 1: Session & Role
  const evalRole = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `JSON.stringify({
      title: document.title,
      userName: document.getElementById('headerUserName')?.textContent,
      userRole: document.getElementById('headerUserRole')?.textContent,
      revVal: document.getElementById('kpiRevenueVal')?.textContent,
      chartRev: document.getElementById('chartMonthlyRevenue')?.textContent,
      totalInv: document.getElementById('chartStatusTotalInv')?.textContent,
      collectedRate: document.getElementById('chartStatusCollectedRate')?.textContent
    })`,
    returnByValue: true
  });
  console.log('Check 1 (Admin Session & Real Data):', JSON.parse(evalRole.result.value));

  // Check 2: Sidebar Toggle button & dimensions
  const evalSidebar = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(async () => {
      const btn = document.getElementById('sidebarToggleBtn');
      const sidebar = document.querySelector('.shell-sidebar');
      const main = document.querySelector('.shell-main-content');
      const initialWidth = sidebar ? window.getComputedStyle(sidebar).width : null;
      const initialPadding = main ? window.getComputedStyle(main).paddingLeft : null;

      // Click toggle
      btn.click();
      await new Promise(r => setTimeout(r, 250));
      const afterClickCollapsed = document.body.classList.contains('sidebar-collapsed');
      const collapsedWidth = window.getComputedStyle(sidebar).width;
      const collapsedPadding = window.getComputedStyle(main).paddingLeft;
      const storedState = localStorage.getItem('fade_sidebar_state');

      // Click again to uncollapse
      btn.click();
      await new Promise(r => setTimeout(r, 250));
      const afterUncollapse = document.body.classList.contains('sidebar-collapsed');
      const uncollapsedWidth = window.getComputedStyle(sidebar).width;

      return JSON.stringify({
        btnExists: !!btn,
        initialWidth,
        initialPadding,
        afterClickCollapsed,
        collapsedWidth,
        collapsedPadding,
        storedState,
        afterUncollapse,
        uncollapsedWidth
      });
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Check 2 (Sidebar Toggle & Collapse State):', JSON.parse(evalSidebar.result.value));

  // Check 3: Notification Button & Popover
  const evalNotif = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const btn = document.getElementById('desktopNotifBtn');
      const dot = document.getElementById('desktopNotifDot');
      const popover = document.getElementById('desktopNotifPopover');
      const badge = document.getElementById('notifBadgeCount');
      const items = document.querySelectorAll('#notifItemsContainer > div');

      // Click notif button to open
      btn.click();
      const isVisibleAfterClick = !popover.classList.contains('hidden');

      // Close button
      const closeBtn = document.getElementById('closeNotifPopoverBtn');
      closeBtn.click();
      const isHiddenAfterClose = popover.classList.contains('hidden');

      return JSON.stringify({
        btnExists: !!btn,
        dotVisible: dot && window.getComputedStyle(dot).display !== 'none',
        badgeCount: badge?.textContent,
        itemsCount: items.length,
        isVisibleAfterClick,
        isHiddenAfterClose
      });
    })()`,
    returnByValue: true
  });
  console.log('Check 3 (Notification Popover):', JSON.parse(evalNotif.result.value));

  // Check 4: Section 2 Layout (1-Column Stack & Order)
  const evalSection2 = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const sec = document.getElementById('adminAnalyticsSection');
      const children = sec ? Array.from(sec.children) : [];
      const card1Title = children[0]?.querySelector('h2')?.textContent;
      const card2Title = children[1]?.querySelector('h2')?.textContent;

      // Status Pembayaran 4 Horizontal cards
      const lunas = document.getElementById('chartPayLunasText')?.textContent;
      const lunasPct = document.getElementById('chartPayLunasPct')?.textContent;
      const sebagian = document.getElementById('chartPaySebagianText')?.textContent;
      const sebagianPct = document.getElementById('chartPaySebagianPct')?.textContent;
      const terlambat = document.getElementById('chartPayTerlambatText')?.textContent;
      const terlambatPct = document.getElementById('chartPayTerlambatPct')?.textContent;
      const tempo = document.getElementById('chartPayTempoText')?.textContent;
      const tempoPct = document.getElementById('chartPayTempoPct')?.textContent;

      return JSON.stringify({
        sectionClass: sec?.className,
        card1Title,
        card2Title,
        paymentStatusCards: {
          lunas: lunas + ' ' + lunasPct,
          sebagian: sebagian + ' ' + sebagianPct,
          terlambat: terlambat + ' ' + terlambatPct,
          tempo: tempo + ' ' + tempoPct
        }
      });
    })()`,
    returnByValue: true
  });
  console.log('Check 4 (Section 2 Layout & Payment Status):', JSON.parse(evalSection2.result.value));

  // Check 5: Trend Chart Sizing, Controls Position & Axis
  const evalChart = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const container = document.getElementById('chartInteractiveContainer');
      const svg = document.getElementById('trendChartSvg');
      const rect = container ? container.getBoundingClientRect() : {};
      const viewBox = svg?.getAttribute('viewBox');
      const yLabels = Array.from(document.querySelectorAll('#chartYAxisLabels text')).map(t => t.textContent);
      const xLabels = Array.from(document.querySelectorAll('#chartXAxisLabels text')).map(t => t.textContent);
      const btnLine = document.getElementById('chartBtnLine');
      const btnBar = document.getElementById('chartBtnBar');

      // Test Bar mode switch
      btnBar.click();
      const barsCount = document.querySelectorAll('#chartBarsGroup rect').length;

      // Switch back to Line mode
      btnLine.click();
      const lineAreaD = document.getElementById('chartSplineArea')?.getAttribute('d')?.length > 0;

      return JSON.stringify({
        containerHeight: rect.height,
        containerWidth: rect.width,
        viewBox,
        yLabels,
        xLabels,
        barsCountInBarMode: barsCount,
        splineActiveInLineMode: lineAreaD
      });
    })()`,
    returnByValue: true
  });
  console.log('Check 5 (Trend Chart Geometry & Switcher):', JSON.parse(evalChart.result.value));

  // Check 6: Viewport 1280x800 test
  await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });
  await sleep(500);
  const eval1280 = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const bodyWidth = document.body.scrollWidth;
      const windowWidth = window.innerWidth;
      const noHorizontalOverflow = bodyWidth <= windowWidth;
      return JSON.stringify({ windowWidth, bodyWidth, noHorizontalOverflow });
    })()`,
    returnByValue: true
  });
  console.log('Check 6 (Viewport 1280x800 No Overflow):', JSON.parse(eval1280.result.value));

  ws.close();
  chromeProc.kill();
  console.log('ALL VERIFICATIONS COMPLETED.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
