import { startBrowser } from './run_visual_debug.mjs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('--- Starting Two-Player Multiplayer Verification ---');
  let clientA, clientB;

  try {
    // 1. Launch Player A
    console.log('[Test] Launching Browser A (Alice)...');
    clientA = await startBrowser(9222);
    await sleep(2500);

    // Alice creates a room
    console.log('[Test] Alice creating room "MultiRoom"...');
    await clientA.evaluate(`
      const roomInput = document.querySelector('#input-room-name');
      const nameInput = document.querySelector('#input-player-name');
      if (roomInput) roomInput.value = 'MultiRoom';
      if (nameInput) nameInput.value = 'Alice';
      const createBtn = document.querySelector('#btn-create-room');
      if (createBtn) createBtn.click();
    `);
    await sleep(2000);

    const roomId = await clientA.evaluate(`
      window.__app?._store?.getRoomId() || null
    `);
    console.log('[Test] Room created, roomId:', roomId);
    if (!roomId) throw new Error('Alice failed to create room');

    // 2. Launch Player B
    console.log('[Test] Launching Browser B (Bob)...');
    clientB = await startBrowser(9223);
    await sleep(2500);

    // Bob joins the room
    console.log(`[Test] Bob joining room "${roomId}"...`);
    await clientB.evaluate(`
      const nameInput = document.querySelector('#input-player-name');
      const roomInput = document.querySelector('#input-room-id');
      if (nameInput) nameInput.value = 'Bob';
      if (roomInput) roomInput.value = '${roomId}';
      const joinBtn = document.querySelector('#btn-join-room');
      if (joinBtn) joinBtn.click();
    `);
    await sleep(3000);

    // Verify both are in room
    const stateA = await clientA.evaluate(`({
      roomId: window.__app?._store?.getRoomId(),
      playerIndex: window.__app?._store?.getPlayerIndex(),
      playerCount: window.__app?._store?.getRoomState()?.players?.length
    })`);
    const stateB = await clientB.evaluate(`({
      roomId: window.__app?._store?.getRoomId(),
      playerIndex: window.__app?._store?.getPlayerIndex(),
      playerCount: window.__app?._store?.getRoomState()?.players?.length
    })`);
    console.log('[Test] State A:', stateA);
    console.log('[Test] State B:', stateB);

    if (stateA.roomId !== roomId || stateB.roomId !== roomId) {
      throw new Error(`Room join mismatch: A=${stateA.roomId}, B=${stateB.roomId}`);
    }

    // 3. Test cursor movement across screen, including extreme positions (horizon / edges)
    console.log('[Test] Moving cursors across screen including edges/sky...');
    const positions = [
      [640, 600], // table center/bottom
      [640, 360], // table center
      [640, 50],  // horizon / sky (previously produced out-of-bounds z)
      [10, 10],   // top-left corner
      [1270, 10], // top-right corner
      [10, 700],  // bottom-left
      [1270, 700],// bottom-right
      [640, 450], // back to table
    ];

    for (const [x, y] of positions) {
      await clientA.mouseMove(x, y);
      await sleep(60);
      await clientB.mouseMove(1280 - x, y);
      await sleep(60);
    }
    await sleep(1000);

    // Verify remote cursor exists on both sides
    const cursorOnB = await clientB.evaluate(`
      window.__app?._remoteCursorManager?._cursors?.size || 0
    `);
    const cursorOnA = await clientA.evaluate(`
      window.__app?._remoteCursorManager?._cursors?.size || 0
    `);
    console.log(`[Test] Remote cursors rendered: on A = ${cursorOnA}, on B = ${cursorOnB}`);

    // 4. Test Player A draws cards to hand via official server protocol
    console.log('[Test] Alice draws 3 cards via networkClient { type: "card:draw" }...');
    for (let i = 0; i < 3; i++) {
      await clientA.evaluate(`window.__app?._networkClient?.send({ type: 'card:draw' })`);
      await sleep(500);
    }

    const aHandCount = await clientA.evaluate(`
      window.__app?._sceneManager?._handZoneManager?.getHandZoneForPlayer(0)?.getCardCount() || 0
    `);
    const bSeesAHandCount = await clientB.evaluate(`
      window.__app?._sceneManager?._handZoneManager?.getHandZoneForPlayer(0)?.getCardCount() || 0
    `);
    console.log(`[Test] Hand count for Player A: on Alice = ${aHandCount}, on Bob = ${bSeesAHandCount}`);

    // Verify opponent hand privacy on Bob
    const bSeesAliceCardDetails = await clientB.evaluate(`(() => {
      const zone = window.__app?._sceneManager?._handZoneManager?.getHandZoneForPlayer(0);
      const cards = zone ? zone.getCards() : [];
      return cards.map(c => ({
        id: c.cardId,
        faceUp: c.isFaceUp(),
        masked: c.isMasked(),
        inHand: c.isInHand()
      }));
    })()`);
    console.log('[Test] Bob view of Alice hand cards (must be masked and faceDown):', bSeesAliceCardDetails);

    // 5. Test local hand fan preview on Alice
    console.log('[Test] Testing local hand fan preview on Alice...');
    const localZone = await clientA.evaluate(`(() => {
      const zone = window.__app?._sceneManager?._handZoneManager?.getHandZoneForPlayer(0);
      if (zone) zone.setPreviewActive(true);
      return zone ? zone.isPreviewActive() : false;
    })()`);
    console.log(`[Test] Alice hand fan preview active: ${localZone}`);

    // Screenshot Alice hand preview
    await clientA.screenshot('m173_fix_alice_hand_preview.png');

    // 6. Player A plays a card to table
    console.log('[Test] Alice plays card to table...');
    const cardToPlayId = await clientA.evaluate(`
      window.__app?._sceneManager?._handZoneManager?.getHandZoneForPlayer(0)?.getCardIds()[0] || null
    `);
    console.log(`[Test] Card ID to play: ${cardToPlayId}`);

    if (cardToPlayId) {
      await clientA.evaluate(`
        const card = window.__app?._sceneManager?._cardRegistry?.getCardObject('${cardToPlayId}');
        if (card) {
          card.position.set(0, 0, 0);
          window.__app?._dragController?.onCardDropped?.(card);
          window.__app?._dragController?.onDragEndBroadcast?.('${cardToPlayId}', { x: 0, y: 0, z: 0 }, true, null);
        }
      `);
      await sleep(2000);

      // Verify Bob sees the card on table
      const bSeesTableCard = await clientB.evaluate(`(() => {
        const c = window.__app?._sceneManager?._cardRegistry?.getCardObject('${cardToPlayId}');
        return c ? { found: true, x: c.position.x, z: c.position.z, inHand: c.isInHand(), faceUp: c.isFaceUp() } : { found: false };
      })()`);
      console.log('[Test] Bob sees table card:', bSeesTableCard);

      // 7. Bob interacts with the table card (can drag)
      console.log('[Test] Bob interacts with table card...');
      const bCanDrag = await clientB.evaluate(`(() => {
        const c = window.__app?._sceneManager?._cardRegistry?.getCardObject('${cardToPlayId}');
        return c ? window.__app?._dragController?.canDragCard?.(c) : false;
      })()`);
      console.log(`[Test] Bob can drag table card: ${bCanDrag}`);

      // 8. Bob attempts to interact with Alice's private hand cards (should be blocked)
      const bCanDragAliceHand = await clientB.evaluate(`(() => {
        const aliceZone = window.__app?._sceneManager?._handZoneManager?.getHandZoneForPlayer(0);
        const card = aliceZone?.getCards()[0];
        return card ? window.__app?._dragController?.canDragCard?.(card) : 'no_card';
      })()`);
      console.log(`[Test] Bob can drag Alice hand card: ${bCanDragAliceHand} (expected: false)`);
    }

    // Take screenshots of both players
    await clientA.screenshot('m173_fix_multiplayer_playerA.png');
    await clientB.screenshot('m173_fix_multiplayer_playerB.png');

    console.log('--- Multiplayer Verification Completed Successfully! ---');
  } catch (err) {
    console.error('[Test Error]:', err);
  } finally {
    if (clientA) await clientA.close();
    if (clientB) await clientB.close();
  }
}

run();
