import type { Dir, InputHub } from "./input";

/**
 * 触屏操作：左下角浮动虚拟摇杆（按下处为原点，拖动控制方向）+ 右下角炸弹按钮。
 * Pointer Events 多点触控，支持边移动边放泡泡；仅在触屏设备显示（?touch=1 可强制显示）。
 */

const JOY_RADIUS = 44; // 摇杆头最大偏移（px）
const DEAD_ZONE = 8; // 死区（px），小于此距离视为不动

const shouldShow = () =>
  new URLSearchParams(location.search).has("touch") ||
  "ontouchstart" in window ||
  navigator.maxTouchPoints > 0;

/** 由偏移向量得出四方向；死区内返回 none，斜向取主导轴 */
function dirFromOffset(dx: number, dy: number): Dir | "none" {
  const dist = Math.hypot(dx, dy);
  if (dist < DEAD_ZONE) return "none";
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

export function createTouchControls(hub: InputHub): void {
  if (!shouldShow()) return;

  const layer = document.createElement("div");
  layer.id = "touch-layer";
  layer.innerHTML = `
    <div id="joy-zone">
      <div id="joy-base" class="hidden"><div id="joy-knob"></div></div>
    </div>
    <div id="bomb-btn">💣</div>
    <div id="atk-btn">⚔️</div>`;
  document.getElementById("app")!.appendChild(layer);
  // 长按不弹系统菜单
  layer.addEventListener("contextmenu", e => e.preventDefault());

  const zone = document.getElementById("joy-zone")!;
  const base = document.getElementById("joy-base")!;
  const knob = document.getElementById("joy-knob")!;

  let joyId: number | null = null; // 当前占用摇杆的指针
  let originX = 0;
  let originY = 0;
  let currentDir: Dir | "none" = "none";

  const sendDir = (d: Dir | "none") => {
    if (d === currentDir) return;
    currentDir = d;
    hub.getHandlers()?.onDir(d);
  };

  const placeBase = (x: number, y: number) => {
    base.style.left = `${x - zone.clientWidth / 2}px`;
    base.style.top = `${y - zone.clientHeight / 2}px`;
  };
  const placeKnob = (dx: number, dy: number) => {
    const dist = Math.hypot(dx, dy);
    const scale = dist > JOY_RADIUS ? JOY_RADIUS / dist : 1;
    knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
  };

  zone.addEventListener("pointerdown", e => {
    if (joyId !== null || !e.isPrimary) return;
    joyId = e.pointerId;
    try {
      zone.setPointerCapture(e.pointerId); // 手指滑出区域后仍能收到 move/up
    } catch {
      /* 个别环境（合成事件等）捕获失败，不影响基本操作 */
    }
    const rect = zone.getBoundingClientRect();
    originX = e.clientX - rect.left;
    originY = e.clientY - rect.top;
    placeBase(originX, originY);
    base.classList.remove("hidden");
    sendDir("none");
    e.preventDefault();
  });
  zone.addEventListener("pointermove", e => {
    if (e.pointerId !== joyId) return;
    const rect = zone.getBoundingClientRect();
    const dx = e.clientX - rect.left - originX;
    const dy = e.clientY - rect.top - originY;
    placeKnob(dx, dy);
    sendDir(dirFromOffset(dx, dy));
  });
  const releaseJoy = (e: PointerEvent) => {
    if (e.pointerId !== joyId) return;
    joyId = null;
    base.classList.add("hidden");
    knob.style.transform = "translate(0, 0)";
    sendDir("none");
  };
  zone.addEventListener("pointerup", releaseJoy);
  zone.addEventListener("pointercancel", releaseJoy);

  document.getElementById("bomb-btn")!.addEventListener("pointerdown", e => {
    e.preventDefault();
    hub.getHandlers()?.onBomb();
  });
  document.getElementById("atk-btn")!.addEventListener("pointerdown", e => {
    e.preventDefault();
    hub.getHandlers()?.onAttack();
  });
}
