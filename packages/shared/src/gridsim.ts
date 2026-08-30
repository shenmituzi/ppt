import {
  GRID_W, GRID_H, BOMB_FUSE_MS, FLAME_MS, SPAWN_INVINCIBLE_MS, ITEM_DROP_RATE,
  SUDDEN_DEATH_AT_MS, SUDDEN_DEATH_STEP_MS, SPEED_LEVELS, MAX_BOMBS, MAX_FLAMES, MAX_SPEED_LEVEL,
  Tile, ItemType,
} from "./constants";
import { Dir, DirInput, GameEvent, Vec, dirDx, dirDy } from "./types";
import { generateMap, mulberry32 } from "./mapgen";
import { computeFlame } from "./explosion";

export interface SimPlayer {
  id: string;
  spawnIndex: number;
  /** 格坐标浮点；静止时为整数（格中心） */
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  /** 0~1，dir 非空时表示本次格间移动进度 */
  progress: number;
  dir: Dir | null;
  input: DirInput;
  bombsMax: number;
  bombsActive: number;
  flameLen: number;
  speedLevel: number;
  alive: boolean;
  invincibleUntil: number;
}

export interface SimBomb {
  id: number;
  gx: number;
  gy: number;
  ownerId: string;
  power: number;
  explodeAt: number;
}

export interface SimExplosion {
  id: number;
  cells: Vec[];
  expireAt: number;
}

export interface SimItem {
  id: number;
  gx: number;
  gy: number;
  type: ItemType;
}

export class GameSim {
  grid: Uint8Array;
  players = new Map<string, SimPlayer>();
  bombs: SimBomb[] = [];
  explosions: SimExplosion[] = [];
  /** key = 格索引 */
  items = new Map<number, SimItem>();
  phase: "playing" | "ended" = "playing";
  winnerIds: string[] = [];
  elapsedMs = 0;

  protected events: GameEvent[] = [];
  protected rng: () => number;
  protected nextId = 1;
  protected suddenDeathRing = 1;
  protected nextSuddenDeathAt = SUDDEN_DEATH_AT_MS;

  constructor(seed: number, playerIds: string[], rngOverride?: () => number) {
    const map = generateMap(seed);
    this.grid = map.grid;
    this.rng = rngOverride ?? mulberry32((seed ^ 0x9e3779b9) >>> 0);
    playerIds.forEach((id, i) => {
      const s = map.spawns[i % 4];
      this.players.set(id, {
        id, spawnIndex: i % 4, x: s.gx, y: s.gy,
        fromX: s.gx, fromY: s.gy, progress: 0, dir: null, input: "none",
        bombsMax: 1, bombsActive: 0, flameLen: 1, speedLevel: 1,
        alive: true, invincibleUntil: SPAWN_INVINCIBLE_MS,
      });
    });
  }

  setInput(playerId: string, dir: DirInput): void {
    const p = this.players.get(playerId);
    if (p) p.input = dir;
  }

  /** 放泡泡（Task 6 实现） */
  placeBomb(playerId: string): void {
    void playerId;
  }

  step(dtMs: number): void {
    if (this.phase !== "playing") return;
    this.elapsedMs += dtMs;
    for (const p of this.players.values()) this.stepPlayer(p, dtMs);
    this.stepBombs();
    this.stepExplosions();
    this.stepSuddenDeath();
    this.checkEnd();
  }

  /** 取走本轮一次性事件（音效/特效/结算用） */
  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  protected bombAt(gx: number, gy: number): SimBomb | undefined {
    return this.bombs.find(b => b.gx === gx && b.gy === gy);
  }

  private stepPlayer(p: SimPlayer, dtMs: number): void {
    if (!p.alive) return;
    // 静止时先尝试起步；起步后同一帧即推进（起步帧不浪费）
    if (p.dir === null) this.tryContinue(p);
    if (p.dir !== null) {
      const speed = SPEED_LEVELS[p.speedLevel - 1];
      p.progress += (speed * dtMs) / 1000;
      if (p.progress >= 1) {
        p.x = p.fromX + dirDx(p.dir);
        p.y = p.fromY + dirDy(p.dir);
        p.progress = 0;
        p.dir = null;
        this.tryPickup(p);
        this.tryContinue(p); // 到达后若仍按住方向，从新格开始下一次移动（本帧不再推进）
      } else {
        p.x = p.fromX + dirDx(p.dir) * p.progress;
        p.y = p.fromY + dirDy(p.dir) * p.progress;
      }
    }
  }

  private tryContinue(p: SimPlayer): void {
    const d = p.input;
    if (d === "none") return;
    const fx = Math.round(p.x);
    const fy = Math.round(p.y);
    const tx = fx + dirDx(d);
    const ty = fy + dirDy(d);
    if (!this.passable(tx, ty)) return;
    p.fromX = fx;
    p.fromY = fy;
    p.dir = d;
    p.progress = 0;
  }

  private passable(gx: number, gy: number): boolean {
    if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) return false;
    if (this.grid[gy * GRID_W + gx] !== Tile.Floor) return false;
    return !this.bombAt(gx, gy);
  }

  protected tryPickup(p: SimPlayer): void {
    void p;
  }
  protected stepBombs(): void {}
  protected stepExplosions(): void {
    this.explosions = this.explosions.filter(e => e.expireAt > this.elapsedMs);
  }
  protected stepSuddenDeath(): void {}
  protected checkEnd(): void {}
}

// 引用避免未使用告警（后续任务填充对应桩时移除）
void BOMB_FUSE_MS; void FLAME_MS; void ITEM_DROP_RATE; void SUDDEN_DEATH_STEP_MS;
void MAX_BOMBS; void MAX_FLAMES; void MAX_SPEED_LEVEL; void ItemType; void computeFlame;
