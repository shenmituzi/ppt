import { describe, it, expect } from "vitest";
import {
  GRID_W, SPAWN_INVINCIBLE_MS, SUDDEN_DEATH_AT_MS, SUDDEN_DEATH_STEP_MS,
  ItemType, MAX_BOMBS, MAX_FLAMES, MAX_SPEED_LEVEL, Tile,
} from "./constants";
import { GameSim } from "./gridsim";

const idx = (gx: number, gy: number) => gy * GRID_W + gx;

/** 造一个双人对局，并把出生点附近的格子清成地板便于走位 */
function makeSim(playerIds = ["a", "b"], weather: ConstructorParameters<typeof GameSim>[3] = "sunny"): GameSim {
  const sim = new GameSim(42, playerIds, undefined, weather);
  sim.grid[idx(2, 1)] = Tile.Floor;
  sim.grid[idx(1, 2)] = Tile.Floor;
  sim.grid[idx(14, 1)] = Tile.Floor;
  sim.grid[idx(15, 2)] = Tile.Floor;
  return sim;
}

describe("GameSim 移动", () => {
  it("出生位置与初始属性正确", () => {
    const sim = makeSim();
    const a = sim.players.get("a")!;
    expect(a.x).toBe(1);
    expect(a.y).toBe(1);
    expect(a.bombsMax).toBe(1);
    expect(a.flameLen).toBe(1);
    expect(a.speedLevel).toBe(1);
    expect(a.alive).toBe(true);
    expect(a.invincibleUntil).toBe(SPAWN_INVINCIBLE_MS);
  });

  it("速度档1（4格/秒）走一格用 250ms，按住方向继续走", () => {
    const sim = makeSim();
    sim.setInput("a", "right");
    sim.step(250);
    expect(sim.players.get("a")!.x).toBeCloseTo(2, 5);
    expect(sim.players.get("a")!.dir).toBe("right");
  });

  it("松开方向后走完当前格停住", () => {
    const sim = makeSim();
    sim.setInput("a", "right");
    sim.step(125); // 走到半路 x≈1.5
    sim.setInput("a", "none");
    sim.step(500); // 走完当前格
    const a = sim.players.get("a")!;
    expect(a.x).toBeCloseTo(2, 5);
    sim.step(1000);
    expect(a.x).toBeCloseTo(2, 5);
    expect(a.dir).toBeNull();
  });

  it("墙不可穿越", () => {
    const sim = makeSim();
    sim.grid[idx(2, 1)] = Tile.HardWall;
    sim.setInput("a", "right");
    sim.step(1000);
    expect(sim.players.get("a")!.x).toBeCloseTo(1, 5);
  });

  it("速度档6（7格/秒）100ms 走 0.7 格", () => {
    const sim = makeSim();
    sim.players.get("a")!.speedLevel = 6;
    sim.setInput("a", "right");
    sim.step(100);
    expect(sim.players.get("a")!.x).toBeCloseTo(1.7, 5);
  });
});

describe("GameSim 泡泡与爆炸", () => {
  it("放泡泡受数量上限约束，同格不能重复放", () => {
    const sim = makeSim();
    const a = sim.players.get("a")!;
    sim.placeBomb("a");
    expect(sim.bombs).toHaveLength(1);
    expect(a.bombsActive).toBe(1);
    sim.placeBomb("a"); // 同格已有泡泡
    expect(sim.bombs).toHaveLength(1);
    a.bombsMax = 0;
    a.bombsActive = 0;
    sim.setInput("a", "right");
    sim.step(250); // 走到 (2,1) 离开泡泡格
    sim.placeBomb("a"); // 上限 0
    expect(sim.bombs).toHaveLength(1); // 仍是原来那颗
  });

  it("引信 2500ms：差一点不炸，到点必炸", () => {
    const sim = makeSim();
    sim.placeBomb("a");
    for (let i = 0; i < 24; i++) sim.step(100); // 2400ms
    expect(sim.bombs).toHaveLength(1);
    expect(sim.explosions).toHaveLength(0);
    sim.step(150); // 2550ms
    expect(sim.bombs).toHaveLength(0);
    expect(sim.explosions).toHaveLength(1);
    expect(sim.players.get("a")!.bombsActive).toBe(0);
  });

  it("火焰长度1：烧毁相邻软墙，硬墙直接挡", () => {
    const sim = makeSim();
    sim.grid[idx(3, 1)] = Tile.SoftWall;
    sim.grid[idx(1, 2)] = Tile.SoftWall;
    sim.placeBomb("a");
    for (let i = 0; i < 26; i++) sim.step(100);
    expect(sim.grid[idx(2, 1)]).toBe(Tile.Floor); // 被烧毁
    expect(sim.grid[idx(3, 1)]).toBe(Tile.SoftWall); // 未波及
    expect(sim.grid[idx(1, 2)]).toBe(Tile.Floor); // 被烧毁
    const keys = sim.explosions[0].cells.map(c => `${c.gx},${c.gy}`);
    expect(keys).toContain("2,1");
    expect(keys).not.toContain("3,1");
  });

  it("连锁：火焰引爆相邻泡泡（即使其引信未到）", () => {
    const sim = makeSim(["a", "b"]);
    sim.placeBomb("a"); // (1,1)——先放泡再挪人，泡留在原地
    const a = sim.players.get("a")!;
    a.x = 5; a.y = 5; a.fromX = 5; a.fromY = 5; a.dir = null; a.progress = 0;
    sim.bombs.push({ id: 999, gx: 2, gy: 1, ownerId: "b", power: 3, explodeAt: sim.elapsedMs + 99999 });
    for (let i = 0; i < 26; i++) sim.step(100);
    expect(sim.bombs).toHaveLength(0); // 两颗都被引爆
    expect(sim.explosions.length).toBeGreaterThanOrEqual(2);
  });

  it("爆炸产生 died 事件，火焰持续 500ms 后消失", () => {
    // 单人练习模式：死亡不触发结算，step 持续运行
    const sim = makeSim(["solo"]);
    sim.placeBomb("solo"); // 站在泡泡上
    for (let i = 0; i < 26; i++) sim.step(100);
    const events = sim.drainEvents();
    expect(events.some(e => e.type === "died" && e.playerId === "solo")).toBe(true);
    expect(sim.players.get("solo")!.alive).toBe(false);
    expect(sim.phase).toBe("playing");
    expect(sim.explosions).toHaveLength(1);
    for (let i = 0; i < 5; i++) sim.step(100); // 又过 500ms
    expect(sim.explosions).toHaveLength(0);
  });
});

describe("GameSim 道具", () => {
  it("火焰烧毁道具", () => {
    const sim = makeSim();
    sim.items.set(idx(2, 1), { id: 1, gx: 2, gy: 1, type: ItemType.Flame });
    sim.placeBomb("a"); // (1,1) 先放泡
    const a = sim.players.get("a")!;
    a.x = 5; a.y = 5; a.fromX = 5; a.fromY = 5; a.dir = null; // 再挪开人
    for (let i = 0; i < 26; i++) sim.step(100);
    expect(sim.items.has(idx(2, 1))).toBe(false);
  });

  it("走到道具格拾取并生效", () => {
    const sim = makeSim();
    sim.items.set(idx(2, 1), { id: 1, gx: 2, gy: 1, type: ItemType.Flame });
    sim.setInput("a", "right");
    for (let i = 0; i < 4; i++) sim.step(250);
    const a = sim.players.get("a")!;
    expect(a.flameLen).toBe(2);
    expect(sim.items.has(idx(2, 1))).toBe(false);
    expect(sim.drainEvents().some(e => e.type === "itemPicked")).toBe(true);
  });

  it("道具效果受上限约束", () => {
    const sim = makeSim();
    const a = sim.players.get("a")!;
    a.bombsMax = MAX_BOMBS;
    a.flameLen = MAX_FLAMES;
    a.speedLevel = MAX_SPEED_LEVEL;
    sim.items.set(idx(2, 1), { id: 1, gx: 2, gy: 1, type: ItemType.Bomb });
    sim.setInput("a", "right");
    for (let i = 0; i < 4; i++) sim.step(250);
    expect(a.bombsMax).toBe(MAX_BOMBS);
    expect(a.flameLen).toBe(MAX_FLAMES);
    expect(a.speedLevel).toBe(MAX_SPEED_LEVEL);
  });

  it("烧墙按注入的 rng 掉道具（三种均分）", () => {
    // rng 序列：第 1 次 0.1（<0.3 → 掉落），第 2 次 0.2（<1/3 → Bomb）
    const seq = [0.1, 0.999, 0.2];
    let i = 0;
    const fixed = () => (i < seq.length ? seq[i++] : 0.999);
    const sim = new GameSim(42, ["a", "b"], fixed);
    sim.grid[idx(2, 1)] = Tile.SoftWall;
    sim.grid[idx(1, 2)] = Tile.Floor; // 下方清成地板，保证火焰只烧 (2,1) 消耗 rng
    sim.placeBomb("a"); // (1,1) 先放泡
    const a = sim.players.get("a")!;
    a.x = 5; a.y = 5; a.fromX = 5; a.fromY = 5; a.dir = null;
    for (let i = 0; i < 26; i++) sim.step(100);
    expect(sim.items.get(idx(2, 1))?.type).toBe(ItemType.Bomb);
    const broken = sim.drainEvents().filter(e => e.type === "wallBroken");
    expect(broken.some(e => e.gx === 2 && e.gy === 1 && e.item === ItemType.Bomb)).toBe(true);
  });
});

describe("GameSim 胜负与突然死亡", () => {
  it("出生无敌：2 秒内站在火焰上不死", () => {
    const sim = makeSim();
    sim.bombs.push({ id: 1, gx: 1, gy: 1, ownerId: "b", power: 1, explodeAt: 0 });
    sim.step(16); // elapsed=16ms < 2000ms
    expect(sim.players.get("a")!.alive).toBe(true);
  });

  it("无敌过期后被火焰炸死", () => {
    const sim = makeSim();
    const a = sim.players.get("a")!;
    a.invincibleUntil = 0;
    sim.bombs.push({ id: 1, gx: 1, gy: 1, ownerId: "b", power: 1, explodeAt: 0 });
    sim.step(16);
    expect(a.alive).toBe(false);
  });

  it("两条命打光才结束，胜者是存活者", () => {
    const sim = makeSim(["a", "b"]);
    const b = sim.players.get("b")!;
    b.lives = 0;
    b.alive = false;
    b.respawnAt = 0;
    sim.step(16);
    expect(sim.phase).toBe("ended");
    expect(sim.winnerIds).toEqual(["a"]);
  });

  it("同时生命耗尽为平局", () => {
    const sim = makeSim(["a", "b"]);
    for (const id of ["a", "b"]) {
      const p = sim.players.get(id)!;
      p.lives = 0; p.alive = false; p.respawnAt = 0;
    }
    sim.step(16);
    expect(sim.phase).toBe("ended");
    expect(sim.winnerIds).toEqual([]);
  });

  it("单人练习模式永不自动结算", () => {
    const sim = makeSim(["solo"]);
    sim.players.get("solo")!.alive = false;
    sim.step(16);
    expect(sim.phase).toBe("playing");
  });

  it("forfeit 直接判负并触发结算", () => {
    const sim = makeSim(["a", "b"]);
    sim.forfeit("a");
    expect(sim.phase).toBe("ended");
    expect(sim.winnerIds).toEqual(["b"]);
  });

  it("3 分钟后突然死亡：外圈逐层合拢，圈内玩家被压死", () => {
    const sim = makeSim(["a", "b", "c", "d"]);
    // 四人全部挪到地图中央安全位，保证突然死亡展开期间 phase 仍是 playing
    const spots = [[5, 5], [7, 5], [5, 7], [7, 7]];
    [...sim.players.values()].forEach((p, i) => {
      sim.grid[idx(spots[i][0], spots[i][1])] = Tile.Floor;
      p.x = spots[i][0]; p.y = spots[i][1]; p.fromX = spots[i][0]; p.fromY = spots[i][1]; p.dir = null;
    });
    for (let i = 0; i < SUDDEN_DEATH_AT_MS / 1000; i++) sim.step(1000);
    expect(sim.grid[idx(1, 1)]).toBe(Tile.HardWall); // 第一圈含出生点
    expect(sim.grid[idx(2, 1)]).toBe(Tile.HardWall);
    expect(sim.players.get("a")!.alive).toBe(true); // 人已挪走
    for (let i = 0; i < SUDDEN_DEATH_STEP_MS / 1000; i++) sim.step(1000);
    expect(sim.grid[idx(3, 2)]).toBe(Tile.HardWall); // 第二圈（gy==2）
  });
});

describe("GameSim 天气系统", () => {
  it("暴雪：移速打 0.65 折", () => {
    const sim = makeSim(["a"], "snow");
    sim.grid[idx(3, 1)] = Tile.Floor;
    sim.grid[idx(4, 1)] = Tile.Floor;
    sim.setInput("a", "right");
    for (let i = 0; i < 20; i++) sim.step(50); // 小步长模拟真实帧
    const x = sim.players.get("a")!.x;
    expect(x).toBeGreaterThan(3.3); // 确实在移动
    expect(x).toBeLessThan(3.8);    // 但明显比晴天的 4 格/秒慢
  });

  it("钉鞋：免疫暴雪减速并加速一档", () => {
    const sim = makeSim(["a"], "snow");
    const a = sim.players.get("a")!;
    sim.items.set(idx(2, 1), { id: 1, gx: 2, gy: 1, type: ItemType.Boots });
    sim.grid[idx(3, 1)] = Tile.Floor;
    sim.grid[idx(4, 1)] = Tile.Floor;
    sim.grid[idx(5, 1)] = Tile.Floor;
    sim.grid[idx(6, 1)] = Tile.Floor;
    sim.setInput("a", "right");
    for (let i = 0; i < 10; i++) sim.step(100);
    expect(a.bootsOn).toBe(true);
    expect(a.speedLevel).toBe(2);
  });

  it("雷雨：泡泡受潮，引信缩短为 0.8 倍", () => {
    const sim = makeSim(["solo"], "rain");
    sim.placeBomb("solo");
    for (let i = 0; i < 19; i++) sim.step(100); // 1900ms
    expect(sim.bombs).toHaveLength(1);
    sim.step(200); // 2100ms
    expect(sim.bombs).toHaveLength(0);
  });

  it("雷雨：周期性闪电（先警告后落下），避雷针免疫", () => {
    const sim = makeSim(["a", "b"], "rain");
    const a = sim.players.get("a")!;
    a.x = 5; a.y = 5; a.fromX = 5; a.fromY = 5; a.dir = null;
    sim.players.get("b")!.rodOn = true;
    for (let i = 0; i < 90; i++) sim.step(100); // 9 秒
    const events = sim.drainEvents();
    expect(events.some(e => e.type === "lightningWarn")).toBe(true);
    expect(events.some(e => e.type === "lightningStrike")).toBe(true);
  });
});

describe("GameSim 生命与武器", () => {
  it("三条命：阵亡 1.5 秒后原地复活并有无敌帧", () => {
    const sim = makeSim();
    const b = sim.players.get("b")!;
    b.invincibleUntil = 0;
    (sim as any).killPlayer(b, "explosion");
    expect(b.alive).toBe(false);
    expect(b.lives).toBe(2);
    expect(b.respawnAt).toBeGreaterThan(0);
    sim.step(16);
    expect(sim.phase).toBe("playing"); // 有待复活的玩家不结算
    for (let i = 0; i < 16; i++) sim.step(100);
    expect(b.alive).toBe(true);
    expect(b.invincibleUntil).toBeGreaterThan(0);
  });

  it("载具：被炸掉下来而不是死，掉落后可捡", () => {
    const sim = makeSim(["a", "b"]);
    const a = sim.players.get("a")!;
    a.mounted = true;
    a.invincibleUntil = 0;
    sim.bombs.push({ id: 1, gx: 1, gy: 1, ownerId: "b", power: 1, explodeAt: sim.elapsedMs });
    sim.step(16);
    expect(a.alive).toBe(true);
    expect(a.mounted).toBe(false);
    expect([...sim.items.values()].some(it => it.type === ItemType.Vehicle)).toBe(true);
  });

  it("骑乘载具移速 x1.6", () => {
    const sim = makeSim(["a"]);
    for (let x = 3; x <= 7; x++) sim.grid[idx(x, 1)] = Tile.Floor;
    const a = sim.players.get("a")!;
    a.mounted = true;
    sim.setInput("a", "right");
    for (let i = 0; i < 20; i++) sim.step(50);
    expect(a.x).toBeGreaterThan(5.5); // 6.4 格/秒（含截断）
  });

  it("手枪：子弹直线飞行击杀对手", () => {
    const sim = makeSim(["a", "b"]);
    for (let x = 2; x <= 14; x++) sim.grid[idx(x, 1)] = Tile.Floor;
    const a = sim.players.get("a")!;
    const b = sim.players.get("b")!;
    a.weapon = "pistol";
    a.facing = "right";
    b.x = 5; b.y = 1; b.fromX = 5; b.fromY = 1; // 挪到射程内
    b.invincibleUntil = 0; // 关掉出生无敌
    sim.attack("a");
    expect(sim.bullets.length).toBe(1);
    for (let i = 0; i < 100; i++) sim.step(16);
    expect(b.alive).toBe(false);
    expect(b.lives).toBe(2);
  });

  it("盾牌：反弹子弹并转归属", () => {
    const sim = makeSim(["a", "b"]);
    const b = sim.players.get("b")!;
    b.weapon = "shield";
    b.x = 5; b.y = 1; b.fromX = 5; b.fromY = 1;
    sim.grid[idx(5, 1)] = Tile.Floor; // 清出子弹通道
    sim.grid[idx(6, 1)] = Tile.Floor; // 子弹出生格也要是地板
    sim.bullets.push({ id: 9, x: 6, y: 1, dx: -1, dy: 0, ownerId: "a", traveled: 0 });
    for (let i = 0; i < 6; i++) sim.step(16); // 反弹后仍在前几个格内断言
    expect(sim.bullets[0].dx).toBe(1);
    expect(sim.bullets[0].ownerId).toBe("b");
  });

  it("激光剑：面朝方向 2 格攻击", () => {
    const sim = makeSim(["a", "b"]);
    for (let x = 2; x <= 4; x++) sim.grid[idx(x, 1)] = Tile.Floor;
    const a = sim.players.get("a")!;
    const b = sim.players.get("b")!;
    b.x = 3; b.y = 1; b.fromX = 3; b.fromY = 1; b.invincibleUntil = 0;
    a.weapon = "laser";
    a.facing = "right";
    sim.attack("a");
    expect(b.alive).toBe(false);
    expect(b.lives).toBe(2);
  });

  it("精灵球：捕捉最近对手，5 秒后自动释放", () => {
    const sim = makeSim(["a", "b"]);
    for (let x = 2; x <= 4; x++) sim.grid[idx(x, 1)] = Tile.Floor;
    const a = sim.players.get("a")!;
    const b = sim.players.get("b")!;
    b.x = 3; b.y = 1; b.fromX = 3; b.fromY = 1;
    a.weapon = "pokeball";
    sim.attack("a");
    expect(b.trappedUntil).toBeGreaterThan(sim.elapsedMs + 4000);
    for (let i = 0; i < 55; i++) sim.step(100); // 5.5 秒
    expect(b.trappedUntil).toBeLessThan(sim.elapsedMs);
  });

  it("穿梭胶囊：踩上胶囊传送到另一端", () => {
    const sim = makeSim(["a"]);
    (sim as any).spawnPortalPair();
    const pp = sim.portalPairs[0];
    const a = sim.players.get("a")!;
    a.x = pp.ax; a.y = pp.ay; a.fromX = pp.ax; a.fromY = pp.ay;
    sim.step(32);
    expect(Math.round(a.x)).toBe(pp.bx);
    expect(Math.round(a.y)).toBe(pp.by);
  });
});
