import {
  GRID_W, GRID_H, BOMB_FUSE_MS, FLAME_MS, SPAWN_INVINCIBLE_MS, ITEM_DROP_RATE,
  SUDDEN_DEATH_AT_MS, SUDDEN_DEATH_STEP_MS, SPEED_LEVELS, MAX_BOMBS, MAX_FLAMES, MAX_SPEED_LEVEL,
  WEATHER_ITEM_RATE, SNOW_SLOW_FACTOR, RAIN_FUSE_FACTOR,
  LIGHTNING_WARN_MS, LIGHTNING_INTERVAL_MIN, LIGHTNING_INTERVAL_MAX,
  GATHER_MS, SCATTER_ITEMS, ADVENTURE_PLAYERS,
  MONSTER_BASE_HP, MONSTER_HP_PER_LEVEL, MONSTER_BASE_SPEED, MONSTER_SPEED_PER_LEVEL,
  MONSTER_MAX_SPEED, MONSTER_MAX_COUNT, HOUSE_MAX_HP, HOUSE_HEAL_PER_SEC,
  MONSTER_RETREAT_RATIO, BUFF_DECAY_MS,
  MUSHROOM_SUN_PERIOD, SUN_PER_MONSTER, CANNON_RANGE, CANNOW_DAMAGE, CANNON_COOLDOWN,
  FAN_RANGE, FAN_SLOW, FRIDGE_RANGE, FRIDGE_SLOW,
  MONSTER_MAX_LEVEL, MONSTER_LEVEL_MS,
  ADVENTURE_WEATHER, pickAdventureWeather,
  PLAYER_LIVES, RESPAWN_MS, RESPAWN_INVINCIBLE_MS, MOUNT_SPEED_FACTOR,
  SHOP,
  LASER_RANGE, LASER_COOLDOWN, PISTOL_COOLDOWN, PISTOL_SPEED, PISTOL_RANGE,
  PORTAL_TTL, PORTAL_COOLDOWN, CAPTURE_RANGE, CAPTURE_MS,
  SPAWNS,
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
  /** 剩余生命（复活机制的存量） */
  lives: number;
  /** >0 表示阵亡等待复活 */
  respawnAt: number;
  /** 骑乘载具 */
  mounted: boolean;
  /** 当前武器：none / laser / pistol / shield / pokeball */
  weapon: string;
  /** 下一次攻击可用时间 */
  attackReadyAt: number;
  /** 面朝方向（最后一次移动方向），武器攻击用 */
  facing: Dir | null;
  /** 被精灵球困住的截止时间 */
  trappedUntil: number;
  /** 穿梭胶囊冷却 */
  portalCdUntil: number;
  /** 冒险模式：阳光（商城货币） */
  sun: number;
  /** 蘑菇数量（每颗定期产阳光） */
  mushroomLv: number;
  /** 下一次蘑菇产阳光时间 */
  nextSunAt: number;
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

export interface SimBullet {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  ownerId: string;
  traveled: number;
}

export interface SimPortalPair {
  id: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  until: number;
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

export interface SimDevice {
  id: number;
  type: "cannon" | "fan" | "fridge";
  gx: number;
  gy: number;
  ownerId: string;
  cdUntil: number;
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
  bullets: SimBullet[] = [];
  portalPairs: SimPortalPair[] = [];
  devices: (SimDevice & { flashUntil?: number })[] = [];

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
      const spawnIndex = this.gameType === "adventure" && i < 2 ? 0 : i % 4;
      const s = map.spawns[spawnIndex];
      this.players.set(id, {
        id, spawnIndex, x: s.gx, y: s.gy,
        fromX: s.gx, fromY: s.gy, progress: 0, dir: null, input: "none",
        bombsMax: 1, bombsActive: 0, flameLen: 1, speedLevel: 1,
        alive: true, invincibleUntil: SPAWN_INVINCIBLE_MS,
        bootsOn: false, rodOn: false, lanternOn: false,
        lives: PLAYER_LIVES, respawnAt: 0, mounted: false,
        weapon: "none", attackReadyAt: 0, facing: null,
        trappedUntil: 0, portalCdUntil: 0,
        sun: 0, mushroomLv: 1, nextSunAt: MUSHROOM_SUN_PERIOD,
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
    this.stepRespawns();
    for (const p of this.players.values()) this.stepPlayer(p, dtMs);
    this.stepBullets(dtMs);
    this.stepPortals();
    this.stepBombs();
    this.stepExplosions();
    if (this.weather === "rain") {
      this.stepLightning();
      this.stepPendingStrikes();
    }
    if (this.gameType === "adventure") {
      if (this.phase === "gathering" && this.elapsedMs >= this.gatherEndsAt) this.startHunt();
      this.stepSun(dtMs);
      this.stepDevices(dtMs);
      this.stepMonsters(dtMs);
      this.stepDecay();
    }
    this.stepSuddenDeath();
    this.checkEnd();
  }

  /** 冒险模式：蘑菇产阳光 + 怪物死亡掉阳光由伤害来源结算 */
  private stepSun(dtMs: number): void {
    for (const p of this.players.values()) {
      p.nextSunAt = p.nextSunAt ?? this.elapsedMs + MUSHROOM_SUN_PERIOD;
      while (this.elapsedMs >= p.nextSunAt) {
        p.nextSunAt += MUSHROOM_SUN_PERIOD;
        p.sun += p.mushroomLv; // 每颗蘑菇 +1
      }
    }
  }

  /** 购买商城道具（服务器校验价格后调用）；返回是否成功与文案 */
  buy(playerId: string, itemId: string): { ok: boolean; message: string } {
    const entry = SHOP.find(x => x.id === itemId);
    const p = this.players.get(playerId);
    if (!entry || !p || !p.alive) return { ok: false, message: "无法购买" };
    if (p.sun < entry.price) return { ok: false, message: "阳光不足" };
    p.sun -= entry.price;
    if (itemId === "bomb") p.bombsMax = Math.min(MAX_BOMBS, p.bombsMax + 1);
    else if (itemId === "flame") p.flameLen = Math.min(MAX_FLAMES, p.flameLen + 1);
    else if (itemId === "speed") p.speedLevel = Math.min(MAX_SPEED_LEVEL, p.speedLevel + 1);
    else if (itemId === "mushroom") p.mushroomLv += 1;
    else if (itemId === "wall") {
      if (!this.placeWall(p)) { p.sun += entry.price; return { ok: false, message: "领地边缘没有可建位置" }; }
    }
    else if (itemId === "cannon" || itemId === "fan" || itemId === "fridge") {
      this.placeDevice(itemId, p);
    } else if (itemId === "blindbox") {
      const message = this.openBlindbox(p);
      return { ok: true, message };
    }
    return { ok: true, message: `已购买 ${entry.name}` };
  }

  /** 城墙只允许落在己方出生区外沿，避免把整张地图封死。 */
  private placeWall(p: SimPlayer): boolean {
    const sx = SPAWNS[p.spawnIndex % 4].gx;
    const sy = SPAWNS[p.spawnIndex % 4].gy;
    const candidates = [
      { gx: sx + 3, gy: sy }, { gx: sx, gy: sy + 3 },
      { gx: sx + 2, gy: sy + 2 }, { gx: sx + 2, gy: sy - 2 },
      { gx: sx - 2, gy: sy + 2 }, { gx: sx - 2, gy: sy - 2 },
    ];
    const spot = candidates.find(c => c.gx > 0 && c.gx < GRID_W - 1 && c.gy > 0 && c.gy < GRID_H - 1 &&
      this.grid[c.gy * GRID_W + c.gx] === Tile.Floor && !this.houseBlock.has(c.gy * GRID_W + c.gx) &&
      !this.devices.some(d => d.gx === c.gx && d.gy === c.gy));
    if (!spot) return false;
    this.grid[spot.gy * GRID_W + spot.gx] = Tile.HardWall;
    return true;
  }

  /** 盲盒：随机开出道具 / 装置 / 阳光 / 谢谢惠顾 */
  private openBlindbox(p: SimPlayer): string {
    const roll = this.rng();
    if (roll < 0.2) {
      // 经典三件
      const t = this.rng();
      if (t < 1 / 3) { p.bombsMax = Math.min(MAX_BOMBS, p.bombsMax + 1); return "开出了 泡泡+1！"; }
      if (t < 2 / 3) { p.flameLen = Math.min(MAX_FLAMES, p.flameLen + 1); return "开出了 火焰+1！"; }
      p.speedLevel = Math.min(MAX_SPEED_LEVEL, p.speedLevel + 1);
      return "开出了 速度+1！";
    }
    if (roll < 0.45) {
      // 随机装置放在身边
      const t = this.rng();
      const type = t < 0.4 ? "cannon" : t < 0.75 ? "fan" : "fridge";
      const ok = this.placeDevice(type, p);
      return ok ? `开出了 ${type === "cannon" ? "加农炮" : type === "fan" ? "小风扇" : "冰箱"}！已放置在身边` : "开出了装置，但周围没有空地……";
    }
    if (roll < 0.7) { p.sun += 10; return "开出了 10 阳光！"; }
    if (roll < 0.85) { p.sun += 5; return "开出了 5 阳光"; }
    return "谢谢惠顾～";
  }

  /** 在玩家身旁放置装置 */
  private placeDevice(type: "cannon" | "fan" | "fridge", p: SimPlayer): boolean {
    const spots = [
      { gx: Math.round(p.x), gy: Math.round(p.y) },
      { gx: Math.round(p.x) + 1, gy: Math.round(p.y) },
      { gx: Math.round(p.x) - 1, gy: Math.round(p.y) },
      { gx: Math.round(p.x), gy: Math.round(p.y) + 1 },
      { gx: Math.round(p.x), gy: Math.round(p.y) - 1 },
    ];
    const spot = spots.find(c =>
      c.gx > 0 && c.gx < GRID_W && c.gy > 0 && c.gy < GRID_H &&
      this.grid[c.gy * GRID_W + c.gx] === Tile.Floor &&
      !this.houseBlock.has(c.gy * GRID_W + c.gx) &&
      !this.devices.some(d => d.gx === c.gx && d.gy === c.gy) &&
      ![...this.items.keys()].some(ik => ik === c.gy * GRID_W + c.gx),
    );
    if (!spot) return false;
    this.devices.push({
      id: this.nextId++, type, gx: spot.gx, gy: spot.gy,
      ownerId: p.id, cdUntil: this.elapsedMs,
    });
    return true;
  }

  /** 装置：加农炮自动攻击 / 风扇冰箱减速光环 */
  private stepDevices(dtMs: number): void {
    for (const d of this.devices) {
      if (d.type === "cannon") {
        if (this.elapsedMs < d.cdUntil) continue;
        let target: SimMonster | null = null;
        let bestD = CANNON_RANGE;
        for (const m of this.monsters) {
          const dist = Math.hypot(m.x - d.gx, m.y - d.gy);
          if (dist <= CANNON_RANGE && (bestD === CANNON_RANGE || dist < bestD)) {
            bestD = dist;
            target = m;
          }
        }
        if (!target) continue;
        d.cdUntil = this.elapsedMs + CANNON_COOLDOWN;
        target.hp -= CANNOW_DAMAGE;
        d.flashUntil = this.elapsedMs + 200;
        if (target.hp <= 0) {
          this.monsters = this.monsters.filter(x => x !== target);
          const owner = this.players.get(d.ownerId);
          if (owner) owner.sun += SUN_PER_MONSTER + target.level * 2;
        }
      }
    }
    // 怪物减速光环在 stepMonsters 内读取设备位置
    void dtMs;
  }

  /** 怪物当前移速（考虑风扇/冰箱光环） */
  private monsterSlowFactor(m: SimMonster): number {
    let f = 1;
    for (const d of this.devices) {
      if (d.type === "fan" && Math.hypot(m.x - d.gx, m.y - d.gy) <= FAN_RANGE) f *= FAN_SLOW;
      if (d.type === "fridge" && Math.hypot(m.x - d.gx, m.y - d.gy) <= FRIDGE_RANGE) f *= FRIDGE_SLOW;
    }
    return f;
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
    // 被精灵球困住：无法移动
    if (this.elapsedMs < p.trappedUntil) {
      p.dir = null;
      p.input = "none";
      return;
    }
    // 静止时先尝试起步；起步后同一帧即推进（起步帧不浪费）
    if (p.dir === null) this.tryContinue(p);
    if (p.dir !== null) {
      p.facing = p.dir;
      const snowFactor = this.weather === "snow" && !p.bootsOn ? SNOW_SLOW_FACTOR : 1;
      const mountFactor = p.mounted ? MOUNT_SPEED_FACTOR : 1;
      const speed = SPEED_LEVELS[p.speedLevel - 1] * snowFactor * mountFactor;
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
      case ItemType.Vehicle: p.mounted = true; break; // 骑上载具：移速 x1.6，被炸会掉下来
      case ItemType.Portal: this.spawnPortalPair(); break; // 地图上出现一对胶囊
      case ItemType.Laser: p.weapon = "laser"; break;
      case ItemType.Pistol: p.weapon = "pistol"; break;
      case ItemType.Shield: p.weapon = "shield"; break;
      case ItemType.Pokeball: p.weapon = "pokeball"; break;
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

    for (const c of cells) this.applyCellHit(c, exploded, "exploded", b.ownerId);
  }

  /** 火焰/闪电压到某一格的共有逻辑 */
  private applyCellHit(c: Vec, exploded: Set<number> | null, source: "exploded" | "lightningStrike" | "laser", creditId?: string): void {
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
    // 怪物受伤（冒险模式）：不同来源伤害不同
    const mdmg = source === "laser" ? 15 : 10;
    for (const m of this.monsters) {
      if (m.hp > 0 && Math.round(m.x) === c.gx && Math.round(m.y) === c.gy) m.hp -= mdmg;
    }
    this.monsters = this.monsters.filter(m => m.hp > 0);
    // 击杀奖励阳光归伤害来源
    for (const m of [...this.monsters]) {
      if (m.hp <= 0) {
        this.monsters = this.monsters.filter(x => x !== m);
        if (creditId) {
          const owner = this.players.get(creditId);
          if (owner) owner.sun += SUN_PER_MONSTER + m.level * 2;
        }
      }
    }
    // 怪物房屋受伤（爆炸才能拆，闪电不行）
    if (source === "exploded") {
      for (const h of this.houses) {
        if (!h.destroyed && h.gx === c.gx && h.gy === c.gy) {
          h.hp -= 2;
          if (h.hp <= 0) h.destroyed = true;
        }
      }
    }
    const cause = source === "lightningStrike" ? "lightning" : source === "laser" ? "laser" : "explosion";
    for (const p of this.players.values()) {
      if (
        p.alive &&
        Math.round(p.x) === c.gx &&
        Math.round(p.y) === c.gy
      ) {
        this.killPlayer(p, cause);
      }
    }
  }

  /** 软墙被烧毁后的掉落：天气专属道具 + 稀有装置 + 经典三件 */
  private rollDrop(): ItemType | null {
    if (this.weather !== "sunny" && this.rng() < WEATHER_ITEM_RATE) {
      switch (this.weather) {
        case "snow": return ItemType.Boots;
        case "rain": return ItemType.Rod;
        case "fog": return ItemType.Lantern;
      }
    }
    if (this.rng() >= ITEM_DROP_RATE) return null;
    const gadget = this.rng();
    if (gadget < 0.2) {
      // 稀有装置（占掉落总量的 6%）
      const rare = this.rng();
      if (rare < 0.17) return ItemType.Vehicle;
      if (rare < 0.34) return ItemType.Portal;
      if (rare < 0.5) return ItemType.Laser;
      if (rare < 0.67) return ItemType.Pistol;
      if (rare < 0.84) return ItemType.Shield;
      return ItemType.Pokeball;
    }
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

  /** 使用当前武器（激光剑/手枪/精灵球；盾牌为被动） */
  attack(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || !p.alive || this.phase === "ended") return;
    if (this.elapsedMs < p.attackReadyAt) return;
    if (p.weapon === "laser") {
      p.attackReadyAt = this.elapsedMs + LASER_COOLDOWN;
      const d: Dir = p.facing ?? "down";
      const cells: Vec[] = [];
      let x = Math.round(p.x);
      let y = Math.round(p.y);
      for (let r = 1; r <= LASER_RANGE; r++) {
        x += dirDx(d);
        y += dirDy(d);
        if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) break;
        if (this.grid[y * GRID_W + x] === Tile.HardWall) break;
        cells.push({ gx: x, gy: y });
      }
      this.events.push({ type: "laser", ownerId: p.id, cells });
      for (const c of cells) {
        this.applyCellHit(c, null, "laser", p.id);
        for (const t of this.players.values()) {
          if (t.id !== p.id && t.alive && Math.round(t.x) === c.gx && Math.round(t.y) === c.gy) {
            this.killPlayer(t, "laser");
          }
        }
      }
    } else if (p.weapon === "pistol") {
      p.attackReadyAt = this.elapsedMs + PISTOL_COOLDOWN;
      const d: Dir = p.facing ?? "down";
      this.bullets.push({
        id: this.nextId++, x: p.x, y: p.y,
        dx: dirDx(d), dy: dirDy(d), ownerId: p.id, traveled: 0,
      });
    } else if (p.weapon === "pokeball") {
      p.attackReadyAt = this.elapsedMs + CAPTURE_MS;
      let best: SimPlayer | null = null;
      let bestD = CAPTURE_RANGE;
      for (const t of this.players.values()) {
        if (t.id === p.id || !t.alive) continue;
        const d = Math.hypot(t.x - p.x, t.y - p.y);
        if (d <= bestD) { bestD = d; best = t; }
      }
      if (best) {
        best.trappedUntil = this.elapsedMs + CAPTURE_MS; // 5 秒后自动出来
        best.dir = null;
      }
    }
  }

  /** 统一击杀流程：载具挡一命 → 无敌帧/避雷针 → 生命 -1 → 安排复活 */
  private killPlayer(p: SimPlayer, cause: "explosion" | "lightning" | "monster" | "laser" | "pistol" | "forfeit"): void {
    if (!p.alive) return;
    // 载具替玩家挨一下：被打下来掉在原地，别人可以捡走
    if (p.mounted && cause !== "forfeit") {
      p.mounted = false;
      this.dropItemAt(Math.round(p.x), Math.round(p.y), ItemType.Vehicle);
      p.invincibleUntil = this.elapsedMs + 1_200;
      return;
    }
    if (cause !== "forfeit") {
      if (this.elapsedMs < p.invincibleUntil) return;
      if (cause === "lightning" && p.rodOn) return;
    }
    p.alive = false;
    p.lives = Math.max(0, p.lives - 1);
    p.respawnAt = p.lives > 0 ? this.elapsedMs + RESPAWN_MS : 0;
    this.events.push({ type: "died", playerId: p.id, gx: Math.round(p.x), gy: Math.round(p.y) });
  }

  private dropItemAt(gx: number, gy: number, type: ItemType): void {
    const spot = this.isCellFree(gx, gy)
      ? { gx, gy }
      : [{ gx: gx + 1, gy }, { gx: gx - 1, gy }, { gx, gy: gy + 1 }, { gx, gy: gy - 1 }]
          .find(c => c.gy >= 0 && c.gy < GRID_H && c.gx >= 0 && c.gx < GRID_W && this.grid[c.gy * GRID_W + c.gx] === Tile.Floor);
    if (!spot) return;
    this.items.set(spot.gy * GRID_W + spot.gx, { id: this.nextId++, gx: spot.gx, gy: spot.gy, type });
  }

  private stepRespawns(): void {
    for (const p of this.players.values()) {
      if (p.alive || p.lives <= 0 || p.respawnAt === 0 || this.elapsedMs < p.respawnAt) continue;
      const s = SPAWNS[p.spawnIndex % 4];
      p.x = s.gx; p.y = s.gy; p.fromX = s.gx; p.fromY = s.gy;
      p.progress = 0; p.dir = null; p.input = "none";
      p.alive = true;
      p.invincibleUntil = this.elapsedMs + RESPAWN_INVINCIBLE_MS;
      p.trappedUntil = 0;
      p.respawnAt = 0;
    }
  }

  private stepBullets(dtMs: number): void {
    for (const b of this.bullets) {
      const stepLen = (PISTOL_SPEED * dtMs) / 1000;
      const sub = Math.ceil(stepLen); // 细分步进避免穿透
      for (let i = 0; i < sub; i++) {
        b.x += (b.dx * stepLen) / sub;
        b.y += (b.dy * stepLen) / sub;
        b.traveled += stepLen / sub;
        const gx = Math.round(b.x);
        const gy = Math.round(b.y);
        if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) { b.traveled = PISTOL_RANGE + 1; break; }
        if (this.grid[gy * GRID_W + gx] !== Tile.Floor) { b.traveled = PISTOL_RANGE + 1; break; }
        if (this.houseBlock.has(gy * GRID_W + gx)) { b.traveled = PISTOL_RANGE + 1; break; }
        let stop = false;
        for (const p of this.players.values()) {
          if (!p.alive || p.id === b.ownerId) continue;
          if (Math.round(p.x) !== gx || Math.round(p.y) !== gy) continue;
          if (p.weapon === "shield") {
            // 盾牌反弹：子弹反向飞行，归属换成持盾者（可以打到原来的人）
            b.dx *= -1;
            b.dy *= -1;
            b.ownerId = p.id;
          } else {
            this.killPlayer(p, "pistol");
            b.traveled = PISTOL_RANGE + 1;
          }
          stop = true;
          break;
        }
        if (stop) break;
        for (const m of this.monsters) {
          if (m.hp > 0 && Math.round(m.x) === gx && Math.round(m.y) === gy) {
            m.hp = m.hp > 2 ? m.hp - 2 : 0;
            if (m.hp === 0) this.monsters = this.monsters.filter(x => x !== m);
            b.traveled = PISTOL_RANGE + 1;
            stop = true;
            break;
          }
        }
        if (stop) break;
        for (const h of this.houses) {
          if (!h.destroyed && h.gx === gx && h.gy === gy) {
            h.hp = h.hp > 2 ? h.hp - 2 : 0;
            if (h.hp === 0) h.destroyed = true;
            b.traveled = PISTOL_RANGE + 1;
            stop = true;
            break;
          }
        }
        if (stop) break;
        if (b.traveled > PISTOL_RANGE) break;
      }
    }
    this.bullets = this.bullets.filter(b => b.traveled <= PISTOL_RANGE);
  }

  private stepPortals(): void {
    this.portalPairs = this.portalPairs.filter(pp => pp.until > this.elapsedMs);
    for (const pp of this.portalPairs) {
      const cells = [
        { gx: pp.ax, gy: pp.ay },
        { gx: pp.bx, gy: pp.by },
      ];
      for (const p of this.players.values()) {
        if (!p.alive || this.elapsedMs < p.portalCdUntil) continue;
        const pgx = Math.round(p.x);
        const pgy = Math.round(p.y);
        const at = cells.findIndex(c => c.gx === pgx && c.gy === pgy);
        if (at < 0) continue;
        const dest = cells[1 - at];
        p.x = dest.gx; p.y = dest.gy;
        p.fromX = dest.gx; p.fromY = dest.gy;
        p.progress = 0; p.dir = null;
        p.portalCdUntil = this.elapsedMs + PORTAL_COOLDOWN;
        p.invincibleUntil = Math.max(p.invincibleUntil, this.elapsedMs + 1_000);
      }
    }
  }

  forfeit(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || !p.alive || this.phase === "ended") return;
    p.alive = false;
    p.lives = 0; // 认输 = 放弃剩余生命
    p.respawnAt = 0;
    this.events.push({ type: "died", playerId, gx: Math.round(p.x), gy: Math.round(p.y) });
    this.checkEnd();
  }

  // ---------- 冒险模式 ----------

  /** 初始化怪物房屋：占住四个边中点，格子变为不可通行的地基；并保证屋门一侧有站立格 */
  private initHouses(): void {
    const spots = [
      [8, 1], [1, 7], [GRID_W - 2, 7], [8, GRID_H - 2],
    ];
    for (const [gx, gy] of spots) {
      this.grid[gy * GRID_W + gx] = Tile.Floor; // 地基清理干净
      const doorY = gy + 1 <= GRID_H - 2 ? gy + 1 : gy - 1; // 朝地图中心一侧留出门口
      this.grid[doorY * GRID_W + gx] = Tile.Floor;
      this.houseBlock.add(gy * GRID_W + gx);
      this.houses.push({
        id: this.nextId++, gx, gy,
        hp: HOUSE_MAX_HP, maxHp: HOUSE_MAX_HP, destroyed: false,
      });
    }
  }

  /** 穿梭胶囊：在两只随机空格生成一对互相连通的胶囊（25 秒后消失） */
  private spawnPortalPair(): void {
    const free: number[] = [];
    for (let gy = 1; gy < GRID_H - 1; gy++)
      for (let gx = 1; gx < GRID_W - 1; gx++) {
        const i = gy * GRID_W + gx;
        if (this.grid[i] === Tile.Floor && !this.houseBlock.has(i)) free.push(i);
      }
    if (free.length < 2) return;
    const pick = () => free.splice(Math.floor(this.rng() * free.length), 1)[0];
    const a = pick();
    // 胶囊 B 离 A 至少 5 格
    let b = a;
    for (let tries = 0; tries < 20 && Math.abs(Math.floor(b / GRID_W) - Math.floor(a / GRID_W)) + Math.abs((b % GRID_W) - (a % GRID_W)) < 5; tries++) {
      b = free[Math.floor(this.rng() * free.length)] ?? a;
    }
    const ax = a % GRID_W, ay = Math.floor(a / GRID_W);
    const bx = b % GRID_W, by = Math.floor(b / GRID_W);
    this.portalPairs.push({ id: this.nextId++, ax, ay, bx, by, until: this.elapsedMs + PORTAL_TTL });
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
    return Math.min(MONSTER_MAX_LEVEL, 1 + Math.floor(huntMs / MONSTER_LEVEL_MS));
  }

  private monsterSpeed(m: SimMonster): number {
    const base = Math.min(MONSTER_MAX_SPEED, MONSTER_BASE_SPEED + (m.level - 1) * MONSTER_SPEED_PER_LEVEL);
    return base * this.monsterSlowFactor(m); // 风扇/冰箱光环减速
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
      // 攻击：与玩家同格即击杀（无敌帧可躲；载具会被打掉）
      const before = this.monsters.length;
      for (const p of this.players.values()) {
        if (
          p.alive &&
          Math.round(p.x) === Math.round(m.x) &&
          Math.round(p.y) === Math.round(m.y)
        ) {
          this.killPlayer(p, "monster");
        }
      }
      if (this.monsters.length < before || this.monsters.length < MONSTER_MAX_COUNT) {
        if (this.monsters.length < before) this.spawnMonster(); // 杀死玩家 → 多刷一只
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
    // 还有待复活的玩家时不结算
    if (this.players.size >= 2 && [...this.players.values()].some(p => p.lives > 0 && !p.alive && p.respawnAt > 0)) return;
    const contenders = [...this.players.values()].filter(p => p.alive || p.lives > 0);
    if (this.gameType === "adventure") {
      // 冒险模式：消灭全部怪物 = 胜利；全员生命耗尽 = 失败
      if (this.phase === "playing" && this.monsters.length === 0) {
        this.phase = "ended";
        this.winnerIds = contenders.map(p => p.id);
        this.events.push({ type: "ended", winnerIds: this.winnerIds });
      } else if (contenders.length === 0) {
        this.phase = "ended";
        this.winnerIds = [];
        this.events.push({ type: "ended", winnerIds: [] });
      }
      return;
    }
    if (this.players.size < 2) return; // 单人练习模式不结算
    if (contenders.length <= 1) {
      this.phase = "ended";
      this.winnerIds = contenders.filter(p => p.alive).map(p => p.id);
      this.events.push({ type: "ended", winnerIds: this.winnerIds });
    }
  }
}
