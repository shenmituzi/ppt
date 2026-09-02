import type { Dir, InputHub } from "./input";

/**
 * 触屏操作：屏幕任意位置按住并滑动控制方向，右下角按钮负责动作。
 */

const DEAD_ZONE = 12;

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

  const pointers = new Map<number, { x: number; y: number }>();
  let anchorX = 0;
  let anchorY = 0;
  let panX = 0;
  let panY = 0;
  let gesture: "move" | "pan" = "move";
  let timer: number | null = null;
  let currentDir: Dir | "none" = "none";

  const sendDir = (d: Dir | "none") => {
    if (d === currentDir) return;
    currentDir = d;
    hub.getHandlers()?.onDir(d);
  };

  surface.addEventListener("pointerdown", e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    surface.setPointerCapture(e.pointerId);
    if (pointers.size === 1) {
      anchorX = e.clientX; anchorY = e.clientY;
      gesture = "move";
      timer = window.setTimeout(() => { gesture = "pan"; sendDir("none"); }, 260);
    } else if (pointers.size === 2) {
      sendDir("none");
      panX = [...pointers.values()].reduce((n, p) => n + p.x, 0) / 2;
      panY = [...pointers.values()].reduce((n, p) => n + p.y, 0) / 2;
    }
    e.preventDefault();
  });
  surface.addEventListener("pointermove", e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const pts = [...pointers.values()];
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      window.dispatchEvent(new CustomEvent("camera-pan", { detail: { dx: cx - panX, dy: cy - panY } }));
      panX = cx; panY = cy;
      sendDir("none");
      return;
    }
    if (gesture === "pan") {
      window.dispatchEvent(new CustomEvent("camera-pan", { detail: { dx: e.clientX - anchorX, dy: e.clientY - anchorY } }));
      anchorX = e.clientX; anchorY = e.clientY;
      return;
    }
    const d = dirFromOffset(e.clientX - anchorX, e.clientY - anchorY);
    if (d !== "none") {
      sendDir(d);
      // 连续转向以最近一次有效滑动为基准，不必跨回最初触点。
      anchorX = e.clientX; anchorY = e.clientY;
    }
  });
  const release = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    if (timer) { clearTimeout(timer); timer = null; }
    if (pointers.size === 0) sendDir("none");
    else {
      const p = [...pointers.values()][0];
      anchorX = p.x; anchorY = p.y;
    }
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
