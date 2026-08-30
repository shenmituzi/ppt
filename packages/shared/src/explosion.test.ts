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

  it("贴近边界时被硬墙截断", () => {
    const g = emptyGrid();
    g[idx(0, 1)] = Tile.HardWall; // 模拟真实地图的左边墙
    g[idx(1, 0)] = Tile.HardWall; // 上边墙
    const cells = computeFlame(g, 1, 1, 3).map(key);
    expect(cells).toContain("4,1");
    expect(cells).toContain("1,4");
    expect(cells).not.toContain("0,1");
    expect(cells).not.toContain("1,0");
  });
});
