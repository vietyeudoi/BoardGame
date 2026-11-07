/**
 * main.ts — Application Entry Point
 * Cat Boom Online M0
 */
import { App } from './app/App';

const container = document.getElementById('app');
if (!container) {
  throw new Error('main: #app container not found in DOM');
}

const app = new App(container);
(window as any).__app = app;
(window as any).__sceneManager = (app as any)._sceneManager;
(window as any).__store = (app as any)._store;
app.start();
