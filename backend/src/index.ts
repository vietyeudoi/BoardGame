/**
 * index.ts — Backend Entry Point
 */
import { HttpServer } from './server/HttpServer.js';
import { WebSocketServer } from './server/WebSocketServer.js';
import { RoomManager } from './room/RoomManager.js';
import { Logger } from './utils/Logger.js';
import { HTTP_PORT } from '../../shared/constants/config.js';

const logger = Logger.create('Bootstrap');

async function main(): Promise<void> {
  logger.info('Cat Boom Online Backend starting (M0)');

  const roomManager = new RoomManager();
  const port = Number(process.env['PORT'] ?? HTTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT phải là số nguyên từ 1 đến 65535.');
  }
  const httpServer = new HttpServer(port);
  const wsServer = new WebSocketServer(httpServer.getServer(), roomManager);

  httpServer.start();
  wsServer.start();

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received — shutting down');
    wsServer.shutdown();
    httpServer.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received — shutting down');
    wsServer.shutdown();
    httpServer.stop();
    process.exit(0);
  });
}

main().catch((error: unknown) => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});

