# PROJECT_RULES.md — Cat Boom Online
## Digital Tabletop Sandbox 3D

> **Đây là tài liệu quy chuẩn chính thức, bắt buộc áp dụng cho toàn bộ vòng đời phát triển dự án.**
> Mọi thành viên và AI agent đều phải đọc và tuân thủ file này trước khi thực hiện bất kỳ thay đổi nào.

---

## MANDATORY RULE READING PROTOCOL

Trong **MỌI** lần thực hiện công việc (dù nhỏ nhất), trước khi phân tích hoặc chỉnh sửa source code, bắt buộc phải:

1. **Đọc toàn bộ** `PROJECT_RULES.md` từ đầu đến cuối.
2. **Xác định** các quy tắc liên quan đến nhiệm vụ hiện tại.
3. **Kiểm tra** source code hiện tại có tuân thủ không.
4. **Lập kế hoạch** thay đổi theo đúng quy tắc.
5. **Triển khai** theo quy tắc.
6. **Chạy kiểm thử** phù hợp.
7. **Đối chiếu kết quả** với PROJECT_RULES.md.

### Áp dụng cho TẤT CẢ các thao tác:
- Tạo file mới
- Sửa file
- Xóa file
- Refactor
- Thêm tính năng
- Sửa lỗi
- Thay đổi kiến trúc
- Cài đặt dependency
- Thay đổi cấu hình
- Viết test

> ⛔ **KHÔNG ĐƯỢC** bỏ qua bước đọc PROJECT_RULES.md kể cả khi chỉ sửa một dòng code.

> ⛔ Nếu không đọc được file, **phải dừng** thao tác source code và báo lỗi ngay lập tức.

> ⛔ Nếu yêu cầu mới **mâu thuẫn** với PROJECT_RULES.md:
> - Không tự ý bỏ qua quy tắc.
> - Phân tích xung đột chi tiết.
> - Đề xuất cập nhật PROJECT_RULES.md trước.
> - Chỉ áp dụng thay đổi **sau khi quy tắc được thống nhất**.

---

## A. Project Architecture

### A.1 Tổng quan kiến trúc

```
Cat Boom Online
├── frontend/          # Vite + TypeScript + Three.js (Browser)
├── backend/           # Node.js + TypeScript + WebSocket (Server)
└── shared/            # Types, Protocol, Constants (dùng chung)
```

### A.2 Phân chia trách nhiệm

| Module | Trách nhiệm | Không được làm |
|--------|-------------|----------------|
| `frontend/` | Rendering 3D, UI Overlay, Input, Client-side state | Chứa game logic, tin tưởng data từ server mà không validate |
| `backend/` | Game state authority, WebSocket management, Validation | Render, DOM, Browser API |
| `shared/` | TypeScript types, Protocol messages, Constants | Side effects, business logic phức tạp |

### A.3 Frontend Structure
```
frontend/
├── src/
│   ├── main.ts                  # Entry point duy nhất
│   ├── app/
│   │   └── App.ts               # Root application controller
│   ├── scene/
│   │   ├── SceneManager.ts      # Three.js scene lifecycle (singleton)
│   │   ├── CameraController.ts  # Camera movement & controls
│   │   ├── InputHandler.ts      # Mouse/keyboard/touch input
│   │   └── Renderer.ts          # WebGLRenderer wrapper
│   ├── objects/
│   │   ├── ObjectPool.ts        # Object reuse management
│   │   ├── CardObject3D.ts      # 3D card representation
│   │   ├── DeckObject3D.ts      # 3D deck representation
│   │   └── TableObject3D.ts     # Table/surface object
│   ├── ui/
│   │   ├── UIManager.ts         # HTML overlay UI controller
│   │   ├── LobbyScreen.ts       # Lobby UI component
│   │   ├── GameScreen.ts        # In-game HUD component
│   │   └── components/          # Reusable UI components
│   ├── network/
│   │   ├── NetworkClient.ts     # WebSocket client wrapper
│   │   └── MessageHandler.ts    # Incoming message dispatcher
│   ├── store/
│   │   └── ClientStore.ts       # Client-side state (read-only mirror)
│   └── utils/
│       ├── AssetLoader.ts       # Texture/geometry loading
│       ├── Disposer.ts          # Three.js resource cleanup
│       └── Logger.ts            # Frontend logger
```

### A.4 Backend Structure
```
backend/
├── src/
│   ├── index.ts                 # Entry point duy nhất
│   ├── server/
│   │   ├── HttpServer.ts        # HTTP server setup
│   │   └── WebSocketServer.ts   # WS server setup
│   ├── room/
│   │   ├── RoomManager.ts       # Room creation/destruction
│   │   ├── Room.ts              # Room state & player management
│   │   └── RoomStore.ts         # In-memory room storage
│   ├── player/
│   │   ├── PlayerSession.ts     # Per-player connection state
│   │   └── PlayerManager.ts    # Player lifecycle
│   ├── sandbox/
│   │   ├── SandboxState.ts      # Authoritative object positions
│   │   └── ObjectRegistry.ts   # Object ID tracking
│   ├── validation/
│   │   └── MessageValidator.ts  # Input validation (never trust client)
│   ├── protocol/
│   │   └── MessageDispatcher.ts # Route incoming WS messages
│   └── utils/
│       ├── IdGenerator.ts       # UUID generation
│       └── Logger.ts            # Backend logger
```

### A.5 Shared Structure
```
shared/
├── types/
│   ├── protocol.ts              # WS message types
│   ├── gameObjects.ts           # Card, Deck, Object types
│   └── room.ts                  # Room, Player types
└── constants/
    ├── cardTypes.ts             # Card definitions
    └── config.ts               # Shared config values
```

### A.6 Nguyên tắc bắt buộc

- ❌ **Không phụ thuộc vòng tròn**: `frontend` → `shared` ✅ | `shared` → `backend` ❌
- ❌ **Không đặt toàn bộ logic trong một file**: Mỗi file tối đa 400 dòng logic chính.
- ❌ **Không tạo module trùng chức năng**: Kiểm tra trước khi tạo module mới.
- ✅ **Dependency flow**: `frontend` và `backend` đều phụ thuộc `shared`, không ngược lại.
- ✅ **Single Responsibility**: Mỗi file/module chỉ làm đúng một việc.

---

## B. Coding Standards

### B.1 TypeScript

```typescript
// tsconfig phải có strict: true
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```

- ❌ Không dùng `any` tùy tiện — phải có comment giải thích nếu bắt buộc dùng
- ❌ Không dùng `@ts-ignore` nếu không có comment giải thích lý do cụ thể
- ✅ Ưu tiên `unknown` thay `any` cho dữ liệu không rõ type

### B.2 Đặt tên (Naming Conventions)

| Loại | Convention | Ví dụ |
|------|-----------|-------|
| File | `PascalCase.ts` | `CardObject3D.ts` |
| Class | `PascalCase` | `class SceneManager` |
| Interface | `PascalCase` với prefix `I` nếu ambiguous | `interface ICardState` |
| Type | `PascalCase` | `type PlayerId = string` |
| Enum | `PascalCase` | `enum CardType` |
| Function | `camelCase` | `function loadTexture()` |
| Variable | `camelCase` | `const cardMesh` |
| Constant | `SCREAMING_SNAKE_CASE` | `const MAX_PLAYERS = 6` |
| Private field | `camelCase` với underscore prefix | `private _renderer` |
| WS Events | `kebab-case` | `'room:joined'` |

### B.3 Quy tắc code

- ✅ Ưu tiên code dễ đọc, dễ bảo trì hơn code ngắn.
- ✅ Mỗi class/module chỉ đảm nhận **một trách nhiệm rõ ràng** (SRP).
- ❌ Không dùng magic numbers — định nghĩa constant.
- ❌ Không lạm dụng singleton — chỉ dùng khi có lý do kiến trúc rõ ràng.
- ❌ Không viết code trùng lặp (DRY).
- ❌ Không bỏ qua lỗi bằng empty catch:
  ```typescript
  // ❌ SAI
  try { doSomething(); } catch (_e) {}
  
  // ✅ ĐÚNG
  try { doSomething(); } catch (error) {
    logger.error('Context: doSomething failed', { error });
  }
  ```

### B.4 Imports

```typescript
// Thứ tự import:
// 1. Node.js built-ins
// 2. Third-party packages
// 3. Shared modules
// 4. Local modules (relative paths)

import * as path from 'path';
import * as THREE from 'three';
import type { CardState } from '../../shared/types/gameObjects';
import { SceneManager } from './SceneManager';
```

---

## C. Frontend Standards

### C.1 Three.js Scene Management

- ✅ Scene phải được quản lý **tập trung** qua `SceneManager` — đây là single source of truth cho 3D world.
- ❌ Không tạo nhiều `WebGLRenderer` — chỉ **một renderer duy nhất** cho toàn app.
- ✅ Mọi `Object3D` phải được đăng ký với `SceneManager` khi tạo và hủy đăng ký khi xóa.

### C.2 Memory Management

```typescript
// Mọi object 3D khi remove khỏi scene PHẢI được dispose:
function removeCard(mesh: THREE.Mesh): void {
  scene.remove(mesh);
  mesh.geometry.dispose();
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach(m => m.dispose());
  } else {
    mesh.material.dispose();
  }
}
```

- ✅ Dùng `Disposer` utility để cleanup geometry, material, texture.
- ✅ Dùng `ObjectPool` để tái sử dụng mesh khi phù hợp.
- ❌ Không để `Object3D` orphan trong scene sau khi entity bị xóa.

### C.3 Event Listeners

- ❌ Không tạo event listener trùng lặp — dùng `AbortController` hoặc flag kiểm tra.
- ✅ Mỗi component phải có `dispose()` method để cleanup listeners.

### C.4 Render Loop

```typescript
// Render loop tối ưu — chỉ render khi cần
class Renderer {
  private _needsRender = false;
  
  requestRender(): void {
    this._needsRender = true;
  }
  
  private _tick(): void {
    if (this._needsRender) {
      this._renderer.render(this._scene, this._camera);
      this._needsRender = false;
    }
    requestAnimationFrame(() => this._tick());
  }
}
```

- ❌ Không cập nhật toàn bộ scene khi chỉ cần thay đổi một object.
- ✅ Dùng dirty flag hoặc event-driven rendering khi phù hợp.

### C.5 UI và 3D Separation

- ✅ **UI Overlay** (HTML/CSS) và **3D Scene** (Three.js) phải hoàn toàn độc lập.
- ✅ Giao tiếp giữa UI và Scene qua **event bus** hoặc **callback interface** — không import trực tiếp.
- ✅ Camera và input handling phải là module độc lập.

---

## D. Backend Standards

### D.1 Authority Model

- ✅ **Backend là nguồn dữ liệu chính thức (Single Source of Truth)**.
- ✅ Mọi thay đổi game state phải đi qua backend.
- ❌ **Không bao giờ tin tưởng dữ liệu từ client** mà không validate.

### D.2 Validation

```typescript
// Mọi incoming message phải validate trước khi xử lý
function handleMessage(playerId: PlayerId, raw: unknown): void {
  const result = MessageValidator.parse(raw);
  if (!result.success) {
    logger.warn('Invalid message received', { playerId, error: result.error });
    return; // Reject silently or send error back
  }
  dispatch(playerId, result.data);
}
```

### D.3 WebSocket Management

- ✅ Quản lý connection và disconnect event đầy đủ.
- ✅ Implement heartbeat/ping-pong để phát hiện dead connections.
- ✅ Cleanup player data khi disconnect.
- ❌ Không để một client lỗi ảnh hưởng toàn bộ room — wrap handlers trong try-catch.

### D.4 State Synchronization

- ✅ Đảm bảo tính nhất quán của game state.
- ❌ Không tạo hoặc nhân đôi object ngoài ý muốn.
- ✅ Dùng optimistic locking hoặc sequential processing để tránh race condition.

### D.5 Error Handling

```typescript
// Centralized error handling per room
wss.on('message', (ws, raw) => {
  try {
    handleClientMessage(ws, raw);
  } catch (error) {
    logger.error('Unhandled error in message handler', { error });
    // Không re-throw — không để crash server
  }
});
```

---

## E. Multiplayer Standards

### E.1 Room Management

- ✅ Mỗi room có ID duy nhất (UUID).
- ✅ Đồng bộ state theo room scope — không broadcast global.
- ✅ Room phải có host/owner với quyền quản lý.

### E.2 Object Identity

- ✅ **Mỗi object có ID duy nhất** (UUID) được sinh từ backend.
- ❌ Không để một lá bài tồn tại ở nhiều vị trí cùng lúc.
- ✅ Frontend dùng ID để map với 3D mesh tương ứng.

### E.3 Conflict Resolution

- ✅ Khi nhiều người tương tác cùng object: **backend quyết định, client nhận kết quả**.
- ✅ Implement lock mechanism khi player "grab" object.
- ✅ Tự động release lock khi player disconnect.

### E.4 Data Visibility

```typescript
// Phân biệt rõ public vs private data
interface PublicObjectState {
  id: string;
  position: Vector3;
  rotation: number;
  faceUp: boolean;       // Chỉ public khi faceUp = true
}

interface PrivateObjectState extends PublicObjectState {
  cardType: CardType;    // Chỉ gửi đến owner khi faceDown
}
```

### E.5 Reconnect

- ✅ Implement reconnect mechanism với session token.
- ✅ Restore player state sau khi reconnect.
- ✅ Timeout và cleanup sau khi player disconnect quá lâu.

### E.6 Access Control

- ✅ Kiểm tra room password nếu có.
- ✅ Kiểm tra room capacity trước khi cho join.
- ✅ Validate player identity trên mọi request.

---

## F. Game Design Rules — Digital Tabletop Sandbox

> 🎯 **Cat Boom Online là Digital Tabletop Sandbox, lấy cảm hứng từ Tabletop Simulator.**
> Người chơi tự quyết định luật chơi. Game chỉ cung cấp vật thể và công cụ tương tác.

### F.1 Những thứ KHÔNG được xây dựng

| Feature | Lý do |
|---------|-------|
| ❌ Turn Manager | Sandbox — không có lượt |
| ❌ End Turn | Sandbox — không có lượt |
| ❌ Current Player Tracking | Người chơi tự quản lý |
| ❌ Rule Enforcement | Người chơi tự định luật |
| ❌ Automatic Winner Detection | Không có win condition cứng |
| ❌ Automatic Nope | Người chơi tự chơi Nope |
| ❌ Automatic Defuse | Người chơi tự chơi Defuse |
| ❌ Gameplay Restrictions theo luật Mèo Nổ | Sandbox không giới hạn |

### F.2 Những thứ CẦN xây dựng

- ✅ **Card objects** có thể pick up, move, flip, stack.
- ✅ **Deck** có thể shuffle, draw from, insert into.
- ✅ **Hand zone** private cho mỗi player.
- ✅ **Table surface** là shared 3D space.
- ✅ **Object interaction**: grab, release, rotate, flip.
- ✅ **Visual feedback**: hover, selection, drag.

### F.3 Triết lý thiết kế

> "Provide tools, not rules."
> Backend enforce vật lý và ownership, không enforce game logic.

---

## G. Error Handling & Logging

### G.1 Error Messages

```typescript
// ❌ SAI — Không có context
throw new Error('Error occurred');

// ✅ ĐÚNG — Có context đầy đủ
throw new Error(`RoomManager: Cannot join room ${roomId} — room is full (${currentCount}/${maxPlayers})`);
```

- ❌ Không nuốt lỗi.
- ✅ Error message phải có ý nghĩa, đủ context để debug.
- ✅ Include relevant IDs (playerId, roomId, objectId) trong error context.

### G.2 Log Levels

```typescript
// Phân biệt rõ log levels
logger.debug('Texture loaded', { path, sizeKB });         // Dev only
logger.info('Player joined room', { playerId, roomId });  // Normal events
logger.warn('Object lock conflict', { objectId });        // Recoverable issues
logger.error('WebSocket error', { error, playerId });     // Errors needing attention
```

- ✅ Log phải có **context** (WHO, WHAT, WHERE).
- ❌ Không log dữ liệu riêng tư (passwords, tokens, private card info).
- ✅ Backend logs phải có timestamp và request context.
- ✅ Dùng structured logging (object) thay string concatenation.

---

## H. Testing Standards

### H.1 Phạm vi test

- ✅ Test các chức năng quan trọng (core sandbox mechanics).
- ✅ Test các trường hợp lỗi và edge cases.
- ✅ Test thao tác đồng thời (concurrent object interactions).
- ✅ Test đồng bộ nhiều người chơi (multi-client scenarios).

### H.2 Quy tắc

- ❌ Không bỏ qua test đang thất bại — phải fix hoặc xóa với lý do rõ ràng.
- ✅ **Build phải thành công trước khi hoàn thành một Milestone**.
- ✅ Mỗi module mới phải có unit test tương ứng.

### H.3 Test Structure

```
frontend/src/__tests__/
backend/src/__tests__/
shared/__tests__/
```

---

## I. Git & Project Management

### I.1 Git Rules

- ❌ Không commit `dist/`, `node_modules/`, `*.env` vào Git.
- ❌ Không đưa secrets, API keys, passwords vào Git.
- ❌ Không tự ý xóa source code cũ — archive trong `_backup_*` folder.
- ❌ Không thay đổi cấu hình không liên quan đến nhiệm vụ.

### I.2 .gitignore bắt buộc

```
node_modules/
dist/
.env
.env.local
*.log
_backup_*/
```

### I.3 Milestone Management

- ✅ Mỗi Milestone phải có báo cáo đầy đủ trong `docs/DEVELOPMENT_LOG.md`.
- ✅ Các thay đổi kiến trúc lớn phải được ghi lại trong `docs/ARCHITECTURE.md`.
- ✅ Không chuyển sang Milestone tiếp theo khi Milestone hiện tại chưa hoàn thành.

### I.4 Commit Convention

```
feat(scope): Add SceneManager for Three.js lifecycle
fix(network): Handle WebSocket reconnect timeout
refactor(backend): Split RoomManager into Room + RoomStore
docs(arch): Update ARCHITECTURE.md with M1 changes
```

---

## J. Performance Standards

### J.1 Three.js Optimization

- ✅ Sử dụng lại Geometry, Material, Texture khi phù hợp (share references).
- ✅ Dùng `BufferGeometry` thay `Geometry`.
- ✅ Group static objects để giảm draw calls.
- ❌ Không tạo object mới trong render loop (allocations = GC pressure).
- ✅ Dùng `InstancedMesh` cho nhiều object giống nhau (cards trong deck).

### J.2 Memory Management

- ✅ Dispose Three.js resources khi không còn dùng.
- ✅ Implement object pooling cho cards.
- ✅ Monitor memory usage trong development.

### J.3 Network Optimization

- ❌ Không gửi toàn bộ GameState khi chỉ cần đồng bộ một thay đổi nhỏ.
- ✅ Dùng **delta updates**: chỉ gửi những gì thay đổi.
- ✅ Batch updates khi có nhiều thay đổi xảy ra cùng lúc.
- ❌ Không gây render thừa từ redundant state updates.

### J.4 Render Performance

- ✅ Target: 60 FPS ở điều kiện thông thường.
- ✅ Dùng LOD (Level of Detail) cho objects xa camera.
- ✅ Cull objects ngoài frustum (Three.js làm tự động — không disable).
- ✅ Dùng `requestAnimationFrame` — không dùng `setInterval` cho render loop.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-11-01 | Initial PROJECT_RULES.md — M0 Rebuild |

---

*Tài liệu này là nguồn quy chuẩn bắt buộc. Mọi ngoại lệ phải được ghi lại và có lý do rõ ràng.*

