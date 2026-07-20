const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const ELECTRON = 'D:\\Projects\\OpenSource\\AgentApp\\node_modules\\electron\\dist\\electron.exe';
const MAIN = path.resolve(__dirname, 'dist/main.js');
const PORT = 9333;

const child = spawn(ELECTRON, [
  MAIN,
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:\\tmp\\sa-diag',
  '--no-sandbox'
], { stdio: 'ignore', detached: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(6000);
  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  } catch (e) {
    console.log('CDP_CONNECT_FAIL', e.message);
    try { process.kill(-child.pid); } catch {}
    process.exit(1);
  }
  const contexts = browser.contexts();
  const pages = contexts.flatMap(c => c.pages());
  console.log('PAGES_FOUND', pages.length);
  for (const p of pages) {
    p.on('console', (msg) => console.log('CONSOLE[' + msg.type() + ']', msg.text()));
    p.on('pageerror', (err) => console.log('PAGEERROR', err.message));
  }
  // Give it time to mount and log anything.
  await sleep(5000);
  console.log('DIAG_DONE');
  try { process.kill(-child.pid); } catch {}
  await browser.close();
  process.exit(0);
})();
