import type { Dir, InputHub } from "./input";

/**
 * 触屏操作：左下角常驻圆形摇杆（圆环 + 中心圆点，拖动控制方向），
 * 右下角 💣 放泡泡 / ⚔️ 使用武器。多点触控互不干扰；仅触屏设备显示（?touch=1 可强制）。
 */

const KNOB_RADIUS = 46; // 圆点最大拖动半径（px）
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
    <div id="joy-pad">
      <div id="joy-ring"></div>
      <div id="joy-knob"></div>
    </div>
    <div id="bomb-btn">💣</div>
    <div id="atk-btn">⚔️</div>`;
  document.getElementById("app")!.appendChild(layer);
  // 长按不弹系统菜单
  layer.addEventListener("contextmenu", e => e.preventDefault());

  const pad = document.getElementById("joy-pad")!;
  const knob = document.getElementById("joy-knob")!;
  const bombBtn = document.getElementById("bomb-btn")!;
  const atkBtn = document.getElementById("atk-btn")!;

  let joyId: number | null = null; // 当前操控摇杆的手指
  let currentDir: Dir | "none" = "none";

  const sendDir = (d: Dir | "none") => {
    if (d === currentDir) return;
    currentDir = d;
    hub.getHandlers()?.onDir(d);
  };

  /** 圆点位置：以摇杆中心为原点，最多拖到 KNOB_RADIUS */
  const setKnob = (dx: number, dy: number) => {
    const dist = Math.hypot(dx, dy);
    const k = dist > KNOB_RADIUS ? KNOB_RADIUS / dist : 1;
    knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
  };

  pad.addEventListener("pointerdown", e => {
    if (joyId !== null) return; // 已有一根手指在操控
    joyId = e.pointerId;
    try {
      pad.setPointerCapture(e.pointerId); // 拖出圆环仍可继续控制
    } catch {
      /* 个别环境捕获失败，不影响基本操作 */
    }
    const r = pad.getBoundingClientRect();
    setKnob(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    sendDir(dirFromOffset(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)));
    pad.classList.add("active");
    e.preventDefault();
  });
  pad.addEventListener("pointermove", e => {
    if (e.pointerId !== joyId) return;
    const r = pad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    setKnob(dx, dy);
    sendDir(dirFromOffset(dx, dy));
  });
  const release = (e: PointerEvent) => {
    if (e.pointerId !== joyId) return;
    joyId = null;
    setKnob(0, 0);
    sendDir("none");
    pad.classList.remove("active");
  };
  pad.addEventListener("pointerup", release);
  pad.addEventListener("pointercancel", release);

  bombBtn.addEventListener("pointerdown", e => {
    e.preventDefault();
    hub.getHandlers()?.onBomb();
  });
  atkBtn.addEventListener("pointerdown", e => {
    e.preventDefault();
    hub.getHandlers()?.onAttack();
  });

  // 阻止移动端双击缩放 / 长按选中文本（不影响 Pointer 事件）
  for (const el of [pad, bombBtn, atkBtn]) {
    el.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
  }
}
