import { FLAME_MS, GameSim, GRID_H, GRID_W, ItemType, SUDDEN_DEATH_AT_MS, Vec } from "@pt/shared";

export interface PlayerView {
  id: string;
  x: number;
  y: number;
  colorIndex: number;
  alive: boolean;
  invincible: boolean;
  moving: boolean;
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
