import http from 'http';
import fs from 'fs';
import wsPkg from 'file:///D:/BoardGame/backend/node_modules/ws/index.js';
const { WebSocket } = wsPkg;

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

export class BrowserController {
  constructor(port = 9222) {
    this.port = port;
    this.ws = null;
    this.id = 1;
    this.pending = new Map();
  }

  async connect() {
    const list = await fetchJson(`http://127.0.0.1:${this.port}/json/list`);
    const page = list.find(t => t.type === 'page');
    if (!page) throw new Error('No page target found');
    this.ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });

    this.ws.on('message', (raw) => {
      const data = JSON.parse(raw);
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    });

    await this.send('Page.enable');
    await this.send('Runtime.enable');
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  }

  async screenshot(outputPath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    console.log(`Screenshot saved to ${outputPath}`);
  }

  async close() {
    if (this.ws) this.ws.close();
  }
}
