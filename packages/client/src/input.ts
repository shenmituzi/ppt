export type Dir = "up" | "down" | "left" | "right";

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
};

export interface InputHandlers {
  onDir(d: Dir | "none"): void;
  onBomb(): void;
}

/** 后按下的方向优先（栈顶）；松开后回退到上一个仍按住的方向 */
export function attachInput(handlers: InputHandlers): void {
  const stack: Dir[] = [];
  const emit = () => handlers.onDir(stack.length ? stack[stack.length - 1] : "none");

  window.addEventListener("keydown", e => {
    if (e.target instanceof HTMLInputElement) return;
    const dir = KEY_DIR[e.code];
    if (dir) {
      e.preventDefault();
      if (!stack.includes(dir)) {
        stack.push(dir);
        emit();
      }
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      if (!e.repeat) handlers.onBomb();
    }
  });

  window.addEventListener("keyup", e => {
    const dir = KEY_DIR[e.code];
    if (!dir) return;
    const i = stack.indexOf(dir);
    if (i >= 0) {
      stack.splice(i, 1);
      emit();
    }
  });
}

/** 输入中枢：监听器只注册一次，各对局模式随时换绑/解绑处理函数 */
export function makeInputHub(): { setHandlers(h: InputHandlers | null): void } {
  let handlers: InputHandlers | null = null;
  attachInput({
    onDir: d => handlers?.onDir(d),
    onBomb: () => handlers?.onBomb(),
  });
  return { setHandlers: h => (handlers = h) };
}
