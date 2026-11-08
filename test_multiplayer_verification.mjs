import assert from 'node:assert/strict';
import { startBrowser } from './run_visual_debug.mjs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(client, expression, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await client.evaluate(expression)) return;
    await sleep(50);
  } while (Date.now() < deadline);
  assert.fail('Hết thời gian chờ: ' + expression);
}

async function clickDeck(client) {
  const point = await client.evaluate(`(() => {
    const scene = window.__app._sceneManager;
    const deck = scene.getOriginalDeck();
    const position = deck.position.clone();
    deck.getWorldPosition(position);
    position.y += deck.getVisualHeight() / 2;
    position.project(scene.getCameraController().getCamera());
    const rect = scene._renderer.getDomElement().getBoundingClientRect();
    return { x: rect.left + (position.x + 1) * rect.width / 2, y: rect.top + (1 - position.y) * rect.height / 2 };
  })()`);

  await client.mouseMove(point.x, point.y);
  await waitFor(client, "(() => { const scene = window.__app._sceneManager; return scene.getInteractionManager().getHoveredObject() === scene.getOriginalDeck(); })()");
  await client.mouseClick(point.x, point.y);
}



async function rightClickTable(client, point) {
  await client.evaluate("window.__app._sceneManager._renderer.getDomElement().dispatchEvent(new MouseEvent('contextmenu', { bubbles:true, cancelable:true, button:2, clientX:" + point.x + ", clientY:" + point.y + " }))");
}

function projectWorld(client, worldExpression) {
  return client.evaluate(`(() => {
    const scene = window.__app._sceneManager;
    const point = (${worldExpression}).clone().project(scene.getCameraController().getCamera());
    const rect = scene._renderer.getDomElement().getBoundingClientRect();
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  })()`);
}

async function run() {
  console.log('--- Starting Two-Player Multiplayer Verification ---');
  let clientA, clientB, clientC;

  try {
    // 1. Launch Player A
    console.log('[Test] Launching Browser A (Alice)...');
    clientA = await startBrowser(9222);
    await waitFor(clientA, 'window.__app?._networkClient?.getStatus() === "connected"', 15000);

    // Alice creates a room
    console.log('[Test] Alice creating room "MultiRoom"...');
    await clientA.evaluate(`
      const roomInput = document.querySelector('#input-room-name');
      const nameInput = document.querySelector('#input-player-name');
      if (roomInput) roomInput.value = 'MultiRoom';
      if (nameInput) nameInput.value = 'Alice';
      document.querySelector('#input-double-deck').checked = true;
      const createBtn = document.querySelector('#btn-create-room');
      if (createBtn) createBtn.click();
    `);
    await waitFor(clientA, 'Boolean(window.__app?._store?.getRoomId())', 10000);

    const roomId = await clientA.evaluate(`
      window.__app?._store?.getRoomId() || null
    `);
    console.log('[Test] Room created, roomId:', roomId);
    if (!roomId) throw new Error('Alice failed to create room');

    // 2. Launch Player B
    console.log('[Test] Launching Browser B (Bob)...');
    clientB = await startBrowser(9223);
    await waitFor(clientB, 'window.__app?._networkClient?.getStatus() === "connected"', 15000);

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
    await waitFor(clientB, 'Boolean(window.__app?._store?.getRoomId())', 10000);
    await waitFor(clientA, 'window.__app?._store?.getRoomState()?.players?.length === 2', 10000);

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

    assert.equal(await clientA.evaluate("window.__app._store.getRoomState().round.totalCards"), 102);
    assert.equal(await clientA.evaluate("window.__app._sceneManager.getOriginalDeck().visible"), false);
    assert.equal(await clientB.evaluate("window.__app._sceneManager.tableActions.visible"), false);
    assert.equal(await clientB.evaluate("document.querySelector('#setup-defuses').disabled"), true);
    await clientA.evaluate("(() => { const input = document.querySelector('#setup-defuses'); input.value = '7'; input.dispatchEvent(new Event('change')); })()");
    await waitFor(clientB, "document.querySelector('#setup-defuses').value === '7'");


    const zombie = "document.querySelector('[data-pack-id=zombie]')";
    const base = "document.querySelector('[data-pack-id=base]')";
    await clientA.evaluate(zombie + ".querySelector('input[type=radio]').click()");
    await waitFor(clientB, 'window.__app._store.getRoomState().round.basePackId === "zombie"');
    assert.equal(await clientB.evaluate(zombie + ".querySelector('input[type=radio]').disabled"), true);
    assert.equal(await clientA.evaluate(zombie + ".querySelectorAll('input[type=number]').length"), 2);
    assert.equal(await clientA.evaluate(zombie + ".querySelector('summary span').textContent"), '113 lá');
    await clientA.evaluate("(() => { const input = document.querySelector('#setup-zombie-zombie-kitten'); input.value = '8'; input.dispatchEvent(new Event('change')); })()");
    await waitFor(clientB, 'window.__app._store.getRoomState().round.rescueCount === 8');
    await clientA.evaluate(base + ".querySelector('input[type=radio]').click()");
    await waitFor(clientB, 'window.__app._store.getRoomState().round.basePackId === "base"');
    assert.equal(await clientA.evaluate("document.querySelector('#setup-defuses').value"), '7');
    await clientA.evaluate(zombie + ".querySelector('input[type=radio]').click()");
    await waitFor(clientB, 'window.__app._store.getRoomState().round.rescueCount === 8');
    await clientA.evaluate(zombie + ".querySelector('details > div > button').click()");
    await waitFor(clientB, 'window.__app._store.getRoomState().round.rescueCount === 5');
    await clientA.evaluate(base + ".querySelector('input[type=radio]').click()");
    await waitFor(clientB, 'window.__app._store.getRoomState().round.basePackId === "base"');
    const streaking = "document.querySelector('[data-pack-id=streaking]')";
    await clientA.evaluate(streaking + ".querySelector('input[type=checkbox]').click()");
    await waitFor(clientB, 'window.__app._store.getRoomState().round.totalCards === 118');
    assert.equal(await clientB.evaluate(streaking + ".querySelector('input[type=checkbox]').disabled"), true);
    await clientA.evaluate(streaking + ".querySelector('summary').click()");
    await clientA.evaluate("(() => { const input = document.querySelector('#setup-streaking-mark'); input.value = '0'; input.dispatchEvent(new Event('change')); })()");
    await waitFor(clientB, 'window.__app._store.getRoomState().round.totalCards === 115');
    await clientA.evaluate(streaking + ".querySelector('input[type=checkbox]').click()");
    await waitFor(clientB, 'window.__app._store.getRoomState().round.totalCards === 103');
    await clientA.evaluate(streaking + ".querySelector('input[type=checkbox]').click()");
    await waitFor(clientB, 'window.__app._store.getRoomState().round.totalCards === 115');
    await clientA.evaluate(streaking + ".querySelector('details > div > button').click()");
    await waitFor(clientB, 'window.__app._store.getRoomState().round.totalCards === 118');
    await clientA.evaluate(streaking + ".querySelector('input[type=checkbox]').click()");
    await waitFor(clientB, 'window.__app._store.getRoomState().round.totalCards === 103');
    await clientA.evaluate("document.querySelector('#btn-round-deal').click()");
    for (const client of [clientA, clientB]) {
      await waitFor(client, "window.__app._sceneManager.getOriginalDeck().getCount() === 91");
      const own = await client.evaluate("window.__app._store.getRoomState().objects");
      assert.equal(own.length, 6);
      assert.equal(own.filter(card => card.cardType === 'defuse').length, 1);
      assert.ok(own.every(card => card.location === 'HAND' && card.cardType));
      assert.equal(await client.evaluate("document.querySelector('#round-setup').hidden"), true);
    }

    await waitFor(clientA, 'window.__app._sceneManager._transferAnimator.getActiveCount() === 0');
    const canvasBounds = await clientA.evaluate("window.__app._sceneManager.getInputCanvas().getBoundingClientRect().toJSON()");
    const startX = canvasBounds.left + 3;
    const startY = canvasBounds.top + 3;
    assert.equal(await clientA.evaluate("document.elementFromPoint(" + startX + "," + startY + ") === window.__app._sceneManager.getInputCanvas()"), true);
    await clientA.mouseDrag(startX, startY, canvasBounds.right - 3, canvasBounds.bottom - 3, 18);
    const selection = await clientA.evaluate(`(() => {
      const app = window.__app;
      const cards = app._sceneManager.getInteractionManager().getSelectedCards();
      return { total: cards.length, anonymous: cards.filter(card => card.isMasked()).length,
        fanOpen: app._fullHandFanPreviewUI.isOpen() };
    })()`);
    assert.deepEqual(selection, { total: 12, anonymous: 6, fanOpen: false });
    await clientA.mouseClick(startX, startY);

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
    async function verifySeatMarkers(client, otherName) {
      return client.evaluate(`(() => {
        const app = window.__app;
        const areas = app._sceneManager.getPlayerAreaManager().getAllAreas();
        const other = app._store.getRoomState().players.find(p => p.name === ${JSON.stringify(otherName)});
        const cursor = app._sceneManager.getScene().getObjectByName('RemoteCursor_' + other.id);
        return {
          matches: cursor?.children[0].material.color.getHex() === areas[other.playerIndex]._seatColor,
          names: areas.filter(area => area._labelSprite?.visible && area._labelSprite.isSprite).map(area => area.getLabel()).sort(),
        };
      })()`);
    }
    for (const [client, other] of [[clientA, 'Bob'], [clientB, 'Alice']]) {
      assert.deepEqual(await verifySeatMarkers(client, other), { matches: true, names: ['Alice', 'Bob'] });
    }

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

    assert.equal(aHandCount, 9);
    assert.equal(bSeesAHandCount, 9);
    assert.ok(bSeesAliceCardDetails.every(card => card.masked && card.inHand && !card.faceUp && card.id.startsWith('anonymous-hand:')));
    for (const client of [clientA, clientB]) {
      assert.equal(await client.evaluate(`window.__app._sceneManager.getOriginalDeck().getCount()`), 88);
      assert.equal(await client.evaluate(`Boolean(window.__app._sceneManager.getObject('demo_card'))`), false);
    }

    // Rê lên tay bài thật và kiểm tra fan hiện tại.
    const handPoint = await clientA.evaluate(`(() => {
      const scene = window.__app._sceneManager;
      const point = scene.getLocalHandZone().position.clone().project(scene.getCameraController().getCamera());
      const rect = scene._renderer.getDomElement().getBoundingClientRect();
      return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
    })()`);
    await clientA.mouseMove(handPoint.x, handPoint.y);
    await sleep(300);
    assert.equal(await clientA.evaluate(`window.__app._fullHandFanPreviewUI.isOpen()`), true);
    await clientA.screenshot('m173_fix_alice_hand_preview.png');

    const cardId = await clientA.evaluate(`window.__app._sceneManager.getLocalHandCards()[0].cardId`);
    const play = { type: 'card:play-to-table', payload: { cardId, position: { x: 2, y: 0, z: -2 }, faceUp: true } };
    await clientA.evaluate('window.__app._networkClient.send(' + JSON.stringify(play) + ')');
    await sleep(600);
    assert.equal(await clientB.evaluate(`(() => {
      const scene = window.__app._sceneManager;
      const card = scene.getObject(${JSON.stringify(cardId)});
      return !!card && !card.isInHand() && scene.getDragController().canDragCard(card);
    })()`), true);

    // Take screenshots of both players
    await clientA.screenshot('m173_fix_multiplayer_playerA.png');
    await clientB.screenshot('m173_fix_multiplayer_playerB.png');

    // Kiểm tra nút HUD và hit-test 3D thật ở hai góc ghế.
    await clientA.evaluate(`document.querySelector('#btn-insert-bottom').click()`);
    const bottomActive = `document.querySelector('#btn-insert-bottom').getAttribute('aria-pressed') === 'true'`;
    await Promise.all([waitFor(clientA, bottomActive), waitFor(clientB, bottomActive)]);

    await clientA.evaluate(`(() => {
      document.querySelector('#btn-insert-custom').click();
      const input = document.querySelector('#hud-deck-position');
      input.value = '2';
      input.dispatchEvent(new Event('change'));
    })()`);
    await waitFor(clientA, `document.querySelector('#btn-insert-custom').getAttribute('aria-pressed') === 'true'`);
    assert.equal(await clientB.evaluate(bottomActive), true);

    await clickDeck(clientA);
    await waitFor(clientB, 'window.__app._sceneManager.getOriginalDeck().getCount() === 87');
    await clickDeck(clientB);

    for (const client of [clientA, clientB]) {
      await waitFor(client, 'window.__app._sceneManager.getOriginalDeck().getCount() === 86');
      const taken = await client.evaluate("window.__app._store.getRoomState().objects.filter(card => card.takenFromDeck && !card.faceUp)");
      assert.equal(taken.length, 2);
      assert.ok(taken.every(card => !card.faceUp && !card.cardType));
    }

    // Kéo lá vừa lấy vào tay Bob, rồi kéo đúng lá đó từ fan ra bàn.
    const transferredId = await clientA.evaluate("window.__app._store.getRoomState().objects.find(card => card.takenFromDeck).id");
    const idExpression = JSON.stringify(transferredId);
    const sceneCard = 'window.__app._sceneManager.getObject(' + idExpression + ')';
    await waitFor(clientA, 'window.__app._sceneManager._transferAnimator.getActiveCount() === 0');
    const start = await projectWorld(clientA, 'scene.getObject(' + idExpression + ').position');
    const targetHand = 'scene._handZoneManager.getHandZoneForPlayer(1).position';
    const target = await projectWorld(clientA, targetHand);
    await clientA.mouseMove(start.x, start.y);
    await clientA.mouseDrag(start.x, start.y, target.x, target.y, 20);
    await waitFor(clientB, sceneCard + '?.isInHand() && ' + sceneCard + '.visible');

    assert.ok(await clientB.evaluate(sceneCard + '.getCardType()'));
    await waitFor(clientB, 'window.__app._sceneManager.getDragController().canDragCard(' + sceneCard + ')');
    await waitFor(clientA, 'window.__app._sceneManager._handZoneManager.getHandZoneForPlayer(1).getCardCount() === 7');
    await waitFor(clientA, '!' + sceneCard);
    const bobHand = await projectWorld(clientB, targetHand);
    await clientB.mouseMove(bobHand.x, bobHand.y);
    const fan = 'document.querySelector(' + JSON.stringify('[data-fan-card-id="' + transferredId + '"]') + ')';
    await waitFor(clientB, fan);


    const tabletop = await projectWorld(clientB, 'scene.getOriginalDeck().position.clone().set(-4, 0, -5)');
    const fanTop = await clientB.evaluate("document.querySelector('.fhfp-root').getBoundingClientRect().top");
    assert.ok(tabletop.y < fanTop, 'Điểm thả phải nằm ngoài vùng fan');
    // Gửi vào đúng lá DOM để hiệu ứng nâng khi hover không đổi điểm nhấn của bài kiểm thử.
    const dragId = await clientB.evaluate(`(() => {
      const element = ${fan};
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, button: 0, buttons: 1, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
      }));
      window.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, buttons: 1, clientX: ${tabletop.x}, clientY: ${tabletop.y},
      }));
      return window.__app._sceneManager.getDragController().getDraggedCard()?.cardId;
    })()`);
    assert.equal(dragId, transferredId);
    await clientB.evaluate(`window.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true, button: 0, clientX: ${tabletop.x}, clientY: ${tabletop.y},
    }))`);

    await waitFor(clientB, "window.__app._store.getRoomState().objects.some(card => card.id === " + idExpression + " && card.location === 'TABLE')");
    for (const client of [clientA, clientB]) {
      await waitFor(client, sceneCard + '?.visible && !' + sceneCard + '.isInHand()');
    }

    await clientA.evaluate(`document.querySelector('#btn-insert-top').click()`);
    await waitFor(clientB, `document.querySelector('#btn-insert-top').getAttribute('aria-pressed') === 'true'`);
    await clickDeck(clientA);
    for (const client of [clientA, clientB]) {
      await waitFor(client, 'window.__app._sceneManager.getOriginalDeck().getCount() === 85');
    }

    const bobId = await clientB.evaluate('window.__app._store.getPlayerId()');
    const bobIsConnected = 'window.__app._store.getRoomState().players.find(player => player.id === ' + JSON.stringify(bobId) + ')?.isConnected';
    await clientB.evaluate('window.__app._networkClient._ws.close()');
    await waitFor(clientA, '!(' + bobIsConnected + ')');
    await clientA.evaluate("document.querySelector('#btn-insert-bottom').click()");

    await waitFor(clientA, bottomActive);
    await waitFor(clientA, 'window.__app._sceneManager._transferAnimator.getActiveCount() === 0');
    await clickDeck(clientA);
    await waitFor(clientA, 'window.__app._sceneManager.getOriginalDeck().getCount() === 84');
    await waitFor(clientB, bottomActive + ' && window.__app._sceneManager.getOriginalDeck().getCount() === 84', 10000);
    assert.equal(await clientB.evaluate('window.__app._store.getPlayerId()'), bobId);


    await clientA.evaluate("(() => { const input = document.querySelector('#hud-affected-count'); input.value = '5'; input.dispatchEvent(new Event('change')); })()");
    await waitFor(clientB, "document.querySelector('#hud-affected-count').value === '5'");
    await clientA.evaluate("document.querySelector('#btn-insert-top').click()");
    await waitFor(clientB, "window.__app._store.getRoomState().deckDrawEnd === 'TOP'");
    await clientA.evaluate("window.__app._networkClient.send({ type:'object:flip', payload:{ objectId:" + idExpression + " } })");
    await waitFor(clientA, sceneCard + '?.isFaceUp()');
    const publicType = await clientA.evaluate(sceneCard + '.getCardType()');
    assert.ok(publicType);
    const from = await projectWorld(clientA, 'scene.getObject(' + idExpression + ').position');
    const to = await projectWorld(clientA, 'scene.getOriginalDeck().position');
    await clientA.mouseMove(from.x, from.y);
    await clientA.mouseDrag(from.x, from.y, to.x, to.y, 18);
    for (const client of [clientA, clientB]) {
      await waitFor(client, "window.__app._store.getRoomState().deck.count === 85 && !" + sceneCard);
      assert.equal(await client.evaluate('window.__app._sceneManager.getOriginalDeck()._onlineTopType'), publicType);
    }
    const shuffle = await projectWorld(clientA, 'scene.tableActions.children[2].getWorldPosition(scene.getOriginalDeck().position.clone())');
    await clientA.mouseMove(shuffle.x, shuffle.y);
    await clientA.mouseClick(shuffle.x, shuffle.y);
    for (const client of [clientA, clientB]) {
      await waitFor(client, "document.querySelector('#hud-deck-status').textContent.includes('Alice')");
      assert.equal(await client.evaluate('window.__app._store.getRoomState().deck.count'), 85);
    }


    console.log('[Test] See và Alter trên mặt bàn, ba kết nối cùng phòng...');
    await clientA.evaluate("(() => { const input = document.querySelector('#hud-affected-count'); input.value = '3'; input.dispatchEvent(new Event('change')); })()");
    await waitFor(clientB, 'window.__app._store.getRoomState().deck.affectedCount === 3');
    const row = 'window.__app._sceneManager.deckViewRow';
    async function clickAction(index) {
      const point = await projectWorld(clientA, 'scene.tableActions.children[' + index + '].getWorldPosition(scene.getOriginalDeck().position.clone())');
      await clientA.mouseMove(point.x, point.y);
      await clientA.mouseClick(point.x, point.y);
    }
    await clickAction(1);
    await waitFor(clientA, row + '._state?.mode === "see" && ' + row + '._cards.size === 3');
    assert.equal(await clientA.evaluate("document.querySelector('#deck-alter-strip header strong').textContent"), 'Xem 3 lá trên cùng');
    assert.equal(await clientA.evaluate("document.querySelectorAll('#deck-alter-strip .fhfp-rules-description').length"), 3);
    clientC = await startBrowser(9224);
    await waitFor(clientC, 'window.__app?._networkClient?.getStatus() === "connected"');
    await clientC.evaluate("document.querySelector('#input-player-name').value = 'Carol'; document.querySelector('#input-room-id').value = " + JSON.stringify(roomId) + "; document.querySelector('#btn-join-room').click()");
    const deckViewClients = [clientA, clientB, clientC];
    for (const client of deckViewClients) {
      await waitFor(client, row + '._cards.size === 3');
      assert.ok(await client.evaluate("document.querySelector('#hud-deck-view-lock').textContent.includes('Alice')"));
      const hidden = await client.evaluate(row + '._state.cards.filter(card => !card.cardType).length');
      if (client === clientA) assert.equal(hidden, 0);
      else assert.ok(hidden >= 2);
    }



    await clientB.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key:'g' }))");
    await waitFor(clientB, "document.querySelector('#hud-game-error').textContent.includes('Alice đang xem bài')");
    const bobDeck = await projectWorld(clientB, 'scene.getOriginalDeck().position');
    await rightClickTable(clientB, bobDeck);
    await clientB.evaluate("Array.from(document.querySelectorAll('#tabletop-context-menu > div')).find(item => item.textContent === 'Xáo').click()");
    await waitFor(clientB, "document.querySelector('#hud-game-error').textContent.includes('Alice đang xem bài')");
    await clientB.evaluate("(() => { const input = document.querySelector('#hud-affected-count'); input.value = '1'; input.dispatchEvent(new Event('change')); })()");
    await waitFor(clientB, "document.querySelector('#hud-game-error').textContent.includes('Alice đang xem bài')");
    assert.equal(await clientB.evaluate("document.querySelector('#hud-affected-count').value"), '3');
    await clientA.evaluate("document.querySelector('#btn-deck-view-close').click()");
    for (const client of deckViewClients) await waitFor(client, '!' + row + '._state');
    await clickAction(3);
    await waitFor(clientA, row + '._state?.mode === "alter" && window.__app._sceneManager._transferAnimator.getActiveCount() === 0');
    const alterHud = "document.querySelector('#deck-alter-strip')";
    await waitFor(clientA, '!' + alterHud + '.hidden');
    for (const client of [clientB, clientC]) assert.equal(await client.evaluate(alterHud + '.hidden'), true);
    const [firstTile, lastTile] = await clientA.evaluate(`Array.from(${alterHud}.querySelectorAll('[data-alter-token]')).filter((_, i) => i !== 1).map(tile => {
      const bounds = tile.getBoundingClientRect();
      return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    })`);
    await clientA.mouseDrag(firstTile.x, firstTile.y, lastTile.x, lastTile.y, 15);
    for (const client of deckViewClients) await waitFor(client, row + '._state?.cards.map(card => card.token).join() === "1,2,0"');
    await clientA.evaluate("document.querySelector('.deck-view-reset').click()");
    for (const client of deckViewClients) {
      await waitFor(client, row + '._state?.cards.map(card => card.token).join() === "0,1,2"');
    }
    await clientA.mouseClick(firstTile.x, firstTile.y);
    await clientA.mouseClick(lastTile.x, lastTile.y);
    for (const client of deckViewClients) {
      await waitFor(client, row + '._state?.cards.map(card => card.token).join() === "2,1,0"');
    }
    await clientA.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter' }))");
    for (const client of deckViewClients) await waitFor(client, '!' + row + '._state');
    await clickAction(3);
    await waitFor(clientA, row + '._state?.mode === "alter"');
    await clientA.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape' }))");
    for (const client of deckViewClients) await waitFor(client, '!' + row + '._state');


    console.log('[Test] Bob kéo một lá úp trực tiếp từ tay Alice ra bàn...');
    const opponentCard = "scene._handZoneManager.getHandZoneForPlayer(0).getCards().at(-1)";
    const remoteStart = await projectWorld(clientB, opponentCard + '.position');
    const publicTarget = await projectWorld(clientB, 'scene.getOriginalDeck().position.clone().set(5, 0, 1)');
    const ownerCount = await clientA.evaluate("window.__app._store.getRoomState().handCounts[window.__app._store.getPlayerId()]");
    const publicBefore = await clientB.evaluate("window.__app._store.getRoomState().objects.filter(card => card.location === 'TABLE').map(card => card.id)");
    await clientB.mouseDrag(remoteStart.x, remoteStart.y, publicTarget.x, publicTarget.y, 18);
    await waitFor(clientA, "window.__app._store.getRoomState().handCounts[window.__app._store.getPlayerId()] === " + (ownerCount - 1));
    for (const client of [clientA, clientB, clientC]) {
      const tableCard = await client.evaluate("window.__app._store.getRoomState().objects.find(card => card.location === 'TABLE' && !" + JSON.stringify(publicBefore) + ".includes(card.id))");
      assert.equal(tableCard?.faceUp, false);
      assert.equal(tableCard?.cardType, undefined);
    }


    await clientB.evaluate("document.querySelector('#btn-shuffle-hand').click()");

    await waitFor(clientA, "document.querySelector('#hud-deck-status').textContent.includes('Bob vừa xáo tay')");
    await clientA.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key:'s' }))");
    await waitFor(clientB, "document.querySelector('#hud-deck-status').textContent.includes('Alice vừa xáo tay')");
    const beforeTake = await clientA.evaluate("window.__app._store.getRoomState().deckCount");
    const beforeTable = await clientA.evaluate("window.__app._store.getRoomState().objects.filter(card => card.location === 'TABLE').map(card => card.id)");
    for (let i = 1; i <= 2; i++) {
      await clickDeck(clientA);
      await waitFor(clientA, 'window.__app._store.getRoomState().deckCount === ' + (beforeTake - i));
    }
    await waitFor(clientA, 'window.__app._sceneManager._transferAnimator.getActiveCount() === 0');
    const picked = await clientA.evaluate("window.__app._store.getRoomState().objects.filter(card => card.location === 'TABLE' && !" + JSON.stringify(beforeTable) + ".includes(card.id)).map(card => card.id)");
    assert.equal(picked.length, 2);
    await clientA.evaluate("window.__app._networkClient.send({ type:'object:move', payload:{ objectId:" + JSON.stringify(picked[0]) + ", position:{ x:-6,y:0,z:-2 }, rotation:0 } })");
    await clientA.evaluate("(() => { const scene = window.__app._sceneManager; scene.getInteractionManager().selectObjects(" + JSON.stringify(picked) + ".map(id => scene.getObject(id))); document.querySelector('#btn-stack-cards').click(); })()");
    await waitFor(clientB, 'Boolean(window.__app._sceneManager.getStackManager().getStackForCard(' + JSON.stringify(picked[0]) + '))');
    const stackPoint = await projectWorld(clientA, 'scene.getObject(' + JSON.stringify(picked[1]) + ').position');
    await rightClickTable(clientA, stackPoint);
    await clientA.evaluate("Array.from(document.querySelectorAll('#tabletop-context-menu > div')).find(item => item.textContent === 'Xáo chồng').click()");
    await waitFor(clientC, "document.querySelector('#hud-deck-status').textContent.includes('Alice vừa xáo chồng bài')");

    await clientA.evaluate("document.querySelector('#btn-gather-bombs').click()");
    await waitFor(clientA, "document.querySelector('#hud-deck-status').textContent.includes('Alice vừa gom') || document.querySelector('#hud-deck-status').textContent.includes('không có bom')");
    const gatheredDeck = await clientA.evaluate("window.__app._store.getRoomState().deckCount");
    for (const client of deckViewClients) await waitFor(client, 'window.__app._store.getRoomState().deckCount === ' + gatheredDeck);

    await waitFor(clientA, 'window.__app._sceneManager._transferAnimator.getActiveCount() === 0');
    const seatHand = await clientA.evaluate("window.__app._store.getRoomState().objects.filter(card => card.location === 'HAND').map(card => [card.id, card.handIndex, card.faceUp])");
    async function clickSeat(client, index) {
      const point = await client.evaluate(`(() => {
        const scene = window.__app._sceneManager;
        const canvas = scene.getInputCanvas();
        const rect = canvas.getBoundingClientRect();
        const camera = scene.getCameraController().getCamera();
        const area = scene.getPlayerAreaManager().getAllAreas()[${index}];
        const pos = area.position.clone().project(camera);
        const center = { x: rect.left + (pos.x + 1) * rect.width / 2, y: rect.top + (1 - pos.y) * rect.height / 2 };
        for (let dy = -70; dy <= 70; dy += 5) {
          for (let dx = -130; dx <= 130; dx += 5) {
            const x = center.x + dx, y = center.y + dy;
            const event = new MouseEvent('mousemove', {clientX:x, clientY:y});
            if (document.elementFromPoint(x, y) === canvas && scene.getSeatAt(event) === ${index} &&
                !scene.getInteractionManager().getObjectAt(x, y) && !scene.tableActions.hitsAt(event)) return {x,y};
          }
        }
        return null;
      })()`);
      assert.ok(point, 'Có vùng bấm cho ghế ' + index);
      await client.mouseMove(point.x, point.y);
      // Fan chỉ nhả tương tác bàn sau khi trỏ đã rời tay và hết thời gian đóng.
      await waitFor(client, '!window.__app._fullHandFanPreviewUI.isOpen()');
      await client.mouseClick(point.x, point.y);
    }
    await clickSeat(clientA, 5);
    await waitFor(clientA, 'window.__app._store.getPlayerIndex() === 5');
    await sleep(600);
    await clickSeat(clientA, 1);
    await waitFor(clientB, "document.querySelector('#seat-prompts').textContent.includes('Alice muốn đổi chỗ')");
    await clientB.evaluate("Array.from(document.querySelectorAll('#seat-prompts button')).find(button => button.textContent === 'Đồng ý').click()");
    await waitFor(clientA, 'window.__app._store.getPlayerIndex() === 1');
    await waitFor(clientB, 'window.__app._store.getPlayerIndex() === 5');
    await waitFor(clientC, "document.querySelector('#hud-roll-notices').textContent.includes('Alice và Bob đã đổi chỗ')");
    for (const [client, other] of [[clientA, 'Bob'], [clientB, 'Alice']]) {
      assert.deepEqual(await verifySeatMarkers(client, other), { matches: true, names: ['Alice', 'Bob'] });
    }

    assert.deepEqual(await clientA.evaluate("window.__app._store.getRoomState().objects.filter(card => card.location === 'HAND').map(card => [card.id, card.handIndex, card.faceUp])"), seatHand);
    await clientA.evaluate("document.querySelector('#btn-round-reset').click()");
    for (const client of [clientA, clientB]) {
      await waitFor(client, "window.__app._store.getRoomState().round.phase === 'SETUP'");
      assert.equal(await client.evaluate("window.__app._sceneManager.getAllCards().length"), 0);
      assert.equal(await client.evaluate("window.__app._sceneManager.getOriginalDeck().visible"), false);
    }

    console.log('--- Multiplayer Verification Completed Successfully! ---');
  } catch (err) {
    console.error('[Test Error]:', err);
    process.exitCode = 1;
  } finally {
    if (clientA) await clientA.close();
    if (clientB) await clientB.close();
    if (clientC) await clientC.close();
  }
}

run();
