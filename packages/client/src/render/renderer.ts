import { BOMB_FUSE_MS, FLAME_MS, GRID_H, GRID_W, ItemType, TILE, Tile } from "@pt/shared";
import type { FrameData } from "./frame";

export const PLAYER_COLORS = ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71"];

export interface GhostView { x: number; y: number; colorIndex: number; diedAtMs: number }

const ITEM_LABEL: Record<ItemType, string> = {
  [ItemType.Bomb]: "泡",
  [ItemType.Flame]: "火",
  [ItemType.Speed]: "速",
};
const ITEM_COLOR: Record<ItemType, string> = {
  [ItemType.Bomb]: "#16a085",
  [ItemType.Flame]: "#e67e22",
  [ItemType.Speed]: "#9b59b6",
};
const center = (v: number) => (v + 0.5) * TILE;

export class Renderer {
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = GRID_W * TILE;
    canvas.height = GRID_H * TILE;
    this.ctx = canvas.getContext("2d")!;
  }

  draw(f: FrameData, nowMs: number, ghosts: GhostView[] = []) {
    this.drawTiles(f.grid);
    for (const it of f.items) this.drawItem(it.gx, it.gy, it.type);
    for (const b of f.bombs) this.drawBomb(b.gx, b.gy, b.fuse, nowMs);
    for (const fl of f.flames) this.drawFlame(fl.cells, fl.life);
    for (const g of ghosts) this.drawGhost(g, nowMs);
    for (const p of f.players) this.drawPlayer(p, nowMs);
  }

  private drawTiles(grid: Uint8Array) {
    const { ctx } = this;
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const x = gx * TILE;
        const y = gy * TILE;
        const t = grid[gy * GRID_W + gx];
        if (t === Tile.HardWall) {
          ctx.fillStyle = "#4a4a55";
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = "#5d5d6b";
          ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
        } else if (t === Tile.SoftWall) {
          ctx.fillStyle = "#a5692d";
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = "#7c4a1a";
          ctx.strokeRect(x + 3.5, y + 3.5, TILE - 7, TILE - 7);
          ctx.beginPath();
          ctx.moveTo(x + 3, y + TILE / 2);
          ctx.lineTo(x + TILE - 3, y + TILE / 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = (gx + gy) % 2 === 0 ? "#d8e0d0" : "#cdd6c4";
          ctx.fillRect(x, y, TILE, TILE);
        }
      }
    }
  }

  private drawItem(gx: number, gy: number, type: ItemType) {
    const { ctx } = this;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(center(gx), center(gy), TILE * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ITEM_COLOR[type];
    ctx.font = `bold ${TILE * 0.4}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ITEM_LABEL[type], center(gx), center(gy) + 1);
  }

  private drawBomb(gx: number, gy: number, fuse: number, nowMs: number) {
    const { ctx } = this;
    const urgency = 1 - Math.min(1, fuse / BOMB_FUSE_MS); // 0→1 越来越急
    const pulse = 1 + 0.1 * Math.sin(nowMs / (90 - 40 * urgency));
    const r = TILE * 0.36 * pulse;
    ctx.fillStyle = urgency > 0.7 ? "#c0392b" : "#22222c";
    ctx.beginPath();
    ctx.arc(center(gx), center(gy), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.beginPath();
    ctx.arc(center(gx) - r * 0.3, center(gy) - r * 0.3, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFlame(cells: { gx: number; gy: number }[], life: number) {
    const { ctx } = this;
    const alpha = Math.max(0, Math.min(1, life / FLAME_MS));
    for (const c of cells) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#f39c12";
      ctx.fillRect(c.gx * TILE + 4, c.gy * TILE + 4, TILE - 8, TILE - 8);
      ctx.fillStyle = "#f7ff5e";
      ctx.fillRect(center(c.gx) - TILE * 0.18, center(c.gy) - TILE * 0.18, TILE * 0.36, TILE * 0.36);
      ctx.globalAlpha = 1;
    }
  }

  private drawPlayer(p: FrameData["players"][number], nowMs: number) {
    const { ctx } = this;
    if (!p.alive) return; // 死亡表现由 ghosts 负责
    if (p.invincible && Math.floor(nowMs / 120) % 2 === 0) return; // 无敌闪烁
    const cx = center(p.x);
    const cy = center(p.y);
    const s = TILE * 0.62;
    ctx.fillStyle = PLAYER_COLORS[p.colorIndex % 4];
    ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.strokeRect(cx - s / 2, cy - s / 2, s, s);
    ctx.fillStyle = "#fff";
    ctx.fillRect(cx - s * 0.22, cy - s * 0.25, s * 0.16, s * 0.2);
    ctx.fillRect(cx + s * 0.06, cy - s * 0.25, s * 0.16, s * 0.2);
    ctx.fillStyle = "#000";
    ctx.fillRect(cx - s * 0.17, cy - s * 0.2, s * 0.07, s * 0.1);
    ctx.fillRect(cx + s * 0.11, cy - s * 0.2, s * 0.07, s * 0.1);
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
}
