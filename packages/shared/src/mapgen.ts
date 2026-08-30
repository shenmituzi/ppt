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
