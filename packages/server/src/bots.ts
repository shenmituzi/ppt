import { GameSim, GRID_W, isSoft, type DirInput } from "@pt/shared";

/**
 * 冒险模式人机 AI：
 * - 狩猎期附近有怪物 → 靠近丢泡泡 → 逃跑拉开距离
 * - 平时找最近道具捡
 * - 没事在软墙旁放泡泡开路/找道具
 * 决策每 200ms 一次，移动方向保持到下次决策。
 */
export class BotBrain {
  private nextDecideAt = 0;
  private fleeUntil = 0;
  private fleeDir: DirInput = "none";
  private recentCells: string[] = [];
  private lastDir: DirInput = "none";

  constructor(
    private sim: GameSim,
    private id: string,
  ) {}

  tick(now: number): void {
    const me = this.sim.players.get(this.id);
    if (!me || !me.alive) return;
    const gx = Math.round(me.x);
    const gy = Math.round(me.y);
    const cell = `${gx},${gy}`;
    this.recentCells.push(cell);
    if (this.recentCells.length > 8) this.recentCells.shift();

    // 先处理爆炸预警：人机会读取泡泡的引信和火力，优先走向不在爆炸线上的格子。
    const danger = this.dangerCells();
    if (danger.has(`${gx},${gy}`)) {
      const escape = this.safeEscape(gx, gy, danger);
      if (escape !== "none") {
        this.sim.setInput(this.id, escape);
        return;
      }
    }

    // 逃离刚放的泡泡
    if (now < this.fleeUntil) {
      this.sim.setInput(this.id, this.fleeDir);
      return;
    }

    // 1) 猎杀附近的怪物
    let nearestM: { d: number; gx: number; gy: number } | null = null;
    for (const m of this.sim.monsters) {
      const d = Math.abs(m.x - gx) + Math.abs(m.y - gy);
      if (!nearestM || d < nearestM.d) nearestM = { d, gx: Math.round(m.x), gy: Math.round(m.y) };
    }
    if (this.sim.phase === "playing" && nearestM && nearestM.d <= 5) {
      if (nearestM.d <= 1 && me.bombsActive < me.bombsMax) {
        this.sim.placeBomb(this.id);
        this.fleeDir = this.stepAwayFrom(gx, gy, nearestM.gx, nearestM.gy);
        this.fleeUntil = now + 1600;
        this.sim.setInput(this.id, this.fleeDir);
        return;
      }
      this.sim.setInput(this.id, this.stepToward(gx, gy, nearestM.gx, nearestM.gy));
      return;
    }

    // 2) 找最近的道具
    let nearestI: { d: number; gx: number; gy: number } | null = null;
    for (const it of this.sim.items.values()) {
      const d = Math.abs(it.gx - gx) + Math.abs(it.gy - gy);
      if (!nearestI || d < nearestI.d) nearestI = { d, gx: it.gx, gy: it.gy };
    }
    if (nearestI && nearestI.d > 0) {
      this.sim.setInput(this.id, this.stepToward(gx, gy, nearestI.gx, nearestI.gy));
      return;
    }
    if (nearestI && nearestI.d === 0) {
      // 站在道具上（理论上已被拾取），随机走开
      this.sim.setInput(this.id, this.randomFreeDir(gx, gy, now));
      return;
    }

    // 3) 没有目标：偶尔在软墙旁放泡泡开路，否则随机游走
    if (this.adjacentSoft(gx, gy) && me.bombsActive < me.bombsMax && now % 1000 < 200) {
      this.sim.placeBomb(this.id);
      this.fleeDir = this.randomFreeDir(gx, gy, now);
      this.fleeUntil = now + 1200;
      this.sim.setInput(this.id, this.fleeDir);
      return;
    }
    if (now >= this.nextDecideAt) {
      this.nextDecideAt = now + 450;
      this.sim.setInput(this.id, this.randomFreeDir(gx, gy, now));
    }
  }

  private stepToward(gx: number, gy: number, tx: number, ty: number): DirInput {
    const dx = tx - gx;
    const dy = ty - gy;
    if (dx === 0 && dy === 0) return "none";
    const dirs: DirInput[] =
      Math.abs(dx) >= Math.abs(dy)
        ? [dx > 0 ? "right" : "left", dy > 0 ? "down" : "up"]
        : [dy > 0 ? "down" : "up", dx > 0 ? "right" : "left"];
    for (const d of dirs) {
      if (d && this.sim.isCellFree(gx + (d === "left" ? -1 : d === "right" ? 1 : 0), gy + (d === "up" ? -1 : d === "down" ? 1 : 0))) return d;
    }
    return "none";
  }

  private stepAwayFrom(gx: number, gy: number, fx: number, fy: number): DirInput {
    const dirs: DirInput[] = ["up", "down", "left", "right"];
    let best: DirInput = "none";
    let bestD = -1;
    for (const d of dirs) {
      const nx = gx + (d === "left" ? -1 : d === "right" ? 1 : 0);
      const ny = gy + (d === "up" ? -1 : d === "down" ? 1 : 0);
      if (!this.sim.isCellFree(nx, ny)) continue;
      const dist = Math.abs(nx - fx) + Math.abs(ny - fy);
      if (dist > bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  private randomFreeDir(gx: number, gy: number, now: number): DirInput {
    const dirs: DirInput[] = ["up", "down", "left", "right"];
    const offset = Math.floor(now / 450) % 4;
    for (let i = 0; i < 4; i++) {
      const d = dirs[(offset + i) % 4];
      const nx = gx + (d === "left" ? -1 : d === "right" ? 1 : 0);
      const ny = gy + (d === "up" ? -1 : d === "down" ? 1 : 0);
      if (d && this.sim.isCellFree(nx, ny) && !this.dangerCells().has(`${nx},${ny}`) &&
        !(this.recentCells.slice(-4).filter(c => c === `${nx},${ny}`).length >= 2 && d === this.lastDir)) {
        this.lastDir = d;
        return d;
      }
    }
    return "none";
  }

  private dangerCells(): Set<string> {
    const danger = new Set<string>();
    for (const b of this.sim.bombs) {
      if (b.explodeAt - this.sim.elapsedMs > 3200) continue;
      danger.add(`${b.gx},${b.gy}`);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let r = 1; r <= b.power; r++) {
          const x = b.gx + dx * r, y = b.gy + dy * r;
          if (!this.sim.isCellFree(x, y)) break;
          danger.add(`${x},${y}`);
        }
      }
    }
    return danger;
  }

  private safeEscape(gx: number, gy: number, danger: Set<string>): DirInput {
    const dirs: DirInput[] = ["up", "down", "left", "right"];
    for (const d of dirs) {
      const nx = gx + (d === "left" ? -1 : d === "right" ? 1 : 0);
      const ny = gy + (d === "up" ? -1 : d === "down" ? 1 : 0);
      if (this.sim.isCellFree(nx, ny) && !danger.has(`${nx},${ny}`)) return d;
    }
    return "none";
  }

  private adjacentSoft(gx: number, gy: number): boolean {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      const t = this.sim.grid[(gy + dy) * GRID_W + (gx + dx)];
      if (isSoft(t)) return true;
    }
    return false;
  }
}
