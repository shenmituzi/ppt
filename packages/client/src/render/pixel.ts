import { ItemType } from "@pt/shared";

/**
 * 程序化像素素材：所有贴图按 16×16 像素绘制，运行时放大 2 倍到 32px 格子。
 * 好处：素材即代码（可版本化/可调色），风格统一是真像素颗粒感。
 */

const PX = 16;

interface Px {
  px(x: number, y: number, c: string): void;
  rect(x: number, y: number, w: number, h: number, c: string): void;
  circle(cx: number, cy: number, r: number, c: string): void;
  outline(c: string): void;
}

/** 创建 16×16 离屏画布并在其上绘制像素 */
function sprite(draw: (p: Px) => void): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = PX;
  cv.height = PX;
  const ctx = cv.getContext("2d")!;
  const data: (string | null)[][] = Array.from({ length: PX }, () => Array(PX).fill(null));
  const p: Px = {
    px(x, y, c) {
      if (x >= 0 && x < PX && y >= 0 && y < PX) data[y][x] = c;
    },
    rect(x, y, w, h, c) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) p.px(xx, yy, c);
    },
    circle(cx, cy, r, c) {
      for (let y = 0; y < PX; y++)
        for (let x = 0; x < PX; x++) {
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= r * r + 0.4) p.px(x, y, c);
        }
    },
    outline(c) {
      // 给所有非透明像素的透明邻居描 1px 边
      const snapshot = data.map(r => [...r]);
      for (let y = 0; y < PX; y++)
        for (let x = 0; x < PX; x++) {
          if (snapshot[y][x] !== null) continue;
          const near =
            (x > 0 && snapshot[y][x - 1]) ||
            (x < PX - 1 && snapshot[y][x + 1]) ||
            (y > 0 && snapshot[y - 1][x]) ||
            (y < PX - 1 && snapshot[y + 1][x]);
          if (near) data[y][x] = c;
        }
    },
  };
  draw(p);
  for (let y = 0; y < PX; y++)
    for (let x = 0; x < PX; x++) {
      const c = data[y][x];
      if (c) {
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  return cv;
}

// ---------- 地面 ----------

const GRASS = "#8fca5c";
const GRASS_D = "#7cb84b";
const GRASS_L = "#a6d873";

function grass(variant: 0 | 1 | 2): HTMLCanvasElement {
  return sprite(p => {
    p.rect(0, 0, PX, PX, GRASS);
    const blades: [number, number][][] = [
      [[2, 4], [11, 2], [6, 9], [13, 11], [4, 13]],
      [[5, 1], [9, 5], [1, 8], [12, 9], [8, 13]],
      [[3, 2], [10, 3], [6, 11], [1, 11], [13, 12]],
    ];
    for (const [x, y] of blades[variant]) {
      p.px(x, y, GRASS_D);
      p.px(x, y + 1, GRASS_D);
      p.px(x + 1, y + 1, GRASS_D);
    }
    const lights: [number, number][][] = [
      [[5, 7], [12, 4], [9, 12], [14, 1]],
      [[3, 6], [10, 12], [14, 5], [2, 12]],
      [[6, 4], [12, 7], [2, 6], [8, 9]],
    ];
    for (const [x, y] of lights[variant]) p.px(x, y, GRASS_L);
    if (variant === 2) {
      // 小花：白瓣黄芯
      p.px(7, 6, "#f5f9ef");
      p.px(7, 8, "#f5f9ef");
      p.px(6, 7, "#f5f9ef");
      p.px(8, 7, "#f5f9ef");
      p.px(7, 7, "#ffd23f");
    }
  });
}

// ---------- 石墩（硬墙） ----------

function stone(): HTMLCanvasElement {
  return sprite(p => {
    p.rect(0, 0, PX, PX, "#39415a"); // 深色缝底
    p.rect(1, 1, 14, 14, "#6f7a94"); // 石块主体
    p.rect(2, 2, 12, 2, "#96a2bd"); // 顶部受光
    p.rect(2, 2, 2, 12, "#8a96b1"); // 左侧受光
    p.rect(2, 12, 12, 2, "#4b5470"); // 底部阴影
    p.rect(12, 4, 2, 10, "#525c78"); // 右侧阴影
    // 内部斑点
    p.px(5, 5, "#8a96b1");
    p.px(10, 7, "#525c78");
    p.px(7, 10, "#8a96b1");
    p.px(11, 5, "#525c78");
    p.px(4, 9, "#525c78");
  });
}

// ---------- 木箱（软墙） ----------

function crate(): HTMLCanvasElement {
  return sprite(p => {
    p.rect(0, 0, PX, PX, "#5e3c17"); // 外框
    p.rect(1, 1, 14, 14, "#c08a44"); // 木板
    p.rect(2, 2, 12, 1, "#d9a55f"); // 顶受光
    p.rect(2, 2, 1, 12, "#d9a55f"); // 左受光
    // X 交叉板
    for (let i = 3; i <= 12; i++) {
      p.px(i, i, "#8f5e2a");
      p.px(15 - i, i, "#8f5e2a");
    }
    // 交叉板高光边
    for (let i = 4; i <= 11; i++) {
      p.px(i, i + 1, "#a06a2c");
      p.px(15 - i, i + 1, "#a06a2c");
    }
    // 铆钉
    for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]]) p.px(x, y, "#2f1d08");
  });
}

// ---------- 角色（4 色 × 静止/两帧行走） ----------

const PLAYER_PALS = [
  { C: "#ff5a5f", c: "#d64549" },
  { C: "#3fa7ff", c: "#2f8fe0" },
  { C: "#ffcb2e", c: "#e0ab22" },
  { C: "#3fdc7f", c: "#2fb869" },
];
const OUTLINE = "#26202e";
const FEET = "#4a3b55";

function player(colorIdx: number, frame: 0 | 1 | 2): HTMLCanvasElement {
  const { C, c } = PLAYER_PALS[colorIdx % 4];
  return sprite(p => {
    p.circle(7.5, 6.5, 5.3, C);
    // 下半身阴影
    p.circle(7.5, 7.6, 4.8, c);
    // 眼睛
    p.rect(4, 4, 2, 3, "#ffffff");
    p.rect(10, 4, 2, 3, "#ffffff");
    p.px(5, 5, "#20202c");
    p.px(10, 5, "#20202c");
    // 脚（行走两帧交替）
    if (frame === 0) {
      p.rect(5, 13, 2, 2, FEET);
      p.rect(9, 13, 2, 2, FEET);
    } else if (frame === 1) {
      p.rect(4, 13, 2, 2, FEET);
      p.rect(10, 12, 2, 2, FEET);
    } else {
      p.rect(4, 12, 2, 2, FEET);
      p.rect(10, 13, 2, 2, FEET);
    }
    p.outline(OUTLINE);
  });
}

// ---------- 泡泡 ----------

function bomb(urgent: boolean): HTMLCanvasElement {
  const body = urgent ? "#8e2b2b" : "#232333";
  const hi = urgent ? "#c06060" : "#585872";
  const dark = urgent ? "#5e1d1d" : "#12121c";
  return sprite(p => {
    p.circle(7.5, 8.5, 5.6, body);
    p.px(6, 6, hi);
    p.px(5, 7, hi);
    p.px(6, 7, hi);
    p.px(7, 6, hi);
    p.rect(5, 12, 6, 2, dark);
    // 引信
    p.px(9, 4, "#caa04b");
    p.px(10, 3, "#caa04b");
    p.px(11, 2, "#caa04b");
    p.outline(OUTLINE);
  });
}

// ---------- 火焰（0 中心 / 1 臂） ----------

function flame(arm: boolean): HTMLCanvasElement {
  return sprite(p => {
    if (arm) {
      p.circle(7.5, 7.5, 6, "#ff8c1a");
      p.circle(7.5, 7.5, 3.6, "#ffc74d");
      p.circle(7.5, 7.5, 1.6, "#fff3b0");
    } else {
      p.circle(7.5, 7.5, 7, "#ff8c1a");
      p.circle(7.5, 7.5, 4.6, "#ffc74d");
      p.circle(7.5, 7.5, 2.4, "#fff3b0");
    }
  });
}

// ---------- 道具（白底小牌 + 图标） ----------

const ITEM_BORDER: Record<ItemType, string> = {
  [ItemType.Bomb]: "#16a085",
  [ItemType.Flame]: "#e67e22",
  [ItemType.Speed]: "#9b59b6",
  [ItemType.Boots]: "#5fa8ff",
  [ItemType.Rod]: "#e8b23f",
  [ItemType.Lantern]: "#ff9f5a",
};

function item(type: ItemType): HTMLCanvasElement {
  const border = ITEM_BORDER[type];
  return sprite(p => {
    p.rect(1, 1, 14, 14, "#f8f9fb");
    p.rect(1, 1, 14, 1, border);
    p.rect(1, 14, 14, 1, border);
    p.rect(1, 1, 1, 14, border);
    p.rect(14, 1, 1, 14, border);
    p.px(2, 2, border);
    p.px(13, 2, border);
    p.px(2, 13, border);
    p.px(13, 13, border);
    switch (type) {
      case ItemType.Bomb:
        p.circle(7.5, 8, 3.8, "#17706b");
        p.px(6, 5, "#7fded2");
        p.px(9, 3, "#17706b");
        p.px(10, 2, "#17706b");
        break;
      case ItemType.Flame:
        p.px(7, 3, "#e67e22");
        p.px(8, 3, "#e67e22");
        p.rect(6, 4, 4, 2, "#e67e22");
        p.circle(7.5, 8.5, 3.2, "#e67e22");
        p.px(7, 9, "#ffe08a");
        p.px(8, 9, "#ffe08a");
        break;
      case ItemType.Speed:
        // 闪电
        for (const [x, y] of [
          [8, 3], [7, 4], [8, 4], [6, 5], [7, 5], [8, 5],
          [5, 6], [6, 6], [7, 6], [8, 6],
          [6, 7], [7, 7], [5, 8], [6, 8], [7, 8], [6, 9], [7, 9],
        ]) p.px(x, y, "#9b59b6");
        break;
      case ItemType.Boots:
        // 雪花
        p.circle(7.5, 7.5, 1.2, "#5fa8ff");
        for (let a = 0; a < 4; a++) {
          const dx = a === 0 ? 1 : a === 1 ? -1 : 0;
          const dy = a === 2 ? 1 : a === 3 ? -1 : 0;
          for (let r = 1; r <= 5; r++) p.px(7 + dx * r, 7 + dy * r, "#5fa8ff");
        }
        break;
      case ItemType.Rod:
        // 避雷针
        p.rect(7, 5, 1, 8, "#c9a24b");
        p.circle(7.5, 3.8, 1.6, "#ffd23f");
        for (const [x, y] of [[10, 5], [9, 6], [10, 6], [9, 7], [10, 8]]) p.px(x, y, "#ffd23f");
        break;
      case ItemType.Lantern:
        p.rect(6, 3, 4, 1, "#b25b1e");
        p.rect(5, 6, 6, 7, "#ffb84d");
        p.rect(6, 7, 4, 5, "#ffd88a");
        p.circle(7.5, 9.5, 1.4, "#fff3b0");
        break;
    }
  });
}

// ---------- 汇总 ----------

export const PIX = {
  grass: [grass(0), grass(1), grass(2)],
  stone: stone(),
  crate: crate(),
  player: [0, 1, 2, 3].map(i => [player(i, 0), player(i, 1), player(i, 2)]),
  bomb: [bomb(false), bomb(true)],
  flame: [flame(false), flame(true)], // [中心, 臂]
  items: [item(0), item(1), item(2), item(3), item(4), item(5)] as HTMLCanvasElement[],
};
