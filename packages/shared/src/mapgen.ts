import { GRID_W, GRID_H, Tile, SOFT_WALL_RATIO, SPAWNS, type WeatherType, type MapId } from "./constants";
import { Vec } from "./types";

export interface GameMap {
  grid: Uint8Array;
  spawns: Vec[];
  mapId: MapId;
  vineCells: number[];
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

/** 各天气的可炸方块外观分布：[木箱, 石头, 水晶, 冰块] 权重 */
const BIOME: Record<WeatherType, [number, number, number, number]> = {
  sunny: [0.6, 0.4, 0, 0], // 木箱 + 石头
  rain: [0.25, 0.75, 0, 0], // 以石头为主
  snow: [0, 0.2, 0.3, 0.5], // 冰块 + 水晶
  fog: [0, 0.35, 0.65, 0], // 暗水晶为主
};

function pickDestructible(weather: WeatherType, rng: () => number): Tile {
  const [w, r, c, i] = BIOME[weather];
  const roll = rng();
  if (roll < w) return Tile.SoftWall;
  if (roll < w + r) return Tile.Rock;
  if (roll < w + r + c) return Tile.Crystal;
  return Tile.Ice;
}

/**
 * 生成 15×13 地图：外圈硬墙 + 棋盘格石柱 + 成簇分布的可炸方块（按天气着外观）。
 * 四角出生点 3×3 安全区无障碍，且朝地图中心方向各让出一格通路。
 */
export function generateMap(seed: number, weather: WeatherType = "sunny", mapId: MapId = "classic"): GameMap {
  if (mapId === "garden") {
    const base = generateMap(seed, weather, "classic");
    const grid = base.grid.slice(); const vines: number[] = [];
    const idx = (x: number, y: number) => y * GRID_W + x;
    const safe = (x: number, y: number) => SPAWNS.some(s => Math.abs(x - s.gx) <= 2 && Math.abs(y - s.gy) <= 2);
    for (let y = 1; y < GRID_H - 1; y++) for (let x = 1; x < GRID_W - 1; x++) {
      const i = idx(x, y); if (safe(x, y) || grid[i] === Tile.HardWall) continue;
      if (x >= 7 && x <= 8) grid[i] = (x + y) % 2 ? Tile.Rock : Tile.Ice;
      else if (grid[i] >= Tile.SoftWall && (x < 7 || y >= 9)) vines.push(i);
    }
    return { grid, spawns: base.spawns, mapId: "garden", vineCells: vines };
  }
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
    SPAWNS.some(s => Math.abs(gx - s.gx) <= 2 && Math.abs(gy - s.gy) <= 2);

  const cx = (GRID_W - 1) / 2;
  const cy = (GRID_H - 1) / 2;
  const forcedOpen = new Set<number>();
  for (const s of SPAWNS) {
    forcedOpen.add(idx(s.gx + Math.sign(cx - s.gx) * 2, s.gy));
    forcedOpen.add(idx(s.gx, s.gy + Math.sign(cy - s.gy) * 2));
  }

  // 1) 随机撒软墙（布尔掩码）
  const soft: boolean[][] = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(false));
  for (let gy = 1; gy < GRID_H - 1; gy++) {
    for (let gx = 1; gx < GRID_W - 1; gx++) {
      const i = idx(gx, gy);
      if (grid[i] !== Tile.Floor) continue;
      if (inSafeZone(gx, gy) || forcedOpen.has(i)) continue;
      soft[gy][gx] = rng() < SOFT_WALL_RATIO;
    }
  }

  // 2) 两次元胞平滑：让方块成簇、地形自然（而不是均匀散布的方格感）
  for (let pass = 0; pass < 2; pass++) {
    const next = soft.map(r => [...r]);
    for (let gy = 1; gy < GRID_H - 1; gy++) {
      for (let gx = 1; gx < GRID_W - 1; gx++) {
        const i = idx(gx, gy);
        if (grid[i] !== Tile.Floor) continue;
        if (inSafeZone(gx, gy) || forcedOpen.has(i)) continue;
        let n = 0;
        if (soft[gy - 1][gx]) n++;
        if (soft[gy + 1][gx]) n++;
        if (soft[gy][gx - 1]) n++;
        if (soft[gy][gx + 1]) n++;
        next[gy][gx] = n >= 3 ? true : n === 0 ? false : soft[gy][gx];
      }
    }
    for (let gy = 0; gy < GRID_H; gy++) soft[gy] = [...next[gy]];
  }

  // 3) 按天气外观落方块
  for (let gy = 1; gy < GRID_H - 1; gy++) {
    for (let gx = 1; gx < GRID_W - 1; gx++) {
      const i = idx(gx, gy);
      if (grid[i] !== Tile.Floor) continue;
      if (inSafeZone(gx, gy) || forcedOpen.has(i)) continue;
      if (soft[gy][gx]) grid[i] = pickDestructible(weather, rng);
    }
  }

  return { grid, spawns: SPAWNS.map(s => ({ ...s })), mapId: "classic", vineCells: [] };
}
