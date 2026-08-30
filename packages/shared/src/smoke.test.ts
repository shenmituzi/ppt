import { describe, it, expect } from "vitest";
import { GRID_W, GRID_H } from "./constants";

describe("冒烟", () => {
  it("常量存在", () => {
    expect(GRID_W).toBe(13);
    expect(GRID_H).toBe(11);
  });
});
