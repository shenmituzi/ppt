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
