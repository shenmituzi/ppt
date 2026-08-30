import {
  GRID_W, GRID_H, BOMB_FUSE_MS, FLAME_MS, SPAWN_INVINCIBLE_MS, ITEM_DROP_RATE,
  SUDDEN_DEATH_AT_MS, SUDDEN_DEATH_STEP_MS, SPEED_LEVELS, MAX_BOMBS, MAX_FLAMES, MAX_SPEED_LEVEL,
  WEATHER_ITEM_RATE, SNOW_SLOW_FACTOR, RAIN_FUSE_FACTOR,
  LIGHTNING_WARN_MS, LIGHTNING_INTERVAL_MIN, LIGHTNING_INTERVAL_MAX,
  GATHER_MS, SCATTER_ITEMS, ADVENTURE_PLAYERS,
  MONSTER_BASE_HP, MONSTER_HP_PER_LEVEL, MONSTER_BASE_SPEED, MONSTER_SPEED_PER_LEVEL,
  MONSTER_MAX_SPEED, MONSTER_MAX_COUNT, HOUSE_MAX_HP, HOUSE_HEAL_PER_SEC,
  MONSTER_RETREAT_RATIO, BUFF_DECAY_MS,
  Tile, ItemType, isSoft, type WeatherType, type GameType,
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
  /** 暴雪天气：钉鞋（免疫减速） */
  bootsOn: boolean;
  /** 雷雨天气：避雷针（免疫闪电） */
  rodOn: boolean;
  /** 迷雾天气：提灯（视野更大） */
  lanternOn: boolean;
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

interface PendingStrike {
  gx: number;
  gy: number;
  strikeAt: number;
}

export interface SimMonster {
  id: number;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  progress: number;
  dir: Dir | null;
  hp: number;
  maxHp: number;
  level: number;
  /** hunt 追击玩家 / retreat 回屋 / heal 屋内回血 */
  state: "hunt" | "retreat" | "heal";
  houseId: number;
}

export interface SimHouse {
  id: number;
  gx: number;
  gy: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
}

export interface GameSimOpts {
  gameType?: GameType;
}

export class GameSim {
  grid: Uint8Array;
  players = new Map<string, SimPlayer>();
  bombs: SimBomb[] = [];
  explosions: SimExplosion[] = [];
  /** key = 格索引 */
  items = new Map<number, SimItem>();
  weather: WeatherType;
  gameType: GameType;
  /** 冒险模式阶段：gathering 搜集装备 → playing 怪物来袭；pvp 直接 playing */
  phase: "gathering" | "playing" | "ended" = "playing";
  winnerIds: string[] = [];
  elapsedMs = 0;
  /** 冒险模式：搜集期结束时刻 */
  gatherEndsAt = 0;
  houses: SimHouse[] = [];
  monsters: SimMonster[] = [];

  protected events: GameEvent[] = [];
  protected rng: () => number;
  protected nextId = 1;
  protected suddenDeathRing = 1;
  protected nextSuddenDeathAt = SUDDEN_DEATH_AT_MS;
  /** 雷雨：下一次闪电时间（-1 = 尚未安排） */
  protected nextLightningAt = -1;
  private pendingStrikes: PendingStrike[] = [];
  /** 冒险模式：房屋占用的格子（不可通行） */
  private houseBlock = new Set<number>();
  private nextDecayAt = 0;

  constructor(
    seed: number,
    playerIds: string[],
    rngOverride?: () => number,
    weather: WeatherType = "sunny",
    opts: GameSimOpts = {},
  ) {
    this.gameType = opts.gameType ?? "pvp";
    const map = generateMap(seed, weather);
    this.grid = map.grid;
    this.weather = weather;
    this.rng = rngOverride ?? mulberry32((seed ^ 0x9e3779b9) >>> 0);
    playerIds.forEach((id, i) => {
      const s = map.spawns[i % 4];
      this.players.set(id, {
        id, spawnIndex: i % 4, x: s.gx, y: s.gy,
        fromX: s.gx, fromY: s.gy, progress: 0, dir: null, input: "none",
        bombsMax: 1, bombsActive: 0, flameLen: 1, speedLevel: 1,
        alive: true, invincibleUntil: SPAWN_INVINCIBLE_MS,
        bootsOn: false, rodOn: false, lanternOn: false,
      });
    });
    if (this.gameType === "adventure") {
      this.phase = "gathering";
      this.gatherEndsAt = GATHER_MS;
      this.nextDecayAt = GATHER_MS + BUFF_DECAY_MS;
      this.initHouses();
      this.scatterItems();
    }
  }

  setInput(playerId: string, dir: DirInput): void {
    const p = this.players.get(playerId);
    if (p) p.input = dir;
  }

  /** 放泡泡：在玩家当前所站格放下（搜集期也可以炸墙找道具） */
  placeBomb(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || !p.alive || this.phase === "ended") return;
    if (p.bombsActive >= p.bombsMax) return;
    const gx = Math.round(p.x);
    const gy = Math.round(p.y);
    if (this.bombAt(gx, gy)) return;
    const fuseFactor = this.weather === "rain" ? RAIN_FUSE_FACTOR : 1; // 雨天泡泡受潮提前炸
    this.bombs.push({
      id: this.nextId++, gx, gy, ownerId: p.id,
      power: p.flameLen, explodeAt: this.elapsedMs + BOMB_FUSE_MS * fuseFactor,
    });
    p.bombsActive++;
    this.events.push({ type: "bombPlaced", gx, gy, ownerId: p.id });
  }

  step(dtMs: number): void {
    if (this.phase !== "playing" && this.phase !== "gathering") return;
    this.elapsedMs += dtMs;
    for (const p of this.players.values()) this.stepPlayer(p, dtMs);
    this.stepBombs();
    this.stepExplosions();
    if (this.weather === "rain") {
      this.stepLightning();
      this.stepPendingStrikes();
    }
    if (this.gameType === "adventure") {
      if (this.phase === "gathering" && this.elapsedMs >= this.gatherEndsAt) this.startHunt();
      this.stepMonsters(dtMs);
      this.stepDecay();
    }
    this.stepSuddenDeath();
    this.checkEnd();
  }

  /** 供人机 AI 判断格子是否可走（无墙/无泡泡/无房屋） */
  isCellFree(gx: number, gy: number): boolean {
    return this.passable(gx, gy);
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
      const snowFactor = this.weather === "snow" && !p.bootsOn ? SNOW_SLOW_FACTOR : 1;
      const speed = SPEED_LEVELS[p.speedLevel - 1] * snowFactor;
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
    if (this.houseBlock.has(gy * GRID_W + gx)) return false;
    return !this.bombAt(gx, gy);
  }

  /** 拾取道具：到达目标格中心时触发 */
  protected tryPickup(p: SimPlayer): void {
    const i = Math.round(p.y) * GRID_W + Math.round(p.x);
    const item = this.items.get(i);
    if (!item) return;
    this.items.delete(i);
    switch (item.type) {
      case ItemType.Bomb: p.bombsMax = Math.min(MAX_BOMBS, p.bombsMax + 1); break;
      case ItemType.Flame: p.flameLen = Math.min(MAX_FLAMES, p.flameLen + 1); break;
      case ItemType.Speed: p.speedLevel = Math.min(MAX_SPEED_LEVEL, p.speedLevel + 1); break;
      case ItemType.Boots:
        p.bootsOn = true; // 免疫暴雪减速
        p.speedLevel = Math.min(MAX_SPEED_LEVEL, p.speedLevel + 1);
        break;
      case ItemType.Rod: p.rodOn = true; break;
      case ItemType.Lantern: p.lanternOn = true; break;
    }
    this.events.push({ type: "itemPicked", playerId: p.id, itemType: item.type });
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

    for (const c of cells) this.applyCellHit(c, exploded, "exploded");
  }

  /** 火焰/闪电压到某一格的共有逻辑 */
  private applyCellHit(c: Vec, exploded: Set<number> | null, source: "exploded" | "lightningStrike"): void {
    const i = c.gy * GRID_W + c.gx;
    const existingItem = this.items.get(i); // 火焰烧毁的是爆炸前就存在的道具
    if (isSoft(this.grid[i])) {
      this.grid[i] = Tile.Floor;
      const item = this.rollDrop();
      if (item !== null) {
        this.items.set(i, { id: this.nextId++, gx: c.gx, gy: c.gy, type: item });
      }
      this.events.push({ type: "wallBroken", gx: c.gx, gy: c.gy, item });
    }
    if (exploded) {
      const chain = this.bombAt(c.gx, c.gy);
      if (chain) this.explodeBomb(chain, exploded); // 连锁引爆
    }
    if (existingItem) this.items.delete(i);
    // 怪物受伤（冒险模式）
    for (const m of this.monsters) {
      if (m.hp > 0 && Math.round(m.x) === c.gx && Math.round(m.y) === c.gy) m.hp -= 1;
    }
    this.monsters = this.monsters.filter(m => m.hp > 0);
    // 怪物房屋受伤（爆炸才能拆，闪电不行）
    if (source === "exploded") {
      for (const h of this.houses) {
        if (!h.destroyed && h.gx === c.gx && h.gy === c.gy) {
          h.hp -= 2;
          if (h.hp <= 0) h.destroyed = true;
        }
      }
    }
    for (const p of this.players.values()) {
      if (
        p.alive &&
        this.elapsedMs >= p.invincibleUntil &&
        !(source === "lightningStrike" && p.rodOn) && // 避雷针免疫闪电
        Math.round(p.x) === c.gx &&
        Math.round(p.y) === c.gy
      ) {
        p.alive = false;
        this.events.push({ type: "died", playerId: p.id, gx: c.gx, gy: c.gy });
      }
    }
  }

  /** 软墙被烧毁后的掉落：对应天气有概率掉天气专属道具 */
  private rollDrop(): ItemType | null {
    if (this.weather !== "sunny" && this.rng() < WEATHER_ITEM_RATE) {
      switch (this.weather) {
        case "snow": return ItemType.Boots;
        case "rain": return ItemType.Rod;
        case "fog": return ItemType.Lantern;
      }
    }
    if (this.rng() >= ITEM_DROP_RATE) return null;
    const roll = this.rng();
    return roll < 1 / 3 ? ItemType.Bomb : roll < 2 / 3 ? ItemType.Flame : ItemType.Speed;
  }

  /** 雷雨天气：周期性闪电，先警告后落下 */
  protected stepLightning(): void {
    if (this.weather !== "rain") return;
    if (this.nextLightningAt < 0) {
      this.nextLightningAt = this.elapsedMs + LIGHTNING_INTERVAL_MIN;
      return;
    }
    if (this.elapsedMs < this.nextLightningAt) return;
    this.nextLightningAt =
      this.elapsedMs + LIGHTNING_INTERVAL_MIN + this.rng() * (LIGHTNING_INTERVAL_MAX - LIGHTNING_INTERVAL_MIN);
    // 随机选一个非硬墙格
    const candidates: Vec[] = [];
    for (let gy = 1; gy < GRID_H - 1; gy++) {
      for (let gx = 1; gx < GRID_W - 1; gx++) {
        if (this.grid[gy * GRID_W + gx] !== Tile.HardWall) candidates.push({ gx, gy });
      }
    }
    if (!candidates.length) return;
    const c = candidates[Math.floor(this.rng() * candidates.length)];
    const strikeAt = this.elapsedMs + LIGHTNING_WARN_MS;
    this.pendingStrikes.push({ gx: c.gx, gy: c.gy, strikeAt });
    this.events.push({ type: "lightningWarn", gx: c.gx, gy: c.gy, strikeAt });
  }

  private stepPendingStrikes(): void {
    if (!this.pendingStrikes.length) return;
    const due = this.pendingStrikes.filter(s => s.strikeAt <= this.elapsedMs);
    this.pendingStrikes = this.pendingStrikes.filter(s => s.strikeAt > this.elapsedMs);
    for (const s of due) {
      this.applyCellHit({ gx: s.gx, gy: s.gy }, null, "lightningStrike");
      this.events.push({ type: "lightningStrike", gx: s.gx, gy: s.gy, item: null });
    }
  }

  protected stepExplosions(): void {
    this.explosions = this.explosions.filter(e => e.expireAt > this.elapsedMs);
  }

  forfeit(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || !p.alive || this.phase === "ended") return;
    p.alive = false;
    this.events.push({ type: "died", playerId, gx: Math.round(p.x), gy: Math.round(p.y) });
    this.checkEnd();
  }

  // ---------- 冒险模式 ----------

  /** 初始化怪物房屋：占住四个边中点，格子变为不可通行的地基 */
  private initHouses(): void {
    const spots = [
      [7, 1], [1, 6], [GRID_W - 2, 6], [7, GRID_H - 2],
    ];
    for (const [gx, gy] of spots) {
      this.grid[gy * GRID_W + gx] = Tile.Floor; // 地基清理干净
      this.houseBlock.add(gy * GRID_W + gx);
      this.houses.push({
        id: this.nextId++, gx, gy,
        hp: HOUSE_MAX_HP, maxHp: HOUSE_MAX_HP, destroyed: false,
      });
    }
  }

  /** 搜集期开局：在地图上散落道具供玩家搜集 */
  private scatterItems(): void {
    const spots: number[] = [];
    for (let gy = 1; gy < GRID_H - 1; gy++)
      for (let gx = 1; gx < GRID_W - 1; gx++) {
        const i = gy * GRID_W + gx;
        if (this.grid[i] === Tile.Floor && !this.houseBlock.has(i)) spots.push(i);
      }
    // 洗牌后取前 N 个
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    const types = [ItemType.Bomb, ItemType.Flame, ItemType.Speed];
    for (const i of spots.slice(0, SCATTER_ITEMS)) {
      const gx = i % GRID_W;
      const gy = Math.floor(i / GRID_W);
      const special =
        this.weather !== "sunny" && this.rng() < WEATHER_ITEM_RATE
          ? this.weather === "snow" ? ItemType.Boots : this.weather === "rain" ? ItemType.Rod : ItemType.Lantern
          : null;
      const type = special ?? types[Math.floor(this.rng() * 3)];
      this.items.set(i, { id: this.nextId++, gx, gy, type });
    }
  }

  /** 搜集期结束：怪物登场（人数 + 1） */
  private startHunt(): void {
    this.phase = "playing";
    this.nextDecayAt = this.elapsedMs + BUFF_DECAY_MS;
    this.spawnMonsters(Math.min(this.players.size + 1, MONSTER_MAX_COUNT));
  }

  private spawnMonsters(n: number): void {
    for (let i = 0; i < n; i++) this.spawnMonster();
  }

  private spawnMonster(): void {
    if (this.monsters.length >= MONSTER_MAX_COUNT) return;
    const level = this.monsterLevel();
    const maxHp = MONSTER_BASE_HP + (level - 1) * MONSTER_HP_PER_LEVEL;
    // 优先选离存活玩家较远的格子
    const candidates: Vec[] = [];
    for (let gy = 1; gy < GRID_H - 1; gy++)
      for (let gx = 1; gx < GRID_W - 1; gx++) {
        if (!this.isCellFree(gx, gy)) continue;
        let minDist = 99;
        for (const p of this.players.values()) {
          if (!p.alive) continue;
          minDist = Math.min(minDist, Math.abs(p.x - gx) + Math.abs(p.y - gy));
        }
        if (minDist >= 6) candidates.push({ gx, gy });
      }
    const pool = candidates.length ? candidates : [{ gx: 7, gy: 6 }];
    const c = pool[Math.floor(this.rng() * pool.length)];
    const house = this.houses[this.monsters.length % Math.max(1, this.houses.length)];
    this.monsters.push({
      id: this.nextId++, x: c.gx, y: c.gy, fromX: c.gx, fromY: c.gy, progress: 0, dir: null,
      hp: maxHp, maxHp, level, state: "hunt", houseId: house ? house.id : 0,
    });
  }

  private monsterLevel(): number {
    const huntMs = Math.max(0, this.elapsedMs - this.gatherEndsAt);
    return 1 + Math.floor(huntMs / 45_000);
  }

  private monsterSpeed(m: SimMonster): number {
    return Math.min(MONSTER_MAX_SPEED, MONSTER_BASE_SPEED + (m.level - 1) * MONSTER_SPEED_PER_LEVEL);
  }

  private stepMonsters(dtMs: number): void {
    // 房屋回血
    for (const m of this.monsters) {
      if (m.state === "heal") {
        m.hp = Math.min(m.maxHp, m.hp + (HOUSE_HEAL_PER_SEC * dtMs) / 1000);
        if (m.hp >= m.maxHp) m.state = "hunt";
      }
      if (m.state === "hunt" && m.hp <= m.maxHp * MONSTER_RETREAT_RATIO && this.houseAlive(m.houseId)) {
        m.state = "retreat";
      }
      if (m.state === "retreat" && !this.houseAlive(m.houseId)) m.state = "hunt";
    }
    this.monsters = this.monsters.filter(m => m.hp > 0);

    for (const m of this.monsters) {
      // 移动
      if (m.dir !== null) {
        const speed = this.monsterSpeed(m);
        m.progress += (speed * dtMs) / 1000;
        if (m.progress >= 1) {
          m.x = m.fromX + dirDx(m.dir);
          m.y = m.fromY + dirDy(m.dir);
          m.progress = 0;
          m.dir = null;
        } else {
          m.x = m.fromX + dirDx(m.dir) * m.progress;
          m.y = m.fromY + dirDy(m.dir) * m.progress;
          continue; // 移动中不重新决策
        }
      }
      if (m.state === "heal") continue; // 屋内安心回血
      // 攻击：与玩家同格即击杀（无敌帧可躲）
      for (const p of this.players.values()) {
        if (
          p.alive &&
          this.elapsedMs >= p.invincibleUntil &&
          Math.round(p.x) === Math.round(m.x) &&
          Math.round(p.y) === Math.round(m.y)
        ) {
          p.alive = false;
          this.events.push({ type: "died", playerId: p.id, gx: Math.round(p.x), gy: Math.round(p.y) });
          // 怪物杀死玩家 → 场上再刷一只
          this.spawnMonster();
        }
      }
      // 选择方向
      const target = this.monsterTarget(m);
      const dir = this.monsterDirToward(m, target);
      if (dir) {
        m.dir = dir;
        m.fromX = Math.round(m.x);
        m.fromY = Math.round(m.y);
        m.progress = 0;
      }
    }
  }

  private monsterTarget(m: SimMonster): Vec {
    const house = this.houses.find(h => h.id === m.houseId && !h.destroyed);
    if ((m.state === "retreat" || m.state === "heal") && house) {
      // 屋门口的可通行格
      const adj = [
        { gx: house.gx, gy: house.gy - 1 },
        { gx: house.gx, gy: house.gy + 1 },
        { gx: house.gx - 1, gy: house.gy },
        { gx: house.gx + 1, gy: house.gy },
      ].find(c => this.isCellFree(c.gx, c.gy));
      if (adj) return adj;
    }
    // 追击最近的存活玩家
    let best: Vec | null = null;
    let bestD = 1e9;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const d = Math.abs(p.x - m.x) + Math.abs(p.y - m.y);
      if (d < bestD) {
        bestD = d;
        best = { gx: Math.round(p.x), gy: Math.round(p.y) };
      }
    }
    return best ?? { gx: Math.round(m.x), gy: Math.round(m.y) };
  }

  /** 贪心寻路：优先走距离差更大的轴，被挡则换另一轴，再不行随机 */
  private monsterDirToward(m: SimMonster, t: Vec): Dir | null {
    const mx = Math.round(m.x);
    const my = Math.round(m.y);
    const dx = t.gx - mx;
    const dy = t.gy - my;
    if (dx === 0 && dy === 0) return null;
    const dirs: Dir[] =
      Math.abs(dx) >= Math.abs(dy)
        ? [dx > 0 ? "right" : "left", dy > 0 ? "down" : "up"]
        : [dy > 0 ? "down" : "up", dx > 0 ? "right" : "left"];
    for (const d of dirs) {
      if (d && this.isCellFree(mx + dirDx(d), my + dirDy(d))) return d;
    }
    const fallback = (["up", "down", "left", "right"] as Dir[]).filter(
      d => this.isCellFree(mx + dirDx(d), my + dirDy(d)),
    );
    if (!fallback.length) return null;
    return fallback[Math.floor(this.rng() * fallback.length)];
  }

  private houseAlive(id: number): boolean {
    const h = this.houses.find(x => x.id === id);
    return !!h && !h.destroyed;
  }

  /** 装备损耗：狩猎期每 40 秒所有属性 -1（不低于初始值） */
  private stepDecay(): void {
    if (this.phase !== "playing") return;
    if (this.elapsedMs < this.nextDecayAt) return;
    this.nextDecayAt += BUFF_DECAY_MS;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      p.bombsMax = Math.max(1, p.bombsMax - 1);
      p.flameLen = Math.max(1, p.flameLen - 1);
      p.speedLevel = Math.max(1, p.speedLevel - 1);
    }
  }

  protected stepSuddenDeath(): void {
    if (this.gameType !== "pvp") return; // 冒险模式的压力来自怪物，不缩圈
    if (this.elapsedMs < SUDDEN_DEATH_AT_MS) return;
    if (this.elapsedMs < this.nextSuddenDeathAt) return;
    const k = this.suddenDeathRing;
    if (k > Math.floor(Math.min(GRID_W, GRID_H) / 2)) return;
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const onRing = gx === k || gx === GRID_W - 1 - k || gy === k || gy === GRID_H - 1 - k;
        if (!onRing) continue;
        const i = gy * GRID_W + gx;
        if (this.grid[i] === Tile.HardWall) continue;
        this.grid[i] = Tile.HardWall;
        this.items.delete(i);
        this.bombs = this.bombs.filter(b => !(b.gx === gx && b.gy === gy));
        for (const p of this.players.values()) {
          if (p.alive && Math.round(p.x) === gx && Math.round(p.y) === gy) {
            p.alive = false;
            this.events.push({ type: "died", playerId: p.id, gx, gy });
          }
        }
      }
    }
    this.suddenDeathRing++;
    this.nextSuddenDeathAt = this.elapsedMs + SUDDEN_DEATH_STEP_MS;
  }

  protected checkEnd(): void {
    const alive = [...this.players.values()].filter(p => p.alive);
    if (this.gameType === "adventure") {
      // 冒险模式：消灭全部怪物 = 胜利；全员阵亡 = 失败
      if (this.phase === "playing" && this.monsters.length === 0) {
        this.phase = "ended";
        this.winnerIds = alive.map(p => p.id);
        this.events.push({ type: "ended", winnerIds: this.winnerIds });
      } else if (alive.length === 0) {
        this.phase = "ended";
        this.winnerIds = [];
        this.events.push({ type: "ended", winnerIds: [] });
      }
      return;
    }
    if (this.players.size < 2) return; // 单人练习模式不结算
    if (alive.length <= 1) {
      this.phase = "ended";
      this.winnerIds = alive.map(p => p.id);
      this.events.push({ type: "ended", winnerIds: this.winnerIds });
    }
  }
}
