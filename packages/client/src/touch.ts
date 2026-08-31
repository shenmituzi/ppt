import type { Dir, InputHub } from "./input";

/**
 * 触屏操作：屏幕任意位置按住并滑动控制方向，右下角按钮负责动作。
 */

const DEAD_ZONE = 9; // 死区（px），小于此距离视为不动

const shouldShow = () =>
  new URLSearchParams(location.search).has("touch") ||
  "ontouchstart" in window ||
  navigator.maxTouchPoints > 0;

/** 由偏移向量得出四方向；死区内视为不动，斜向取主导轴 */
function dirFromOffset(dx: number, dy: number): Dir | "none" {
  if (Math.hypot(dx, dy) < DEAD_ZONE) return "none";
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

export function createTouchControls(hub: InputHub): void {
  if (!shouldShow()) return;

  const layer = document.createElement("div");
  layer.id = "touch-layer";
  layer.innerHTML = `
    <div id="move-surface" aria-hidden="true"></div>
    <div id="bomb-btn">💣</div>
    <div id="atk-btn">⚔️</div>`;
  document.getElementById("app")!.appendChild(layer);
  // 长按不弹系统菜单
  layer.addEventListener("contextmenu", e => e.preventDefault());

  const surface = document.getElementById("move-surface")!;
  const bombBtn = document.getElementById("bomb-btn")!;
  const atkBtn = document.getElementById("atk-btn")!;

  let moveId: number | null = null;
  let startX = 0;
  let startY = 0;
  let currentDir: Dir | "none" = "none";

  const sendDir = (d: Dir | "none") => {
    if (d === currentDir) return;
    currentDir = d;
    hub.getHandlers()?.onDir(d);
  };

  surface.addEventListener("pointerdown", e => {
    if (moveId !== null) return;
    moveId = e.pointerId; startX = e.clientX; startY = e.clientY;
    surface.setPointerCapture(e.pointerId);
    sendDir("none");
    e.preventDefault();
  });
  surface.addEventListener("pointermove", e => {
    if (e.pointerId !== moveId) return;
    sendDir(dirFromOffset(e.clientX - startX, e.clientY - startY));
  });
  const release = (e: PointerEvent) => {
    if (e.pointerId !== moveId) return;
    moveId = null;
    sendDir("none");
  };
  surface.addEventListener("pointerup", release);
  surface.addEventListener("pointercancel", release);

  bombBtn.addEventListener("pointerdown", e => {
    e.preventDefault();
    hub.getHandlers()?.onBomb();
  });
  atkBtn.addEventListener("pointerdown", e => {
    e.preventDefault();
    hub.getHandlers()?.onAttack();
  });

  // 阻止移动端双击缩放 / 长按选中文本（不影响 Pointer 事件）
  for (const el of [surface, bombBtn, atkBtn]) {
    el.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
  }
}
