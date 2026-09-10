import type { Dir } from "./input";

export type TouchDirection = Dir | "none";

/**
 * 四方向选择带方向滞回：靠近 45° 分界时保持当前方向，减少拇指轻微抖动导致的反复转向。
 */
export function directionFromVector(
  dx: number,
  dy: number,
  current: TouchDirection = "none",
  deadZone = 11,
  holdRatio = 0.78,
): TouchDirection {
  const distance = Math.hypot(dx, dy);
  if (distance < deadZone) return "none";

  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (current === "left" && dx < 0 && ax >= ay * holdRatio) return current;
  if (current === "right" && dx > 0 && ax >= ay * holdRatio) return current;
  if (current === "up" && dy < 0 && ay >= ax * holdRatio) return current;
  if (current === "down" && dy > 0 && ay >= ax * holdRatio) return current;
  if (ax >= ay) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "down" : "up";
}

export interface FollowResult {
  originX: number;
  originY: number;
  knobX: number;
  knobY: number;
}

/** 超出摇杆行程后让基座随手指平移，避免拇指滑远后丢失控制。 */
export function followJoystick(
  originX: number,
  originY: number,
  pointerX: number,
  pointerY: number,
  maxRadius: number,
): FollowResult {
  const dx = pointerX - originX;
  const dy = pointerY - originY;
  const distance = Math.hypot(dx, dy);
  if (!distance || distance <= maxRadius) {
    return { originX, originY, knobX: dx, knobY: dy };
  }
  const ux = dx / distance;
  const uy = dy / distance;
  const overflow = distance - maxRadius;
  return {
    originX: originX + ux * overflow,
    originY: originY + uy * overflow,
    knobX: ux * maxRadius,
    knobY: uy * maxRadius,
  };
}
