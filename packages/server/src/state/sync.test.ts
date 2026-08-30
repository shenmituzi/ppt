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

    // 泡泡爆炸后从状态里删除，火焰出现（在 0.5s 火焰寿命内断言）
    for (let i = 0; i < 20; i++) sim.step(100);
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
