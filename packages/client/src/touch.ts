import type { Dir, InputHub } from "./input";
import { sfx } from "./sfx";

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
    <div id="joy-pad"><div id="joy-knob"></div></div>
    <button id="bomb-btn" type="button">💣<small>放炸弹</small></button>
    <button id="atk-btn" type="button">⚔️<small>武器</small></button>
    <button id="pause-btn" type="button" title="暂停">Ⅱ</button>`;
  document.getElementById("app")!.appendChild(layer);
  // 长按不弹系统菜单
  layer.addEventListener("contextmenu", e => e.preventDefault());

  const surface = document.getElementById("move-surface")!;
  const pad = document.getElementById("joy-pad")!;
  const knob = document.getElementById("joy-knob")!;
  const bombBtn = document.getElementById("bomb-btn")!;
  const atkBtn = document.getElementById("atk-btn")!;
  const pauseBtn = document.getElementById("pause-btn")!;

  let joyId: number | null = null;
  let startX = 0;
  let startY = 0;
  let currentDir: Dir | "none" = "none";

  const sendDir = (d: Dir | "none") => {
    if (d === currentDir) return;
    currentDir = d;
    hub.getHandlers()?.onDir(d);
  };

  const feedback = (name: "bomb" | "laser") => { navigator.vibrate?.(22); sfx.play(name === "bomb" ? "bomb" : "laser"); };
  pad.addEventListener("pointerdown", e => {
    if (joyId !== null) return;
    joyId = e.pointerId; startX = e.clientX; startY = e.clientY; pad.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  pad.addEventListener("pointermove", e => {
    if (e.pointerId !== joyId) return;
    const r = pad.getBoundingClientRect(); const dx=e.clientX-(r.left+r.width/2), dy=e.clientY-(r.top+r.height/2); const d=dirFromOffset(dx,dy);
    const dist=Math.min(42,Math.hypot(dx,dy)); const k=Math.hypot(dx,dy)?dist/Math.hypot(dx,dy):0; knob.style.transform=`translate(calc(-50% + ${dx*k}px),calc(-50% + ${dy*k}px))`; sendDir(d);
  });
  const release = (e: PointerEvent) => {
    if (e.pointerId !== joyId) return; joyId=null; knob.style.transform="translate(-50%,-50%)"; sendDir("none");
  };
  pad.addEventListener("pointerup", release); pad.addEventListener("pointercancel", release);

  bombBtn.addEventListener("pointerdown", e => {
    e.preventDefault();
    feedback("bomb");
    hub.getHandlers()?.onBomb();
  });
  atkBtn.addEventListener("pointerdown", e => {
    e.preventDefault();
    feedback("laser");
    hub.getHandlers()?.onAttack();
  });

  // 阻止移动端双击缩放 / 长按选中文本（不影响 Pointer 事件）
  pauseBtn.addEventListener("pointerdown", e => { e.preventDefault(); sendDir("none"); window.dispatchEvent(new Event("game-pause")); navigator.vibrate?.(18); });
  for (const el of [surface, pad, bombBtn, atkBtn, pauseBtn]) {
    el.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
  }
}
