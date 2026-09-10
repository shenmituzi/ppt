import type { InputHub } from "./input";
import { sfx } from "./sfx";
import { directionFromVector, followJoystick, type TouchDirection } from "./touch-geometry";

/** 手机触屏：左侧大区域任意落指生成浮动摇杆，右侧动作键可同时多指操作。 */
const shouldShow = () =>
  new URLSearchParams(location.search).has("touch") ||
  "ontouchstart" in window ||
  navigator.maxTouchPoints > 0;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createTouchControls(hub: InputHub): void {
  if (!shouldShow()) return;

  const layer = document.createElement("div");
  layer.id = "touch-layer";
  layer.innerHTML = `
    <div id="move-surface" role="application" aria-label="左侧任意位置滑动控制方向"></div>
    <div id="joy-pad" aria-hidden="true" data-dir="none">
      <i class="joy-dir up">▲</i><i class="joy-dir right">▶</i>
      <i class="joy-dir down">▼</i><i class="joy-dir left">◀</i>
      <div id="joy-knob"></div>
    </div>
    <div id="joy-hint" aria-hidden="true">左侧任意位置滑动</div>
    <button id="bomb-btn" type="button" aria-label="放炸弹">💣<small>放炸弹</small></button>
    <button id="atk-btn" type="button" aria-label="使用武器">⚔️<small>武器</small></button>
    <button id="pause-btn" type="button" title="暂停" aria-label="暂停">Ⅱ</button>`;
  document.getElementById("app")!.appendChild(layer);
  layer.addEventListener("contextmenu", e => e.preventDefault());

  const surface = document.getElementById("move-surface")!;
  const pad = document.getElementById("joy-pad")!;
  const knob = document.getElementById("joy-knob")!;
  const hint = document.getElementById("joy-hint")!;
  const bombBtn = document.getElementById("bomb-btn")!;
  const atkBtn = document.getElementById("atk-btn")!;
  const pauseBtn = document.getElementById("pause-btn")!;

  let joyId: number | null = null;
  let originX = 0;
  let originY = 0;
  let currentDir: TouchDirection = "none";
  let releaseTimer = 0;

  const sendDir = (direction: TouchDirection) => {
    if (direction === currentDir) return;
    currentDir = direction;
    pad.dataset.dir = direction;
    hub.getHandlers()?.onDir(direction);
    if (direction !== "none") navigator.vibrate?.(7);
  };

  const placePad = (x: number, y: number) => {
    const size = pad.getBoundingClientRect().width || 148;
    pad.style.left = `${x - size / 2}px`;
    pad.style.top = `${y - size / 2}px`;
    pad.style.bottom = "auto";
  };

  const beginMove = (event: PointerEvent) => {
    if (joyId !== null || event.button !== 0) return;
    window.clearTimeout(releaseTimer);
    joyId = event.pointerId;
    const bounds = surface.getBoundingClientRect();
    // 控制原点严格落在首次触点，避免靠近屏幕边缘时被强制偏移而误判方向。
    originX = clamp(event.clientX, bounds.left, bounds.right);
    originY = clamp(event.clientY, bounds.top, bounds.bottom);
    placePad(originX, originY);
    knob.style.transform = "translate(-50%,-50%)";
    pad.classList.add("active");
    hint.classList.add("used");
    localStorage.setItem("pt-touch-hint", "1");
    surface.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const updateMove = (event: PointerEvent) => {
    if (event.pointerId !== joyId) return;
    const samples = event.getCoalescedEvents?.() ?? [event];
    const point = samples[samples.length - 1];
    const bounds = surface.getBoundingClientRect();
    const padSize = pad.getBoundingClientRect().width || 148;
    const maxRadius = Math.max(42, Math.min(52, padSize * 0.34));
    const deadZone = Math.max(10, padSize * 0.075);
    const rawDx = point.clientX - originX;
    const rawDy = point.clientY - originY;
    const nextDir = directionFromVector(rawDx, rawDy, currentDir, deadZone);
    const follow = followJoystick(originX, originY, point.clientX, point.clientY, maxRadius);
    originX = clamp(follow.originX, bounds.left, bounds.right);
    originY = clamp(follow.originY, bounds.top, bounds.bottom);
    const knobDx = clamp(point.clientX - originX, -maxRadius, maxRadius);
    const knobDy = clamp(point.clientY - originY, -maxRadius, maxRadius);
    const knobDistance = Math.hypot(knobDx, knobDy);
    const scale = knobDistance > maxRadius ? maxRadius / knobDistance : 1;
    placePad(originX, originY);
    knob.style.transform = `translate(calc(-50% + ${knobDx * scale}px),calc(-50% + ${knobDy * scale}px))`;
    sendDir(nextDir);
    event.preventDefault();
  };

  const releaseMove = (event?: PointerEvent) => {
    if (event && event.pointerId !== joyId) return;
    const activeId = joyId;
    joyId = null;
    if (activeId !== null && surface.hasPointerCapture(activeId)) surface.releasePointerCapture(activeId);
    knob.style.transform = "translate(-50%,-50%)";
    sendDir("none");
    pad.classList.remove("active");
    releaseTimer = window.setTimeout(() => {
      pad.style.removeProperty("left");
      pad.style.removeProperty("top");
      pad.style.removeProperty("bottom");
    }, 120);
  };

  surface.addEventListener("pointerdown", beginMove);
  surface.addEventListener("pointermove", updateMove);
  surface.addEventListener("pointerup", releaseMove);
  surface.addEventListener("pointercancel", releaseMove);
  surface.addEventListener("lostpointercapture", () => releaseMove());

  const action = (button: HTMLElement, kind: "bomb" | "laser", run: () => void) => {
    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      button.classList.add("pressed");
      navigator.vibrate?.(kind === "bomb" ? 22 : 16);
      sfx.play(kind);
      run();
    });
    const release = () => button.classList.remove("pressed");
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  };
  action(bombBtn, "bomb", () => hub.getHandlers()?.onBomb());
  action(atkBtn, "laser", () => hub.getHandlers()?.onAttack());
  pauseBtn.addEventListener("pointerdown", event => {
    event.preventDefault();
    releaseMove();
    window.dispatchEvent(new Event("game-pause"));
    navigator.vibrate?.(18);
  });

  for (const el of [surface, bombBtn, atkBtn, pauseBtn]) {
    el.addEventListener("touchstart", event => event.preventDefault(), { passive: false });
  }
  window.addEventListener("blur", () => releaseMove());
  document.addEventListener("visibilitychange", () => { if (document.hidden) releaseMove(); });
  if (localStorage.getItem("pt-touch-hint") === "1") hint.classList.add("used");
}
