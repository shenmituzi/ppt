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
  /** 武器攻击（激光剑/手枪/精灵球；无武器时无效） */
  onAttack(): void;
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
    if (e.code === "KeyJ" || e.code === "Enter") {
      e.preventDefault();
      if (!e.repeat) handlers.onAttack();
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

/** 输入中枢：监听器只注册一次，各对局模式随时换绑/解绑处理函数；键盘与触屏共用 */
export interface InputHub {
  setHandlers(h: InputHandlers | null): void;
  getHandlers(): InputHandlers | null;
}

export function makeInputHub(): InputHub {
  let handlers: InputHandlers | null = null;
  attachInput({
    onDir: d => handlers?.onDir(d),
    onBomb: () => handlers?.onBomb(),
    onAttack: () => handlers?.onAttack(),
  });
  return {
    setHandlers: h => (handlers = h),
    getHandlers: () => handlers,
  };
}
