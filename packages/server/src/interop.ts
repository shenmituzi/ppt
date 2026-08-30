import colyseus from "colyseus";

/**
 * colyseus 本体是 CJS 打包，在 Node ESM 下 `import { Room } from "colyseus"`
 * 会报"没有命名为 Room 的导出"，必须经默认导出解构。
 * 统一从这里取运行时值；类型仍来自 colyseus 的声明文件。
 */
export const { Server, Room } = colyseus;
