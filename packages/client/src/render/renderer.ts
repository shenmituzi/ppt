import {
  BOMB_FUSE_MS, FLAME_MS, FOG_LANTERN_FACTOR, FOG_VISION_CELLS, GRID_H, GRID_W,
  ItemType, LIGHTNING_WARN_MS, SPAWNS, TILE, Tile,
} from "@pt/shared";
import type { FrameData } from "./frame";
import {
  TILES, drawPlayerBody, drawBombBody, drawFlameCell, drawItemTile,
  drawMonsterBody, rr, type ViewerView,
} from "./cozy";

/** 骑乘载具的小自行车（画在角色脚下） */
function drawBike(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.strokeStyle = "#f26d6d";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (const wx of [-6, 6]) {
    ctx.beginPath();
    ctx.arc(cx + wx, cy + 8, 3.4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy + 8);
  ctx.lineTo(cx - 2, cy + 2);
  ctx.lineTo(cx + 4, cy + 2);
  ctx.lineTo(cx + 6, cy + 8);
  ctx.lineTo(cx - 6, cy + 8);
  ctx.moveTo(cx - 2, cy + 2);
  ctx.lineTo(cx + 6, cy + 8);
  ctx.stroke();
}

/** 精灵球（困住玩家的表现） */
function drawPokeball(ctx: CanvasRenderingContext2D, cx: number, cy: number, now: number) {
  const wobble = Math.sin(now / 120) * 0.12;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(wobble);
  ctx.beginPath();
  ctx.arc(0, 0, 13, Math.PI, 0);
  ctx.fillStyle = "#f26d6d";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI);
  ctx.fillStyle = "#f5f5f5";
  ctx.fill();
  ctx.strokeStyle = "#3a3548";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-13, 0);
  ctx.lineTo(13, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = "#f5f5f5";
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** 穿梭胶囊（成对出现，呼吸光圈） */
function drawPortal(ctx: CanvasRenderingContext2D, cx: number, cy: number, now: number) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 260);
  ctx.strokeStyle = `rgba(94,215,255,${0.5 + pulse * 0.4})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 10 + pulse * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `rgba(94,215,255,${0.25 + pulse * 0.2})`;
  ctx.beginPath();
  ctx.arc(cx, cy, 6 + pulse * 1.5, 0, Math.PI * 2);
  ctx.fill();
}

export const PLAYER_COLORS = ["#ff8a8a", "#7cc4ff", "#ffd97a", "#8de0a0"];

export interface GhostView { x: number; y: number; colorIndex: number; diedAtMs: number }
export type { ViewerView };

const center = (v: number) => (v + 0.5) * TILE;
const VISUAL_SCALE = 2.5;

/** 与帧无关的格子伪随机数（纹理装饰用，保证不闪烁） */
function cellHash(gx: number, gy: number): number {
  let h = Math.imul(gx, 73856093) ^ Math.imul(gy, 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private vignette: CanvasGradient | null = null;
  private cameraX = 0;
  private cameraY = 0;
  private dragX = 0;
  private dragY = 0;
  private dragging = false;
  private manualCameraUntil = 0;
  /** 晴天彩蛋：偶尔飞过的鸟群 */
  private flocks: { start: number; y: number; dir: 1 | -1; count: number; speed: number }[] = [];
  private nextFlockAt = 4000;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = Math.min(1100, Math.max(640, window.innerWidth - 24));
    canvas.height = Math.min(760, Math.max(420, window.innerHeight - 150));
    this.ctx = canvas.getContext("2d")!;
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", e => {
      this.dragging = true; this.dragX = e.clientX; this.dragY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", e => {
      if (!this.dragging) return;
      this.cameraX -= e.clientX - this.dragX; this.cameraY -= e.clientY - this.dragY;
      this.dragX = e.clientX; this.dragY = e.clientY; this.clampCamera(canvas);
      this.manualCameraUntil = performance.now() + 2200;
    });
    const release = () => { this.dragging = false; this.manualCameraUntil = performance.now() + 2200; };
    canvas.addEventListener("pointerup", release); canvas.addEventListener("pointercancel", release);
    window.addEventListener("camera-pan", ((event: CustomEvent<{ dx: number; dy: number }>) => {
      this.cameraX -= event.detail.dx;
      this.cameraY -= event.detail.dy;
      this.manualCameraUntil = performance.now() + 2200;
      this.clampCamera(canvas);
    }) as EventListener);
    window.addEventListener("camera-follow", () => { this.manualCameraUntil = 0; });
  }

  draw(f: FrameData, nowMs: number, ghosts: GhostView[] = [], viewer: ViewerView | null = null) {
    const { ctx } = this;
    const canvas = ctx.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.updateCamera(canvas, viewer);
    ctx.save(); ctx.translate(-this.cameraX, -this.cameraY);
    this.drawTiles(f.grid);
    for (const [i, s] of SPAWNS.entries()) this.drawSpawnPad(s.gx, s.gy, i);
    this.drawGroundWeather(f);
    // 穿梭胶囊（地面层，呼吸光圈）
    for (const pp of f.portals) {
      drawPortal(ctx, center(pp.ax), center(pp.ay), nowMs);
      drawPortal(ctx, center(pp.bx), center(pp.by), nowMs);
    }
    // 晴天鸟群：地面影子画在物件之下
    const birds = this.updateBirds(f, nowMs);
    for (const b of birds) {
      ctx.fillStyle = "rgba(60,90,60,.12)";
      ctx.beginPath();
      ctx.ellipse(b.x + 6, b.y + 74, 7, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const it of f.items) this.drawItem(it, nowMs);
    for (const b of f.bombs) this.drawBomb(b.gx, b.gy, b.fuse, nowMs);
    for (const fl of f.flames) this.drawFlame(fl, nowMs);
    for (const g of ghosts) this.drawGhost(g, nowMs);
    for (const h of f.houses) this.drawHouse(h);
    // 冒险模式：存活玩家的出生点画产阳光蘑菇
    if (f.gameType === "adventure") {
      for (const p of f.players) {
        if (p.alive) this.drawMushroom(center(p.x), center(p.y) + 4, nowMs, p.colorIndex % 4);
      }
    }
    for (const d of f.devices) this.drawDevice(d, nowMs);
    for (const m of f.monsters) this.drawMonster(m, nowMs);
    for (const p of f.players) this.drawPlayer(p, nowMs);
    // 鸟群本体
    for (const b of birds) this.drawBird(b.x, b.y, b.flap, b.dir);
    // 子弹（发光小弹丸）
    for (const bl of f.bullets) {
      ctx.fillStyle = "rgba(255,240,150,.95)";
      ctx.beginPath();
      ctx.arc(center(bl.x), center(bl.y), 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,240,150,.35)";
      ctx.beginPath();
      ctx.arc(center(bl.x), center(bl.y), 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // 激光光束
    for (const bm of f.beams) {
      const age = (nowMs - bm.at) / 260;
      ctx.strokeStyle = `rgba(168,255,94,${1 - age})`;
      ctx.lineWidth = 5 * (1 - age) + 1.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      bm.cells.forEach((c, i) => {
        if (i === 0) ctx.moveTo(center(c.gx), center(c.gy));
        else ctx.lineTo(center(c.gx), center(c.gy));
      });
      ctx.stroke();
    }
    this.drawSkyWeather(f, nowMs, viewer);
    this.drawVignette();
    ctx.restore();
  }

  private updateCamera(canvas: HTMLCanvasElement, viewer: ViewerView | null) {
    if (!this.dragging && viewer && performance.now() >= this.manualCameraUntil) {
      this.cameraX += (center(viewer.x) - canvas.width / 2 - this.cameraX) * 0.075;
      this.cameraY += (center(viewer.y) - canvas.height / 2 - this.cameraY) * 0.075;
    }
    this.clampCamera(canvas);
  }

  private clampCamera(canvas: HTMLCanvasElement) {
    this.cameraX = Math.max(0, Math.min(Math.max(0, GRID_W * TILE - canvas.width), this.cameraX));
    this.cameraY = Math.max(0, Math.min(Math.max(0, GRID_H * TILE - canvas.height), this.cameraY));
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
    ctx.save(); ctx.translate(center(it.gx), center(it.gy)); ctx.scale(VISUAL_SCALE, VISUAL_SCALE);
    drawItemTile(ctx, 0, 0, it.type, nowMs); ctx.restore();
  }

  private drawBomb(gx: number, gy: number, fuse: number, nowMs: number) {
    const { ctx } = this;
    const urgency = 1 - Math.min(1, fuse / BOMB_FUSE_MS);
    ctx.fillStyle = "rgba(60,90,60,.22)";
    ctx.beginPath();
    ctx.ellipse(center(gx), center(gy) + 9, 9, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save(); ctx.translate(center(gx), center(gy)); ctx.scale(VISUAL_SCALE, VISUAL_SCALE);
    drawBombBody(ctx, 0, 0, urgency, nowMs); ctx.restore();
  }

  private drawFlame(fl: FrameData["flames"][number], nowMs: number) {
    const { ctx } = this;
    const alpha = Math.max(0, Math.min(1, fl.life / FLAME_MS));
    fl.cells.forEach((c, i) => {
      ctx.save(); ctx.translate(center(c.gx), center(c.gy)); ctx.scale(2.1, 2.1);
      drawFlameCell(ctx, 0, 0, i === 0, alpha, nowMs, i * 3); ctx.restore();
    });
  }

  private drawPlayer(p: FrameData["players"][number], nowMs: number) {
    const { ctx } = this;
    if (!p.alive) return;
    if (p.invincible && Math.floor(nowMs / 150) % 2 === 0) return;
    const cx = center(p.x);
    const cy = center(p.y);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(VISUAL_SCALE, VISUAL_SCALE);
    drawPlayerBody(ctx, 0, 0, p.colorIndex % 4, p.moving, nowMs);
    ctx.restore();
    // 无敌护盾
    if (p.invincible) {
      ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(cx, cy, 22, nowMs / 220, nowMs / 220 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 天气道具徽章
    let bx = center(p.x) - 8;
    const badge = (t: string) => {
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t, bx, cy - 31);
      bx += 12;
    };
    if (p.bootsOn) badge("❄");
    if (p.rodOn) badge("⚡");
    if (p.lanternOn) badge("🏮");
    if (p.weapon && p.weapon !== "none" && p.weapon !== "shield") badge("⚔");
    // 昵称
    if (p.name) {
      ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(60,90,60,.65)";
      ctx.strokeText(p.name, cx, cy - 25);
      ctx.fillStyle = "#fff";
      ctx.fillText(p.name, cx, cy - 25);
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

  /** 产阳光的蘑菇：红伞白点 */
  private drawMushroom(cx: number, cy: number, nowMs: number, colorIdx: number) {
    const { ctx } = this;
    const sway = Math.sin(nowMs / 420 + colorIdx) * 0.06;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(sway);
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(-1.5, 2, 3, 5);
    ctx.fillStyle = "#e05a5a";
    ctx.beginPath();
    ctx.ellipse(0, 1, 7, 5.5, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#fff";
    for (const [x, y] of [[-4, -1], [0, -3], [4, -1]]) {
      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 装置：加农炮 / 风扇 / 冰箱 */
  private drawDevice(d: FrameData["devices"][number], nowMs: number) {
    const { ctx } = this;
    const cx = center(d.gx);
    const cy = center(d.gy);
    ctx.fillStyle = "rgba(60,90,60,.2)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 10, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (d.type === "cannon") {
      ctx.fillStyle = "#5a6b52";
      ctx.beginPath();
      ctx.arc(cx, cy + 5, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#3f4f3a";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, cy + 4);
      ctx.lineTo(cx + 9, cy - 7);
      ctx.stroke();
      ctx.fillStyle = "#8ecf7d";
      ctx.beginPath();
      ctx.arc(cx, cy + 5, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.type === "fan") {
      ctx.fillStyle = "#e8f4ff";
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#7fb2d9";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(nowMs / 90);
      ctx.fillStyle = "#5fa8d9";
      for (let a = 0; a < 3; a++) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.beginPath();
        ctx.ellipse(5, 0, 4.5, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = "#3f4f5a";
      ctx.beginPath();
      ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const g = ctx.createLinearGradient(cx - 8, 0, cx + 8, 0);
      g.addColorStop(0, "#e6f4ff");
      g.addColorStop(1, "#a8d0f0");
      ctx.fillStyle = g;
      rr(ctx, cx - 8, cy - 11, 16, 22, 4);
      ctx.fill();
      ctx.strokeStyle = "#7fb2d9";
      ctx.lineWidth = 2;
      rr(ctx, cx - 8, cy - 11, 16, 22, 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy - 3);
      ctx.lineTo(cx + 8, cy - 3);
      ctx.stroke();
      ctx.fillStyle = "#5a8ab0";
      ctx.fillRect(cx + 4, cy - 8, 2, 4);
      ctx.fillStyle = "#ffffff";
      for (const [x, y] of [[cx - 4, cy + 4], [cx + 3, cy + 6]]) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawMonster(m: FrameData["monsters"][number], nowMs: number) {
    const { ctx } = this;
    const cx = center(m.x);
    const cy = center(m.y);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(VISUAL_SCALE, VISUAL_SCALE);
    drawMonsterBody(ctx, 0, 0, nowMs);
    ctx.restore();
    // 血条
    const w = TILE * 1.05;
    const ratio = Math.max(0, Math.min(1, m.hp / m.maxHp));
    ctx.fillStyle = "rgba(255,252,245,.8)";
    rr(ctx, cx - w / 2 - 1, cy - TILE * 0.92 - 1, w + 2, 7, 3.5);
    ctx.fill();
    ctx.fillStyle = ratio > 0.5 ? "#7fc98a" : ratio > 0.25 ? "#ffcf6b" : "#ff8a8a";
    rr(ctx, cx - w / 2, cy - TILE * 0.92, w * ratio, 5, 2.5);
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
    if (f.weather === "sunny") {
      ctx.fillStyle = "rgba(255,218,120,.08)";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,244,180,.22)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const x = 40 + i * 155;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 90, H); ctx.stroke();
      }
    } else if (f.weather === "rain") {
      ctx.fillStyle = "rgba(56,82,132,.22)";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(130,178,235,.62)";
      ctx.lineWidth = 1.3;
      ctx.lineCap = "round";
      for (let i = 0; i < 115; i++) {
        const s = cellHash(i, 7);
        const speed = 0.9 + (s % 5) * 0.12;
        const x = ((s % W) + nowMs * 0.18 * speed) % W;
        const y = (((s * 13) % H) + nowMs * 0.9 * speed) % H;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 1.5, y + 11);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(40,70,125,.12)";
      ctx.fillRect(0, 0, W, H);
    } else if (f.weather === "snow") {
      const layers: [number, number, number, number][] = [
        [72, 0.05, 3.2, 0.95],
        [48, 0.09, 2.1, 0.78],
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
      ctx.fillStyle = "rgba(170,210,245,.24)";
      ctx.fillRect(0, 0, W, H);
    } else if (f.weather === "fog") {
      ctx.fillStyle = "rgba(232,236,231,.48)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(245,246,239,.24)";
      for (let i = 0; i < 10; i++) {
        const s = cellHash(i, 42);
        const x = (((s % (W + 300)) + nowMs * (0.014 + (i % 3) * 0.006)) % (W + 300)) - 150;
        const y = (s * 11) % H;
        ctx.beginPath();
        ctx.ellipse(x, y, 170 + (s % 80), 58 + (i % 3) * 16, 0, 0, Math.PI * 2);
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
        g.addColorStop(1, "rgba(226,230,224,.96)");
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

  /** 晴天彩蛋：每隔一阵飞过一群小鸟（V 字队形 + 扇翅） */
  private updateBirds(f: FrameData, nowMs: number): { x: number; y: number; flap: number; dir: 1 | -1 }[] {
    if (f.weather !== "sunny") {
      this.flocks = [];
      return [];
    }
    if (nowMs > this.nextFlockAt) {
      this.nextFlockAt = nowMs + 9_000 + (nowMs % 11_000);
      this.flocks.push({
        start: nowMs,
        y: 34 + (nowMs % 90),
        dir: nowMs % 2 < 1 ? 1 : -1,
        count: 3 + (nowMs % 3),
        speed: 0.085 + (nowMs % 40) * 0.001,
      });
    }
    this.flocks = this.flocks.filter(fl => nowMs - fl.start < 7_200);
    const out: { x: number; y: number; flap: number; dir: 1 | -1 }[] = [];
    for (const fl of this.flocks) {
      const t = nowMs - fl.start;
      const travel = t * fl.speed * fl.dir;
      const xBase = fl.dir === 1 ? -90 + travel : GRID_W * TILE + 90 - travel;
      for (let i = 0; i < fl.count; i++) {
        const x = xBase + i * 20 * fl.dir + (i % 2) * 6;
        const y = fl.y + Math.abs(i - (fl.count - 1) / 2) * 9 + Math.sin(nowMs / 320 + i) * 3;
        out.push({ x, y, flap: Math.sin(nowMs / 95 + i * 1.4), dir: fl.dir });
      }
    }
    return out;
  }

  private drawBird(x: number, y: number, flap: number, dir: 1 | -1) {
    const { ctx } = this;
    const wingY = flap * 4.2;
    ctx.strokeStyle = "rgba(96,110,128,.88)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 7 * dir, y - wingY);
    ctx.quadraticCurveTo(x - 2.5 * dir, y - wingY * 0.25, x, y);
    ctx.quadraticCurveTo(x + 2.5 * dir, y - wingY * 0.25, x + 7 * dir, y - wingY);
    ctx.stroke();
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
