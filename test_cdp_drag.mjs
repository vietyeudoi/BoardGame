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
  await browser.close();
}

main().catch(console.error);

