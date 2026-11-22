const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9222;
const BASE_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(BASE_DIR, 'docs', 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getJson(url) {
  const res = await fetch(url);
  return res.json();
}

async function runCapture() {
  console.log('Starting headless Chrome on port ' + PORT + '...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=/tmp/chrome-cdp-fade',
    '--no-first-run',
    '--no-default-browser-check'
  ], { stdio: 'ignore' });

  // Wait for Chrome to be ready
  let version = null;
  for (let i = 0; i < 20; i++) {
    await sleep(400);
    try {
      version = await getJson(`http://localhost:${PORT}/json/version`);
      if (version && version.webSocketDebuggerUrl) break;
    } catch (e) {}
  }

  if (!version) {
    console.error('Failed to connect to Chrome CDP.');
    chromeProc.kill();
    process.exit(1);
  }

  console.log('Chrome CDP connected.');

  const targets = [
    {
      name: '01_login_desktop_1440x900.png',
      url: 'file://' + path.join(BASE_DIR, 'index.html'),
      width: 1440,
      height: 900,
      mobile: false,
      actions: null
    },
    {
      name: '02_login_mobile_390x844.png',
      url: 'file://' + path.join(BASE_DIR, 'index.html'),
      width: 390,
      height: 844,
      mobile: true,
      actions: null
    },
    {
      name: '03_admin_desktop_dark_1440x900.png',
      url: 'file://' + path.join(BASE_DIR, 'app.html?theme=dark#dashboard'),
      width: 1440,
      height: 1080,
      mobile: false,
      initScript: `
        localStorage.setItem('fade_active_session', JSON.stringify({ role: 'admin', name: 'Raka Pratama', title: 'Administrator', salesName: null }));
        localStorage.setItem('fade_theme', 'dark');
      `,
      actions: async (send) => {
        await sleep(500);
      }
    },
    {
      name: '04_admin_desktop_light_1440x900.png',
      url: 'file://' + path.join(BASE_DIR, 'app.html?theme=light#dashboard'),
      width: 1440,
      height: 1080,
      mobile: false,
      initScript: `
        localStorage.setItem('fade_active_session', JSON.stringify({ role: 'admin', name: 'Raka Pratama', title: 'Administrator', salesName: null }));
        localStorage.setItem('fade_theme', 'light');
      `,
      actions: async (send) => {
        await sleep(500);
      }
    },
    {
      name: '05_admin_mobile_390x844.png',
      url: 'file://' + path.join(BASE_DIR, 'app.html#dashboard'),
      width: 390,
      height: 950,
      mobile: true,
      initScript: `
        localStorage.setItem('fade_active_session', JSON.stringify({ role: 'admin', name: 'Raka Pratama', title: 'Administrator', salesName: null }));
        localStorage.setItem('fade_theme', 'dark');
      `,
      actions: async (send) => {
        await sleep(500);
      }
    },
    {
      name: '06_admin_mobile_charts_390x844.png',
      url: 'file://' + path.join(BASE_DIR, 'app.html#dashboard'),
      width: 390,
      height: 900,
      mobile: true,
      initScript: `
        localStorage.setItem('fade_active_session', JSON.stringify({ role: 'admin', name: 'Raka Pratama', title: 'Administrator', salesName: null }));
        localStorage.setItem('fade_theme', 'dark');
      `,
      actions: async (send) => {
        await send('Runtime.evaluate', {
          expression: `
            var el = document.getElementById('adminAnalyticsSection');
            if (el) el.scrollIntoView();
          `
        });
        await sleep(400);
      }
    },
    {
      name: '07_admin_chart_7D_interactive.png',
      url: 'file://' + path.join(BASE_DIR, 'app.html#dashboard'),
      width: 1440,
      height: 1080,
      mobile: false,
      initScript: `
        localStorage.setItem('fade_active_session', JSON.stringify({ role: 'admin', name: 'Raka Pratama', title: 'Administrator', salesName: null }));
        localStorage.setItem('fade_theme', 'dark');
      `,
      actions: async (send) => {
        await send('Runtime.evaluate', {
          expression: `
            document.getElementById('chartBtn7D').click();
          `
        });
        await sleep(500);
      }
    },
    {
      name: '08_admin_chart_90D_interactive.png',
      url: 'file://' + path.join(BASE_DIR, 'app.html#dashboard'),
      width: 1440,
      height: 1080,
      mobile: false,
      initScript: `
        localStorage.setItem('fade_active_session', JSON.stringify({ role: 'admin', name: 'Raka Pratama', title: 'Administrator', salesName: null }));
        localStorage.setItem('fade_theme', 'dark');
      `,
      actions: async (send) => {
        await send('Runtime.evaluate', {
          expression: `
            document.getElementById('chartBtn90D').click();
          `
        });
        await sleep(500);
      }
    }
  ];

  try {
    // Get initial tab or create via Target domain
    const tabs = await getJson(`http://localhost:${PORT}/json/list`);
    const browserWs = version.webSocketDebuggerUrl;

    for (const t of targets) {
      console.log(`Capturing ${t.name}...`);
      
      // Connect to browser or existing tab
      let tab = (await getJson(`http://localhost:${PORT}/json/list`)).find(x => x.type === 'page');
      if (!tab) {
        // Create new target via PUT
        const res = await fetch(`http://localhost:${PORT}/json/new`, { method: 'PUT' });
        tab = await res.json();
      }
      const ws = new WebSocket(tab.webSocketDebuggerUrl);

      let msgId = 1;
      const pending = new Map();

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.id && pending.has(data.id)) {
          const { resolve, reject } = pending.get(data.id);
          pending.delete(data.id);
          if (data.error) reject(data.error);
          else resolve(data.result);
        }
      };

      await new Promise(r => ws.onopen = r);

      const send = (method, params = {}) => {
        return new Promise((resolve, reject) => {
          const id = msgId++;
          pending.set(id, { resolve, reject });
          ws.send(JSON.stringify({ id, method, params }));
        });
      };

      await send('Page.enable');
      await send('DOM.enable');

      // Set Device Metrics
      await send('Emulation.setDeviceMetricsOverride', {
        width: t.width,
        height: t.height,
        deviceScaleFactor: 1,
        mobile: t.mobile
      });

      if (t.initScript) {
        await send('Page.addScriptToEvaluateOnNewDocument', {
          source: t.initScript
        });
      }

      // Navigate to target URL
      await send('Page.navigate', { url: t.url });

      // Wait a moment for page load
      await sleep(500);

      if (t.actions) {
        await t.actions(send);
      }

      // Capture Screenshot
      const result = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false
      });

      const buffer = Buffer.from(result.data, 'base64');
      const outPath = path.join(SCREENSHOT_DIR, t.name);
      fs.writeFileSync(outPath, buffer);
      console.log(`Saved: ${outPath} (${buffer.length} bytes)`);

      ws.close();
      await sleep(200);
    }
  } finally {
    chromeProc.kill();
    console.log('Screenshots capture complete.');
  }
}

runCapture().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
