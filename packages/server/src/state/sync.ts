import { GameSim } from "@pt/shared";
import {
  GameRoomState, PlayerState, BombState, FlameState, ItemState,
} from "./GameRoomState";

export function gridToString(grid: Uint8Array): string {
  let s = "";
  for (let i = 0; i < grid.length; i++) s += String.fromCharCode(48 + grid[i]);
  return s;
}

/** 把 GameSim 的当前状态逐字段拷进 Schema；Map 做差量增删 */
export function syncState(state: GameRoomState, sim: GameSim): void {
  state.serverElapsedMs = Math.floor(sim.elapsedMs);

  for (const [id, p] of sim.players) {
    let ps = state.players.get(id);
    if (!ps) {
      ps = new PlayerState();
      ps.id = id;
      state.players.set(id, ps);
    }
    ps.x = p.x;
    ps.y = p.y;
    ps.moving = p.dir !== null;
    ps.bombsMax = p.bombsMax;
    ps.flameLen = p.flameLen;
    ps.speedLevel = p.speedLevel;
    ps.alive = p.alive;
    ps.invincible = sim.elapsedMs < p.invincibleUntil;
    ps.bootsOn = p.bootsOn;
    ps.rodOn = p.rodOn;
    ps.lanternOn = p.lanternOn;
  }

  const bombIds = new Set<string>();
  for (const b of sim.bombs) {
    const key = String(b.id);
    bombIds.add(key);
    let bs = state.bombs.get(key);
    if (!bs) {
      bs = new BombState();
      bs.id = key;
      bs.gx = b.gx;
      bs.gy = b.gy;
      bs.ownerId = b.ownerId;
      state.bombs.set(key, bs);
    }
    bs.power = b.power;
    bs.fuse = Math.max(0, b.explodeAt - sim.elapsedMs);
  }
  for (const key of [...state.bombs.keys()]) {
    if (!bombIds.has(key)) state.bombs.delete(key);
  }

  const flameIds = new Set<string>();
  for (const e of sim.explosions) {
    const key = String(e.id);
    flameIds.add(key);
    let fs = state.flames.get(key);
    if (!fs) {
      fs = new FlameState();
      fs.id = key;
      state.flames.set(key, fs);
    }
    fs.life = Math.max(0, e.expireAt - sim.elapsedMs);
    const flat: number[] = [];
    for (const c of e.cells) flat.push(c.gx, c.gy);
    if (fs.cells.length !== flat.length) fs.cells.splice(0, fs.cells.length, ...flat);
  }
  for (const key of [...state.flames.keys()]) {
    if (!flameIds.has(key)) state.flames.delete(key);
  }

  const itemIds = new Set<string>();
  for (const it of sim.items.values()) {
    const key = String(it.id);
    itemIds.add(key);
    let is = state.items.get(key);
    if (!is) {
      is = new ItemState();
      is.id = key;
      is.gx = it.gx;
      is.gy = it.gy;
      is.type = it.type;
      state.items.set(key, is);
    }
  }
  for (const key of [...state.items.keys()]) {
    if (!itemIds.has(key)) state.items.delete(key);
  }

  // 结算兜底：ended 由 checkEnd 产生，这里把结果写进 Schema
  if (sim.phase === "ended" && state.phase !== "ended") {
    state.phase = "ended";
    state.winnerIds.splice(0, state.winnerIds.length, ...sim.winnerIds);
  }
}
