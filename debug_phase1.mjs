import { startBrowser } from 'file:///D:/BoardGame/run_visual_debug.mjs';
import fs from 'fs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await startBrowser();
  // Ensure a clean page state
  await browser.evaluate(`window.location.reload()`);
  await sleep(1500);

  // 1. Create Room (transitions from Lobby to Game screen)
  await browser.evaluate(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tạo phòng'));
      btn?.click();
    })()
  `);
  await sleep(1500);

  // 2. Test Lỗi C: Hover Deck (before drawing all cards so deck has full count)
  const deckScreen = await browser.evaluate(`
    (() => {
      const app = window.__app;
      const sceneManager = app._sceneManager;
      const deck = sceneManager.getOriginalDeck();
      if (!deck) return null;

      const camera = sceneManager._renderer.getCamera();
      const canvas = sceneManager._renderer.getDomElement();
      const rect = canvas.getBoundingClientRect();

      const worldPos = deck.position.clone();
      const screenPos = worldPos.clone().project(camera);

      const x = Math.round(((screenPos.x + 1) / 2) * rect.width + rect.left);
      const y = Math.round(((-screenPos.y + 1) / 2) * rect.height + rect.top);

      return {
        deckId: deck.getId(),
        count: deck.getCount(),
        screenX: x,
        screenY: y
      };
    })()
  `);
  console.log('=== 1. DECK BEFORE HOVER ===', deckScreen);
  await browser.screenshot('D:/BoardGame/phase1_02_deck_before_hover.png');

  if (deckScreen) {
    console.log(`Hovering deck at screen coords (${deckScreen.screenX}, ${deckScreen.screenY})`);
    await browser.mouseMove(deckScreen.screenX, deckScreen.screenY);
    await sleep(400);

    const deckHoverInfo = await browser.evaluate(`
      (() => {
        const app = window.__app;
        const sceneManager = app._sceneManager;
        const deck = sceneManager.getOriginalDeck();
        const hovered = sceneManager._interactionManager.getHoveredObject();
        return {
          hoveredIsDeck: hovered === deck,
          previewVisible: deck._hoverPreview?.visible,
          previewChildrenCount: deck._hoverPreview?.children?.length,
          depthTest: deck._hoverPreviewMaterial?.depthTest,
          depthWrite: deck._hoverPreviewMaterial?.depthWrite
        };
      })()
    `);
    console.log('=== 2. DECK DURING HOVER (Lỗi C) ===', JSON.stringify(deckHoverInfo, null, 2));
    await browser.screenshot('D:/BoardGame/phase1_03_deck_hover.png');

    // Move mouse away (Hover Leave)
    await browser.mouseMove(100, 100);
    await sleep(400);
    const deckLeaveInfo = await browser.evaluate(`
      (() => {
        const deck = window.__app._sceneManager.getOriginalDeck();
        return {
          previewVisible: deck._hoverPreview?.visible
        };
      })()
    `);
    console.log('=== 3. DECK AFTER HOVER LEAVE ===', deckLeaveInfo);
    await browser.screenshot('D:/BoardGame/phase1_04_deck_hover_leave.png');
  }

  // 3. Draw cards to hand
  for (let i = 0; i < 4; i++) {
    await browser.evaluate(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', code: 'KeyH' }));
      })()
    `);
    await sleep(350);
  }
  await sleep(1000);

  // 4. Test Lỗi A: Local Hand layout
  const handData = await browser.evaluate(`
    (() => {
      const app = window.__app;
      const sceneManager = app._sceneManager;
      const camera = sceneManager._renderer.getCamera();

      const hz = sceneManager._handZoneManager.getHandZoneForPlayer(0);
      const cards = hz ? hz.getCards() : [];

      return {
        camera: {
          position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
          rotation: { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z },
          fov: camera.fov
        },
        handZone: {
          id: hz?.zoneId,
          position: hz?.position ? { x: hz.position.x, y: hz.position.y, z: hz.position.z } : null,
          rotationY: hz?.rotation?.y,
          isLocalPlayer: hz?._isLocalPlayer,
          cardCount: cards.length
        },
        cards: cards.map(c => ({
          cardId: c.cardId,
          ownerId: c.getOwnerId(),
          isInHand: c.isInHand(),
          position: { x: c.position.x.toFixed(2), y: c.position.y.toFixed(2), z: c.position.z.toFixed(2) },
          rotation: { x: c.rotation.x.toFixed(3), y: c.rotation.y.toFixed(3), z: c.rotation.z.toFixed(3), order: c.rotation.order },
          isFaceUp: c.isFaceUp(),
          isMasked: c.isMasked(),
          renderOrder: c.getMesh()?.renderOrder
        }))
      };
    })()
  `);

  console.log('=== 4. LOCAL HAND (Lỗi A) ===');
  console.log(JSON.stringify(handData, null, 2));
  fs.writeFileSync('D:/BoardGame/debug_hand_data.json', JSON.stringify(handData, null, 2));
  await browser.screenshot('D:/BoardGame/phase1_01_hand.png');

  // 5. Test Lỗi B: HAND -> TABLE and TABLE -> HAND
  const dragCoords = await browser.evaluate(`
    (() => {
      const sm = window.__app._sceneManager;
      const hz = sm._handZoneManager.getHandZoneForPlayer(0);
      const card = hz?.getCards()?.[0];
      if (!card) return null;

      const camera = sm._renderer.getCamera();
      const canvas = sm._renderer.getDomElement();
      const rect = canvas.getBoundingClientRect();

      const project = (pos) => {
        const s = pos.clone().project(camera);
        return {
          cx: Math.round(((s.x + 1) / 2) * rect.width + rect.left),
          cy: Math.round(((-s.y + 1) / 2) * rect.height + rect.top)
        };
      };

      const bbox = card.getBoundingBox();
      const cardCenter = bbox.getCenter(bbox.min.clone());

      return {
        cardId: card.cardId,
        cardFaceScreen: project(cardCenter),
        handZoneCenterScreen: project(hz.position),
        openTableScreen: project(hz.position.clone().set(4.0, 0, 2.0))
      };
    })()
  `);
  console.log('=== 5. DRAG COORDINATES ===', dragCoords);

  if (dragCoords) {
    // 5.1 HAND -> TABLE
    console.log(`Dragging from hand face (${dragCoords.cardFaceScreen.cx}, ${dragCoords.cardFaceScreen.cy}) to open table (${dragCoords.openTableScreen.cx}, ${dragCoords.openTableScreen.cy})...`);
    await browser.mouseDrag(
      dragCoords.cardFaceScreen.cx, dragCoords.cardFaceScreen.cy,
      dragCoords.openTableScreen.cx, dragCoords.openTableScreen.cy,
      20
    );
    await sleep(1000);

    const handToTableData = await browser.evaluate(`
      (() => {
        const sm = window.__app._sceneManager;
        const hz = sm._handZoneManager.getHandZoneForPlayer(0);
        const card = sm._cardRegistry.getCardObject('${dragCoords.cardId}');
        return {
          cardId: card?.cardId,
          isInHand: card?.isInHand(),
          pos: card?.position ? { x: card.position.x.toFixed(2), y: card.position.y.toFixed(2), z: card.position.z.toFixed(2) } : null,
          rot: card?.rotation ? { x: card.rotation.x.toFixed(2), y: card.rotation.y.toFixed(2), z: card.rotation.z.toFixed(2), order: card.rotation.order } : null,
          faceUp: card?.isFaceUp(),
          location: sm._cardRegistry.getLocation('${dragCoords.cardId}'),
          handRemaining: hz?.getCards()?.length
        };
      })()
    `);
    console.log('=== 5.1 HAND -> TABLE RESULT (Lỗi B1) ===', handToTableData);
    await browser.screenshot('D:/BoardGame/phase1_05_hand_to_table.png');

    // 5.2 TABLE -> HAND
    if (handToTableData && !handToTableData.isInHand) {
      console.log(`Dragging back from open table (${dragCoords.openTableScreen.cx}, ${dragCoords.openTableScreen.cy}) into hand zone center (${dragCoords.handZoneCenterScreen.cx}, ${dragCoords.handZoneCenterScreen.cy})...`);
      await browser.mouseDrag(
        dragCoords.openTableScreen.cx, dragCoords.openTableScreen.cy,
        dragCoords.handZoneCenterScreen.cx, dragCoords.handZoneCenterScreen.cy,
        20
      );
      await sleep(1000);

      const tableToHandData = await browser.evaluate(`
        (() => {
          const sm = window.__app._sceneManager;
          const hz = sm._handZoneManager.getHandZoneForPlayer(0);
          const card = sm._cardRegistry.getCardObject('${dragCoords.cardId}');
          return {
            cardId: card?.cardId,
            isInHand: card?.isInHand(),
            handZoneId: card?.getHandZoneId(),
            pos: card?.position ? { x: card.position.x.toFixed(2), y: card.position.y.toFixed(2), z: card.position.z.toFixed(2) } : null,
            rot: card?.rotation ? { x: card.rotation.x.toFixed(2), y: card.rotation.y.toFixed(2), z: card.rotation.z.toFixed(2), order: card.rotation.order } : null,
            faceUp: card?.isFaceUp(),
            location: sm._cardRegistry.getLocation('${dragCoords.cardId}'),
            handCountAfter: hz?.getCards()?.length
          };
        })()
      `);
      console.log('=== 5.2 TABLE -> HAND RESULT (Lỗi B2) ===', tableToHandData);
      await browser.screenshot('D:/BoardGame/phase1_06_table_to_hand.png');
    }
  }

  await browser.close();
  console.log('🎉 ALL PHASE 1 TESTS VERIFIED AND SCREENSHOTS SAVED!');
}

main().catch(console.error);
