# 泡泡堂多人在线小游戏 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个 2~4 人在线对战的泡泡堂网页游戏：权威服务器 + Colyseus 状态同步 + Canvas 2D 渲染，本机/局域网可玩。

**Architecture:** npm workspaces 三包 monorepo。`shared` 包含全部游戏规则（无头引擎 GameSim，纯 TS、无 IO），单机模式由客户端本地运行，联机模式原封不动由服务器运行。服务器是权威：只收输入（方向、放泡泡），算出全部状态，Colyseus Schema 以 15Hz 增量同步；客户端 60fps 渲染 + 指数平滑插值。

**Tech Stack:** Node.js 20+ / TypeScript 5（strict）/ Colyseus 0.15 / Vite 5 / vitest / 原生 Canvas 2D

**Spec:** `docs/specs/2026-08-30-paopaotang-design.md`（数值与规则以 spec 为准，本计划与其冲突时以 spec 为准并停下来确认）

## Global Constraints

- Node.js >= 20，npm >= 10；所有包 `"type": "module"`，TS `strict: true`
- tsconfig：`experimentalDecorators: true`、`useDefineForClassFields: false`（Colyseus Schema 装饰器依赖）、`moduleResolution: "Bundler"`、import 不带扩展名
- `shared` 包通过 `"exports": { ".": "./src/index.ts" }` 直接暴露 TS 源码（内部包模式），由 tsx / vite / vitest 现场转译，不预编译
- 关键数值（来自 spec，禁止改动）：地图 13×11；泡泡引信 2500ms；火焰持续 500ms；出生无敌 2000ms；软墙掉道具概率 30%；3 分钟后突然死亡、每 5 秒合拢一圈；速度档 1≈4 格/秒、上限 6 档；泡泡/火焰上限 8
- Colyseus 版本统一 `^0.15`（服务端 `colyseus`、客户端 `colyseus.js`）
- 注释与日志用中文；每个任务完成后 `git commit`
- 坐标约定：`x, y` 为格坐标浮点（站在格 (gx,gy) 中心时 x===gx）；格 (gx,gy) 的像素范围为 `[gx*TILE, (gx+1)*TILE)`，绘制中心像素 = `(x+0.5)*TILE`
- 玩家之间不做碰撞判定（MVP 简化，spec 允许）
- 移动不做"剩余时间跨格累积"（每格移动在到达帧截断，60fps 下误差 ≤16ms，忽略）

## 文件结构（最终形态）

```
paopaotang/
├─ package.json                  # workspaces 根 + dev/test 脚本
├─ tsconfig.base.json
├─ packages/
│  ├─ shared/                    # @pt/shared —— 纯规则，前后端共用
│  │  └─ src/
│  │     ├─ index.ts             # 汇总导出
│  │     ├─ constants.ts         # 全部常量/枚举
│  │     ├─ types.ts             # Dir、GameEvent 等类型
│  │     ├─ mapgen.ts            # 随机地图生成（mulberry32 + 布局规则）
│  │     ├─ explosion.ts         # computeFlame 爆炸范围纯函数
│  │     ├─ gridsim.ts           # GameSim 无头规则引擎
│  │     └─ *.test.ts            # 与实现同目录
│  ├─ server/                    # @pt/server —— Colyseus 服务器
│  │  └─ src/
│  │     ├─ index.ts             # 启动入口
│  │     ├─ rooms/GameRoom.ts    # 对战房间：等待/开局/tick/重连
│  │     ├─ rooms/code.ts        # 房间号/种子工具
│  │     ├─ state/GameRoomState.ts # Schema 类定义
│  │     └─ state/sync.ts        # GameSim → Schema 同步（纯函数，可单测）
│  └─ client/                    # @pt/client —— Vite + Canvas
│     ├─ index.html / style.css
│     └─ src/
│        ├─ main.ts              # 屏幕路由：大厅 / 游戏
│        ├─ net.ts               # Colyseus 客户端封装
│        ├─ lobby.ts             # 大厅 UI
│        ├─ input.ts             # 键盘 → 方向/放泡
│        ├─ sfx.ts               # WebAudio 合成音效
│        ├─ schema-types.ts      # 服务器状态的客户端只读类型
│        └─ render/              # frame.ts（帧数据+在线构建）、renderer.ts（绘制）
```

---

### Task 1: Monorepo 脚手架与工具链

**Files:**
- Create: `package.json`、`tsconfig.base.json`
- Create: `packages/shared/{package.json,tsconfig.json,src/index.ts,src/constants.ts,src/smoke.test.ts}`
- Create: `packages/server/{package.json,tsconfig.json,src/index.ts}`
- Create: `packages/client/{package.json,tsconfig.json,index.html,src/main.ts}`

**Interfaces:**
- Produces: 包名 `@pt/shared` / `@pt/server` / `@pt/client`；根脚本 `npm run dev`（同时起服务器和客户端）、`npm run test`（跑 shared+server 的 vitest）

- [ ] **Step 1: 根 package.json 与 tsconfig.base.json**

```json
// package.json
{
  "name": "paopaotang",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "concurrently -n server,client -c blue,green \"npm:dev -w packages/server\" \"npm:dev -w packages/client\"",
    "test": "npm run test -w packages/shared && npm run test -w packages/server"
  },
  "devDependencies": { "concurrently": "^9.0.0" }
}
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "noUncheckedIndexedAccess": false
  }
}
```

- [ ] **Step 2: 三个包的 package.json（tsconfig.json 均为 `{ "extends": "../../tsconfig.base.json", "include": ["src"] }`）**

```json
// packages/shared/package.json
{
  "name": "@pt/shared",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run" },
  "devDependencies": { "typescript": "^5.6.0", "vitest": "^2.1.0" }
}
```

```json
// packages/server/package.json
{
  "name": "@pt/server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "dev": "tsx watch src/index.ts", "test": "vitest run" },
  "dependencies": { "@pt/shared": "*", "colyseus": "^0.15.0", "@colyseus/schema": "^0.15.0" },
  "devDependencies": { "@types/node": "^20.0.0", "tsx": "^4.19.0", "typescript": "^5.6.0", "vitest": "^2.1.0" }
}
```

```json
// packages/client/package.json
{
  "name": "@pt/client",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": { "dev": "vite" },
  "dependencies": { "@pt/shared": "*", "colyseus.js": "^0.15.0" },
  "devDependencies": { "typescript": "^5.6.0", "vite": "^5.4.0" }
}
```

- [ ] **Step 3: 最小占位文件（验证跨包引用与测试链路）**

```ts
// packages/shared/src/constants.ts
export const GRID_W = 13;
export const GRID_H = 11;
```

```ts
// packages/shared/src/index.ts
export * from "./constants";
```

```ts
// packages/shared/src/smoke.test.ts
import { describe, it, expect } from "vitest";
import { GRID_W, GRID_H } from "./constants";

describe("冒烟", () => {
  it("常量存在", () => {
    expect(GRID_W).toBe(13);
    expect(GRID_H).toBe(11);
  });
});
```

```ts
// packages/server/src/index.ts
console.log("server placeholder");
```

```html
<!-- packages/client/index.html -->
<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8" /><title>泡泡堂</title></head>
<body><div id="app">client placeholder</div>
<script type="module" src="/src/main.ts"></script></body>
</html>
```

```ts
// packages/client/src/main.ts
console.log("client placeholder");
```

- [ ] **Step 4: 安装依赖并验证**

Run: `npm install`
Run: `npm run test`
Expected: shared 冒烟测试 1 个通过。
Run: `npx tsc -p packages/shared --noEmit && npx tsc -p packages/server --noEmit && npx tsc -p packages/client --noEmit`
Expected: 三个包类型检查零错误。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: monorepo 脚手架（workspaces + ts + vitest）"
```

---

### Task 2: shared 常量与类型

**Files:**
- Modify: `packages/shared/src/constants.ts`（替换占位）、`packages/shared/src/index.ts`
- Create: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/smoke.test.ts`

**Interfaces:**
- Produces（后续所有任务依赖）: `GRID_W=13, GRID_H=11, TILE=32, BOMB_FUSE_MS=2500, FLAME_MS=500, SPAWN_INVINCIBLE_MS=2000, SOFT_WALL_RATIO=0.7, ITEM_DROP_RATE=0.3, SUDDEN_DEATH_AT_MS=180000, SUDDEN_DEATH_STEP_MS=5000, SPEED_LEVELS=[4,4.6,5.2,5.8,6.4,7], MAX_BOMBS=8, MAX_FLAMES=8, MAX_SPEED_LEVEL=6, SPAWNS(四角)`；枚举 `Tile{Floor=0,HardWall=1,SoftWall=2}, ItemType{Bomb=0,Flame=1,Speed=2}`；类型 `Dir, DirInput, Vec, Phase, GameEvent` 与辅助 `dirDx/dirDy`

- [ ] **Step 1: 写全部常量（覆盖占位）**

```ts
// packages/shared/src/constants.ts

/** 地图尺寸（格） */
export const GRID_W = 13;
export const GRID_H = 11;
export const CELL_COUNT = GRID_W * GRID_H;

/** 客户端每格像素 */
export const TILE = 32;

/** 泡泡引信 */
export const BOMB_FUSE_MS = 2500;
/** 火焰持续时间 */
export const FLAME_MS = 500;
/** 出生无敌时间 */
export const SPAWN_INVINCIBLE_MS = 2000;

/** 软墙密度与掉落概率 */
export const SOFT_WALL_RATIO = 0.7;
export const ITEM_DROP_RATE = 0.3;

/** 突然死亡：开局 3 分钟后开始，每 5 秒硬墙向内合拢一圈 */
export const SUDDEN_DEATH_AT_MS = 180_000;
export const SUDDEN_DEATH_STEP_MS = 5_000;

/** 移动速度（格/秒），下标 = 速度档-1 */
export const SPEED_LEVELS = [4, 4.6, 5.2, 5.8, 6.4, 7] as const;

export const MAX_BOMBS = 8;
export const MAX_FLAMES = 8;
export const MAX_SPEED_LEVEL = 6;

export enum Tile {
  Floor = 0,
  HardWall = 1,
  SoftWall = 2,
}

export enum ItemType {
  Bomb = 0,
  Flame = 1,
  Speed = 2,
}

/** 出生点（固定四角），颜色顺序：红 蓝 黄 绿 */
export const SPAWNS = [
  { gx: 1, gy: 1 },
  { gx: GRID_W - 2, gy: 1 },
  { gx: 1, gy: GRID_H - 2 },
  { gx: GRID_W - 2, gy: GRID_H - 2 },
] as const;
```

- [ ] **Step 2: 类型定义**

```ts
// packages/shared/src/types.ts

export type Dir = "up" | "down" | "left" | "right";
/** 玩家当前按住的方向；none = 全部松开 */
export type DirInput = Dir | "none";

export type Phase = "waiting" | "playing" | "ended";

export interface Vec {
  gx: number;
  gy: number;
}

export type GameEvent =
  | { type: "bombPlaced"; gx: number; gy: number; ownerId: string }
  | { type: "exploded"; cells: Vec[] }
  | { type: "wallBroken"; gx: number; gy: number; item: ItemType | null }
  | { type: "itemPicked"; playerId: string; itemType: ItemType }
  | { type: "died"; playerId: string; gx: number; gy: number }
  | { type: "ended"; winnerIds: string[] };

export function dirDx(d: Dir | null): number {
  return d === "left" ? -1 : d === "right" ? 1 : 0;
}
export function dirDy(d: Dir | null): number {
  return d === "up" ? -1 : d === "down" ? 1 : 0;
}
```

- [ ] **Step 3: 更新 index.ts 与冒烟测试**

```ts
// packages/shared/src/index.ts
export * from "./constants";
export * from "./types";
```

```ts
// packages/shared/src/smoke.test.ts
import { describe, it, expect } from "vitest";
import { GRID_W, GRID_H, TILE, BOMB_FUSE_MS, SPEED_LEVELS, Tile, ItemType, SPAWNS } from "./index";

describe("常量", () => {
  it("关键数值与设计文档一致", () => {
    expect(GRID_W).toBe(13);
    expect(GRID_H).toBe(11);
    expect(TILE).toBe(32);
    expect(BOMB_FUSE_MS).toBe(2500);
    expect(SPEED_LEVELS[0]).toBe(4);
    expect(Tile.HardWall).toBe(1);
    expect(ItemType.Flame).toBe(1);
    expect(SPAWNS).toHaveLength(4);
  });
});
```

- [ ] **Step 4: 验证**

Run: `npm run test -w packages/shared`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): 常量与类型定义"
```

---

### Task 3: 地图生成 mapgen（TDD）

**Files:**
- Create: `packages/shared/src/mapgen.ts`、`packages/shared/src/mapgen.test.ts`
- Modify: `packages/shared/src/index.ts`（追加 `export * from "./mapgen";`）

**Interfaces:**
- Produces: `generateMap(seed: number): GameMap`，`GameMap = { grid: Uint8Array; spawns: Vec[] }`；`mulberry32(seed: number): () => number`。grid 索引 = `gy * GRID_W + gx`

- [ ] **Step 1: 写失败测试**

```ts
// packages/shared/src/mapgen.test.ts
import { describe, it, expect } from "vitest";
import { GRID_W, GRID_H, Tile, SPAWNS } from "./constants";
import { generateMap } from "./mapgen";

const idx = (gx: number, gy: number) => gy * GRID_W + gx;

describe("generateMap", () => {
  it("同种子结果完全一致", () => {
    const a = generateMap(42);
    const b = generateMap(42);
    expect([...a.grid]).toEqual([...b.grid]);
  });

  it("外圈全硬墙，棋盘格硬墙位置正确", () => {
    const { grid } = generateMap(1);
    for (let gx = 0; gx < GRID_W; gx++) {
      expect(grid[idx(gx, 0)]).toBe(Tile.HardWall);
      expect(grid[idx(gx, GRID_H - 1)]).toBe(Tile.HardWall);
    }
    for (let gy = 0; gy < GRID_H; gy++) {
      expect(grid[idx(0, gy)]).toBe(Tile.HardWall);
      expect(grid[idx(GRID_W - 1, gy)]).toBe(Tile.HardWall);
    }
    expect(grid[idx(2, 2)]).toBe(Tile.HardWall);
    expect(grid[idx(6, 8)]).toBe(Tile.HardWall);
    expect(grid[idx(1, 1)]).not.toBe(Tile.HardWall);
  });

  it("出生点可站立、3×3 安全区无软墙、强制通路为地板", () => {
    const { grid, spawns } = generateMap(7);
    expect(spawns).toEqual(SPAWNS.map(s => ({ ...s })));
    for (const s of SPAWNS) {
      expect(grid[idx(s.gx, s.gy)]).toBe(Tile.Floor);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          expect(grid[idx(s.gx + dx, s.gy + dy)]).not.toBe(Tile.SoftWall);
        }
    }
    // 每个出生点朝地图中心方向让出的两格通路必须是地板
    const forced = [[3, 1], [1, 3], [9, 1], [11, 3], [1, 7], [3, 9], [9, 9], [11, 7]];
    for (const [gx, gy] of forced) expect(grid[idx(gx, gy)]).toBe(Tile.Floor);
  });

  it("软墙密度在合理区间", () => {
    const { grid } = generateMap(123);
    let soft = 0, total = 0;
    for (let gy = 1; gy < GRID_H - 1; gy++)
      for (let gx = 1; gx < GRID_W - 1; gx++) {
        const t = grid[idx(gx, gy)];
        if (t === Tile.HardWall) continue;
        total++;
        if (t === Tile.SoftWall) soft++;
      }
    expect(soft / total).toBeGreaterThan(0.4);
    expect(soft / total).toBeLessThan(0.95);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run test -w packages/shared -- mapgen`
Expected: FAIL（generateMap 不存在）。

- [ ] **Step 3: 实现**

```ts
// packages/shared/src/mapgen.ts
import { GRID_W, GRID_H, Tile, SOFT_WALL_RATIO, SPAWNS } from "./constants";
import { Vec } from "./types";

export interface GameMap {
  grid: Uint8Array;
  spawns: Vec[];
}

/** 确定性随机数生成器 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 生成 13×11 地图：外圈硬墙 + 棋盘格硬墙 + 约 70% 软墙。
 * 四角出生点 3×3 安全区无软墙，且朝地图中心方向各让出一格通路，
 * 保证不放泡泡也能走出安全区。
 */
export function generateMap(seed: number): GameMap {
  const rng = mulberry32(seed);
  const grid = new Uint8Array(GRID_W * GRID_H).fill(Tile.Floor);
  const idx = (gx: number, gy: number) => gy * GRID_W + gx;

  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const border = gx === 0 || gx === GRID_W - 1 || gy === 0 || gy === GRID_H - 1;
      const pillar = !border && gx % 2 === 0 && gy % 2 === 0;
      if (border || pillar) grid[idx(gx, gy)] = Tile.HardWall;
    }
  }

  const inSafeZone = (gx: number, gy: number) =>
    SPAWNS.some(s => Math.abs(gx - s.gx) <= 1 && Math.abs(gy - s.gy) <= 1);

  const cx = (GRID_W - 1) / 2;
  const cy = (GRID_H - 1) / 2;
  const forcedOpen = new Set<number>();
  for (const s of SPAWNS) {
    forcedOpen.add(idx(s.gx + Math.sign(cx - s.gx) * 2, s.gy));
    forcedOpen.add(idx(s.gx, s.gy + Math.sign(cy - s.gy) * 2));
  }

  for (let gy = 1; gy < GRID_H - 1; gy++) {
    for (let gx = 1; gx < GRID_W - 1; gx++) {
      const i = idx(gx, gy);
      if (grid[i] !== Tile.Floor) continue;
      if (inSafeZone(gx, gy) || forcedOpen.has(i)) continue;
      if (rng() < SOFT_WALL_RATIO) grid[i] = Tile.SoftWall;
    }
  }

  return { grid, spawns: SPAWNS.map(s => ({ ...s })) };
}
```

- [ ] **Step 4: 运行测试通过**

Run: `npm run test -w packages/shared -- mapgen`
Expected: 4 个测试全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): 随机地图生成"
```

---

### Task 4: 爆炸范围计算 computeFlame（TDD）

**Files:**
- Create: `packages/shared/src/explosion.ts`、`packages/shared/src/explosion.test.ts`
- Modify: `packages/shared/src/index.ts`（追加 `export * from "./explosion";`）

**Interfaces:**
- Produces: `computeFlame(grid: Uint8Array, gx: number, gy: number, power: number): Vec[]` —— 返回火焰覆盖格（含中心）；硬墙挡住且自身不在火焰内；软墙包含在火焰内并截断该方向

- [ ] **Step 1: 写失败测试**

```ts
// packages/shared/src/explosion.test.ts
import { describe, it, expect } from "vitest";
import { GRID_W, GRID_H, Tile } from "./constants";
import { computeFlame } from "./explosion";

/** 造一张全地板空图 */
function emptyGrid(): Uint8Array {
  return new Uint8Array(GRID_W * GRID_H).fill(Tile.Floor);
}
const idx = (gx: number, gy: number) => gy * GRID_W + gx;
const key = (c: { gx: number; gy: number }) => `${c.gx},${c.gy}`;

describe("computeFlame", () => {
  it("空地十字展开到 power", () => {
    const cells = computeFlame(emptyGrid(), 6, 5, 2).map(key);
    expect(cells).toContain("6,5");
    expect(cells).toContain("6,3");
    expect(cells).toContain("6,7");
    expect(cells).toContain("4,5");
    expect(cells).toContain("8,5");
    expect(cells).not.toContain("6,2");
  });

  it("硬墙挡住火焰", () => {
    const g = emptyGrid();
    g[idx(6, 4)] = Tile.HardWall;
    const cells = computeFlame(g, 6, 5, 2).map(key);
    expect(cells).not.toContain("6,4");
    expect(cells).not.toContain("6,3");
    expect(cells).toContain("6,6");
  });

  it("软墙被火焰覆盖且截断", () => {
    const g = emptyGrid();
    g[idx(7, 5)] = Tile.SoftWall;
    const cells = computeFlame(g, 6, 5, 2).map(key);
    expect(cells).toContain("7,5");
    expect(cells).not.toContain("8,5");
  });

  it("贴近边界时被截断", () => {
    const cells = computeFlame(emptyGrid(), 1, 1, 3).map(key);
    expect(cells).toContain("4,1");
    expect(cells).toContain("1,4");
    expect(cells).not.toContain("0,1");
    expect(cells).not.toContain("1,0");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run test -w packages/shared -- explosion`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
// packages/shared/src/explosion.ts
import { GRID_W, GRID_H, Tile } from "./constants";
import { Vec } from "./types";

const DIRS: Vec[] = [
  { gx: 0, gy: -1 },
  { gx: 0, gy: 1 },
  { gx: -1, gy: 0 },
  { gx: 1, gy: 0 },
];

/** 十字火焰覆盖范围：硬墙截断（不含），软墙含入并截断该方向 */
export function computeFlame(grid: Uint8Array, gx: number, gy: number, power: number): Vec[] {
  const cells: Vec[] = [{ gx, gy }];
  for (const d of DIRS) {
    for (let r = 1; r <= power; r++) {
      const x = gx + d.gx * r;
      const y = gy + d.gy * r;
      if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) break;
      const t = grid[y * GRID_W + x];
      if (t === Tile.HardWall) break;
      cells.push({ gx: x, gy: y });
      if (t === Tile.SoftWall) break;
    }
  }
  return cells;
}
```

- [ ] **Step 4: 运行测试通过**

Run: `npm run test -w packages/shared -- explosion`
Expected: 4 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): 爆炸范围计算"
```

---

### Task 5: GameSim 构造与移动（TDD）

**Files:**
- Create: `packages/shared/src/gridsim.ts`、`packages/shared/src/gridsim.test.ts`
- Modify: `packages/shared/src/index.ts`（追加 `export * from "./gridsim";`）

**Interfaces:**
- Produces: `GameSim` 类 —— 本任务实现：`constructor(seed: number, playerIds: string[], rngOverride?: () => number)`、`setInput(playerId: string, dir: DirInput)`、`step(dtMs: number)`、`drainEvents(): GameEvent[]`、公开字段 `grid/players(Map<string,SimPlayer>)/bombs/explosions/items/phase/elapsedMs/winnerIds`。`SimPlayer` 含 `id, spawnIndex, x, y, fromX, fromY, progress, dir: Dir|null, input, bombsMax, bombsActive, flameLen, speedLevel, alive, invincibleUntil`。后续任务填充 placeBomb/tryPickup/stepBombs/stepSuddenDeath/checkEnd 空桩。

- [ ] **Step 1: 写失败测试**

```ts
// packages/shared/src/gridsim.test.ts
import { describe, it, expect } from "vitest";
import { GRID_W, SPAWN_INVINCIBLE_MS, Tile } from "./constants";
import { GameSim } from "./gridsim";

const idx = (gx: number, gy: number) => gy * GRID_W + gx;

/** 造一个双人对局，并把出生点附近的格子清成地板便于走位 */
function makeSim(playerIds = ["a", "b"]): GameSim {
  const sim = new GameSim(42, playerIds);
  sim.grid[idx(2, 1)] = Tile.Floor;
  sim.grid[idx(1, 2)] = Tile.Floor;
  sim.grid[idx(11, 2)] = Tile.Floor;
  return sim;
}

describe("GameSim 移动", () => {
  it("出生位置与初始属性正确", () => {
    const sim = makeSim();
    const a = sim.players.get("a")!;
    expect(a.x).toBe(1);
    expect(a.y).toBe(1);
    expect(a.bombsMax).toBe(1);
    expect(a.flameLen).toBe(1);
    expect(a.speedLevel).toBe(1);
    expect(a.alive).toBe(true);
    expect(a.invincibleUntil).toBe(SPAWN_INVINCIBLE_MS);
  });

  it("速度档1（4格/秒）走一格用 250ms，按住方向继续走", () => {
    const sim = makeSim();
    sim.setInput("a", "right");
    sim.step(250);
    expect(sim.players.get("a")!.x).toBeCloseTo(2, 5);
    expect(sim.players.get("a")!.dir).toBe("right");
  });

  it("松开方向后走完当前格停住", () => {
    const sim = makeSim();
    sim.setInput("a", "right");
    sim.step(125); // 走到半路 x≈1.5
    sim.setInput("a", "none");
    sim.step(500); // 走完当前格
    const a = sim.players.get("a")!;
    expect(a.x).toBeCloseTo(2, 5);
    sim.step(1000);
    expect(a.x).toBeCloseTo(2, 5);
    expect(a.dir).toBeNull();
  });

  it("墙不可穿越", () => {
    const sim = makeSim();
    sim.grid[idx(2, 1)] = Tile.HardWall;
    sim.setInput("a", "right");
    sim.step(1000);
    expect(sim.players.get("a")!.x).toBeCloseTo(1, 5);
  });

  it("速度档6（7格/秒）100ms 走 0.7 格", () => {
    const sim = makeSim();
    sim.players.get("a")!.speedLevel = 6;
    sim.setInput("a", "right");
    sim.step(100);
    expect(sim.players.get("a")!.x).toBeCloseTo(1.7, 5);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run test -w packages/shared -- gridsim`
Expected: FAIL（GameSim 不存在）。

- [ ] **Step 3: 实现 GameSim（本任务只含构造/输入/移动/事件队列 + 空桩）**

```ts
// packages/shared/src/gridsim.ts
import {
  GRID_W, GRID_H, BOMB_FUSE_MS, FLAME_MS, SPAWN_INVINCIBLE_MS, ITEM_DROP_RATE,
  SUDDEN_DEATH_AT_MS, SUDDEN_DEATH_STEP_MS, SPEED_LEVELS, MAX_BOMBS, MAX_FLAMES, MAX_SPEED_LEVEL,
  Tile, ItemType,
} from "./constants";
import { DirInput, GameEvent, Vec, dirDx, dirDy } from "./types";
import { generateMap, mulberry32 } from "./mapgen";
import { computeFlame } from "./explosion";

export interface SimPlayer {
  id: string;
  spawnIndex: number;
  /** 格坐标浮点；静止时为整数（格中心） */
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  /** 0~1，dir 非空时表示本次格间移动进度 */
  progress: number;
  dir: import("./types").Dir | null;
  input: DirInput;
  bombsMax: number;
  bombsActive: number;
  flameLen: number;
  speedLevel: number;
  alive: boolean;
  invincibleUntil: number;
}

export interface SimBomb {
  id: number;
  gx: number;
  gy: number;
  ownerId: string;
  power: number;
  explodeAt: number;
}

export interface SimExplosion {
  id: number;
  cells: Vec[];
  expireAt: number;
}

export interface SimItem {
  id: number;
  gx: number;
  gy: number;
  type: ItemType;
}

export class GameSim {
  grid: Uint8Array;
  players = new Map<string, SimPlayer>();
  bombs: SimBomb[] = [];
  explosions: SimExplosion[] = [];
  /** key = 格索引 */
  items = new Map<number, SimItem>();
  phase: "playing" | "ended" = "playing";
  winnerIds: string[] = [];
  elapsedMs = 0;

  protected events: GameEvent[] = [];
  protected rng: () => number;
  protected nextId = 1;
  protected suddenDeathRing = 1;
  protected nextSuddenDeathAt = SUDDEN_DEATH_AT_MS;

  constructor(seed: number, playerIds: string[], rngOverride?: () => number) {
    const map = generateMap(seed);
    this.grid = map.grid;
    this.rng = rngOverride ?? mulberry32((seed ^ 0x9e3779b9) >>> 0);
    playerIds.forEach((id, i) => {
      const s = map.spawns[i % 4];
      this.players.set(id, {
        id, spawnIndex: i % 4, x: s.gx, y: s.gy,
        fromX: s.gx, fromY: s.gy, progress: 0, dir: null, input: "none",
        bombsMax: 1, bombsActive: 0, flameLen: 1, speedLevel: 1,
        alive: true, invincibleUntil: SPAWN_INVINCIBLE_MS,
      });
    });
  }

  setInput(playerId: string, dir: DirInput): void {
    const p = this.players.get(playerId);
    if (p) p.input = dir;
  }

  /** 放泡泡（Task 6 实现） */
  placeBomb(playerId: string): void {
    void playerId;
  }

  step(dtMs: number): void {
    if (this.phase !== "playing") return;
    this.elapsedMs += dtMs;
    for (const p of this.players.values()) this.stepPlayer(p, dtMs);
    this.stepBombs();
    this.stepExplosions();
    this.stepSuddenDeath();
    this.checkEnd();
  }

  /** 取走本轮一次性事件（音效/特效/结算用） */
  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  protected bombAt(gx: number, gy: number): SimBomb | undefined {
    return this.bombs.find(b => b.gx === gx && b.gy === gy);
  }

  private stepPlayer(p: SimPlayer, dtMs: number): void {
    if (!p.alive) return;
    if (p.dir !== null) {
      const speed = SPEED_LEVELS[p.speedLevel - 1];
      p.progress += (speed * dtMs) / 1000;
      if (p.progress >= 1) {
        p.x = p.fromX + dirDx(p.dir);
        p.y = p.fromY + dirDy(p.dir);
        p.progress = 0;
        p.dir = null;
        this.tryPickup(p);
        this.tryContinue(p);
      } else {
        p.x = p.fromX + dirDx(p.dir) * p.progress;
        p.y = p.fromY + dirDy(p.dir) * p.progress;
      }
    } else {
      this.tryContinue(p);
    }
  }

  private tryContinue(p: SimPlayer): void {
    const d = p.input;
    if (d === "none") return;
    const fx = Math.round(p.x);
    const fy = Math.round(p.y);
    const tx = fx + dirDx(d);
    const ty = fy + dirDy(d);
    if (!this.passable(tx, ty)) return;
    p.fromX = fx;
    p.fromY = fy;
    p.dir = d;
    p.progress = 0;
  }

  private passable(gx: number, gy: number): boolean {
    if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) return false;
    if (this.grid[gy * GRID_W + gx] !== Tile.Floor) return false;
    return !this.bombAt(gx, gy);
  }

  protected tryPickup(p: SimPlayer): void {
    void p;
  }
  protected stepBombs(): void {}
  protected stepExplosions(): void {
    this.explosions = this.explosions.filter(e => e.expireAt > this.elapsedMs);
  }
  protected stepSuddenDeath(): void {}
  protected checkEnd(): void {}
}
```

注意：`placeBomb / tryPickup / stepBombs / stepSuddenDeath / checkEnd` 本任务为空桩是有意的——Task 6/8/9 逐个填充，测试始终只覆盖已实现行为。

- [ ] **Step 4: 运行测试通过**

Run: `npm run test -w packages/shared`
Expected: 全部 PASS（无回归）。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): GameSim 构造与格间移动"
```

---

### Task 6: GameSim 泡泡、爆炸与连锁（TDD）—— M1 逻辑完备

**Files:**
- Modify: `packages/shared/src/gridsim.ts`（填充 placeBomb/stepBombs，新增 explodeBomb）
- Modify: `packages/shared/src/gridsim.test.ts`（追加测试）

**Interfaces:**
- Consumes: Task 5 的 `GameSim`、Task 4 的 `computeFlame`
- Produces: `placeBomb(playerId)` 生效（数量上限、同格去重）；到点自动爆炸、连锁引爆、烧毁软墙（`wallBroken` 事件本任务 item 恒为 null，Task 8 填充掉落）；`explosions` 带 `expireAt`；`died` 事件与 `alive=false`（含无敌豁免）

- [ ] **Step 1: 追加失败测试**

```ts
// gridsim.test.ts 追加
describe("GameSim 泡泡与爆炸", () => {
  it("放泡泡受数量上限约束，同格不能重复放", () => {
    const sim = makeSim();
    const a = sim.players.get("a")!;
    sim.placeBomb("a");
    expect(sim.bombs).toHaveLength(1);
    expect(a.bombsActive).toBe(1);
    sim.placeBomb("a"); // 同格已有泡泡
    expect(sim.bombs).toHaveLength(1);
    a.bombsMax = 0;
    a.bombsActive = 0;
    sim.setInput("a", "right");
    sim.step(250); // 走到 (2,1) 离开泡泡格
    sim.placeBomb("a"); // 上限 0
    expect(sim.bombs).toHaveLength(1); // 仍是原来那颗
  });

  it("引信 2500ms：差一点不炸，到点必炸", () => {
    const sim = makeSim();
    sim.placeBomb("a");
    for (let i = 0; i < 24; i++) sim.step(100); // 2400ms
    expect(sim.bombs).toHaveLength(1);
    expect(sim.explosions).toHaveLength(0);
    sim.step(150); // 2550ms
    expect(sim.bombs).toHaveLength(0);
    expect(sim.explosions).toHaveLength(1);
    expect(sim.players.get("a")!.bombsActive).toBe(0);
  });

  it("火焰长度1：烧毁相邻软墙，硬墙直接挡", () => {
    const sim = makeSim();
    sim.grid[idx(3, 1)] = Tile.SoftWall;
    sim.grid[idx(1, 2)] = Tile.SoftWall;
    sim.placeBomb("a");
    for (let i = 0; i < 26; i++) sim.step(100);
    expect(sim.grid[idx(2, 1)]).toBe(Tile.Floor); // 被烧毁
    expect(sim.grid[idx(3, 1)]).toBe(Tile.SoftWall); // 未波及
    expect(sim.grid[idx(1, 2)]).toBe(Tile.Floor); // 被烧毁
    const keys = sim.explosions[0].cells.map(c => `${c.gx},${c.gy}`);
    expect(keys).toContain("2,1");
    expect(keys).not.toContain("3,1");
  });

  it("连锁：火焰引爆相邻泡泡（即使其引信未到）", () => {
    const sim = makeSim(["a", "b"]);
    sim.placeBomb("a"); // (1,1)——先放泡再挪人，泡留在原地
    const a = sim.players.get("a")!;
    a.x = 5; a.y = 5; a.fromX = 5; a.fromY = 5; a.dir = null; a.progress = 0;
    sim.bombs.push({ id: 999, gx: 2, gy: 1, ownerId: "b", power: 3, explodeAt: sim.elapsedMs + 99999 });
    for (let i = 0; i < 26; i++) sim.step(100);
    expect(sim.bombs).toHaveLength(0); // 两颗都被引爆
    expect(sim.explosions.length).toBeGreaterThanOrEqual(2);
  });

  it("爆炸产生 died 事件，火焰持续 500ms 后消失", () => {
    const sim = makeSim();
    sim.placeBomb("a"); // a 站在泡泡上
    for (let i = 0; i < 26; i++) sim.step(100);
    const events = sim.drainEvents();
    expect(events.some(e => e.type === "died" && e.playerId === "a")).toBe(true);
    expect(sim.players.get("a")!.alive).toBe(false);
    expect(sim.explosions).toHaveLength(1);
    for (let i = 0; i < 5; i++) sim.step(100); // 又过 500ms
    expect(sim.explosions).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run test -w packages/shared -- gridsim`
Expected: 新增 5 个测试 FAIL。

- [ ] **Step 3: 填充实现**

替换 `placeBomb` 桩：

```ts
  placeBomb(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || !p.alive || this.phase !== "playing") return;
    if (p.bombsActive >= p.bombsMax) return;
    const gx = Math.round(p.x);
    const gy = Math.round(p.y);
    if (this.bombAt(gx, gy)) return;
    this.bombs.push({
      id: this.nextId++, gx, gy, ownerId: p.id,
      power: p.flameLen, explodeAt: this.elapsedMs + BOMB_FUSE_MS,
    });
    p.bombsActive++;
    this.events.push({ type: "bombPlaced", gx, gy, ownerId: p.id });
  }
```

填充 `stepBombs`，新增 `explodeBomb`（放在 `stepBombs` 旁）：

```ts
  protected stepBombs(): void {
    const due = this.bombs.filter(b => b.explodeAt <= this.elapsedMs);
    const exploded = new Set<number>();
    for (const b of due) this.explodeBomb(b, exploded);
  }

  private explodeBomb(b: SimBomb, exploded: Set<number>): void {
    if (exploded.has(b.id)) return;
    exploded.add(b.id);
    this.bombs = this.bombs.filter(x => x.id !== b.id);
    const owner = this.players.get(b.ownerId);
    if (owner) owner.bombsActive = Math.max(0, owner.bombsActive - 1);

    const cells = computeFlame(this.grid, b.gx, b.gy, b.power);
    this.explosions.push({ id: this.nextId++, cells, expireAt: this.elapsedMs + FLAME_MS });
    this.events.push({ type: "exploded", cells });

    for (const c of cells) {
      const i = c.gy * GRID_W + c.gx;
      if (this.grid[i] === Tile.SoftWall) {
        this.grid[i] = Tile.Floor;
        // 道具掉落逻辑 Task 8 填充，先发事件
        this.events.push({ type: "wallBroken", gx: c.gx, gy: c.gy, item: null });
      }
      const chain = this.bombAt(c.gx, c.gy);
      if (chain) this.explodeBomb(chain, exploded); // 连锁引爆
      this.items.delete(i); // 火焰烧毁道具（Task 8 前恒为空）
      for (const p of this.players.values()) {
        if (
          p.alive &&
          this.elapsedMs >= p.invincibleUntil &&
          Math.round(p.x) === c.gx &&
          Math.round(p.y) === c.gy
        ) {
          p.alive = false;
          this.events.push({ type: "died", playerId: p.id, gx: c.gx, gy: c.gy });
        }
      }
    }
  }
```

- [ ] **Step 4: 运行测试通过**

Run: `npm run test -w packages/shared`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): 泡泡爆炸、烧墙、连锁与死亡判定"
```

---

### Task 7: 客户端骨架、FrameData 与渲染器 —— M1 上屏可玩

**Files:**
- Modify: `packages/client/index.html`（替换占位）
- Create: `packages/client/style.css`、`packages/client/src/render/frame.ts`、`packages/client/src/render/renderer.ts`、`packages/client/src/input.ts`
- Modify: `packages/client/src/main.ts`（替换占位，本机单人对战）

**Interfaces:**
- Consumes: `@pt/shared` 的 `GameSim/Tile/ItemType/GRID_W/GRID_H/TILE/FLAME_MS/BOMB_FUSE_MS/SUDDEN_DEATH_AT_MS`
- Produces: `FrameData`（渲染器唯一输入）、`simToFrame(sim, suddenDeathAt): FrameData`、`parseGrid(s): Uint8Array`、`Renderer`（`draw(f, nowMs, ghosts?)`）、`attachInput({onDir, onBomb})`。后续联网模式（Task 13）只需产出 `FrameData` 即可复用渲染器与主循环。

- [ ] **Step 1: 页面骨架与样式**

```html
<!-- packages/client/index.html -->
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>泡泡堂</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <div id="app">
    <!-- 大厅（Task 14 启用） -->
    <section id="screen-lobby" class="screen hidden">
      <h1>泡泡堂</h1>
      <input id="nickname" maxlength="12" placeholder="输入昵称" />
      <button id="btn-quick2">快速匹配 · 2人</button>
      <button id="btn-quick4">快速匹配 · 4人</button>
      <button id="btn-create">创建房间</button>
      <div class="row">
        <input id="room-code" maxlength="4" placeholder="房间号" />
        <button id="btn-join">加入房间</button>
      </div>
      <p id="lobby-status"></p>
    </section>

    <!-- 游戏 -->
    <section id="screen-game" class="screen">
      <div id="hud"></div>
      <div id="canvas-wrap">
        <canvas id="game"></canvas>
        <div id="overlay" class="hidden"></div>
      </div>
      <p id="hint">方向键 / WASD 移动 · 空格放泡泡</p>
    </section>
  </div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

```css
/* packages/client/style.css */
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #1b2430; color: #eee;
  font-family: "Microsoft YaHei", system-ui, sans-serif;
  display: flex; justify-content: center; padding-top: 24px;
}
.screen.hidden { display: none; }
#screen-lobby { width: 320px; display: flex; flex-direction: column; gap: 12px; }
#screen-lobby h1 { text-align: center; }
#screen-lobby input, #screen-lobby button {
  padding: 10px; font-size: 16px; border: none; border-radius: 6px;
}
#screen-lobby button { background: #4a90d9; color: #fff; cursor: pointer; }
#screen-lobby .row { display: flex; gap: 8px; }
#screen-lobby .row input { flex: 1; text-transform: uppercase; }
#lobby-status { text-align: center; color: #9ab; min-height: 1.5em; }
#hud { height: 28px; display: flex; gap: 24px; align-items: center; font-size: 15px; }
#canvas-wrap { position: relative; }
#game { display: block; }
#overlay {
  position: absolute; inset: 0; background: rgba(0,0,0,.72);
  display: flex; flex-direction: column; justify-content: center; align-items: center;
  gap: 16px; font-size: 28px;
}
#overlay.hidden { display: none; }
#overlay button { padding: 8px 24px; font-size: 16px; border: none; border-radius: 6px; cursor: pointer; }
#hint { margin-top: 8px; color: #889; font-size: 13px; }
```

- [ ] **Step 2: FrameData 定义 + simToFrame + parseGrid**

```ts
// packages/client/src/render/frame.ts
import { FLAME_MS, GameSim, GRID_W, ItemType, SUDDEN_DEATH_AT_MS, Vec } from "@pt/shared";

export interface PlayerView {
  id: string;
  x: number;
  y: number;
  colorIndex: number;
  alive: boolean;
  invincible: boolean;
  moving: boolean;
}

export interface BombView { id: string; gx: number; gy: number; fuse: number }
export interface FlameView { id: string; cells: Vec[]; life: number }
export interface ItemView { id: string; gx: number; gy: number; type: ItemType }

export interface FrameData {
  grid: Uint8Array;
  players: PlayerView[];
  bombs: BombView[];
  flames: FlameView[];
  items: ItemView[];
  phase: "waiting" | "playing" | "ended";
  elapsedMs: number;
  suddenDeathAt: number;
  winnerIds: string[];
}

/** 单机模式：直接从 GameSim 构造渲染帧 */
export function simToFrame(sim: GameSim): FrameData {
  return {
    grid: sim.grid,
    players: [...sim.players.values()].map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      colorIndex: p.spawnIndex,
      alive: p.alive,
      invincible: sim.elapsedMs < p.invincibleUntil,
      moving: p.dir !== null,
    })),
    bombs: sim.bombs.map(b => ({
      id: String(b.id), gx: b.gx, gy: b.gy, fuse: Math.max(0, b.explodeAt - sim.elapsedMs),
    })),
    flames: sim.explosions.map(e => ({
      id: String(e.id), cells: e.cells, life: Math.max(0, e.expireAt - sim.elapsedMs),
    })),
    items: [...sim.items.values()].map(it => ({ id: String(it.id), gx: it.gx, gy: it.gy, type: it.type })),
    phase: sim.phase,
    elapsedMs: sim.elapsedMs,
    suddenDeathAt: SUDDEN_DEATH_AT_MS,
    winnerIds: sim.winnerIds,
  };
}

/** "012" 字符串 → Uint8Array（联网模式解析服务器地图） */
export function parseGrid(s: string): Uint8Array {
  const g = new Uint8Array(GRID_W * GRID_H);
  for (let i = 0; i < s.length && i < g.length; i++) g[i] = s.charCodeAt(i) - 48;
  return g;
}
```

- [ ] **Step 3: 渲染器（一次写全：地图/道具/泡泡/火焰/玩家/幽灵，之后任务不再改）**

```ts
// packages/client/src/render/renderer.ts
import { BOMB_FUSE_MS, FLAME_MS, GRID_H, GRID_W, ItemType, TILE, Tile } from "@pt/shared";
import type { FrameData } from "./frame";

export const PLAYER_COLORS = ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71"];

export interface GhostView { x: number; y: number; colorIndex: number; diedAtMs: number }

const ITEM_LABEL: Record<ItemType, string> = {
  [ItemType.Bomb]: "泡",
  [ItemType.Flame]: "火",
  [ItemType.Speed]: "速",
};
const ITEM_COLOR: Record<ItemType, string> = {
  [ItemType.Bomb]: "#16a085",
  [ItemType.Flame]: "#e67e22",
  [ItemType.Speed]: "#9b59b6",
};
const center = (v: number) => (v + 0.5) * TILE;

export class Renderer {
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = GRID_W * TILE;
    canvas.height = GRID_H * TILE;
    this.ctx = canvas.getContext("2d")!;
  }

  draw(f: FrameData, nowMs: number, ghosts: GhostView[] = []) {
    this.drawTiles(f.grid);
    for (const it of f.items) this.drawItem(it.gx, it.gy, it.type);
    for (const b of f.bombs) this.drawBomb(b.gx, b.gy, b.fuse, nowMs);
    for (const fl of f.flames) this.drawFlame(fl.cells, fl.life);
    for (const g of ghosts) this.drawGhost(g, nowMs);
    for (const p of f.players) this.drawPlayer(p, nowMs);
  }

  private drawTiles(grid: Uint8Array) {
    const { ctx } = this;
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const x = gx * TILE;
        const y = gy * TILE;
        const t = grid[gy * GRID_W + gx];
        if (t === Tile.HardWall) {
          ctx.fillStyle = "#4a4a55";
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = "#5d5d6b";
          ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
        } else if (t === Tile.SoftWall) {
          ctx.fillStyle = "#a5692d";
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = "#7c4a1a";
          ctx.strokeRect(x + 3.5, y + 3.5, TILE - 7, TILE - 7);
          ctx.beginPath();
          ctx.moveTo(x + 3, y + TILE / 2);
          ctx.lineTo(x + TILE - 3, y + TILE / 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = (gx + gy) % 2 === 0 ? "#d8e0d0" : "#cdd6c4";
          ctx.fillRect(x, y, TILE, TILE);
        }
      }
    }
  }

  private drawItem(gx: number, gy: number, type: ItemType) {
    const { ctx } = this;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(center(gx), center(gy), TILE * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ITEM_COLOR[type];
    ctx.font = `bold ${TILE * 0.4}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ITEM_LABEL[type], center(gx), center(gy) + 1);
  }

  private drawBomb(gx: number, gy: number, fuse: number, nowMs: number) {
    const { ctx } = this;
    const urgency = 1 - Math.min(1, fuse / BOMB_FUSE_MS); // 0→1 越来越急
    const pulse = 1 + 0.1 * Math.sin(nowMs / (90 - 40 * urgency));
    const r = TILE * 0.36 * pulse;
    ctx.fillStyle = urgency > 0.7 ? "#c0392b" : "#22222c";
    ctx.beginPath();
    ctx.arc(center(gx), center(gy), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.beginPath();
    ctx.arc(center(gx) - r * 0.3, center(gy) - r * 0.3, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFlame(cells: { gx: number; gy: number }[], life: number) {
    const { ctx } = this;
    const alpha = Math.max(0, Math.min(1, life / FLAME_MS));
    for (const c of cells) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#f39c12";
      ctx.fillRect(c.gx * TILE + 4, c.gy * TILE + 4, TILE - 8, TILE - 8);
      ctx.fillStyle = "#f7ff5e";
      ctx.fillRect(center(c.gx) - TILE * 0.18, center(c.gy) - TILE * 0.18, TILE * 0.36, TILE * 0.36);
      ctx.globalAlpha = 1;
    }
  }

  private drawPlayer(p: FrameData["players"][number], nowMs: number) {
    const { ctx } = this;
    if (!p.alive) return; // 死亡表现由 ghosts 负责
    if (p.invincible && Math.floor(nowMs / 120) % 2 === 0) return; // 无敌闪烁
    const cx = center(p.x);
    const cy = center(p.y);
    const s = TILE * 0.62;
    ctx.fillStyle = PLAYER_COLORS[p.colorIndex % 4];
    ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.strokeRect(cx - s / 2, cy - s / 2, s, s);
    ctx.fillStyle = "#fff";
    ctx.fillRect(cx - s * 0.22, cy - s * 0.25, s * 0.16, s * 0.2);
    ctx.fillRect(cx + s * 0.06, cy - s * 0.25, s * 0.16, s * 0.2);
    ctx.fillStyle = "#000";
    ctx.fillRect(cx - s * 0.17, cy - s * 0.2, s * 0.07, s * 0.1);
    ctx.fillRect(cx + s * 0.11, cy - s * 0.2, s * 0.07, s * 0.1);
  }

  private drawGhost(g: GhostView, nowMs: number) {
    const t = (nowMs - g.diedAtMs) / 1500;
    if (t < 0 || t > 1) return;
    const { ctx } = this;
    const cx = center(g.x);
    const cy = center(g.y);
    ctx.globalAlpha = 0.7 * (1 - t);
    ctx.fillStyle = PLAYER_COLORS[g.colorIndex % 4];
    ctx.beginPath();
    ctx.arc(cx, cy, TILE * 0.3 * (1 + t * 0.8), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 8);
    ctx.lineTo(cx + 8, cy + 8);
    ctx.moveTo(cx + 8, cy - 8);
    ctx.lineTo(cx - 8, cy + 8);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }
}
```

- [ ] **Step 4: 键盘输入**

```ts
// packages/client/src/input.ts
export type Dir = "up" | "down" | "left" | "right";

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
};

export interface InputHandlers {
  onDir(d: Dir | "none"): void;
  onBomb(): void;
}

/** 后按下的方向优先（栈顶）；松开后回退到上一个仍按住的方向 */
export function attachInput(handlers: InputHandlers): void {
  const stack: Dir[] = [];
  const emit = () => handlers.onDir(stack.length ? stack[stack.length - 1] : "none");

  window.addEventListener("keydown", e => {
    if (e.target instanceof HTMLInputElement) return;
    const dir = KEY_DIR[e.code];
    if (dir) {
      e.preventDefault();
      if (!stack.includes(dir)) {
        stack.push(dir);
        emit();
      }
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      if (!e.repeat) handlers.onBomb();
    }
  });

  window.addEventListener("keyup", e => {
    const dir = KEY_DIR[e.code];
    if (!dir) return;
    const i = stack.indexOf(dir);
    if (i >= 0) {
      stack.splice(i, 1);
      emit();
    }
  });
}
```

注意：`attachInput` 每次调用都会注册新的监听器，切换对局（单机↔在线）时会导致重复。提供解绑：

```ts
// input.ts 追加
export function makeInputHub(): {
  setHandlers(h: InputHandlers | null): void;
} {
  let handlers: InputHandlers | null = null;
  attachInput({
    onDir: d => handlers?.onDir(d),
    onBomb: () => handlers?.onBomb(),
  });
  return { setHandlers: h => (handlers = h) };
}
```

实际使用：`main.ts` 创建一次 hub（模块级），各模式 `hub.setHandlers({...})`，离开时 `setHandlers(null)`。`attachInput` 因此只被调用一次。

- [ ] **Step 5: main.ts —— 本机单人对战（M1 验收形态）**

```ts
// packages/client/src/main.ts
import { GameSim } from "@pt/shared";
import { makeInputHub } from "./input";
import { Renderer, type GhostView } from "./render/renderer";
import { simToFrame } from "./render/frame";

function showScreen(id: string) {
  for (const el of document.querySelectorAll(".screen")) el.classList.add("hidden");
  document.getElementById(id)!.classList.remove("hidden");
}

const hub = makeInputHub();

/** 游戏画面公共循环：getFrame 每帧产出一个 FrameData */
function runGameLoop(getFrame: (dtMs: number, nowMs: number) => ReturnType<typeof simToFrame>, myId: string) {
  showScreen("screen-game");
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const hud = document.getElementById("hud")!;
  const overlay = document.getElementById("overlay")!;
  const renderer = new Renderer(canvas);
  const ghosts = new Map<string, GhostView>();
  let last = performance.now();
  let prevAlive = new Set<string>(); // 上一帧仍存活的角色

  function loop(now: number) {
    const dt = Math.min(50, now - last);
    last = now;
    const f = getFrame(dt, now);

    // 死亡瞬间 → 生成幽灵（上一帧活着、这一帧死了）
    const aliveNow = new Set(f.players.filter(p => p.alive).map(p => p.id));
    for (const p of f.players) {
      if (prevAlive.has(p.id) && !aliveNow.has(p.id) && !ghosts.has(p.id)) {
        ghosts.set(p.id, { x: p.x, y: p.y, colorIndex: p.colorIndex, diedAtMs: now });
      }
    }
    prevAlive = aliveNow;

    renderer.draw(f, now, [...ghosts.values()]);

    // HUD
    const remain = Math.max(0, Math.ceil((f.suddenDeathAt - f.elapsedMs) / 1000));
    hud.textContent = f.elapsedMs >= f.suddenDeathAt
      ? "⚠ 突然死亡！"
      : `存活 ${f.players.filter(p => p.alive).length} · 突然死亡倒计时 ${remain}s`;

    // 结算
    if (f.phase === "ended" && overlay.classList.contains("hidden")) {
      const win = f.winnerIds.includes(myId);
      overlay.innerHTML = f.winnerIds.length
        ? `<div>${win ? "🏆 胜利！" : "💥 失败"}</div><button onclick="location.reload()">返回大厅</button>`
        : `<div>🤝 平局</div><button onclick="location.reload()">返回大厅</button>`;
      overlay.classList.remove("hidden");
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

/** 单机练习 */
function enterLocalGame(playerId = "me") {
  const sim = new GameSim((Math.random() * 2 ** 31) | 0, [playerId]);
  hub.setHandlers({
    onDir: d => sim.setInput(playerId, d),
    onBomb: () => sim.placeBomb(playerId),
  });
  runGameLoop(() => simToFrame(sim), playerId);
}

enterLocalGame(); // Task 14 改为先进大厅
```

- [ ] **Step 6: 手动验收**

Run: `npm run dev`，浏览器打开 `http://localhost:5173`
Expected: 看到 13×11 地图（硬墙/软墙/地板样式分明）；WASD/方向键移动流畅且只能走地板；空格放泡泡，泡泡变红脉动 2.5 秒后爆炸，十字火焰闪 0.5 秒，软墙被烧毁；被自己泡泡炸死后出现渐隐幽灵；HUD 显示"存活 1"。DevTools 无红色报错。

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(client): Canvas 渲染器与单机可玩（M1）"
```

---

### Task 8: GameSim 道具系统（TDD）

**Files:**
- Modify: `packages/shared/src/gridsim.ts`（explodeBomb 掉落分支 + tryPickup 实现）
- Modify: `packages/shared/src/gridsim.test.ts`（追加测试）

**Interfaces:**
- Produces: 软墙被烧毁时按 `ITEM_DROP_RATE` 掉落（三种道具均分）；玩家到达道具格拾取：`bombsMax/flameLen` 上限 8、`speedLevel` 上限 6；`wallBroken` 事件携带 `item: ItemType | null`；`itemPicked` 事件

- [ ] **Step 1: 追加失败测试**

```ts
// gridsim.test.ts 追加
import { ItemType, MAX_BOMBS, MAX_FLAMES, MAX_SPEED_LEVEL } from "./constants";

describe("GameSim 道具", () => {
  it("火焰烧毁道具", () => {
    const sim = makeSim();
    sim.items.set(idx(2, 1), { id: 1, gx: 2, gy: 1, type: ItemType.Flame });
    sim.placeBomb("a"); // (1,1) 先放泡
    const a = sim.players.get("a")!;
    a.x = 5; a.y = 5; a.fromX = 5; a.fromY = 5; a.dir = null; // 再挪开人
    for (let i = 0; i < 26; i++) sim.step(100);
    expect(sim.items.has(idx(2, 1))).toBe(false);
  });

  it("走到道具格拾取并生效", () => {
    const sim = makeSim();
    sim.items.set(idx(2, 1), { id: 1, gx: 2, gy: 1, type: ItemType.Flame });
    sim.setInput("a", "right");
    for (let i = 0; i < 4; i++) sim.step(250);
    const a = sim.players.get("a")!;
    expect(a.flameLen).toBe(2);
    expect(sim.items.has(idx(2, 1))).toBe(false);
    expect(sim.drainEvents().some(e => e.type === "itemPicked")).toBe(true);
  });

  it("道具效果受上限约束", () => {
    const sim = makeSim();
    const a = sim.players.get("a")!;
    a.bombsMax = MAX_BOMBS;
    a.flameLen = MAX_FLAMES;
    a.speedLevel = MAX_SPEED_LEVEL;
    sim.items.set(idx(2, 1), { id: 1, gx: 2, gy: 1, type: ItemType.Bomb });
    sim.setInput("a", "right");
    for (let i = 0; i < 4; i++) sim.step(250);
    expect(a.bombsMax).toBe(MAX_BOMBS);
    expect(a.flameLen).toBe(MAX_FLAMES);
    expect(a.speedLevel).toBe(MAX_SPEED_LEVEL);
  });

  it("烧墙按注入的 rng 掉道具（三种均分）", () => {
    // rng 序列：第 1 次 0.1（<0.3 → 掉落），第 2 次 0.2（<1/3 → Bomb）
    const seq = [0.1, 0.2];
    let i = 0;
    const fixed = () => (i < seq.length ? seq[i++] : 0.999);
    const sim = new GameSim(42, ["a", "b"], fixed);
    sim.grid[idx(2, 1)] = Tile.SoftWall;
    sim.placeBomb("a"); // (1,1) 先放泡
    const a = sim.players.get("a")!;
    a.x = 5; a.y = 5; a.fromX = 5; a.fromY = 5; a.dir = null;
    for (let i = 0; i < 26; i++) sim.step(100);
    expect(sim.items.get(idx(2, 1))?.type).toBe(ItemType.Bomb);
    const broken = sim.drainEvents().filter(e => e.type === "wallBroken");
    expect(broken.some(e => e.gx === 2 && e.gy === 1 && e.item === ItemType.Bomb)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run test -w packages/shared -- gridsim`
Expected: 新增 4 个 FAIL。

- [ ] **Step 3: 实现**

`explodeBomb` 中烧墙分支替换为：

```ts
      if (this.grid[i] === Tile.SoftWall) {
        this.grid[i] = Tile.Floor;
        const dropped = this.rng() < ITEM_DROP_RATE;
        const item = dropped
          ? (this.rng() < 1 / 3 ? ItemType.Bomb : this.rng() < 1 / 2 ? ItemType.Flame : ItemType.Speed)
          : null;
        if (item !== null) {
          this.items.set(i, { id: this.nextId++, gx: c.gx, gy: c.gy, type: item });
        }
        this.events.push({ type: "wallBroken", gx: c.gx, gy: c.gy, item });
      }
```

`tryPickup` 桩替换为：

```ts
  protected tryPickup(p: SimPlayer): void {
    const i = Math.round(p.y) * GRID_W + Math.round(p.x);
    const item = this.items.get(i);
    if (!item) return;
    this.items.delete(i);
    if (item.type === ItemType.Bomb) p.bombsMax = Math.min(MAX_BOMBS, p.bombsMax + 1);
    else if (item.type === ItemType.Flame) p.flameLen = Math.min(MAX_FLAMES, p.flameLen + 1);
    else p.speedLevel = Math.min(MAX_SPEED_LEVEL, p.speedLevel + 1);
    this.events.push({ type: "itemPicked", playerId: p.id, itemType: item.type });
  }
```

- [ ] **Step 4: 运行测试通过**

Run: `npm run test -w packages/shared`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): 道具掉落与拾取"
```

---

### Task 9: GameSim 死亡/无敌/胜负/突然死亡（TDD）—— M2 逻辑完备

**Files:**
- Modify: `packages/shared/src/gridsim.ts`（新增 forfeit、实现 stepSuddenDeath/checkEnd）
- Modify: `packages/shared/src/gridsim.test.ts`（追加测试）

**Interfaces:**
- Produces: `forfeit(playerId)`（认输/断线超时判负，内部调 checkEnd 立即结算）；胜负：存活 ≤1 且人数 ≥2 时 `phase="ended"` + `winnerIds`（0 存活 = 平局 `[]`）；单人练习模式永不自动结算；突然死亡：`elapsedMs ≥ SUDDEN_DEATH_AT_MS` 后每 `SUDDEN_DEATH_STEP_MS` 外圈向内一层转硬墙（压死圈内玩家、删除圈内道具与泡泡）

- [ ] **Step 1: 追加失败测试**

```ts
// gridsim.test.ts 追加
import { SUDDEN_DEATH_AT_MS, SUDDEN_DEATH_STEP_MS } from "./constants";

describe("GameSim 胜负与突然死亡", () => {
  it("出生无敌：2 秒内站在火焰上不死", () => {
    const sim = makeSim();
    sim.bombs.push({ id: 1, gx: 1, gy: 1, ownerId: "b", power: 1, explodeAt: 0 });
    sim.step(16); // elapsed=16ms < 2000ms
    expect(sim.players.get("a")!.alive).toBe(true);
  });

  it("无敌过期后被火焰炸死", () => {
    const sim = makeSim();
    const a = sim.players.get("a")!;
    a.invincibleUntil = 0;
    sim.bombs.push({ id: 1, gx: 1, gy: 1, ownerId: "b", power: 1, explodeAt: 0 });
    sim.step(16);
    expect(a.alive).toBe(false);
  });

  it("两人局死一人即结束，胜者是存活者", () => {
    const sim = makeSim(["a", "b"]);
    sim.players.get("b")!.alive = false;
    sim.step(16);
    expect(sim.phase).toBe("ended");
    expect(sim.winnerIds).toEqual(["a"]);
  });

  it("同时死亡为平局", () => {
    const sim = makeSim(["a", "b"]);
    sim.players.get("a")!.alive = false;
    sim.players.get("b")!.alive = false;
    sim.step(16);
    expect(sim.phase).toBe("ended");
    expect(sim.winnerIds).toEqual([]);
  });

  it("单人练习模式永不自动结算", () => {
    const sim = makeSim(["solo"]);
    sim.players.get("solo")!.alive = false;
    sim.step(16);
    expect(sim.phase).toBe("playing");
  });

  it("forfeit 直接判负并触发结算", () => {
    const sim = makeSim(["a", "b"]);
    sim.forfeit("a");
    expect(sim.phase).toBe("ended");
    expect(sim.winnerIds).toEqual(["b"]);
  });

  it("3 分钟后突然死亡：外圈逐层合拢，圈内玩家被压死", () => {
    const sim = makeSim(["a", "b", "c", "d"]);
    // 四人全部挪到地图中央安全位（(5,5)(7,5)(5,7)(7,7)，保证突然死亡展开期间 phase 仍是 playing）
    const spots = [[5, 5], [7, 5], [5, 7], [7, 7]];
    [...sim.players.values()].forEach((p, i) => {
      sim.grid[idx(spots[i][0], spots[i][1])] = Tile.Floor;
      p.x = spots[i][0]; p.y = spots[i][1]; p.fromX = spots[i][0]; p.fromY = spots[i][1]; p.dir = null;
    });
    for (let i = 0; i < SUDDEN_DEATH_AT_MS / 1000; i++) sim.step(1000);
    expect(sim.grid[idx(1, 1)]).toBe(Tile.HardWall); // 第一圈含出生点
    expect(sim.grid[idx(2, 1)]).toBe(Tile.HardWall);
    expect(sim.players.get("a")!.alive).toBe(true); // 人已挪走
    for (let i = 0; i < SUDDEN_DEATH_STEP_MS / 1000; i++) sim.step(1000);
    expect(sim.grid[idx(3, 2)]).toBe(Tile.HardWall); // 第二圈（gy==2）
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run test -w packages/shared -- gridsim`
Expected: 新增 7 个 FAIL。

- [ ] **Step 3: 实现**

`GameSim` 追加方法（forfeit 与 checkEnd）：

```ts
  forfeit(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || !p.alive || this.phase !== "playing") return;
    p.alive = false;
    this.events.push({ type: "died", playerId, gx: Math.round(p.x), gy: Math.round(p.y) });
    this.checkEnd();
  }

  protected stepSuddenDeath(): void {
    if (this.elapsedMs < SUDDEN_DEATH_AT_MS) return;
    if (this.elapsedMs < this.nextSuddenDeathAt) return;
    const k = this.suddenDeathRing;
    if (k > Math.floor(Math.min(GRID_W, GRID_H) / 2)) return;
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const onRing = gx === k || gx === GRID_W - 1 - k || gy === k || gy === GRID_H - 1 - k;
        if (!onRing) continue;
        const i = gy * GRID_W + gx;
        if (this.grid[i] === Tile.HardWall) continue;
        this.grid[i] = Tile.HardWall;
        this.items.delete(i);
        this.bombs = this.bombs.filter(b => !(b.gx === gx && b.gy === gy));
        for (const p of this.players.values()) {
          if (p.alive && Math.round(p.x) === gx && Math.round(p.y) === gy) {
            p.alive = false;
            this.events.push({ type: "died", playerId: p.id, gx, gy });
          }
        }
      }
    }
    this.suddenDeathRing++;
    this.nextSuddenDeathAt = this.elapsedMs + SUDDEN_DEATH_STEP_MS;
  }

  protected checkEnd(): void {
    if (this.players.size < 2) return; // 单人练习模式不结算
    const alive = [...this.players.values()].filter(p => p.alive);
    if (alive.length <= 1) {
      this.phase = "ended";
      this.winnerIds = alive.map(p => p.id);
      this.events.push({ type: "ended", winnerIds: this.winnerIds });
    }
  }
```

- [ ] **Step 4: 运行测试通过**

Run: `npm run test -w packages/shared`
Expected: 全部 PASS。**M2 逻辑完备。**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): 无敌/胜负/认输/突然死亡（M2 规则完备）"
```

---

### Task 10: 客户端结算与道具显示验证（M2 验收）

**Files:**
- Modify: `packages/client/src/main.ts`（单机模式暴露调试句柄）

Task 7 的渲染器/HUD/结算/幽灵已经把 M2 的客户端表现全部画出来了（道具/火焰/胜负/幽灵都在渲染器里）。本任务只做**M2 验收**：用调试句柄在单机模式制造局面，逐项确认。

- [ ] **Step 1: 暴露调试句柄**

`enterLocalGame` 内加一行（保留到 Task 13 重写 main.ts 时自然移除）：

```ts
  (window as any).__sim = sim;
```

- [ ] **Step 2: 手动验收清单（DevTools console 驱动）**

Run: `npm run dev`，逐项验证：
1. 走到软墙旁放泡泡 → 软墙被烧毁，约 30% 概率出现 白圈+泡/火/速 字样的道具
2. 走到道具上 → 属性生效（放泡数量变多/火焰变长/速度变快），console 执行 `__sim.players.get("me")` 可核对 `bombsMax/flameLen/speedLevel`
3. 连锁：两颗泡泡相邻时先放的那颗爆炸，另一颗立即跟着爆
4. 站在泡泡上 → 出生 2 秒内不死（闪烁）；等 2 秒后再炸自己 → 幽灵渐隐
5. console 执行 `__sim.forfeit("me")`（双人局才结算，单人练习不结算——本项在 Task 13 联机后验收）
6. DevTools 无红色报错

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore(client): M2 手动验收调试句柄"
```

---

### Task 11: Schema 状态定义与 GameSim→Schema 同步（TDD）

**Files:**
- Create: `packages/server/src/state/GameRoomState.ts`、`packages/server/src/state/sync.ts`、`packages/server/src/state/sync.test.ts`

**Interfaces:**
- Produces: `GameRoomState/PlayerState/BombState/FlameState/ItemState`（Schema 类）；`syncState(state, sim): void`——把 GameSim 实体逐字段拷进 Schema（Map 按 id 差量增删、火焰 cells 扁平化 `[gx,gy,...]`、ended 兜底写 phase/winnerIds）；`gridToString(grid): string`（每格 `'0'/'1'/'2'`）

- [ ] **Step 1: Schema 类**

```ts
// packages/server/src/state/GameRoomState.ts
import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";
import { ItemType } from "@pt/shared";

export class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("uint8") colorIndex = 0;
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("boolean") moving = false;
  @type("uint8") bombsMax = 1;
  @type("uint8") flameLen = 1;
  @type("uint8") speedLevel = 1;
  @type("boolean") alive = true;
  @type("boolean") invincible = false;
  @type("boolean") connected = true;
}

export class BombState extends Schema {
  @type("string") id = "";
  @type("int8") gx = 0;
  @type("int8") gy = 0;
  @type("uint8") power = 1;
  /** 剩余引信毫秒，客户端做脉动动画 */
  @type("float32") fuse = 0;
  @type("string") ownerId = "";
}

export class FlameState extends Schema {
  @type("string") id = "";
  /** 扁平化 [gx,gy, gx,gy, ...] */
  @type(["int16"]) cells = new ArraySchema<number>();
  /** 剩余毫秒 */
  @type("float32") life = 0;
}

export class ItemState extends Schema {
  @type("string") id = "";
  @type("int8") gx = 0;
  @type("int8") gy = 0;
  @type("uint8") type = ItemType.Bomb;
}

export class GameRoomState extends Schema {
  @type("string") phase = "waiting";
  /** 地图布局，每格一个字符 '0' Floor '1' HardWall '2' SoftWall；waiting 阶段为空串 */
  @type("string") grid = "";
  @type("uint32") serverElapsedMs = 0;
  @type("uint32") suddenDeathAt = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: BombState }) bombs = new MapSchema<BombState>();
  @type({ map: FlameState }) flames = new MapSchema<FlameState>();
  @type({ map: ItemState }) items = new MapSchema<ItemState>();
  @type(["string"]) winnerIds = new ArraySchema<string>();
}
```

- [ ] **Step 2: 写失败测试**

```ts
// packages/server/src/state/sync.test.ts
import { describe, it, expect } from "vitest";
import { GameSim, Tile, ItemType, GRID_W } from "@pt/shared";
import { GameRoomState, PlayerState } from "./GameRoomState";
import { syncState, gridToString } from "./sync";

const idx = (gx: number, gy: number) => gy * GRID_W + gx;

describe("gridToString", () => {
  it("与 Uint8Array 等价", () => {
    const sim = new GameSim(42, ["a", "b"]);
    const s = gridToString(sim.grid);
    expect(s).toHaveLength(sim.grid.length);
    expect(s.charCodeAt(idx(0, 0)) - 48).toBe(Tile.HardWall);
  });
});

describe("syncState", () => {
  it("同步玩家属性与泡泡增删，保留昵称", () => {
    const sim = new GameSim(42, ["a", "b"]);
    const state = new GameRoomState();
    // 预置 waiting 阶段玩家（含昵称），sync 不应清掉
    for (const [i, id] of ["a", "b"].entries()) {
      const p = new PlayerState();
      p.id = id;
      p.name = `P${i}`;
      state.players.set(id, p);
    }
    sim.placeBomb("a");
    sim.step(500);
    syncState(state, sim);

    const pa = state.players.get("a")!;
    expect(pa.name).toBe("P0");
    expect(pa.x).toBeCloseTo(sim.players.get("a")!.x, 2);
    expect(pa.alive).toBe(true);
    expect(pa.invincible).toBe(true); // 出生无敌期内

    expect(state.bombs.size).toBe(1);
    const bomb = [...state.bombs.values()][0];
    expect(bomb.fuse).toBeGreaterThan(1900);
    expect(bomb.fuse).toBeLessThanOrEqual(2000);

    // 泡泡爆炸后从状态里删除，火焰出现
    for (let i = 0; i < 26; i++) sim.step(100);
    syncState(state, sim);
    expect(state.bombs.size).toBe(0);
    expect(state.flames.size).toBe(1);
    expect(state.serverElapsedMs).toBe(Math.floor(sim.elapsedMs));
  });

  it("同步道具拾取与结算", () => {
    const sim = new GameSim(42, ["a", "b"]);
    sim.grid[idx(2, 1)] = Tile.Floor;
    const state = new GameRoomState();
    sim.items.set(idx(2, 1), { id: 7, gx: 2, gy: 1, type: ItemType.Speed });
    sim.setInput("a", "right");
    for (let i = 0; i < 4; i++) sim.step(250);
    syncState(state, sim);
    expect(state.items.size).toBe(0); // 被捡走
    expect(state.players.get("a")!.speedLevel).toBe(2);

    sim.forfeit("b"); // forfeit 内部立即结算
    syncState(state, sim);
    expect(state.phase).toBe("ended");
    expect([...state.winnerIds]).toEqual(["a"]);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `npm run test -w packages/server`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现 sync.ts**

```ts
// packages/server/src/state/sync.ts
import { GameSim } from "@pt/shared";
import {
  GameRoomState, PlayerState, BombState, FlameState, ItemState,
} from "./GameRoomState";

export function gridToString(grid: Uint8Array): string {
  let s = "";
  for (let i = 0; i < grid.length; i++) s += String.fromCharCode(48 + grid[i]);
  return s;
}

/** 把 GameSim 的当前状态逐字段拷进 Schema；Map 做差量增删 */
export function syncState(state: GameRoomState, sim: GameSim): void {
  state.serverElapsedMs = Math.floor(sim.elapsedMs);

  for (const [id, p] of sim.players) {
    let ps = state.players.get(id);
    if (!ps) {
      ps = new PlayerState();
      ps.id = id;
      state.players.set(id, ps);
    }
    ps.x = p.x;
    ps.y = p.y;
    ps.moving = p.dir !== null;
    ps.bombsMax = p.bombsMax;
    ps.flameLen = p.flameLen;
    ps.speedLevel = p.speedLevel;
    ps.alive = p.alive;
    ps.invincible = sim.elapsedMs < p.invincibleUntil;
  }

  const bombIds = new Set<string>();
  for (const b of sim.bombs) {
    const key = String(b.id);
    bombIds.add(key);
    let bs = state.bombs.get(key);
    if (!bs) {
      bs = new BombState();
      bs.id = key;
      bs.gx = b.gx;
      bs.gy = b.gy;
      bs.ownerId = b.ownerId;
      state.bombs.set(key, bs);
    }
    bs.power = b.power;
    bs.fuse = Math.max(0, b.explodeAt - sim.elapsedMs);
  }
  for (const key of [...state.bombs.keys()]) {
    if (!bombIds.has(key)) state.bombs.delete(key);
  }

  const flameIds = new Set<string>();
  for (const e of sim.explosions) {
    const key = String(e.id);
    flameIds.add(key);
    let fs = state.flames.get(key);
    if (!fs) {
      fs = new FlameState();
      fs.id = key;
      state.flames.set(key, fs);
    }
    fs.life = Math.max(0, e.expireAt - sim.elapsedMs);
    const flat: number[] = [];
    for (const c of e.cells) flat.push(c.gx, c.gy);
    if (fs.cells.length !== flat.length) fs.cells.splice(0, fs.cells.length, ...flat);
  }
  for (const key of [...state.flames.keys()]) {
    if (!flameIds.has(key)) state.flames.delete(key);
  }

  const itemIds = new Set<string>();
  for (const it of sim.items.values()) {
    const key = String(it.id);
    itemIds.add(key);
    let is = state.items.get(key);
    if (!is) {
      is = new ItemState();
      is.id = key;
      is.gx = it.gx;
      is.gy = it.gy;
      is.type = it.type;
      state.items.set(key, is);
    }
  }
  for (const key of [...state.items.keys()]) {
    if (!itemIds.has(key)) state.items.delete(key);
  }

  // 结算兜底：ended 由 checkEnd 产生，这里把结果写进 Schema
  if (sim.phase === "ended" && state.phase !== "ended") {
    state.phase = "ended";
    state.winnerIds.splice(0, state.winnerIds.length, ...sim.winnerIds);
  }
}
```

- [ ] **Step 5: 运行测试通过**

Run: `npm run test -w packages/server`
Expected: 3 个测试 PASS。
Run: `npx tsc -p packages/server --noEmit`
Expected: 零错误。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(server): Schema 状态定义与 sim 同步（含单测）"
```

---

### Task 12: 服务器入口 + GameRoom 等待阶段 + 客户端连接

**Files:**
- Modify: `packages/server/src/index.ts`（替换占位）
- Create: `packages/server/src/rooms/code.ts`、`packages/server/src/rooms/GameRoom.ts`
- Create: `packages/client/src/net.ts`

**Interfaces:**
- Produces: Colyseus 房间名 `"game"`；join 选项 `{ mode?: number }`（`2`/`4` 决定 `maxClients`；不带 mode = 玩家创建的房间，服务器生成 4 位房间号写入 `setMetadata`）；消息 `setName {name}`、`start`。**关键约束**：快速匹配的 join 选项必须全体玩家完全一致（只含 `mode`），昵称一律进房后用 `setName` 发——否则 Colyseus 按选项哈希分组，永远匹配不到一起。`net.ts` 导出 `colyseus`（Client 实例）。

- [ ] **Step 1: 房间号与种子工具 + 服务器入口**

```ts
// packages/server/src/rooms/code.ts
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 去掉易混淆的 I L O 0 1

export function generateRoomCode(): string {
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

export function generateSeed(): number {
  return (Math.random() * 2 ** 31) | 0;
}
```

```ts
// packages/server/src/index.ts
import { Server } from "colyseus";
import { GameRoom } from "./rooms/GameRoom";

const gameServer = new Server();
gameServer.define("game", GameRoom);

gameServer.listen(2567).then(() => {
  console.log("泡泡堂服务器已启动: ws://localhost:2567");
});
```

- [ ] **Step 2: GameRoom（等待阶段：进房/昵称/满员自动开局入口/房主开始入口；startGame 本任务为桩）**

```ts
// packages/server/src/rooms/GameRoom.ts
import { Room, Client } from "colyseus";
import { GameRoomState, PlayerState } from "../state/GameRoomState";
import { generateRoomCode, generateSeed } from "./code";

interface JoinOptions { mode?: number }

export class GameRoom extends Room<GameRoomState> {
  maxClients = 4;
  /** 进房顺序 = 颜色/出生点顺序；第一个是房主 */
  joinOrder: string[] = [];
  sim: import("@pt/shared").GameSim | undefined;

  onCreate(options: JoinOptions) {
    this.maxClients = options.mode === 2 ? 2 : 4;
    this.setState(new GameRoomState());
    if (options.mode === undefined) {
      this.setMetadata({ code: generateRoomCode(), mode: this.maxClients });
    }
    this.onMessage("setName", (client, name: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const s = String(name ?? "").trim().slice(0, 12);
      p.name = s || `玩家${p.colorIndex + 1}`;
    });
    this.onMessage("start", client => {
      if (this.state.phase === "waiting" && this.joinOrder[0] === client.sessionId) {
        this.startGame();
      }
    });
  }

  onJoin(client: Client) {
    if (this.state.phase !== "waiting") {
      throw new Error("对局已开始，无法加入");
    }
    const p = new PlayerState();
    p.id = client.sessionId;
    p.colorIndex = this.joinOrder.length;
    p.name = `玩家${p.colorIndex + 1}`;
    this.joinOrder.push(client.sessionId);
    this.state.players.set(client.sessionId, p);
    if (this.clients.length >= this.maxClients) {
      this.startGame(); // 满员自动开局（快速匹配的核心路径）
    }
  }

  onLeave(client: Client, consented: boolean) {
    if (this.state.phase === "waiting") {
      this.state.players.delete(client.sessionId);
      this.joinOrder = [...this.state.players.keys()];
      [...this.state.players.values()].forEach((p, i) => (p.colorIndex = i));
      void consented;
      return;
    }
    // 对局中断线：Task 15 升级为 30 秒重连，这里先直接判负
    this.sim?.forfeit(client.sessionId);
    void consented;
  }

  startGame() {
    // Task 13 实现
    void generateSeed;
  }
}
```

- [ ] **Step 3: 客户端 net.ts（本任务先只要 Client 实例）**

```ts
// packages/client/src/net.ts
import { Client } from "colyseus.js";

export const colyseus = new Client("ws://localhost:2567");
```

- [ ] **Step 4: 验证**

Run: `npm run dev`
Expected: 服务器控制台打印"泡泡堂服务器已启动"且 tsx watch 无编译错误。
浏览器 DevTools console 验证进房与改名：

```js
const { colyseus } = await import("/src/net.ts");
const room = await colyseus.create("game", {});
room.onStateChange(s => console.log("players:", [...s.players.values()].map(p => `${p.name}#${p.colorIndex}`)));
room.send("setName", "测试员");
```

Expected: 打印 `["测试员#0"]`；`room.id` 形如 `_xxxxxxxx`；无报错。
Run: `npm run test`（确认 shared/server 测试无回归）。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(server): 服务器入口与 GameRoom 等待阶段"
```

---

### Task 13: 对局联网 —— 开局、输入、tick 广播（M3 核心）

**Files:**
- Modify: `packages/server/src/rooms/GameRoom.ts`（实现 startGame/tick/dir/bomb 消息/开局锁定/房间号回发）
- Create: `packages/client/src/schema-types.ts`
- Modify: `packages/client/src/render/frame.ts`（追加 `OnlineFrameBuilder`）
- Modify: `packages/client/src/main.ts`（hub + 在线模式入口；移除 `__sim` 调试句柄）

**Interfaces:**
- Consumes: Task 11 的 Schema/syncState、Task 7 的 FrameData/Renderer/runGameLoop
- Produces: 消息协议——客户端→服务器：`dir {dir}`、`bomb`、`start`、`setName {name}`、`code`（房主询问房间号）；服务器→客户端：Schema 状态（15Hz patch）。客户端 `OnlineFrameBuilder`：`constructor(room)` + `frame(dtMs, nowMs): FrameData`（玩家位置指数平滑，时间常数约 90ms）

- [ ] **Step 1: GameRoom 对局逻辑（完整替换 Task 12 版本）**

```ts
// packages/server/src/rooms/GameRoom.ts
import { Room, Client } from "colyseus";
import { GameSim, SUDDEN_DEATH_AT_MS, type DirInput } from "@pt/shared";
import { GameRoomState, PlayerState } from "../state/GameRoomState";
import { syncState, gridToString } from "../state/sync";
import { generateRoomCode, generateSeed } from "./code";

interface JoinOptions { mode?: number }

const DIR_INPUTS = new Set<string>(["up", "down", "left", "right", "none"]);

export class GameRoom extends Room<GameRoomState> {
  maxClients = 4;
  joinOrder: string[] = [];
  private sim: GameSim | undefined;

  onCreate(options: JoinOptions) {
    this.maxClients = options.mode === 2 ? 2 : 4;
    this.setState(new GameRoomState());
    this.setPatchRate(1000 / 15); // 约 15Hz 状态广播
    this.setSimulationInterval(dt => this.tick(dt), 1000 / 60);

    if (options.mode === undefined) {
      // 玩家创建的房间：生成 4 位房间号；房主可询问
      const code = generateRoomCode();
      this.setMetadata({ code, mode: this.maxClients });
      this.onMessage("code", client => {
        if (this.clients[0] === client) client.send("code", code);
      });
    }

    this.onMessage("setName", (client, name: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const s = String(name ?? "").trim().slice(0, 12);
      p.name = s || `玩家${p.colorIndex + 1}`;
    });
    this.onMessage("start", client => {
      if (this.state.phase === "waiting" && this.joinOrder[0] === client.sessionId) {
        this.startGame();
      }
    });
    this.onMessage("dir", (client, data: { dir?: string }) => {
      const dir = data?.dir;
      if (this.sim && typeof dir === "string" && DIR_INPUTS.has(dir)) {
        this.sim.setInput(client.sessionId, dir as DirInput);
      }
    });
    this.onMessage("bomb", client => {
      this.sim?.placeBomb(client.sessionId);
    });
  }

  onJoin(client: Client) {
    if (this.state.phase !== "waiting") {
      throw new Error("对局已开始，无法加入");
    }
    const p = new PlayerState();
    p.id = client.sessionId;
    p.colorIndex = this.joinOrder.length;
    p.name = `玩家${p.colorIndex + 1}`;
    this.joinOrder.push(client.sessionId);
    this.state.players.set(client.sessionId, p);
    if (this.clients.length >= this.maxClients) {
      this.startGame(); // 满员自动开局
    }
  }

  onLeave(client: Client, consented: boolean) {
    if (this.state.phase === "waiting") {
      this.state.players.delete(client.sessionId);
      this.joinOrder = [...this.state.players.keys()];
      [...this.state.players.values()].forEach((p, i) => (p.colorIndex = i));
      void consented;
      return;
    }
    // 对局中断线：Task 15 升级为 30 秒重连，这里先直接判负
    this.sim?.forfeit(client.sessionId);
    void consented;
  }

  startGame() {
    if (this.state.phase !== "waiting" || this.clients.length < 2) return;
    this.sim = new GameSim(generateSeed(), this.joinOrder);
    this.state.grid = gridToString(this.sim.grid);
    this.state.suddenDeathAt = SUDDEN_DEATH_AT_MS;
    this.state.phase = "playing";
    this.state.serverElapsedMs = 0;
    this.lock(); // 开局后不再接受匹配/加入
  }

  private tick(dtMs: number) {
    if (!this.sim || this.state.phase !== "playing") return;
    this.sim.step(Math.min(dtMs, 100));
    syncState(this.state, this.sim);
    // 一次性事件目前仅驱动结算（syncState 已兜底写 phase/winnerIds）；
    // 其余事件（音效广播等）留待后续扩展
    this.sim.drainEvents();
  }
}
```

- [ ] **Step 2: 客户端只读类型 + OnlineFrameBuilder（含指数平滑）**

```ts
// packages/client/src/schema-types.ts
/** 服务器 GameRoomState 的客户端只读视图（与 server/src/state/GameRoomState.ts 字段一一对应） */
export interface PlayerStateView {
  id: string; name: string; colorIndex: number;
  x: number; y: number; moving: boolean;
  bombsMax: number; flameLen: number; speedLevel: number;
  alive: boolean; invincible: boolean; connected: boolean;
}
export interface GameRoomStateView {
  phase: "waiting" | "playing" | "ended";
  grid: string;
  serverElapsedMs: number;
  suddenDeathAt: number;
  players: Map<string, PlayerStateView>;
  bombs: Map<string, { id: string; gx: number; gy: number; power: number; fuse: number; ownerId: string }>;
  flames: Map<string, { id: string; cells: number[]; life: number }>;
  items: Map<string, { id: string; gx: number; gy: number; type: number }>;
  winnerIds: string[];
}
```

`packages/client/src/render/frame.ts` 追加：

```ts
// frame.ts 追加
import type { Room } from "colyseus.js";
import type { GameRoomStateView, PlayerStateView } from "../schema-types";

/** 服务器 Schema → 渲染帧；玩家位置做指数平滑（时间常数 ~90ms，画面连续） */
export class OnlineFrameBuilder {
  private disp = new Map<string, { x: number; y: number }>();
  private cachedGrid = "";
  private gridData: Uint8Array = new Uint8Array(0);

  constructor(private room: Room<GameRoomStateView>) {}

  frame(dtMs: number, nowMs: number): FrameData {
    void nowMs;
    const s = this.room.state;
    if (s.grid !== this.cachedGrid) {
      this.cachedGrid = s.grid;
      this.gridData = parseGrid(s.grid);
    }
    const smoothK = 1 - Math.exp(-dtMs / 90);
    const players: PlayerView[] = [];
    s.players.forEach((p: PlayerStateView, id: string) => {
      let d = this.disp.get(id);
      if (!d) {
        d = { x: p.x, y: p.y };
        this.disp.set(id, d);
      }
      d.x += (p.x - d.x) * smoothK;
      d.y += (p.y - d.y) * smoothK;
      players.push({
        id,
        x: d.x,
        y: d.y,
        colorIndex: p.colorIndex,
        alive: p.alive,
        invincible: p.invincible,
        moving: p.moving,
      });
    });
    for (const id of [...this.disp.keys()]) {
      if (!s.players.has(id)) this.disp.delete(id);
    }
    const bombs: BombView[] = [];
    s.bombs.forEach((b: any) => bombs.push({ id: b.id, gx: b.gx, gy: b.gy, fuse: b.fuse }));
    const flames: FlameView[] = [];
    s.flames.forEach((f: any) => {
      const cells: Vec[] = [];
      for (let i = 0; i + 1 < f.cells.length; i += 2) cells.push({ gx: f.cells[i], gy: f.cells[i + 1] });
      flames.push({ id: f.id, cells, life: f.life });
    });
    const items: ItemView[] = [];
    s.items.forEach((it: any) => items.push({ id: it.id, gx: it.gx, gy: it.gy, type: it.type }));
    return {
      grid: this.gridData,
      players,
      bombs,
      flames,
      items,
      phase: s.phase,
      elapsedMs: s.serverElapsedMs,
      suddenDeathAt: s.suddenDeathAt,
      winnerIds: [...s.winnerIds],
    };
  }
}
```

- [ ] **Step 3: main.ts 增加在线入口（在 Task 7 版本上修改）**

`main.ts` 顶部追加 import，替换 `enterLocalGame()` 调用，并新增：

```ts
// main.ts 追加/修改
import type { Room } from "colyseus.js";
import { colyseus } from "./net";
import { OnlineFrameBuilder } from "./render/frame";

/** 在线对战 */
export async function enterOnlineGame(room: Room<any>) {
  room.send("setName", localStorage.getItem("pt-name") || "无名氏");
  hub.setHandlers({
    onDir: d => room.send("dir", { dir: d }),
    onBomb: () => room.send("bomb"),
  });
  const builder = new OnlineFrameBuilder(room);
  runGameLoop((dt, now) => builder.frame(dt, now), room.sessionId);
}

// Task 14 前的临时入口：URL 带 ?online=1 时创建一个测试房间
const params = new URLSearchParams(location.search);
if (params.get("online")) {
  colyseus.create("game", {}).then(enterOnlineGame).catch(console.error);
} else {
  enterLocalGame();
}
```

同时删除 Task 10 的 `(window as any).__sim = sim;`。

- [ ] **Step 4: 类型检查与多窗口手测**

Run: `npx tsc -p packages/server --noEmit && npx tsc -p packages/client --noEmit`
Expected: 零错误。
Run: `npm run dev`，开两个窗口均访问 `http://localhost:5173/?online=1`
Expected: `create` 走的是"创建房间"分支（maxClients=4、不自动开局），两窗口各自是独立房间的唯一玩家——**这不是对局测试**。真正的对局测试用快速匹配语义：在两窗口 console 分别执行：

```js
const { colyseus } = await import("/src/net.ts");
window.__r = await colyseus.joinOrCreate("game", { mode: 2 });
location.reload(); // 第二个窗口执行后 reload 丢失引用——改为直接不 reload
```

更简单的验收方式：临时把 `?online=1` 分支改为 `colyseus.joinOrCreate("game", { mode: 2 }).then(enterOnlineGame)`，两个窗口打开 `?online=1` → **两窗口自动凑满 2 人立即开局**：同一地图、互相可见、方向键各自控制自己的角色且对方平滑移动、放泡泡可炸死对方 → 双方出现 胜利/失败 结算。验收完把临时分支改回 `create`（Task 14 由大厅 UI 正式接管入口）。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 对局联网（开局/输入/15Hz广播/在线渲染）（M3 核心）"
```

---

### Task 14: 快速匹配 + 房间号 + 大厅 UI（M4）

**Files:**
- Modify: `packages/client/src/net.ts`（补 quickMatch/createRoom/joinByCode）
- Create: `packages/client/src/lobby.ts`
- Modify: `packages/client/src/main.ts`（入口改为大厅；移除 `?online=1` 临时入口）

**Interfaces:**
- Consumes: Task 13 的在线对局与 `code` 消息、Colyseus `joinOrCreate/create/joinById/getAvailableRooms`
- Produces: `quickMatch(mode: 2|4)`、`createRoom(): Promise<{room, code}>`、`joinByCode(code)`、`saveReconnect/tryReconnect`（Task 15 追加）；`initLobby(onEnter, onLocal)`

- [ ] **Step 1: net.ts 补齐（完整替换）**

```ts
// packages/client/src/net.ts
import { Client, type Room } from "colyseus.js";

export const colyseus = new Client("ws://localhost:2567");

export interface RoomMeta { code?: string; mode?: number }

/** 快速匹配：join 选项必须完全一致（只含 mode），昵称进房后 setName */
export function quickMatch(mode: 2 | 4): Promise<Room> {
  return colyseus.joinOrCreate("game", { mode });
}

/** 创建房间；房间号由服务器通过 code 消息回发给房主 */
export async function createRoom(): Promise<{ room: Room; code: string }> {
  const room = await colyseus.create("game", {});
  const code = await new Promise<string>(resolve => {
    const timer = setTimeout(() => resolve(""), 3000);
    room.onMessage("code", (c: string) => {
      clearTimeout(timer);
      resolve(c);
    });
  });
  return { room, code };
}

/** 按房间号查找并加入（开局后房间已 lock，列表中查不到 → 提示房间不存在） */
export async function joinByCode(code: string): Promise<Room> {
  const rooms = await colyseus.getAvailableRooms("game");
  const target = rooms.find(r => (r.metadata as RoomMeta)?.code === code.toUpperCase());
  if (!target) throw new Error("房间不存在或已开局");
  return colyseus.joinById(target.roomId, {});
}
```

- [ ] **Step 2: 大厅 UI**

```ts
// packages/client/src/lobby.ts
import type { Room } from "colyseus.js";
import { quickMatch, createRoom, joinByCode } from "./net";
import type { GameRoomStateView } from "./schema-types";

type GameRoom = Room<GameRoomStateView>;

export function initLobby(onEnter: (room: GameRoom) => void, onLocal: () => void) {
  const lobby = document.getElementById("screen-lobby")!;
  const status = document.getElementById("lobby-status")!;
  const nickname = document.getElementById("nickname") as HTMLInputElement;
  nickname.value = localStorage.getItem("pt-name") || "";
  nickname.addEventListener("change", () => localStorage.setItem("pt-name", nickname.value.trim()));

  const say = (s: string) => (status.textContent = s);
  const guard = (fn: () => Promise<void>) =>
    fn().catch(e => say(`❌ ${e instanceof Error ? e.message : String(e)}`));

  /** 监听房间进入 playing → 进入游戏画面 */
  function watchAndEnter(room: GameRoom) {
    const check = () => {
      if (room.state.phase === "playing") onEnter(room);
    };
    room.onStateChange(check);
    check();
  }

  /** 创建房间后的等待画面：显示玩家列表 + 房主"开始游戏"按钮 */
  function showWaiting(room: GameRoom) {
    lobby.querySelectorAll("button, input").forEach(el => ((el as HTMLElement).style.display = "none"));
    const info = document.createElement("p");
    const startBtn = document.createElement("button");
    startBtn.textContent = "开始游戏";
    startBtn.onclick = () => room.send("start");
    lobby.appendChild(info);
    lobby.appendChild(startBtn);
    const refresh = () => {
      const names: string[] = [];
      room.state.players.forEach(p => names.push(p.name));
      info.textContent = `玩家：${names.join("、")}（${names.length}/${room.state.phase === "waiting" ? 4 : 4}）—— 满员自动开局，也可直接点开始`;
    };
    room.onStateChange(refresh);
    refresh();
  }

  // 单机练习按钮
  const localBtn = document.createElement("button");
  localBtn.textContent = "单机练习";
  localBtn.onclick = onLocal;
  lobby.appendChild(localBtn);

  document.getElementById("btn-quick2")!.onclick = () =>
    guard(async () => {
      say("匹配中…（30 秒没凑齐就创建房间喊朋友吧）");
      watchAndEnter(await quickMatch(2));
    });
  document.getElementById("btn-quick4")!.onclick = () =>
    guard(async () => {
      say("匹配中…");
      watchAndEnter(await quickMatch(4));
    });
  document.getElementById("btn-create")!.onclick = () =>
    guard(async () => {
      say("创建中…");
      const { room, code } = await createRoom();
      say(code ? `房间号 ${code} —— 发给朋友，满员自动开局` : "已创建房间");
      watchAndEnter(room);
      showWaiting(room);
    });
  document.getElementById("btn-join")!.onclick = () =>
    guard(async () => {
      const code = (document.getElementById("room-code") as HTMLInputElement).value.trim();
      if (code.length !== 4) return say("请输入 4 位房间号");
      say("加入中…");
      watchAndEnter(await joinByCode(code));
    });
}
```

- [ ] **Step 3: main.ts 入口改大厅（替换文件末尾入口部分）**

```ts
// main.ts 末尾替换为：
import { initLobby } from "./lobby";

document.getElementById("screen-lobby")!.classList.remove("hidden");
initLobby(enterOnlineGame, () => enterLocalGame());
```

同时删除 `?online=1` 临时入口与相关注释。

- [ ] **Step 4: 手动验收（多窗口联机全流程）**

Run: `npm run dev`，开多个窗口：
1. 窗口 A、B：输入昵称 → 快速匹配 · 2人 → **两窗口自动进入对局**
2. 窗口 C：快速匹配 · 4人 → 显示"匹配中"；窗口 D、E、F 依次加入 → **凑满 4 人自动开局**（四色四角出生）
3. 窗口 G：创建房间 → 显示 4 位房间号；窗口 H 输入房间号加入 → G 点"开始游戏" → 2 人对局
4. 结束一局后点"返回大厅"（整页刷新）可重新匹配
Expected: 各局地图一致、操作跟手、结算正确；无效房间号报"房间不存在或已开局"。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 大厅/快速匹配/房间号（M4）"
```

---

### Task 15: 断线重连与中途退出

**Files:**
- Modify: `packages/server/src/rooms/GameRoom.ts`（onLeave 升级）
- Modify: `packages/client/src/net.ts`（重连令牌）
- Modify: `packages/client/src/main.ts`（进入在线对局时保存令牌；启动时尝试重连）

**Interfaces:**
- Consumes: Colyseus `allowReconnection`（重连保留原 sessionId，sim 的 playerId 不变）、客户端 `client.reconnect(roomId, sessionId)`
- Produces: 对局中断线 30 秒内刷新页面自动回到对局（席位保留）；超时 `forfeit` 判负；主动退出直接判负；`PlayerState.connected=false` 驱动客户端可显示"断线中"（HUD 可选）

- [ ] **Step 1: 服务器 onLeave 升级（替换 onLeave 方法）**

```ts
  async onLeave(client: Client, consented: boolean) {
    const p = this.state.players.get(client.sessionId);
    if (this.state.phase === "waiting") {
      this.state.players.delete(client.sessionId);
      this.joinOrder = [...this.state.players.keys()];
      [...this.state.players.values()].forEach((pl, i) => (pl.colorIndex = i));
      return;
    }
    if (!p || !p.alive) return;
    if (consented) {
      // 主动退出：直接判负
      this.sim?.forfeit(client.sessionId);
      return;
    }
    // 意外断线：保留席位 30 秒
    p.connected = false;
    try {
      await this.allowReconnection(client, 30_000);
      p.connected = true;
    } catch {
      this.sim?.forfeit(client.sessionId); // 超时判负
    }
  }
```

- [ ] **Step 2: 客户端重连令牌**

`net.ts` 追加：

```ts
// net.ts 追加
export function saveReconnect(room: Room) {
  sessionStorage.setItem("pt-rejoin", JSON.stringify({ roomId: room.roomId, sessionId: room.sessionId }));
  room.onLeave.once(() => sessionStorage.removeItem("pt-rejoin"));
}

export async function tryReconnect(): Promise<Room | null> {
  const raw = sessionStorage.getItem("pt-rejoin");
  if (!raw) return null;
  try {
    const { roomId, sessionId } = JSON.parse(raw);
    return await colyseus.reconnect(roomId, sessionId);
  } catch {
    sessionStorage.removeItem("pt-rejoin");
    return null;
  }
}
```

`main.ts`：`enterOnlineGame` 开头加 `saveReconnect(room)`；文件末尾入口改为：

```ts
import { initLobby } from "./lobby";
import { tryReconnect } from "./net";

tryReconnect().then(room => {
  if (room) {
    enterOnlineGame(room);
  } else {
    document.getElementById("screen-lobby")!.classList.remove("hidden");
    initLobby(enterOnlineGame, () => enterLocalGame());
  }
});
```

- [ ] **Step 3: 手动验收**

Run: 两窗口 2 人快速匹配对战中，刷新其中一窗
Expected: 该窗自动重连回对局（同色、同位置、可继续操作）；另一窗看到该玩家 `connected=false`。刷新的窗口关掉不回来 → 30 秒后对方收到结算胜利。Esc 主动离开（关闭标签页视为 consented？——关闭标签页通常触发非 consented 断线，也会走 30 秒重连；这是预期行为，可接受）。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: 断线重连与中途退出判负"
```

---

### Task 16: 音效与视觉打磨（M5）

**Files:**
- Create: `packages/client/src/sfx.ts`
- Modify: `packages/client/src/main.ts`（runGameLoop 内接差量音效）

**Interfaces:**
- Produces: `sfx.play(name)`，name ∈ `bomb | explode | pickup | die | win | lose`；WebAudio 合成，无外部资源。音效触发用帧差量检测（两种模式共用）：泡白数增加→bomb、火焰数增加→explode、道具数减少→pickup、有玩家从存活变死亡→die

- [ ] **Step 1: sfx.ts（WebAudio 合成音效）**

```ts
// packages/client/src/sfx.ts
type SfxName = "bomb" | "explode" | "pickup" | "die" | "win" | "lose";

let ctx: AudioContext | null = null;
function audio(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function beep(freq: number, dur: number, type: OscillatorType, gain = 0.15, slideTo?: number) {
  const a = audio();
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, a.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  osc.connect(g).connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + dur);
}

export const sfx = {
  play(name: SfxName) {
    try {
      switch (name) {
        case "bomb": beep(300, 0.12, "square", 0.12, 180); break;
        case "explode": beep(80, 0.4, "sawtooth", 0.25, 40); break;
        case "pickup": beep(660, 0.09, "triangle", 0.18, 880); break;
        case "die": beep(400, 0.5, "square", 0.2, 60); break;
        case "win": beep(523, 0.15, "triangle"); setTimeout(() => beep(659, 0.3, "triangle"), 150); break;
        case "lose": beep(220, 0.4, "sawtooth", 0.2, 110); break;
      }
    } catch {
      /* 音频不可用则静默 */
    }
  },
};
```

- [ ] **Step 2: runGameLoop 接差量音效**

`main.ts` 的 `runGameLoop`：`import { sfx } from "./sfx";`；循环内变量区追加 `let prevBombs = 0, prevFlames = 0, prevItems = 0;`；在幽灵检测之后、`renderer.draw` 之前插入：

```ts
    // 差量音效
    if (f.bombs.length > prevBombs) sfx.play("bomb");
    if (f.flames.length > prevFlames) sfx.play("explode");
    if (f.items.length < prevItems) sfx.play("pickup");
    if (aliveNow.size < prevAlive.size) sfx.play("die");
    prevBombs = f.bombs.length;
    prevFlames = f.flames.length;
    prevItems = f.items.length;
```

（注意放在 `prevAlive = aliveNow;` 赋值之前，用旧的 prevAlive 比较。）结算 overlay 出现处追加 `sfx.play(win ? "win" : "lose");`（平局也用 lose 或免音效）。

- [ ] **Step 3: 视觉增强（可选）**

若想要素材包：到 https://kenney.nl/assets 下载免费（CC0）像素包，图片放 `packages/client/public/assets/`，在 `renderer.ts` 用 `new Image()` 预加载后 `drawImage` 替换对应 drawXXX。不做也不影响验收——当前纯 Canvas 绘制已可用。

- [ ] **Step 4: 手动验收 + 全量测试**

Run: `npm run dev` + `npm run test`
Expected: 放泡/爆炸/拾取/死亡/胜负各有音效；连续对局无异常；全部单元测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(client): 合成音效与视觉打磨（M5）"
```

---

### Task 17: README 与最终验收清单

**Files:**
- Create: `README.md`

- [ ] **Step 1: 写 README**

````markdown
# 泡泡堂（多人在线小游戏）

经典炸弹人玩法：炸墙、捡道具、炸对手，最后存活者获胜。支持 2 人/4 人快速匹配与房间号邀请。

## 本地运行

```bash
npm install
npm run dev      # 同时启动服务器(ws://localhost:2567)与客户端(http://localhost:5173)
```

打开 http://localhost:5173 —— 多开几个浏览器窗口即可联机对局。

## 测试

```bash
npm test         # 规则引擎与状态同步单元测试
```

## 操作

方向键 / WASD 移动，空格放泡泡。道具：泡=多放一个泡泡，火=火焰加长，速=移动加速。
开局 3 分钟后进入突然死亡：硬墙从外圈向内合拢。

## 架构

- `packages/shared` 无头规则引擎 GameSim（单机模式跑在浏览器，联机模式跑在服务器，同一份代码）
- `packages/server` Colyseus 权威服务器，60Hz 模拟 / 15Hz 状态同步
- `packages/client` Vite + Canvas 2D，指数平滑插值渲染

## 部署（后续）

服务器是独立 Node 进程：`npx tsx packages/server/src/index.ts`；
客户端 `npm run build -w packages/client` 后任意静态托管；
`net.ts` 里把 ws 地址换成服务器地址即可。
````

- [ ] **Step 2: 最终验收清单（逐项人工过一遍）**

- [ ] `npm test` 全绿
- [ ] 4 窗口 4 人匹配：满员自动开局，四色四角出生
- [ ] 泡泡 2.5s 爆炸、连锁引爆、软墙掉三色道具、拾取生效
- [ ] 出生无敌闪烁 2 秒；被炸死有幽灵渐隐与音效
- [ ] 两人对局一死即结算；同时死显示平局
- [ ] 房间号创建/加入；房主可不满员开局
- [ ] 对战中刷新页面 30 秒内自动重连回原对局
- [ ] 3 分钟不动 → 突然死亡硬墙合拢
- [ ] DevTools 全程无未捕获报错

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: README 与验收清单"
```

---

## 任务依赖图

```
T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10
                                   │
                                   └→ T11 → T12 → T13 → T14 → T15 → T16 → T17
```

（T11 起为服务器线，依赖 T9 的 GameSim 完整接口；T10 客户端验收与 T11 相互独立可并行。）
