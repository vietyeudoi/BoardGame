import assert from 'node:assert/strict';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { startBrowser } from './run_visual_debug.mjs';

async function waitFor(client, expression, timeout = 10_000) {
  const until = Date.now() + timeout;
  do {
    const value = await client.evaluate(expression);
    if (value) return value;
    await sleep(30);
  } while (Date.now() < until);
  assert.fail('Hết thời gian chờ: ' + expression);
}

function send(client, type, payload) {
  return client.evaluate('window.__app._networkClient.send(' + JSON.stringify({ type, payload }) + ')');
}

const clients = [];
try {
  for (const port of [9255, 9256, 9257]) {
    const client = await startBrowser(port);
    clients.push(client);
    await waitFor(client, "window.__app?._networkClient.getStatus() === 'connected'");
    await client.evaluate(`window.rollEvents = [];
      window.rollVisuals = [];
      window.rollErrors = [];
      const network = window.__app._networkClient;
      const onMessage = network.onMessage;
      network.onMessage = message => {
        try { onMessage(message); }
        catch (error) { window.rollErrors.push(error.stack); throw error; }
      };
      window.__app._networkClient._ws.addEventListener('message', event => {
        const { type, payload } = JSON.parse(event.data);
        if (type === 'table:rolled') {
          window.rollEvents.push(payload.roll);
          const effect = window.__app._sceneManager.tableRollEffects._effects.get(payload.roll.id);
          if (effect) window.rollVisuals.push({ id: effect.id, settled: effect.settled, reduced: effect.reduced });
        }
      });`);
  }
  const [a, b, c] = clients;
  await send(a, 'room:create', { roomName: 'Tung vật thể', playerName: 'An' });
  const roomId = await waitFor(a, 'window.__app._store.getRoomState()?.id');
  await send(b, 'room:join', { roomId, playerName: 'Bình' });
  await waitFor(a, 'window.__app._store.getRoomState()?.players.length === 2');
  await send(a, 'round:deal');
  await waitFor(b, "window.__app._store.getRoomState()?.round.phase === 'PLAYING'");
  await send(c, 'room:join', { roomId, playerName: 'Chi' });
  await waitFor(c, 'window.__app._store.getRoomState()?.players.length === 3');
  assert.equal(await c.evaluate("document.querySelector('#btn-roll-coin').disabled"), true);
  await send(c, 'table:roll', { kind: 'coin' });
  await waitFor(c, "document.querySelector('#hud-game-error').textContent.includes('ngồi')");
  assert.equal(await c.evaluate('window.rollEvents.length'), 0);

  await Promise.all(clients.map(client => client.evaluate("(() => {" +
    "window.rollNotices = []; const hud = document.querySelector('#hud-roll-notices');" +
    "new MutationObserver(() => window.rollNotices.push(hud.textContent)).observe(hud, { childList: true });" +
    "})()")));
  const deckCount = await a.evaluate('window.__app._store.getRoomState().deckCount');
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await Promise.all([
    a.evaluate("document.querySelector('#btn-roll-dice').click()"),
    b.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))"),
  ]);
  await send(a, 'table:roll', { kind: 'coin' });
  await waitFor(a, "document.querySelector('#hud-game-error').textContent.includes('Chờ')");
  const events = await Promise.all(clients.map(client => waitFor(client, 'window.rollEvents.length === 2 && window.rollEvents')));
  assert.deepEqual(events[0], events[1]);
  assert.deepEqual(events[1], events[2]);
  const die = events[0].find(roll => roll.kind === 'dice');
  const coin = events[0].find(roll => roll.kind === 'coin');
  assert.ok(die.result >= 1 && die.result <= 6);
  assert.ok(Math.hypot(die.x - coin.x, die.z - coin.z) > 2);
  const toast = 'An tung xúc xắc: ' + die.result;
  const effects = 'window.__app._sceneManager.tableRollEffects._effects';
  const reduced = await c.evaluate("({ visuals: window.rollVisuals, errors: window.rollErrors, media: matchMedia('(prefers-reduced-motion: reduce)').matches })");
  assert.equal(reduced.media && reduced.visuals.length === 2 && reduced.visuals.every(effect => effect.settled && effect.reduced), true,
    JSON.stringify(reduced));
  for (const client of clients) {
    assert.equal(await client.evaluate('window.rollVisuals.length'), 2);
    assert.equal(await client.evaluate('window.__app._store.getRoomState().deckCount'), deckCount);
  }
  assert.equal(await a.evaluate(`(() => {
    const scene = window.__app._sceneManager;
    const roll = window.rollEvents[0];
    const camera = scene.getCameraController().getCamera();
    const point = camera.position.clone().set(roll.x, 0, roll.z).project(camera);
    const rect = scene._renderer.getDomElement().getBoundingClientRect();
    return !scene.getInteractionManager().getObjectAt(
      rect.left + (point.x + 1) * rect.width / 2, rect.top + (1 - point.y) * rect.height / 2);
  })()`), true);
  await Promise.all(clients.map(client => waitFor(client,
    'window.rollNotices.some(text => text.includes(' + JSON.stringify(toast) + '))')));
  await waitFor(a, "!document.querySelector('#btn-roll-dice').disabled");
  await send(a, 'deck:view-open', { mode: 'see' });
  await waitFor(a, "document.querySelector('#btn-roll-dice').disabled");
  await send(a, 'table:roll', { kind: 'dice' });
  await waitFor(a, "document.querySelector('#hud-game-error').textContent.includes('See/Alter')");
  assert.equal(await b.evaluate("document.querySelector('#btn-roll-coin').disabled"), false);
  console.log('Đã kiểm tra 3 máy: kết quả, vị trí, toast, giảm chuyển động, hit-test, giới hạn và quyền tung.');

  const output = process.argv[2];
  if (output) {
    await a.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
    await waitFor(a, "!document.querySelector('#btn-roll-dice').disabled");
    await waitFor(a, effects + '.size === 0');
    await a.evaluate('window.__app._sceneManager.deckViewRow.clear()');
    await waitFor(a, "document.querySelector('#hud-game-error').hidden");
    await a.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    // Dùng từng kết quả cố định trong trình hiển thị để chụp đủ tám mặt.
    for (const [kind, result] of [[ 'dice', 1 ], [ 'dice', 2 ], [ 'dice', 3 ], [ 'dice', 4 ],
      [ 'dice', 5 ], [ 'dice', 6 ], [ 'coin', 'heads' ], [ 'coin', 'tails' ]]) {
      const roll = { id: 'preview', kind, result, playerId: 'preview', playerName: 'An',
        seat: 0, x: 0, z: 5.2, startedAt: 0 };
      await a.evaluate(`(() => {
        const effects = window.__app._sceneManager.tableRollEffects;
        effects.clear();
        effects.show({ roll: ` + JSON.stringify(roll) + `, sentAt: 0 }, () => {});
      })()`);
      await sleep(120);
      await a.screenshot(path.join(output, kind + '-' + result + '.png'));
    }
  }
} finally {
  await Promise.all(clients.map(client => client.close()));
}
