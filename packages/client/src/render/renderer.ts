import {
  BOMB_FUSE_MS, FLAME_MS, FOG_LANTERN_FACTOR, FOG_VISION_CELLS, GRID_H, GRID_W,
  ItemType, LIGHTNING_WARN_MS, SPAWNS, TILE, Tile,
} from "@pt/shared";
import type { FrameData } from "./frame";
import {
  TILES, drawPlayerBody, drawBombBody, drawFlameCell, drawItemTile,
  drawMonsterBody, rr, type ViewerView,
} from "./cozy";

export const PLAYER_COLORS = ["#ff8a8a", "#7cc4ff", "#ffd97a", "#8de0a0"];

export interface GhostView { x: number; y: number; colorIndex: number; diedAtMs: number }
export type { ViewerView };

const center = (v: number) => (v + 0.5) * TILE;

/** 与帧无关的格子伪随机数（纹理装饰用，保证不闪烁） */
function cellHash(gx: number, gy: number): number {
  let h = Math.imul(gx, 73856093) ^ Math.imul(gy, 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private vignette: CanvasGradient | null = null;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = GRID_W * TILE;
    canvas.height = GRID_H * TILE;
    this.ctx = canvas.getContext("2d")!;
  }

  draw(f: FrameData, nowMs: number, ghosts: GhostView[] = [], viewer: ViewerView | null = null) {
    const { ctx } = this;
    ctx.clearRect(0, 0, GRID_W * TILE, GRID_H * TILE);
    this.drawTiles(f.grid);
    for (const [i, s] of SPAWNS.entries()) this.drawSpawnPad(s.gx, s.gy, i);
    this.drawGroundWeather(f);
    for (const it of f.items) this.drawItem(it, nowMs);
    for (const b of f.bombs) this.drawBomb(b.gx, b.gy, b.fuse, nowMs);
    for (const fl of f.flames) this.drawFlame(fl, nowMs);
    for (const g of ghosts) this.drawGhost(g, nowMs);
    for (const h of f.houses) this.drawHouse(h);
    for (const m of f.monsters) this.drawMonster(m, nowMs);
    for (const p of f.players) this.drawPlayer(p, nowMs);
    this.drawSkyWeather(f, nowMs, viewer);
    this.drawVignette();
  }

  private drawTiles(grid: Uint8Array) {
    // 第一遍：草地（水晶缝隙透出地面）
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const h = cellHash(gx, gy);
        const tile = h % 17 === 0 ? TILES.grassFlower : h % 2 === 0 ? TILES.grassA : TILES.grassB;
        this.ctx.drawImage(tile, gx * TILE, gy * TILE, TILE, TILE);
      }
    }
    // 第二遍：墙与可炸方块
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const x = gx * TILE;
        const y = gy * TILE;
        const t = grid[gy * GRID_W + gx];
        if (t === Tile.HardWall) {
          this.ctx.drawImage(TILES.hedge, x, y, TILE, TILE);
        } else if (t >= Tile.SoftWall) {
          this.ctx.drawImage(TILES.soft[t - Tile.SoftWall], x, y, TILE, TILE);
        } else if (gy > 0 && grid[(gy - 1) * GRID_W + gx] !== Tile.Floor) {
          // 墙根投影
          this.ctx.fillStyle = "rgba(50,90,50,.14)";
          this.ctx.fillRect(x, y, TILE, 5);
        }
      }
    }
  }

  private drawSpawnPad(gx: number, gy: number, colorIndex: number) {
    const { ctx } = this;
    ctx.fillStyle = PLAYER_COLORS[colorIndex] + "45";
    rr(ctx, gx * TILE + 4, gy * TILE + 4, TILE - 8, TILE - 8, 8);
    ctx.fill();
    ctx.strokeStyle = PLAYER_COLORS[colorIndex] + "80";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    rr(ctx, gx * TILE + 4, gy * TILE + 4, TILE - 8, TILE - 8, 8);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawItem(it: FrameData["items"][number], nowMs: number) {
    const { ctx } = this;
    const bob = Math.sin(nowMs / 320) * 1.8;
    // 柔和底影
    ctx.fillStyle = "rgba(60,90,60,.15)";
    ctx.beginPath();
    ctx.ellipse(center(it.gx), center(it.gy) + 9, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    drawItemTile(ctx, center(it.gx), center(it.gy), it.type, nowMs);
  }

  private drawBomb(gx: number, gy: number, fuse: number, nowMs: number) {
    const { ctx } = this;
    const urgency = 1 - Math.min(1, fuse / BOMB_FUSE_MS);
    ctx.fillStyle = "rgba(60,90,60,.22)";
    ctx.beginPath();
    ctx.ellipse(center(gx), center(gy) + 9, 9, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    drawBombBody(ctx, center(gx), center(gy), urgency, nowMs);
  }

  private drawFlame(fl: FrameData["flames"][number], nowMs: number) {
    const { ctx } = this;
    const alpha = Math.max(0, Math.min(1, fl.life / FLAME_MS));
    fl.cells.forEach((c, i) => {
      drawFlameCell(ctx, center(c.gx), center(c.gy), i === 0, alpha, nowMs, i * 3);
    });
  }

  private drawPlayer(p: FrameData["players"][number], nowMs: number) {
    const { ctx } = this;
    if (!p.alive) return;
    if (p.invincible && Math.floor(nowMs / 150) % 2 === 0) return;
    drawPlayerBody(ctx, center(p.x), center(p.y), p.colorIndex % 4, p.moving, nowMs);
    // 无敌护盾
    if (p.invincible) {
      ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(center(p.x), center(p.y), 16, nowMs / 220, nowMs / 220 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 天气道具徽章
    let bx = center(p.x) - 8;
    const badge = (t: string) => {
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t, bx, center(p.y) - 21);
      bx += 12;
    };
    if (p.bootsOn) badge("❄");
    if (p.rodOn) badge("⚡");
    if (p.lanternOn) badge("🏮");
    // 昵称
    if (p.name) {
      ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(60,90,60,.65)";
      ctx.strokeText(p.name, center(p.x), center(p.y) - 15);
      ctx.fillStyle = "#fff";
      ctx.fillText(p.name, center(p.x), center(p.y) - 15);
    }
  }

  private drawGhost(g: GhostView, nowMs: number) {
    const t = (nowMs - g.diedAtMs) / 1500;
    if (t < 0 || t > 1) return;
    const { ctx } = this;
    const cx = center(g.x);
    const cy = center(g.y);
    ctx.globalAlpha = 0.7 * (1 - t);
    ctx.fillStyle = PLAYER_COLORS[g.colorIndex % 4];
    ctx.beginPath();
    ctx.arc(cx, cy, TILE * 0.28 * (1 + t * 0.7), 0, Math.PI * 2);
    ctx.fill();
    // 升天小天使圈
    ctx.strokeStyle = "rgba(255,220,120,.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 10 - t * 4, 5, 1.8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }

  private drawMonster(m: FrameData["monsters"][number], nowMs: number) {
    const { ctx } = this;
    drawMonsterBody(ctx, center(m.x), center(m.y), nowMs);
    // 血条
    const w = TILE * 0.8;
    const ratio = Math.max(0, Math.min(1, m.hp / m.maxHp));
    ctx.fillStyle = "rgba(255,252,245,.8)";
    rr(ctx, center(m.x) - w / 2 - 1, center(m.y) - TILE * 0.72 - 1, w + 2, 5, 2.5);
    ctx.fill();
    ctx.fillStyle = ratio > 0.5 ? "#7fc98a" : ratio > 0.25 ? "#ffcf6b" : "#ff8a8a";
    rr(ctx, center(m.x) - w / 2, center(m.y) - TILE * 0.72, w * ratio, 3, 1.5);
    ctx.fill();
  }

  private drawHouse(h: FrameData["houses"][number]) {
    const { ctx } = this;
    const x = h.gx * TILE;
    const y = h.gy * TILE;
    ctx.drawImage(h.destroyed ? TILES.houseBroken : TILES.houseOk, x, y, TILE, TILE);
    if (!h.destroyed) {
      const w = TILE * 0.8;
      const ratio = Math.max(0, Math.min(1, h.hp / h.maxHp));
      ctx.fillStyle = "rgba(255,252,245,.8)";
      rr(ctx, x + (TILE - w) / 2 - 1, y - 6, w + 2, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = "#7cc4ff";
      rr(ctx, x + (TILE - w) / 2, y - 5, w * ratio, 3, 1.5);
      ctx.fill();
    }
  }

  /** 暴雪积雪：随时间铺白霜 */
  private drawGroundWeather(f: FrameData) {
    if (f.weather !== "snow") return;
    const { ctx } = this;
    const alpha = Math.min(0.55, (f.elapsedMs / 90_000) * 0.55);
    if (alpha <= 0.01) return;
    ctx.fillStyle = `rgba(240,248,255,${alpha})`;
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        if (f.grid[gy * GRID_W + gx] !== Tile.Floor) continue;
        ctx.fillRect(gx * TILE, gy * TILE, TILE, TILE);
      }
    }
  }

  /** 雨/雪粒子、迷雾、闪电警示与落雷（覆盖在最上层） */
  private drawSkyWeather(f: FrameData, nowMs: number, viewer: ViewerView | null) {
    const { ctx } = this;
    const W = GRID_W * TILE;
    const H = GRID_H * TILE;
    if (f.weather === "rain") {
      ctx.strokeStyle = "rgba(150,180,230,.35)";
      ctx.lineWidth = 1.3;
      ctx.lineCap = "round";
      for (let i = 0; i < 60; i++) {
        const s = cellHash(i, 7);
        const speed = 0.9 + (s % 5) * 0.12;
        const x = ((s % W) + nowMs * 0.18 * speed) % W;
        const y = (((s * 13) % H) + nowMs * 0.9 * speed) % H;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 1.5, y + 11);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(110,140,200,.10)";
      ctx.fillRect(0, 0, W, H);
    } else if (f.weather === "snow") {
      const layers: [number, number, number, number][] = [
        [42, 0.05, 2.4, 0.9],
        [30, 0.09, 1.5, 0.6],
      ];
      for (const [count, speed, size, alpha] of layers) {
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        for (let i = 0; i < count; i++) {
          const s = cellHash(i, count);
          const x = ((((s % W) + Math.sin(nowMs / 900 + i) * 22) % W) + W) % W;
          const y = (((s * 17) % H) + nowMs * speed) % H;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = "rgba(200,225,250,.07)";
      ctx.fillRect(0, 0, W, H);
    } else if (f.weather === "fog") {
      ctx.fillStyle = "rgba(240,240,232,.16)";
      for (let i = 0; i < 6; i++) {
        const s = cellHash(i, 42);
        const x = (((s % (W + 300)) + nowMs * (0.014 + (i % 3) * 0.006)) % (W + 300)) - 150;
        const y = (s * 11) % H;
        ctx.beginPath();
        ctx.ellipse(x, y, 130 + (s % 60), 46 + (i % 3) * 12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (viewer) {
        const cells = FOG_VISION_CELLS * (viewer.lantern ? FOG_LANTERN_FACTOR : 1);
        const r = cells * TILE;
        const g = ctx.createRadialGradient(
          center(viewer.x), center(viewer.y), r * 0.45,
          center(viewer.x), center(viewer.y), r,
        );
        g.addColorStop(0, "rgba(245,242,232,0)");
        g.addColorStop(1, "rgba(243,240,228,.9)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    }
    // 闪电警示圈
    for (const w of f.warnings) {
      const remain = w.strikeAt - f.elapsedMs;
      if (remain <= 0 || remain > LIGHTNING_WARN_MS + 500) continue;
      if (Math.floor(nowMs / 130) % 2 !== 0) continue;
      ctx.strokeStyle = "rgba(255,214,90,.9)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(center(w.gx), center(w.gy), TILE * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 落雷
    for (const st of f.strikes) {
      const age = (nowMs - st.at) / 300;
      if (age < 0 || age > 1) continue;
      const cx = center(st.gx);
      const cy = center(st.gy);
      ctx.strokeStyle = `rgba(255,240,160,${1 - age})`;
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      let bx = cx + 16;
      let by = 0;
      ctx.moveTo(bx, by);
      while (by < cy - 12) {
        by += 24;
        bx += (cellHash(bx | 0, by | 0) % 16) - 8;
        ctx.lineTo(bx, by);
      }
      ctx.lineTo(cx, cy);
      ctx.stroke();
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, TILE * 0.6 * (1 + age));
      g.addColorStop(0, `rgba(255,244,180,${(1 - age) * 0.7})`);
      g.addColorStop(1, "rgba(255,244,180,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, TILE * 0.6 * (1 + age), 0, Math.PI * 2);
      ctx.fill();
    }
    if (f.flash > 0) {
      ctx.fillStyle = `rgba(255,255,240,${f.flash * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /** 柔和的暖色光晕（替代生硬暗角） */
  private drawVignette() {
    const { ctx } = this;
    if (!this.vignette) {
      const g = this.ctx.createRadialGradient(
        (GRID_W * TILE) / 2, (GRID_H * TILE) / 2, TILE * 5,
        (GRID_W * TILE) / 2, (GRID_H * TILE) / 2, (GRID_W * TILE) / 1.35,
      );
      g.addColorStop(0, "rgba(255,246,214,0)");
      g.addColorStop(1, "rgba(80,120,80,.16)");
      this.vignette = g;
    }
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, GRID_W * TILE, GRID_H * TILE);
  }
}
