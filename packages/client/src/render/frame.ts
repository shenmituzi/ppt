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
}

export interface BombView { id: string; gx: number; gy: number; fuse: number }
export interface FlameView { id: string; cells: Vec[]; life: number }
export interface ItemView { id: string; gx: number; gy: number; type: ItemType }

export interface FrameData {
  grid: Uint8Array;
  players: PlayerView[];
  bombs: BombView[];
  flames: FlameView[];
  items: ItemView[];
  phase: "waiting" | "playing" | "ended";
  elapsedMs: number;
  suddenDeathAt: number;
  winnerIds: string[];
}

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
    })),
    bombs: sim.bombs.map(b => ({
      id: String(b.id), gx: b.gx, gy: b.gy, fuse: Math.max(0, b.explodeAt - sim.elapsedMs),
    })),
    flames: sim.explosions.map(e => ({
      id: String(e.id), cells: e.cells, life: Math.max(0, e.expireAt - sim.elapsedMs),
    })),
    items: [...sim.items.values()].map(it => ({ id: String(it.id), gx: it.gx, gy: it.gy, type: it.type })),
    phase: sim.phase,
    elapsedMs: sim.elapsedMs,
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

void FLAME_MS;

// ---------- 联网模式 ----------

import type { Room } from "colyseus.js";
import type { GameRoomStateView, PlayerStateView } from "../schema-types";

/** 服务器 Schema → 渲染帧；玩家位置做指数平滑（时间常数 ~90ms，画面连续） */
export class OnlineFrameBuilder {
  private disp = new Map<string, { x: number; y: number }>();
  private cachedGrid = "";
  private gridData: Uint8Array = new Uint8Array(0);

  constructor(private room: Room<GameRoomStateView>) {}

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
    return {
      grid: this.gridData,
      players,
      bombs,
      flames,
      items,
      phase: s.phase,
      elapsedMs: s.serverElapsedMs,
      suddenDeathAt: s.suddenDeathAt,
      winnerIds: [...s.winnerIds],
    };
  }
}
