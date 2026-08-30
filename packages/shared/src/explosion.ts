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
