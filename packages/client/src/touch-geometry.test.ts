import { describe, expect, it } from "vitest";
import { directionFromVector, followJoystick } from "./touch-geometry";

describe("手机摇杆方向判定", () => {
  it("死区内保持静止", () => expect(directionFromVector(6, 7)).toBe("none"));
  it("识别四个基础方向", () => {
    expect(directionFromVector(30, 3)).toBe("right");
    expect(directionFromVector(-30, 3)).toBe("left");
    expect(directionFromVector(3, -30)).toBe("up");
    expect(directionFromVector(3, 30)).toBe("down");
  });
  it("45度边界附近保持当前方向，明显转向后才切换", () => {
    expect(directionFromVector(18, 20, "right")).toBe("right");
    expect(directionFromVector(10, 24, "right")).toBe("down");
    expect(directionFromVector(-24, 2, "right")).toBe("left");
  });
});

describe("浮动摇杆跟手", () => {
  it("行程内只移动旋钮", () => expect(followJoystick(100, 100, 120, 100, 48)).toEqual({ originX: 100, originY: 100, knobX: 20, knobY: 0 }));
  it("超出行程后移动基座并限制旋钮半径", () => {
    const result = followJoystick(100, 100, 200, 100, 48);
    expect(result.originX).toBe(152);
    expect(result.knobX).toBe(48);
    expect(result.originY).toBe(100);
  });
});
