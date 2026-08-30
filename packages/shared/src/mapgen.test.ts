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
    const forced = [[3, 1], [1, 3], [11, 1], [13, 3], [1, 9], [3, 11], [11, 11], [13, 9]];
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
