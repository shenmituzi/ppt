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
