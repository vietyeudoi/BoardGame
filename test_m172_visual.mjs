import { startBrowser } from 'file:///D:/BoardGame/run_visual_debug.mjs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('--- Starting M1.7.2 Visual Verification ---');
  const browser = await startBrowser();

  try {
    // 1. Reload page to ensure clean state
    await browser.evaluate(`window.location.reload()`);
    await sleep(2000);

    // 2. Click "Tạo phòng"
    await browser.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tạo phòng'));
        btn?.click();
      })()
    `);
    await sleep(2000);

    // Helper: calculate screen coords for each card's exposed partition strip
    const getCardStripScreenCoords = async (cardIndex) => {
      return await browser.evaluate(`
        (() => {
          const sm = window.__app._sceneManager;
          const hz = sm._handZoneManager.getHandZoneForPlayer(0);
          const cards = hz ? hz.getCards() : [];
          const N = cards.length;
          if (${cardIndex} >= N) return null;

          const cardWidth = 2.5;
          const margin = 0.2;
          const maxAllowedSpan = Math.max(0, hz.zoneWidth - cardWidth - margin * 2);
          const spacing = N > 1 ? Math.min(0.85, maxAllowedSpan / (N - 1)) : 0;
          const totalSpan = (N - 1) * spacing;

          let sampleLocX;
          if (N === 1) {
            sampleLocX = 0;
          } else if (${cardIndex} < N - 1) {
            const leftBoundary = -totalSpan / 2 + ${cardIndex} * spacing - cardWidth / 2;
            const rightBoundary = -totalSpan / 2 + (${cardIndex} + 1) * spacing - cardWidth / 2;
            sampleLocX = (leftBoundary + rightBoundary) / 2;
          } else {
            const leftBoundary = -totalSpan / 2 + (N - 1) * spacing - cardWidth / 2;
            const rightBoundary = totalSpan / 2 + cardWidth / 2;
            sampleLocX = (leftBoundary + rightBoundary) / 2;
          }

          const worldPos = hz.position.clone().set(
            hz.position.x + sampleLocX,
            hz.position.y,
            hz.position.z
          );

          const cam = sm._renderer.getCamera();
          const canvas = sm._renderer.getDomElement();
          const rect = canvas.getBoundingClientRect();
          const s = worldPos.project(cam);

          return {
            cardId: cards[${cardIndex}].cardId,
            cx: Math.round(((s.x + 1) / 2) * rect.width + rect.left),
            cy: Math.round(((-s.y + 1) / 2) * rect.height + rect.top)
          };
        })()
      `);
    };

    // Helper: get deck screen coordinates
    const getDeckScreenCoords = async () => {
      return await browser.evaluate(`
        (() => {
          const sm = window.__app._sceneManager;
          const deck = sm.getOriginalDeck();
          if (!deck) return null;

          const camera = sm._renderer.getCamera();
          const canvas = sm._renderer.getDomElement();
          const rect = canvas.getBoundingClientRect();

          const screenPos = deck.position.clone().project(camera);
          return {
            cx: Math.round(((screenPos.x + 1) / 2) * rect.width + rect.left),
            cy: Math.round(((-screenPos.y + 1) / 2) * rect.height + rect.top)
          };
        })()
      `);
    };

    // Helper: inspect hover state of a card
    const getCardHoverState = async (cardIndex) => {
      return await browser.evaluate(`
        (() => {
          const sm = window.__app._sceneManager;
          const hz = sm._handZoneManager.getHandZoneForPlayer(0);
          const card = hz.getCards()[${cardIndex}];
          const hovered = sm._interactionManager.getHoveredObject();
          return {
            cardId: card ? card.cardId : null,
            isHovered: hovered === card,
            rotX: card ? card.rotation.x : null,
            posY: card ? card.position.y : null,
            scaleX: card ? card.scale.x : null
          };
        })()
      `);
    };

    // 3. Draw 10 cards to hand
    console.log('Drawing 10 cards to hand...');
    for (let i = 0; i < 10; i++) {
      await browser.evaluate(`
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', code: 'KeyH' }));
      `);
      await sleep(250);
    }
    await sleep(1000);

    // Screenshot 1: 10 cards normal state (flat overlapping fan)
    console.log('Screenshot 1: 10 cards normal state');
    await browser.mouseMove(100, 100);
    await sleep(500);
    await browser.screenshot('D:/BoardGame/m172_01_10cards_normal.png');

    // Screenshot 2: Hover first card (card 0)
    console.log('Screenshot 2: Hover first card (card 0)');
    const card0Strip = await getCardStripScreenCoords(0);
    if (card0Strip) {
      await browser.mouseMove(card0Strip.cx, card0Strip.cy);
      await sleep(500);
      const state0 = await getCardHoverState(0);
      console.log('Card 0 hover state:', state0);
      await browser.screenshot('D:/BoardGame/m172_02_hover_first.png');
    }

    // Screenshot 3: Hover middle card (card 4)
    console.log('Screenshot 3: Hover middle card (card 4)');
    const card4Strip = await getCardStripScreenCoords(4);
    if (card4Strip) {
      await browser.mouseMove(card4Strip.cx, card4Strip.cy);
      await sleep(500);
      const state4 = await getCardHoverState(4);
      console.log('Card 4 hover state:', state4);
      await browser.screenshot('D:/BoardGame/m172_03_hover_middle.png');
    }

    // Screenshot 4: Hover deeply overlapped card (card 7)
    console.log('Screenshot 4: Hover deeply overlapped card (card 7)');
    const card7Strip = await getCardStripScreenCoords(7);
    if (card7Strip) {
      await browser.mouseMove(card7Strip.cx, card7Strip.cy);
      await sleep(500);
      const state7 = await getCardHoverState(7);
      console.log('Card 7 hover state:', state7);
      await browser.screenshot('D:/BoardGame/m172_04_hover_deep.png');
    }

    // 4. Draw 5 more cards (total 15 cards)
    console.log('Drawing 5 more cards (total 15 cards)...');
    for (let i = 0; i < 5; i++) {
      await browser.evaluate(`
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', code: 'KeyH' }));
      `);
      await sleep(250);
    }
    await sleep(1000);

    // Screenshot 5: 15 cards hover one
    console.log('Screenshot 5: 15 cards hover one (card 10)');
    const card10Strip = await getCardStripScreenCoords(10);
    if (card10Strip) {
      await browser.mouseMove(card10Strip.cx, card10Strip.cy);
      await sleep(500);
      const state10 = await getCardHoverState(10);
      console.log('Card 10 hover state:', state10);
      await browser.screenshot('D:/BoardGame/m172_05_15cards_hover.png');
    }

    // Screenshot 6: Deck hover (no fan)
    console.log('Screenshot 6: Deck hover (clean)');
    const deckCoords = await getDeckScreenCoords();
    if (deckCoords) {
      await browser.mouseMove(deckCoords.cx, deckCoords.cy);
      await sleep(500);
      const deckHoverState = await browser.evaluate(`
        (() => {
          const sm = window.__app._sceneManager;
          const deck = sm.getOriginalDeck();
          return {
            hovered: sm._interactionManager.getHoveredObject() === deck,
            hasHoverPreview: !!deck._hoverPreview,
            childCount: deck.children.length
          };
        })()
      `);
      console.log('Deck hover state:', deckHoverState);
      await browser.screenshot('D:/BoardGame/m172_06_deck_hover_clean.png');
    }

    // 5. Drag card from hand to table
    console.log('Playing card 0 from hand to table...');
    const cardToDrag = await getCardStripScreenCoords(0);
    if (cardToDrag) {
      await browser.mouseDrag(cardToDrag.cx, cardToDrag.cy, 800, 320, 15);
      await sleep(1200);
    }

    // Screenshot 7: Table card hovered
    console.log('Screenshot 7: Table card hovered');
    const tableCardCoords = await browser.evaluate(`
      (() => {
        const sm = window.__app._sceneManager;
        const cards = sm._scene.children.filter(c => c.constructor.name === 'CardObject3D' && !c.isInHand());
        const card = cards[0];
        if (!card) return null;

        const camera = sm._renderer.getCamera();
        const canvas = sm._renderer.getDomElement();
        const rect = canvas.getBoundingClientRect();
        const s = card.position.clone().project(camera);

        return {
          cardId: card.cardId,
          cx: Math.round(((s.x + 1) / 2) * rect.width + rect.left),
          cy: Math.round(((-s.y + 1) / 2) * rect.height + rect.top)
        };
      })()
    `);
    console.log('Table card coords:', tableCardCoords);

    if (tableCardCoords) {
      await browser.mouseMove(tableCardCoords.cx, tableCardCoords.cy);
      await sleep(500);
      const hoveredObj = await browser.evaluate(`
        (() => {
          const sm = window.__app._sceneManager;
          const h = sm._interactionManager.getHoveredObject();
          return h ? h.cardId || h.name : null;
        })()
      `);
      console.log('Hovered object on table:', hoveredObj);
      await browser.screenshot('D:/BoardGame/m172_07_table_card_hover.png');

      // Screenshot 8: Drag table card
      console.log('Screenshot 8: Drag table card');
      await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tableCardCoords.cx, y: tableCardCoords.cy, button: 'left', clickCount: 1 });
      await sleep(100);
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tableCardCoords.cx + 120, y: tableCardCoords.cy - 60, button: 'left' });
      await sleep(300);
      await browser.screenshot('D:/BoardGame/m172_08_table_card_dragged.png');
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tableCardCoords.cx + 120, y: tableCardCoords.cy - 60, button: 'left', clickCount: 1 });
      await sleep(500);
    }

    console.log('--- All 8 screenshots captured successfully! ---');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Error during visual verification:', err);
  process.exit(1);
});
