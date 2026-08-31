import { GameSim } from "@pt/shared";
import {
  GameRoomState, PlayerState, BombState, FlameState, ItemState,
  MonsterState, HouseState, BulletState, PortalState, DeviceState,
} from "./GameRoomState";

export function gridToString(grid: Uint8Array): string {
  let s = "";
  for (let i = 0; i < grid.length; i++) s += String.fromCharCode(48 + grid[i]);
  return s;
}

/** 把 GameSim 的当前状态逐字段拷进 Schema；Map 做差量增删 */
export function syncState(state: GameRoomState, sim: GameSim): void {
  state.serverElapsedMs = Math.floor(sim.elapsedMs);
  state.phase = sim.phase;
  state.gameType = sim.gameType;
  state.grid = gridToString(sim.grid);

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
    ps.lives = p.lives;
    ps.weapon = p.weapon;
    ps.mounted = p.mounted;
    ps.trapped = sim.elapsedMs < p.trappedUntil;
    ps.sun = p.sun;
    ps.mushroomLv = p.mushroomLv;
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

  // 冒险模式：怪物与房屋
  const monsterIds = new Set<string>();
  for (const m of sim.monsters) {
    const key = String(m.id);
    monsterIds.add(key);
    let ms = state.monsters.get(key);
    if (!ms) {
      ms = new MonsterState();
      ms.id = key;
      state.monsters.set(key, ms);
    }
    ms.x = m.x;
    ms.y = m.y;
    ms.hp = Math.max(0, m.hp);
    ms.maxHp = m.maxHp;
    ms.level = m.level;
    ms.state = m.state;
  }
  for (const key of [...state.monsters.keys()]) {
    if (!monsterIds.has(key)) state.monsters.delete(key);
  }
  const bulletIds = new Set<string>();
  for (const bl of sim.bullets) {
    const key = String(bl.id);
    bulletIds.add(key);
    let bs = state.bullets.get(key);
    if (!bs) {
      bs = new BulletState();
      bs.id = key;
      state.bullets.set(key, bs);
    }
    bs.x = bl.x;
    bs.y = bl.y;
  }
  for (const key of [...state.bullets.keys()]) {
    if (!bulletIds.has(key)) state.bullets.delete(key);
  }
  const portalIds = new Set<string>();
  for (const pp of sim.portalPairs) {
    const key = String(pp.id);
    portalIds.add(key);
    let ps = state.portals.get(key);
    if (!ps) {
      ps = new PortalState();
      ps.id = key;
      ps.ax = pp.ax; ps.ay = pp.ay;
      ps.bx = pp.bx; ps.by = pp.by;
      state.portals.set(key, ps);
    }
    ps.remainingMs = Math.max(0, Math.min(65_535, pp.until - sim.elapsedMs));
  }
  for (const key of [...state.portals.keys()]) {
    if (!portalIds.has(key)) state.portals.delete(key);
  }
  const deviceIds = new Set<string>();
  for (const d of sim.devices) {
    const key = String(d.id);
    deviceIds.add(key);
    let ds = state.devices.get(key);
    if (!ds) {
      ds = new DeviceState();
      ds.id = key;
      ds.type = d.type;
      ds.gx = d.gx;
      ds.gy = d.gy;
      state.devices.set(key, ds);
    }
  }
  for (const key of [...state.devices.keys()]) {
    if (!deviceIds.has(key)) state.devices.delete(key);
  }
  const houseIds = new Set<string>();
  for (const h of sim.houses) {
    const key = String(h.id);
    houseIds.add(key);
    let hs = state.houses.get(key);
    if (!hs) {
      hs = new HouseState();
      hs.id = key;
      hs.gx = h.gx;
      hs.gy = h.gy;
      hs.maxHp = h.maxHp;
      state.houses.set(key, hs);
    }
    hs.hp = Math.max(0, h.hp);
    hs.destroyed = h.destroyed;
  }
  for (const key of [...state.houses.keys()]) {
    if (!houseIds.has(key)) state.houses.delete(key);
  }

  // 结算：ended 时写入胜者
  if (sim.phase === "ended") {
    state.phase = "ended";
    state.winnerIds.splice(0, state.winnerIds.length, ...sim.winnerIds);
  }
}
