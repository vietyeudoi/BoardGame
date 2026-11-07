import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import wsPkg from 'file:///D:/BoardGame/backend/node_modules/ws/index.js';
const { WebSocket } = wsPkg;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

export async function startBrowser(port = 9222) {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tmpDir = 'C:\\Users\\VIET\\AppData\\Local\\Temp\\chrome_debug_' + Date.now() + '_' + port;
  fs.mkdirSync(tmpDir, { recursive: true });

  const proc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--window-size=1280,720',
    `--user-data-dir=${tmpDir}`,
    'http://localhost:3000'
  ], { stdio: 'ignore' });

  // Wait for port to be ready
  let target = null;
  for (let i = 0; i < 20; i++) {
    await sleep(250);
    try {
      const list = await fetchJson(`http://127.0.0.1:${port}/json/list`);
      target = list.find(t => t.type === 'page');
      if (target) break;
    } catch {}
  }

  if (!target) {
    proc.kill();
    throw new Error(`Chrome failed to start or open port ${port}`);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });

  let nextId = 1;
  const pending = new Map();
  ws.on('message', (raw) => {
    const data = JSON.parse(raw);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  return {
    proc,
    send,
    async evaluate(expr) {
      const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (res.exceptionDetails) {
        console.error('[CDP Evaluate Error]:', res.exceptionDetails);
      }
      return res.result?.value;
    },
    async screenshot(filepath) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(filepath, Buffer.from(res.data, 'base64'));
      console.log(`[Screenshot] Saved: ${filepath}`);
    },
    async mouseMove(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    },
    async mouseClick(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await sleep(50);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    },
    async mouseDrag(fromX, fromY, toX, toY, steps = 10) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fromX, y: fromY, button: 'left', clickCount: 1 });
      await sleep(50);
      for (let i = 1; i <= steps; i++) {
        const cx = fromX + (toX - fromX) * (i / steps);
        const cy = fromY + (toY - fromY) * (i / steps);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, button: 'left' });
        await sleep(25);
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: toX, y: toY, button: 'left', clickCount: 1 });
      await sleep(100);
    },
    async close() {
      try { ws.close(); } catch {}
      try { proc.kill(); } catch {}
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  };
}
