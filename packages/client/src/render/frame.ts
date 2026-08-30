import { FLAME_MS, GameSim, GRID_H, GRID_W, ItemType, SUDDEN_DEATH_AT_MS, Vec } from "@pt/shared";

export interface PlayerView {
  id: string;
  x: number;
  y: number;
  colorIndex: number;
  alive: boolean;
  invincible: boolean;
  moving: boolean;
  /** 昵称（联网模式提供，渲染在头顶） */
  name?: string;
  /** 天气专属道具状态 */
  bootsOn?: boolean;
  rodOn?: boolean;
  lanternOn?: boolean;
  /** 装备档位（状态栏展示，可随损耗下降） */
  bombsMax?: number;
  flameLen?: number;
  speedLevel?: number;
  lives?: number;
  weapon?: string;
  mounted?: boolean;
  trapped?: boolean;
}
export interface BulletView { id: string; x: number; y: number; dx: number; dy: number }
export interface PortalPairView { id: string; ax: number; ay: number; bx: number; by: number; remainingMs: number }
export interface BeamView { cells: Vec[]; at: number }

export interface BombView { id: string; gx: number; gy: number; fuse: number }
export interface FlameView { id: string; cells: Vec[]; life: number }
export interface ItemView { id: string; gx: number; gy: number; type: ItemType }
export interface WarnView { gx: number; gy: number; strikeAt: number }
export interface StrikeView { gx: number; gy: number; at: number }

export interface MonsterView {
  id: string; x: number; y: number;
  hp: number; maxHp: number; level: number; state: string;
}
export interface HouseView {
  id: string; gx: number; gy: number;
  hp: number; maxHp: number; destroyed: boolean;
}

export interface FrameData {
  grid: Uint8Array;
  players: PlayerView[];
  bombs: BombView[];
  flames: FlameView[];
  items: ItemView[];
  warnings: WarnView[];
  strikes: StrikeView[];
  monsters: MonsterView[];
  houses: HouseView[];
  bullets: BulletView[];
  portals: PortalPairView[];
  beams: BeamView[];
  /** 全屏闪电白闪强度 0~1 */
  flash: number;
  weather: string;
  phase: Phase;
  gameType: string;
  elapsedMs: number;
  gatherEndsAt: number;
  suddenDeathAt: number;
  winnerIds: string[];
}
type Phase = "waiting" | "gathering" | "playing" | "ended";

/** 单机模式：直接从 GameSim 构造渲染帧 */
export function simToFrame(sim: GameSim): FrameData {
  return {
    grid: sim.grid,
    players: [...sim.players.values()].map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      colorIndex: p.spawnIndex,
      alive: p.alive,
      invincible: sim.elapsedMs < p.invincibleUntil,
      moving: p.dir !== null,
      bootsOn: p.bootsOn,
      rodOn: p.rodOn,
      lanternOn: p.lanternOn,
      bombsMax: p.bombsMax,
      flameLen: p.flameLen,
      speedLevel: p.speedLevel,
      lives: p.lives,
      weapon: p.weapon,
      mounted: p.mounted,
      trapped: sim.elapsedMs < p.trappedUntil,
    })),
    bombs: sim.bombs.map(b => ({
      id: String(b.id), gx: b.gx, gy: b.gy, fuse: Math.max(0, b.explodeAt - sim.elapsedMs),
    })),
    flames: sim.explosions.map(e => ({
      id: String(e.id), cells: e.cells, life: Math.max(0, e.expireAt - sim.elapsedMs),
    })),
    items: [...sim.items.values()].map(it => ({ id: String(it.id), gx: it.gx, gy: it.gy, type: it.type })),
    warnings: [],
    strikes: [],
    bullets: sim.bullets.map(b => ({ id: String(b.id), x: b.x, y: b.y, dx: b.dx, dy: b.dy })),
    portals: sim.portalPairs.map(pp => ({
      id: String(pp.id), ax: pp.ax, ay: pp.ay, bx: pp.bx, by: pp.by,
      remainingMs: Math.max(0, pp.until - sim.elapsedMs),
    })),
    beams: [],
    flash: 0,
    weather: sim.weather,
    phase: sim.phase,
    gameType: sim.gameType,
    monsters: sim.monsters.map(m => ({
      id: String(m.id), x: m.x, y: m.y,
      hp: m.hp, maxHp: m.maxHp, level: m.level, state: m.state,
    })),
    houses: sim.houses.map(h => ({
      id: String(h.id), gx: h.gx, gy: h.gy,
      hp: h.hp, maxHp: h.maxHp, destroyed: h.destroyed,
    })),
    elapsedMs: sim.elapsedMs,
    gatherEndsAt: sim.gatherEndsAt,
    suddenDeathAt: SUDDEN_DEATH_AT_MS,
    winnerIds: sim.winnerIds,
  };
}

/** "012" 字符串 → Uint8Array（联网模式解析服务器地图） */
export function parseGrid(s: string): Uint8Array {
  const g = new Uint8Array(GRID_W * GRID_H);
  for (let i = 0; i < s.length && i < g.length; i++) g[i] = s.charCodeAt(i) - 48;
  return g;
}

// ---------- 联网模式 ----------

import type { Room } from "colyseus.js";
import type { GameRoomStateView, PlayerStateView } from "../schema-types";

/** 服务器 Schema → 渲染帧；玩家位置做指数平滑（时间常数 ~90ms，画面连续） */
export class OnlineFrameBuilder {
  private disp = new Map<string, { x: number; y: number }>();
  private cachedGrid = "";
  private gridData: Uint8Array = new Uint8Array(0);
  private warns: (WarnView & { receivedAt: number })[] = [];
  private strikes: StrikeView[] = [];
  private flashUntil = 0;
  private beams: BeamView[] = [];
  addBeam(cells: Vec[]) {
    this.beams.push({ cells, at: performance.now() });
  }

  constructor(private room: Room<GameRoomStateView>) {}

  /** 雷电警示（服务器消息） */
  addWarn(w: WarnView) {
    this.warns.push({ ...w, receivedAt: performance.now() });
  }
  /** 落雷（服务器消息）：记录 300ms 特效窗口并触发全屏白闪 */
  addStrike(s: { gx: number; gy: number }) {
    this.strikes.push({ gx: s.gx, gy: s.gy, at: performance.now() });
    this.flashUntil = performance.now() + 220;
  }

  frame(dtMs: number, nowMs: number): FrameData {
    void nowMs;
    const s = this.room.state;
    if (s.grid !== this.cachedGrid) {
      this.cachedGrid = s.grid;
      this.gridData = parseGrid(s.grid);
    }
    const smoothK = 1 - Math.exp(-dtMs / 90);
    const players: PlayerView[] = [];
    s.players.forEach((p: PlayerStateView, id: string) => {
      let d = this.disp.get(id);
      if (!d) {
        d = { x: p.x, y: p.y };
        this.disp.set(id, d);
      }
      d.x += (p.x - d.x) * smoothK;
      d.y += (p.y - d.y) * smoothK;
      players.push({
        id,
        x: d.x,
        y: d.y,
        colorIndex: p.colorIndex,
        alive: p.alive,
        invincible: p.invincible,
        moving: p.moving,
        name: p.name,
        bootsOn: p.bootsOn,
        rodOn: p.rodOn,
        lanternOn: p.lanternOn,
        bombsMax: p.bombsMax,
        flameLen: p.flameLen,
        speedLevel: p.speedLevel,
        lives: p.lives,
        weapon: p.weapon,
        mounted: p.mounted,
        trapped: p.trapped,
      });
    });
    for (const id of [...this.disp.keys()]) {
      if (!s.players.has(id)) this.disp.delete(id);
    }
    const bombs: BombView[] = [];
    s.bombs.forEach((b: any) => bombs.push({ id: b.id, gx: b.gx, gy: b.gy, fuse: b.fuse }));
    const flames: FlameView[] = [];
    s.flames.forEach((f: any) => {
      const cells: Vec[] = [];
      for (let i = 0; i + 1 < f.cells.length; i += 2) cells.push({ gx: f.cells[i], gy: f.cells[i + 1] });
      flames.push({ id: f.id, cells, life: f.life });
    });
    const items: ItemView[] = [];
    s.items.forEach((it: any) => items.push({ id: it.id, gx: it.gx, gy: it.gy, type: it.type }));
    const monsters: MonsterView[] = [];
    s.monsters.forEach((m: any) => monsters.push({
      id: m.id, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp, level: m.level, state: m.state,
    }));
    const bullets: BulletView[] = [];
    s.bullets.forEach((bl: any) => bullets.push({ id: bl.id, x: bl.x, y: bl.y, dx: bl.dx, dy: bl.dy }));
    const portals: PortalPairView[] = [];
    s.portals.forEach((pp: any) => portals.push({
      id: pp.id, ax: pp.ax, ay: pp.ay, bx: pp.bx, by: pp.by, remainingMs: pp.remainingMs,
    }));
    const houses: HouseView[] = [];
    s.houses.forEach((h: any) => houses.push({
      id: h.id, gx: h.gx, gy: h.gy, hp: h.hp, maxHp: h.maxHp, destroyed: h.destroyed,
    }));
    return {
      grid: this.gridData,
      players,
      bombs,
      flames,
      items,
      monsters,
      houses,
      bullets,
      portals,
      beams: this.beams.filter(bm => nowMs - bm.at < 260),
      warnings: this.warns.filter(w => s.serverElapsedMs < w.strikeAt + 500),
      strikes: this.strikes.filter(st => nowMs - st.at < 300),
      flash: nowMs < this.flashUntil ? (this.flashUntil - nowMs) / 220 : 0,
      weather: s.weather,
      phase: s.phase,
      gameType: s.gameType,
      elapsedMs: s.serverElapsedMs,
      gatherEndsAt: s.gatherEndsAt,
      suddenDeathAt: s.suddenDeathAt,
      winnerIds: [...s.winnerIds],
    };
  }
}

void FLAME_MS;
