import { startBrowser } from 'file:///D:/BoardGame/run_visual_debug.mjs';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const browser = await startBrowser();
  console.log('Browser started successfully!');

  // Wait for app to load
  await sleep(2000);

  // Check title & lobby
  const title = await browser.evaluate('document.title');
  console.log('Page Title:', title);

  const screen = await browser.evaluate(`document.querySelector('#ui-overlay')?.innerText`);
  console.log('UI Overlay Text:', screen?.substring(0, 200));

  await browser.screenshot('D:/BoardGame/screen_01_lobby.png');

  // Click "Tạo phòng" (Create room) or "Chơi Offline" / sandbox
  const createBtnFound = await browser.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const createBtn = btns.find(b => b.innerText.includes('Tạo phòng') || b.innerText.includes('Vào Sandbox') || b.innerText.includes('Sandbox'));
      if (createBtn) {
        createBtn.click();
        return createBtn.innerText;
      }
      return null;
    })()
  `);
  console.log('Clicked button:', createBtnFound);

  await sleep(1500);
  await browser.screenshot('D:/BoardGame/screen_02_game.png');

  // Draw 5 cards
  for (let i = 0; i < 5; i++) {
    const drawRes = await browser.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Rút bài') || b.innerText.includes('Draw') || b.id.includes('draw'));
        if (btn) {
          btn.click();
          return 'clicked button';
        }
        // or trigger keyboard 'H'
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', code: 'KeyH' }));
        return 'dispatched H key';
      })()
    `);
    console.log('Draw result:', drawRes);
    await sleep(400);
  }

  await sleep(1000);
  await browser.screenshot('D:/BoardGame/screen_03_hand5.png');

  // Hover over the deck (deck is in middle-left of table)
  // Let's find deck screen position via evaluate
  const deckPos = await browser.evaluate(`
    (() => {
      // Find canvas center
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      // Deck is at approx (rect.left + rect.width * 0.45, rect.top + rect.height * 0.5)
      return {
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        leftDeckX: rect.left + rect.width * 0.44,
        leftDeckY: rect.top + rect.height * 0.48
      };
    })()
  `);
  console.log('Deck screen estimation:', deckPos);

  if (deckPos) {
    console.log('Moving mouse over deck...');
    await browser.mouseMove(deckPos.leftDeckX, deckPos.leftDeckY);
    await sleep(500);
    await browser.screenshot('D:/BoardGame/screen_04_deck_hover.png');
  }

  // Get debug info from scene
  const debugInfo = await browser.evaluate(`
    (() => {
      // Inspect window or app
      const app = window.app || window.__app;
      return {
        hasApp: !!app
      };
    })()
  `);
  console.log('Debug info:', debugInfo);

  await browser.close();
  console.log('Done!');
}

main().catch(console.error);

