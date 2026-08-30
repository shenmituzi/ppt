import { BOMB_FUSE_MS, FLAME_MS, GRID_H, GRID_W, ItemType, SPAWNS, TILE, Tile } from "@pt/shared";
import type { FrameData } from "./frame";

export const PLAYER_COLORS = ["#ff5a5f", "#3fa7ff", "#ffcb2e", "#3fdc7f"];
const PLAYER_COLORS_DARK = ["#d64549", "#2f8fe0", "#e0ab22", "#2fb869"];

export interface GhostView { x: number; y: number; colorIndex: number; diedAtMs: number }

const ITEM_COLOR: Record<ItemType, string> = {
  [ItemType.Bomb]: "#16a085",
  [ItemType.Flame]: "#e67e22",
  [ItemType.Speed]: "#9b59b6",
};

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
  }

  draw(f: FrameData, nowMs: number, ghosts: GhostView[] = []) {
    const { ctx } = this;
    ctx.clearRect(0, 0, GRID_W * TILE, GRID_H * TILE);
    this.drawTiles(f.grid, nowMs);
    // 出生点标记（帮助辨认自己的方位）
    for (const [i, s] of SPAWNS.entries()) this.drawSpawnPad(s.gx, s.gy, i);
    for (const it of f.items) this.drawItem(it.gx, it.gy, it.type, nowMs);
    for (const b of f.bombs) this.drawBomb(b.gx, b.gy, b.fuse, nowMs);
    for (const fl of f.flames) this.drawFlame(fl.cells, fl.life, nowMs);
    for (const g of ghosts) this.drawGhost(g, nowMs);
    for (const p of f.players) this.drawPlayer(p, nowMs);
    this.drawVignette();
  }

  private drawTiles(grid: Uint8Array, nowMs: number) {
    const { ctx } = this;
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const x = gx * TILE;
        const y = gy * TILE;
        const t = grid[gy * GRID_W + gx];
        const h = cellHash(gx, gy);

        if (t === Tile.HardWall) {
          // 石墩：底座 + 带倒角的石块
          ctx.fillStyle = "#3f4557";
          ctx.fillRect(x, y, TILE, TILE);
          rr(ctx, x + 1.5, y + 1.5, TILE - 3, TILE - 3, 5);
          ctx.fillStyle = "#6d778f";
          ctx.fill();
          ctx.fillStyle = "#8b96ad"; // 顶部受光面
          rr(ctx, x + 4, y + 4, TILE - 8, (TILE - 8) * 0.42, 3);
          ctx.fill();
          ctx.fillStyle = "#525b70"; // 底部阴影
          rr(ctx, x + 4, y + TILE - 10, TILE - 8, 6, 2.5);
          ctx.fill();
          if (h % 5 === 0) {
            // 少量裂纹
            ctx.strokeStyle = "rgba(35,40,55,.55)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 8 + (h % 6), y + 10);
            ctx.lineTo(x + 14 + (h % 5), y + 18);
            ctx.lineTo(x + 10 + (h % 8), y + 24);
            ctx.stroke();
          }
        } else if (t === Tile.SoftWall) {
          // 木箱：边框 + 横板 + 铆钉 + 顶部受光
          ctx.fillStyle = "#4a3a26";
          ctx.fillRect(x, y, TILE, TILE);
          rr(ctx, x + 1, y + 1, TILE - 2, TILE - 2, 4);
          ctx.fillStyle = "#c98f4e";
          ctx.fill();
          ctx.fillStyle = "#e2b271"; // 受光条
          ctx.fillRect(x + 3, y + 3, TILE - 6, 4);
          ctx.strokeStyle = "#8f5f2b";
          ctx.lineWidth = 2;
          rr(ctx, x + 2.5, y + 2.5, TILE - 5, TILE - 5, 3);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + 3, y + TILE / 2);
          ctx.lineTo(x + TILE - 3, y + TILE / 2);
          ctx.stroke();
          ctx.fillStyle = "#6e4517"; // 四角铆钉
          for (const [nx, ny] of [[6, 6], [TILE - 6, 6], [6, TILE - 6], [TILE - 6, TILE - 6]]) {
            ctx.beginPath();
            ctx.arc(x + nx, y + ny, 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          // 草地：双色棋盘 + 草叶/小花点缀
          ctx.fillStyle = (gx + gy) % 2 === 0 ? "#a3d977" : "#98d06c";
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = "rgba(255,255,255,.06)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
          const deco = h % 9;
          ctx.fillStyle = "#83bd55";
          if (deco === 0) {
            // 三根小草
            for (const [bx, by] of [[8, 20], [14, 23], [20, 19]]) {
              ctx.fillRect(x + bx, y + by, 2, 5);
            }
          } else if (deco === 3) {
            // 小花：白瓣黄芯
            const fx = x + 10 + (h % 10);
            const fy = y + 10 + ((h >> 3) % 10);
            ctx.fillStyle = "#ffffff";
            for (let a = 0; a < 4; a++) {
              const ang = (a * Math.PI) / 2;
              ctx.beginPath();
              ctx.arc(fx + Math.cos(ang) * 2.6, fy + Math.sin(ang) * 2.6, 1.8, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = "#ffd23f";
            ctx.beginPath();
            ctx.arc(fx, fy, 1.6, 0, Math.PI * 2);
            ctx.fill();
          } else if (deco === 6) {
            ctx.fillRect(x + 10 + (h % 8), y + 12, 2, 4);
          }
        }
      }
    }
    void nowMs;
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

  private drawItem(gx: number, gy: number, type: ItemType, nowMs: number) {
    const { ctx } = this;
    const h = cellHash(gx, gy);
    const bob = Math.sin(nowMs / 300 + h) * 1.6; // 上下漂浮
    const cx = center(gx);
    const cy = center(gy) + bob;
    const s = TILE * 0.62;
    // 底板
    ctx.fillStyle = "rgba(0,0,0,.18)";
    rr(ctx, cx - s / 2 + 1, cy - s / 2 + 2.5, s, s, 7);
    ctx.fill();
    rr(ctx, cx - s / 2, cy - s / 2, s, s, 7);
    ctx.fillStyle = "#fdfdfd";
    ctx.fill();
    ctx.strokeStyle = ITEM_COLOR[type];
    ctx.lineWidth = 2.5;
    rr(ctx, cx - s / 2, cy - s / 2, s, s, 7);
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = ITEM_COLOR[type];
    if (type === ItemType.Bomb) {
      ctx.beginPath();
      ctx.arc(0, 1.5, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ITEM_COLOR[type];
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(2, -4);
      ctx.quadraticCurveTo(5, -8, 7, -7);
      ctx.stroke();
    } else if (type === ItemType.Flame) {
      // 火苗：水滴形
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.quadraticCurveTo(7, -1, 4.5, 4.5);
      ctx.arc(0, 4.5, 4.5, 0, Math.PI, false);
      ctx.quadraticCurveTo(-7, -1, 0, -8);
      ctx.fill();
      ctx.fillStyle = "#ffe08a";
      ctx.beginPath();
      ctx.arc(0, 4, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 速度：闪电
      ctx.beginPath();
      ctx.moveTo(2, -8);
      ctx.lineTo(-5, 1);
      ctx.lineTo(-1, 1);
      ctx.lineTo(-3, 8);
      ctx.lineTo(5, -1);
      ctx.lineTo(1, -1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBomb(gx: number, gy: number, fuse: number, nowMs: number) {
    const { ctx } = this;
    const urgency = 1 - Math.min(1, fuse / BOMB_FUSE_MS); // 0→1 越来越急
    const pulse = 1 + 0.09 * Math.sin(nowMs / (90 - 40 * urgency));
    const cx = center(gx);
    const cy = center(gy);
    const r = TILE * 0.36 * pulse;
    // 影子
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + TILE * 0.3, r * 0.9, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    // 球体（径向渐变）
    const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.15, cx, cy, r);
    if (urgency > 0.7) {
      grad.addColorStop(0, "#d96a5e");
      grad.addColorStop(1, "#7e2222");
    } else {
      grad.addColorStop(0, "#585870");
      grad.addColorStop(1, "#15151f");
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // 高光
    ctx.fillStyle = "rgba(255,255,255,.4)";
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.32, cy - r * 0.38, r * 0.26, r * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fill();
    // 引信 + 火花
    ctx.strokeStyle = "#caa04b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.15, cy - r * 0.9);
    ctx.quadraticCurveTo(cx + r * 0.5, cy - r * 1.25, cx + r * 0.75, cy - r * 0.95);
    ctx.stroke();
    if (Math.floor(nowMs / 70) % 2 === 0) {
      ctx.fillStyle = "#ffe066";
      ctx.beginPath();
      ctx.arc(cx + r * 0.78, cy - r * 0.98, 2.4 + urgency, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFlame(cells: { gx: number; gy: number }[], life: number, nowMs: number) {
    const { ctx } = this;
    const alpha = Math.max(0, Math.min(1, life / FLAME_MS));
    for (const c of cells) {
      const h = cellHash(c.gx, c.gy);
      const flick = 0.9 + 0.1 * Math.sin(nowMs / 55 + h); // 每格独立抖动
      const cx = center(c.gx);
      const cy = center(c.gy);
      const s = (TILE - 5) * flick;
      ctx.globalAlpha = alpha;
      // 三层火焰：外橙 → 中黄 → 亮芯
      ctx.fillStyle = "#ff8c1a";
      rr(ctx, cx - s / 2, cy - s / 2, s, s, s * 0.3);
      ctx.fill();
      ctx.fillStyle = "#ffb84d";
      const s2 = s * 0.66;
      rr(ctx, cx - s2 / 2, cy - s2 / 2, s2, s2, s2 * 0.32);
      ctx.fill();
      ctx.fillStyle = "#fff3b0";
      const s3 = s * 0.34;
      rr(ctx, cx - s3 / 2, cy - s3 / 2, s3, s3, s3 * 0.4);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawPlayer(p: FrameData["players"][number], nowMs: number) {
    const { ctx } = this;
    if (!p.alive) return; // 死亡表现由 ghosts 负责
    if (p.invincible && Math.floor(nowMs / 130) % 2 === 0) return; // 无敌闪烁
    const bob = p.moving ? Math.sin(nowMs / 90) * 1.4 : 0; // 行走起伏
    const cx = center(p.x);
    const cy = center(p.y) + bob;
    const body = PLAYER_COLORS[p.colorIndex % 4];
    const dark = PLAYER_COLORS_DARK[p.colorIndex % 4];
    // 影子（不随起伏）
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath();
    ctx.ellipse(center(p.x), center(p.y) + TILE * 0.32, TILE * 0.28, TILE * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    // 身体：主色圆 + 下半深色
    const r = TILE * 0.36;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = dark;
    ctx.fillRect(cx - r, cy + r * 0.28, r * 2, r);
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // 眼睛
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.34, cy - r * 0.18, r * 0.22, r * 0.28, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + r * 0.34, cy - r * 0.18, r * 0.22, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1c1c28";
    ctx.beginPath();
    ctx.arc(cx - r * 0.3, cy - r * 0.14, r * 0.1, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.38, cy - r * 0.14, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    // 无敌护盾（旋转虚线环）
    if (p.invincible) {
      ctx.strokeStyle = "rgba(255,255,255,.75)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(cx, cy, r + 4, nowMs / 200, nowMs / 200 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 昵称（联网模式提供）
    if (p.name) {
      ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,.55)";
      ctx.strokeText(p.name, cx, cy - r - 6);
      ctx.fillStyle = "#fff";
      ctx.fillText(p.name, cx, cy - r - 6);
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
