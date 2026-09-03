import { describe, it, expect } from "vitest";
import { GRID_W, GRID_H, Tile, SPAWNS, isSoft } from "./constants";
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
    const forced = [[3, 1], [1, 3], [13, 1], [15, 3], [1, 11], [3, 13], [13, 13], [15, 11]];
    for (const [gx, gy] of forced) expect(grid[idx(gx, gy)]).toBe(Tile.Floor);
  });

  it("软墙密度在合理区间（含石头/水晶/冰块等可炸方块）", () => {
    const { grid } = generateMap(123);
    let soft = 0, total = 0;
    for (let gy = 1; gy < GRID_H - 1; gy++)
      for (let gx = 1; gx < GRID_W - 1; gx++) {
        const t = grid[idx(gx, gy)];
        if (t === Tile.HardWall) continue;
        total++;
        if (isSoft(t)) soft++;
      }
    expect(soft / total).toBeGreaterThan(0.4);
    expect(soft / total).toBeLessThan(0.95);
  });

  it("天气群落：暴雪地图的可炸方块没有木箱（冰/水晶/石头）", () => {
    const { grid } = generateMap(9, "snow");
    for (let gy = 1; gy < GRID_H - 1; gy++)
      for (let gx = 1; gx < GRID_W - 1; gx++) {
        const t = grid[idx(gx, gy)];
        if (!isSoft(t)) continue;
        expect(t === Tile.Ice || t === Tile.Crystal || t === Tile.Rock).toBe(true);
      }
  });

  it("同种子同天气结果一致，不同天气外观不同", () => {
    expect([...generateMap(5, "rain").grid]).toEqual([...generateMap(5, "rain").grid]);
    // 两张图至少存在一处可炸方块外观差异（统计意义上必然）
    const a = generateMap(5, "rain").grid;
    const b = generateMap(5, "snow").grid;
    const diff = a.some((t, i) => isSoft(t) && isSoft(b[i]) && t !== b[i]);
    expect(diff).toBe(true);
  });

  it("阳光花园是确定性的，并包含边界、安全区与藤蔓区域", () => {
    const a = generateMap(77, "sunny", "garden");
    const b = generateMap(77, "sunny", "garden");
    expect([...a.grid]).toEqual([...b.grid]);
    expect(a.mapId).toBe("garden");
    expect(a.vineCells.length).toBeGreaterThan(8);
    expect(a.vineCells.length).toBeLessThan(100);
    for (const s of SPAWNS) {
      expect(a.grid[idx(s.gx, s.gy)]).toBe(Tile.Floor);
      expect(a.grid[idx(s.gx + 1, s.gy)]).not.toBe(Tile.HardWall);
    }
    for (let x = 0; x < GRID_W; x++) expect(a.grid[idx(x, 0)]).toBe(Tile.HardWall);
  });
});
