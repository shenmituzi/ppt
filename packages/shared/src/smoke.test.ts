import { describe, it, expect } from "vitest";
import { GRID_W, GRID_H, TILE, BOMB_FUSE_MS, SPEED_LEVELS, Tile, ItemType, SPAWNS } from "./index";

describe("常量", () => {
  it("关键数值与设计文档一致", () => {
    expect(GRID_W).toBe(17);
    expect(GRID_H).toBe(15);
    expect(TILE).toBe(64);
    expect(BOMB_FUSE_MS).toBe(2500);
    expect(SPEED_LEVELS[0]).toBe(4);
    expect(Tile.HardWall).toBe(1);
    expect(ItemType.Flame).toBe(1);
    expect(SPAWNS).toHaveLength(4);
  });
});
