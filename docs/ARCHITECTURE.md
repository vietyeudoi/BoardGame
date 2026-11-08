# ARCHITECTURE.md — Cat Boom Online

> Digital Tabletop Sandbox 3D | Inspired by Tabletop Simulator

---

## 1. Tổng quan kiến trúc

Cat Boom Online là một **real-time multiplayer 3D sandbox game** chạy trên trình duyệt, với backend Node.js xử lý đồng bộ trạng thái qua WebSocket.

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                         │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────────────────────────┐  │
│  │  UI Overlay  │    │           Three.js Scene             │  │
│  │  (HTML/CSS)  │    │  ┌──────────┐  ┌──────────────────┐  │  │
│  │              │    │  │  Camera  │  │   Object3D Pool  │  │  │
│  │  LobbyScreen │    │  │Controller│  │  Cards/Decks/... │  │  │
│  │  GameScreen  │    │  └──────────┘  └──────────────────┘  │  │
│  └──────┬───────┘    └──────────────┬───────────────────────┘  │
│         │                           │                           │
│         └────────────┬──────────────┘                           │
│                      │                                          │
│              ┌───────▼────────┐                                 │
│              │  NetworkClient  │  WebSocket Client               │
│              └───────┬────────┘                                 │
└──────────────────────┼──────────────────────────────────────────┘
                       │  WebSocket (JSON messages)
                       │  ws://host:4000/ws
┌──────────────────────┼──────────────────────────────────────────┐
│                      │         SERVER (Node.js)                 │
│              ┌───────▼────────┐                                 │
│              │ WebSocketServer │                                 │
│              └───────┬────────┘                                 │
│                      │                                          │
│              ┌───────▼────────┐                                 │
│              │MessageDispatcher│                                 │
│              └───────┬────────┘                                 │
│                      │                                          │
│         ┌────────────┴───────────┐                              │
│         │                        │                              │
│  ┌──────▼───────┐       ┌───────▼──────┐                        │
│  │  RoomManager │       │MessageValidator│                       │
│  └──────┬───────┘       └──────────────┘                        │
│         │                                                        │
│  ┌──────▼───────┐                                               │
│  │     Room      │  (authoritative state per room)               │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Module Responsibilities

### 2.1 Frontend Modules

| Module | File | Trách nhiệm |
|--------|------|-------------|
| **App** | `src/app/App.ts` | Root controller, wires together all subsystems |
| **SceneManager** | `src/scene/SceneManager.ts` | Central Three.js lifecycle, object registry |
| **Renderer** | `src/scene/Renderer.ts` | Single WebGLRenderer, render loop, resize |
| **CameraController** | `src/scene/CameraController.ts` | Orbital camera: 360° orbit, clamp zoom, pan, reset |
| **LightingManager** | `src/scene/LightingManager.ts` | Tabletop lighting: hemisphere, ambient, key & fill directional lights, soft shadows |
| **TableObject3D** | `src/objects/TableObject3D.ts` | 3D table surface: green felt, wood rails, solid apron & legs |
| **TableConfig** | `src/objects/TableConfig.ts` | Table dimensions, material colors, and surface parameters |
| **CardObject3D** | `src/objects/CardObject3D.ts` | 3D card representation with front/back faces, rounded corners, flip state, and resource disposal |
| **CardConfig** | `src/objects/CardConfig.ts` | Card dimensions (2.5x3.5x0.045), colors, UV configs, and visual parameters |
| **CardTextureGenerator** | `src/objects/CardTextureGenerator.ts` | Procedural canvas texture generator for front/back faces with canvas reuse and JSDOM fallback |
| **DeckObject3D** | `src/objects/DeckObject3D.ts` | 3D deck stack representation with dynamic height, layered paper edges, card back top, and Fisher-Yates shuffle |
| **DeckConfig** | `src/objects/DeckConfig.ts` | Centralized deck constants inheriting card dimensions from CardConfig (DRY) |
| **HandZoneConfig** | `src/objects/HandZoneConfig.ts` | Hand zone visual parameters, dynamic layout positions, and card arrangement math (M1.5.0) |
| **HandZoneObject3D** | `src/objects/HandZoneObject3D.ts` | 3D visual container for a player's private hand: flat overlapping row arrangement (M1.7.7.1) and dynamic card count label (M1.5.0) |
| **HandZoneManager** | `src/objects/HandZoneManager.ts` | Central manager for all hand zones, spatial containment queries, and dynamic rebuild migration (M1.5.0) |
| **NetworkClient** | `src/network/NetworkClient.ts` | WebSocket lifecycle, reconnect logic |
| **MessageHandler** | `src/network/MessageHandler.ts` | Dispatch server messages to store/scene |
| **ClientStore** | `src/store/ClientStore.ts` | Client-side state mirror (read-only) |
| **UIManager** | `src/ui/UIManager.ts` | HTML overlay, screen transitions |
| **LobbyScreen** | `src/ui/LobbyScreen.ts` | Lobby UI component |
| **GameScreen** | `src/ui/GameScreen.ts` | In-game HUD |
| **Logger** | `src/utils/Logger.ts` | Structured logging |
| **Disposer** | `src/utils/Disposer.ts` | Three.js resource cleanup |
| **AssetLoader** | `src/utils/AssetLoader.ts` | Cached texture/geometry loading |

### 2.2 Backend Modules

| Module | File | Trách nhiệm |
|--------|------|-------------|
| **Bootstrap** | `src/index.ts` | Entry point, wires server |
| **HttpServer** | `src/server/HttpServer.ts` | HTTP endpoints (health check) |
| **WebSocketServer** | `src/server/WebSocketServer.ts` | WS connection management, heartbeat |
| **MessageDispatcher** | `src/protocol/MessageDispatcher.ts` | Route messages to handlers |
| **MessageValidator** | `src/validation/MessageValidator.ts` | Validate all client input |
| **RoomManager** | `src/room/RoomManager.ts` | Room create/join/destroy lifecycle |
| **Room** | `src/room/Room.ts` | Authoritative room state |
| **RoomStore** | `src/room/RoomStore.ts` | In-memory room storage |
| **PlayerSession** | `src/player/PlayerSession.ts` | Per-connection state |
| **IdGenerator** | `src/utils/IdGenerator.ts` | UUID and short room codes |
| **Logger** | `src/utils/Logger.ts` | Structured server logging |

### 2.3 Shared Modules

| Module | File | Trách nhiệm |
|--------|------|-------------|
| **protocol** | `types/protocol.ts` | WS message type definitions |
| **room** | `types/room.ts` | Room, Player, Object types |
| **gameObjects** | `types/gameObjects.ts` | Card type enum and definitions |
| **config** | `constants/config.ts` | Shared constants |

---

## 3. Data Flow

### 3.1 Player Joins a Room

```
Client                          Server
  │                               │
  │──── room:join {roomId} ──────►│
  │                               ├── MessageValidator.validate()
  │                               ├── RoomManager.joinRoom()
  │                               ├── Room.addPlayer()
  │                               │
  │◄─── room:joined {roomId} ─────│
  │◄─── room:state {fullState} ───│
  │                               │
  │          (broadcast to others)│
  │◄──── room:player-joined ──────│ (sent to other players)
```

### 3.2 Player Moves an Object (M1+)

```
Client                          Server
  │                               │
  │──── object:move {id, pos} ───►│
  │                               ├── Validate: is object locked?
  │                               ├── Update authoritative position
  │                               ├── Broadcast to all in room
  │                               │
  │◄──── object:moved {id, pos} ──│ (broadcast)
  │                               │
  [3D scene updates object mesh]
```

### 3.3 Reconnect Flow

```
Client                          Server
  │                               │
  │  (connection lost)            │
  │                               │  PlayerSession.isAlive = false
  │                               │  (after heartbeat timeout)
  │                               │
  │──── new WebSocket ──────────►│
  │──── room:join {roomId} ──────►│  (re-join same room)
  │◄─── room:state {fullState} ───│  (full state restore)
```

---

## 4. WebSocket Protocol

### 4.1 Client → Server

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `room:create` | `{ roomName, password? }` | Create a new room |
| `room:join` | `{ roomId, playerName, password? }` | Join existing room |
| `room:leave` | — | Leave current room |
| `object:move` | `{ objectId, position, rotation }` | Move a sandbox object |
| `object:flip` | `{ objectId }` | Flip card face up/down |
| `object:grab` | `{ objectId }` | Lock object for exclusive control |
| `object:release` | `{ objectId }` | Release lock |
| `ping` | — | Heartbeat |

### 4.2 Server → Client

| Message Type | Payload | Description |
|-------------|---------|-------------|
| `room:state` | `RoomState` | Full room state (on join or sync) |
| `room:joined` | `{ roomId, playerId }` | Confirm room join |
| `room:player-joined` | `PlayerInfo` | New player broadcast |
| `room:player-left` | `{ playerId }` | Player left broadcast |
| `object:moved` | `{ id, position, rotation }` | Object position update |
| `object:flipped` | `{ objectId, faceUp }` | Card flip |
| `object:locked` | `{ objectId, lockedBy }` | Grab confirmation |
| `object:unlocked` | `{ objectId }` | Release confirmation |
| `error` | `{ message, code? }` | Error response |
| `pong` | — | Heartbeat response |

---

## 5. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Vite 5 + TypeScript 5 (strict) | Build tooling |
| 3D Rendering | Three.js r169 | WebGL 3D scene |
| Backend | Node.js + TypeScript 5 (strict) | Server |
| Real-time | WebSocket (ws library) | Multiplayer sync |
| Dev Server | tsx (watch mode) | Hot-reload backend |
| Testing | Vitest | Unit & integration tests |

---

## 6. Project Structure

```
D:\BoardGame\
├── PROJECT_RULES.md           # Coding standards (MANDATORY READ)
├── package.json               # Root scripts
├── .gitignore
├── _backup_legacy_*/          # Archived old code
│
├── frontend/                  # Vite + Three.js
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   └── src/
│       ├── main.ts
│       ├── app/
│       ├── scene/
│       ├── objects/           # 3D object representations (M1+)
│       ├── ui/
│       ├── network/
│       ├── store/
│       └── utils/
│
├── backend/                   # Node.js + WebSocket
│   ├── tsconfig.json
│   ├── package.json
│   └── src/
│       ├── index.ts
│       ├── server/
│       ├── room/
│       ├── player/
│       ├── sandbox/           # Object state (M1+)
│       ├── protocol/
│       ├── validation/
│       └── utils/
│
├── shared/                    # TypeScript types & constants
│   ├── types/
│   │   ├── protocol.ts
│   │   ├── room.ts
│   │   └── gameObjects.ts
│   └── constants/
│       └── config.ts
│
└── docs/
    ├── ARCHITECTURE.md        # This file
    └── DEVELOPMENT_LOG.md
```

---

## 7. Design Decisions

### D001 — Sandbox over Rule Engine
**Decision**: Cat Boom Online does NOT enforce game rules. No turn manager, no automatic actions.  
**Reason**: Tabletop Simulator philosophy — players decide their own rules. The game provides objects, not restrictions.

### D002 — Backend Authority
**Decision**: Backend is the single source of truth for all object positions and states.  
**Reason**: Prevents cheating and desync. Client state is a read-only mirror.

### D003 — Single WebGLRenderer
**Decision**: One `WebGLRenderer` instance for the entire frontend application.  
**Reason**: Multiple renderers cause memory waste and context limit issues.

### D004 — Delta Updates
**Decision**: Server sends only what changed (delta), not full state on every update.  
**Reason**: Full state for a room with 50+ cards would be expensive to broadcast every frame.

### D005 — TypeScript Strict Mode
**Decision**: Both frontend and backend use `"strict": true` with no exceptions.  
**Reason**: Prevents runtime errors, improves maintainability, catches type issues at compile time.

### D006 — Decoupled Interaction and Network Synchronization
**Decision**: 3D object manipulation (grab, raycasting, smooth dragging, flipping) is implemented as a standalone frontend interaction layer that dispatches high-level action events.
**Reason**: Ensures responsive 60 FPS interactions and client-side feel, while providing clean hooks to synchronize authoritative state with the backend.

### D007 — Player Hand Privacy Model
**Decision**: Cards held in a player's private Hand Zone are masked by the backend. Only the owner receives the card's face identity; other players only receive back-of-card metadata. Cards on the public table only expose identity when `faceUp === true`.
**Reason**: Essential for fair tabletop gameplay without enforcing rules on how or when cards are played.

---


### Thiết lập và chia bài online

Phòng mới bắt đầu ở SETUP. Room giữ số lượng Mèo Nổ/Gỡ Bom, ghế tham gia và trạng thái ván. RoundDeck dùng danh mục chung, kiểm tra khả năng chia và tạo các lá vật lý khi chủ phòng chia bài. Deal/reset gửi một snapshot đầy đủ đã lọc theo người nhận. Cập nhật cấu hình và số lượng chồng gửi riêng.

Trong PLAYING, snapshot chứa bài công khai và tay của người nhận. Chồng bài và tay đối thủ dùng số lượng. Bản trình diễn kéo bài từ tay dùng ID ô minh họa và mặt úp, không dùng ID vật lý của lá. Người vào giữa ván là khán giả tới khi có ghế ở ván tiếp theo.

## 8. 3D Object Architecture

### 8.1 CardObject3D Design & Implementation
- **Single Extruded Mesh with 3 Material Groups**: Rather than using two separate thin planes that cause z-fighting and seam gaps, a card is constructed from a single rounded rectangle `ExtrudeGeometry` split into 3 material groups:
  - `materials[0]` (Front Face): Faces upwards in $+Y$ direction when `faceUp === true`.
  - `materials[1]` (Back Face): Faces downwards in $-Y$ direction when `faceUp === true`, with mirrored $U$ coordinate so card back artwork remains upright and non-inverted when flipped.
  - `materials[2]` (Card Edge): Paper core material (`#f4f1ea`) representing the card's physical thickness (0.045 units).
- **Draw Call Profile**:
  - In Three.js, a mesh rendered with an array of $M$ materials over $G$ geometry groups triggers **1 draw call per material group**.
  - A card therefore produces **3 draw calls** during the main render pass (plus shadow map draw calls when `castShadow === true`).
  - While a single texture atlas could theoretically reduce this to 1 draw call, using 3 discrete material groups is intentional to allow independent texture swapping, separate roughness/metalness parameters, and decoupled card customization without runtime atlas regeneration.
- **Coordinates & Tabletop Surface Contact**:
  - The card's sub-mesh `_cardMesh` is offset vertically by `+thickness / 2` (`0.0225`) inside the parent `CardObject3D` Group.
  - Consequently, the `CardObject3D` Group's local origin `(0, 0, 0)` corresponds exactly to the **bottom surface** of the card.
  - Calling `card.setPosition(x, TABLE_CONFIG.SURFACE_Y, z)` places the bottom of the card directly in contact with the table at $Y = \text{TABLE\_CONFIG.SURFACE\_Y}$ (`0.0`), with bounding box $Y \in [0.0, 0.045]$, eliminating table penetration.
- **Local Flipping Mechanic**:
  - Flipping rotates the internal `_cardMesh` by $\pi$ radians around its own local $Z$ axis (which sits at $Y = \text{thickness} / 2$ in Group coordinates).
  - Rotation around the longitudinal $Z$ axis flips the card over its long edge.
  - Because rotation is centered around the thickness midpoint, the bounding box in $Y$ remains identically $[0.0, 0.045]$ before and after flipping.
  - The card remains flush on the table surface without floating or sinking into the felt.
- **Resource Ownership & Memory Lifecycle**:
  - `_ownsFrontTexture` and `_ownsBackTexture` booleans track resource ownership.
  - Internally generated canvas textures are safely disposed when the card is disposed or updated.
  - Shared or externally passed textures (from an asset pool or Deck) are flagged as unowned and are **not** disposed by individual cards, preventing dangling texture bugs.
  - `dispose()` cleans up the geometry, materials, clears `material.map` references, and only disposes owned textures, clearing all Three.js memory allocations without leaks.
- **Decoupling**:
  - Completely decoupled from `Player`, `Room`, `TurnManager`, `Rules`, or WebSocket sync.
  - Exposes pure visual manipulation methods (`setPosition`, `setRotation`, `setRotationEuler`, `setScale`, `setFaceUp`, `flip`, `updateContent`, `dispose`, `getBoundingBox`, `getBottomY`, `getTopY`, `getMesh`).

### 8.2 DeckObject3D Design & Implementation
- **Role & Dual Responsibilities**:
  - *Visual*: Displays a 3D stack of playing cards with thickness dynamically proportional to card count, rounded corners, top face showing the card back, and side edges showing fine horizontal layered paper striations.
  - *Data Collection*: Manages an ordered list of unique card IDs (`cardIds: string[]`), providing atomic validation, peek, draw (LIFO), add, and in-place Fisher-Yates shuffle. Does not clone or duplicate CardObject3D instances.
- **Card ID Ordering Convention**:
  - Index 0 represents the bottom-most card resting on the table.
  - The last index (`length - 1`) represents the top card visible on top of the deck.
  - `peekTop()` inspects the last element without modifying data (returns `null` if empty).
  - `draw()` removes and returns the last element, immediately scaling the visual stack height (returns `null` if empty).
  - `addCard(cardId)` appends to the top of the stack and updates height (rejects empty IDs and duplicates).
  - `addCards(cardIds)` atomically appends multiple IDs in order to the top of the stack.
  - `shuffle(rng?)` executes in-place Fisher-Yates shuffle without altering stack height or count.
- **Height Formula & Dynamic Transform Architecture**:
  - Formula: $\text{visualHeight} = \text{count} \times \text{cardThickness}$.
  - When $\text{count} = 0$: `_deckMesh.visible = false`, `visualHeight = 0`, bounding box $Y \in [0, 0]$ (never negative).
  - When $\text{count} > 0$: `_deckMesh.scale.set(1, count, 1)`, and `_deckMesh.position.set(0, visualHeight / 2, 0)`.
  - Base geometry is constructed once with unit card depth (`cardThickness`). Updating count only alters `scale.y`, `position.y`, and `texture.repeat.y`, achieving **zero geometry re-allocation** and 60 FPS performance.
- **Mesh Structure & Materials**:
  - Extruded rounded rectangle geometry split into 3 material groups:
    - Group 0 (`materialIndex = 0`): Top Cap ($+Y$ normal) mapped with Card Back texture.
    - Group 1 (`materialIndex = 1`): Bottom Cap ($-Y$ normal) resting on table.
    - Group 2 (`materialIndex = 2`): Side Perimeter with seamless repeating layered paper striation texture (`repeat.set(1, count)`).
- **Tabletop Surface Contact**:
  - Group local origin $(0, 0, 0)$ is situated at the bottom contact surface.
  - Placed at $Y = \text{TABLE\_CONFIG.SURFACE\_Y}$ (`0.0`), bottom is at $0.0$, top is at $\text{visualHeight}$. Zero penetration into the table felt.
- **Texture & Material Ownership**:
  - `_ownsTopTexture` tracks whether top texture was generated procedurally (owned) or supplied from an external pool (unowned).
  - `_edgeTexture` is generated procedurally and owned.
  - `dispose()` cleans up geometry, materials, and only owned textures, ensuring shared textures are never disposed prematurely.
- **Public API**:
  - `getId()`, `getObject3D()`, `getCount()`, `getCardIds()`, `peekTop()`, `draw()`, `addCard()`, `addCards()`, `shuffle()`, `getVisualHeight()`, `getMesh()`, `getBoundingBox()`, `getBottomY()`, `getTopY()`, `setPosition()`, `setRotation()`, `setScale()`, `setTopTexture()`, `dispose()`.

---

## 9. Interaction System (M1.3.1)

### Overview

The Interaction System handles hover detection and object selection via mouse raycasting over the 3D tabletop scene. It is a **pure input layer** with no game logic.

```
Mouse Events (mousemove / mousedown / mouseup / mouseleave)
        │
        ▼
RaycastInteractionManager
  ├─ THREE.Raycaster  →  Intersect registered mesh list
  ├─ Hover State      →  Apply emissive highlight to hovered mesh materials
  ├─ Selection State  →  Apply emissive highlight (different color) to selected mesh
  └─ requestRender()  →  Notifies Renderer to produce next frame
```

### Files

| File | Role |
|------|------|
| `frontend/src/interaction/InteractionConfig.ts` | All interaction constants (colors, intensities, thresholds) |
| `frontend/src/interaction/RaycastInteractionManager.ts` | Core hover & selection manager |

### RaycastInteractionManager

**Constructor**: `(camera: THREE.PerspectiveCamera, domElement: HTMLElement, requestRender: () => void)`

**Registration API**:
- `registerObject(id, object: CardObject3D | DeckObject3D)` — add to interactable pool
- `unregisterObject(id)` — remove and clear any active hover/selection on that object
- `getRegisteredCount()` — returns number of registered interactables

**State API**:
- `getHoveredObject()` — returns `CardObject3D | DeckObject3D | null`
- `getSelectedObject()` — returns `CardObject3D | DeckObject3D | null`

**Lifecycle**:
- `dispose()` — aborts all event listeners (via `AbortController`), restores all highlights, clears internal maps

### Hover Highlight Mechanics

- Listens to `mousemove` on `domElement`.
- On move, recalculates NDC: `ndcX = (x - rect.left) / rect.width * 2 - 1`, `ndcY = -(y - rect.top) / rect.height * 2 + 1`.
- Calls `THREE.Raycaster.intersectObjects()` against visible meshes only.
- On hit-change: restores old highlight → applies new highlight → calls `requestRender()`.
- On `mouseleave`: restores highlight, clears hovered state, calls `requestRender()`.

**Highlight strategy** — modifies `emissive` and `emissiveIntensity` on existing `THREE.MeshStandardMaterial` instances only. Original values are backed up in a `Map<materialUuid, StoredEmissive>` before modification. **Never allocates new materials in the render loop**.

| State | Color | Intensity |
|-------|-------|-----------|
| Hover | `0x3a80c8` (blue) | `0.35` |
| Selected | `0x60a020` (green) | `0.5` |

Selection overrides hover glow. Hover glow is restored when object is deselected.

### Camera Orbit Conflict Avoidance

- `CameraController` uses `mousedown` + `mousemove` + `mouseup` for orbit/pan.
- `RaycastInteractionManager` tracks displacement between `mousedown` and `mouseup`.
- If displacement < `CLICK_DRAG_THRESHOLD_PX` (4 px), the event is treated as a click and selection logic runs.
- If displacement ≥ threshold, it is treated as a camera drag — selection is suppressed.
- Hover detection on `mousemove` is **always active** (even during orbit), so hover glow works while orbiting.

### Integration in SceneManager

`SceneManager` creates `RaycastInteractionManager` after constructing all demo objects:

```typescript
this._interactionManager = new RaycastInteractionManager(
  this._renderer.getCamera(),
  this._renderer.getDomElement(),
  () => this.requestRender()
);
this._interactionManager.registerObject('demo_card', demoCard);
this._interactionManager.registerObject('demo_deck', demoDeck);
```

`SceneManager.dispose()` calls `this._interactionManager.dispose()` before disposing other subsystems.

### Constraints (Out of Scope for M1.3.1)

- No DeckObject3D draw action triggered from interaction
- No TurnManager, EndTurn, or game rules
- No WebSocket or multiplayer sync
- No second `WebGLRenderer` or `THREE.Scene`

---

## 10. Drag & Drop System (M1.3.2)

### Overview

The Drag & Drop System (`DragController.ts`) allows players to freely pick up, move, and place `CardObject3D` instances across the 3D table surface without rule constraints, matching the Tabletop Sandbox philosophy.

```
Card Left-Mousedown
       │
       ▼
RaycastInteractionManager.onCardMouseDown(card, event)
       │
       ├─► CameraController.setSuppressOrbit(true)   (suppresses camera rotation)
       └─► DragController._onCardPointerDown()
                 │
           Pointer Move >= DRAG_START_THRESHOLD_PX (4px)
                 │
                 ▼
           Activate Drag (_activateDrag):
           - RaycastInteractionManager.isDragActive = true (suppresses click-select)
           - Card lifts to Y = SURFACE_Y + DRAG_LIFT_Y (0.15)
           - Drag Emissive Highlight applied (0xd08020, intensity 0.45)
           - Raycast against THREE.Plane(y = 0.15)
           - Card tracks cursor smoothly with pick-offset preserved
                 │
           Mouseup / Cancel / Blur / Mouseleave
                 │
                 ▼
           End Drag / Cancel:
           - Card drops flush to table: Y = TABLE_CONFIG.SURFACE_Y (0.0)
           - Emissive highlight restored to pre-drag state
           - CameraController.setSuppressOrbit(false) restored
           - Window listeners cleaned up via AbortController
```

### Key Components & Mechanics

| Component | Responsibility |
|-----------|----------------|
| `DragController.ts` | State machine for card dragging, ray-plane intersection, pick-offset tracking, lift/drop lifecycle, emissive highlight. `isDragActive` is only set `true` in `_activateDrag()` (after movement threshold crossed), never on bare mousedown. |
| `InteractionConfig.ts` | Centralized constants: `DRAG_START_THRESHOLD_PX`, `DRAG_LIFT_Y`, `DRAG_EMISSIVE_COLOR`, `DRAG_EMISSIVE_INTENSITY`. |
| `CameraController.ts` | Exposes `setSuppressOrbit(boolean)` to halt orbit when left-dragging a card while leaving pan and zoom operational. |
| `RaycastInteractionManager.ts` | Exposes `onCardMouseDown` callback and `isDragActive` flag to suppress click selection **only** when an actual drag is in progress (threshold crossed). |

### Technical Details

1. **Ray-Plane Intersection**:
   - Reusable `THREE.Plane` parallel to table surface with normal $(0, 1, 0)$ positioned at $Y = \text{SURFACE\_Y} + \text{DRAG\_LIFT\_Y}$.
   - Pre-allocated `THREE.Raycaster`, `THREE.Vector2`, and `THREE.Vector3` to eliminate per-frame heap allocations during drag move.
2. **Smooth Pick Offset**:
   - On initial contact, the offset vector between hit point on the drag plane and `card.position` is captured ($\Delta X, \Delta Z$).
   - On each move, new position is $\text{hitPoint} - \Delta$. The card does not abruptly snap its center to the cursor.
3. **Table Surface Contact & Heights**:
   - Group origin is at bottom of card.
   - During drag: `position.y = TABLE_CONFIG.SURFACE_Y + DRAG_LIFT_Y` ($0.0 + 0.15 = 0.15$). Never penetrates or clips table.
   - On drop / cancel: `position.y = TABLE_CONFIG.SURFACE_Y` ($0.0$). Rests flush on felt surface.
   - Rotation ($X, Y, Z$) and scale ($X, Y, Z$) are strictly preserved.
4. **Camera Conflict Resolution**:
   - CameraController's left-click orbit handler checks `_orbitSuppressed`.
   - When a card mousedown occurs, `setSuppressOrbit(true)` is immediately invoked, preventing camera rotation while dragging a card.
   - Pan (Shift + left click / middle click) and Zoom (wheel) remain fully functional.
   - Clicking and dragging empty table space or table border orbits normally.
5. **Robust Cancellation & Global Window Tracking**:
   - Window-level `mousemove` and `mouseup` listeners registered during drag via `AbortController`.
   - Handled events: window `blur`, canvas `mouseleave`, and explicit `cancelDrag()`.
   - On cancellation, card drops to `SURFACE_Y` at its current $(X, Z)$ position (no sudden disappearing/snap-back), materials are restored, and camera orbit is re-enabled.

### Integration in SceneManager

```typescript
this._dragController = new DragController(
  this._renderer.getCamera(),
  this._renderer.getDomElement(),
  this._interactionManager,
  this._cameraController,
  () => this.requestRender()
);
```
`SceneManager.dispose()` cleans up `_dragController` and all associated listeners.

---

## 11. Deck Draw & Card Transfer System (M1.3.3)

### Overview

The Deck Draw & Card Transfer System enables players to click any 3D deck on the table to draw the top card, transforming it into an interactive `CardObject3D` on the tabletop. It guarantees data integrity through an atomic transaction pattern backed by `CardRegistry`.

```
Player clicks DeckObject3D (displacement < 4px)
            │
            ▼
RaycastInteractionManager.onDeckClick(deck, event)
            │
            ▼
SceneManager.drawCardFromDeck(deckId, targetPosition?)
            │
            ├─► 1. Verify deck exists, active, count > 0
            ├─► 2. Peek top ID via deck.peekTop()
            ├─► 3. CardRegistry.canTransferDeckToTable(deckId, cardId)
            ├─► 4. Calculate spawn position (flush on table, cascading offset)
            ├─► 5. Instantiate CardObject3D(cardId) with error handling
            ├─► 6. ATOMIC COMMIT:
            │      CardRegistry.transferDeckToTable(deckId, cardId, card)
            │      poppedId = deck.draw()
            │      (Mismatch / error -> rollbackTableToDeck + dispose card)
            ├─► 7. SceneManager.addObject(cardId, card)
            ├─► 8. RaycastInteractionManager.registerObject(cardId, card)
            ├─► 9. onDeckCountChanged callback -> update HUD
            └─► 10. requestRender() -> return CardObject3D
```

### Card ID Ownership & `CardRegistry`

`frontend/src/objects/CardRegistry.ts` serves as the centralized single source of truth for all Card IDs.

**CardLocation States:**
- `IN_DECK`: Card ID belongs to a specific `DeckObject3D` (`containerId = deckId`).
- `ON_TABLE`: Card ID belongs to an active `CardObject3D` on the table (`containerId = 'table'`).
- `DISPOSED`: Card ID has been removed from the table and disposed.

**Mandatory Integrity Invariants:**
1. A Card ID cannot exist in two decks.
2. A Card ID cannot exist in a deck and on the table simultaneously.
3. A Card ID cannot have two different `CardObject3D` instances.
4. An ID cannot be drawn if it does not belong to the target deck in the registry.
5. `totalUniqueCardIds === totalCardsAcrossAllLocations` is provably true at all times.

`validateIntegrity(decks, tableCards)` audits physical objects against registry records and ensures zero duplicate or leaked IDs.

### Atomic Transaction & Multi-Phase Reverse Rollback

The draw transaction is structured into 4 sequential commit phases with reverse rollback:
1. **Re-entrancy Guard**: `_isDrawingCard` lock blocks recursive or concurrent draw invocations.
2. **Phase 1**: `CardRegistry.transferDeckToTable(deckId, cardId, card)` (mutates ownership to `ON_TABLE`).
3. **Phase 2**: `poppedId = deck.draw()` (removes card from deck array and scales 3D visual height).
4. **Phase 3**: `SceneManager.addObject(cardId, card)` (adds card mesh to 3D scene and registers in scene manager).
5. **Phase 4**: `RaycastInteractionManager.registerObject(cardId, card)` (registers card for hover, selection, and drag).

If an exception occurs at any phase, reverse rollback is executed in exact inverse order:
- `Phase 4 Rollback`: `_interactionManager.unregisterObject(topCardId)`
- `Phase 3 Rollback`: `_scene.remove(newCard); _registeredObjects.delete(topCardId)`
- `Phase 2 Rollback`: `deck.addCard(topCardId)`
- `Phase 1 Rollback`: `_cardRegistry.rollbackTableToDeck(actualDeckId, topCardId)`
- `Cleanup`: `newCard.dispose()` to prevent memory leaks and dangling GPU buffers.

### Bidirectional Transfer & Lifecycle Symmetry

In addition to `transferDeckToTable`, `CardRegistry` provides:
- `canTransferTableToDeck(deckId, cardId): boolean`
- `transferTableToDeck(deckId, cardId): void`
- `isDisposed(cardId): boolean`
- `validateIntegrity(decks, tableCards): IntegrityCheckResult`

This establishes full lifecycle symmetry across the sandbox, allowing cards on the table to be safely returned to decks without violating ownership invariants.

### Interaction & Drag & Drop Integration

- Once drawn, the card is registered with `RaycastInteractionManager` via `registerObject(cardId, card)`. Duplicate registrations of the same object instance across different IDs are strictly blocked.
- `_collectMeshes()` explicitly filters out disposed cards (`obj.isDisposed()`), preventing raycasting crashes or zombie highlights on disposed objects.
- It immediately responds to cursor hover (blue emissive glow), click selection (green emissive glow), and left-drag (`DragController`).
- Context-sensitive card flip: Pressing 'F' or clicking "Lật bài (F)" in the HUD flips the currently selected card; if no card is selected, it defaults to `demoCard`.
- When removed via `SceneManager.removeObject(cardId)`, it is automatically unregistered from interactions and marked `DISPOSED` in the registry.

### Empty Deck Handling

- If deck has 1 card: drawing it succeeds, deck count becomes 0, and the deck visual mesh is hidden (`_deckMesh.visible = false`).
- If deck has 0 cards: `drawCardFromDeck()` returns `null` safely without throwing.
- Clicking an empty deck does not crash or corrupt state.
- HUD pill displays `📦 Chồng bài: Hết bài` when count is 0.

---

## 12. Card Manipulation & Arrangement System (M1.3.4)

### Overview

Milestone M1.3.4 delivers complete physical card manipulation and spatial arrangement on the 3D tabletop, enabling players to rotate cards (90° shortcuts + free mouse-wheel rotation), clamp within table boundaries, stack cards vertically, multi-select and move groups, manage visual layering order, and access actions via shortcuts and a context menu.

> **M1.7.5 Part 4**: Snap-to-Grid (`snapToGridValue`, `GRID_SIZE`, `Key G`, HUD "📐 Lưới" button, context-menu entry) was **removed entirely** — positions are always free within the table boundary clamp.

### Card Rotation (90° Increments & Arbitrary Angles)

- **Rotational Axis**: `CardObject3D` inherits from `THREE.Group`. Its origin $(0, 0, 0)$ resides at the card's bottom center on the table surface ($Y = \text{TABLE\_CONFIG.SURFACE\_Y}$).
- Rotation around the local vertical Y axis (`group.rotation.y`) turns the card horizontally flat on the felt surface without changing $X, Z$ or penetrating table geometry.
- Independent of face flip: flipping is governed by `_cardMesh.rotation.z`, completely decoupled from `group.rotation.y`.
- **APIs**: `rotateY(angleRadians)`, `rotateClockwise90()`, `rotateCounterClockwise90()`, `getRotationY()`.
- **Keyboard Shortcut**: `Key R` rotates selected cards clockwise +90°; `Shift + R` rotates counter-clockwise -90°.
- **Free Rotation via Mouse Wheel (M1.7.5 Part 3)**: with one or more TABLE cards selected, wheel up = clockwise, wheel down = counter-clockwise, `WHEEL_ROTATION_STEP_DEG = 5°` per notch (`1°` while `Shift` is held). Raw `WheelEvent.deltaY` is normalized through `normalizeWheelNotches(deltaY, deltaMode)` (px ÷ 100, lines as-is, pages × 10, clamped ±10, non-finite → 0). While rotating, `CameraController.shouldHandleWheel` returns `false` so the camera does not zoom (the wheel is still `preventDefault`-ed — no page scroll); zoom stays normal otherwise. Rotations sync over the existing `object:move` protocol (per-object 80 ms trailing throttle) with server membership/lock/location validation; hand cards are local-only and never broadcast.
- **Seat-Based Default Orientation (M1.7.5 Part 2)**: a HAND→TABLE drop computes the card's default yaw once from the acting player's seat — `computePlayerPerspective(playerIndex, playerCount).theta = atan2(seat.x, seat.z)` — stored by the backend (carried on `object:drag-end.rotation`) and broadcast to all clients. Manual TABLE rotation is never auto-reset by later `room:state` snapshots.

### Precise Positioning & Table Boundaries

- **Table Boundary Clamping (`clampTablePosition`)**:
  Calculates oriented bounding box extents for any given angle $\theta$:
  $$\text{halfExtentX} = \frac{|\cos\theta| \times W + |\sin\theta| \times H}{2}$$
  $$\text{halfExtentZ} = \frac{|\sin\theta| \times W + |\cos\theta| \times H}{2}$$
  Clamps $X$ and $Z$ to remain strictly within the felt surface area $([-FELT\_WIDTH/2 + halfExtentX, FELT\_WIDTH/2 - halfExtentX] \times [-FELT\_DEPTH/2 + halfExtentZ, FELT\_DEPTH/2 - halfExtentZ])$.
  Ensures the card never penetrates rails or drops off table at 0°, 90°, or any angle.
- **Snap to Grid — REMOVED (M1.7.5 Part 4)**: the former `snapToGridValue` helper, `SNAP_TO_GRID_DEFAULT` / `GRID_SIZE` config, `DragController` snap methods, `Key G`, the HUD button, and the context-menu entry were deleted. Drag movement and drop positions are always free-form inside the boundary clamp.

### Card Stacking Architecture (`CardStack` & `CardStackManager`)

- **Physical Stacking**: When cards are stacked, each card index $i$ rests at $Y = \text{TABLE\_CONFIG.SURFACE\_Y} + i \times \text{STACK\_OFFSET\_Y}$ ($\approx 0.047$), maintaining vertical separation and eliminating visual Z-fighting.
- **Stack Ordering Invariant**: `_cards[0]` is the **bottom** card; `_cards[_cards.length - 1]` is the **top** card. `takeTopCard()` pops from the end (LIFO order): `[A, B, C] → C` then `[A, B] → B` then `[A]` (auto-dissolves).
- **Invariants**:
  1. A Card ID cannot appear twice in the same stack.
  2. A Card cannot belong to multiple stacks simultaneously.
  3. Cards in stacks retain their logical `ON_TABLE` ownership in `CardRegistry`.
  4. Moving or rotating the stack moves/rotates all member cards synchronously.
  5. When a stack has $\le 1$ card remaining (via `takeTopCard`), it automatically dissolves, restoring the card as a standalone tabletop card.
- **Proximity Stacking on Drop**: `DragController.onCardDropped` queries `CardStackManager.findNearbyTarget()` within `STACK_DETECT_RADIUS` ($0.15$ units) to join stacks on drop.

### Bug Fixes (M1.3.4.1)

- **BUG 1 — isDragActive set too early**: `DragController._onCardPointerDown()` originally set `isDragActive = true` on every card mousedown, blocking all card click selection. Fixed by moving `isDragActive = true` into `_activateDrag()` — only fires when movement $\ge$ `DRAG_START_THRESHOLD_PX`. Camera orbit suppression (`setSuppressOrbit`) still fires on mousedown as before.
- **BUG 2 — Stack always returned demoCard**: Context Menu "Rút bài trên cùng" called `takeTopCardFromSelectedStack()`, which depended on stale/empty selection. Fixed by adding `SceneManager.takeTopCardFromCard(hovered)` — passes the hovered card directly, never touches selection state.
- **Flip fallback removed**: `flipTargetCard()` in `App.ts` no longer falls back to `demoCard` when no card is selected. Flip is a no-op without selection.
- **`SceneManager.takeTopCardFromCard(card)`** (M1.3.4.1): Takes top card from the stack containing `card`, bypassing selection state. Used by the Context Menu where the target stack is identified from the hovered card (right-click cursor position), not from `getSelectedCards()`.

### Card Stack Rework & Selection Architecture (M1.3.4.2)

- **Full 4-Way Stacking**: `CardStackManager.stackCards(target, incoming)` supports:
  1. *Standalone + Standalone*: Creates new `CardStack` with target at bottom, incoming at top.
  2. *In-Stack + Standalone*: Appends incoming onto target stack.
  3. *Standalone + In-Stack*: Removes incoming from old stack (auto-dissolving if $\le 1$ remains), forms new stack.
  4. *In-Stack + In-Stack (Merge)*: Invokes `mergeStacks(incomingStack, targetStack)` placing incoming stack cards on top of target stack, dissolving source stack.
- **Stack Operations APIs**:
  - `addCardToStack(card, targetStack)`: Detaches card from prior stack before adding.
  - `mergeStacks(sourceStack, targetStack)`: Enforces `[...targetStack.cards, ...sourceStack.cards]`.
  - `removeCardFromStack(card)`: Removes card, dissolves source if $\le 1$ remaining.
  - `SceneManager.selectStack(stackId)`: Selects all member cards in the stack.
  - `SceneManager.removeCardFromStack(card)`: Removes card and offsets position (+0.5x, +0.3z).
  - `SceneManager.dissolveStackForCard(card)`: Fans out cards and dissolves the stack.
- **Stack-Aware Interaction & Selection**:
  - `RaycastInteractionManager.selectObjects(objects)`: Bulk selection API.
  - `Alt + Click` on a card in a stack triggers `onAltClickCardInStack`, selecting the entire stack.
  - Context menu provides stack actions: *Chọn toàn bộ Stack*, *Tách bài khỏi Stack*, and *Giải phóng Stack*.

### Multi-Select & Group Drag

- **Multi-Selection (`RaycastInteractionManager`)**:
  Maintains `_selectedObjects = new Set<CardObject3D | DeckObject3D>()`.
  - Normal click: selects single object (clearing previous selection).
  - `Ctrl + Click` / `Cmd + Click`: toggles object in/out of the selection set.
  - Clicking empty space (without Ctrl): clears selection.
- **Group Movement (`DragController`)**:
  When drag initiates on a card that belongs to a multi-selection group, `DragController` records follower relative offsets (`offsetX`, `offsetZ`).
  During drag, all group members move preserving relative distance, orientation, and scale. Boundary constraints check all group members to keep the whole group on the felt.

### Layering & Arrangement (`LayeringManager`)

- Allows reordering the visual display priority of tabletop cards without altering physical tabletop height ($Y = 0.0$) or Registry state.
- **APIs**: `bringToFront(card)`, `sendToBack(card)`, `moveUp(card)`, `moveDown(card)`.
- Synchronizes Three.js `renderOrder` on the card mesh for deterministic rendering.

### UI & Context Menu

- **Shortcuts**: `F` (Flip), `R` (Rotate CW), `Shift+R` (Rotate CCW), `H` (Draw to Hand). Wheel over the canvas: zoom normally, **free-rotate the selected TABLE card(s)** (5°/notch, `Shift` = 1°) while a selection exists. Form inputs (`input`, `textarea`, `select`) automatically suppress shortcut processing. (`G` / Snap-to-Grid removed in M1.7.5.)
- **Floating Context Menu (`ContextMenu`)**:
  Right-clicking on any tabletop card summons a glassmorphism context menu offering quick access to Flip, Rotate, Bring to Front, Send to Back, Stack Cards, and Take Top Card. Closes on click outside or Escape.

### Stack Auto Arrangement & Visual Feedback Architecture (M1.3.4.3)

- **Visual Cascade via Inner Mesh Offsets**:
  - `CardStack.realignCards()` applies a stair-step cascade with offsets:
    $$\Delta X = i \times \text{STACK\_CASCADE\_OFFSET\_X} \quad (0.04)$$
    $$\Delta Z = i \times \text{STACK\_CASCADE\_OFFSET\_Z} \quad (0.05)$$
    $$Y = \text{SURFACE\_Y} + i \times \text{STACK\_OFFSET\_Y} \quad (\approx 0.047)$$
  - Crucially, the cascade offsets are applied to the card's internal mesh (`card.setCascadeOffset(offsetX, offsetZ)`) rather than mutating `card.position.x/z`. This preserves the stack's group coordinate invariants (`card.position.x == stack.position.x`), so physics, bounds checks, and unit tests remain deterministic.
  - When cards are removed or detached from a stack, `setCascadeOffset(0, 0)` is invoked to restore normal centered mesh positioning.

- **Stack 3D Badge Indicator (`StackBadge`)**:
  - Implemented as a lightweight `THREE.Sprite` with a dynamically drawn HTML5 2D canvas texture.
  - Positioned relative to the stack's top card at `(topCard.x + 0.85, topCard.y + 0.35, topCard.z - 1.1)`.
  - Displays circular badge with stack count `${count}`.
  - Automatically updates border styling:
    - Default/Unselected: Dark fill with cyan border (`#00e5ff`).
    - Selected: Dark fill with glowing neon green border (`#00ff66`).
  - Automatically auto-hides when count $\le 1$ or when the stack is dissolved.

- **Unified Deterministic Visual Hierarchy (`RaycastInteractionManager`)**:
  - Solves emissive color backup pollution where cards remained permanently tinted blue after hovering and selecting.
  - Saves the pristine unhighlighted base emissive color and intensity into `_baseEmissiveMap` upon initial object registration.
  - Implements a deterministic priority resolver via `refreshObjectHighlight(object)`:
    $$\text{DROP\_TARGET} \ (\text{Cyan, } 0x00bfff) > \text{SELECTED} \ (\text{Green, } 0x22c55e) > \text{HOVER} \ (\text{Blue, } 0x3b82f6) > \text{DEFAULT} \ (\text{Base color})$$
  - Any state change (hover enter/exit, selection toggle, drop target preview trigger) re-evaluates the highlight using this hierarchy.

- **Full 4-Way Drag & Drop Merging (`_onCardDropped`)**:
  - Evaluates drop interaction between dragged entity and target:
    1. **Card $\to$ Card**: Invokes `stackCards(targetCard, draggedCard)` forming a new 2-card stack.
    2. **Card $\to$ Stack**: Invokes `addCardToStack(draggedCard, targetStack)` placing the card at the top.
    3. **Stack $\to$ Card**: Invokes `mergeStackOntoCard(sourceStack, targetCard)` placing the entire source stack on top of the target card.
    4. **Stack $\to$ Stack**: Invokes `mergeStacks(sourceStack, targetStack)` appending source stack cards on top of target stack cards.
  - Dragging a card that is member of an unselected stack extracts that card cleanly from the stack.
  - Dragging a card when the stack is selected moves all cards in the stack synchronously without breaking relative offsets or stacking order.

- **Drop Target Hover Preview & Proximity Radii**:
  - Real-time raycasting during mouse move (`DragController.onQueryDropTarget`) identifies valid drop targets under or near the cursor before mouse release.
  - Uses dual detection thresholds:
    - `DROP_ZONE_RADIUS = 1.5` units for existing `CardStack` (accommodating cascade bounding box and making stacks easy drop targets).
    - `STACK_DETECT_RADIUS = 0.25` units for standalone loose cards.
  - Applies cyan drop target preview highlight (`DROP_PREVIEW_EMISSIVE_COLOR = 0x00bfff`) to the candidate target while hovering, cleared immediately on mouse up or drag cancel.

### Advanced Deck & Stack Insertion Architecture (M1.3.4.5 & M1.3.4.5.1)

- **Unified Insertion Position & Direction Invariants**:
  - Internal collection storage adheres strictly to bottom-to-top ordering:
    $$\text{cards}[0] = \text{bottom}, \quad \text{cards}[\text{cards.length} - 1] = \text{top}$$
  - User-facing input in UI and Modals specifies the number of cards resting **above** the inserted card/stack:
    $$\text{numberOfCardsAbove} \in [0, \text{targetCount}]$$
  - Centralized bidirectional mapping in `SceneManager`:
    $$\text{internalIndex} = \text{targetCount} - \text{numberOfCardsAbove}$$
    $$\text{numberOfCardsAbove} = \text{targetCount} - \text{internalIndex}$$
    - `numberOfCardsAbove = 0` $\implies$ `internalIndex = targetCount` (TOP).
    - `numberOfCardsAbove = 1` $\implies$ `internalIndex = targetCount - 1` (immediately under top card).
    - `numberOfCardsAbove = targetCount` $\implies$ `internalIndex = 0` (BOTTOM).
  - Single card insertion: `[...target.slice(0, internalIndex), card, ...target.slice(internalIndex)]`.
  - Multi-card stack insertion: `[...target.slice(0, internalIndex), ...sourceCards, ...target.slice(internalIndex)]` (never inverted).

- **Deck Arbitrary Index Insertion (`DeckObject3D`)**:
  - `insertCardAt(cardId, index)` and `insertCardsAt(cardIds, index)` insert card IDs at any position from bottom ($0$) to top ($\text{count}$).
  - `peekTop()` and `draw()` continue strictly executing LIFO operations on the top element (`this._cardIds[this._cardIds.length - 1]`).
  - Dynamic 3D visual height and texture rendering update immediately based on the updated count.
  - `removeCardId(cardId)` provides atomic rollback recovery.

- **Stack Arbitrary Index Insertion (`CardStack` & `CardStackManager`)**:
  - `CardStack.insertCardAt(card, index)` and `insertCardsAt(cards, index)` place incoming cards into the stack array at `index`, reparenting them and recalculating stair-step cascade offsets and elevation.
  - `CardStackManager` safely extracts incoming cards/stacks from previous containers (with auto-dissolve for remaining $\le 1$ cards) prior to insertion.

- **Atomic Table-to-Deck Transfer Transaction (`SceneManager`)**:
  - Guarantees zero data loss, zero duplicated card IDs, and single-source-of-truth ownership in `CardRegistry`:
    1. Validation check on `CardRegistry.canTransferTableToDeck(actualDeckId, cardId)`.
    2. Detach from current `CardStack` (if applicable).
    3. Transition `CardRegistry` ownership to `IN_DECK`.
    4. Physical ID insertion into `DeckObject3D` via `insertCardAt` / `insertCardsAt`.
    5. Clean deregistrations and 3D object disposal from Three.js scene.
    6. Rollback Handler: In the event of any exception during steps 3–5, reverses state changes atomically (`removeCardId`, `rollbackDeckToTable`, scene restoration).

- **Toolbar & Context Menu UI Integration**:
  - `GameScreen`: HUD top bar contains `INSERT POSITION: [Đỉnh (Top)] [Đáy (Bottom)] [Tùy chọn...]` button group, maintaining active mode state.
  - `InsertionModal`: Floating modal component validating integer inputs in $[0, \text{currentMax}]$, equipped with confirm/cancel hooks and Enter/Escape keyboard handling.
  - Context Menu: Exposes direct actions to reorder within stack, return card to Deck top/bottom/position, and return full stack to Deck.

### Browser Integration & Tabletop Invariants Architecture (M1.3.4.5.2)

- **Comprehensive End-to-End Test Harness (`browserIntegration3452.test.ts`)**:
  - Simulates browser DOM, JSDOM canvas, and Three.js scene environment to verify integration between `App`, `GameScreen`, `SceneManager`, `CardStackManager`, `DeckObject3D`, and `CardRegistry`.
  - Continuous validation fixture: `assertTabletopInvariants(sceneManager)` executes after every operation:
    1. `CardRegistry.validateIntegrity(decks, cards)` confirms every card on table or in deck has exact 1:1 single-owner registry tracking.
    2. Stack membership invariant: Every card marked with `stackId` is actually present in that stack's internal array, with matching coordinate references.
    3. Deck membership invariant: Card count matches `deck.getCount()` and ID array length.
    4. Object lifecycle invariant: No card or deck tracked in active collections is in disposed state.
- **Verified Interaction Test Matrices**:
  - **Test A (Toolbar CUSTOM Mode)**: Verified card drop with `numberOfCardsAbove = 0` (top), `1` (sub-top), and `max` (bottom).
  - **Test B (Stack Merging)**: Verified multi-card stack drag and drop into another stack across custom positions.
  - **Test C (Mode Consistency)**: Verified calculation parity across `TOP`, `BOTTOM`, and `CUSTOM`.
  - **Test D (Return to Deck)**: Verified single card and entire stack return to deck top/bottom/custom, preserving LIFO invariants on top.
  - **Test E (UI & Modals)**: Verified integer validation, rejection of floats/negatives/out-of-bounds, cancel safety, and in-place stack reordering.
  - **Test F (Edge Cases)**: Verified stack auto-dissolution when cards drop to $\le 1$, empty deck non-crash safety, self-insertion rejection, and drag cancel preview cleanup.

---

## 16. Player Area System Architecture (M1.4.0)

### Overview

The Player Area System provides spatial zones on the 3D table for each player. It is a **purely visual layout system** — no card ownership, no turn management, no rule enforcement.

```
PlayerAreaManager
      │
      ├── PlayerAreaObject3D (area_1)  extends THREE.Group
      │     ├── BorderLine   (THREE.LineLoop)
      │     ├── SlotLine     (THREE.LineLoop — inner slot indicator)
      │     ├── LabelSprite  (THREE.Sprite  — canvas texture label)
      │     └── Avatar       (THREE.Mesh    — CircleGeometry placeholder)
      │
      ├── PlayerAreaObject3D (area_2)
      └── ...
```

### Module Responsibilities

| Module | File | Trách nhiệm |
|--------|------|-------------|
| **PlayerAreaConfig** | `src/objects/PlayerAreaConfig.ts` | Layout positions for 2–6 players, visual constants |
| **PlayerAreaObject3D** | `src/objects/PlayerAreaObject3D.ts` | 3D area group with border, label, avatar, hover/select states |
| **PlayerAreaManager** | `src/objects/PlayerAreaManager.ts` | Create/manage all areas, selection, hover, spatial queries |
| **PlayerAreaHUD** | `src/ui/PlayerAreaHUD.ts` | HTML panel for player count selection and visibility toggle |

### Layout Calculation

For 2, 3, and 4 players: manually tuned positions ensure the deck zone (`x ≈ -3.5`) is not obscured.

For 5 and 6 players: ellipse parameterization:
$$x_i = \cos\!\left(\tfrac{2\pi i}{n} - \tfrac{\pi}{2}\right) \times 5.5$$
$$z_i = \sin\!\left(\tfrac{2\pi i}{n} - \tfrac{\pi}{2}\right) \times 3.0$$

Clamped to `x ∈ [-6.0, 6.0]`, `z ∈ [-3.5, 3.5]` (within felt `±7.5 / ±4.75`).
Rotation: $\text{rotationY}_i = \text{atan2}(-\sin\theta_i,\, \cos\theta_i)$ (faces inward toward center).

### Interaction Priority

PlayerArea interaction is **always subordinate** to Card/Deck interaction:
1. On `mousemove`: if `RaycastInteractionManager.getHoveredObject() !== null` → skip PlayerArea hover.
2. On `click`: if a Card/Deck was the hovered object → skip PlayerArea select.
3. Otherwise: raycast table plane (y=0) → find area via `PlayerAreaManager.findAreaAtPoint(x, z)`.

This ensures PlayerAreas never interfere with Card drag, selection, or deck drawing.

### Visual States

| State | Border Color | Opacity |
|-------|-------------|---------|
| Default | Cyan `0x00ccff` | 0.6 |
| Hover | Light Cyan `0x44ddff` | 0.85 |
| Selected | Green `0x00ff88` | 1.0 |

### CardRegistry Invariant

PlayerArea holds **zero ownership** of cards. `CardRegistry` remains the sole source of truth for card location (`IN_DECK` or `ON_TABLE`). Cards can freely move into or out of a PlayerArea without any registry change.

### Design Constraints (Out of Scope for M1.4.0)

- No TurnManager, no current-player tracking.
- No card ownership by area.
- No hand limit or forced area placement.
- No multiplayer sync of area selection.
- No automatic card dealing into areas.

---

## 17. Dynamic Polygon Table System & Adaptive Table Scaling (M1.4.1)

### Overview

The Dynamic Polygon Table System transforms the tabletop from a fixed-size rectangle into an adaptively scaled surface that alters shape based on player count (2–8 players).

```
PlayerAreaHUD (Select 2–8)
       │
       ▼
SceneManager.rebuildTable(count)
       │
       ├─► TableObject3D.rebuild(count)
       │         │
       │         ▼
       │   TableGeometryBuilder:
       │   - 2–4 players: Rectangle (BoxGeometry felt, 4 box rails, box apron, 4 legs)
       │   - 5–8 players: Regular N-Polygon (ExtrudeGeometry felt, N edge rails, extruded apron, N legs)
       │
       ├─► PlayerAreaManager.setupLayout(count, labels, circumradius)
       │   - Places areas along polygon edge midpoints facing center
       │
       ├─► CameraController.setAdaptiveRadius(cameraRadius)
       │   - Adjusts orbital distance to comfortably frame the table
       │
       └─► SceneManager.requestRender()
```

### Table Shapes and Geometries (M1.4.2 Scaled Dimensions)

| Player Count | Shape Type | Sides ($N$) | Circumradius ($R$) | Inradius ($r_{in}$) | Rails | Legs | Camera Radius |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **2** | Rectangle ($20.0 \times 13.0$) | 4 | 11.93 | 6.50 | 4 | 4 | 18.0 |
| **3** | Rectangle ($22.0 \times 14.5$) | 4 | 13.17 | 7.25 | 4 | 4 | 20.0 |
| **4** | Rectangle ($24.0 \times 16.0$) | 4 | 14.42 | 8.00 | 4 | 4 | 22.0 |
| **5** | Pentagon | 5 | 12.00 | 9.71 | 5 | 5 | 23.5 |
| **6** | Hexagon | 6 | 13.50 | 11.69 | 6 | 6 | 26.5 |
| **7** | Heptagon | 7 | 15.00 | 13.51 | 7 | 7 | 29.5 |
| **8** | Octagon | 8 | 16.50 | 15.24 | 8 | 8 | 32.0 |

### Geometry Construction Principles

1. **Polygon Felt**:
   - Built via `THREE.Shape` and `THREE.ExtrudeGeometry` with thickness `TABLE_CONFIG.FELT_THICKNESS` (0.1).
   - Rotated by $\pi/2$ around X axis so top face is flush at $Y = \text{TABLE\_CONFIG.SURFACE\_Y}$ ($0.0$) with vertex normals pointing directly upwards ($+Y$).
2. **Consecutive-Vertex Mitered Rails**:
   - Every rail segment is built directly from consecutive boundary vertices $P_1$ and $P_2$:
     $$\vec{D} = P_2 - P_1,\quad L = \|\vec{D}\|,\quad M = \frac{P_1 + P_2}{2}$$
     $$\theta = \text{atan2}(-(P_2.z - P_1.z),\, P_2.x - P_1.x)$$
   - In local space, the cross-section is an exact trapezoid with miter expansion offset:
     $$\Delta x = W \tan\left(\frac{\pi}{N}\right)$$
   - Inner edge along felt: $[-L/2, L/2]$ at $z=0$.
   - Outer edge: $[-L/2 - \Delta x, L/2 + \Delta x]$ at $z=W$.
   - Adjacent rails meet along the shared miter face with zero gaps, zero overlap, forming a closed continuous border.
3. **Table Apron**:
   - Built via `THREE.ExtrudeGeometry` from the outer boundary polygon shape matching the outer rail perimeter, positioned directly below the felt and rails.
4. **Table Legs**:
   - Rectangle: 4 cylinder legs inset from corners.
   - Polygon: $N$ cylinder legs inset radially from each vertex corner.

### Perimeter Player Area Layout

For polygon tables ($N \ge 5$):
- Edge $i$ midpoint angle: $\theta_i = \frac{2\pi i}{N}$ (starting at South for player 1).
- Inradius: $r_{in} = R \cos(\pi/N)$.
- Area center: $r_{area} = r_{in} - \frac{\text{PLAYER\_AREA\_DEPTH}}{2} - \text{RAIL\_CLEARANCE}$ ($r_{in} - 1.35$).
- Area position: $x_i = r_{area} \sin \theta_i$, $z_i = r_{area} \cos \theta_i$.
- Orientation: $\text{rotationY}_i = \text{normalizeAngle}(-\theta_i)$ (faces the center of the table).
- Clearance: Leaves central area of radius $\ge 3.5$ units open, ensuring demo deck ($x = -3.5$) and play cards are never obscured.

### Adaptive Camera Framing

- `CameraController.computeAdaptiveRadius(tableRadius, aspect)` calculates distance required to frame the table taking into account vertical FOV ($45^\circ$), polar angle $\phi$ ($53^\circ$), and viewport aspect ratio.
- Clamped within `minDistance` (4.5) and `maxDistance` (40.0).
- Updates `_options.initialRadius` so `resetCamera()` returns to the newly adapted view.

### Invariants & Sandbox Architecture

- **Card/Stack Invariant**: Rebuilding the table does NOT affect card positions, stack arrangement, or `CardRegistry` ownership records.
- **Resource Cleanup**: `TableObject3D.rebuild()` disposes all previous geometries and materials recursively using `Disposer.disposeObject3D()`.
- **Sandbox Philosophy**: No TurnManager, no dealing automation, no rules enforcement. Table shape is purely a spatial and visual canvas.

---

## 18. Distinct Table Zones Architecture (M1.4.2)

### Four Distinct Tabletop Zones

M1.4.2 separates the tabletop surface into 4 non-overlapping functional zone classes:

```
                  [ Table Rail ]
           ┌─────────────────────────┐
           │   Player Area (Seated)  │ (4.8 × 2.2, label + avatar)
           └─────────────────────────┘
                      │
                      ▼
           ┌─────────────────────────┐
           │   Card Placement Zone   │ (4.6 × 2.4, oriented to player)
           └─────────────────────────┘
                      │
                      ▼ (Generous Central Playing Arena)
          ┌──────────────┐   ┌──────────────┐
          │  Deck Zone   │   │ Discard Zone │
          │ (Draw Pile)  │   │  (Discard)   │
          └──────────────┘   └──────────────┘
```

1. **Player Area (`PlayerAreaObject3D`)**:
   - Perimeter zone representing the seated player, with label and avatar indicator.
2. **Card Placement Zone (`TableZoneObject3D`)**:
   - Dedicated active playing zone in front of each player, oriented towards them ($|rot_Y^{placement} - rot_Y^{player}| \equiv 0$).
3. **Deck Zone (`TableZoneObject3D`)**:
   - Dedicated draw deck position placed near center-left ($x = -2.2, z = 0$ for $N \ge 3$; $x = -3.8$ for $N = 2$).
4. **Discard Zone (`TableZoneObject3D`)**:
   - Dedicated discard pile position adjacent to Deck Zone ($x = +2.2, z = 0$ for $N \ge 3$; $x = +3.8$ for $N = 2$).
5. **Central Arena Clearance**:
   - Proven by Separating Axis Theorem (SAT) tests to have zero overlaps between any zones across all 2–8 player configurations.
   - Preserves complete freedom for cards and stacks on the sandbox surface.

---

## 19. Private Hand Zone System (M1.5)

### Overview

The Hand Zone System gives each player a personal card-holding area in the 3D scene. It integrates with the existing `CardRegistry`, `DragController`, and `RaycastInteractionManager` without adding new input listeners or competing subsystems.

```
HandZoneManager
      │
      ├── HandZoneObject3D (hand_0)  extends THREE.Group
      │     ├── FillPlane     (THREE.Mesh — semi-transparent)
      │     ├── BorderLoop    (THREE.LineLoop)
      │     └── LabelSprite   (THREE.Sprite — "[Player] • N lá")
      │
      ├── HandZoneObject3D (hand_1)
      ...
      └── HandZoneObject3D (hand_N-1)
```

### Key Files

| File | Responsibility |
|------|----------------|
| `HandZoneConfig.ts` | Layout constants (width, height, surface offset, rail clearance) |
| `HandZoneObject3D.ts` | 3D object: card arrangement, hover lift, label badge |
| `HandZoneManager.ts` | Lifecycle management, zone rebuild on player count change, card migration |

### drawCardToHand() Transaction (SceneManager.ts)

The atomic 5-phase draw-to-hand operation in `SceneManager.drawCardToHand(deckId, playerIndex)`:

```
Phase 1: registry deck→table   (CardRegistry.transferDeckToTable)
Phase 2: pop card from DeckObject3D scene
Phase 3: add CardObject3D to Three.js scene + register with RaycastInteractionManager
Phase 4: registry table→hand   (CardRegistry.transferTableToHand)
Phase 5: HandZoneManager.addCardToHand(playerIndex, card)
```

On any failure: rollback in reverse order (Phase 5 → Phase 1). Re-entrancy lock `_isDrawingCard` prevents concurrent draws.

### Card Arrangement Algorithm (M1.7.7.1 — flat overlapping row)

`HandZoneObject3D.arrangeCards()` always lays every card flat on one horizontal plane and positions N cards inside the usable width:

$$W_{\text{usable}} = W_{\text{zone}} - W_{\text{card}} - 2 \cdot M \qquad (M = 0.15)$$

$$S_{\text{desired}} =
\begin{cases}
W_{\text{card}} + 0.06 & N \le 3 \\
0.62 \cdot W_{\text{card}} & 4 \le N \le 6 \\
0.48 \cdot W_{\text{card}} & 7 \le N \le 10 \\
0.34 \cdot W_{\text{card}} & N \ge 11
\end{cases}$$

$$S = \min(S_{\text{desired}}, \frac{W_{\text{usable}}}{N - 1})$$

- The row is centred on the zone: card $i$ at local $x = -\frac{(N-1)S}{2} + iS$.
- Every card keeps `rotation.x = 0`, `rotation.z = 0` and only the zone yaw on Y — there is no fan, no pitch and no per-card depth arch.
- Each card at elevation $y = \text{SURFACE\_Y} + i \cdot 0.002$ to eliminate Z-fighting.
- Selected card: floats $+0.12$ above the hand and gets `renderOrder += 100`.
- Hover (local player only): `+0.05` Y, scale `1.04`, `renderOrder += 30`; neighbours are not moved and rotation is unchanged.
- `findCardByRay()` uses the same `S`, so every overlapping card keeps a deterministic hit-test strip.
- The M1.7.3 fan/preview state (`setPreviewActive`, preview animation, fan spacing/angle) was removed in M1.7.7.1; there is no fallback path that can re-enable it.

### Drag & Drop Integration

| Drop source | Drop target | Result |
|-------------|-------------|--------|
| Hand zone | Table (empty) | `transferHandToTable`, card becomes free on table |
| Table | Hand zone | `transferTableToHand`, card added to hand |
| Hand zone | Same hand zone | Reorder by X position |
| Hand zone | Other hand zone | `transferHandToHand` |
| Stack | Hand zone | Dissolve stack, each card transferred to hand |

### Player Count Rebuild

When table shape changes (2–8 players), `HandZoneManager.rebuildHandZones()`:
1. Saves hand card arrays for all existing zones.
2. Disposes old `HandZoneObject3D` instances.
3. Creates new zones at updated polygon edge positions.
4. Migrates hand_i cards → new hand_i. Cards from removed zones (player count decrease) merge into Player 0's hand.

### Design Decisions

- **D007**: Private card visibility for multiplayer is implemented in M1.5.1 via `ViewStateBuilder.ts`. Backend strips `cardType` and sets `faceUp: false` for all cards owned by other players before transmitting WebSocket payloads. Frontends only instantiate card front faces for cards they own.
- **D008**: Hand cards are registered with `RaycastInteractionManager` exactly like table cards, so hover glow and drag work automatically with no special-casing.
- **D009**: `HandZoneObject3D` uses a `document` guard in `_buildLabel()` to safely run under jsdom in unit tests (canvas not implemented in jsdom; guard prevents `ReferenceError`).
- **D010 (M1.7.8)**: The Full Hand Fan Preview is a **pure screen-space UI layer** (`FullHandFanPreviewUI` + `FanPreviewConfig`). It never touches 3D card transforms, `CardRegistry`, or game state, and never broadcasts hover — it is opened/closed exclusively through local-only callbacks (`SceneManager.onLocalHandHoverChanged`, `SceneManager.onLocalHandChanged`).
- **D011 (M1.7.9 Part A)**: The Online player camera perspective reuses the exact Offline mechanism (`SceneManager.setPlayerPerspective` → `computePlayerPerspective` → `CameraController`). There is deliberately **no second camera algorithm** — Online merely supplies its own local player seat. Camera is client-only and never broadcast.

#### Full Hand Fan Preview (Screen-Space Overlay) — M1.7.8

- **Trigger**: `SceneManager._interactionManager.onHoverChanged` resolves whether the current/previous hovered card belongs to the local player's own hand zone (authoritative zone ownership via `HandZoneManager`, local index = `SceneManager._activePlayerIndex`). Opponent hands never qualify.
- **Content**: `SceneManager.getLocalHandCards()` snapshots the local hand in authoritative order; `App` maps them to `FanCardData` (`id`, `cardType`, `title`, `masked`) for the overlay.
- **Presentation**: `FullHandFanPreviewUI` renders a fixed bottom overlay into `#ui-overlay` with inline `pointer-events: none` (so the 3D hover/drag keeps working underneath), `z-index: 150`, fade open/close, close timer cleanup, resize relayout, and DOM-node reuse when the card signature is unchanged (no flicker on hover switch).
- **Geometry**: `computeFanLayout(cardCount, viewportWidth, viewportHeight)` → symmetric arc (`angle = t × halfSpread`, `halfSpread = min(28°, 8° + 1.6° × N)`), raised centre (`y = −arcHeight × (1 − t²)`), adaptive spacing by hand size, rotated-extent clamping so the fan stays inside the viewport.
- **Isolation**: fan transforms are CSS-only on overlay elements; original hand cards keep the M1.7.7.1 flat presentation (no fan/rotation/position/scale changes) — verified by F178-12.

#### Interactive Fan & Pointer Boundary — M1.7.9 Part B

- **Fan interaction** (`FullHandFanPreviewHandlers`): hover / click / drag intents on fan cards are forwarded by `FullHandFanPreviewUI` (per-card listeners: `mouseover`, primary `mousedown`, `click`) keyed by the source card id (the fan card id **is** the authoritative card id — no gameplay copy / preview-only card is minted).
- Handlers delegate to the real card pipelines:
  - hover → `RaycastInteractionManager.setHoveredObject(card)` (public M1.7.9 entry mirroring internal `_updateHover` + `onHoverChanged`).
  - select → existing selection manager (`selectObject` / `deselectObject` / multi-select via ctrl/meta).
  - drag → `DragController.beginDrag(card, event)` (public wrapper over `_onCardPointerDown`) → existing drag pipeline → fan closes via existing `onDragStarted` → gameplay drop pipeline on drop.
- **Pointer boundary**: overlay root keeps `pointer-events: none`; fan cards opt into `pointer-events: auto` (CSS class + inline). The unified interaction zone is the local HAND 3D + fan overlay; fan stays open when moving HAND → Preview, Preview → HAND, or between fan cards; closes only when the canvas raycast reports leaving the local hand (no ad-hoc timeout). Canvas camera controls are unaffected (drag suppresses orbit only while a real drag is active).

---

## 20. Multiplayer Room Architecture & Private Hand State Isolation (M1.5.1)

### Overview

M1.5.1 connects frontend clients to the authoritative backend WebSocket server, enabling true multiplayer rooms with ironclad card privacy.

```
Client A (Player 0)               Server (RoomManager)              Client B (Player 1)
       │                                   │                                 │
       │─── room:create ──────────────────>│                                 │
       │<── room:joined (P0) ──────────────│                                 │
       │                                   │<── room:join (roomId) ──────────│
       │                                   │─── room:joined (P1) ───────────>│
       │<── room:player-joined (Bob) ──────│                                 │
       │                                   │                                 │
       │─── card:draw ────────────────────>│                                 │
       │                                   │ [Room.drawCard]                 │
       │                                   │ [ViewStateBuilder per-client]   │
       │<── hand:card-drawn (with face) ───│                                 │
       │                                   │─── hand:card-drawn (masked) ───>│
```

### Security Boundary: ViewStateBuilder

```
Raw State in Backend Room:
  card_1: { id: "card_1", cardType: "see-the-future", ownerId: "playerA", location: "HAND", faceUp: true }

ViewStateBuilder.filterObjectForClient(card_1, viewingSessionId):
  When viewer === "playerA":
    → { id: "card_1", cardType: "see-the-future", ownerId: "playerA", location: "HAND", faceUp: true }
  When viewer === "playerB":
    → { id: "card_1", ownerId: "playerA", location: "HAND", faceUp: false } // cardType completely omitted
```

### Local Visual Feedback
- **Hover Lift**: When the local player hovers their own hand card, `RaycastInteractionManager` notifies `SceneManager`, which re-arranges the flat row: the hovered card is elevated by $+0.05$ units, scaled to $1.04\times$, and gets `renderOrder += 30`. Rotation never changes, neighbours are not displaced, and the pointer-leave path restores the exact baseline.
- **Zero Cross-Client Leak**: Hover events are purely client-side Three.js transforms and are never transmitted over the network.

---

## 21. Player Perspective & Camera Orientation (M1.5.2)

### Overview
In M1.5.2, each player is assigned a personalized camera perspective based on their seat position (`playerIndex`) at the table (2–8 players), ensuring their private Hand Zone appears horizontally centered at the bottom of the screen.

```
                  Player 2 (Seat: Z < 0, North)
                      ┌──────────────────┐
                      │   Hand Zone P2   │
                      └──────────────────┘
                            ▲      │
                            │      ▼
      ┌──────────┐     ┌──────────────┐     ┌──────────┐
      │ Hand P4  │ ◄───┤ Table Center │───► │ Hand P3  │
      └──────────┘     │   (0, 0, 0)  │     └──────────┘
      (West, X<0)      └──────────────┘     (East, X>0)
                            ▲      │
                            │      ▼
                      ┌──────────────────┐
                      │   Hand Zone P1   │
                      └──────────────────┘
                  Player 1 (Seat: Z > 0, South)
```

### Mathematical Model & Derivation
- Camera spherical orbit position in `CameraController`:
  $$x = \text{target.x} + r \cdot \sin(\phi) \cdot \sin(\theta)$$
  $$z = \text{target.z} + r \cdot \sin(\phi) \cdot \cos(\theta)$$
  where $\text{target} = (0, 0, 0)$ is the table center.
- For a seat at $(px, pz)$ around the table perimeter:
  $$\theta = \operatorname{atan2}(px, pz)$$
- Placing camera at this $\theta$ positions the camera directly behind the player's Hand Zone looking through it towards the table center.
- As a result:
  - The player's Hand Zone projects to the bottom-center of their screen ($Y_{\text{NDC}} \in [-1, 0]$, $X_{\text{NDC}} \approx 0$).
  - Opponents' hands appear across the table according to their physical seating.
  - World coordinate space $(X, Y, Z)$ remains 100% identical and unified across all clients. Cards placed on the table exist at the exact same world positions.

### Architectural Rules & Isolation
1. **Strictly Client-Side**:
   - Camera position, orientation ($\theta, \phi$), radius, and zoom are purely local.
   - No camera parameters are ever transmitted across WebSocket or stored in Room state.
2. **Orbit Persistence During Room Updates**:
   - `App.ts` tracks `_lastConfiguredRoomId`, `_lastConfiguredPlayerIndex`, and `_lastConfiguredPlayerCount`.
   - Normal room events (`room:state`, card plays, card moves, draws) do **not** trigger perspective changes. The player's active camera orbit is never interrupted or jerked.
3. **Seat-Aware Reset**:
   - `CameraController.setPlayerPerspective` updates `_options.initialTheta = theta`.
   - When the user presses the **Reset Camera** button (or keyboard shortcut), the camera resets to their personal seat perspective, not hardcoded Player 1.
4. **Smooth Perspective Transitions**:
   - Room join / seat switch triggers `_animateToPerspective(...)` with cubic ease-out over 600ms. Disposing the controller cancels any pending animation frame safely.

---

## 22. Local Card Hover Expansion (M1.5.3, hardened in M1.7.6)

### Overview
Hover Expansion allows players to comfortably inspect and select their own cards resting on the tabletop (`location === 'TABLE'`). When hovering over a card owned by the local player, neighboring cards belonging to the same player fan out horizontally with a smooth cubic/smoothstep animation.

### Authoritative Ownership (M1.7.6)
`_ownerId` on `CardObject3D` is a **HAND-only** mirror: it is set when a card enters a hand and is cleared on every HAND→TABLE path (`_clearHandPresentation`, `syncRoomObjects`, `onRemoteDragEnd`, `syncFlippedCard`). The server stores TABLE cards with `ownerId = null` (`Room.playCardToTable`), so a played card is never owned.

Hover expansion therefore gates on `SceneManager.isTableCardOwnedByLocalPlayer(card)` via `HoverExpansionController.setEligibilityCheck()`:
- the `CardRegistry` location is `ON_TABLE`,
- the card is not in any hand zone (`isInHand() === false`, `getHandZoneId() === null`),
- the card still carries the local session as owner.

A stale `_ownerId` can therefore no longer re-expand a just-dropped TABLE card, even while the pointer rests on it and raycast hover fires repeatedly. `HandZoneObject3D._computeSlot()` independently requires `card.getHandZoneId() === this.zoneId` before applying the hand hover lift/scale/layer, so a stray global hover callback cannot animate a non-member.

### Grouping and Visual Mechanics
- **Activation Scope**: Strictly limited to cards passing the authoritative eligibility check above and `location === 'TABLE'`. Cards without an `ownerId`, cards belonging to other players, cards in Hand Zones, cards in Decks, and cards in Stacks do not trigger expansion.
- **Spatial Clustering**: Gathers all owned cards within radius $R = 5.0$ units of the hovered card.
- **Fan-Out Layout**:
  - Cards in the group are distributed along the local X-axis with spacing $\text{spacing} = \text{cardWidth} \times 1.1$.
  - Group scale is amplified to $1.15\times$.
  - The specifically hovered card is elevated by $+0.5$ units along Y to stand out prominently.
- **Animation & Restoration**:
  - Animated over $200\text{ ms}$ using requestAnimationFrame with smoothstep interpolation: $t_{\text{eased}} = t^2(3 - 2t)$.
  - When the cursor leaves the group, cards smoothly collapse back to their baseline transform.
  - When a drag begins, `cancelExpansion()` immediately snaps cards to baseline without animation to avoid transform conflicts with `DragController`.
- **Zero Network Impact**: The effect is purely local and client-side. No WebSocket messages are dispatched, and `CardRegistry` logical positions remain completely unchanged.

### Hand Hover Presentation (M1.7.7)

The **hand-zone** hover presentation (private hand, local player only) was redesigned in M1.7.7 from the old "stand-up reveal" to a modern battler-style subtle hover:
- Gentle Y lift (`HAND_ZONE_CONFIG.HOVER_LIFT_Y = +0.05`) and tiny scale (`HOVER_SCALE = 1.05`).
- **No stand-up pitch** (`rotationX = 0`), **no fan rotation**, no neighbour displacement, and only a small render-order bump (`HOVER_LAYER_OFFSET = +30`) above neighbours.
- A selected card keeps its stronger highlight (selection layer +100 / selection elevation).
- Hover-out restores the exact baseline transform (scale 1, baseline layer, baseline position).
- Fan preview (M1.7.3) remains available for zone-entry preview; it is orthogonal to the subtle hover.

---

## 23. Multiplayer Shared Interaction & Remote Cursor Protocol (M1.5.3)

### Overview
Enables real-time collaborative sandbox interaction by synchronizing player mouse positions (remote 3D cursors) and real-time drag movements across all connected peers in a multiplayer room.

### Remote Cursor Architecture (`RemoteCursorManager`, `CursorBroadcaster`)
- **Protocol**:
  - Client $\to$ Server: `cursor:move` with `{ x, z, seq }` on the tabletop plane.
  - Server $\to$ Peers: `cursor:update` with `{ playerId, playerName, x, z, seq }` broadcast to all other room members.
- **Network Optimization**:
  - **Throttling**: Maximum 20 updates per second ($50\text{ ms}$ interval) enforced by `CursorBroadcaster`.
  - **Dead Zone**: Small movements under $0.05$ world units are filtered out to conserve bandwidth.
  - **Anti-Jitter / Out-of-Order Rejection**: `RemoteCursorManager` tracks `lastSeq` per remote player; updates with older sequence numbers are discarded.
- **Rendering**:
  - Each remote cursor is represented by a 3D Cone geometry tilted along the table surface ($Y = 0.12$), color-coded by `playerIndex`.
  - A dynamic canvas-based sprite displays the player's name above the cursor pointer.
  - Remote cursors are automatically removed when players leave or disconnect.

### Real-Time Drag Synchronization
- **Protocol**:
  - `object:drag-start`: Broadcasts when a player picks up a card with position.
  - `object:drag-move`: Throttled stream ($50\text{ ms}$) broadcasting current in-flight coordinates.
  - `object:drag-end`: Broadcasts final resting coordinates upon drop or cancel.
- **State Integrity**:
  - Temporary drag coordinates and remote cursors are ephemeral and never pollute authoritative `RoomState` objects.
  - `ViewStateBuilder` data visibility rules remain strictly enforced: cards in private hands never broadcast their identities or types during movement.

---

## 24. Authoritative Drag Locking, Anti-Jitter & Hand Privacy Security (M1.5.3.1)

### Overview
Refines multiplayer synchronization to eliminate race conditions, cursor jitter, and data leakage across connected clients.

### 1. Authoritative Drag Locking (`Room.ts`, `MessageDispatcher.ts`)
- **Exclusive Drag Ownership**:
  - When a client sends `object:drag-start`, `Room.dragLock(objectId, sessionId)` locks the object to that player.
  - If another client attempts to drag an actively locked object, the backend rejects it with an error code `OBJECT_LOCKED`.
  - While dragged, `object:drag-move` updates are only processed and broadcast if the sender holds the lock.
- **Lock Release & Authoritative Commit**:
  - When `object:drag-end` is received, `Room.updateObjectAfterDrag()` updates the authoritative position, transitions the card to `location = 'TABLE'` if it was in `HAND`, updates `faceUp`, and clears `lockedBy`.
  - The drop event is broadcast to other peers with final coordinates and `faceUp` state.
- **Disconnection Safeguard**:
  - If a player abruptly closes their WebSocket or disconnects, `MessageDispatcher.handleDisconnect()` releases all locks held by that session (`Room.clearSessionLocks()`) and broadcasts `object:drag-end` to ensure objects are never orphaned or permanently locked.

### 2. Client-Side Anti-Jitter & Local Protection (`SceneManager.ts`)
- **Active Drag Isolation**:
  - `SceneManager.onRemoteDragStart/Move/End` checks if the local client is currently dragging the target object (`_dragController.isDragging() && _dragController.getDraggedCard()?.cardId === objectId`).
  - Remote drag updates for a locally held card are dropped immediately, preventing local jitter or position snapping.
- **Sequence Ordering**:
  - `SceneManager` maintains a `_remoteDragSeq` map tracking the latest sequence number per object. Any out-of-order `object:drag-move` or `object:drag-end` with `seq < lastSeq` is safely ignored.

### 3. Hand Privacy & Orientation Retention (`ViewStateBuilder.ts`, `MessageDispatcher.ts`)
- **Zero Privacy Leakage on Hand Card Flip**:
  - When a player flips a card in `HAND`, `MessageDispatcher._handleObjectFlip()` sends `object:flipped` ONLY to the card's owner. Opponents never receive the event.
- **Enforced Opponent Masking**:
  - In `ViewStateBuilder.filterObjectForClient()`, cards in an opponent's hand are strictly filtered: `faceUp: false` is forced and `cardType` is removed from the payload. For the owner, the true `faceUp` state is preserved.
- **Orientation Retention on Table Placement**:
  - When a card is played to or dropped on the table, its `faceUp` orientation is preserved: face-down cards remain face-down, and face-up cards remain face-up without automatic inversion.

---

## 25. Hand Privacy, Card Ownership & Player Area Optimization (M1.5.4)

### Overview
Finalizes the multiplayer hand zone, security isolation, card ownership transfer, and physical layout containment for Cat Boom Online.

### 1. Hand Privacy & Front-Face Masking
- **Client-Side Visual Masking (`CardObject3D.ts`)**:
  - `CardObject3D` provides `setMasked(masked: boolean)` and `isMasked()`.
  - When masked (`masked = true`), `_frontMaterial.map` is swapped to `this._backTexture`.
  - Even if an opponent's card is flipped or inspected in the 3D scene, both the front and back faces render the card back texture.
  - Unmasking restores `_frontMaterial.map` to `this._frontTexture`.
- **Backend View Filtering (`ViewStateBuilder.ts`, `RoomBroadcaster.ts`)**:
  - For all outgoing messages (`room:state`, `hand:card-drawn`, `hand:card-transferred`, `object:drag-end`), if `location === 'HAND'` and `ownerId !== viewingSessionId`, `cardType` is stripped and `faceUp` is set to `false`.

### 2. Card Ownership Transfer Between Players
- **Cross-Player Transfer Architecture**:
  - When a player drags a card from table or hand and drops it into an opponent's Hand Zone (`targetHandZone.playerIndex !== localPlayerIndex`), the frontend triggers `onCardTransferRequested` / sends `card:transfer` (or includes `targetPlayerIndex` in `object:drag-end`).
- **Atomic Validation & Rollback (`Room.ts`)**:
  - `Room.transferCard(fromSessionId, cardId, targetSessionId)` validates:
    1. Card exists in room.
    2. Requesting player is the current owner (`card.ownerId === fromSessionId && card.location === 'HAND'`).
    3. Target player exists and is connected (`targetPlayer.isConnected === true`).
  - If any check fails, an error is sent (`NOT_CARD_OWNER`, `TARGET_PLAYER_NOT_FOUND`, etc.) and all mutated properties (`ownerId`, `location`, `position`, `handIndex`, `faceUp`) are rolled back atomically.
  - The drag lock on the transferred card is cleanly released.
- **Differentiated Distribution (`RoomBroadcaster.broadcastHandCardTransferred`)**:
  - The recipient receives `hand:card-transferred` with the card's real `cardType` and orientation.
  - The sender and third-party peers receive `hand:card-transferred` with `cardType: undefined` and `faceUp: false`.

### 3. Hand Zone Boundary Containment & Adaptive Layout (`HandZoneObject3D.ts`)
- **Strict Boundary Math (M1.7.7.1)**:
  - Outermost card edges are guaranteed to stay within `[-zoneWidth / 2, +zoneWidth / 2]`:
    $$\text{usableWidth} = \max\left(0, \text{zoneWidth} - \text{cardWidth} - 2 \cdot 0.15\right)$$
    $$S_{\text{desired}} = \begin{cases} \text{cardWidth} + 0.06 & N \le 3 \\ 0.62 \cdot \text{cardWidth} & 4 \le N \le 6 \\ 0.48 \cdot \text{cardWidth} & 7 \le N \le 10 \\ 0.34 \cdot \text{cardWidth} & N \ge 11 \end{cases}$$
    $$\text{spacing} = \begin{cases} 0 & \text{if } N \le 1 \\ \min\left(S_{\text{desired}}, \frac{\text{usableWidth}}{N - 1}\right) & \text{otherwise} \end{cases}$$
  - For any count from 1 to 15 cards, cards remain horizontally centered around local $X = 0$ and flat on one plane (`rotation.x = rotation.z = 0`).
- **Hover Lift & Visual Priority**:
  - Hovering a hand card elevates it ($+0.05$), slightly scales it ($1.04$), and boosts its visual rendering order ($+30$) so overlapping cards are easily inspected and picked up without modifying array order in the registry or hand list. Rotation never changes and the pointer-leave path restores the exact baseline.
- **Dynamic Re-Centering**:
  - Adding or removing cards re-centers remaining cards automatically.

### 4. Drag Protection (`DragController.ts`)
- `DragController.canDragCard` verifies card ownership. If a card is currently located in another player's hand zone, drag interaction is blocked, preventing unauthorized theft or movement of opponent cards.

---

## 26. Persistent Fan Drag, Fan Visual Priority & Local Camera Perspective (M1.7.10)

### Overview
Three refinements on top of M1.7.8/M1.7.9: the screen-space Full Hand Fan Preview stays visible for the whole drag, each fan card has hover/selected/drag visual priority, and the Online camera's first frame matches Reset Camera for every seat.

### 1. Single camera perspective source (`SceneManager.applyLocalPlayerPerspective`)
- All perspective entry points — initial scene setup after a room join, the **Reset Camera** button and the **R** key — call `SceneManager.applyLocalPlayerPerspective(animate)`.
- It resolves the seat through `computePlayerPerspective(playerIndex, playerCount)` and applies target / theta / radius / phi through `CameraController.setPlayerPerspective()` / `setAdaptiveRadius()` / `setTarget()`.
- `CameraController.setDefaultTarget(seatTarget)` records the seat target; `resetCamera()` uses it via the `onResetRequested` hook, so a manual reset restores exactly the initially rendered framing.
- The camera is client-local (never in a WS payload). Per-frame orbit input is never overwritten: the perspective is only re-applied on seat/room/resize changes and on explicit reset.

### 2. Persistent fan drag lifecycle
- `SceneManager` owns the drag flag: `_localHandDragActive` + `_lastDraggedCardId`, exposed through `isLocalHandDragActive()`.
- `DragController.onDragStarted` only records the dragged card — it never hides the fan. `onDragFinished` / drop handling decides visibility with the rule below.
- Hand-membership refreshes do not re-evaluate hover while `_localHandDragActive` is true, so the overlay cannot flicker or close mid-gesture.

### 3. Drag-end boundary rule (HAND + Preview)
Evaluated once, when the drop pipeline finishes:

| Condition | Result |
|---|---|
| Last dragged card is still in the local HAND (reorder / cancel / rejected drop) | Fan stays open |
| Card left the HAND **and** pointer is over the Preview overlay | Fan stays open |
| Card left the HAND and pointer is outside both HAND and Preview | Fan closes, stale hover cleared |

- Pointer provenance: `DragController` records `_lastPointerClientX/Y` on pointer-down, move and mouse-up, exposed as `getLastPointerPosition()`.
- Preview containment: `FullHandFanPreviewUI.containsPoint(x, y)` tests the overlay root rect (false when closed/zero-sized) and is injected into `SceneManager` as `isPointOverLocalHandPreview` from `App.ts`.
- Deliberately screen-space, not a per-frame 3D raycast: stable, jsdom-testable, zero per-frame cost, and no interaction with drag-plane projection.

### 4. Fan card visual priority
`FullHandFanPreviewUI._applyCardVisuals()` assigns an explicit z-order and CSS variables per card:

| State | `z-index` | Lift / scale |
|---|---|---|
| Dragging | `maxSlotZ + 1000` | `--dy-hover: -16px` |
| Selected | `maxSlotZ + 2` (`fhfp-card--selected`, glow) | stronger lift/scale |
| Hover | `maxSlotZ + 1` | `--dy-hover: -10px`, `--scale: 1.05` |
| Normal | slot z (`1…N`) | slot arc position |

- Priority is strictly **drag > selected > hover > normal**; hovering another card never overrides a selected card.
- Transition is restricted to `transform`/`opacity` (150 ms) on reused DOM nodes — no rebuild, no flicker.
- `_slotZ` is trimmed to the current hand size on relayout so the stacking base never inherits stale z-values from a larger hand.
- Hover/selection bookkeeping is cleared on close, hand shrink and dispose.

### 5. Invariants
- The fan is a *view* of the authoritative hand: membership/order comes from `SceneManager.getLocalHandCards()`; drags always run the real `DragController`/drop pipeline (no duplicate gameplay path).
- Fan cards keep `pointer-events: auto` while the overlay root stays `pointer-events: none`, so empty overlay regions never block canvas interaction.
- Camera state stays local; fan drag state stays local; neither is broadcast.

## 27. Offline Camera Parity and Fan Reorder (M1.7.11)

### Camera lifecycle and framing

- `App` waits for both an authoritative room snapshot and the local `PlayerInfo` before applying an online seat. It uses the room record's `playerIndex` when present and falls back to the joined-session index only for older snapshots.
- `SceneManager.applyLocalPlayerPerspective()` applies the seat-derived azimuth and table-derived adaptive radius while keeping the camera target at the Offline table centre. This matches Offline P1 framing; P2–P4 rotate around that same centre.
- Initial room entry and Reset Camera share this method. Camera values remain client-local and are never sent in WebSocket messages.

### Fan drag state

- `FullHandFanPreviewUI` keeps `visualOrderIds` separate from the committed hand order. While dragging inside the fan, it shifts preview slots and moves the source card under the pointer. On release, the App asks the local `HandZoneObject3D` to commit the card-ID order once.
- The existing hand model has no server-side hand-order persistence or network event, so the reorder remains local. It does not change card ownership or share private hand contents.
- Crossing above the screen-space fan hands the original card ID to `DragController`. During that phase the 2D source copy is hidden, leaving the real 3D card as the visible drag representation. Commit/rollback still follows the existing drop validation and authoritative server response.
- A fan-local drag session prevents the 3D hover path from closing the overlay while the pointer crosses empty spaces between cards. Normal selection remains in `RaycastInteractionManager`; the fan does not own selection state.

## 28. Phiên xem chồng bốc

- Phòng giữ một phiên See hoặc Alter. Khi phiên mở, máy chủ từ chối thao tác đổi thành phần, thứ tự hoặc số lá tác động của chồng. Lá xem vẫn thuộc chồng.
- Mỗi kết nối nhận một bản riêng của phiên, với mã lá chỉ có ý nghĩa trong phiên. Loại lá chỉ có trong bản của người mở hoặc khi lá đã ngửa công khai. Người vào muộn nhận phiên đang mở sau ảnh chụp trạng thái phòng.
- Alter gửi thứ tự nháp để các máy cập nhật hàng 3D. Xác nhận áp hoán vị hợp lệ vào phần đầu của chồng. Hủy, mất kết nối và đặt lại ván đóng phiên.
