import assert from 'node:assert/strict';
import { startBrowser } from 'file:///D:/BoardGame/run_visual_debug.mjs';

async function main() {
  const browser = await startBrowser();
  await new Promise(r => setTimeout(r, 1000));
  await browser.evaluate(`
    window.__events = [];
    window.addEventListener("mousedown", e => window.__events.push({ t: "down", x: e.clientX, y: e.clientY }));
    window.addEventListener("mousemove", e => window.__events.push({ t: "move", x: e.clientX, y: e.clientY, buttons: e.buttons }));
    window.addEventListener("mouseup", e => window.__events.push({ t: "up", x: e.clientX, y: e.clientY }));
  `);
  await browser.mouseDrag(100, 100, 200, 200, 5);
  const evs = await browser.evaluate(`window.__events`);
  console.log("Captured events:", evs);

  try {
    await browser.evaluate("document.querySelector('#btn-enter-sandbox').click()");
    const points = await browser.evaluate(`(() => {
      const scene = window.__app._sceneManager;
      const canvas = scene.getInputCanvas();
      const card = scene.getAllCards()[0];
      const rect = canvas.getBoundingClientRect();
      const point = card.position.clone().project(scene.getCameraController().getCamera());
      const x = rect.left + (point.x + 1) * rect.width / 2;
      const y = rect.top + (1 - point.y) * rect.height / 2;
      for (const [dx, dy] of [[-70,-50], [70,-50], [-70,50], [70,50], [-40,-45], [40,-45]]) {
        if (document.elementFromPoint(x + dx, y + dy) !== canvas ||
          !scene.getTableIntersectionAtScreenPos(x + dx, y + dy) ||
          scene.getInteractionManager().getObjectAt(x + dx, y + dy)) continue;
        return { fromX: x + dx, fromY: y + dy, toX: x - dx, toY: y - dy, cardId: card.cardId };
      }
      return null;
    })()`);
    assert.ok(points, 'Có vùng trống để bắt đầu chọn khung');
    await browser.mouseDrag(points.fromX, points.fromY, points.toX, points.toY);
    const selected = await browser.evaluate("window.__app._sceneManager.getInteractionManager().getSelectedCards().map(card => card.cardId)");
    assert.ok(selected.includes(points.cardId));
    assert.equal(await browser.evaluate("document.querySelector('#marquee-count').textContent"), 'Đã chọn: 1');
    await browser.mouseClick(points.fromX, points.fromY);
    assert.equal(await browser.evaluate("document.querySelector('#marquee-count').hidden"), true);

    await browser.evaluate("(() => { const app = window.__app; const scene = app._sceneManager; scene.drawCardToHand('demo_deck_1', 0); scene.drawCardToHand('demo_deck_1', 0); })()");
    await new Promise(resolve => setTimeout(resolve, 700));
    const board = await browser.evaluate(`(() => {
      const app = window.__app;
      const scene = app._sceneManager;
      const canvas = scene.getInputCanvas();
      const { left, top, right, bottom } = canvas.getBoundingClientRect();
      const start = [[left + 3, top + 3], [left + 3, top + 80]].find(([x, y]) =>
        document.elementFromPoint(x, y) === canvas && !scene.getTableIntersectionAtScreenPos(x, y));
      return { start, right, bottom, ids: scene.getAllCards().map(card => card.cardId),
        fanOpen: app._fullHandFanPreviewUI.isOpen() };
    })()`);
    assert.equal(board.fanOpen, false);
    assert.ok(board.start, 'Có nền trống ngoài vùng chiếu xuống bàn');
    assert.equal(board.ids.length, 3);
    await browser.mouseDrag(...board.start, board.right - 3, board.bottom - 3, 18);
    assert.deepEqual((await browser.evaluate("window.__app._sceneManager.getInteractionManager().getSelectedCards().map(card => card.cardId)")).sort(), board.ids.sort());
    assert.equal(await browser.evaluate("window.__app._fullHandFanPreviewUI.isOpen()"), false);

    const fan = await browser.evaluate(`(() => {
      const app = window.__app;
      const hand = app._sceneManager.getLocalHandCards();
      app._fullHandFanPreviewUI.show(hand.map(card => ({ id: card.cardId, cardType: card.getCardType(), title: 'Lá thử' })));
      return hand.map(card => card.cardId);
    })()`);
    assert.equal(fan.length, 2);
    await new Promise(resolve => setTimeout(resolve, 300));
    const fanPoints = await browser.evaluate(`(() => {
      const start = document.querySelector('.fhfp-marquee-start').getBoundingClientRect();
      const cards = Array.from(document.querySelectorAll('.fhfp-card')).map(card => card.getBoundingClientRect());
      return { x: start.left + start.width / 2, y: start.top + start.height / 2,
        endX: Math.max(...cards.map(card => card.right)) + 4, endY: Math.max(...cards.map(card => card.bottom)) };
    })()`);
    await browser.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: fanPoints.x, y: fanPoints.y, button: 'left', clickCount: 1,
    });
    await browser.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: fanPoints.endX, y: fanPoints.endY, button: 'left', buttons: 1,
    });
    assert.equal(await browser.evaluate("getComputedStyle(document.querySelector('.fhfp-root')).visibility"), 'hidden');
    await browser.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: fanPoints.endX, y: fanPoints.endY, button: 'left', clickCount: 1,
    });
    assert.equal(await browser.evaluate("getComputedStyle(document.querySelector('.fhfp-root')).visibility"), 'visible');
    const fanSelected = await browser.evaluate("window.__app._sceneManager.getInteractionManager().getSelectedCards().map(card => card.cardId)");
    assert.deepEqual(fanSelected.sort(), fan.sort());
    console.log('Đã kiểm tra kéo khung trên bàn, trong fan và click vùng trống bằng Chrome.');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

