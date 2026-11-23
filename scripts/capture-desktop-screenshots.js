const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9666;
const BASE_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(BASE_DIR, 'docs', 'screenshots');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sendCommand(ws, method, params = {}) {
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

async function capture() {
  console.log('Capturing screenshots for Revision 02...');
  const tmpDir = '/tmp/chrome-ss-' + Date.now();
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + tmpDir,
    '--no-first-run',
    '--no-default-browser-check'
  ], { stdio: 'ignore' });

  for (let i = 0; i < 40; i++) {
    await sleep(400);
    try {
      const v = await (await fetch(`http://localhost:${PORT}/json/version`)).json();
      if (v.webSocketDebuggerUrl) break;
    } catch (e) {}
  }

  async function takeShot(url, role, sessionData, theme, filename) {
    const targetRes = await (await fetch(`http://localhost:${PORT}/json/new`, { method: 'PUT' })).json();
    const ws = new globalThis.WebSocket(targetRes.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    await sendCommand(ws, 'Page.enable');
    await sendCommand(ws, 'Runtime.enable');
    await sendCommand(ws, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    await sendCommand(ws, 'Page.navigate', { url });
    await sleep(400);
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `
        localStorage.setItem('fade_showcase_session_v021', JSON.stringify(${JSON.stringify(sessionData)}));
        localStorage.setItem('fade_showcase_theme_v02', '${theme}');
      `
    });
    await sendCommand(ws, 'Page.navigate', { url });
    await sleep(1000);
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `
        if (window.FADE_STORE) window.FADE_STORE.setTheme('${theme}');
        if (window.FADE_TREND_CHART) window.FADE_TREND_CHART.resize();
      `
    });
    await sleep(600);

    const shot = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SCREENSHOT_DIR, filename), Buffer.from(shot.data, 'base64'));
    console.log(`Saved: ${filename}`);
    ws.close();
  }

  // 1. Admin Dark & Light
  const adminSession = { role: 'admin', username: 'admin', name: 'Raka Pratama', title: 'Head of Operations' };
  await takeShot('file://' + path.join(BASE_DIR, 'admin.html#dashboard'), 'admin', adminSession, 'dark', '03_admin_desktop_dark_1440x900.png');
  await takeShot('file://' + path.join(BASE_DIR, 'admin.html#dashboard'), 'admin', adminSession, 'light', '04_admin_desktop_light_1440x900.png');

  // 2. Sales Dark & Light
  const salesSession = { role: 'sales', username: 'aru', name: 'Aru', title: 'Sales Representative', salesName: 'Aru', salesId: 'SLS-ARU', region: 'Operasional Sales' };
  await takeShot('file://' + path.join(BASE_DIR, 'sales.html#dashboard'), 'sales', salesSession, 'dark', '06_sales_desktop_dark_1440x900.png');
  await takeShot('file://' + path.join(BASE_DIR, 'sales.html#dashboard'), 'sales', salesSession, 'light', '07_sales_desktop_light_1440x900.png');

  chromeProc.kill();
  console.log('All screenshots captured successfully!');
}

capture().catch(err => {
  console.error(err);
  process.exit(1);
});
