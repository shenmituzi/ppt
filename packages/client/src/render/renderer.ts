import {
  BOMB_FUSE_MS, FLAME_MS, FOG_LANTERN_FACTOR, FOG_VISION_CELLS, GRID_H, GRID_W,
  ItemType, LIGHTNING_WARN_MS, SPAWNS, TILE, Tile,
} from "@pt/shared";
import type { FrameData } from "./frame";
import { PIX } from "./pixel";

export const PLAYER_COLORS = ["#ff5a5f", "#3fa7ff", "#ffcb2e", "#3fdc7f"];

export interface GhostView { x: number; y: number; colorIndex: number; diedAtMs: number }
/** 雾天视野参数（自己角色的位置与是否持有提灯） */
export interface ViewerView { x: number; y: number; lantern: boolean }

const center = (v: number) => (v + 0.5) * TILE;

/** 与帧无关的格子伪随机数（纹理装饰用，保证不闪烁） */
function cellHash(gx: number, gy: number): number {
  let h = Math.imul(gx, 73856093) ^ Math.imul(gy, 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}

/** 圆角矩形路径 */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private vignette: CanvasGradient | null = null;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = GRID_W * TILE;
    canvas.height = GRID_H * TILE;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false; // 像素素材放大保持锐利
  }

  draw(f: FrameData, nowMs: number, ghosts: GhostView[] = [], viewer: ViewerView | null = null) {
    const { ctx } = this;
    ctx.clearRect(0, 0, GRID_W * TILE, GRID_H * TILE);
    this.drawTiles(f.grid);
    // 出生点标记（帮助辨认自己的方位）
    for (const [i, s] of SPAWNS.entries()) this.drawSpawnPad(s.gx, s.gy, i);
    this.drawGroundWeather(f); // 暴雪积雪覆盖在地面之上、物件之下
    for (const it of f.items) this.drawItem(it, nowMs);
    for (const b of f.bombs) this.drawBomb(b.gx, b.gy, b.fuse, nowMs);
    for (const fl of f.flames) this.drawFlame(fl, nowMs);
    for (const g of ghosts) this.drawGhost(g, nowMs);
    for (const m of f.monsters) this.drawMonster(m, nowMs);
    for (const h of f.houses) this.drawHouse(h);
    for (const p of f.players) this.drawPlayer(p, nowMs);
    this.drawSkyWeather(f, nowMs, viewer); // 雨/雪/雾/闪电覆盖在最上层
    this.drawVignette();
  }

  /** 怪物：本体 + 头顶血条 */
  private drawMonster(m: FrameData["monsters"][number], nowMs: number) {
    const { ctx } = this;
    const cx = center(m.x);
    const cy = center(m.y);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + TILE * 0.34, TILE * 0.3, TILE * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(PIX.monster, cx - TILE / 2, cy - TILE / 2, TILE, TILE);
    // 血条
    const w = TILE * 0.8;
    const ratio = Math.max(0, Math.min(1, m.hp / m.maxHp));
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(cx - w / 2, cy - TILE * 0.72, w, 4);
    ctx.fillStyle = ratio > 0.5 ? "#2ecc71" : ratio > 0.25 ? "#f39c12" : "#e74c3c";
    ctx.fillRect(cx - w / 2, cy - TILE * 0.72, w * ratio, 4);
  }

  /** 怪物屋：血条 + 完好/损毁两态 */
  private drawHouse(h: FrameData["houses"][number]) {
    const { ctx } = this;
    const x = h.gx * TILE;
    const y = h.gy * TILE;
    ctx.drawImage(PIX.house[h.destroyed ? 1 : 0], x, y, TILE, TILE);
    if (!h.destroyed) {
      const w = TILE * 0.8;
      const ratio = Math.max(0, Math.min(1, h.hp / h.maxHp));
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(x + (TILE - w) / 2, y - 5, w, 4);
      ctx.fillStyle = "#4aa3ff";
      ctx.fillRect(x + (TILE - w) / 2, y - 5, w * ratio, 4);
    }
  }

  private drawTiles(grid: Uint8Array) {
    // 第一遍：全部先铺草地（水晶等透明贴图的缝隙要透出地面）
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const h = cellHash(gx, gy);
        this.ctx.drawImage(PIX.grass[h % 3], gx * TILE, gy * TILE, TILE, TILE);
      }
    }
    // 第二遍：墙与可炸方块
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const x = gx * TILE;
        const y = gy * TILE;
        const t = grid[gy * GRID_W + gx];
        if (t === Tile.HardWall) {
          this.ctx.drawImage(PIX.stone, x, y, TILE, TILE);
        } else if (t >= Tile.SoftWall) {
          this.ctx.drawImage(PIX.soft[t - Tile.SoftWall], x, y, TILE, TILE);
        } else if (gy > 0 && grid[(gy - 1) * GRID_W + gx] !== Tile.Floor) {
          // 墙根投影：上格是墙时在地面顶部画阴影条
          this.ctx.fillStyle = "rgba(0,0,0,.16)";
          this.ctx.fillRect(x, y, TILE, 5);
        }
      }
    }
  }

  private drawSpawnPad(gx: number, gy: number, colorIndex: number) {
    const { ctx } = this;
    ctx.fillStyle = PLAYER_COLORS[colorIndex] + "3d"; // 33% 透明
    rr(ctx, gx * TILE + 4, gy * TILE + 4, TILE - 8, TILE - 8, 6);
    ctx.fill();
    ctx.strokeStyle = PLAYER_COLORS[colorIndex] + "70";
    ctx.lineWidth = 1.5;
    rr(ctx, gx * TILE + 4, gy * TILE + 4, TILE - 8, TILE - 8, 6);
    ctx.stroke();
  }

  private drawItem(it: FrameData["items"][number], nowMs: number) {
    const { ctx } = this;
    const h = cellHash(it.gx, it.gy);
    const bob = Math.sin(nowMs / 300 + h) * 1.6; // 上下漂浮
    ctx.drawImage(PIX.items[it.type], it.gx * TILE, it.gy * TILE + bob, TILE, TILE);
  }

  private drawBomb(gx: number, gy: number, fuse: number, nowMs: number) {
    const { ctx } = this;
    const urgency = 1 - Math.min(1, fuse / BOMB_FUSE_MS); // 0→1 越来越急
    const pulse = 1 + 0.09 * Math.sin(nowMs / (90 - 40 * urgency));
    const cx = center(gx);
    const cy = center(gy);
    const size = TILE * pulse;
    // 影子
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + TILE * 0.3, TILE * 0.28, TILE * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(PIX.bomb[urgency > 0.6 ? 1 : 0], cx - size / 2, cy - size / 2, size, size);
    // 引信火花（闪烁）
    if (Math.floor(nowMs / 70) % 2 === 0) {
      ctx.fillStyle = "#ffe066";
      ctx.beginPath();
      ctx.arc(cx + 6, cy - 11, 2 + urgency * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFlame(fl: FrameData["flames"][number], nowMs: number) {
    const { ctx } = this;
    const alpha = Math.max(0, Math.min(1, fl.life / FLAME_MS));
    ctx.globalAlpha = alpha;
    fl.cells.forEach((c, i) => {
      const spr = i === 0 ? PIX.flame[0] : PIX.flame[1];
      this.ctx.drawImage(spr, c.gx * TILE, c.gy * TILE, TILE, TILE);
    });
    ctx.globalAlpha = 1;
  }

  private drawPlayer(p: FrameData["players"][number], nowMs: number) {
    const { ctx } = this;
    if (!p.alive) return; // 死亡表现由 ghosts 负责
    if (p.invincible && Math.floor(nowMs / 130) % 2 === 0) return; // 无敌闪烁
    // 影子
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath();
    ctx.ellipse(center(p.x), center(p.y) + TILE * 0.32, TILE * 0.28, TILE * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    // 行走帧动画
    const frame = p.moving ? ((Math.floor(nowMs / 110) % 2) + 1) as 1 | 2 : 0;
    ctx.drawImage(
      PIX.player[p.colorIndex % 4][frame],
      center(p.x) - TILE / 2,
      center(p.y) - TILE / 2,
      TILE,
      TILE,
    );
    // 无敌护盾（旋转虚线环）
    if (p.invincible) {
      const r = TILE * 0.36;
      const cx = center(p.x);
      const cy = center(p.y);
      ctx.strokeStyle = "rgba(255,255,255,.75)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(cx, cy, r + 4, nowMs / 200, nowMs / 200 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 天气道具徽章（头顶一排小图标）
    let bx = center(p.x) - 8;
    const badge = (t: string) => {
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t, bx, center(p.y) - TILE * 0.55);
      bx += 12;
    };
    if (p.bootsOn) badge("❄");
    if (p.rodOn) badge("⚡");
    if (p.lanternOn) badge("🏮");
    // 昵称（联网模式提供）
    if (p.name) {
      ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,.55)";
      ctx.strokeText(p.name, center(p.x), center(p.y) - TILE * 0.4);
      ctx.fillStyle = "#fff";
      ctx.fillText(p.name, center(p.x), center(p.y) - TILE * 0.4);
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
    ctx.arc(cx, cy, TILE * 0.3 * (1 + t * 0.8), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 8);
    ctx.lineTo(cx + 8, cy + 8);
    ctx.moveTo(cx + 8, cy - 8);
    ctx.lineTo(cx - 8, cy + 8);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }

  /** 暴雪积雪：随时间在地面铺白霜（画在地面之上、物件之下） */
  private drawGroundWeather(f: FrameData) {
    if (f.weather !== "snow") return;
    const { ctx } = this;
    const alpha = Math.min(0.5, (f.elapsedMs / 90_000) * 0.5); // 90 秒逐渐积雪
    if (alpha <= 0.01) return;
    ctx.fillStyle = `rgba(238,246,255,${alpha})`;
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
      // 雨幕
      ctx.strokeStyle = "rgba(178,204,255,.4)";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 70; i++) {
        const s = cellHash(i, 7);
        const speed = 0.9 + (s % 5) * 0.12;
        const x = ((s % W) + nowMs * 0.18 * speed) % W;
        const y = (((s * 13) % H) + nowMs * 0.9 * speed) % H;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 2, y + 13);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(20,32,60,.16)";
      ctx.fillRect(0, 0, W, H);
    } else if (f.weather === "snow") {
      // 两层雪花（近大远小）
      const layers: [number, number, number, number][] = [
        [46, 0.05, 2.2, 0.85],
        [34, 0.09, 1.4, 0.6],
      ];
      for (const [count, speed, size, alpha] of layers) {
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        for (let i = 0; i < count; i++) {
          const s = cellHash(i, count);
          const x = (((s % W) + Math.sin(nowMs / 900 + i) * 22) % W + W) % W;
          const y = (((s * 17) % H) + nowMs * speed) % H;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = "rgba(190,215,255,.08)";
      ctx.fillRect(0, 0, W, H);
    } else if (f.weather === "fog") {
      // 飘动的雾团
      ctx.fillStyle = "rgba(214,224,238,.15)";
      for (let i = 0; i < 6; i++) {
        const s = cellHash(i, 42);
        const x = (((s % (W + 300)) + nowMs * (0.014 + (i % 3) * 0.006)) % (W + 300)) - 150;
        const y = (s * 11) % H;
        ctx.beginPath();
        ctx.ellipse(x, y, 130 + (s % 60), 46 + (i % 3) * 12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // 视野限制：以自己为中心的光圈，提灯可扩大
      if (viewer) {
        const cells = FOG_VISION_CELLS * (viewer.lantern ? FOG_LANTERN_FACTOR : 1);
        const r = cells * TILE;
        const g = ctx.createRadialGradient(
          center(viewer.x), center(viewer.y), r * 0.45,
          center(viewer.x), center(viewer.y), r,
        );
        g.addColorStop(0, "rgba(208,219,234,0)");
        g.addColorStop(1, "rgba(205,216,232,.88)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    }
    // 闪电警示圈（黄色闪烁）
    for (const w of f.warnings) {
      const remain = w.strikeAt - f.elapsedMs;
      if (remain <= 0 || remain > LIGHTNING_WARN_MS + 500) continue;
      if (Math.floor(nowMs / 120) % 2 !== 0) continue;
      ctx.strokeStyle = "rgba(255,225,90,.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(center(w.gx), center(w.gy), TILE * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 落雷：闪电折线 + 落点光斑
    for (const st of f.strikes) {
      const age = (nowMs - st.at) / 300;
      if (age < 0 || age > 1) continue;
      const cx = center(st.gx);
      const cy = center(st.gy);
      ctx.strokeStyle = `rgba(255,255,180,${1 - age})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      let bx = cx + 18;
      let by = 0;
      ctx.moveTo(bx, by);
      while (by < cy - 12) {
        by += 26;
        bx += (cellHash(bx | 0, by | 0) % 18) - 9;
        ctx.lineTo(bx, by);
      }
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,240,150,${(1 - age) * 0.5})`;
      ctx.beginPath();
      ctx.arc(cx, cy, TILE * 0.5 * (1 + age), 0, Math.PI * 2);
      ctx.fill();
    }
    // 落雷白闪
    if (f.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${f.flash * 0.5})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /** 四周轻微压暗，把视线聚拢到地图中央 */
  private drawVignette() {
    const { ctx } = this;
    if (!this.vignette) {
      const g = this.ctx.createRadialGradient(
        (GRID_W * TILE) / 2, (GRID_H * TILE) / 2, TILE * 4,
        (GRID_W * TILE) / 2, (GRID_H * TILE) / 2, (GRID_W * TILE) / 1.4,
      );
      g.addColorStop(0, "rgba(15,20,35,0)");
      g.addColorStop(1, "rgba(15,20,35,.28)");
      this.vignette = g;
    }
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, GRID_W * TILE, GRID_H * TILE);
  }
}
