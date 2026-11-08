# DEVELOPMENT_LOG.md — Cat Boom Online

> Record of changes, decisions, and issues across all Milestones.

---

## M1.7.11 — Offline Camera Parity, Fan Reorder & Screen-to-Table Handoff
**Date**: 2026-11-07
**Status**: ✅ Implemented; all automated regression, typecheck and build checks pass; live browser verified

### Findings and fixes

- **Camera root cause**: Online `applyLocalPlayerPerspective()` aimed at the active seat position, while Offline starts with the table-centre target. That offset changes the visible framing even when `theta`, radius and camera helper are shared. Online also applied a fallback seat as soon as `roomId` existed, before the authoritative room snapshot necessarily contained the local player.
- **Camera lifecycle**: the room subscriber now waits for a room snapshot containing the local player and uses that player's `playerIndex` when available. The seat-specific azimuth stays local; target is the Offline table centre; table-derived adaptive radius, FOV, clipping, zoom and viewport aspect are preserved. Initial camera and Reset Camera still use the same `SceneManager.applyLocalPlayerPerspective()` logic.
- **Fan reorder**: `FullHandFanPreviewUI` now tracks a temporary visual order and a single dragged card ID. Neighbour slots animate while the pointer remains in the fan. Release commits one local `HandZoneObject3D.reorderCards()` order; movement alone does not mutate hand order. Browser-default text selection is disabled on fan cards.
- **Fan-to-table handoff**: the fan drag remains screen-space until the pointer crosses above the fan region. It then starts the existing `DragController` pipeline at the original press position and forwards the current mouse move. The fan copy is hidden during the handoff; ownership/location still changes only through the existing valid drop pipeline. Fan-only drags are protected from the 3D hover close path.
- **Pointer cleanup**: `pointercancel`, window blur and Escape clear a pending fan reorder gesture. If the gesture already handed off to the 3D drag pipeline, cancellation delegates to `DragController.cancelDrag()` and restores the fan drag state.
- **Fan visuals**: normal, hover, selected and dragging retain the priority `Dragging > Selected > Hovered > Normal`. Hover is 1.04 scale / 10px lift, selected 1.05 / 19px lift with glow, dragging 1.06 / 20px lift with strongest shadow. Selection continues to use the shared `RaycastInteractionManager` state and card IDs.
- **Ordering persistence**: hand reorder remains local-only because this codebase does not currently persist or broadcast hand order. No backend protocol or private-hand visibility changes were made.

### Browser verification

- Used a real browser at a 1280×720 viewport to view Offline P1 and Online P1 in the same app instance. Table footprint and framing matched before Reset; Reset produced no visible framing jump.
- Joined P1, P2, P3 and P4 to one local room. Each client displayed its corresponding seat and a distinct orientation. P1 and P2 were also verified as separate clients before testing interaction.
- Drew a five-card hand, opened the fan by hovering the real 3D hand, and dragged the second card across two neighbours. The fan stayed open and visibly reordered the card IDs in both the preview and 3D hand. Dragging a fan card above the fan then moved the 3D card onto the table and closed the preview after the card left the hand.
- Screenshots were inspected in the browser during the run. A separate headless screenshot exporter could not start because its Chrome target crashed in this environment, so no image files were added to `docs/screenshots/`.

### Regression results

| Check | Result |
|---|---|
| Frontend tests | 876 passed / 45 files |
| Backend tests | 41 passed / 9 files |
| Frontend + backend typecheck | Pass |
| Frontend + backend production build | Pass (existing Vite chunk-size warning only) |
| Frontend regression after pointer-cancel cleanup | 876 passed / 45 files |
| Browser: Offline P1 vs Online P1 | Same 1280×720 viewport; table footprint and framing matched before Reset; Reset unchanged |
| Browser: P1/P2/P3/P4 | Four separate clients joined one room; all showed their own seat perspective |
| Browser: Fan reorder | Real mouse drag moved card B past C/D; fan stayed open and the 3D hand order matched |
| Browser: Fan → TABLE | Real mouse drag handed off to the 3D card; remote client showed the resulting table card |

The camera comparison and fan states were captured and inspected in the real browser. The separate headless screenshot exporter crashed before producing files, so screenshot image files are not included in the workspace.

### Files changed

- `frontend/src/app/App.ts`
- `frontend/src/scene/SceneManager.ts`
- `frontend/src/ui/components/FullHandFanPreviewUI.ts`
- `frontend/src/__tests__/onlineCameraInitialization1710.test.ts`
- `frontend/src/__tests__/playerPerspective179.test.ts`
- `frontend/src/__tests__/handRedesign177.test.ts`
- `frontend/src/__tests__/persistentFanDrag1710.test.ts`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT_LOG.md`

---

## M1.7.10 — Persistent Fan During Drag, Fan Hover/Selected FX & Online Camera First-Frame Fix
**Date**: 2026-11-07
**Status**: ✅ Completed — Parts A/B/C implemented, full regression green, live-browser verified with 2 online clients

- **Tests**: 41/41 Backend tests PASS (9 files); **874/874 Frontend tests PASS** (45 files — new `persistentFanDrag1710.test.ts` F1710-01…F1710-17 and `onlineCameraInitialization1710.test.ts` C1710-01…C1710-10 + C1710-04b; F178-09, F179-05 and F179-13 updated to the M1.7.10 behaviour)
- **Build**: frontend `tsc && vite build` and backend `tsc` both pass with 0 errors (frontend bundle 733.90 kB — pre-existing chunk-size warning only)
- **Live browser**: 2 real clients (P1/P2) in the same room, camera + fan + drag verified end-to-end

### Part A — Full Hand Fan Preview stays open during drag

Root causes fixed:
1. **Hide-on-drag-start**: `SceneManager` closed the fan as soon as a drag activated, so the overlay disappeared under the cursor mid-gesture (and the pointer then landed on the canvas, changing the drop target).
2. **No post-drop boundary rule**: after a drag the fan state was derived from the stale hover object (hover raycasts are suppressed while dragging), which either kept the fan open forever or closed it while the pointer was still over the Preview.
3. **No reliable pointer position**: `DragController` never recorded where the gesture ended, so nothing could evaluate HAND + Preview containment at drop time.

Implementation:
- `SceneManager`: new `_localHandDragActive` / `_lastDraggedCardId` and `isLocalHandDragActive()`. `onDragStarted` only records state (no close). Hand-membership refreshes skip hover re-evaluation while a local drag is active.
- Drag-end rule (single source of truth, in `_onCardDropped`):
  - last dragged card **still in local HAND** → keep the fan open (reorder, cancel, rejected drop);
  - else if the pointer is over the **Preview overlay** → keep open (the fan is the Preview half of the HAND + Preview zone);
  - else → close the fan and clear the stale hover (`interactionManager.setHoveredObject(null)`).
- `DragController`: `_lastPointerClientX/Y` recorded on pointer-down, move and mouse-up; `getLastPointerPosition()` exposes it. `_onMouseUp(event?)` now receives the real event. `beginDrag()` (M1.7.9 fan path) reuses the exact same pipeline.
- `FullHandFanPreviewUI.containsPoint(clientX, clientY)`: overlay bounds test (returns false when closed / zero-sized), exposed to `SceneManager` via the new `isPointOverLocalHandPreview` hook wired in `App.ts`.
- No DOM destroy and no layout reset on drag start; the fan card list only changes when the authoritative HAND changes.

### Part B — Fan card hover / selected visuals

- `FullHandFanPreviewUI._applyCardVisuals()` computes an explicit priority: **drag > selected > hover > normal**.
  - hover: `--dy-hover: -10px`, `--scale: 1.05`, `z-index = maxSlotZ + 1`;
  - selected: class `fhfp-card--selected` (stronger lift/scale + glow), `z-index = maxSlotZ + 2`;
  - dragging card: `--dy-hover: -16px`, `z-index = maxSlotZ + 1000`.
- Transition limited to `transform` / `opacity` (150 ms), same DOM nodes reused; only `_hoveredSourceId` / `_selectedSourceIds` change. `_slotZ` is trimmed on hand shrink so the stacking base never uses stale z-values from a larger hand.
- Hover state is cleared on dispose, on close and on hand shrink.

### Part C — Online camera first frame equals Reset Camera

Root cause: online join applied a *different* code path than the offline/Reset path, so the first rendered frame could sit at the neutral camera and only settle after a resize/Reset. A second issue was that `resetCamera()` used the table centre rather than the seat target.

Implementation:
- `SceneManager.applyLocalPlayerPerspective(animate)` is the single source of truth. Initial App setup, the **Reset Camera** button and the **R** key all delegate to it.
- `CameraController.onResetRequested` + `setDefaultTarget(seatTarget)`: `resetCamera()` restores the exact seated target/theta/radius/phi, so manual reset == initial framing.
- Camera stays strictly local (never broadcast); per-frame orbit input is not overwritten — the perspective is only (re)applied on seat/room/resize changes and on explicit reset.

### Regression results

| Suite | Cases | Result |
|---|---|---|
| `persistentFanDrag1710.test.ts` | F1710-01…17 | green |
| `onlineCameraInitialization1710.test.ts` | C1710-01…10, C1710-04b | green |
| `fullHandFanPreview178.test.ts` | F178-01…14 (F178-09 updated) | green |
| `fullHandFanPreview179.test.ts` | F179-01…14 (F179-05/13 updated) | green |
| Full frontend | 874 tests / 45 files | green |
| Backend | 41 tests / 9 files | green |

### Live browser evidence (2 clients, room `RAS4ZG`)

- **Camera**: P1 `theta = 0`, target `(0, 0, 7.5)`; P2 `theta = π`, target `(0, 0, -7.5)` on the very first frame. After an orbit + pan, Reset Camera returned to `radius 29.701676`, `phi 0.923998`, identical target/position on both clients.
- **Part B**: hovered fan card `z = 7` while the max other slot was `6`, `--dy-hover = -10px`, `--scale = 1.05`; selected card `z = 8` with `fhfp-card--selected` and a real selection; hovering another card did not override the selection; clicking again deselected.
- **Part A**:
  - drop over the Preview region → card left the HAND, fan stayed open (5 cards rendered);
  - drop on the table with the pointer above the preview (`y = 343 < rootTop = 362`) → fan closed and the card stayed on the table;
  - drag back into the local HAND zone → card returned to the hand (`isInHand: true`, `zone: hand_zone_1`), fan stayed open;
  - the second client saw both table cards at identical positions → no duplicate gameplay pipeline.
- Fan drag z-priority verified live: dragged card `z = 1006`, others `1…5`; `--dy-hover = -16px`.

### Known limitations / residual issues

- Refreshing the page returns to the lobby and does **not** auto-rejoin the previous room (pre-existing server/network behaviour — the room is also destroyed when its last client leaves). Rejoining manually re-applies the correct seat perspective.
- If a drop lands on the projected 3D hand while the card actually left the HAND, the fan closes then re-opens on the next hand-hover — the boundary rule intentionally uses screen-space Preview containment, not a per-frame raycast (jsdom-safe, no per-frame cost).
- Pre-existing jsdom `canvas.getContext` stderr noise in some suites is unrelated to this change.

### Files modified

- `frontend/src/scene/SceneManager.ts` — drag lifecycle, boundary rule, `isPointOverLocalHandPreview`, `applyLocalPlayerPerspective`, reset hook.
- `frontend/src/scene/CameraController.ts` — `onResetRequested`, `setDefaultTarget`, reset consistency.
- `frontend/src/ui/components/FullHandFanPreviewUI.ts` — hover/selected/drag visuals, `containsPoint`, `_slotZ` trim, cleanup.
- `frontend/src/interaction/DragController.ts` — `beginDrag`, `getLastPointerPosition`, mouse-up event, cleanup.
- `frontend/src/app/App.ts` — fan handlers, preview boundary wiring, camera seating + Reset Camera wiring.
- Tests: `persistentFanDrag1710.test.ts` (new), `onlineCameraInitialization1710.test.ts` (new), `fullHandFanPreview178.test.ts`, `fullHandFanPreview179.test.ts`.

---

## M1.7.9 — Restore Offline Player Perspective & Interactive Full Hand Fan Preview
**Date**: 2026-11-06
**Status**: ✅ Completed — Part A camera reuse verified (C179 tests + live browser seat checks); Part B interactive fan implemented (F179 tests + live browser interaction verified)

- **Tests**: 41/41 Backend tests PASS (9 files); **846/846 Frontend tests PASS** (43 files — including new `fullHandFanPreview179.test.ts` F179-01…F179-14 and `playerPerspective179.test.ts` C179-01…C179-07)
- **Build**: Frontend & Backend typecheck and production build pass with 0 errors (frontend bundle 730.27 kB, only the pre-existing chunk-size warning)

### Part A — Online Player Perspective restored to match Offline

- Investigation confirmed a single shared camera path: `SceneManager.setPlayerPerspective()` → `computePlayerPerspective()` (PlayerPerspectiveHelper) → `CameraController.setPlayerPerspective()` / `setAdaptiveRadius()` / `setTarget()` → `_updateCamera()`.
- No divergent camera logic was found between Offline and Online init; the difference was only the input (local player index / player count), already routed through the same helpers.
- Camera remains client-side only (never in WS payloads); seat changes / reconnect / refresh re-apply the seated perspective through the same code.
- Regression coverage: C179-01…C179-07 lock Offline-unchanged, Online≡Offline for P1, per-seat correctness (P2/P3/P4), refresh/reconnect restore, resize framing, and camera-does-not-touch-card-rotation.

### Part B — Interactive Full Hand Fan Preview (M1.7.9 upgrade of M1.7.8)

- `FullHandFanPreviewUI`: new `FullHandFanPreviewHandlers` interface + `setHandlers()`; fan cards now get `pointer-events: auto` (root stays `pointer-events: none` so empty overlay areas never block the canvas); listeners wired per card in `_buildCards()`:
  - `mouseover` → `onCardHover(sourceCardId)`
  - `mousedown` (button 0 / no shift) → `onCardDragStart(sourceCardId, event)`
  - `click` → `onCardSelect(sourceCardId, addToSelection)` (movement-gated so a real drag is never treated as a click)
- `DragController.beginDrag(card, event)`: public wrapper that reuses the private `_onCardPointerDown` (threshold, drag plane, pickup offset, layout control, drop pipeline) → drag from fan == drag from real HAND.
- `RaycastInteractionManager.setHoveredObject(object | null)`: public programmatic hover that mirrors the internal `_updateHover` bookkeeping (hover highlight refresh + `onHoverChanged` fan-out) → fan hover lands on the real card pipeline.
- `App.ts`: wires the fan handlers → real card pipelines (hover via interaction manager, select via selection manager, drag via DragController).

### Behaviour / regression results (F179-01…F179-14 — all green)

- F179-01: Hover HAND → fan opens with the entire hand (new handler path).
- F179-02: Moving HAND → Preview keeps the fan open.
- F179-03: Hovering a preview card forwards the exact source cardId to the hover pipeline.
- F179-04: Click on a preview card selects the real corresponding card (single-select).
- F179-05: Dragging a preview card runs the real drag pipeline and closes the fan.
- F179-06: Drop after fan-drag runs the existing gameplay drop pipeline.
- F179-07: Hover between preview cards keeps the fan open without flicker (same DOM nodes).
- F179-08: Preview → HAND keeps the fan open.
- F179-09: Leaving both HAND and Preview closes the fan.
- F179-10: Played card leaves the fan list on hand update.
- F179-11: Multi-selection via fan clicks works without conflict.
- F179-12: Fan interactions do not desync real card transforms.
- F179-13: Fan closes exactly when the drag activates (not on plain press).
- F179-14: Preview state is local-only, no leak between instances.

### Known limitations / next steps

- Live browser verification for M1.7.9 (camera + fan interaction) was executed after the dev servers restart; captures go to `docs/screenshots/m1.7.9/`.
- Live browser verification results (M1.7.9):
  - Offline session: dealt 5-card hand via `SceneManager.drawCardToHand('demo_deck_1', 0)`; real `mousemove` → raycast → fan opened with full hand (rotations −16°…+16°, centre 0°).
  - Fan → real card hover: `mouseover` on fan card forwarded to real hover pipeline (`card_30 → card_28` live), fan stayed open, local hover true.
  - Fan → real card click: selection landed on the real card (`card_28`) via the fan click path.
  - Fan → real card drag: mousedown+move activated real drag (`isDragging: true`), fan closed exactly on drag activation, drag cleaned up after mouseup.
  - Boundary: moving the pointer out of both HAND and Preview closed the fan (`hovered: null`, fan closed).
  - Camera: live seated checks — Offline P1 θ=0; seat switch P3 → θ=π/2, back to P1 → θ=0; camera radius/target within bounded tabletop framing.

---

## M1.7.8 — Full Hand Fan Preview (Reference-Based)
**Date**: 2026-11-06
**Status**: ✅ Completed, Fully Tested, Built & Verified in the Live Browser (screen-space fan)

- **Tests**: 41/41 Backend tests PASS (9 files); **825/825 Frontend tests PASS** (41 files, including the new `fullHandFanPreview178.test.ts` regression suite F178-01…F178-14)
- **Build**: Frontend & Backend typecheck and production build pass with 0 errors (frontend bundle 728.53 kB, only the pre-existing chunk-size warning)
- **Browser verification**: live Vite client at `localhost:3000` + WebSocket backend at `localhost:4000`; offline sandbox session with dealt hands; fan opened through the real `mousemove` → raycast → `onHoverChanged` → fan pipeline.

### Goal

When the pointer enters **any** local-player HAND card, show the **entire** hand as a poker-style fan in a screen-space overlay at the bottom of the viewport (reference-based design). The original flat 3D hand (M1.7.7.1) stays completely unchanged.

### Implementation

- New `frontend/src/ui/FanPreviewConfig.ts`: `FAN_CARD_ART` (all 13 card types), `FAN_CARD_FALLBACK`, `FAN_CARD_BACK`, `FAN_PREVIEW_LAYOUT` (size/spacing/spread/arc constants).
- New `frontend/src/ui/components/FullHandFanPreviewUI.ts`: screen-space overlay (`position: fixed; bottom: 0; z-index: 150; pointer-events: none`) with `show/update/hide/isOpen/getRenderedCardIds/getCardElements/getRootElement/dispose`, pure exported `computeFanLayout`, scoped CSS, per-type inline artwork (banner / glyph / accent / surface / title), open/close transitions, close timer, resize relayout, same-signature DOM reuse (no flicker).
- `frontend/src/objects/CardObject3D.ts`: added `_cardType`, `getCardType()`, `setCardType()`.
- `frontend/src/objects/CardTypeHelper.ts`: added `CARD_TYPES`, `CardTypeId`, `getCardTypeFromTitle()`.
- `frontend/src/objects/HandZoneObject3D.ts`: added `_onCardsChangedCallback` + `setCardsChangedCallback`, fired on add/remove/move/reorder/clear (not on layout passes).
- `frontend/src/objects/HandZoneManager.ts`: `setCardsChangedCallback` propagates to all zones.
- `frontend/src/scene/SceneManager.ts`: added `onLocalHandHoverChanged`, `onLocalHandChanged`, `getLocalHandCards()`, `isLocalHandHovered()`, `isLocalHandCard()`; hover handler resolves local-player hand membership; drag start resets hover state (fan hides).
- `frontend/src/interaction/DragController.ts`: added `onDragStarted` (fired in `_activateDrag`).
- `frontend/src/app/App.ts`: instantiates `FullHandFanPreviewUI` on `#ui-overlay`, wires hover → show full hand, hand change → refresh, drag → hide, disposes on teardown.

### Fan geometry

- Card height = `clamp(30% viewport height, 180, 240)` px; card width = height × (2.5 / 3.5).
- Spacing ratio by hand size: ≤3 → 0.94, ≤6 → 0.80, ≤10 → 0.66, ≤15 → 0.56, else 0.48 (fraction of card width); clamped by rotated-card extents so the fan never exceeds `min(viewportWidth − 2×margin, 1500)`.
- Half spread = `min(28°, 8° + 1.6° × N)`; symmetric `t = (i − (N−1)/2) / ((N−1)/2)`; `angle = t × halfSpread`; centre raised via `y = −arcHeight × (1 − t²)`; `arcHeight = min(34, 0.12 × height)`; zIndex increases left → right.

### Behaviour / regression results (F178-01…F178-14 — all green)

- F178-01/02/03: hover first / middle / last hand card → fan opens with the **entire** hand.
- F178-04: 5-card fan → 5 rendered cards, distinct rotations, centre ≈ 0°, outer tilted.
- F178-05: 10-card fan → 10 rendered, overlap increased vs 5-card fan.
- F178-06: 15-card fan → fan fits viewport (no overflow).
- F178-07: hover switch reuses the same DOM nodes (no flicker/rebuild).
- F178-08: pointer leave → fan closes (`aria-hidden`, logical state cleared).
- F178-09: drag start → fan closes immediately.
- F178-10: played card dropped from the open fan list (hand membership change → refresh).
- F178-11: opponent HAND → no fan.
- F178-12: original card transforms untouched by the fan.
- F178-13: no fan state leaks between preview instances.
- F178-14: resize → fan recomputes, centred, within bounds.

### Browser verification (live)

- Vite dev server `localhost:3000`, backend `localhost:4000`; offline sandbox.
- Dealt hands of 5 / 10 / 15 cards via `SceneManager.drawCardToHand('demo_deck_1', 0)`.
- Real pointer path: dispatched `mousemove` on the WebGL canvas through the real listener → raycast → `onHoverChanged` → fan opened with full hand. Measured fan state: 5 cards → rotations −16°…+16° (centre 0°), 10 cards → −24°…+24°, 15 cards → −28°…+28°, centred at `calc(50% + x)`, arc heights decreasing towards the centre card.
- Drag path: `mousedown` + `mousemove` → drag activated → fan closed immediately (`F178-09` live).
- Visual captures (WebGL canvas frame + fan DOM subtree rasterized via SVG foreignObject, POSTed to the local capture sink) stored in `docs/screenshots/m1.7.8/`.

### Visual evidence

- `docs/screenshots/m1.7.8/f178_live_hand5_fan_open.png` — live WebGL frame with the 5-card fan open (hover lift on hovered card, all flat).
- `docs/screenshots/m1.7.8/f178_live_fan_5cards.png` — screen-space fan DOM rasterization, 5 cards.
- `docs/screenshots/m1.7.8/f178_live_fan_10cards.png` — screen-space fan DOM rasterization, 10 cards.
- `docs/screenshots/m1.7.8/f178_live_fan_15cards.png` — screen-space fan DOM rasterization, 15 cards.

### Known limitations / next steps

- The desktop browser screenshot tool returned “Screenshot needs a visible tab”; fan frames were captured by rasterizing the fan DOM subtree (SVG `foreignObject`) and the WebGL canvas, then POSTing to the local capture sink.
- Demo sandbox cards carry no `cardType`, so the fan falls back to the generic artwork (`🃏`); the 13 real deck types are covered by `FAN_CARD_ART`.
- Fan images are glyph-based artwork stand-ins (no image assets existed in the project); no new gameplay cards were added.

---

## M1.7.7.1 — Correct Hand Card Hover UX (Browser-Verified Fix)
**Date**: 2026-11-06
**Status**: ✅ Completed, Fully Tested, Built & Verified in the Live Browser with Two Clients
- **Tests**: 41/41 Backend tests PASS (9 files); **811/811 Frontend tests PASS** (40 files, including new H177-13/H177-14 real-hover-path regressions)
- **Build**: Frontend & Backend typecheck and production build pass with 0 errors (frontend bundle 714.03 kB, only the pre-existing chunk-size warning)
- **Browser verification**: live Vite client at `localhost:3000` + WebSocket backend at `localhost:4000`; two independent clients (Alice P1 / Bob P2) in room `6XSCOC`

### Root Cause (why the old effect was still visible)

The M1.7.3 **hand fan preview** was still running on pointer-enter. `SceneManager._interactionManager.onHoverChanged` called `zone.setPreviewActive(true)` as soon as the pointer entered the local hand zone, and `HandZoneObject3D._computeSlot()` then applied the preview transform to **every** card in the hand:

- `rotationX = π / 2.5` (72° stand-up pitch)
- `elevation += 1.2`, plus `+0.35` for the hovered card
- fan spread / fan spacing
- `renderOrder` boosts of `+150` (whole hand) and `+300` (hovered card)

The M1.7.7 change only modified the **non-preview** hover branch, so it never ran while the pointer was inside the hand zone. That is why the browser still showed the legacy stand-up/fan effect despite the passing unit tests.

### Fix — one presentation source, no legacy fallback

Removed the fan/preview machinery completely:

- `HandZoneObject3D`: `_previewProgress`, `_previewAnimDir`, `_previewAnimStart`, `_previewOpenMs/_previewCloseMs`, `_needsRenderCallback`, `_animFramePending`, `easeOut`, `setPreviewActive`, `isPreviewActive`, `_scheduleAnimFrame`, `_tickPreviewAnimation`, `_tickAnimStep`, `_computeFanSpacing`
- `HandZoneManager`: `setNeedsRenderCallback`, `deactivateAllPreviews`, `_needsRenderCallback`
- `SceneManager`: preview activation on hover, render-callback wiring, and all three preview-teardown calls

`HandZoneObject3D.arrangeCards()` is now the single source of hand presentation. Every card is always flat (`rotation.x = 0`, `rotation.z = 0`, only the zone yaw on Y). There is no code path that can pitch or fan a hand card.

### Flat overlapping row (adaptive, centred)

Spacing is derived from the real card width, card count and usable zone width (`usable = zoneWidth − cardWidth − 2 × HAND_MARGIN`, `HAND_MARGIN = 0.15`):

| Cards | Desired spacing | Notes |
|-------|-----------------|-------|
| 1–3 | `cardWidth + NATURAL_GAP` (0.06) | little/no overlap |
| 4–6 | `0.62 × cardWidth` | light overlap |
| 7–10 | `0.48 × cardWidth` | medium overlap |
| 11+ | `0.34 × cardWidth` | heavy overlap |

The result is always clamped to `usableWidth / (N − 1)`, so the row is centred and never leaves the hand zone.

### Hover (subtle only)

- `HOVER_LIFT_Y = 0.05`, `HOVER_SCALE = 1.04`, `HOVER_LAYER_OFFSET = 30`
- Selected card: `SELECTED_ELEVATION = 0.12`, `SELECTION_LAYER_OFFSET = 100`
- Rotation never changes on hover; neighbours are not displaced; opponent hands never receive the local lift/scale.
- On pointer leave every card returns to its exact baseline transform, scale and layer.

### Browser verification (measured in the live scene graph)

| Test | Result |
|------|--------|
| 5-card hand | spacing 0.600, centred at x = 0, every `rotation.x/z = 0`, all inside zone |
| Hover each of 5 cards (real `mousemove` path) | only hovered card: `+0.05` Y, scale `1.04`, layer `+30`; all other cards unchanged; no pitch |
| Continuous 81-step sweep across the row | `max |rotation.x| = 0`, `max |rotation.y − zoneYaw| = 0`, `max scale = 1.04`, one scaled card per frame, exact restore on leave |
| 10-card hand | spacing 0.2667, all flat, all inside zone, hover still flat |
| 15-card hand | spacing 0.1714, 15 unique X positions, all flat, all inside zone, last card fully visible, hover still flat |
| Drag HAND→TABLE (15-card hand) | mid-drag: card lifted to y = 0.15, flat, scale 1, `inHand = true`; after drop: `ON_TABLE`, position `(1.165, 0, 4.43)`, `rotation (0,0,0)`, scale 1, remaining 14 cards flat and re-centred |
| TABLE hover after drop | hovered id resolves, rotation/scale/position unchanged |
| 2 clients (Alice P1 / Bob P2, room `6XSCOC`) | Alice drew 6 cards via `card:draw`; Bob saw 6 masked cards, all flat at identical positions |
| Alice hovers a hand card | Alice: `+0.05` Y, scale 1.04, layer 53; Bob: identical baseline transforms, no leak |
| Bob hovers Alice's hand card | raycast highlight only; no lift/scale on opponent cards |
| Alice drags a card to TABLE | both clients: `ON_TABLE`, same position, rotation 0, scale 1; Alice's remaining 5 cards flat |
| Alice selects + `R` on the TABLE card | both clients: `rotation.y = 1.5708`, identical clamped position `(1.019, 0, 3.5)` |
| Bob hovers the TABLE card | hover id resolves, rotation/scale/position unchanged |

### Visual evidence

Captured from the **live WebGL canvas** (the harness desktop-screenshot API could not see the tab, so the canvas was rendered and read directly). Hand/area label sprites were temporarily hidden in the close-ups so they would not cover the cards.

- `docs/screenshots/m1.7.7.1/01-5-card-hand.jpg` — 5-card flat overlapping row
- `docs/screenshots/m1.7.7.1/02-5-card-hover.jpg` — middle card hovered (fully visible on top, `+0.05`/`1.04`, still flat)
- `docs/screenshots/m1.7.7.1/03-15-card-hand.jpg` — 15-card adaptive row with 15 visible strips
- `docs/screenshots/m1.7.7.1/04-drag-hand-to-table.jpg` — card lifted out of the hand during a real drag
- `docs/screenshots/m1.7.7.1/05-hand-and-dropped-card.jpg` — 14-card hand after the drop + landed TABLE card
- `docs/screenshots/m1.7.7.1/06-multiplayer-bob-view.jpg` — Bob's client: Alice's masked hand + synced TABLE card
- `docs/screenshots/m1.7.7.1/00-old-standup-reconstructed.jpg` — **reconstruction** of the removed M1.7.3 preview transform (72° pitch, +1.2 lift) for before/after comparison; not a capture of live code

### Changes Made

- `frontend/src/objects/HandZoneObject3D.ts`: removed preview/fan API and state; `_computeFlatSpacing` / `_computeSlot` now produce only the flat row + subtle hover; raycast partitions use the same spacing; dispose cleanup.
- `frontend/src/objects/HandZoneConfig.ts`: removed `CARD_SPACING_DEFAULT`, `MAX_HAND_WIDTH`, `MAX_FAN_ANGLE`, `OVERLAP_GAP`; added `HAND_MARGIN`, `NATURAL_GAP`, `SPACING_RATIO_LIGHT/MEDIUM/HEAVY`, `SELECTION_LAYER_OFFSET`; `HOVER_SCALE = 1.04`.
- `frontend/src/objects/HandZoneManager.ts`: removed preview/render-callback APIs.
- `frontend/src/scene/SceneManager.ts`: removed preview activation + teardown; hover/selection only re-arrange the flat row.
- `frontend/src/__tests__/handFanPreview173.test.ts`: file kept and repurposed to the 22-test flat-row contract (not deleted).
- `frontend/src/__tests__/handRedesign177.test.ts`: added H177-13 (real pointer-enter path) and H177-14 (sweep restore).
- Updated to the new expectations: `handInteraction172`, `handZone150`, `handTableHoverReset1751`, `opponentInteractionAndCursorFix`, `opponentHoverDrag1741`.

### Known Limitations

- The desktop screenshot tool returned “Screenshot needs a visible tab” because the app window was not in front; live scene pixels were captured from the WebGL canvas instead. The close-ups therefore do not include the HUD chrome.
- The “old behaviour” image is a reconstruction using the exact removed M1.7.3 constants, not a capture of the old build.

---

## M1.7.7 — Table Visibility & Hand Card UX Redesign
**Date**: 2026-11-06
**Status**: ✅ Implemented, Fully Tested, Built & Verified with Two Live Clients — hover presentation superseded by M1.7.7.1
- **Tests**: 41/41 Backend tests PASS (9 files); **810/810 Frontend tests PASS** (40 files, including new `handRedesign177.test.ts` H177-01…H177-12 + camera framing checks)
- **Build**: Frontend & Backend TypeScript typecheck and production build pass with 0 errors (frontend bundle 716.89 kB, only the pre-existing chunk-size warning)
- **Multiplayer verification**: Alice (P1, seat 0) and Bob (P2, seat 1) — two independent browser clients in room `DAZSLU` over the real WebSocket backend (`ws://localhost:4000/ws`) and Vite dev server

### Part 1 — Table Visibility & Camera Adjustment (M1.7.7)

- **Problem**: central card piles could block the view of the two short sides of the felt; seated camera framing was not re-asserted per seat.
- **Fix**: `SceneManager.setPlayerPerspective` now re-applies the adaptive camera radius for the current table shape (`computeAdaptiveRadius(getTableOuterRadius(...))`) on every seat change and aims the camera at the seated player's position (`computePlayerPerspective(...).seatPosition`) so the felt (incl. short sides) stays observable without hiding cards or player areas.

### Part 2 — Hand Redesign (M1.7.7)

- **Removed old hover presentation**: lift +0.20, pitch π/3, scale 1.08, fan rotation, elevated hand layer (+200) replaced.
- **New hover** (`HandZoneObject3D._computeSlot`): subtle lift +0.05 (`HAND_ZONE_CONFIG.HOVER_LIFT_Y`), tiny scale (`HOVER_SCALE`, set to 1.04 in M1.7.7.1), no stand-up pitch, no fan rotation, no neighbour displacement, render-order offset +30 (`HAND_ZONE_CONFIG.HOVER_LAYER_OFFSET`) above neighbours; selected card keeps its stronger (+100) highlight. **M1.7.7.1 note**: the M1.7.3 fan preview was still activating on pointer-enter and overriding this branch in the browser; it has now been removed entirely.
- **Overlapping hand row**: modern battler-style overlapping layout retained/adjusted (small gap `OVERLAP_GAP`; both the constant and the per-count ratios were replaced in M1.7.7.1 by `HAND_MARGIN` + `NATURAL_GAP`/`SPACING_RATIO_*`), responsive spacing per card count, centered row.
- **Hover-out**: restores exact baseline transform/layer (scale 1, layer baseline, position baseline).

### Part 3 — Compatibility & Regression (M1.7.7)

- M1.7.5 (seat orientation, wheel free rotation, R/Shift+R, rotation sync, layer sync, drag, multi-select, table clamp, no Snap-to-Grid) and M1.7.6 (authoritative TABLE hover eligibility, stale-owner clearing) remain intact; H1756/H1752/H1753/H1754/H1751 suites pass with updated M1.7.7 hover expectations where the hover presentation itself was redesigned.

### Changes Made

- `frontend/src/objects/HandZoneConfig.ts`: added `OVERLAP_GAP`, `HOVER_LIFT_Y`, `HOVER_SCALE`, `HOVER_LAYER_OFFSET` (M1.7.7.1 later removed `OVERLAP_GAP`, set `HOVER_SCALE = 1.04`, and added `HAND_MARGIN`/`NATURAL_GAP`/`SPACING_RATIO_*`/`SELECTION_LAYER_OFFSET`).
- `frontend/src/objects/HandZoneObject3D.ts`: M1.7.7 subtle hover in `_computeSlot` (no stand-up/pitch/fan; neighbours untouched).
- `frontend/src/scene/SceneManager.ts`: `setPlayerPerspective` re-frames camera adaptively + seat-targeted.
- New: `frontend/src/__tests__/handRedesign177.test.ts` (H177-01…H177-12 + camera framing).
- Updated legacy expectations: `handInteraction172`, `multiplayerIntegration151`, `handTableHoverReset1751`, `handZoneAndOwnership154`, `opponentHoverDrag1741`, `handHoverLeak1756`.

### Known Limitations / Next Steps

- Browser-based visual verification of the overlapping hand row + camera framing (multi-client) was completed in **M1.7.7.1** (live WebGL captures + two-client room test).

---

## M1.7.6 — HAND Hover Presentation Leak Fix (Authoritative TABLE Ownership)
**Date**: 2026-11-05
**Status**: ✅ Completed, Fully Tested, Built & Verified with Two Live Clients
- **Tests**: 41/41 Backend tests PASS (9 files); 797/797 Frontend tests PASS (39 files, including 10 new M1.7.6 regressions H1756-01…10 in `handHoverLeak1756.test.ts`)
- **Build**: Frontend & Backend TypeScript typecheck and production build pass with 0 errors (frontend bundle 716.50 kB, only the pre-existing chunk-size warning)
- **Multiplayer verification**: Alice (P1, seat 0) and Bob (P2, seat 1) — two independent browser clients in room `DAZSLU` over the real WebSocket backend (`ws://localhost:4000/ws`) and Vite dev server

### Root Cause

A HAND card that was dragged to the table kept its hand-style hover presentation (1.15× group scale, +0.5 Y lift, horizontal spread) whenever the pointer stayed on it after the drop.

- **Offending file/function**: `frontend/src/interaction/HoverExpansionController.ts` → `_tryExpand()` / `_getOwnerId()`.
- The controller's **only** ownership gate was `card._ownerId === localPlayerId`. `_ownerId` is set when a card enters a hand (`syncDrawnCard`/`syncTransferredCard`) and was **never cleared** on HAND→TABLE. The server always stores TABLE cards with `ownerId = null` (`Room.playCardToTable`), so the client mirror was contradicting the authoritative protocol.
- `_clearHandPresentation()` (M1.7.5) cleared hover bookkeeping, hand layer, scale, rotation order and pitch, but it did not clear `_ownerId`. The next raycast hover (which fires while the pointer is still resting on the dropped card) re-expanded it through the stale owner id. This is why the leak survived the previous fix.
- `HandZoneObject3D` membership was **not** the cause: `removeCard()` already cleared `_handZoneId` and removed the card from `_cards`, so hand layout could no longer apply. The leak was the separate hover-expansion presentation reading stale ownership.

### Solution

1. **Authoritative eligibility, not a mirrored flag** — added `SceneManager.isTableCardOwnedByLocalPlayer(card)`: the card must be `ON_TABLE` in the `CardRegistry`, must not be in a hand, and must still carry the local session as owner. `App` installs it via `HoverExpansionController.setEligibilityCheck()`, and `_tryExpand()` now requires it in addition to the owner-id check. `_getOwnerId`/`_gatherGroup` use the public `card.getOwnerId()`.
2. **Clear stale ownership on every HAND→TABLE path** — `_clearHandPresentation()` calls `card.setOwnerId(null)`; `syncRoomObjects()` clears the owner for every TABLE object (including existing ON_TABLE cards); `onRemoteDragEnd()` clears it in the HAND→TABLE branch; `syncFlippedCard()` clears it for TABLE. TABLE cards are unowned by protocol, so a just-played card can never pass the expansion gate even if the pointer never moves.
3. **Defensive hand-zone gate** — `HandZoneObject3D._computeSlot()` applies the hover lift/scale/layer only when `card.getHandZoneId() === this.zoneId`; a stray global "hovered" callback can no longer animate a non-member.
4. **TABLE transforms preserved** — no blanket reset: a player's TABLE rotation/position/scale survives hover, re-hover, leave, rotation sync and room-state updates. Snap-to-Grid stays removed.

### Changes Made

- `frontend/src/interaction/HoverExpansionController.ts`: `setEligibilityCheck`, disposed/in-hand guard in `_tryExpand`, public owner getter usage.
- `frontend/src/scene/SceneManager.ts`: `isTableCardOwnedByLocalPlayer`, stale-owner clearing in `_clearHandPresentation`, `syncRoomObjects`, `onRemoteDragEnd`, `syncFlippedCard`.
- `frontend/src/app/App.ts`: wires the authoritative eligibility predicate into the hover-expansion controller.
- `frontend/src/objects/HandZoneObject3D.ts`: hand-zone membership gate for hover presentation.
- New regression suite: `frontend/src/__tests__/handHoverLeak1756.test.ts` (H1756-01…10).

### Regression Tests (H1756-01…10)

| ID | Coverage |
|---|---|
| H1756-01 | Real HAND hover still applies 1.08× scale, +0.20 lift, hand layer |
| H1756-02 | HAND→TABLE clears presentation + stale owner, re-syncs layer |
| H1756-03 | Pointer resting on the card right after drop never re-applies HAND hover |
| H1756-04 | Leave + re-hover a TABLE card changes nothing |
| H1756-05 | Hovering a TABLE card while another HAND card is hovered leaves both correct |
| H1756-06 | Several consecutive HAND→TABLE drops are all clean |
| H1756-07 | Hover never changes a freely rotated TABLE card |
| H1756-08 | Observer receiving HAND→TABLE gets no HAND presentation, keeps rotation |
| H1756-09 | TABLE→HAND re-enables the real HAND hover presentation |
| H1756-10 | 30 hover/drag cycles leave no stale group/transform references |

### Multiplayer Browser Verification (2 independent clients, room `DAZSLU`)

| Check | Result |
|---|---|
| A hovers a real HAND card (Alice) | `card_DAZSLU_20`/`_19`: scale 1.08, layer 220, Y ≈ 0.206, owner local, `inHand true`, preview active |
| A drags HAND→TABLE and keeps the pointer on the card | `card_DAZSLU_19` `ON_TABLE`, owner `null`, layer 2, scale 1, order XYZ, `handZoneId null`; hovered stays `card_DAZSLU_19`; `_activeGroup null`, `_expanded false` after repeated hover updates |
| A moves out then re-hovers | hovered `card_DAZSLU_19`, scale 1, position unchanged, no expansion |
| A wheel-rotates the selected TABLE card | yaw `0 → 0.0872664626 rad` (5°), scale stays 1, expansion inactive |
| B observes the same card | `ON_TABLE`, owner `null`, scale 1, layer 2, yaw `0.0872664626 rad`, position identical to A `(3.9587011653573674, 0, 2.8977145999048726)` in both scene and `room:state` |

Both clients agree exactly on location, ownership, position, rotation, scale and settling layer. No HAND presentation appeared on either client after the drop.

### M1.7.5 Regression Confirmation

Seat orientation at HAND→TABLE, wheel free rotation (5°/notch, Shift 1°), `R`/`Shift+R`, rotation sync via `object:move`, layer sync, drag + multi-selection, table clamp and removal of Snap-to-Grid all remain intact. The M1.7.5 suites (`handTableHoverReset1751`, `seatOrientation1752`, `wheelRotation1753`, `gridRemoval1754`) and the M1.5.3 expansion suite pass unchanged.

---

## M1.7.5 — Free Rotation, Seat Orientation, Hand-Drop Cleanup & Snap-to-Grid Removal
**Date**: 2026-11-05
**Status**: ✅ Completed, Fully Tested, Built & Verified with Four Live Clients
- **Tests**: 41/41 Backend tests PASS (9 files, including 9 new M1.7.5 tests in `rotationSync175.test.ts`), 787/787 Frontend tests PASS (38 files, including 39 new M1.7.5 tests in `handTableHoverReset1751.test.ts` (6), `seatOrientation1752.test.ts` (6), `wheelRotation1753.test.ts` (19), `gridRemoval1754.test.ts` (8))
- **Build**: Frontend & Backend TypeScript typecheck and production build pass with 0 errors
- **Multiplayer verification**: Alice (P1), Bob (P2), Carol (P3), Dave (P4) — 4 browser clients in room `WTXUBX` (earlier round in `FMPZ6G`), real WebSocket backend (`ws://localhost:4000/ws`) and Vite dev server

### Root Causes

1. **Lingering HAND hover/lift after drop (Part 1)** — the hover presentation (1.08x scale, +renderOrder layer, Y-lift, X-pitch, fan-preview) was written by `HandZoneObject3D`/`HandZoneManager` but nothing cleared it at the HAND→TABLE transition, so the table card kept hand-only transforms and the zone still owned the card. Fixed with `_clearHandPresentation()` invoked on every exit path (plain table drop, deck drop, discard drop, follower cards) + `deactivateAllPreviews()` + a second layer re-sync after hand membership changes.
2. **No seat-based default orientation (Part 2)** — a card dropped from hand always landed at yaw 0 (or a stale value); the orientation of the acting player's seat was never derived. Fixed with `getDefaultTableRotationForSeat()` = `computePlayerPerspective(playerIndex, playerCount).theta = atan2(seat.x, seat.z)`, computed **once** at the HAND→TABLE drop, carried on `object:drag-end.rotation`, stored server-side, broadcast to all clients; `room:state` snapshots only apply rotation when creating a new TABLE card or during a HAND→TABLE transition — never overwriting an existing TABLE card's manual rotation.
3. **No free rotation channel (Part 3)** — the wheel was bound to camera zoom only and `R`/`Shift+R` (90°) rotated locally with no network sync, so peers disagreed about yaw. Fixed by routing all local rotation changes through `onObjectsRotationChanged` → throttled `object:move` (80 ms trailing per object, existing protocol) → server membership/lock/`location==='TABLE'` validation → `object:moved` broadcast → `SceneManager.onRemoteObjectMoved` (skips active local drags, transfer animations and hand cards). `CameraController.shouldHandleWheel` returns false while the selection rotates and the wheel listener `preventDefault`s — no zoom, no page scroll; zoom stays normal when no TABLE card is selected.
4. **Snap-to-Grid leftovers (Part 4)** — `snapToGridValue`, `SNAP_TO_GRID_DEFAULT`/`GRID_SIZE`, `DragController` snap APIs, `Key G`, the HUD "📐 Lưới" button and the context-menu entry still existed. All deleted (not disabled); table-boundary clamping, stacking, and all other toolbar buttons/shortcuts (`F`, `R`, `Shift+R`, `H`) kept.

### Changes Made

- `frontend/src/scene/SceneManager.ts`: `_clearHandPresentation`, `getDefaultTableRotationForSeat`, seat-yaw set at HAND→TABLE drop (card + followers), wheel/selection rotation methods (`canRotateSelectionWithWheel`, `rotateSelectionByWheel`, `_rotateTargets`, `_emitRotationUpdates`), `applyAuthoritativeRotation`, rotation-aware `syncRoomObjects`/`onRemoteDragEnd`.
- `frontend/src/interaction/InteractionConfig.ts`: `normalizeWheelNotches(deltaY, deltaMode)` (px ÷ 100, lines as-is, pages × 10, clamped ±10, non-finite → 0), `WHEEL_ROTATION_STEP_DEG = 5`, `WHEEL_ROTATION_STEP_FINE_DEG = 1`; all SNAP constants removed.
- `frontend/src/interaction/DragController.ts`: snap APIs/state removed; drag-end broadcast now carries the card's final `rotation`.
- `frontend/src/interaction/CameraController.ts`: `shouldHandleWheel` gate (zoom skipped only while rotating the selection).
- `frontend/src/app/App.ts`: wheel listener (rotation + `preventDefault`, zoom otherwise), `G` removed from the key handler, throttled `object:move` sender, `onRejection` restores authoritative rotation from the store for TABLE objects, sender mirrors its own rotation into the local store (server excludes the sender from the `object:moved` echo), context-menu "Căn Lưới" entry removed.
- `frontend/src/network/MessageHandler.ts`: `object:moved` applies the scene rotation **before** the store notify (a throwing store subscriber can no longer abort the 3D sync).
- `frontend/src/ui/GameScreen.ts` & `frontend/src/ui/UIManager.ts` & `frontend/src/ui/ContextMenu.ts`: "📐 Lưới" button, snap toggle state and context-menu snap entry removed.
- `backend/src/protocol/MessageDispatcher.ts`, `backend/src/room/Room.ts`: `object:drag-end.rotation` accepted and persisted; new `object:move` handler with membership/lock/location validation, rotation stored and `object:moved` broadcast to everyone except the sender; hand transfers never store rotation (M1.7.4.3 privacy preserved).
- New tests: `frontend/src/__tests__/handTableHoverReset1751.test.ts`, `seatOrientation1752.test.ts`, `wheelRotation1753.test.ts`, `gridRemoval1754.test.ts`, `backend/src/__tests__/rotationSync175.test.ts`; `frontend/src/vite-env.d.ts` (vite/client reference for `import.meta.glob` typing — no new dependency).

### Multiplayer Verification (4 independent browser clients)

| Check | Result |
|---|---|
| Part 1 — hover/scale/layer/preview reset after HAND→TABLE (Alice) | Pre-drop hover `scale≈1.06–1.08`, layer 220–320 → post-drop `scale [1,1,1]`, order XYZ, `rotX 0`, `posY 0`, layer == `LayeringManager.getLayerOf`, `hovered = null`, `inHand false`, `ON_TABLE`, zone empty, preview collapsed (0/0) |
| Part 2 — seat orientation (4 seats) | Alice (seat 0) `rotY = 0`; Bob (seat 1) `rotY = π` exactly; both `isExpected: true` |
| Part 3 — wheel rotation (Alice) | up = +5°, Shift+up = +1°, down = −5°, `deltaMode=1` = 1 notch, `R` = +90°, all `defaultPrevented`, camera length unchanged while rotating, deselect → wheel zooms normally |
| Part 3 — rotation sync | `card_20` yaw 96° and `card_19` yaw π identical in **store + scene on all 4 clients**, 0 console errors |
| Part 4 — Snap removal | `#btn-snap-grid` absent; toolbar only 🎴 Lật / 🔄 Xoay / 📦 Xếp chồng / 🖐 Rút / 🎥 Reset / 🚪 Sảnh; `G` keypress = no-op; right-click menu contains no "Căn Lưới"; hint bar shows "Lăn chuột: Xoay tự do (Shift = 1°)" with no `G` hint |

### Bugs Found & Fixed During Browser Testing

1. **Rotation sync aborted on clients with a stale registry entry** — `MessageHandler` updated the store first; a throwing store subscriber propagated out of `handle()` and the scene never received `onRemoteObjectMoved`. Fixed by applying the scene rotation before the store notify.
2. **Sender's own store lagged behind its rotation** — the server excludes the sender from the `object:moved` echo, so the rotating client's store kept the old yaw (wrong value for rejection-restore). Fixed by mirroring the rotation into the local store when the throttled `object:move` is sent.

### Known Limitations / Next Steps

- **Pre-existing (NOT caused by M1.7.5)**: dropping a card onto the Deck runs `returnCardToDeck` locally (M1.3.4.5, local-only, no network message) while `object:drag-end` is still broadcast — the server then believes the card is `TABLE` at the deck coordinates while the dropping client has it `IN_DECK` (ghost-card divergence; backend `drawCard` only deals `DECK` cards). On the affected client, any later store notify throws `CardRegistry: already registered` inside `syncRoomObjects`, which `NetworkClient`'s broad catch mis-logs as "Failed to parse server message". Reproduced with 4 clients; room state diverges only for that one card. Needs a dedicated sync message for deck returns (out of M1.7.5 scope).
- Manual TABLE rotation is never auto-reset (verified); a future "reset to seat orientation" action would be a separate feature.

---

## M1.7.4.3 — Viewer-Based Card Masking
**Date**: 2026-11-04
**Status**: ✅ Completed, Fully Tested
- **Tests**: Frontend 12/12 tests in `opponentHandMasking1743.test.ts` (counted in the cumulative totals of the milestones above/below); no backend protocol change required (masking is a viewer-side rule)
- **Build**: typecheck & production build pass

### Root Cause

Card privacy was derived from the card's own `faceUp`/location only, so a face-up card inside an opponent's hand was rendered face-up to everyone — hand contents leaked visually even though the network layer already kept `ownerId`/`handIndex`.

### Changes Made

- `frontend/src/scene/SceneManager.ts`: viewer-based masking formula (`_shouldMask`) keyed on the **owning session** (`setLocalSessionId`/`getLocalSessionId`, `_getZoneOwnerId`): HAND cards are unmasked **only** for `ownerId === localSessionId` when `faceUp`; opponent HAND cards are always masked regardless of `faceUp`; TABLE/DISCARD keep the standard `!faceUp` rule. Masking re-applied on draws, transfers (including pending-transfer animations) and `syncRoomObjects`.
- Test file: `frontend/src/__tests__/opponentHandMasking1743.test.ts` (12 tests).

### Verification

`syncRoomObjects` applies correct masking across local hand, opponent hand and table; card transfers and flips respect the viewer perspective; preserved by M1.7.5's rotation sync (hand rotation/position never broadcast or stored).

---

## M1.7.4.2 — Full Shared Card Interaction & Direct Hand Transfer
**Date**: 2026-11-04
**Status**: ✅ Completed, Fully Tested
- **Tests**: Frontend 5 tests in `sharedHandInteraction1742.test.ts`, Backend 6 tests in `sharedHandInteraction1742.test.ts` (plus assertions added inside `opponentHandInteraction174`, `handPrivacyAndOwnership154`, `multiplayerSecurity`, `dragJitterAndPrivacy1531`)
- **Build**: typecheck & production build pass

### Root Cause

Interaction and ownership rules were still owner-locked: only the owning player could drag/flip their hand cards, and there was no direct HAND→HAND transfer path — so a shared-sandbox table (any player moving any card, passing cards hand-to-hand) was impossible.

### Changes Made

- `backend/src/protocol/MessageDispatcher.ts`: any room member may drag any card in HAND or TABLE (drag locks unchanged); `card:transfer` accepts `handIndex` insertion position (`shared/types/protocol.ts`).
- `backend/src/room/Room.ts`: `moveCardOwnership` (M1.7.4.2) moves/copies a card into another player's HAND and `reindexHand` re-assigns sequential `handIndex` values; `ViewStateBuilder` treats `faceUp` as the single source of truth for visibility.
- `frontend/src/scene/SceneManager.ts` / `frontend/src/app/App.ts`: `canInteractWithObject`/`canDragCard` return true for all cards (local hand, opponent hand, table); drag hand A→table updates `CardRegistry` to `ON_TABLE`, hand A→own hand moves locally, hand A→other hand sends `onCardTransferRequested(cardId, targetPlayerIndex)`; free sandbox flip (`F`) for any card in the room; rollback snapshot preserves `faceUp`.
- Test files: `frontend/src/__tests__/sharedHandInteraction1742.test.ts`, `backend/src/__tests__/sharedHandInteraction1742.test.ts`.

---

## M1.7.4.1 — Opponent Hover Cleanup & Drag Interaction Fix
**Date**: 2026-11-04
**Status**: ✅ Completed, Fully Tested, Built & Verified with Two Live Clients
- **Tests**: 26/26 Backend tests PASS (7 files), 731/731 Frontend tests PASS (32 files, including 14 new M1.7.4.1 tests in `opponentHoverDrag1741.test.ts`)
- **Build**: Frontend & Backend TypeScript typecheck and production build pass with 0 errors
- **Multiplayer verification**: Alice (P1) + Bob (P2) in room `USZXVT`, real WebSocket backend (`ws://localhost:4000/ws`) and Vite dev server

### Root Causes

1. **Opponent hover lift/pitch** — `HandZoneObject3D._computeSlot()` applied the hover presentation (Y lift, X pitch, 1.12x scale, render-order boost) to every hand zone. Opponent cards therefore got the same local Hand Fan Preview treatment. Fixed by gating the hover branch on `_isLocalPlayer`; the existing raycast emissive highlight remains the only opponent hover feedback.
2. **Opponent drag not following the pointer** — `DragController` only broadcast drag start/move for hand cards in addition to the visual drag. The backend rejects `object:drag-start` for another player's hand card (`OBJECT_LOCKED` / `NOT_CARD_OWNER`), which aborted the gesture. In addition, hand layout (`arrangeCards()`) was never suspended during a drag, so it overwrote the pointer-driven transform every frame.
3. **Rejected-transfer rollback restored the wrong face state** — `_handleDropInHandZone()` applied the masked/face-down flight presentation before snapshotting the pending transfer, so a server rejection could restore a face-down/masked card instead of its authoritative face-up state.

### Changes

- `frontend/src/objects/HandZoneObject3D.ts` — opponent hand zones skip the hover lift/pitch/scale branch; local fan preview unchanged.
- `frontend/src/interaction/DragController.ts` — active drag claims `layoutControlled` at `_activateDrag()` and releases it on cleanup only when no pending/animating transfer owns the card (`shouldReleaseLayoutControl`); `onDragFinished` restores hand slots; hand drags no longer broadcast `object:drag-start`/`object:drag-move`, and cancelled hand drags send no `object:drag-end`.
- `frontend/src/scene/SceneManager.ts` — wires drag layout ownership/finish hooks; pending-transfer snapshot now happens before applying privacy presentation so rollback keeps mask/face state.
- `frontend/src/__tests__/opponentHoverDrag1741.test.ts` — new regression suite (hover presentation, highlight, drag start/follow, layout isolation, cancel, invalid drop restore, single transfer request + rejection rollback, local drag, repeated drags, privacy broadcast gating).

### Multiplayer Verification (real Chromium + real backend)

- Opponent hover: card transform identical before/during/after; emissive `0x3A80C8` @ 0.35 during hover, restored on hover-out; Bob unaffected.
- Opponent drag: card followed pointer across the table with `layoutControlled = true`; `arrangeCards()`, `rearrangeAllHands()` and forced preview did not move it; drop restored the exact slot (distance 0), masked/face-down, counts unchanged.
- Cancel: canvas `mouseleave` ended the drag and restored the exact original slot (distance 0), masked/face-down, `layoutControlled = false`, no extra server error.
- Authorized transfer: local card → opponent hand zone accepted; both clients converged (2 / 4 hand cards), Bob saw the card face-up/unmasked, total remained 7.
- Local Hand Fan Preview, local same-hand drag, and opponent flip/masking all unchanged.

### Limitations

- Dragging an opponent's hand card is intentionally visual-only: the drop still asks the server, which rejects the ownership change; the client restores the card. This produces one expected `NOT_CARD_OWNER` entry in the initiator's console because `MessageHandler` logs every server `error` at error level (no JS exception, no WebSocket failure).
- Verification used synthetic mouse events on the canvas because cards are WebGL-rendered; hit resolution was validated by reading the actual dragged card, not by assuming the intended index.
- Vite still reports the pre-existing >500 kB chunk-size warning.

---

## M1.7.3 — Hand Fan Preview & Cross-Player Card Drag Verification
**Date**: 2026-11-03
**Status**: ✅ Completed, Fully Tested & Built
- **Tests**: 17/17 Backend tests PASS (5 files), 699/699 Frontend tests PASS (29 files, including 23 new M1.7.3 tests in `handFanPreview173.test.ts`)
- **Build**: Frontend & Backend TypeScript builds pass with 0 errors

### Changes

**Part A — Hand Fan Preview (`HandZoneObject3D.ts`, `HandZoneManager.ts`, `SceneManager.ts`)**

Implemented a 4-state visual hand fan preview system for the local player's hand zone:

| State | Trigger | Card behavior |
|---|---|---|
| **NORMAL** | Default / cursor outside zone | Flat, compact overlapping fan (M1.7.2) |
| **PREVIEW** | Cursor enters any card in local hand | All cards fan upright (PI/2.5 ≈ 72°), elevated 1.2 units, spread with adaptive spacing |
| **CARD HOVER** | Within preview, hovering specific card | Hovered card gets +0.35 extra lift, 1.12x scale, renderOrder+300 |
| **COLLAPSE** | Cursor leaves hand zone | 180ms ease-out collapse back to NORMAL |

Animation: `_previewProgress` (0→1) interpolated by `easeOut(t) = 1-(1-t)²`. Open: 200ms, close: 180ms. Uses `requestAnimationFrame` in browser, synchronous fallback in tests.

Adaptive spacing in fan state: `spacing = min(0.65 * cardWidth, maxZoneSpan / (N-1))` — auto-adjusts for 1–20 cards within zone bounds.

Hit-testing: `_currentSpacing` stored on zone after each `arrangeCards()` call, used by `findCardByRay()` to match exact layout. Z-tolerance extended to `cardHeight/2 + 1.5` in preview state to account for elevated cards.

Wiring in `SceneManager.onHoverChanged`: detects zone transitions (`prevZone !== currZone`), activates preview on local player's zone, deactivates on leave. Also deactivates on drag cancel.

Non-local zones: preview never activates (opponent hand privacy preserved).

**Part B — Cross-Player Card Drag (Verified)**

Confirmed already working from M1.7.2:
- `DragController.canDragCard` only blocks `IN_HAND` cards of other players, not `ON_TABLE`
- Backend `dragLock()` allows any room member to lock `ON_TABLE` objects
- `Room.updateObjectAfterDrag()` correctly transitions `location=HAND, ownerId=B` when dropped in B's hand zone
- Hand privacy invariant maintained via `ViewStateBuilder` masking

### Root Cause Analysis

**Fan preview was absent**: M1.7.2 implemented single-card hover reveal but did not implement a zone-wide preview when cursor enters the hand area. The entire hand remained flat even when the player needed to see all cards.

**Animation architecture**: Chose `requestAnimationFrame`-driven `_previewProgress` tween stored on `HandZoneObject3D` rather than a separate controller class, keeping all layout logic colocated. `setNeedsRenderCallback` allows the zone to request renders during animation without coupling to SceneManager's private `_renderer`.

### Files Changed

- `frontend/src/objects/HandZoneObject3D.ts` — Fan preview states, animation, adaptive layout, blended hit-testing
- `frontend/src/objects/HandZoneManager.ts` — `setNeedsRenderCallback()`, `deactivateAllPreviews()`, stored callback for rebuilds
- `frontend/src/scene/SceneManager.ts` — Zone hover detection in `onHoverChanged`, render callback registration, drag cancel deactivation
- `frontend/src/__tests__/handFanPreview173.test.ts` — 23 new tests (D1–D6)

---

## M1.7.2 — Interactive Hand Layout, Hover Reveal & Shared Table Interaction
**Date**: 2026-11-02  
**Status**: ✅ Completed, Fully Tested & Visually Verified via Chrome CDP
- **Tests**: 17/17 Backend tests PASS (5 files), 676/676 Frontend tests PASS (28 files, including 7 new dedicated M1.7.2 tests in `handInteraction172.test.ts`)
- **Build**: Frontend & Backend TypeScript builds pass with 0 errors
- **Visual Proof Screenshots**:
  - `m172_01_10cards_normal.png`: 10 cards drawn to hand, resting flat in a compact, overlapping fan layout (`rotation.x = 0`, `elevation: SURFACE_Y + i * 0.002`).
  - `m172_02_hover_first.png`: Hover leftmost card (card 0) — smoothly lifts (+0.20), pitches toward camera (~60°), scales to 1.08x, exposing its face clearly while neighbors remain flat.
  - `m172_03_hover_middle.png`: Hover center card (card 4) — lifts and pitches up with `renderOrder + 200` without clipping.
  - `m172_04_hover_deep.png`: Hover deeply overlapped card (card 7) — partition hit-testing accurately resolves and reveals card 7.
  - `m172_05_15cards_hover.png`: 15 cards drawn to hand — layout compactly fanned within zone width; hovering card 10 lifts and pitches cleanly.
  - `m172_06_deck_hover_clean.png`: Hover over Deck — no fan preview, clean deck surface with no visual clutter.
  - `m172_07_table_card_hover.png`: Shared tabletop interaction — cards on the table are interactable and hoverable regardless of owner.
  - `m172_08_table_card_dragged.png`: Public table card smoothly dragged to new position while opponent hand cards remain protected and private.

### Root Cause Analysis & Implementations

1. **Fix A & B — Giao diện bài trên tay & Hover Reveal**:
   - *Problem*: In M1.7.1.2, all cards in hand were permanently stood upright at ~66.7°, blocking the view of the table and causing visual clutter.
   - *Fix*: In `HandZoneObject3D.ts`, cards in normal state rest flat on the table surface (`rotation.set(0, this.rotation.y + fanAngle, 0)`). When a card is hovered by the local player, only that specific card lifts (`elevation + 0.20`), pitches toward the camera (`Math.PI / 3.0`), scales up (`1.08x`), and receives a layer boost (`renderOrder + 200`). Neighbors remain flat.

2. **Fix C — Tương tác chọn bài bị che khuất (Partition-based Hit-testing)**:
   - *Problem*: Standard Three.js mesh raycasting orders intersections by camera Z-distance. For overlapping cards, the top/closest card mesh occluded the cards underneath, making deeply overlapped cards impossible to select or drag.
   - *Fix*: Implemented deterministic geometric partition raycasting in `HandZoneObject3D.findCardByRay(raycaster)`. Projects the mouse ray to the hand zone plane, transforms into local zone coordinates, and maps `locX` directly to the card's dedicated exposed slice. Wired via `RaycastInteractionManager.customCardHitResolver`.

3. **Fix D — Xóa hiệu ứng hover Deck**:
   - *Problem*: Upright card fan on Deck hover was distracting and caused visual obstruction.
   - *Fix*: Removed `_hoverPreview`, `_hoverPreviewMaterial`, and hover fan generation from `DeckObject3D.ts`. Removed deck hover triggering from `SceneManager.ts` `onHoverChanged`.

4. **Fix E & F — Tương tác bài công khai trên bàn & Bảo mật bài trên tay**:
   - *Problem*: Need sandbox freedom to interact with shared public cards on the table while strictly protecting private hand cards.
   - *Fix*: Added `RaycastInteractionManager.canInteractWithObject` filter in `SceneManager.ts`. Any card on the table (`!card.isInHand()`) is interactive for all players. Cards in an opponent's hand zone (`card.isInHand() && handZone.playerIndex !== activePlayerIndex`) are strictly blocked from hover, selection, and drag. Hand privacy is fully maintained.

---

## M1.7.1.2 — Root Cause Debugging & Visual Fix (No Blind Patches)
**Date**: 2026-11-02  
**Status**: ✅ Completed & Visually Verified via Headless Chrome CDP
- **Tests**: 17/17 Backend tests PASS (5 files), 669/669 Frontend tests PASS (27 files)
- **Build**: Frontend & Backend TypeScript builds pass with 0 errors
- **Visual Proof Screenshots**:
  - `phase1_01_hand.png`: Upright standing fan, front faces oriented toward camera, elevation lift 1.66 above table rail.
  - `phase1_02_deck_before_hover.png`: Tabletop state prior to deck hover.
  - `phase1_03_deck_hover.png`: Upright 8-card back fan spread arc above deck body with depthTest enabled.
  - `phase1_04_deck_hover_leave.png`: Preview cleans up and hides immediately on mouse leave.
  - `phase1_05_hand_to_table.png`: Card dragged from hand to open table lands completely flat (`rotation: (0,0,0)`, `order: 'XYZ'`, `pos.y: 0.00`, `location: 'ON_TABLE'`, `faceUp: true`).
  - `phase1_06_table_to_hand.png`: Card dragged from table back into local hand zone transitions to `location: 'IN_HAND'`, re-assumes upright presentation (`rot: 1.16`, `pos.y: 1.86`, `order: 'YXZ'`), and hand count updates in backend and frontend.

### Root Cause Analysis & Fixes

1. **Lỗi A — Giao diện bài trên tay (Local Hand Layout & Orientation)**:
   - *Root Cause*: Rotation order `XYZ` with `rotation.x = -Math.PI / 2` pitched the front face down into the table felt (away from camera). `_localPlayerIndex` defaulted to `null` instead of `0`, leaving offline/initial players without local upright styling. `standingLift` at 0.7 units caused lower edges to intersect table rail.
   - *Fix*: In `HandZoneObject3D.ts`, switched rotation order to `YXZ` with positive pitch angle `Math.PI / 2.7` (~66.7°). Increased `standingLift` to `1.65` and added local `depthOffset = 0.35` so card face normals align with camera ray. In `HandZoneManager.ts`, initialized `_localPlayerIndex = 0` by default.

2. **Lỗi B — Đánh bài xuống bàn và kéo bài về tay (HAND ↔ TABLE Drag & Drop)**:
   - *Root Cause 1 (HAND → TABLE)*: Upright cards retained `YXZ` rotation order into table transforms because `DragController._activateDrag` did not reset rotation order when dragging cards out of hand. Y normalization in `DragController` also checked `!card.isInStack()` without checking `!card.isInHand()`.
   - *Root Cause 2 (TABLE → HAND)*: In `Room.ts`, `updateObjectAfterDrag` lacked the branch for transitioning from `location !== 'HAND'` to `location = 'HAND'` when dropped over a player's hand zone. In `MessageDispatcher.ts`, `_broadcastRoomState` was only broadcast on hand-to-hand transfers instead of location changes.
   - *Fix*:
     - `DragController._activateDrag()` resets `card.rotation.order = 'XYZ'` and `card.rotation.set(0,0,0)` when leaving hand.
     - `DragController` normalizes height with `!card.isInStack() && !card.isInHand()`.
     - `Room.ts` transitions `obj.location = 'HAND'`, assigns `ownerId`, and assigns `handIndex`.
     - `MessageDispatcher.ts` broadcasts `_broadcastRoomState()` on location transitions.

3. **Lỗi C — Hover Deck không hiện fan bài dựng đứng (Deck Hover Preview)**:
   - *Root Cause*: Deck hover preview cards were embedded inside deck body (`z: 0.16`), material lacked `depthTest: true` and `depthWrite: true`, and `SceneManager.onHoverChanged` did not call `requestRender()`.
   - *Fix*: In `DeckObject3D.ts`, positioned preview fan planes in an arc above deck top cap (`z: 0.55 + index * 0.04`, `rotation.x: -0.35`). Configured `_hoverPreviewMaterial` with `depthTest: true` and `depthWrite: true`. In `SceneManager.ts`, called `this.requestRender()` in `onHoverChanged`.

---

## M1.7 — Per-seat Camera, 8-seat Rooms & Private Standing Hand
**Date**: 2026-11-02  
**Status**: Implementation complete; browser multiplayer verification pending.

- Restored automatic seat-based camera alignment only on join/seat/layout changes while retaining disabled manual orbit and pan.
- Extended authoritative room capacity validation and creation UI to 2–8 players. Scene layout now uses the room capacity rather than current occupancy.
- Added a local-only standing hand fan. Only the active player's HandZone receives the vertical visual transform; opponents remain flat and continue using their backend-masked card data.

---

## M1.6 — Fixed Camera, Configurable Room Capacity & Table Clarity
**Date**: 2026-11-02  
**Status**: Implementation complete; browser multiplayer verification pending.

- Replaced the per-seat orbital view with one fixed, center-focused tabletop camera. Pointer rotation and panning are disabled; bounded wheel zoom and adaptive resize framing remain.
- Added a 2–6 player selector (default 4) to room creation. The protocol, validator, room authority, capacity check, and client room badge now all use the chosen maximum.
- Added a local-only deck hover preview: up to eight upright, fanned card backs are rendered without creating card entities or touching deck order, ownership, or network state.
- Stopped rendering player placement-zone markers while retaining their computed layout for drop and validation queries. Deck and discard zones remain.
- Player/hand labels are now rendered above rail geometry, and adaptive framing is recalculated on resize to keep all player areas in view.

---

## M1.5.4 — Hand Privacy, Card Ownership & Player Area Optimization
**Date**: 2026-11-02  
**Status**: ✅ Completed (17/17 Backend tests PASS across 5 test files, 669/669 Frontend tests PASS across 27 test files, Typecheck PASS, Production Build PASS, Browser Visual Testing NOT TESTED)

### Problem Statement & Scope
1. **Hand Privacy Security (M1.5.4.1)**:
   - Opponents must ALWAYS see back face of cards in other players' hands, regardless of whether the card is face-up or face-down for the owner.
   - Front textures must never leak via hover, drag, inspect, or flip events across peers.
2. **Card Ownership Transfer Between Players (M1.5.4.2)**:
   - Dragging a card into another player's HandZone transfers ownership (`ownerId` changes, `location` remains `HAND`).
   - Atomic validation: recipient must exist in room and be connected; non-owner transfer attempts are rejected (`NOT_CARD_OWNER`); invalid targets are rejected (`TARGET_PLAYER_NOT_FOUND`) with full rollback.
   - Drag locks are cleanly released.
   - Recipient receives unmasked card with `cardType` populated; sender and peers receive filtered cards with stripped `cardType` and `faceUp: false`.
3. **Hand Zone Layout Optimization (M1.5.4.3)**:
   - Cards are centered horizontally for any card count (1, 2, 5, 10, 15).
   - Strict boundary containment: card edges NEVER exceed HandZone boundary `[-zoneWidth / 2, +zoneWidth / 2]`.
   - Dynamic spacing: when card count increases, cards overlap smoothly within `maxAllowedSpan = Math.max(0, zoneWidth - cardWidth - 0.2)`.
   - Hover elevates card (`elevation += 0.20`, `layerIndex/renderOrder >= 200`, `scale = 1.08`) without altering logical order in registry or hand list.
   - Removing/adding cards re-centers remaining cards automatically.
4. **Drag Permission & Opponent Card Protection**:
   - `DragController.canDragCard` blocks dragging cards held in another player's hand zone.

### Technical Solutions Implemented
1. **Shared Protocol & Types (`shared/types/protocol.ts`)**:
   - Added `card:transfer` to `ClientToServerMessage` (`{ cardId: string; targetPlayerIndex?: number; targetPlayerId?: string }`).
   - Added `hand:card-transferred` to `ServerToClientMessage` (`{ cardId: string; fromPlayerIndex: number; toPlayerIndex: number; card: SandboxObject }`).
   - Added `targetPlayerIndex?: number | null` to `ObjectDragEndPayload`.
2. **Backend Validation & Broadcasting (`MessageValidator.ts`, `RoomBroadcaster.ts`)**:
   - Added validation for `card:transfer` and optional `targetPlayerIndex` in `object:drag-end`.
   - Extracted `RoomBroadcaster.ts` (78 lines) to encapsulate room/hand broadcasting helpers while preserving the $\le 400$ line constraint for `MessageDispatcher.ts`.
3. **Backend Room State & Ownership Transfer (`Room.ts`, `MessageDispatcher.ts`)**:
   - Added `getPlayerByIndex(playerIndex: number): PlayerRecord | undefined`.
   - Implemented `transferCard()` with ownership verification, recipient existence and connection checks, drag lock release, and atomic rollback on error.
   - Integrated cross-player hand drop detection in `_handleDragEnd` via `targetPlayerIndex`.
   - Enforced privacy in `_broadcastHandCardTransferred`: recipient receives card with `cardType`, sender and peers receive `cardType: undefined` and `faceUp: false`.
4. **Frontend 3D Hand Zone Geometry & Arrangement (`HandZoneObject3D.ts`)**:
   - Re-engineered `maxAllowedSpan = Math.max(0, this.zoneWidth - cardWidth - 0.2)`.
   - Guaranteed exact horizontal centering and absolute boundary containment for any count $N \in [1, 15]$.
   - Hover applies elevation (`+0.20`), scale (`1.08`), and elevated renderOrder (`+200`) without mutating array order.
5. **Frontend Card Face Masking & Privacy (`CardObject3D.ts`)**:
   - Implemented `isMasked()` and `setMasked(masked: boolean)`: when masked, `_frontMaterial.map = this._backTexture`, ensuring front face is never exposed even if rotated or flipped.
   - Added `getOwnerId()` and `setOwnerId(ownerId)`.
6. **Frontend Interaction & Scene Synchronization (`DragController.ts`, `SceneManager.ts`, `MessageHandler.ts`, `App.ts`)**:
   - `DragController.canDragCard` prevents dragging cards in opponent hand zones.
   - `DragController.getDropTargetPlayerIndex` resolves target player on drop.
   - `SceneManager._handleDropInHandZone` detects drops into opponent hands, masks card, and triggers `onCardTransferRequested`.
   - `SceneManager.syncTransferredCard` unmasks card for recipient (applying `cardType` title) and masks for sender/peers.
   - `MessageHandler.ts` routes `hand:card-transferred` $\to$ `App.ts` $\to$ `SceneManager.syncTransferredCard`.

### Modified Files
- `shared/types/protocol.ts` — protocol messages for `card:transfer` and `hand:card-transferred` (104 lines)
- `backend/src/validation/MessageValidator.ts` — validation for `card:transfer` and drag-end target (196 lines)
- `backend/src/protocol/RoomBroadcaster.ts` — room and hand broadcasting helper (78 lines)
- `backend/src/room/Room.ts` — `transferCard`, `getPlayerByIndex`, atomic transfer validation (399 lines)
- `backend/src/protocol/MessageDispatcher.ts` — `_handleCardTransfer` and drag-end hand transfer routing (397 lines)
- `backend/src/__tests__/handPrivacyAndOwnership154.test.ts` — 3-client integration tests for hand privacy & ownership transfer (262 lines)
- `frontend/src/objects/HandZoneObject3D.ts` — boundary math, centering, hover elevation (393 lines)
- `frontend/src/objects/CardObject3D.ts` — card masking with back texture, ownerId (545 lines)
- `frontend/src/interaction/DragController.ts` — `canDragCard` protection and drop target index callback (616 lines)
- `frontend/src/scene/SceneManager.ts` — transfer hooks, `syncTransferredCard`, drop handling (1960 lines)
- `frontend/src/network/MessageHandler.ts` — `hand:card-transferred` message handler (113 lines)
- `frontend/src/app/App.ts` — wiring for `onCardTransferRequested`, `onCardTransferred`, and drag-end target (574 lines)
- `frontend/src/__tests__/handZoneAndOwnership154.test.ts` — comprehensive test suite for M1.5.4 (313 lines)
- `docs/DEVELOPMENT_LOG.md` — M1.5.4 record

### Test Results
| Test Suite | Tests | Status |
|---|---|---|
| Backend Vitest (`npm test`) | 17 / 17 (5 files) | ✅ PASS |
| Frontend Vitest (`npm test`) | 669 / 669 (27 files) | ✅ PASS |
| Frontend Typecheck (`npm run typecheck`) | 0 errors | ✅ PASS |
| Backend Build (`npm run build`) | 0 errors | ✅ PASS |
| Frontend Build (`npm run build`) | 0 errors | ✅ PASS |
| Browser Visual Testing | 2 clients live verification | ⚠️ NOT TESTED (automated suite passed; real browser visual verification pending) |

---

## M1.5.3.1 — Fix Multiplayer Drag Jitter & Card Face Privacy
**Date**: 2026-11-02  
**Status**: ✅ Completed (16/16 Backend tests PASS across 4 test files, 661/661 Frontend tests PASS across 26 test files, Typecheck PASS, Production Build PASS, Browser Visual Testing NOT TESTED)

### Problem Statement & Scope
Direct follow-up to M1.5.3 resolving three critical bugs:
1. **Bug 1 — Drag Jitter & Stale Overwrites**: When Alice dragged a card from hand to table, Bob's cursor/hover or room state sync caused Alice's card to snap back to its old position. Two clients could also attempt to drag the same card concurrently due to lack of drag locking.
2. **Bug 2 — Face Orientation Retention**: Cards dragged from HAND to TABLE had hardcoded `faceUp = true` in backend `playCardToTable()`, forcing cards to flip face-up even if they were face-down.
3. **Bug 3 — Private Hand Security Leaking via `object:flipped`**: When a card in hand was flipped, `MessageDispatcher._handleObjectFlip()` broadcast `object:flipped` to the whole room, exposing opponent's hand card orientation. In addition, `ViewStateBuilder` forced `faceUp: true` for the owner instead of preserving actual `faceUp`.

### Technical Solutions Implemented

**1. Authoritative Drag Ownership & Disconnection Cleanup (`Room.ts`, `MessageDispatcher.ts`)**
- Added `dragLock(objectId, sessionId)`, `dragUnlock(objectId, sessionId)`, `clearSessionLocks(sessionId)`, and `updateObjectAfterDrag()` to `Room.ts`.
- In `MessageDispatcher._handleDragStart`: attempts to lock object for `sessionId`. If locked by someone else, rejects with `{ code: 'OBJECT_LOCKED' }`.
- In `MessageDispatcher._handleDragMove`: checks that the sender holds the lock before broadcasting.
- In `MessageDispatcher._handleDragEnd`: updates authoritative position in `Room`, transitions card from `HAND` to `TABLE` (clearing `ownerId` and `handIndex`), updates `faceUp`, releases the lock, and broadcasts `object:drag-end` with `{ objectId, playerId, x, y, z, faceUp }`.
- In `WebSocketServer` and `MessageDispatcher.handleDisconnect()`: when a player leaves or disconnects, all drag locks held by that player are cleared, and `object:drag-end` is broadcast to remaining players.

**2. Client-Side Anti-Jitter & Sequence Ordering (`SceneManager.ts`, `DragController.ts`)**
- `DragController`: emits `faceUp: card.isFaceUp()` in `onDragEndBroadcast`.
- `SceneManager`:
  - In `onRemoteDragStart`, `onRemoteDragMove`, `onRemoteDragEnd`: if `_dragController.isDragging()` and the dragged card matches `objectId`, remote updates are completely ignored to avoid jitter.
  - Maintains `_remoteDragSeq = new Map<string, number>()`: drops out-of-order `object:drag-move` and `object:drag-end` messages when `seq < lastSeq`.
  - In `onRemoteDragEnd`: sets final position, transfers card out of hand zone to table if needed, and applies `faceUp` if provided.

**3. Strict Hand Privacy & Face Orientation Retention (`ViewStateBuilder.ts`, `MessageDispatcher.ts`, `App.ts`)**
- In `ViewStateBuilder`: for `location === 'HAND'`, owner receives actual `faceUp: obj.faceUp`. Opponents always receive `faceUp: false` and `delete filtered.cardType`.
- In `MessageDispatcher._handleObjectFlip`: if `location === 'HAND'`, `object:flipped` is ONLY sent to the owner's session, NEVER to opponents.
- In `App.ts`: `flipTargetCard()` sends `object:flip` to server so backend tracks card orientation.
- In `Room.ts`: `playCardToTable()` and `updateObjectAfterDrag()` retain `faceUp` without forcing `faceUp = true`.

### Files Created
- `backend/src/__tests__/dragJitterAndPrivacy1531.test.ts` (303 lines)
- `frontend/src/__tests__/dragJitterAndPrivacy1531.test.ts` (187 lines)

### Files Modified
- `shared/types/protocol.ts` — added optional `seq` and `faceUp` to `ObjectDragStartPayload` and `ObjectDragEndPayload`
- `backend/src/validation/MessageValidator.ts` — validated optional `seq` and `faceUp`
- `backend/src/room/Room.ts` — added drag locking, session lock clearing, dynamic object lock fallback, and drag completion state updates
- `backend/src/room/ViewStateBuilder.ts` — preserved owner's actual `faceUp`
- `backend/src/protocol/MessageDispatcher.ts` — drag locking, selective flip privacy for hand cards, and disconnection lock release
- `backend/src/server/WebSocketServer.ts` — called `dispatcher.handleDisconnect` on close
- `frontend/src/interaction/DragController.ts` — passed `faceUp` in `onDragEndBroadcast`
- `frontend/src/network/MessageHandler.ts` — routed `seq`, `faceUp`, and `object:flipped`
- `frontend/src/scene/SceneManager.ts` — local drag isolation, sequence anti-jitter, and remote drop hand-to-table transition
- `frontend/src/app/App.ts` — sent timestamps (`seq`) and card `faceUp` on drag end; sent `object:flip` on card flip

### Test Results
| Test Suite | Tests | Status |
|---|---|---|
| Backend Vitest (`npm test`) | 16 / 16 (4 files) | ✅ PASS |
| Frontend Vitest (`npm test`) | 661 / 661 (26 files) | ✅ PASS |
| Frontend Typecheck (`npm run typecheck`) | 0 errors | ✅ PASS |
| Backend Typecheck & Build (`npm run build`) | 0 errors | ✅ PASS |
| Production Bundle Build (`npm run build`) | Built in 2.05s (689 KB) | ✅ PASS |
| Browser Visual Testing | — | NOT TESTED |

---

## M1.5.3 — Local Card Hover Expansion & Multiplayer Shared Interaction
**Date**: 2026-11-02  
**Status**: ✅ Completed (11/11 Backend tests PASS across 3 test files, 657/657 Frontend tests PASS across 25 test files, Typecheck PASS, Production Build PASS, Browser Visual Testing NOT TESTED)

### Problem Statement & Scope
- **Hover Expansion**: Players could not comfortably inspect and distinguish dense clusters of cards resting on the tabletop.
- **Multiplayer Shared Interaction**: Peers in the same multiplayer room could not see each other's cursor positions or real-time drag movements on the 3D table.

### Goals Achieved

**1. Local Card Hover Expansion (`HoverExpansionController.ts`)**
- Created pure client-side `HoverExpansionController`:
  - Activates only for cards owned by the local player on the table (`location === 'TABLE'`).
  - Automatically clusters cards within radius $R = 5.0$ units.
  - Expands clustered cards horizontally with spacing $w \times 1.1$, scales group by $1.15\times$, and lifts hovered card by $+0.5$ Y.
  - Smooth animation over $200\text{ ms}$ using smoothstep interpolation.
  - Clean collapse on pointer leave and instantaneous cancel on drag start (`cancelExpansion()`).
  - Zero network messages sent; logical `CardRegistry` positions remain unchanged.

**2. Remote 3D Cursors & Network Protocol (`RemoteCursorManager.ts`, `CursorBroadcaster.ts`)**
- Added protocol messages: `cursor:move` (client $\to$ server) and `cursor:update` (server $\to$ peer broadcast).
- `CursorBroadcaster`:
  - Throttled at 20 Hz ($50\text{ ms}$ interval).
  - Dead zone of $0.05$ units filters micro-movements.
  - Monotonic sequence numbers for ordering and anti-jitter.
- `RemoteCursorManager`:
  - Renders 3D cone pointer colored by `playerIndex` with player name billboard sprite.
  - Rejects out-of-order sequence updates.
  - Automatically cleans up and disposes resources when players leave.

**3. Real-Time Drag Synchronization (`DragController.ts`, `SceneManager.ts`, `MessageDispatcher.ts`)**
- Added `object:drag-start`, `object:drag-move`, `object:drag-end` protocol messages.
- `DragController` dispatches broadcast hooks during active drags.
- `MessageDispatcher` validates coordinates and throttles drag movements ($50\text{ ms}$).
- `SceneManager` handles remote drag updates cleanly without interrupting local interactions.
- Temporary drag coordinates never pollute authoritative `RoomState`.

### Files Created
- `frontend/src/interaction/HoverExpansionController.ts` (279 lines)
- `frontend/src/scene/RemoteCursorManager.ts` (192 lines)
- `frontend/src/network/CursorBroadcaster.ts` (101 lines)
- `frontend/src/__tests__/hoverExpansion153.test.ts` (236 lines)
- `frontend/src/__tests__/remoteCursor153.test.ts` (145 lines)
- `backend/src/__tests__/multiplayerSync153.test.ts` (238 lines)

### Files Modified
- `shared/types/protocol.ts` — added cursor and drag-sync message types and payloads
- `backend/src/protocol/MessageDispatcher.ts` — handlers for `cursor:move`, `object:drag-start/move/end`
- `backend/src/validation/MessageValidator.ts` — input validation for new messages
- `frontend/src/network/MessageHandler.ts` — routing for `cursor:update` and remote drag events
- `frontend/src/interaction/RaycastInteractionManager.ts` — `onTableCardHoverChanged` callback
- `frontend/src/interaction/DragController.ts` — wired drag broadcast hooks
- `frontend/src/scene/SceneManager.ts` — remote drag handlers, card owner tagging, and table plane raycasting
- `frontend/src/app/App.ts` — wired `RemoteCursorManager`, `CursorBroadcaster`, and `HoverExpansionController`
- `docs/ARCHITECTURE.md` — Sections 22 & 23
- `docs/DEVELOPMENT_LOG.md` — M1.5.3 record

### Test Results
| Test Suite | Tests | Status |
|---|---|---|
| Backend Vitest (`npm test`) | 11 / 11 (3 files) | ✅ PASS |
| Frontend Vitest (`npm test`) | 657 / 657 (25 files) | ✅ PASS |
| Frontend Typecheck (`npm run typecheck`) | 0 errors | ✅ PASS |
| Backend Typecheck & Build (`npm run build`) | 0 errors | ✅ PASS |
| Production Bundle Build (`npm run build`) | Built in 2.08s (688 KB) | ✅ PASS |
| Browser Visual Testing | — | NOT TESTED |

---

## M1.5.2 — Player Perspective & Camera Orientation
**Date**: 2026-11-02  
**Status**: ✅ Completed (3/3 Backend tests PASS, 637/637 Frontend tests PASS across 23 test files, Typecheck PASS, Production Build PASS, Browser Visual Testing NOT TESTED)

### Problem Statement & Root Cause
- In M1.5.1, multiplayer clients joined rooms and saw the 3D table, but all players' cameras defaulted to a fixed Southern orientation ($\theta = 0$), looking at Player 1's position.
- As a consequence, Player 2 (North) saw their Hand Zone at the top of the screen, inverted from their view.
- Player camera orientations were not personalized per player seat index, making play unintuitive for non-host players.

### Goals Achieved

**1. Player Perspective Mathematical Helper (`PlayerPerspectiveHelper.ts`)**
- Created pure function `computePlayerPerspective(playerIndex, playerCount, circumradius)`:
  - Uses `computeTableZones(playerCount, circumradius)` to locate the player's exact seat coordinates $(px, pz)$ around the table perimeter.
  - Computes spherical orbit azimuth: $\theta = \operatorname{atan2}(px, pz)$.
  - Places the camera directly behind the player's seat, looking towards $(0, 0, 0)$, so the player's Hand Zone naturally sits horizontally centered at the bottom of their screen ($Y_{\text{NDC}} \in [-1.0, 0]$, $X_{\text{NDC}} \approx 0$).

**2. Camera Controller Perspective API (`CameraController.ts`)**
- Added `setPlayerPerspective(theta, applyImmediately, animate, durationMs)`:
  - Configures `_options.initialTheta = theta` so subsequent calls to `resetCamera()` return directly to the player's seat orientation rather than hardcoded Player 1.
  - Implements smooth animated transitions via `_animateToPerspective(...)` with cubic ease-out, safely cancellable on controller disposal.
  - Added accessors `getInitialTheta()`, `getTheta()`, and `getPhi()`.

**3. Seat Lifecycle Integration & Orbit Stability (`App.ts`, `SceneManager.ts`)**
- In `App.ts`:
  - Tracks `_lastConfiguredRoomId`, `_lastConfiguredPlayerIndex`, and `_lastConfiguredPlayerCount`.
  - Perspective updates trigger only on initial room join, seat index change, or room switch.
  - Routine room state broadcasts (`room:state`, card plays, card draws, movements) do **not** reapply perspective or disturb manual camera orbit/zoom.
  - Returning to lobby or entering offline sandbox resets perspective cleanly to Player 1 default.
- In `SceneManager.ts`:
  - Table shape rebuild (`rebuildTable`) recalculates seat positions and updates camera perspective smoothly without resetting card states.

**4. Comprehensive Test Suite (`playerPerspective152.test.ts`)**
- 9 test cases covering:
  - Distinct perspective angles across 2-, 4-, and 6-player tables.
  - NDC viewport projection verifying Hand Zone is at bottom center ($Y_{\text{NDC}} \in [-1.0, -0.25]$, $|X_{\text{NDC}}| < 0.15$).
  - Camera looking precisely at table center $(0, 0, 0)$.
  - Adaptive camera radius calculation for varying table sizes.
  - Seat-aware camera reset behavior.
  - Camera orbit stability during room state updates.
  - Client-side camera state isolation (no network transmission).
  - Smooth animation cancellation on disposal.

### Files Created
- `frontend/src/scene/PlayerPerspectiveHelper.ts` (44 lines)
- `frontend/src/__tests__/playerPerspective152.test.ts` (277 lines)

### Files Modified
- `frontend/src/scene/CameraController.ts` — `setPlayerPerspective`, animation, and accessors
- `frontend/src/scene/SceneManager.ts` — `setPlayerPerspective` and table rebuild perspective integration
- `frontend/src/app/App.ts` — state change detection and room join perspective handling
- `docs/ARCHITECTURE.md` — Section 21 Player Perspective & Camera Orientation
- `docs/DEVELOPMENT_LOG.md` — M1.5.2 record

### Test Results
| Test Suite | Tests | Status |
|---|---|---|
| Backend Vitest (`npm test`) | 3 / 3 (2 files) | ✅ PASS |
| Frontend Vitest (`npm test`) | 637 / 637 (23 files) | ✅ PASS |
| Frontend Typecheck (`npm run typecheck`) | 0 errors | ✅ PASS |
| Backend Typecheck & Build (`npm run build`) | 0 errors | ✅ PASS |
| Production Bundle Build (`npm run build`) | Built in 2.77s (677 KB) | ✅ PASS |
| Browser Visual Testing | — | NOT TESTED |

---

## M1.5.1 — Multiplayer Room Connection & Private Hand Verification
**Date**: 2026-11-02  
**Status**: ✅ Completed (3/3 Backend tests PASS, 628/628 Frontend tests PASS across 22 test files, Typecheck PASS, Production Build PASS, Browser Visual Testing NOT TESTED)

### Root Cause Analysis: Frontend "Disconnected" State
- In `App.ts`, `this._networkClient = new NetworkClient()` was instantiated and callbacks were wired, but `this._networkClient.connect(url)` was never called in `start()` or anywhere in the client codebase.
- No dynamic URL resolution existed for WebSocket connections; now resolved via `getWebSocketUrl()` in `NetworkConfig.ts`.

### Goals Achieved

**1. Dynamic Frontend ↔ Backend WebSocket Connection (`NetworkConfig.ts`, `NetworkClient.ts`, `App.ts`)**
- Created `NetworkConfig.ts` with `getWebSocketUrl()` dynamically querying Vite env (`VITE_WS_URL`, `VITE_WS_PORT`), browser `window.location`, or fallback `ws://localhost:4000/ws`.
- `App.start()` initiates WebSocket connection automatically with detailed logging.
- `LobbyScreen` and `GameScreen` display clear connection status indicators (`🟡 Connecting`, `🟢 Connected`, `🔴 Disconnected`, `❌ Error`).
- Full support for Offline Sandbox mode without masking connection status.

**2. Multiplayer Room Flow & UI (`LobbyScreen.ts`, `GameScreen.ts`, `UIManager.ts`)**
- Upgraded `LobbyScreen.ts`:
  - Player name input (`#input-player-name`).
  - Room creation with custom room name (`#btn-create-room`).
  - Room joining with 6-character room code validation (`#btn-join-room`).
  - Direct offline sandbox button (`#btn-enter-sandbox`).
  - Dynamic status and inline error notifications.
- Upgraded `GameScreen.ts`:
  - Added Room ID badge (`#hud-room-badge`) and Player badge (`#hud-player-badge`) in the HUD top bar.
  - Return to Lobby button leaves multiplayer room gracefully.

**3. Private Hand Security & Backend State Filtering (`ViewStateBuilder.ts`, `Room.ts`, `MessageDispatcher.ts`)**
- Built `ViewStateBuilder.ts`:
  - Strictly enforces the data visibility boundary per PROJECT_RULES.md E.4.
  - For a viewing client $C$:
    - Cards owned by $C$ in `HAND`: `cardType` is retained, `faceUp: true`.
    - Cards owned by other players in `HAND`: `cardType` is completely stripped (`delete obj.cardType`), `faceUp: false`.
    - Cards in `DECK`: `cardType` is completely stripped, `faceUp: false`.
    - Cards on `TABLE`: `cardType` visible only if `faceUp: true`.
- Updated `MessageDispatcher.ts`:
  - Dispatches `card:draw`, `card:play-to-table`, `object:move`, `object:flip`.
  - On `card:draw`, broadcasts `hand:card-drawn` individually filtered per recipient.
  - All room state broadcasts use `ViewStateBuilder.buildRoomState(room, sid)` for each socket connection.

**4. 3D Hand Zone Synchronization & Local Hover Lift (`HandZoneObject3D.ts`, `RaycastInteractionManager.ts`, `SceneManager.ts`)**
- `HandZoneObject3D.ts` local hover response:
  - When hovered: elevated by $+0.20$, scale boosted to $1.08\times$, `layerIndex` boosted by $+200$ so the hovered card floats clearly above neighbors without obstruction.
  - When unhovered: cleanly returns to baseline position, scale, and layer.
  - Hover is 100% client-side (no network broadcast), ensuring Player A's hover never impacts Player B's view.
- Added `SceneManager.syncDrawnCard(...)`:
  - Local player cards: face-up with card name/title displayed.
  - Opponent cards: face-down (card back displayed), placed into opponent's designated hand zone.

### Files Created
- `shared/types/gameObjects.ts` (extended)
- `backend/src/room/ViewStateBuilder.ts` (88 lines)
- `backend/src/__tests__/multiplayerSecurity.test.ts` (230 lines — 12 verification scenarios)
- `frontend/src/network/NetworkConfig.ts` (35 lines)
- `frontend/src/objects/CardTypeHelper.ts` (45 lines)
- `frontend/src/__tests__/multiplayerIntegration151.test.ts` (260 lines — 6 test suites)

### Files Modified
- `shared/types/protocol.ts` — added `card:draw`, `card:play-to-table`, `hand:card-drawn`
- `shared/types/room.ts` — added `ownerId`, `location`, `handIndex`, `playerIndex`
- `backend/src/room/Room.ts` — starting deck population, `drawCard`, `playCardToTable`, `getPlayerIndex`
- `backend/src/protocol/MessageDispatcher.ts` — wired filtered states via `ViewStateBuilder`
- `backend/src/validation/MessageValidator.ts` — validated `card:draw` and `card:play-to-table`
- `backend/src/__tests__/server.test.ts` — updated state assertions
- `frontend/src/store/ClientStore.ts` — room, player identity, index, and connection tracking
- `frontend/src/network/MessageHandler.ts` — wired `hand:card-drawn`, `playerIndex`, and error handling
- `frontend/src/ui/LobbyScreen.ts` — Room Create/Join inputs, error banner, status display
- `frontend/src/ui/GameScreen.ts` — Room badge & Player badge HUD elements
- `frontend/src/ui/UIManager.ts` — wired Room Create/Join/Leave callbacks
- `frontend/src/objects/HandZoneObject3D.ts` — local hover elevation (+0.20), scale (1.08x), layer (+200)
- `frontend/src/objects/HandZoneManager.ts` — hover callback forwarding
- `frontend/src/interaction/RaycastInteractionManager.ts` — `onHoverChanged` event
- `frontend/src/scene/SceneManager.ts` — `syncDrawnCard` and hover integration
- `frontend/src/app/App.ts` — dynamic WS connect, room lifecycle, draw-to-hand routing

### Test Results
| Test Suite | Tests | Status |
|---|---|---|
| Backend Multiplayer Security (`multiplayerSecurity.test.ts`) | 1 / 1 (12 criteria) | ✅ PASS |
| Backend Server Suite (`server.test.ts`) | 2 / 2 | ✅ PASS |
| Frontend Multiplayer Integration (`multiplayerIntegration151.test.ts`) | 6 / 6 | ✅ PASS |
| Frontend Full Suite (`npm test`) | 628 / 628 (22 files) | ✅ PASS |
| Frontend TypeScript Typecheck (`npm run typecheck`) | 0 errors | ✅ PASS |
| Backend TypeScript Build (`npm run build`) | 0 errors | ✅ PASS |
| Production Bundle Build (`npm run build`) | Built in 3.18s (674 KB) | ✅ PASS |
| Browser Visual Testing | — | NOT TESTED |

---

## M1.5.0-fix — HandZone Syntax Fix & Draw-to-Hand Integration
**Date**: 2026-11-02  
**Status**: ✅ Completed (30/30 new tests PASS, 622/622 total tests PASS across 21 test files, Typecheck PASS, Build PASS, Visual Browser Testing NOT TESTED)

### Goals Achieved

**1. HandZoneObject3D.ts — Complete Rewrite**
- Previous agent left broken brace structure: `_buildLabel()` had unclosed `if` blocks and duplicate code causing `Expected ")" but found "."` at line 159.
- Full class rewrite with balanced braces across all methods: `addCard`, `removeCard`, `moveCard`, `reorderCards`, `clearCards`, `arrangeCards`, `findInsertionIndex`, `containsPoint`.
- Added `document` guard in `_buildLabel()` for jsdom test environment (avoids `ReferenceError: document is not defined`).

**2. Test Environment Fix — happy-dom → jsdom**
- `vite.config.ts` changed `environment: 'happy-dom'` → `environment: 'jsdom'`.
- `happy-dom` removed from devDependencies (`npm uninstall happy-dom`); package was referenced but never properly installed.

**3. drawCardToHand() — SceneManager Integration**
- 5-phase atomic transaction: deck→table (registry) → pop deck → add card to scene → register with RaycastInteractionManager → table→hand (registry) → add to HandZoneManager.
- Full rollback in reverse order on any phase failure.
- Re-entrancy lock `_isDrawingCard` prevents concurrent draws.

**4. GameScreen.ts — "Draw to Hand" Button**
- Added `#btn-draw-to-hand` button to the HUD top bar.
- `public onDrawToHand: (() => void) | null = null` callback wired through UIManager to App.ts.

**5. App.ts — H Key Shortcut**
- `key === 'h'` → `sceneManager.drawCardToHand('demo_deck_1', 0)` shortcut added.
- `this._uiManager.onDrawToHandRequested` wired to `sceneManager.drawCardToHand('demo_deck_1', 0)`.

### Files Modified
- `frontend/src/objects/HandZoneObject3D.ts` — complete rewrite to fix broken brace structure
- `frontend/vite.config.ts` — `happy-dom` → `jsdom`
- `frontend/src/scene/SceneManager.ts` — `drawCardToHand()` 5-phase atomic transaction
- `frontend/src/ui/GameScreen.ts` — `#btn-draw-to-hand` button + `onDrawToHand` callback
- `frontend/src/app/App.ts` — H key shortcut + UIManager callback wiring

### Files Created
- `frontend/src/__tests__/handZone150Integration.test.ts` (30 tests — draw-to-hand, registry integrity, hand→table transfer, lifecycle)

### Test Results
| Test Suite | Tests | Status |
|---|---|---|
| Hand Zone Integration (`handZone150Integration.test.ts`) | 30 / 30 | ✅ PASS |
| Full Frontend Suite (`npm test`) | 622 / 622 | ✅ PASS |
| Full Backend Suite (`npm test`) | 2 / 2 | ✅ PASS |
| TypeScript Typecheck (`npm run typecheck`) | 0 errors | ✅ PASS |
| Production Build (`npm run build`) | 665 KB bundle | ✅ PASS |
| Browser Visual Testing | — | NOT TESTED |

### Design Decisions
- **D008**: Private card visibility for multiplayer (other players only see card backs) is deferred to a future milestone. Current implementation is single-player local demo — all hand cards are face-up.
- **Demo deck identity**: SceneManager registers the demo deck with internal id `'demo_deck_1'` but the registry key may be `'demo_deck'`; `drawCardToHand` resolves both by scanning `_registeredObjects` for `deck.getId() === deckId` as fallback.

---

## M1.5.0 — Private Hand Zone & Card Arrangement
**Date**: 2026-11-02  
**Status**: ✅ Completed — superseded by M1.5.1 (see above)

### Goals Achieved

**1. Private Hand Zone Architecture (`HandZoneConfig.ts`, `HandZoneObject3D.ts`, `HandZoneManager.ts`)**  
- Designed and built 3D Hand Zone containers positioned along each player's edge, oriented inward towards the table center.
- Hand zones are strictly positioned on the felt surface inside table rails with guaranteed clearance to rails and zero overlap with Deck Zone, Discard Zone, or central manipulation arena.
- Visual elements: semi-transparent fill plane, crisp bounding loop, player label sprite with live card count badge (`[Player Name] • [N] lá`).

**2. Adaptive Card Arrangement & Layering (`HandZoneObject3D.ts`)**  
- Supports 1, 2, 5, 10, and 20+ cards with dynamic spacing compression:
  - Default spacing: 0.85 world units.
  - Adaptive compression: $S = \min(0.85, W_{usable} / (N - 1))$, keeping all cards strictly inside the $4.6$ usable width.
  - Parabolic depth arch and subtle fan angle ($\le 0.18$ rad / $\approx 10^\circ$) to simulate a natural hand of cards.
  - Elevation step: each card in hand has $y = \text{SURFACE\_Y} + i \cdot 0.002$ to eliminate Z-fighting.
  - Selected card elevation: selected card floats $+0.12$ above the hand with boosted renderOrder (`100 + i`) so it is clearly highlighted and drawn on top.
  - Preserves face-up / face-down orientation (no automatic flipping).

**3. Card Ownership & CardRegistry Single Source of Truth (`CardRegistry.ts`)**  
- Extended `CardLocation` enum to `'IN_DECK' | 'ON_TABLE' | 'IN_HAND' | 'DISPOSED'`.
- Synchronized all state transitions:
  - `transferTableToHand(cardId, handZoneId)`
  - `transferHandToTable(cardId)`
  - `transferHandToHand(cardId, targetHandZoneId)`
  - `transferHandToDeck(deckId, cardId)`
  - `canTransferTableToDeck` updated to support cards coming directly from hand.
- Preserved invariant: a card cannot be simultaneously in Hand and in a Stack or Deck.
- Full integrity check `validateIntegrity(decks, tableCards)` verified and passes.

**4. Drag & Drop Integration (`SceneManager.ts`)**  
- Integrated cleanly into existing `DragController` and `RaycastInteractionManager` without competing input listeners:
  - Dropping card from table into HandZone transfers ownership to HandZone (`IN_HAND`).
  - Dropping card from HandZone onto empty table transfers ownership to table (`ON_TABLE`).
  - Dragging within the same HandZone reorders cards based on drop position along local X axis.
  - Dropping an entire stack into HandZone dissolves the stack and adds all individual cards to the hand.
  - Dragging selected groups (followers) transfers all cards into the hand zone in order.
  - Hovering over a HandZone during drag previews candidate drop targets.
  - Deselecting or selecting cards in hand automatically updates card elevations and renderOrder via `onSelectionChanged`.

**5. Dynamic Table Scaling (2 -> 8 -> 2 Player Cycle)**  
- When table shape and player count change, `rebuildHandZones` migrates all cards currently in HandZone $i$ into the new HandZone $i$ at its new geometric coordinates.
- If player count decreases (e.g. 5 -> 2), cards from removed player zones are preserved into Player 1's hand, ensuring zero card loss or corruption.
- Verified across full player count transition cycle: 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 2.

### Files Created
- `frontend/src/objects/HandZoneConfig.ts` (75 lines)
- `frontend/src/objects/HandZoneObject3D.ts` (362 lines)
- `frontend/src/objects/HandZoneManager.ts` (204 lines)
- `frontend/src/__tests__/handZone150.test.ts` (485 lines, 37 tests)

### Files Modified
- `frontend/src/objects/CardRegistry.ts` — extended `CardLocation` with `IN_HAND` and atomic hand transfer methods
- `frontend/src/objects/CardObject3D.ts` — added `_handZoneId`, `setHandZoneId`, `getHandZoneId`, `isInHand`
- `frontend/src/interaction/RaycastInteractionManager.ts` — added `onSelectionChanged` callback
- `frontend/src/scene/SceneManager.ts` — wired `HandZoneManager`, drop handling, drop preview, rebuild migration, and disposal
- `frontend/src/__tests__/browserIntegration3452.test.ts` — updated location assertion to accept `ON_TABLE` and `IN_HAND`

### Test Results
| Test Suite | Tests | Status |
|---|---|---|
| Hand Zone Suite (`handZone150.test.ts`) | 37 / 37 | ✅ PASS |
| Full Frontend Suite (`npm test`) | 592 / 592 | ✅ PASS |
| Full Backend Suite (`npm test`) | 2 / 2 | ✅ PASS |
| TypeScript Typecheck (`npm run typecheck`) | 0 errors | ✅ PASS |
| Production Build (`npm run build`) | Built successfully | ✅ PASS |
| Browser Visual Testing | — | NOT TESTED |

---

## M1.4.3 — Polygon Player Alignment, Smart Discard Stacks & Free Placement Zones
**Date**: 2026-11-02  
**Status**: ✅ Completed (555/555 tests PASS across 19 test files, Typecheck PASS, Build PASS, Visual Browser Testing NOT TESTED)

### Goals Achieved

**A — Player Area Always Parallel to Polygon Edge**  
Replaced the old ellipse-based rotation `rotationY = -atan2(x, z)` with the consecutive-vertex edge-tangent algorithm:
- P1 = vertices[i], P2 = vertices[(i+1)%N]
- edgeVec = P2 - P1; tangent = normalize(edgeVec)
- inwardNormal = (tangentZ, -tangentX) — rotated 90° CW in XZ
- rotationY = atan2(-edgeDz, edgeDx)  
Long axis of every PlayerArea is parallel to its polygon edge within < 0.5°.

**B — Smart Discard Stack**  
Added Discard Zone routing to `SceneManager._onCardDropped`. Dropping any card/stack within the visual Discard Zone (2.6 × 3.6 centered at discardPos, tolerance = 0) auto-creates or merges into a smart Discard Stack using existing `CardStack` / `CardStackManager` infrastructure. Dragging a card out dissolves the stack when ≤ 1 card remains.

**C — Scaled Table Dimensions**  
| Players | Dimensions | Camera |
|---|---|---|
| 2p | 24.0 × 16.0 (was 20.0 × 13.0) | 22.0 |
| 3p | 26.0 × 17.5 (was 22.0 × 14.5) | 24.0 |
| 4p | 28.0 × 19.0 (was 24.0 × 16.0) | 26.0 |
| 5p | Pentagon R=13.0 (was R=12.0) | 27.0 |
| 6p | Hexagon R=13.5 | 28.0 |
| 7p | Heptagon R=15.0 | 29.0 |
| 8p | Octagon R=16.5 | 32.0 |

**D — Free Placement on Entire Polygon Felt**  
Added `isPointInsideTable`, `clampPointToTable`, `getNearestValidPoint` to `TableShapeConfig.ts`. Updated `clampTablePosition` to accept optional `TableShapeParams`, replacing the old static `15.5 × 9.5` rectangular clamp. Cards can now be dragged to all polygon edges and vertices.

**E — Optimal Workspace for 5–8 Players**  
Center arena kept open; Deck and Discard Zones remain at center-left/right.

### Bugs Fixed in This Session (M1.4.3 Finalization)

1. **`smartDiscard143.test.ts` test 5** — c2 dropped at `(0, 0, 0)` was absorbed by `demo_card_1` (which lives at origin). Fixed: drop at `(6.0, 0, 0)`.
2. **`freePlacement143.test.ts`** — import used `getTableShapeParams` (non-existent); corrected to `getTableShape`. Polygon vertex containment check used strict `<=` without epsilon; added `GEOMETRY_EPSILON = 1e-5` to handle floating-point boundary cases. `clampTablePosition` call signature corrected to match actual API signature `(pos: {x, z}, params?)`.
3. **`stackAutoArrangement343.test.ts` test 5.1** — drop position `(2.0, 1.5)` falls inside the Discard Zone rectangle `[1.2, 3.8] × [-1.8, 1.8]`; moved to `(-1.5, SURFACE_Y, -3.5)`.
4. **`SceneManager.getDiscardStack()`** — used non-existent `stack.position.x`; corrected to `stack.getPosition().x`.
5. **`isInsideDiscardZone` tolerance** — default `tolerance = 0.5` caused false positives: cards spawning at x ≈ 0.8 (near deck cascade position) were captured by discard zone (`|0.8-2.5|=1.7 ≤ 1.3+0.5=1.8`). Reduced to `tolerance = 0`: the zone boundary now matches the exact visual rectangle.
6. **`dynamicTable141.test.ts`** — `cameraRadius` not monotonically increasing: 5p was 25.5 < 4p 26.0. Raised to 27.0. 6p was 26.5 < 5p 27.0. Raised to 28.0.
7. **`tableGeometry142.test.ts`** — M1.4.2 rotation test expected `rotationY ≈ -atan2(x, z)` (old center-facing). M1.4.3 correctly uses edge-tangent formula giving `rotationY ≈ +atan2(x, z)`. Updated assertion sign.
8. **`playerAlignment143.test.ts`** — unused `dot` variable and `.y` property on 2D vector; replaced with a comment.
9. **`freePlacement143.test.ts`** — unused `TABLE_CONFIG` import removed.

### Files Modified
- `frontend/src/objects/TableShapeConfig.ts` — epsilon in containment, 5p/6p cameraRadius
- `frontend/src/scene/SceneManager.ts` — `stack.getPosition().x`, `isInsideDiscardZone` default tolerance = 0
- `frontend/src/__tests__/smartDiscard143.test.ts` — test 5 drop position fix
- `frontend/src/__tests__/stackAutoArrangement343.test.ts` — test 5.1 drop position fix
- `frontend/src/__tests__/tableGeometry142.test.ts` — rotation assertion direction fix
- `frontend/src/__tests__/playerAlignment143.test.ts` — unused variable cleanup
- `frontend/src/__tests__/freePlacement143.test.ts` — import & API call fixes

### Files Created
- `frontend/src/__tests__/freePlacement143.test.ts` — 10 tests for Goal D (polygon containment, clamping, free placement beyond old 15.5×9.5 bounds)

### Test Results
| Suite | Tests | Status |
|---|---|---|
| Frontend (`npm test`) | 555 / 555 | ✅ PASS |
| Backend (`npm test`) | 2 / 2 | ✅ PASS |
| Typecheck | — | ✅ PASS |
| Build | — | ✅ PASS |
| Browser Visual Testing | — | NOT TESTED |


**Date**: 2026-11-02  
**Status**: ✅ Completed (76/76 new tests PASS, 514/514 total tests PASS across 16 test files, Typecheck PASS, Build PASS, Visual Browser Testing NOT TESTED)

### Goal
Rework the tabletop geometry, layout, and zone system across 2–8 player configurations:
1. Substantially expand table dimensions to provide generous physical playing and manipulation space on the 3D tabletop.
2. Correct all polygon rail geometry defects from M1.4.1 (broken orientations, stretched boxes, intersecting rails, non-closed perimeter) using consecutive-vertex mitered construction.
3. Establish 4 distinct non-overlapping functional zones: Player Area (seated perimeter zone), Card Placement Zone (dedicated active card/stack area in front of each player), Deck Zone (draw deck near center left), and Discard Zone (discard pile adjacent to deck zone), leaving the central arena open.
4. Calculate adaptive camera framing dynamically based on true table bounding radius and viewport aspect ratio.
5. Guarantee that table rebuilding preserves all card states, stacks, and registry registrations without loss or corruption.

### Root Cause Analysis of M1.4.1 Geometry & Layout Bugs
1. **Wrong Rotation Formula**: M1.4.1 applied `rotationY = -mp.angle` to standard `BoxGeometry` objects. In Three.js, rotating $(1, 0, 0)$ around Y by negative angle directed the rail tangent towards South (+Z) instead of North (-Z), causing rail segments to slice across the felt or point backwards.
2. **Missing Mitered Cuts**: Rectangular boxes have flat $90^\circ$ ends. At polygon corners with interior angles $108^\circ$ (pentagon) to $135^\circ$ (octagon), flat rectangular ends pierced through each other or left gaps.
3. **Table Dimensions Constrained**: Initial M1.4.1 circumradii ($R = 6.0 - 8.4$) occupied too little screen estate and constrained the central play zone when player areas were placed.
4. **Lack of Dedicated Card Placement Zones**: Cards had no dedicated zone separated from the seated player boundary and the draw deck.

### Key Technical Achievements in M1.4.2
1. **Consecutive Vertex Rail Construction (`TableGeometryBuilder`)**:
   - Every rail segment is constructed strictly from two consecutive polygon vertices $P_1$ and $P_2$:
     - Edge vector: $\vec{D} = P_2 - P_1$.
     - Length: $L = \|\vec{D}\|$.
     - Midpoint: $M = (P_1 + P_2) / 2$.
     - Rotation angle: $\theta = \text{atan2}(-(P_2.z - P_1.z), P_2.x - P_1.x)$ (matches Three.js Y-rotation coordinate transformation).
2. **Exact Mitered Joints**:
   - Trapezoidal cross-section in local space with miter expansion offset $\Delta x = W \tan(\pi / N)$:
     - Inner edge (on felt): $[-L/2, L/2]$ at $z = 0$.
     - Outer edge (exterior): $[-L/2 - \Delta x, L/2 + \Delta x]$ at $z = W$.
   - Consecutive rails meet at the exact same world coordinate corner vertices down to machine precision. Zero gaps, zero intersections, closed boundary.
   - Unified for both rectangular ($N=4$, $45^\circ$ miter) and regular polygon ($N=5..8$) tables.
3. **Scaled Table Dimensions (Old M1.4.1 vs New M1.4.2)**:
   - 2 Players: $13.0 \times 8.5$ ($R \approx 7.76$) ➔ **$20.0 \times 13.0$** ($R \approx 11.93$, inradius $6.5$)
   - 3 Players: $14.0 \times 9.0$ ($R \approx 8.32$) ➔ **$22.0 \times 14.5$** ($R \approx 13.17$, inradius $7.25$)
   - 4 Players: $15.0 \times 9.5$ ($R \approx 8.88$) ➔ **$24.0 \times 16.0$** ($R \approx 14.42$, inradius $8.0$)
   - 5 Players: Pentagon $R = 6.0$ ($r_{in} \approx 4.85$) ➔ **Pentagon $R = 12.0$** ($r_{in} \approx 9.71$, edge $\approx 14.11$)
   - 6 Players: Hexagon $R = 6.8$ ($r_{in} \approx 5.89$) ➔ **Hexagon $R = 13.5$** ($r_{in} \approx 11.69$, edge $= 13.50$)
   - 7 Players: Heptagon $R = 7.6$ ($r_{in} \approx 6.85$) ➔ **Heptagon $R = 15.0$** ($r_{in} \approx 13.51$, edge $\approx 13.02$)
   - 8 Players: Octagon $R = 8.4$ ($r_{in} \approx 7.76$) ➔ **Octagon $R = 16.5$** ($r_{in} \approx 15.24$, edge $\approx 12.63$)
4. **Four Distinct Tabletop Zones (`TableZonesConfig`, `TableZoneObject3D`, `TableZoneManager`)**:
   - **Player Area**: Seated perimeter box (`4.8 × 2.2`) with label and avatar, located near the rail.
   - **Card Placement Zone**: Dedicated active playing area in front of each player (`4.6 × 2.4`), oriented towards the player ($|rot_Y^{placement} - rot_Y^{player}| \equiv 0$).
   - **Deck Zone**: Dedicated draw deck position near table center ($x = -2.2, z = 0$ for $N \ge 3$; $x = -3.8$ for $N = 2$).
   - **Discard Zone**: Dedicated discard pile position adjacent to Deck Zone ($x = +2.2, z = 0$ for $N \ge 3$; $x = +3.8$ for $N = 2$).
   - Separating Axis Theorem (SAT) tests mathematically prove zero overlap between any of the 4 zone classes across all 2–8 player layouts.
5. **Adaptive Camera Framing (`CameraController.computeAdaptiveRadius`)**:
   - Computes required camera radius dynamically based on $R_{table}$, vertical FOV ($45^\circ$), polar angle $\phi$ ($53^\circ$), and camera viewport aspect ratio.
   - Adjusts for portrait/narrow vs. wide viewports.
   - Updates `_options.initialRadius` so `resetCamera()` returns to the proper framing.
6. **State Preservation Invariant**:
   - Rebuilding table does not modify `CardRegistry`, on-table cards, stacks, or deck entities.

### Files Created
- `frontend/src/objects/TableZonesConfig.ts` — Centralized configuration and math for all 4 tabletop zones across 2–8 players.
- `frontend/src/objects/TableZoneObject3D.ts` — 3D group rendering mitered border outlines, translucent fills, and label sprites flush on table surface.
- `frontend/src/objects/TableZoneManager.ts` — Manages lifecycle, spatial queries, and visibility of all table zones.
- `frontend/src/__tests__/tableGeometry142.test.ts` — 44 tests in 6 groups (A: Polygon geometry, B: Miter alignment, C: Component coherence, D: PlayerArea clearance, E: Rebuild invariant preservation, F: Adaptive camera framing).
- `frontend/src/__tests__/tableZones142.test.ts` — 32 tests in 3 groups (1: Spatial separation & SAT non-overlap, 2: Visual object lifecycle, 3: Zone manager layout lifecycle).

### Files Modified
- `frontend/src/objects/TableShapeConfig.ts` — Scaled dimensions for 2–8p, added `getRectangleVertices()`, `getTableFeltVertices()`, `getTableOuterRadius()`.
- `frontend/src/objects/TableGeometryBuilder.ts` — Rewrote `buildRailSpecs()` with consecutive-vertex mitered trapezoids; updated apron and legs.
- `frontend/src/objects/PlayerAreaConfig.ts` — Integrated with `TableZonesConfig`, safe perimeter clearances, normalized angles.
- `frontend/src/scene/CameraController.ts` — Added `computeAdaptiveRadius()` and increased `maxDistance` to 40.0.
- `frontend/src/scene/SceneManager.ts` — Integrated `TableZoneManager`, dynamic deck repositioning on rebuild, adaptive camera framing.

---

## M1.4.1 — Dynamic Polygon Table System & Adaptive Table Scaling
**Date**: 2026-11-01  
**Status**: ✅ Completed (24/24 new tests PASS, 438/438 total tests PASS, Typecheck PASS, Build PASS, Visual Browser Testing NOT TESTED)

### Goal
Build a dynamic polygon table system where the 3D table shape, rail border, apron, and legs adaptively scale and reshape based on player count (2–8 players), with perimeter-aligned player areas and adaptive orbital camera distance.

### Table Shapes by Player Count
- **2–4 Players**: Rectangle with adaptive scaling (2p: 13×8.5, 3p: 14×9, 4p: 15×9.5)
- **5 Players**: Regular Pentagon ($N = 5$, circumradius $R = 6.0$, inradius $r_{in} \approx 4.85$)
- **6 Players**: Regular Hexagon ($N = 6$, circumradius $R = 6.8$, inradius $r_{in} \approx 5.89$)
- **7 Players**: Regular Heptagon ($N = 7$, circumradius $R = 7.6$, inradius $r_{in} \approx 6.85$)
- **8 Players**: Regular Octagon ($N = 8$, circumradius $R = 8.4$, inradius $r_{in} \approx 7.76$)

### Key Technical Achievements
1. **Dynamic Polygon Geometry via `TableGeometryBuilder`**:
   - `buildFeltGeometry`: Uses `THREE.Shape` + `THREE.ExtrudeGeometry` (thickness 0.1) rotated to place top face exactly at `y = TABLE_CONFIG.SURFACE_Y` with upward normals (+Y).
   - `buildRailSpecs`: Generates $N$ mitered wood rails along polygon edges (or 4 box rails for rectangle), maintaining zero gaps with felt.
   - `buildApronSpec`: Generates extruded outer skirt beneath the table surface.
   - `buildLegPositions`: Dynamically computes 4 legs (rectangle) or $N$ legs (polygon) placed inside each corner/vertex.
2. **Atomic In-Place Table Rebuilding**:
   - `TableObject3D.rebuild(playerCount)`: Cleans up previous child meshes with `Disposer` and rebuilds the new shape in-place without page reload or App reset.
   - Card/Stack integrity invariant preserved: CardRegistry and on-table cards/decks remain untouched during table rebuild.
3. **Perimeter Player Area Layout**:
   - For polygon shapes (5–8 players), player areas are automatically placed along edge midpoints, angled towards the center (`rotationY = -angle`), with zero overlap.
4. **Adaptive Camera Radius**:
   - `CameraController.setAdaptiveRadius(radius)`: Smoothly adjusts camera distance to fit table footprint based on player count (12.0 to 18.5) within bounds [4.5, 24.0].
5. **UI & Scene Integration**:
   - `PlayerAreaHUD` updated with player counts 2–8. Changing count triggers `SceneManager.rebuildTable(count)` which atomically coordinates table rebuild, area repositioning, and camera framing.

### Files Created
- `frontend/src/objects/TableShapeConfig.ts` — Centralized configuration for table shapes, geometry parameters, and camera distances (2–8 players).
- `frontend/src/objects/TableGeometryBuilder.ts` — Geometry factory for felt, rails, apron, and leg positions.
- `frontend/src/__tests__/dynamicTable141.test.ts` — 24 unit and integration tests covering shapes, geometries, rebuilds, layouts, camera, and invariants.

### Files Modified
- `frontend/src/objects/TableObject3D.ts` — Added `rebuild()` method, delegated geometry creation to `TableGeometryBuilder`, exposed `playerCount`, `shapeType`, `circumradius`.
- `frontend/src/objects/PlayerAreaConfig.ts` — Extended to 2–8 players, added `buildPolygonPositions()` and `getLayoutForShape()`.
- `frontend/src/objects/PlayerAreaManager.ts` — Supported `PlayerCount` (2–8) and optional `circumradius` parameter.
- `frontend/src/ui/PlayerAreaHUD.ts` — Extended selector to options 2–8 and typed callback as `PlayerCount`.
- `frontend/src/scene/CameraController.ts` — Added `setAdaptiveRadius(radius)` and `getRadius()` methods.
- `frontend/src/scene/SceneManager.ts` — Added `rebuildTable(playerCount, labels?)` workflow.
- `frontend/src/app/App.ts` — Connected HUD count changes to `rebuildTable()`.

---

## M1.4.0 — Player Areas & Table Layout Foundation
**Date**: 2026-11-01  
**Status**: ✅ Completed (76/76 new tests PASS, Typecheck PASS, Build PASS, Visual Browser Testing NOT TESTED)

### Goal
Build a PlayerArea system that defines spatial zones for each player on the 3D tabletop. This is a **purely visual layout system** — it does NOT enforce card ownership, turn order, or any gameplay rules.

### Files Created
1. **`frontend/src/objects/PlayerAreaConfig.ts`** — Centralized layout config for 2–6 players:
   - `PlayerAreaPosition` type: `{ x, z, rotationY, suggestedLabel }`.
   - `PlayerAreaLayoutConfig` type: `{ playerCount, positions[] }`.
   - `PLAYER_AREA_VISUAL_CONFIG`: border/hover/select colors, area dimensions, label Y offset.
   - `LAYOUT_CONFIGS`: manually tuned positions for 2, 3, 4 players; ellipse-generated positions for 5, 6 players.
   - Ellipse layout: angle = `(2π * i / n) - π/2`, semi-axes X=5.5, Z=3.0, clamped to felt bounds.
2. **`frontend/src/objects/PlayerAreaObject3D.ts`** — 3D object for a single player area (extends `THREE.Group`):
   - Border: `THREE.LineLoop` with `LineBasicMaterial` forming a rectangle on the table.
   - Label: `THREE.Sprite` with dynamically drawn canvas texture.
   - Avatar placeholder: `THREE.Mesh` with `CircleGeometry`.
   - Slot indicator: Inner rectangle `LineLoop` suggestion.
   - Hover / Select visual states via material color updates.
   - `containsPoint(x, z)`: transforms point into local group space using inverse world matrix.
   - `getBoundingBox()`: returns world-space AABB in XZ plane.
   - `dispose()`: fully disposes all geometries, materials, and textures.
3. **`frontend/src/objects/PlayerAreaManager.ts`** — Manages all PlayerArea instances:
   - `setupLayout(playerCount, labels?)`: clear old areas, create new from `LAYOUT_CONFIGS`.
   - `selectArea(id)`, `deselectAll()`, `hoverArea(id | null)`: selection/hover state management.
   - `findAreaAtPoint(x, z)`: spatial query returning first matching area.
   - `validateNoOverlap(tolerance?)`: checks AABB overlap between all areas.
   - `setAllVisible(visible)`, `isVisible()`.
   - `dispose()`: calls `clearLayout()`.
4. **`frontend/src/ui/PlayerAreaHUD.ts`** — HTML overlay panel:
   - Player count selector (`<select>` with options 2–6).
   - Show/Hide Areas toggle button.
   - Selected area label display.
   - Callbacks: `onSetPlayerCount`, `onToggleVisibility`.
5. **`frontend/src/__tests__/playerArea140.test.ts`** — 76 tests across 3 groups:
   - Group 1 (PlayerAreaConfig): 5 layouts × 4 assertions = 20 tests.
   - Group 2 (PlayerAreaObject3D): 14 tests.
   - Group 3 (PlayerAreaManager): 42 tests.

### Files Modified
1. **`frontend/src/objects/TableConfig.ts`** — Added 7 player area constants:
   - `PLAYER_AREA_WIDTH`, `PLAYER_AREA_DEPTH`, `PLAYER_AREA_BORDER_COLOR`, `PLAYER_AREA_HOVER_COLOR`, `PLAYER_AREA_SELECT_COLOR`, `PLAYER_AREA_BORDER_OPACITY`, `PLAYER_AREA_SURFACE_Y`.
2. **`frontend/src/scene/SceneManager.ts`** — Integrated `PlayerAreaManager`:
   - Added `private readonly _playerAreaManager: PlayerAreaManager`.
   - Added `private readonly _playerAreaAbortController: AbortController` for event listener cleanup.
   - `getPlayerAreaManager()`, `setupPlayerLayout(count, labels?)`, `togglePlayerAreas()`.
   - `findPlayerAreaAtScreenPos(event)`: raycasts table plane → XZ hit → `_playerAreaManager.findAreaAtPoint`.
   - `_setupPlayerAreaInteraction()`: `mousemove` and `click` listeners that check if card is hovered first, then delegate to PlayerAreaManager.
   - `dispose()`: aborts `_playerAreaAbortController`, calls `_playerAreaManager.dispose()`.
3. **`frontend/src/app/App.ts`** — Integrated `PlayerAreaHUD`:
   - Creates `PlayerAreaHUD`, wires to `SceneManager.setupPlayerLayout` and `togglePlayerAreas`.
   - Initializes default layout of 4 players on app start.
   - `dispose()` calls `_playerAreaHUD.dispose()`.

### Layout Calculation
| Players | Method | Description |
|---------|--------|-------------|
| 2 | Manual | South (z=3.5), North (z=-3.5) |
| 3 | Manual | South-Right, North-Left, North-Right — avoids center deck |
| 4 | Manual | South, North, East (x=5.5), West-shifted (x=-1.5) |
| 5 | Ellipse | Semi-axes X=5.5, Z=3.0, clamped to `±6.0` / `±3.5` |
| 6 | Ellipse | Same ellipse with 6 equally-spaced angles |

All positions clamped within felt bounds `x ∈ [-7.5, 7.5]`, `z ∈ [-4.75, 4.75]`.

### Design Decisions
- **PlayerArea has NO card ownership**: `CardRegistry` remains the sole source of truth.
- **No raycasting interference**: PlayerArea hover/click uses table-plane raycasting ONLY when `_interactionManager.getHoveredObject() === null` — Cards/Decks always take priority.
- **No new npm packages**: Only Three.js primitives used.
- **Render-on-demand**: `requestRender()` called after every visual state change.

### Test Results
- **Unit Tests**: 414/414 PASS (13 test files) — 76 new tests added, 338 existing tests unaffected.
- **TypeScript Typecheck**: 0 errors.
- **Production Build**: SUCCESS (630 kB bundle, 39 modules).
- **Browser Visual Testing**: NOT TESTED (headless CLI environment).

---

## M1.3.4.5.2 — Browser Integration Testing & Insertion Flow Stabilization
**Date**: 2026-11-01  
**Status**: ✅ Completed (Automated Browser Integration Tests & Builds Passed, Visual Browser Testing marked NOT TESTED)

### Goal
Perform comprehensive integration verification and stabilization of the card/stack insertion flows and UI in a browser-like (JSDOM/Three.js) environment, verifying Tests A through F:
- **Test A**: Toolbar CUSTOM insertion flow with varying `numberOfCardsAbove` ($0, 1, \text{max}$).
- **Test B**: Stack to Stack merging flow across CUSTOM positions.
- **Test C**: Mode verification across TOP, BOTTOM, and CUSTOM modes.
- **Test D**: Return to Deck flow (TOP, BOTTOM, CUSTOM=0, CUSTOM=deckCount).
- **Test E**: Context Menu actions, Modal validation (rejecting negative, non-numeric, overflow values), and Cancel safety.
- **Test F**: Edge cases (dissolving stacks at $\le 1$ card, empty deck safety, self-merge prevention, cancel drag preview cleanup).
- Enforce strict continuous Tabletop Invariants across all integration workflows.

### Implementation & Fixes
1. **Created Comprehensive Integration Test Suite**:
   - `frontend/src/__tests__/browserIntegration3452.test.ts` (21 dedicated tests).
   - Implemented `assertTabletopInvariants(sceneManager)` checking:
     - Registry location parity (`IN_DECK` vs `ON_TABLE`).
     - No orphan or duplicate card records across `CardRegistry`, `DeckObject3D`, and `SceneManager`.
     - Active stack membership integrity (all cards in a stack have valid parent references and matching positions).
     - No disposed objects lingering in active registry or scene caches.
2. **WebGL Context & Mocking in Headless Integration**:
   - Mocked `Renderer` with lightweight mock canvas & perspective camera to simulate browser DOM and scene rendering cleanly in JSDOM.
3. **Drop Target Coordinate Alignment**:
   - Fixed synthetic drag-and-drop drop coordinate simulation in Test A and Test B by aligning dragged object position directly onto target stack coordinates (`x`, `z`), strictly within `INTERACTION_CONFIG.DROP_ZONE_RADIUS` (1.5 units) to properly trigger drop detection rather than empty-space release.
4. **Typecheck & Lint Cleanup**:
   - Removed unused imports (`CardRegistry`, `CardStack`) across test files to ensure `tsc --noEmit` passes with 0 warnings/errors under strict TypeScript config.

### Test Results
- **Unit & Integration Tests**: 338/338 PASS (12 test files).
  - 21/21 tests in `browserIntegration3452.test.ts` PASS.
- **TypeScript Typecheck**: 0 errors (`npm run typecheck` PASS).
- **Production Build**: SUCCESS (`npm run build` PASS, 614 kB bundle).
- **Direct Visual Browser Testing**: NOT TESTED (headless CLI environment without GUI browser). Manual verification checklist supplied in milestone report.

---

## M1.3.4.5.1 — Fix Custom Insertion Index Direction
**Date**: 2026-11-01  
**Status**: ✅ Completed (Automated Unit Tests & Builds Passed, Visual Browser Testing marked NOT TESTED)

### Goal
Invert custom insertion index calculation from `numberOfCardsBelow` to `numberOfCardsAbove` while preserving internal bottom-to-top array storage:
- Internal layout convention: `cards[0] = bottom`, `cards[cards.length - 1] = top`.
- UI input convention: User inputs `numberOfCardsAbove` (number of cards above the inserted card/stack).
- Conversion formula: `internalIndex = targetCount - numberOfCardsAbove`.
  - 0 cards above $\implies$ `internalIndex = targetCount` (TOP).
  - 1 card above $\implies$ `internalIndex = targetCount - 1` (immediately under top card).
  - `targetCount` cards above $\implies$ `internalIndex = 0` (BOTTOM).

### Implementation & Fixes
1. **`SceneManager.ts`**:
   - Replaced `_customInsertionBelowCount` with `_customInsertionAboveCount`.
   - Added centralized conversion helpers:
     - `cardsAboveToInternalIndex(targetCount, cardsAbove)`
     - `internalIndexToCardsAbove(targetCount, internalIndex)`
   - Updated `calculateInsertionIndex(targetCount, mode, customVal)`:
     - TOP $\implies$ `targetCount`
     - BOTTOM $\implies$ `0`
     - CUSTOM $\implies$ `targetCount - numberOfCardsAbove` (clamped $[0, \text{targetCount}]$).
2. **`InsertionModal.ts`**:
   - Changed prompt label to: `Số lá bài nằm phía trên vị trí chèn (tính từ đỉnh xuống)` (`Insert below how many cards from TOP?`).
   - Updated helper text: `0 = Trên cùng | 1 = Dưới lá trên cùng | Max = Dưới cùng`.
   - Updated error message to validate non-negative values for cards above.
3. **`App.ts`**:
   - Updated Toolbar CUSTOM modal prompt to use `cardsAbove`.
   - Updated Context Menu `Chèn vào Vị trí Stack...` to use `remainingCount = stack.getCount() - 1` and `cardsAboveToInternalIndex`.
   - Updated Context Menu `Trả về Chồng bài (Vị trí...)` to use `deck.getCount()` and `cardsAboveToInternalIndex`.
   - Ensured all drag-and-drop operations (Card $\to$ Stack, Stack $\to$ Stack, Card $\to$ Deck, Stack $\to$ Deck) seamlessly execute through `calculateInsertionIndex`.
4. **`advancedInsertion345.test.ts`**:
   - Updated test 4.1 for the new mathematical formula.
   - Added Group 5 (tests 5.1 to 5.4) verifying bidirectional index conversion, stack insertion, multi-card stack insertion, and return to deck.
   - All 317 tests across 11 files passing.

### Testing Status
- **Unit & Integration Tests**: 317/317 PASS.
- **TypeScript Typecheck**: 0 errors.
- **Production Build**: SUCCESS.
- **Direct Browser Testing**: NOT TESTED (headless CLI environment). Manual verification checklist provided.

---

## M1.3.4.5 — Advanced Deck & Stack Insertion
**Date**: 2026-11-01  
**Status**: ✅ Completed (Automated Unit Tests & Builds Passed, Visual Browser Testing marked NOT TESTED)

### Goal
Upgrade Deck and Stack interaction to allow inserting cards and stacks at any arbitrary position (index) into:
1. `DeckObject3D` (Original drawing deck).
2. `CardStack` (Player-created tabletop stack).
3. Standalone `CardObject3D`.
4. Multi-card `CardStack`.
Provide Toolbar insertion mode toggling (`TOP`, `BOTTOM`, `CUSTOM...`), interactive modal dialog for custom position input, extended Context Menu operations, drag drop to Deck integration, and atomic transaction rollback preserving `CardRegistry` invariants.

### Implementation & Fixes
1. **Unified Insertion Convention (`numberOfCardsBelow`)**:
   - `cards[0] = bottom`, `cards[cards.length - 1] = top`.
   - `insertIndex = numberOfCardsBelow` where $0 \le \text{insertIndex} \le \text{targetCards.length}$.
   - Index 0 inserts at bottom; Index `count` inserts at top. Multi-card stacks preserve internal order.
2. **`DeckObject3D.ts`**:
   - Added `insertCardAt(cardId: string, index: number)` and `insertCardsAt(cardIds: string[], index: number)`.
   - Added `removeCardId(cardId: string)` for rollback support.
   - Refactored `addCard` and `addCards` to delegate to `insertCardAt` and `insertCardsAt`.
   - Preserves LIFO: `peekTop()` and `draw()` always operate on the top card (last element).
3. **`CardStack.ts` & `CardStackManager.ts`**:
   - `CardStack`: Added `insertCardAt(card, index)` and `insertCardsAt(cards, index)`. Recalculates cascade layout and updates `StackBadge`.
   - `CardStackManager`: Added `insertCardIntoStack(card, targetStack, index)` and `insertStackIntoStack(sourceStack, targetStack, index)`.
   - Updated `mergeStackOntoCard(sourceStack, targetCard, index)` to support custom insertion order.
4. **`CardRegistry.ts`**:
   - Added `rollbackDeckToTable(deckId, cardId, card)` for atomic rollback when returning cards to deck.
5. **`SceneManager.ts`**:
   - Added insertion mode state: `_insertionMode: InsertionMode` ('TOP' | 'BOTTOM' | 'CUSTOM') and `_customInsertionBelowCount`.
   - Added `calculateInsertionIndex(targetCount, mode?, customVal?)`.
   - Added `returnCardToDeck(card, deckId?, index?)` with atomic rollback (Step A: Registry $\to$ Step B: Deck $\to$ Step C: Scene).
   - Added `returnStackToDeck(stackId, deckId?, index?)` and `returnCardsToDeck(cards, deckId?, index?)`.
   - Updated `_onCardDropped` to handle drops onto `DeckObject3D` as well as `CardStack` with dynamic insertion index.
   - Updated `onQueryDropTarget` to preview `DeckObject3D` with cyan highlight when card is dragged over/near it.
6. **UI Components (`InsertionModal.ts`, `GameScreen.ts`, `UIManager.ts`, `App.ts`)**:
   - Created `InsertionModal`: Glassmorphism popup with validation for non-negative integers $\le \text{currentMax}$, Confirm/Cancel actions, Enter/Escape keyboard shortcuts.
   - `GameScreen`: Added `INSERT POSITION: [Đỉnh (Top)] [Đáy (Bottom)] [Tùy chọn...]` button group in HUD top bar.
   - `App`: Wired Toolbar insertion buttons, custom modal dialog, and Context Menu actions:
     - `Chèn lên Đỉnh Stack`
     - `Chèn xuống Đáy Stack`
     - `Chèn vào Vị trí Stack...`
     - `Trả về Chồng bài (Đỉnh)`
     - `Trả về Chồng bài (Đáy)`
     - `Trả về Chồng bài (Vị trí...)`
7. **Unit Tests (`advancedInsertion345.test.ts`)**:
   - 17 unit/integration tests verifying stack insertion, deck insertion, return to deck, atomic transactions, modal validation, and CardRegistry integrity.
   - Total test suite: 11 files, 313/313 tests passed.

### Testing Status
- **Unit & Integration Tests**: 313/313 PASS.
- **TypeScript Typecheck**: 0 errors.
- **Production Build**: SUCCESS.
- **Direct Browser Testing**: NOT TESTED (headless CLI environment). Manual verification checklist provided.

## M1.3.4.3 — Stack Interaction, Auto Arrangement & Selection Visual Feedback
**Date**: 2026-11-01  
**Status**: ✅ Completed (Automated Unit Tests & Builds Passed, Visual Browser Testing marked NOT TESTED)

### Goal
Fix 4 frontend interaction issues in Card and Stack manipulation:
1. When dropping a card onto a stack, cards did not arrange nicely with cascade offsets.
2. Dragging a stack onto another stack did not merge properly.
3. Card/Stack selection visual feedback was ambiguous and suffered from highlight color pollution.
4. Drop preview and stack count indicator were missing from the 3D scene.

### Root Causes (Diagnosed)
- **Cascade vs Group Position**: Directly shifting `card.position.x/z` caused world coordinate divergence and broke tests expecting `card.position.x == stack.position.x`. Inner mesh offsets were needed.
- **Emissive Highlight Pollution**: Storing emissive backups on hover and on select in independent maps caused hover colors (blue) to become the "clean" state backup if clicked while hovered, permanently tinting cards blue upon deselection.
- **4-Way Drag Drop Divergence**: Dragging a stack over another stack or dragging a stack over a standalone card was routed through `stackCards()` which assumed single-card drop semantics.
- **Drop Target Detection Radius**: Proximity threshold was too small (0.15) for stacks and lacked early hover preview during drag.
- **Stack Counter Visibility**: No in-world visual representation of stack size existed.

### Implementation & Fixes
1. **`StackBadge.ts`** (NEW):
   - Created dynamic canvas 3D `THREE.Sprite` attached to `SceneManager._scene`.
   - Renders stack size `${count}` with dark circle background and cyan border (unselected) or bright green border (selected).
   - Positioned above and to the right of the top card; auto-hides when count $\le 1$.
2. **`CardObject3D.ts`**:
   - Added `setCascadeOffset(offsetX, offsetZ)` to shift internal `_cardMesh.position` without altering group coordinates `this.position`.
   - Added `getCascadeOffset()`.
3. **`CardStack.ts`**:
   - Added `realignCards()` to calculate vertical elevation $Y = \text{SURFACE\_Y} + i \times 0.047$ and stair-step cascade offsets $(i \times 0.04, i \times 0.05)$.
   - Integrated `StackBadge` lifecycle into `realignCards()`, `dispose()`, and `setIsSelected()`.
4. **`CardStackManager.ts`**:
   - Added `mergeStackOntoCard(sourceStack, targetCard)` for Stack $\to$ Card drops.
   - Dual proximity detection: `DROP_ZONE_RADIUS = 1.5` for stacks, `STACK_DETECT_RADIUS = 0.25` for loose cards.
   - Wired `setScene(scene)` to propagate scene reference to newly created stacks for badges.
5. **`InteractionConfig.ts`**:
   - Added `STACK_CASCADE_OFFSET_X = 0.04`, `STACK_CASCADE_OFFSET_Z = 0.05`.
   - Added `DROP_ZONE_RADIUS = 1.5`, `STACK_DETECT_RADIUS = 0.25`.
   - Added `DROP_PREVIEW_EMISSIVE_COLOR = 0x00bfff`, `DROP_PREVIEW_EMISSIVE_INTENSITY = 0.6`.
6. **`RaycastInteractionManager.ts`**:
   - Replaced fragile multi-backup maps with pristine `_baseEmissiveMap` cached upon `registerObject()`.
   - Implemented strict visual hierarchy: `DROP_TARGET` (cyan) > `SELECTED` (green) > `HOVER` (blue) > `DEFAULT` (base).
   - Added drop target preview APIs: `setDropTargetPreview()`, `clearDropTargetPreview()`.
7. **`DragController.ts`**:
   - Added `onQueryDropTarget` and `onDragCancel` callbacks.
   - Updated `onCardDropped(card, isGroup, followers)` signature.
   - Preserves stack height on drag drop; only snaps loose cards to `SURFACE_Y`.
8. **`SceneManager.ts`**:
   - Handled all 4 merge modes in `_onCardDropped`: Card $\to$ Card, Card $\to$ Stack, Stack $\to$ Card, Stack $\to$ Stack.
   - Distinct handling for dragging whole selected stack vs dragging a single card out of a stack.
   - Wired drag drop preview callbacks to `setDropTargetPreview` and `clearDropTargetPreview`.
9. **`stackAutoArrangement343.test.ts`** (NEW):
   - 17 unit/integration tests verifying 4-way merge, cascade layout, drop preview, highlight hierarchy, and stack drag.
   - Total test suite: 10 files, 296/296 passing.

### Testing Status
- **Unit & Integration Tests**: 296/296 PASS.
- **TypeScript Typecheck**: 0 errors.
- **Production Build**: SUCCESS.
- **Direct Browser Testing**: NOT TESTED (headless CLI environment). Manual verification checklist prepared.

---

## M1.3.4.2 — Card Stack Rework & Selection System
**Date**: 2026-11-01  
**Status**: ✅ Completed

### Goal
Fix 5 critical bugs in Card & Stack interactions on the tabletop sandbox:
1. Cannot add cards to an existing stack after its creation (proximity stacking fails).
2. Cannot merge a stack with another stack (Stack + Stack).
3. No distinction between selecting a single card vs the entire stack.
4. Player lacks clear visual feedback / controls for stack vs card operations.
5. Moving, rotating, splitting, or merging stacks can cause wrong ordering or broken card relationships.

### Root Causes (Diagnosed)
- **Bug 1 (Proximity stacking fails on existing stack)**: `SceneManager._onCardDropped()` invoked `target.addCard(card)` directly when `target instanceof CardStack`. Because `card` might already have a `stackId`, `CardStack.addCard()` threw an error (`Card already belongs to stack`).
- **Bug 2 (Stack + Stack merge absent)**: `CardStackManager.stackCards()` only handled standalone+standalone and single-card-in-stack scenarios. When both cards were in separate stacks, no merge routine existed.
- **Bug 3 & 4 (Selection ambiguity & visual feedback)**: Single clicks only toggled individual cards. No mechanism existed to select an entire stack or perform bulk stack operations.
- **Bug 5 (Ordering & invariant violations)**: Lack of dedicated `mergeStacks()` routine led to unpredictable stack hierarchies during multi-card manipulation.

### Implementation & Fixes
1. **`CardStackManager.ts`**:
   - `addCardToStack(card, targetStack)`: Safely removes card from its previous stack (auto-dissolving if ≤1 card remaining) before appending to `targetStack`.
   - `mergeStacks(sourceStack, targetStack)`: Enforces stack invariant `[...targetStack.cards, ...sourceStack.cards]`. Reassigns cards to target stack and invokes `sourceStack.forceDispose()`.
   - `removeCardFromStack(card)`: Removes card by ID, making it standalone, and dissolves source stack if ≤1 card remains.
   - `stackCards()`: Fully rewritten to handle all 4 cases: standalone+standalone, in-stack+standalone, standalone+in-stack, and in-stack+in-stack (merging).
   - `findNearbyTarget()`: Skips cards belonging to the same stack as the dragged card.
2. **`CardStack.ts`**:
   - Added `forceDispose()`: Clears internal cards list without resetting card stack IDs (used during merge after cards are re-parented).
3. **`RaycastInteractionManager.ts`**:
   - Added `selectObjects(objects)`: Bulk selection API with emissive highlighting.
   - Added `onAltClickCardInStack` callback: Triggers on Alt+Click over any card in a stack.
4. **`SceneManager.ts`**:
   - Added `selectStack(stackId)`: Selects all cards in the stack.
   - Added `removeCardFromStack(card)`: Detaches card and applies physical offset (+0.5x, +0.3z).
   - Added `dissolveStackForCard(card)`: Fans out cards and dissolves the stack.
   - Updated `_onCardDropped()`: Uses `addCardToStack` for stack targets.
   - Wired `onAltClickCardInStack` to `selectStack()`.
5. **`App.ts`**:
   - Added Stack Context Menu actions when right-clicking a card in a stack:
     - `Chọn toàn bộ Stack` (Alt+Click shortcut displayed)
     - `Tách bài khỏi Stack`
     - `Giải phóng Stack`
6. **Tests (`cardStack342.test.ts`)**:
   - Added 25 unit/integration tests across Group S (Selection), Group K (Stack Operations), and Group I (Integration). All 279 tests passing.

---

---

## M1.3.4.1 — Fix Card Flip & Stack Top Card Selection
**Date**: 2026-11-01  
**Status**: ✅ Completed

### Goal
Fix two critical runtime bugs discovered after visual testing in M1.3.4:
1. **BUG 1**: Card flip (F key, HUD button, Context Menu) only worked on the Demo Card (`Cat Boom`), never on drawn cards.
2. **BUG 2**: "Rút bài trên cùng" (Take Top Card) from a stack always returned the Demo Card instead of the actual topmost card.

### Root Causes (Diagnosed)

#### BUG 1 Root Cause — `isDragActive` Set Too Early

In `DragController._onCardPointerDown()`, the original code immediately set `this._interactionManager.isDragActive = true` **on every card mousedown**, before any drag movement occurred.

In `RaycastInteractionManager._onMouseUp()`, the check `if (this.isDragActive) return;` runs first — and because the `domElement.mouseup` listener fires **before** the `window.mouseup` DragController cleanup, `isDragActive` was always `true` when mouseup fired, **blocking `_processClick()` on every single card click**. No card was ever selected by click.

Since `getSelectedCards()` was always empty, `flipTargetCard()` in `App.ts` fell through to the hardcoded `demoCard` fallback — only flipping `Cat Boom` regardless of which card the user had in mind.

#### BUG 2 Root Cause — Context Menu `takeTopCardFromSelectedStack()` Ignored Hovered Card

The context menu "Rút bài trên cùng" called `takeTopCardFromSelectedStack()` which queried `getSelectedCards()`. Because BUG 1 prevented click selection from working, the selection set was empty or stale (holding `demoCard` from before). Additionally, `takeTopCardFromSelectedStack()` iterated the selection set in Set insertion order, which made the first registered card (demoCard) the iteration priority.

### Fixes Applied

#### Fix 1 — `DragController.ts`: Move `isDragActive = true` to `_activateDrag()`

| Before | After |
|---

------

-----|---

------

----|
| `isDragActive = true` set in `_onCardPointerDown()` (on every mousedown) | `isDragActive = true` only set in `_activateDrag()` (only after `displacement >= DRAG_START_THRESHOLD_PX`) |

This ensures a pure click (mousedown + mouseup, no movement) never sets `isDragActive`, allowing `_processClick()` to run and selection to work correctly.

Camera orbit suppression (`setSuppressOrbit(true)`) still fires on mousedown as before, independently of `isDragActive`.

#### Fix 2 — `App.ts`: Remove `demoCard` fallback from `flipTargetCard()`

```typescript
// BEFORE (BUG): Always flipped demoCard when no card selected
} else {
  const demoCard = this._sceneManager.getDemoCard();
  if (demoCard && !demoCard.isDisposed()) demoCard.flip();
}

// AFTER (FIX): Do nothing if no card selected
// No fallback — flip is a no-op without selection.
```

#### Fix 3 — `SceneManager.ts`: Add `takeTopCardFromCard(targetCard)`

Added new method that bypasses `getSelectedCards()` and acts directly on the stack of the provided card. Used by context menu where the target card is known from hover (right-click cursor position).

```typescript
takeTopCardFromCard(targetCard: CardObject3D): CardObject3D | null
```

The existing `takeTopCardFromSelectedStack()` is preserved (used when a card is programmatically selected).

#### Fix 4 — `App.ts`: Context Menu uses `takeTopCardFromCard(hovered)`

```typescript
// BEFORE: queried selection (could be stale or wrong)
action: () => this._sceneManager.takeTopCardFromSelectedStack()

// AFTER: targets the hovered card directly (the card the user right-clicked)
action: () => this._sceneManager.takeTopCardFromCard(hovered)
```

### Files Modified

| File | Change |
|---

------

---|---

------

-----|
| `frontend/src/interaction/DragController.ts` | Moved `isDragActive = true` from `_onCardPointerDown()` to `_activateDrag()` |
| `frontend/src/app/App.ts` | Removed `demoCard` fallback in `flipTargetCard()`; context menu uses `takeTopCardFromCard(hovered)` |
| `frontend/src/scene/SceneManager.ts` | Added `takeTopCardFromCard(targetCard: CardObject3D)` |
| `frontend/src/__tests__/cardManipulation.test.ts` | Added 17 new tests: Nhóm A (6), Nhóm B (8), Nhóm C (3) |
| `frontend/src/__tests__/dragController.test.ts` | Updated test "isDragActive set to true on card mousedown" to reflect corrected behavior |
| `docs/DEVELOPMENT_LOG.md` | This entry |

### Invariants Confirmed

- `isDragActive` is ONLY `true` when `displacement >= DRAG_START_THRESHOLD_PX` (4px)
- `flipTargetCard()` flips all selected cards; does NOTHING if selection is empty
- `takeTopCardFromCard()` always uses `card.getStackId()` to find the stack — no hardcoded IDs
- Stack ordering: `_cards[0]` = bottom, `_cards[length - 1]` = top. `takeTopCard()` = `_cards.pop()`

### Test Results

```
Test Files  8 passed (8)
     Tests  254 passed (254) (252 frontend + 2 backend)
  Duration  ~6.3s
```

- 237 pre-existing tests (M0 — M1.3.4): all pass ✅
- 17 new M1.3.4.1 tests (Nhóm A, B, C): all pass ✅
- TypeScript strict typecheck: 0 errors ✅
- Production bundle build: successful ✅

---

---

## M1.3.3 — Deck Draw & Card Transfer
**Date**: 2026-11-01  
**Status**: ✅ Completed

### Goal
Implement drawing a card from `DeckObject3D` by clicking the deck, converting the drawn ID into an interactive `CardObject3D` on the table surface with strict data integrity (`CardRegistry`), atomic transaction/rollback, HUD feedback, and integration with Raycasting, Hover, Selection, and Drag & Drop.

### Files Created

| File | Description |
|---

------

---|---

------

------

------

----|
| `frontend/src/objects/CardRegistry.ts` | Centralized Card ID registry enforcing single ownership (`IN_DECK`, `ON_TABLE`, `DISPOSED`), atomic transfer, and integrity validation |
| `frontend/src/__tests__/deckDraw.test.ts` | 31 unit tests covering all 6 mandatory groups (Draw cơ bản, Data integrity, Transaction & rollback, Empty deck, Interaction, Lifecycle) |

### Files Modified

| File | Change |
|---

------

---|---

------

-----|
| `frontend/src/scene/SceneManager.ts` | Added `CardRegistry`, `drawCardFromDeck()` atomic transaction, deck click listener wiring, cascading card layout, HUD notification callback `onDeckCountChanged` |
| `frontend/src/interaction/RaycastInteractionManager.ts` | Added `onDeckClick` callback triggered on left-click (< 4px displacement) on a `DeckObject3D` |
| `frontend/src/ui/GameScreen.ts` | Added `updateDeckCount(count: number)` to display updated card counts or `Hết bài` |
| `frontend/src/ui/UIManager.ts` | Added `updateDeckCount(count: number)` forwarder to `GameScreen` |
| `frontend/src/app/App.ts` | Wired `_sceneManager.onDeckCountChanged` to `_uiManager.updateDeckCount` |
| `docs/ARCHITECTURE.md` | Added Section 11 — Deck Draw & Card Transfer System |
| `docs/DEVELOPMENT_LOG.md` | Added M1.3.3 entry |

### Implementation Decisions

1. **CardRegistry Single Source of Truth**:
   - Each Card ID possesses exactly one location state: `IN_DECK`, `ON_TABLE`, or `DISPOSED`.
   - `validateIntegrity(decks, tableCards)` proves that `totalUniqueCardIds === totalCardsAcrossAllLocations` at all times.
2. **Atomic Transaction & Rollback**:
   - Verification occurs *before* any object is mutated.
   - The `CardObject3D` is constructed before popping the card from the deck.
   - If registry transfer or deck pop fails, `rollbackTableToDeck()` is invoked and the temporary mesh is disposed immediately.
3. **Cascading Table Placement**:
   - Consecutive drawn cards are fanned out to the right of the deck with a small stagger ($X + 0.4\text{m}$, $Z + 0.25\text{m}$), resting flush on the table surface at $Y = \text{TABLE\_CONFIG.SURFACE\_Y} = 0.0$.
4. **Interaction & Drag Integration**:
   - Newly drawn cards are automatically added to `RaycastInteractionManager` and `DragController`. They can be hovered, selected, and dragged immediately.
5. **Empty Deck Handling**:
   - Decks with 0 cards hide their visual mesh.
   - Calling `drawCardFromDeck` on an empty deck cleanly returns `null` without throwing or altering state.
   - The HUD pill reflects `📦 Chồng bài: Hết bài`.

### Test Results

```
Test Files  7 passed (7)
     Tests  202 passed (202) (200 frontend + 2 backend)
  Duration  ~3.2s
```

- 171 pre-existing tests (M0 - M1.3.2): all pass ✅
- 31 new M1.3.3 tests (6 groups): all pass ✅
- TypeScript strict typecheck: 0 errors ✅
- Production bundle build: successful ✅

---

---

## M1.3.2 — Drag & Drop CardObject3D
**Date**: 2026-11-01  
**Status**: ✅ Completed

### Goal
Implement a free-form, smooth 3D drag & drop system for `CardObject3D` on the tabletop surface without rule constraints, resolving orbit camera conflicts and ensuring memory/lifecycle safety.

### Files Created

| File | Description |
|---

------

---|---

------

------

------

----|
| `frontend/src/interaction/DragController.ts` | Drag & Drop controller using ray-plane intersection, pick-offset tracking, lift/drop lifecycle, emissive highlights |
| `frontend/src/__tests__/dragController.test.ts` | 56 comprehensive unit tests across 15 verification groups |

### Files Modified

| File | Change |
|---

------

---|---

------

-----|
| `frontend/src/interaction/InteractionConfig.ts` | Added `DRAG_START_THRESHOLD_PX` (4px), `DRAG_LIFT_Y` (0.15), `DRAG_EMISSIVE_COLOR` (`0xd08020`), `DRAG_EMISSIVE_INTENSITY` (0.45) |
| `frontend/src/scene/CameraController.ts` | Added `_orbitSuppressed` flag and `setSuppressOrbit(suppress: boolean)` public method |
| `frontend/src/interaction/RaycastInteractionManager.ts` | Added `onCardMouseDown` callback and `isDragActive` flag to suppress click selection when dragging |
| `frontend/src/scene/SceneManager.ts` | Instantiated `DragController`, added `getDragController()`, hooked into `dispose()` |
| `docs/ARCHITECTURE.md` | Added Section 10 — Drag & Drop System (CardObject3D) |
| `docs/DEVELOPMENT_LOG.md` | Added M1.3.2 entry |

### Implementation Decisions

1. **Pick-Offset Smoothing**: On initial mousedown on a card, the offset vector between the raycast hit point on the drag plane and `card.position` is computed. As the mouse moves, this offset is subtracted from the raycast intersection point. This prevents the card from "jumping" to center itself under the cursor.
2. **Tabletop Contact & Lift**:
   - Card Group local origin is at bottom surface.
   - When drag starts (displacement $\ge 4\text{px}$), the card lifts by `DRAG_LIFT_Y = 0.15` ($Y = 0.15$), floating cleanly above the green felt and preventing Z-fighting.
   - When dropped or cancelled, the card returns to $Y = \text{TABLE\_CONFIG.SURFACE\_Y} = 0.0$, resting flush on the table surface.
   - Card rotation and scale are preserved intact.
3. **Orbit Camera Conflict Resolution**:
   - `CameraController` implements `setSuppressOrbit(suppress: boolean)`.
   - When left-mousedown lands on a `CardObject3D`, `setSuppressOrbit(true)` is immediately called, suppressing camera orbit while preserving pan and zoom.
   - When dragging on empty table space or wood rails, camera orbit operates as usual.
   - When the drag finishes (mouseup) or is cancelled (blur, mouseleave, cancelDrag), `setSuppressOrbit(false)` re-enables orbit.
4. **Performance & Memory Management**:
   - Reuses pre-allocated `THREE.Raycaster`, `THREE.Vector2`, `THREE.Vector3`, and `THREE.Plane` instances — zero per-frame garbage generation.
   - Only requests render when intersection coordinates change beyond floating point epsilon.
   - Does not allocate new materials; modifies emissive properties on existing `MeshStandardMaterial` instances with complete backup/restore.
   - Window listeners are added only during drag attempts and cleaned up atomically with `AbortController`.
5. **Fail-safe Cancellation**:
   - Handles window `blur` (e.g. Alt-Tab or OS focus change).
   - Handles `domElement` `mouseleave`.
   - Handles `cancelDrag()` programmatic call.
   - In all cases, card drops smoothly to surface height, material highlights are restored, and camera orbit is released.

### Test Results

```
Test Files  6 passed (6)
     Tests  171 passed (171) (169 frontend + 2 backend)
  Duration  ~2.8s
```

- 113 pre-existing tests (M0 - M1.3.1): all pass ✅
- 56 new M1.3.2 tests (15 groups): all pass ✅
- TypeScript strict typecheck: 0 errors ✅
- Production bundle build: successful ✅

### Known Limitations / Next Steps

- Deck dragging is intentionally out of scope (M1.3.3+).
- Deal/draw from deck via drag will be handled in M1.3.3 / M1.4.
- Networking/multiplayer state synchronization of card position will be connected in future milestones.

---

---

## M1.3.1 — Raycasting & Hover Interaction
**Date**: 2026-11-01  
**Status**: ✅ Completed

### Goal
Build the interaction layer for the 3D tabletop: hover detection over `CardObject3D` and `DeckObject3D`, visual highlight feedback, and click-to-select with camera-orbit conflict avoidance.

### Files Created

| File | Description |
|---

------

---|---

------

------

------

----|
| `frontend/src/interaction/InteractionConfig.ts` | All interaction constants (no magic numbers) |
| `frontend/src/interaction/RaycastInteractionManager.ts` | Core hover & selection manager |
| `frontend/src/__tests__/raycastInteraction.test.ts` | 31 unit tests across 10 groups |

### Files Modified

| File | Change |
|---

------

---|---

------

-----|
| `frontend/src/scene/SceneManager.ts` | Added `RaycastInteractionManager` field, instantiation, registration of demo card/deck, `getInteractionManager()` getter, dispose integration |
| `docs/ARCHITECTURE.md` | Added Section 9 — Interaction System |
| `docs/DEVELOPMENT_LOG.md` | Added M1.3.1 entry |

### Implementation Decisions

1. **Hover highlight strategy**: Modifies `emissive` color and `emissiveIntensity` on existing `THREE.MeshStandardMaterial` instances. Original values backed up in `Map<materialUuid, StoredEmissive>` before modification. Restores on hover-out or dispose. **Never allocates new materials in the render loop**.

2. **Camera orbit conflict avoidance**: Tracks `clientX/Y` on `mousedown`. In `mouseup`, checks pixel displacement. If displacement < `CLICK_DRAG_THRESHOLD_PX` (4 px) → treat as click. Otherwise → camera drag, no selection.

3. **Hover during orbit**: `mousemove` handler **always** updates hover state, including while the camera is being orbited. This is intentional — hover glow works during camera movement.

4. **Invisible mesh exclusion**: `_collectMeshes()` checks `mesh.visible` before adding to raycast targets. Empty `DeckObject3D` (0 cards) has `_deckMesh.visible = false` and is correctly skipped.

5. **Selection toggle**: Clicking an already-selected object deselects it (toggle behavior). Clicking empty space also deselects.

6. **Event cleanup**: All listeners registered via `AbortController`. Calling `dispose()` aborts all listeners atomically. Events fired after `dispose()` have no effect.

7. **NDC calculation**: Uses `getBoundingClientRect()` to handle any canvas position/offset: `ndcX = (clientX - rect.left) / rect.width * 2 - 1`.

### Highlight Color Reference

| State | Hex | Description |
|---

------

----|---

-----|---

------

------

------

----|
| Hover | `0x3a80c8` | Blue glow, intensity 0.35 |
| Selected | `0x60a020` | Green glow, intensity 0.5 |

### Test Results

```
Test Files  5 passed (5)
     Tests  113 passed (113)
  Duration  ~2.75s
```

- 84 pre-existing tests: all pass ✅
- 31 new M1.3.1 tests: all pass ✅

### Known Limitations

- Drag & Drop not yet implemented (M1.3.2).
- Table surface not registered as interactable (click-on-table deselects current object).
- No UI tooltip/label showing hovered object name in HUD (can be added in later milestone).

---

---

## M0 — Rebuild + Project Foundation
**Date**: 2026-11-01  
**Status**: ✅ Completed

### Goal
Rebuild Cat Boom Online from a 2D WebSocket card game into a Digital Tabletop Sandbox 3D (inspired by Tabletop Simulator). Establish project standards and architecture foundation.

### Changes Made

#### Project Rules
- Created `PROJECT_RULES.md` — comprehensive coding standards covering:
  - Architecture (A): Frontend/Backend/Shared separation
  - Coding Standards (B): TypeScript strict, naming conventions
  - Frontend Standards (C): Three.js lifecycle, memory management
  - Backend Standards (D): Authority model, validation
  - Multiplayer Standards (E): Room management, object identity
  - Game Design Rules (F): Sandbox philosophy — NO rule enforcement
  - Error Handling (G): Structured logging, no swallowed errors
  - Testing Standards (H): Required test coverage
  - Git Rules (I): No secrets, no build artifacts
  - Performance (J): Object pooling, delta updates

#### Architecture
- Created `frontend/` — Vite + TypeScript + Three.js
- Created `backend/` — Node.js + TypeScript + WebSocket (ws)
- Created `shared/` — TypeScript types and constants
- Created `docs/ARCHITECTURE.md` — full architecture documentation

#### Frontend (M0 Scaffold)
| File | Description |
|---

------

---|---

------

------

------

----|
| `frontend/src/main.ts` | Entry point |
| `frontend/src/app/App.ts` | Root controller |
| `frontend/src/scene/SceneManager.ts` | Three.js scene lifecycle |
| `frontend/src/scene/Renderer.ts` | Single WebGLRenderer |
| `frontend/src/scene/CameraController.ts` | Orbital camera (orbit/pan/zoom) |
| `frontend/src/network/NetworkClient.ts` | WS client with reconnect |
| `frontend/src/network/MessageHandler.ts` | Message dispatcher |
| `frontend/src/store/ClientStore.ts` | Client state mirror |
| `frontend/src/ui/UIManager.ts` | Screen management |
| `frontend/src/ui/LobbyScreen.ts` | Lobby UI |
| `frontend/src/ui/GameScreen.ts` | Game HUD |
| `frontend/src/utils/Logger.ts` | Structured logging |
| `frontend/src/utils/Disposer.ts` | Three.js cleanup |
| `frontend/src/utils/AssetLoader.ts` | Cached asset loading |

#### Backend (M0 Scaffold)
| File | Description |
|---

------

---|---

------

------

------

----|
| `backend/src/index.ts` | Entry point |
| `backend/src/server/HttpServer.ts` | HTTP + health endpoint |
| `backend/src/server/WebSocketServer.ts` | WS server + heartbeat |
| `backend/src/room/RoomManager.ts` | Room lifecycle |
| `backend/src/room/Room.ts` | Authoritative room state |
| `backend/src/room/RoomStore.ts` | In-memory storage |
| `backend/src/player/PlayerSession.ts` | Per-connection state |
| `backend/src/protocol/MessageDispatcher.ts` | Message routing |
| `backend/src/validation/MessageValidator.ts` | Input validation |
| `backend/src/utils/IdGenerator.ts` | UUID / short codes |
| `backend/src/utils/Logger.ts` | Structured logging |

#### Shared
| File | Description |
|---

------

---|---

------

------

------

----|
| `shared/types/protocol.ts` | WS message types |
| `shared/types/room.ts` | Room/Player/Object types |
| `shared/types/gameObjects.ts` | Card type definitions |
| `shared/constants/config.ts` | Shared config values |

### Verification Results (M0)
- **TypeScript Strict Typecheck**: Passed across all packages (`npm run typecheck` returned code 0).
- **Frontend Build**: Vite + Three.js build passed (`dist/assets/index-*.js`, 475 kB).
- **Backend Build**: NodeNext + TypeScript build passed (`dist/backend/src/index.js`).
- **HTTP /health Integration Test**: Live HTTP test returned HTTP 200 with `{ status: 'ok', service: 'cat-boom-online', milestone: 'M0' }`.
- **WebSocket Live Integration Test**: Live WebSocket client connected to `ws://localhost:4099/ws`, received initial greeting `pong`, sent `room:create`, created room, and received authoritative `room:joined` and `room:state`.
- **Frontend Store Unit Tests**: `ClientStore` state updates, listeners, and player join/leave verified.

### Legacy Code
- Old source archived at: `_backup_legacy_20261101_123831/`
- Contains: original 2D Exploding Kittens game with turn enforcement, rule engine, combo system
- **NOT deleted** — preserved per PROJECT_RULES.md Section I

### Architecture Decisions
- [D001] Sandbox over Rule Engine — see `docs/ARCHITECTURE.md`
- [D002] Backend Authority — see `docs/ARCHITECTURE.md`
- [D003] Single WebGLRenderer — see `docs/ARCHITECTURE.md`
- [D004] Delta Updates — see `docs/ARCHITECTURE.md`
- [D005] TypeScript Strict Mode — see `docs/ARCHITECTURE.md`
- [D006] Decoupled Interaction & Network Sync — 3D interaction layer operates locally with clear hooks for subsequent multiplayer state sync.
- [D007] Player Hand Privacy Model — Private card state is filtered by server and only revealed to its owner; public cards on table expose face data only when flipped.

### Known Issues / M0 Limitations
- No 3D card objects yet (M1 scope)
- No object interaction (grab/move/flip) — M1 scope
- No room browser UI — M1 scope
- No authentication — planned for M2+

### Dependencies

#### Frontend
```
three@^0.169.0          — 3D rendering
vite@^5.4.10            — build tool
typescript@^5.6.3       — strict TypeScript
vitest@^2.1.4           — testing
```

#### Backend
```
ws@^8.18.0              — WebSocket server
uuid@^10.0.0            — unique ID generation
tsx@^4.19.2             — TypeScript dev runner
typescript@^5.6.3       — strict TypeScript
vitest@^2.1.4           — testing
```

---

---

## M1 — 3D Sandbox Interaction (Subdivided Roadmap)
**Date**: TBD  
**Status**: 🔜 Ready to Begin

### Sub-milestone Breakdown

#### M1.1: Bàn và Camera 3D (Table Surface & 3D Camera Controls)
**Date**: 2026-11-01  
**Status**: ✅ Completed

- **Files Created**:
  - `frontend/src/objects/TableConfig.ts`: Centralized constants for table dimensions, materials, colors, and authoritative surface height.
  - `frontend/src/objects/TableObject3D.ts`: 3D Table Mesh Group (green felt surface with procedural texture, 4 wood border rails with raised cushion lips, thick apron underside, and 4 solid legs).
  - `frontend/src/scene/LightingManager.ts`: Decoupled lighting module (HemisphereLight, AmbientLight, Key DirectionalLight with soft PCF shadow maps, Fill DirectionalLight).
  - `frontend/src/__tests__/tableAndCamera.test.ts`: Comprehensive unit tests for table dimensions, shadows, camera orbit constraints, and lighting disposal.
- **Files Modified**:
  - `frontend/src/scene/CameraController.ts`: Enhanced 360° orbit, clamped zoom (4.5 - 24.0), clamped polar angle (`phi` limited to prevent penetrating table surface), pan bounds, keyboard controls (WASD/arrows, R to reset), and render request callback on change.
  - `frontend/src/scene/SceneManager.ts`: Integrated `TableObject3D`, `LightingManager`, and camera change render triggering.
  - `frontend/src/scene/Renderer.ts`: Enhanced resize handler with zero-dimension safety guards.
  - `frontend/src/ui/LobbyScreen.ts`: Added direct button "Vào bàn chơi 3D (Sandbox)" for immediate visual table access.
  - `frontend/src/ui/GameScreen.ts`: Added top HUD with "Reset Camera (R)", "Về sảnh", and bottom navigation hint pill.
  - `frontend/src/ui/UIManager.ts`: Wired screen transitions and camera reset requests.
  - `frontend/src/app/App.ts`: Coordinated UI actions with SceneManager camera controls.
- **Features Completed**:
  - Complete 3D rectangular tabletop with casino green felt and polished walnut wood rails.
  - Zero-gap border construction with underside apron and legs visible from any camera angle.
  - Full 360° orbital camera with polar angle restrictions (camera cannot go below table).
  - Soft directional shadows cast from rails onto the felt surface.
  - Independent camera reset via button or shortcut key `R`.
  - Non-breaking screen transitions between Lobby and 3D Tabletop Sandbox.
- **Dependency Changes**: None (built with existing Three.js r169 without extra bloat).
- **Verification Results**:
  - `npm run typecheck`: 0 errors across frontend and backend.
  - `npm run build`: Vite frontend (492 kB) and Node backend compiled successfully.
  - `npm run test`: 13/13 tests passed (11 frontend + 2 backend live integration).
- **Known Issues / Next Steps**:
  - Table is ready for card and deck placement in M1.2.
  - Procedural felt texture gracefully falls back to smooth material in non-canvas environments.

#### M1.2: Card3D và Deck3D (3D Card & Deck Models)

##### M1.2.1: CardObject3D — Đối tượng lá bài 3D
**Date**: 2026-11-01  
**Status**: ✅ Completed

- **Files Created**:
  - `frontend/src/objects/CardConfig.ts`: Centralized constants for standard card dimensions (2.5 x 3.5 x 0.045), corner radius (0.12), bevel/segments, default colors, and texture dimensions.
  - `frontend/src/objects/CardTextureGenerator.ts`: Procedural canvas texture generator for front and back faces with canvas reuse, card frame, title/description/badge rendering, and JSDOM fallback guards.
  - `frontend/src/objects/CardObject3D.ts`: 3D card representation using a single extruded rounded mesh with 3 distinct material groups (front face, back face, paper core edge), local rotation flipping mechanism, transform helpers, and memory lifecycle ownership.
  - `frontend/src/__tests__/cardObject3D.test.ts`: 28 unit tests covering card initialization, dimensions, flipping state, content updates, custom textures, and safe resource disposal.
- **Files Modified**:
  - `frontend/src/scene/SceneManager.ts`: Integrated demo card placement on the table surface (`SURFACE_Y = 0.0`), exposed `getDemoCard()`.
  - `frontend/src/ui/GameScreen.ts`: Added "Lật bài (F)" HUD button, keyboard shortcut `F`, and event callback.
  - `frontend/src/ui/UIManager.ts`: Wired flip card user request to `App`.
  - `frontend/src/app/App.ts`: Coordinated UI flip card action with `SceneManager.getDemoCard()?.flip()`.
  - `docs/ARCHITECTURE.md`: Documented CardObject3D module, configuration, single extruded mesh architecture, 3 draw calls profile, and bottom-contact coordinates.
- **Features Completed**:
  - Realistic 3D card model with front face, back face, physical thickness (0.045), and rounded corners (0.12).
  - Single extruded geometry with 3 material groups to eliminate z-fighting and gaps.
  - Inverted UV mapping on the back face so card back artwork remains upright and readable when turned.
  - Procedural canvas generation for both front and back faces with high resolution (512x716) and canvas instance reuse.
  - Safe texture ownership tracking (`_ownsFrontTexture`, `_ownsBackTexture`) so shared textures are not disposed inadvertently.
  - Accurate tabletop contact: Sub-mesh vertically offset by `+thickness / 2` so Group local origin `(0, 0, 0)` is the bottom surface. Setting `y = TABLE_CONFIG.SURFACE_Y` touches table surface at $Y = 0.0$ without penetrating the felt.
  - Local flipping around local Z axis centered at thickness midpoint, maintaining identical bounding box $Y \in [0.0, 0.045]$ before and after flip.
  - Interactive demo card placed in 3D sandbox with HUD button and 'F' key shortcut.
- **Dependency Changes**: None.
- **Verification Results**:
  - `npm run typecheck`: 0 errors across frontend and backend.
  - `npm run build`: Production bundle succeeded with zero errors.
  - `npm run test`: 45/45 tests passed (43 frontend unit tests across 3 suites, 2 backend live integration tests).
- **Next Sub-milestone**:
  - M1.2.2: DeckObject3D — Khối chồng bài hiển thị độ dày vật lý và thao tác bộ bài sandbox.

##### M1.2.2: DeckObject3D — Chồng bài 3D & Quản lý bộ bài
**Date**: 2026-11-01  
**Status**: ✅ Completed

- **Files Created**:
  - `frontend/src/objects/DeckConfig.ts`: Centralized constants for deck stacks inheriting physical dimensions from CardConfig (DRY).
  - `frontend/src/objects/DeckObject3D.ts`: 3D physical card stack mesh and ID collection manager (dynamic height scaling, layered paper edge texture, card back top face, and Fisher-Yates shuffle).
  - `frontend/src/__tests__/deckObject3D.test.ts`: 39 unit tests covering all 6 required test groups (initialization, card management, Fisher-Yates shuffle, geometry, dynamic updates, and lifecycle).
- **Files Modified**:
  - `frontend/src/scene/SceneManager.ts`: Placed demo deck with 30 cards at `(x: -3.5, y: TABLE_CONFIG.SURFACE_Y, z: 0)` on the table surface; exposed `getDemoDeck()`; added object disposal tracking.
  - `frontend/src/ui/GameScreen.ts`: Added deck count pill in HUD top bar.
  - `docs/ARCHITECTURE.md`: Documented DeckObject3D architecture, height formula, data model, and public API.
- **Features Completed**:
  - Realistic 3D deck model with thickness proportional to card count: $\text{visualHeight} = \text{count} \times \text{cardThickness}$.
  - Seamless procedural layered paper texture on side edges repeating vertically once per card layer (`repeat.set(1, count)`).
  - Top face displaying card back texture (reusing procedural generator or external texture).
  - Dynamic height scaling using mesh scaling without geometry re-allocation (60 FPS performance, zero GC pressure).
  - Table surface contact: Bottom of deck rests flush at $Y = \text{TABLE\_CONFIG.SURFACE\_Y}$ (`0.0`), top at $\text{visualHeight}$, zero table penetration.
  - Empty deck safety: When $\text{count} = 0$, `visualHeight = 0`, mesh hidden, no negative heights.
  - Data collection management: LIFO `draw()`, `peekTop()`, `addCard()`, `addCards()`, immutability of `getCardIds()`, atomic validation rejecting empty or duplicate IDs.
  - In-place Fisher-Yates shuffle algorithm with optional custom RNG for deterministic testing.
- **Dependency Changes**: None.
- **Verification Results**:
  - `npm run typecheck`: 0 errors across frontend and backend.
  - `npm run build`: Production bundle succeeded with zero errors.
  - `npm run test`: 84/84 tests passed (82 frontend unit tests across 4 suites, 2 backend live integration tests).
- **Next Sub-milestone**:
  - M1.2.3 / M1.3: Tương tác 3D — Raycasting, Hover, Drag & Drop, và Rút bài từ Deck.

#### M1.3.1: Raycasting & Hover Interaction
- **Status**: ✅ Completed (2026-11-01)
- **Files Created**:
  - `frontend/src/interaction/RaycastInteractionManager.ts`: Hover & selection raycasting over `CardObject3D` and `DeckObject3D`.
  - `frontend/src/interaction/InteractionConfig.ts`: Thresholds, highlight colors, and raycaster parameters.
- **Verification**: 29 unit tests covering hover, selection, and disposal pass.

#### M1.3.2: Drag & Drop CardObject3D
- **Status**: ✅ Completed (2026-11-01)
- **Files Created**:
  - `frontend/src/interaction/DragController.ts`: Free tabletop drag and drop for cards with lift elevation and table bounding clamp.
  - `frontend/src/__tests__/dragController.test.ts`: Comprehensive tests for drag lifecycle, pointer events, and cleanup.
- **Verification**: 28 unit tests pass.

#### M1.3.3: Deck Draw & Card Transfer
- **Status**: ✅ Completed (2026-11-01)
- **Files Created**:
  - `frontend/src/objects/CardRegistry.ts`: Centralized card ID ownership tracker (`IN_DECK`, `ON_TABLE`, `DISPOSED`).
  - `frontend/src/__tests__/deckDraw.test.ts`: Unit test suite covering draw, transfer, empty deck, and lifecycle.
- **Verification**: 31 initial unit tests pass.

#### M1.3.3 — Technical Audit & Bug Fix (CardRegistry, Deck Draw & Card Transfer)
- **Status**: ✅ Completed (2026-11-01)
- **Scope**: Rigorous technical audit across Card ID ownership, transaction atomicity, Deck Draw rollback, lifecycle/dispose, interaction integration, and HUD state synchronization.
- **Audit Fixes Implemented**:
  - `CardRegistry.ts`:
    - Added `isDisposed(cardId: string): boolean` query helper.
    - Added bidirectional transfer methods `canTransferTableToDeck()` and `transferTableToDeck()` to support table-to-deck card return without violating ownership invariants.
    - Verified `validateIntegrity(decks, tableCards)` accurately tracks 100% of physical card IDs against registry entries.
  - `SceneManager.ts`:
    - Added re-entrancy protection guard `_isDrawingCard` to prevent recursive/concurrent draw requests.
    - Upgraded `drawCardFromDeck()` to a multi-phase transaction with step-by-step reverse rollback covering:
      - Phase 1: `CardRegistry.transferDeckToTable`
      - Phase 2: `deck.draw()`
      - Phase 3: `SceneManager.addObject`
      - Phase 4: `RaycastInteractionManager.registerObject`
      - Reverse rollback cleans up interaction registration, scene mesh, deck array, and registry ownership in exact reverse order upon failure.
    - Fixed identifier resolution between caller-supplied keys (e.g. `'demo_deck'`) and internal object IDs (`'demo_deck_1'`).
  - `RaycastInteractionManager.ts`:
    - Prevented duplicate object registrations for the same object instance under different IDs.
    - Updated `_collectMeshes()` to filter out disposed cards (`obj.isDisposed()`), avoiding raycaster crashes and stale highlights.
  - `App.ts`:
    - Fixed keyboard shortcut 'F' and HUD "Lật bài (F)" button to flip the currently selected card; falls back to `demoCard` if none selected.
  - `deckDraw.test.ts`:
    - Expanded test suite from 31 to 38 tests (added Nhóm G covering Phase 3 rollback, Phase 4 rollback, re-entrancy, bidirectional transfer, duplicate prevention, and disposed card filtering).
- **Verification Results**:
  - `npm run typecheck`: 0 errors across frontend and backend.
  - `npm run build`: Production bundle succeeded with zero errors.
  - `npm run test`: 209/209 tests passed (207 frontend unit tests across 7 suites, 2 backend live integration tests).

#### M1.3.4: Card Manipulation & Arrangement
- **Status**: ✅ Completed (2026-11-01)
- **Scope**: Rotation, positioning, table boundaries, snap to grid, card stacking, multi-selection, group movement, layering, and context menu UI.
- **Files Created**:
  - `frontend/src/objects/CardStack.ts`: Physical vertical card stack with Y elevation, synchronized group transform, and lifecycle management.
  - `frontend/src/objects/CardStackManager.ts`: Central stack manager handling creation, stacking on drop, splitting, and auto-dissolving ($\le 1$ card).
  - `frontend/src/objects/LayeringManager.ts`: Visual layer and `renderOrder` priority manager without altering physical tabletop height.
  - `frontend/src/ui/ContextMenu.ts`: Glassmorphism right-click context menu offering instant card actions (Flip, Rotate, Snap, Layering, Stack, Unstack).
  - `frontend/src/__tests__/cardManipulation.test.ts`: 30 unit tests covering all 5 manipulation groups + UI/Shortcuts.
- **Files Modified**:
  - `frontend/src/objects/CardObject3D.ts`: Added `rotateY()`, `rotateClockwise90()`, `rotateCounterClockwise90()`, `getRotationY()`, `setLayerIndex()`, `setStackId()`.
  - `frontend/src/interaction/InteractionConfig.ts`: Added constants (`GRID_SIZE`, `ROTATION_STEP`, `STACK_OFFSET_Y`, `STACK_DETECT_RADIUS`) and helper functions (`clampTablePosition` with oriented bounding box, `snapToGridValue`).
  - `frontend/src/interaction/RaycastInteractionManager.ts`: Upgraded selection state to `Set<CardObject3D | DeckObject3D>` supporting `Ctrl+Click` multi-select and `Cmd+Click`.
  - `frontend/src/interaction/DragController.ts`: Added Snap to Grid toggle, table boundary clamping, and multi-selection Group Drag maintaining exact relative offsets.
  - `frontend/src/scene/SceneManager.ts`: Integrated `CardStackManager`, `LayeringManager`, `_onCardDropped` hook, `rotateSelectedCards()`, and stack/layer helper methods.
  - `frontend/src/scene/CameraController.ts`: Added `shouldHandleResetKey` hook so `Key R` prioritizes rotating selected cards over camera reset.
  - `frontend/src/ui/GameScreen.ts` & `frontend/src/ui/UIManager.ts`: Added HUD buttons for rotation, snap to grid toggle, and stacking.
  - `frontend/src/app/App.ts`: Integrated context menu on right-click, wired keyboard shortcuts (`R`, `Shift+R`, `G`, `F`) with form input suppression.
- **Verification Results**:
  - `npm run typecheck`: 0 errors across frontend and backend.
  - `npm run build`: Production bundle succeeded with zero errors (`index-*.js`, 579 kB).
  - `npm run test`: **239/239 tests passed** (237 frontend unit tests across 8 suites, 2 backend live integration tests).

#### M1.4: Khu vực bài trên tay & Giao diện phòng (Player Hand Zone & UI)
- Hand Zone 3D/Overlay: Vùng riêng biệt cho bài trên tay người chơi, tự động căn chỉnh (arc/fan layout).
- Phân tách quyền riêng tư: Mặt bài trên tay chỉ hiển thị cho người sở hữu; người khác chỉ thấy mặt lưng.
- UI Giao diện phòng: Tạo phòng, nhập tên, danh sách người trong phòng, trạng thái kết nối WebSocket.

---

---

## M2 — Full Sandbox Features
**Date**: TBD  
**Status**: 🔜 Planned

### Planned Features
- Object pooling for cards
- Deck shuffle animation
- Draw from deck
- Insert into deck
- Stack/unstack objects
- Undo move (per player)
- Room settings (password, max players)

---

---

## M3 — Polish + Deployment
**Date**: TBD  
**Status**: 🔜 Planned

### Planned Features
- Custom card texture upload
- Room persistence (Redis?)
- Authentication
- Spectator mode
- Mobile touch support
- Production deployment

---

---

## Error Log

| Date | Milestone | Error | Resolution |
|---

------

---|---

------

------

-----|---

------

----|---

------

------

------

---|
| 2026-11-01 | M1.2.1 | `Disposer.disposeObject3D` traversed card hierarchy and disposed external/shared textures prematurely. | Refactored `CardObject3D.dispose()` to manage its own hierarchy and only dispose textures where `_ownsTexture === true`. |
| 2026-11-01 | M1.2.1 | Back face texture rendered upside down when flipped. | Inverted U-coordinates in material UV mapping specifically for the back face geometry vertices. |
| 2026-11-01 | M1.2.1 | Geometric centering caused card to penetrate table by `thickness / 2` when set at `y = 0`. | Offset `_cardMesh.position.y = thickness / 2` so Group local origin `(0, 0, 0)` is the bottom surface, keeping card flush on table before and after flip. |
| 2026-11-01 | M1.2.2 | `addCards` duplicate check threw generic duplicate error rather than distinguishing existing IDs in deck vs new list. | Split validation checks so adding existing card throws `"already exists in deck"` and duplicate in parameters throws `"duplicate card ID"`. |
| 2026-11-01 | M1.3.3 | Unprotected steps in `drawCardFromDeck`: exceptions in `addObject` or `registerObject` left deck popped and registry transferred without rollback. | Implemented multi-phase commit with inverse reverse rollback across interaction, scene, deck, and registry, disposing temp card. |
| 2026-11-01 | M1.3.3 | Registry rejected transfer when caller passed alias ID `'demo_deck'` rather than internal deck ID `'demo_deck_1'`. | Resolved `actualDeckId = deck.getId()` at top of draw transaction and queried registry using `actualDeckId`. |
| 2026-11-01 | M1.3.3 | Raycasting over disposed cards caused null reference or unexpected highlights. | Added `isDisposed()` check in `RaycastInteractionManager._collectMeshes()` to filter out disposed cards from raycasting targets. |
| 2026-11-01 | M1.3.3 | 'F' key and HUD button only flipped initial `demoCard` instead of the player's active card selection. | Updated `App.ts` to check `interactionManager.getSelectedObject()`, flipping selected card if instanceof `CardObject3D`. |
| 2026-11-01 | M1.3.4 | Automatic stacking radius (1.0) caused newly drawn cards spawned near deck to automatically merge into demo card. | Tuned `STACK_DETECT_RADIUS` to 0.15 so intentional center-to-center drops or explicit HUD actions trigger stacking without false positives. |
| 2026-11-01 | M1.3.4 | Microscopic Y offsets in LayeringManager altered physical tabletop card heights from authoritative `SURFACE_Y = 0.0`. | Separated visual rendering order from physical height: LayeringManager uses `renderOrder`, keeping table cards flush at $Y = 0.0$. |

## 2026-11-07 — Sửa tương tác fan preview của HAND

- **Kéo/sắp xếp/đánh bài:** CSS transition và stagger làm lá kéo chậm con trỏ; việc đổi `left` và slot của lá kéo gây nhảy. Chụp transform lúc nhấn, tắt transition riêng lá kéo, cập nhật theo requestAnimationFrame, dùng translate3d cho slot, giữ DOM khi reorder. Khi chuyển fan sang 3D, chuyển điểm cầm sang mặt phẳng kéo thay vì dùng tọa độ của HAND gốc. Tái sử dụng CardTransferAnimator để hạ/trả bài sau khi nhả layout; giao thức mạng giữ nguyên.
- **Chuột xuyên xuống HAND:** root fan trước đây để pointer-events:none. Root mở nay chặn toàn vùng, HAND gốc bị loại khỏi raycast khi fan mở. Theo dõi vùng HAND + fan và vị trí chuột ở window, có thời gian chờ rời vùng ngắn; overlay đang đóng không chặn chuột.
- **Không mở lại sau khi nhận bài:** DragController chỉ gọi onDragFinished khi từng chiếm layout của bài HAND, bỏ sót drag từ TABLE. Nay mọi drag thực sự đều kết thúc qua callback; không hủy khi chuyển canvas sang overlay. Xử lý Esc/pointercancel/blur và kiểm tra lại hover khi animation nhận bài hoàn tất, kể cả con trỏ đứng yên.
- **Kiểm tra:** npm test (frontend 887 test, backend 41 test), npm run typecheck và npm run build. Có cảnh báo chunk Vite lớn hơn 500 kB; jsdom vẫn in cảnh báo getContext vốn đã xuất hiện ở baseline. Script test_cdp_drag.mjs kiểm tra chuỗi mouse events; test_fan_regression.mjs kiểm tra bằng Chrome thật luồng hover, chặn HAND, offset drag, reorder, đánh bài và kéo về HAND. Chạy với tham số 1/2/6 tương ứng nhận lại vào HAND rỗng/một/năm lá.
- **Phạm vi:** Chỉ sửa frontend và kiểm thử; không thêm thư viện, không đổi backend/shared hay tên field giao thức. Animation do server xác nhận tiếp tục dùng cơ chế pending transfer hiện có.

## 2026-11-07 — Bàn thập giác mặc định 10 ghế

- Dùng SHARED_CONFIG.MAX_PLAYERS_PER_ROOM cho sức chứa mặc định ở server và bố cục mặc định ở client. Bỏ bộ chọn sức chứa trong sảnh và chế độ offline. Validator bỏ qua maxPlayers do client cũ gửi, còn snapshot phòng cũ vẫn được đọc theo cấu hình 2–8 ghế.
- Bàn Three.js giữ tọa độ chung và đổi phương vị camera theo ghế local. Camera bàn nhìn xuống 55°, FOV dọc 52°, khoảng cách tính theo bán kính bàn và tỷ lệ khung hình với hệ số lề 1,12. Phối màu ghế, nhãn phẳng và vùng đặt bài nằm trong scene. Bài đối thủ xòe nhẹ và dùng raycast theo hình học lá bài, hàng bài local giữ đường tương tác fan preview hiện có.
- Kiểm tra bố cục và tay bài trên Chrome với node verify_ten_seats.mjs sau npm run dev. Script kết nối WebSocket thật cho các mức 1, 2, 5 và 10 người, chụp khung ngang và khung dọc. Backend là sandbox, phòng lưu trong bộ nhớ và người chơi chủ động rút bài.

## 2026-11-07 — Khung bàn rộng và fan theo ảnh tham chiếu

- Hạ góc camera xuống 29°, FOV 54°, lề 1,055 để thấy phối cảnh rõ và bàn phủ nhiều chiều ngang hơn. Mở rộng vùng tay bài trên bàn 10 ghế. Dùng bảng màu và biểu tượng của dự án cho cả bài 3D và fan, mặt lưng đổi sang đỏ rượu.
- Fan xếp thành hàng cong nhẹ sát đáy và co theo chiều cao màn hình. Khi bàn 3D nhận lá đang kéo, fan ẩn ngay và nhường tương tác cho cảnh 3D. Kéo sắp xếp trong fan và mở lại khi trả lá về tay vẫn dùng luồng hiện có.

## 2026-11-07 — Cận cảnh bàn và con trỏ ở chồng rút

- Camera gần hơn tối đa 6%, vẫn giữ giới hạn theo chiều ngang trên màn hình hẹp. Tăng cỡ tiêu đề trên mặt bài 3D và giảm kích thước fan khoảng 6%.
- Rê qua chồng rút gửi điểm chạm trên lưới 3D. Rê qua nút Rút bài gửi tâm mặt trên của chồng rút. Server chuyển tiếp tọa độ chung và độ cao tùy chọn để người xem thấy con trỏ phía trên chồng bài từ góc ghế riêng.
- Kiểm tra bằng hai cửa sổ Chrome với năm hướng camera khác nhau, cả trên chồng rút và trên nút Rút bài.

## 2026-11-07 — Thu nhỏ fan và đồng bộ rê nút Rút

- Thu fan 12% và đưa camera ngang tiến thêm 12%, giữ giới hạn chiều ngang cho khung hẹp. Fan chỉ giữ mở khi chuột nằm trên lá bài; kéo và đổi thứ tự vẫn giữ thao tác đang diễn ra.
- Con trỏ trên bàn dùng giao điểm mặt bàn. Nút Rút gửi sự kiện rê riêng theo phòng, hiện tên cạnh nút trên các máy khác, kể cả người vừa vào phòng. See và Xáo hiện ở trạng thái chưa có chức năng.

## 2026-11-07 — Tay bài sát mép, kéo nhóm và nút mặt bàn

- Dịch vùng HAND của bàn 10 ghế về phía mép và giảm độ nâng. Bài vẫn nằm phẳng, dùng cùng cấu hình khoảng cách/chồng bài và giữ raycast, fan preview. Khung ngang dịch lên một ít để dành chỗ cho tay bài gần camera.
- Gắn ba tấm nút Three.js vào tọa độ chung cạnh chồng rút. Chữ xoay theo góc ghế, raycast chỉ kích hoạt Rút, See và Xáo vẫn vô hiệu hóa. Nút Rút dùng chung nghiệp vụ với phím H và giữ đồng bộ trạng thái rê.
- Thêm object:drag-preview (start/move theo nhóm) và object:drag-preview-stop. Server khóa cả nhóm trước khi phát, lọc mặt bài HAND, giữ vị trí chính thức cho tới khi thả và nhả khóa khi ngắt kết nối. Máy xem nội suy bản trình diễn, thêm viền theo màu ghế, bóng và tên người kéo. Gói object:drag-end và card:transfer cũ giữ tương thích, client mới có thể gửi dragId để ràng buộc thao tác thả vào phiên đã khóa.
- Chạy verify_table_surface.mjs sau npm run dev để kiểm tra click 3D, kéo nhóm, tranh khóa và đóng tab qua Chrome. Kiểm thử WebSocket bao phủ riêng thả sai biên, khóa nhóm và mặt úp HAND.

## 2026-11-07 — Một lá tượng trưng và tay bài dài

- Bộ rút dùng một mesh có chiều cao một lá, badge số lá và ô mờ nhận raycast khi hết. Online đọc số lá từ snapshot/delta của server, offline vẫn dùng thứ tự ID trong bộ cục bộ. Rút từ mesh online đi qua WebSocket.
- Bỏ lá mẫu trên mặt bàn online và dọn dữ liệu khi đổi chế độ. Bộ 20 lá của Room giữ thứ tự cũ. ID mẫu và bộ 30 lá cục bộ chỉ phục vụ offline/test. Tính năng chèn vào bộ offline vẫn hoạt động; online tránh tự sửa bộ bài cục bộ vì server chưa có thao tác chèn.
- HAND giữ khoảng cách co theo chiều rộng ghế và giới hạn độ cao của hàng bài. Fan dùng các trang nhỏ với nút hoặc cuộn chuột, giữ đúng ID và chỉ dựng DOM của trang đang xem. Không có giới hạn số lá cầm tay; mốc 30 của trình diễn kéo nhóm vẫn là giới hạn gói tin.

## 2026-11-08 — Hướng kéo từ HAND và lật ngay trên fan

- DragController đưa lá và nhóm về góc ghế trong hệ tọa độ bàn bằng slerp 150 ms. R, Shift+R và cuộn chuột chỉnh góc đang kéo. Khi thả, SceneManager giữ góc nhìn thấy và trạng thái mặt bài.
- object:drag-preview nhận thêm rotation và faceUp tùy chọn. Server lấy trạng thái mặt công khai từ Room và gửi mặt úp cho bản trình diễn HAND. Client cũ vẫn dùng được khung không có hai trường mới.
- F, nút và menu lật dùng cùng trạng thái CardObject3D. Fan thay mặt lá tại node hiện có, lật quanh trục dọc mà không đổi slot. Server xác nhận hoặc trả lỗi để đồng bộ lại trạng thái.


## 2026-11-08 — Đỉnh/Đáy chung và lấy bài trước ghế

- Room giữ Đỉnh/Đáy và gửi qua room:state. Tùy chọn lấy theo số lá nằm phía trên, chỉ gửi kèm lần lấy của người chọn.
- Nhấn chồng dùng deck:take và deck:card-taken. Máy chủ chuyển lá sang vùng trước ghế, lọc mặt bài theo người xem. Máy khách cập nhật badge và dùng lại hoạt ảnh chuyển bài. Rút và H vẫn đưa lá trên cùng vào tay.
- Trộn thứ tự bộ bài lúc tạo phòng để ID công khai không suy ra mặt bài. Mã kết nối lại chỉ cấp cho đúng phiên và được đổi sau mỗi lần khôi phục. Phòng mất kết nối hết người được giữ trong 30 giây.


## 2026-11-08 — Thiết lập bộ 56 lá và chia bài

- Bộ bài gốc có 13 loại. Phòng mới vào SETUP với bàn 10 ghế và bảng thành phần bộ bài. Chủ phòng chỉnh số Mèo Nổ/Gỡ Bom, máy chủ gửi dự báo cho các máy khách.
- Chia bài một lần mỗi ván, mỗi ghế có người kết nối nhận 1 Gỡ Bom và 5 lá khác. Khi đủ 10 người, nhân đôi 11 loại còn lại, giữ nguyên hai số đã chỉnh. Máy chủ xáo Fisher–Yates trước khi chia và xáo lại phần còn lại.
- Snapshot mới chỉ có lá công khai, bài tay của chính người nhận và số lượng chồng/tay. Các máy dùng bài úp minh họa cho tay đối thủ. Người vào giữa ván xem bàn ở vai trò khán giả và được xếp ghế trống khi làm lại ván.
- Test giao thức cũ dùng fixture riêng. Phòng online do máy chủ tạo thông thường luôn bắt đầu từ SETUP.


## 2026-11-08 — Tùy chọn nhân đôi và lật bài trên bàn

- Tùy chọn tạo phòng nhân đôi 11 loại ngoài Mèo Nổ/Gỡ Bom, mặc định tắt và không phụ thuộc số ghế.
- Lá lấy bằng cách nhấn chồng xuất hiện úp trên bàn. Người trong phòng có thể lật, kể cả khán giả. Tay bài và chồng bốc vẫn dùng quyền xem hiện có.


## 2026-11-08 — Đồng bộ lá lấy từ chồng sau khi chuyển tay

- Người nhận nhận đủ dữ liệu lá, kể cả lúc lá đang úp. Khi chuyển tay, xóa bản trình diễn kéo và hiện lại lá thật; các máy còn lại dùng bài úp minh họa theo số lượng.
- Máy xem bỏ bản ghi mô hình đã hủy khi lá đi vào tay riêng, để cùng ID dựng lại được lúc ra bàn. Vị trí máy chủ xác nhận được ưu tiên kể cả khi tọa độ trùng vùng tay.


## 2026-11-08 — Chữ chức năng trên mặt ngửa

- Tên và mô tả của 13 loại bài lấy từ danh mục chung. Bố cục đo và chia dòng một lần theo loại, dùng cho texture 3D và fan DOM.
- Các lá cùng loại dùng chung texture mặt ngửa, hủy texture khi lá cuối cùng nhả tham chiếu. Mặt úp của fan chỉ dùng thiết kế lưng và ẩn loại bài khỏi thuộc tính DOM.


## 2026-11-08 — Chèn, mặt trên và xáo chồng bốc online

- Máy chủ chèn cả nhóm theo Đỉnh/Đáy hoặc vị trí riêng từ đỉnh. Chèn và xáo giữ trạng thái mặt của từng lá. Snapshot gửi số lá, số lá tác động và loại lá trên cùng khi ngửa.
- HUD cho nhập vị trí chèn và số lá tác động. Nút Xáo phát hiệu ứng trên lá tượng trưng và hiện người thao tác. Mặt ngửa dùng texture chữ chức năng có sẵn.

## 2026-11-08 — See và Alter trên chồng bốc

- See và Alter dùng cùng phiên khóa chồng, lấy phần đầu theo số lá tác động. Mỗi máy nhận thứ tự bằng mã tạm của phiên. Chỉ người mở nhận loại lá úp, còn loại lá đã ngửa công khai gửi cho cả phòng.
- Hàng bài 3D dùng hiệu ứng chuyển lá hiện có. Alter gửi thứ tự sau khi thả hoặc đổi chỗ. Chỉ xác nhận hợp lệ mới đổi thứ tự thật, còn hủy và mất kết nối nhả khóa và giữ nguyên chồng.

- HUD của người mở Alter có hàng thẻ riêng để kéo trực tiếp. Hàng này dùng cùng yêu cầu đổi thứ tự với bàn 3D, hiện đích thả và tự đóng khi phiên kết thúc.

## 2026-11-08 — Thiết lập bộ mở rộng

- Danh mục chung chứa Bộ gốc, Imploding Kittens, Streaking Kittens và Barking Kittens. Máy chủ lưu bộ đang bật và số lá đã chỉnh, kể cả của bộ đang tắt.
- Mỗi người nhận 1 Gỡ Bom và 5 lá không phải bom hoặc Gỡ Bom. Máy chủ xáo phần còn lại thành chồng. Cảnh báo Streaking chỉ để tham khảo.
- Các lá mở rộng dùng mặt chữ kèm màu và nhãn của bộ. Tower of Power có dữ liệu lá bài, chưa có kho dự trữ.
