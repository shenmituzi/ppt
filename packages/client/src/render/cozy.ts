import { ItemType, TILE } from "@pt/shared";

/**
 * 治愈系矢量美术：所有贴图/角色用平滑的渐变和圆角绘制（非像素风）。
 * 静态地形预渲染成 32×32 离屏画布，动态角色逐帧矢量绘制。
 */

export interface ViewerView { x: number; y: number; lantern: boolean }

function makeTile(draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = TILE;
  cv.height = TILE;
  const ctx = cv.getContext("2d")!;
  draw(ctx);
  return cv;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- 预渲染静态地形 ----------

function grassTile(seed: number, flower: boolean): HTMLCanvasElement {
  return makeTile(ctx => {
    const g = ctx.createLinearGradient(0, 0, 0, TILE);
    g.addColorStop(0, seed % 2 ? "#a5da82" : "#9cd478");
    g.addColorStop(1, seed % 2 ? "#96cc71" : "#8fc96b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TILE, TILE);
    // 柔和草叶
    ctx.strokeStyle = "#7dbb5d";
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    const blades: [number, number, number, number][] = [
      [6, 24, 9, 18],
      [15, 27, 19, 21],
      [24, 25, 27, 20],
    ];
    for (const [x0, y0, cx, y1] of blades) {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, y0 - 4, cx + 1, y1);
      ctx.stroke();
    }
    // 高光光斑
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.beginPath();
    ctx.ellipse(22, 8, 6, 3, -0.3, 0, Math.PI * 2);
    ctx.fill();
    if (flower) {
      // 小雏菊
      const fx = 20, fy = 14;
      ctx.fillStyle = "#fdfdfd";
      for (let a = 0; a < 5; a++) {
        const ang = (a * Math.PI * 2) / 5 - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(fx + Math.cos(ang) * 3.4, fy + Math.sin(ang) * 3.4, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath();
      ctx.arc(fx, fy, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

const hedge = makeTile(ctx => {
  // 绿篱灌木（硬墙）：圆润的双层球面
  const g = ctx.createRadialGradient(11, 9, 3, 16, 16, 18);
  g.addColorStop(0, "#9ed883");
  g.addColorStop(1, "#5ea457");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(16, 15, 14.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.22)";
  ctx.beginPath();
  ctx.ellipse(11, 8, 7, 4.5, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // 浆果
  for (const [x, y] of [[9, 18], [17, 21], [22, 13]]) {
    ctx.fillStyle = "#ff9a8a";
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(46,84,45,.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(16, 15, 14.5, 0, Math.PI * 2);
  ctx.stroke();
});

const crate = makeTile(ctx => {
  const g = ctx.createLinearGradient(0, 0, 0, TILE);
  g.addColorStop(0, "#e8bd82");
  g.addColorStop(1, "#c08a44");
  ctx.fillStyle = g;
  rr(ctx, 2, 2, 28, 28, 6);
  ctx.fill();
  ctx.strokeStyle = "#8a5a28";
  ctx.lineWidth = 2.5;
  rr(ctx, 3, 3, 26, 26, 5);
  ctx.stroke();
  // X 支架
  ctx.strokeStyle = "#a5753a";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(6, 6);
  ctx.lineTo(26, 26);
  ctx.moveTo(26, 6);
  ctx.lineTo(6, 26);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,236,200,.5)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(6, 7);
  ctx.lineTo(25, 26);
  ctx.moveTo(25, 7);
  ctx.lineTo(6, 26);
  ctx.stroke();
  // 铆钉
  ctx.fillStyle = "#6b4413";
  for (const [x, y] of [[6, 6], [26, 6], [6, 26], [26, 26]]) {
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
});

const rock = makeTile(ctx => {
  // 地面缝底
  ctx.fillStyle = "rgba(70,110,60,.35)";
  ctx.fillRect(0, 0, TILE, TILE);
  const g = ctx.createRadialGradient(12, 10, 3, 16, 17, 15);
  g.addColorStop(0, "#cdd2db");
  g.addColorStop(1, "#8d93a1");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(16, 17, 13, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.45)";
  ctx.beginPath();
  ctx.ellipse(11, 10, 5, 3, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6d7382";
  ctx.beginPath();
  ctx.ellipse(19, 21, 5, 2.6, 0.2, 0, Math.PI * 2);
  ctx.fill();
});

const crystal = makeTile(ctx => {
  // 透明底，水晶簇立于草地
  const shard = (x: number, y: number, w: number, h: number, c1: string, c2: string) => {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h * 0.35);
    ctx.lineTo(x + w * 0.72, y + h);
    ctx.lineTo(x + w * 0.28, y + h);
    ctx.lineTo(x, y + h * 0.35);
    ctx.closePath();
    ctx.fill();
  };
  shard(3, 12, 6, 17, "#d3b8ff", "#8f68d8");
  shard(21, 10, 7, 19, "#d3b8ff", "#8f68d8");
  shard(10, 5, 11, 24, "#cba6f7", "#7c4fd0");
  // 高光
  ctx.fillStyle = "rgba(255,255,255,.75)";
  pxDiamond(ctx, 14, 9, 2.2);
  pxDiamond(ctx, 23, 14, 1.6);
  ctx.fillStyle = "rgba(255,255,255,.5)";
  pxDiamond(ctx, 5, 15, 1.4);
});

function pxDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
}

const ice = makeTile(ctx => {
  const g = ctx.createLinearGradient(0, 0, 0, TILE);
  g.addColorStop(0, "#e6f6ff");
  g.addColorStop(1, "#a8d8f5");
  ctx.fillStyle = g;
  rr(ctx, 2, 2, 28, 28, 7);
  ctx.fill();
  ctx.strokeStyle = "#9fd0f0";
  ctx.lineWidth = 2;
  rr(ctx, 2, 2, 28, 28, 7);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.8)";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(8, 20);
  ctx.lineTo(16, 10);
  ctx.moveTo(14, 22);
  ctx.lineTo(21, 13);
  ctx.stroke();
});

// ---------- 怪物屋 ----------

function houseTile(destroyed: boolean): HTMLCanvasElement {
  return makeTile(ctx => {
    const roofA = destroyed ? "#9aa0a6" : "#ff9a8a";
    const roofB = destroyed ? "#7d8288" : "#e8736b";
    const wall = destroyed ? "#8d8d8d" : "#fff3d9";
    // 屋顶（圆润三角）
    ctx.fillStyle = roofA;
    ctx.beginPath();
    ctx.moveTo(16, 1);
    ctx.quadraticCurveTo(17, 2, 28, 13);
    ctx.lineTo(4, 13);
    ctx.quadraticCurveTo(15, 2, 16, 1);
    ctx.fill();
    ctx.fillStyle = roofB;
    ctx.fillRect(4, 12, 24, 2);
    // 墙
    ctx.fillStyle = wall;
    rr(ctx, 5, 14, 22, 15, 3);
    ctx.fill();
    // 门
    ctx.fillStyle = destroyed ? "#2c2c2c" : "#8a6b4a";
    rr(ctx, 12, 19, 8, 10, 3);
    ctx.fill();
    // 窗（完好时有暖光）
    ctx.fillStyle = destroyed ? "#5d5d5d" : "#ffe9a8";
    rr(ctx, 7, 17, 5, 5, 1.5);
    ctx.fill();
    if (!destroyed) {
      ctx.strokeStyle = "rgba(160,120,70,.7)";
      ctx.lineWidth = 1;
      rr(ctx, 7, 17, 5, 5, 1.5);
      ctx.stroke();
    }
    if (destroyed) {
      ctx.strokeStyle = "#3d3d3d";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(8, 16);
      ctx.lineTo(12, 22);
      ctx.lineTo(9, 27);
      ctx.moveTo(21, 17);
      ctx.lineTo(18, 24);
      ctx.stroke();
    }
  });
}

// ---------- 汇总静态贴图 ----------

export const TILES = {
  grassA: grassTile(0, false),
  grassB: grassTile(1, false),
  grassFlower: grassTile(2, true),
  hedge,
  crate,
  rock,
  crystal,
  ice,
  soft: [crate, crystal, rock, ice], // index = Tile - Tile.SoftWall
  houseOk: houseTile(false),
  houseBroken: houseTile(true),
};

// ---------- 动态角色与物件（逐帧矢量绘制） ----------

export function drawPlayerBody(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  colorIdx: number,
  moving: boolean,
  now: number,
) {
  const pals = [
    { C: "#ff8a8a", c: "#e06666" },
    { C: "#7cc4ff", c: "#4d9fe0" },
    { C: "#ffd97a", c: "#e8b84d" },
    { C: "#8de0a0", c: "#5cc07a" },
  ][colorIdx % 4];
  const bounce = moving ? Math.abs(Math.sin(now / 130)) * 2.2 : Math.sin(now / 500) * 0.6;
  const y = cy - bounce;
  // 影子
  ctx.fillStyle = "rgba(60,90,60,.22)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, 10 - bounce * 0.8, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // 脚
  ctx.fillStyle = "#5a4a6a";
  const step = moving ? Math.sin(now / 90) * 2 : 0;
  ctx.beginPath();
  ctx.ellipse(cx - 4.5 + step, cy + 8.5, 3, 2.2, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 4.5 - step, cy + 8.5, 3, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // 身体（上浅下深的柔和渐变）
  const g = ctx.createRadialGradient(cx - 4, y - 5, 2, cx, y, 13.5);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.35, pals.C);
  g.addColorStop(1, pals.c);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, y, 11.5, 12.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // 眼睛
  ctx.fillStyle = "#3a3548";
  ctx.beginPath();
  ctx.ellipse(cx - 4.2, y - 2, 2.1, 2.9, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 4.2, y - 2, 2.1, 2.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx - 3.5, y - 3, 0.9, 0, Math.PI * 2);
  ctx.arc(cx + 4.9, y - 3, 0.9, 0, Math.PI * 2);
  ctx.fill();
  // 腮红
  ctx.fillStyle = "rgba(255,150,150,.55)";
  ctx.beginPath();
  ctx.ellipse(cx - 7, y + 1.5, 2, 1.3, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 7, y + 1.5, 2, 1.3, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawBombBody(ctx: CanvasRenderingContext2D, cx: number, cy: number, urgency: number, now: number) {
  const r = 10.5 * (1 + 0.08 * Math.sin(now / (90 - 40 * urgency)));
  const g = ctx.createRadialGradient(cx - 3.5, cy - 4, 1.5, cx, cy, r + 1);
  if (urgency > 0.65) {
    g.addColorStop(0, "#c96a6a");
    g.addColorStop(1, "#6e2020");
  } else {
    g.addColorStop(0, "#6a6a8c");
    g.addColorStop(1, "#20202e");
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // 引信
  ctx.strokeStyle = "#caa04b";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx + 2, cy - r + 1);
  ctx.quadraticCurveTo(cx + 6, cy - r - 5, cx + 9, cy - r - 2);
  ctx.stroke();
  // 火花
  const flick = Math.floor(now / 70) % 2 === 0 ? 1 : 0.55;
  ctx.fillStyle = `rgba(255,224,102,${flick})`;
  ctx.beginPath();
  ctx.arc(cx + 9.5, cy - r - 2.5, 2.2 + urgency, 0, Math.PI * 2);
  ctx.fill();
  // 高光
  ctx.fillStyle = "rgba(255,255,255,.5)";
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.35, cy - r * 0.4, r * 0.28, r * 0.18, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

export function drawFlameCell(ctx: CanvasRenderingContext2D, cx: number, cy: number, core: boolean, alpha: number, now: number, seed: number) {
  const flick = 0.9 + 0.1 * Math.sin(now / 55 + seed);
  ctx.globalAlpha = alpha;
  const layers: [number, string][] = core
    ? [[15, "#ffb26b"], [10.5, "#ffd9a0"], [6, "#fff3d9"]]
    : [[12.5, "#ffb26b"], [8.5, "#ffd9a0"], [4.5, "#fff3d9"]];
  for (const [r, color] of layers) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r * flick, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawItemTile(ctx: CanvasRenderingContext2D, cx: number, cy: number, type: ItemType, now: number) {
  const bob = Math.sin(now / 320) * 1.8;
  const x = cx - 12;
  const y = cy - 12 + bob;
  const colors: Record<ItemType, string> = {
    [ItemType.Bomb]: "#5bb8a6",
    [ItemType.Flame]: "#ff9d5c",
    [ItemType.Speed]: "#b07ce8",
    [ItemType.Boots]: "#6fb6e8",
    [ItemType.Rod]: "#e8b23f",
    [ItemType.Lantern]: "#ff9f5a",
    [ItemType.Vehicle]: "#f26d6d",
    [ItemType.Portal]: "#5ed7ff",
    [ItemType.Laser]: "#a8ff5e",
    [ItemType.Pistol]: "#8f9bb0",
    [ItemType.Shield]: "#7fd0c9",
    [ItemType.Pokeball]: "#f26d6d",
  };
  const c = colors[type];
  // 底牌
  ctx.fillStyle = "rgba(255,252,245,.95)";
  rr(ctx, x, y, 24, 24, 7);
  ctx.fill();
  ctx.strokeStyle = c;
  ctx.lineWidth = 2.2;
  rr(ctx, x, y, 24, 24, 7);
  ctx.stroke();
  // 图标
  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.fillStyle = c;
  ctx.strokeStyle = c;
  if (type === ItemType.Bomb) {
    ctx.beginPath();
    ctx.arc(0, 1, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(2, -3);
    ctx.quadraticCurveTo(4, -6, 6, -5);
    ctx.stroke();
  } else if (type === ItemType.Flame) {
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.quadraticCurveTo(6.5, -1, 4, 4);
    ctx.arc(0, 4, 4, 0, Math.PI, false);
    ctx.quadraticCurveTo(-6.5, -1, 0, -7);
    ctx.fill();
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath();
    ctx.arc(0, 3.6, 1.8, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === ItemType.Speed) {
    ctx.beginPath();
    ctx.moveTo(2, -7);
    ctx.lineTo(-4.5, 1);
    ctx.lineTo(-0.5, 1);
    ctx.lineTo(-2.5, 7);
    ctx.lineTo(4.5, -0.5);
    ctx.lineTo(0.5, -0.5);
    ctx.closePath();
    ctx.fill();
  } else if (type === ItemType.Boots) {
    // 雪花
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    for (let a = 0; a < 6; a++) {
      const ang = (a * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang) * 6, Math.sin(ang) * 6);
      ctx.stroke();
    }
  } else if (type === ItemType.Rod) {
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-2, 6);
    ctx.lineTo(-2, -4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-2, -5.5, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(4, -6);
    ctx.lineTo(1, 0);
    ctx.lineTo(3.5, 0);
    ctx.lineTo(0, 7);
    ctx.lineTo(5, 0);
    ctx.lineTo(2.5, 0);
    ctx.closePath();
    ctx.fill();
  } else {
    // 提灯
    ctx.fillStyle = "#ffd88a";
    rr(ctx, -3.5, -4, 7, 9, 2.5);
    ctx.fill();
    ctx.strokeStyle = "#b25b1e";
    ctx.lineWidth = 1.4;
    rr(ctx, -3.5, -4, 7, 9, 2.5);
    ctx.stroke();
    ctx.fillStyle = "#fff3b0";
    ctx.beginPath();
    ctx.arc(0, 0.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // 闪光小星星
  const tw = Math.sin(now / 200 + type * 2);
  if (tw > 0.6) {
    ctx.fillStyle = `rgba(255,255,255,${(tw - 0.6) * 2})`;
    pxDiamond(ctx, x + 20, y + 5, 2);
  }
}

/** 怪物：圆滚滚的紫色小怪（治愈系，不吓人） */
export function drawMonsterBody(ctx: CanvasRenderingContext2D, cx: number, cy: number, now: number) {
  const squash = Math.sin(now / 260) * 0.05;
  ctx.fillStyle = "rgba(60,90,60,.22)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 9, 10, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, 13);
  g.addColorStop(0, "#c9aef5");
  g.addColorStop(1, "#8f68d8");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 12, 10.5 * (1 + squash), 0, 0, Math.PI * 2);
  ctx.fill();
  // 肚皮
  ctx.fillStyle = "rgba(240,232,255,.8)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 3.5, 6.5, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // 犄角
  ctx.fillStyle = "#6c4bb0";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * 6, cy - 8);
    ctx.lineTo(cx + s * 9, cy - 14);
    ctx.lineTo(cx + s * 3, cy - 9.5);
    ctx.closePath();
    ctx.fill();
  }
  // 大眼睛
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(cx - 4.2, cy - 2, 3, 3.6, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 4.2, cy - 2, 3, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a3548";
  ctx.beginPath();
  ctx.arc(cx - 3.6, cy - 1.4, 1.7, 0, Math.PI * 2);
  ctx.arc(cx + 4.8, cy - 1.4, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx - 3.1, cy - 2.2, 0.7, 0, Math.PI * 2);
  ctx.arc(cx + 5.3, cy - 2.2, 0.7, 0, Math.PI * 2);
  ctx.fill();
  // 嘴（小表情）
  ctx.strokeStyle = "#5c3f96";
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy + 3, 2.2, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}

export { rr };
