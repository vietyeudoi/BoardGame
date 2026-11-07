/**
 * HttpServer.ts — HTTP Server Setup with health check endpoint
 */
import * as http from 'http';
import { Logger } from '../utils/Logger.js';

const logger = Logger.create('HttpServer');

export class HttpServer {
  private readonly _server: http.Server;

  constructor(private readonly _port: number) {
    this._server = http.createServer((req, res) => {
      this._handleRequest(req, res);
    });
  }

  private _handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url ?? '/';
    logger.debug('HTTP request', { method: req.method, url });

    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'cat-boom-online', milestone: 'M0' }));
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  }

  getServer(): http.Server {
    return this._server;
  }

  start(): void {
    this._server.listen(this._port, () => {
      logger.info(`HTTP server listening on port ${this._port}`);
    });
  }

  stop(): void {
    if ('closeAllConnections' in this._server) {
      this._server.closeAllConnections();
    }
    this._server.close();
    logger.info('HTTP server stopped');
  }
}

