import { startBrowser } from 'file:///D:/BoardGame/run_visual_debug.mjs';

async function main() {
  const browser = await startBrowser();
  await new Promise(r => setTimeout(r, 2000));

  const netInfo = await browser.evaluate(`
    (() => {
      const app = window.__app;
      return {
        status: app?._networkClient?.getStatus(),
        storeStatus: app?._store?.getConnectionStatus(),
        wsReadyState: app?._networkClient?._ws?.readyState,
        wsUrl: app?._networkClient?._ws?.url,
        lobbyError: document.querySelector('#lobby-error')?.innerText
      };
    })()
  `);
  console.log('Network info:', netInfo);

  // Check console messages / errors in browser
  await browser.close();
}

main().catch(console.error);
