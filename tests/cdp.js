// 极简 CDP 客户端：只用 Node 内置模块，避免引入 puppeteer 依赖。
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const net = require('net');

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

function findBrowser() {
  const fs = require('fs');
  for (const p of CHROME_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('未找到 Chrome/Edge 可执行文件');
}

function httpGet(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// 最小 WebSocket 客户端（只支持 text frame，足够 CDP 用）
class WS {
  constructor(url) {
    const u = new URL(url);
    this.host = u.hostname;
    this.port = Number(u.port || 80);
    this.path = u.pathname + (u.search || '');
    this.buf = Buffer.alloc(0);
    this.handlers = new Map();
    this.msgId = 0;
    this.fragments = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString('base64');
      this.sock = net.connect(this.port, this.host, () => {
        this.sock.write(
          `GET ${this.path} HTTP/1.1\r\n` +
          `Host: ${this.host}:${this.port}\r\n` +
          'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
          `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
        );
      });
      this.sock.on('data', (chunk) => {
        this.buf = Buffer.concat([this.buf, chunk]);
        if (!this.upgraded) {
          const idx = this.buf.indexOf('\r\n\r\n');
          if (idx === -1) return;
          const head = this.buf.slice(0, idx).toString();
          if (!/101/.test(head)) return reject(new Error('WS upgrade failed: ' + head.split('\r\n')[0]));
          this.upgraded = true;
          this.buf = this.buf.slice(idx + 4);
          resolve();
          this._drain();
        } else {
          this._drain();
        }
      });
      this.sock.on('error', reject);
    });
  }

  _drain() {
    while (true) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0];
      const b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        len = Number(this.buf.readBigUInt64BE(2));
        offset = 10;
      }
      let maskKey = null;
      if (masked) {
        if (this.buf.length < offset + 4) return;
        maskKey = this.buf.slice(offset, offset + 4);
        offset += 4;
      }
      if (this.buf.length < offset + len) return;
      let payload = this.buf.slice(offset, offset + len);
      this.buf = this.buf.slice(offset + len);
      if (maskKey) {
        payload = Buffer.from(payload.map((byte, i) => byte ^ maskKey[i % 4]));
      }
      if (opcode === 0x8) { this.sock.end(); return; }
      if (opcode === 0x1 || opcode === 0x0) {
        this.fragments.push(payload);
        if (fin) {
          const text = Buffer.concat(this.fragments).toString('utf8');
          this.fragments = [];
          this._emit(text);
        }
      } else if (opcode === 0x9) {
        this._sendFrame(payload, 0xa);
      }
    }
  }

  _emit(text) {
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (msg.id && this.handlers.has(msg.id)) {
      const { resolve, reject } = this.handlers.get(msg.id);
      this.handlers.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method && this.eventHandlers?.has(msg.method)) {
      this.eventHandlers.get(msg.method).forEach((fn) => fn(msg.params));
    }
  }

  _sendFrame(payload, opcode = 0x1) {
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, 0x80 | len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    const mask = crypto.randomBytes(4);
    const masked = Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4]));
    this.sock.write(Buffer.concat([header, mask, masked]));
  }

  send(method, params = {}) {
    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      this.handlers.set(id, { resolve, reject });
      this._sendFrame(Buffer.from(JSON.stringify({ id, method, params })));
    });
  }

  on(method, fn) {
    this.eventHandlers = this.eventHandlers || new Map();
    if (!this.eventHandlers.has(method)) this.eventHandlers.set(method, []);
    this.eventHandlers.get(method).push(fn);
  }

  close() { try { this.sock.end(); } catch {} }
}

class Browser {
  constructor(port = 9333) {
    this.port = port;
    this.proc = null;
  }

  async launch() {
    const exe = findBrowser();
    this.proc = spawn(exe, [
      '--headless=new',
      `--remote-debugging-port=${this.port}`,
      '--no-first-run', '--no-default-browser-check', '--disable-gpu',
      '--disable-dev-shm-usage', '--mute-audio',
      '--user-data-dir=' + require('os').tmpdir() + '/wjx-test-profile-' + Date.now(),
      'about:blank',
    ], { stdio: 'ignore' });
    for (let i = 0; i < 100; i++) {
      try { await httpGet(this.port, '/json/version'); return; } catch { await sleep(200); }
    }
    throw new Error('浏览器启动超时');
  }

  async newPage() {
    const targets = JSON.parse(await httpGet(this.port, '/json/list'));
    let target = targets.find((t) => t.type === 'page');
    if (!target) {
      await httpGet(this.port, '/json/new?about:blank');
      const again = JSON.parse(await httpGet(this.port, '/json/list'));
      target = again.find((t) => t.type === 'page');
    }
    const ws = new WS(target.webSocketDebuggerUrl);
    await ws.connect();
    const page = new Page(ws);
    await page.init();
    return page;
  }

  kill() { if (this.proc) this.proc.kill(); }
}

class Page {
  constructor(ws) { this.ws = ws; this.consoleErrors = []; this.pageErrors = []; }

  async init() {
    await this.ws.send('Page.enable');
    await this.ws.send('Runtime.enable');
    await this.ws.send('Log.enable').catch(() => {});
    this.ws.on('Runtime.exceptionThrown', (p) => {
      this.pageErrors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'unknown');
    });
    this.ws.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') {
        this.consoleErrors.push((p.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
      }
    });
  }

  async goto(url) {
    await this.ws.send('Page.navigate', { url });
    await this.waitForLoad();
  }

  async waitForLoad(timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const r = await this.evaluate('document.readyState');
        if (r === 'complete') return true;
      } catch {}
      await sleep(100);
    }
    return false;
  }

  // 在页面内执行表达式并返回可序列化结果
  async evaluate(expression, userGesture = false) {
    const res = await this.ws.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture,
    });
    if (res.exceptionDetails) {
      throw new Error('页面内异常: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    }
    return res.result.value;
  }

  async waitFor(expression, timeout = 8000, interval = 100) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try { if (await this.evaluate(expression)) return true; } catch {}
      await sleep(interval);
    }
    return false;
  }

  close() { this.ws.close(); }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

module.exports = { Browser, Page, sleep, findBrowser };
