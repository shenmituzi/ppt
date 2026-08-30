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

  /** 放泡泡：在玩家当前所站格放下 */
  placeBomb(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || !p.alive || this.phase !== "playing") return;
    if (p.bombsActive >= p.bombsMax) return;
    const gx = Math.round(p.x);
    const gy = Math.round(p.y);
    if (this.bombAt(gx, gy)) return;
    this.bombs.push({
      id: this.nextId++, gx, gy, ownerId: p.id,
      power: p.flameLen, explodeAt: this.elapsedMs + BOMB_FUSE_MS,
    });
    p.bombsActive++;
    this.events.push({ type: "bombPlaced", gx, gy, ownerId: p.id });
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
  protected stepBombs(): void {
    const due = this.bombs.filter(b => b.explodeAt <= this.elapsedMs);
    const exploded = new Set<number>();
    for (const b of due) this.explodeBomb(b, exploded);
  }

  /** 引爆一颗泡泡：火焰、烧墙、连锁、压中者判死 */
  private explodeBomb(b: SimBomb, exploded: Set<number>): void {
    if (exploded.has(b.id)) return;
    exploded.add(b.id);
    this.bombs = this.bombs.filter(x => x.id !== b.id);
    const owner = this.players.get(b.ownerId);
    if (owner) owner.bombsActive = Math.max(0, owner.bombsActive - 1);

    const cells = computeFlame(this.grid, b.gx, b.gy, b.power);
    this.explosions.push({ id: this.nextId++, cells, expireAt: this.elapsedMs + FLAME_MS });
    this.events.push({ type: "exploded", cells });

    for (const c of cells) {
      const i = c.gy * GRID_W + c.gx;
      if (this.grid[i] === Tile.SoftWall) {
        this.grid[i] = Tile.Floor;
        // 道具掉落逻辑 Task 8 填充，先发事件
        this.events.push({ type: "wallBroken", gx: c.gx, gy: c.gy, item: null });
      }
      const chain = this.bombAt(c.gx, c.gy);
      if (chain) this.explodeBomb(chain, exploded); // 连锁引爆
      this.items.delete(i); // 火焰烧毁道具（Task 8 前恒为空）
      for (const p of this.players.values()) {
        if (
          p.alive &&
          this.elapsedMs >= p.invincibleUntil &&
          Math.round(p.x) === c.gx &&
          Math.round(p.y) === c.gy
        ) {
          p.alive = false;
          this.events.push({ type: "died", playerId: p.id, gx: c.gx, gy: c.gy });
        }
      }
    }
  }

  protected stepExplosions(): void {
    this.explosions = this.explosions.filter(e => e.expireAt > this.elapsedMs);
  }
  protected stepSuddenDeath(): void {}
  protected checkEnd(): void {}
}

// 引用避免未使用告警（后续任务填充对应桩时移除）
void ITEM_DROP_RATE; void SUDDEN_DEATH_STEP_MS;
void MAX_BOMBS; void MAX_FLAMES; void MAX_SPEED_LEVEL; void ItemType;
