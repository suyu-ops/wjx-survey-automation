// 检查能否用 Chrome headless + CDP 驱动
const { spawn } = require('child_process');
const http = require('http');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

(async () => {
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + require('os').tmpdir() + '/wjx-probe-profile',
    'about:blank'
  ], { stdio: 'ignore' });

  for (let i = 0; i < 60; i++) {
    try { await get('/json/version'); break; } catch { await new Promise(r => setTimeout(r, 250)); }
  }
  try {
    const v = JSON.parse(await get('/json/version'));
    console.log('CDP OK:', v.Browser);
    console.log('WebSocket:', v.webSocketDebuggerUrl);
  } catch (e) {
    console.log('CDP FAIL:', e.message);
  }
  proc.kill();
  process.exit(0);
})();
