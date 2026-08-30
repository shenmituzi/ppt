import type { ItemType, WeatherType } from "./constants";

export type Dir = "up" | "down" | "left" | "right";
/** 玩家当前按住的方向；none = 全部松开 */
export type DirInput = Dir | "none";

export type Phase = "waiting" | "playing" | "ended";

export interface Vec {
  gx: number;
  gy: number;
}

export type GameEvent =
  | { type: "bombPlaced"; gx: number; gy: number; ownerId: string }
  | { type: "exploded"; cells: Vec[] }
  | { type: "wallBroken"; gx: number; gy: number; item: ItemType | null }
  | { type: "itemPicked"; playerId: string; itemType: ItemType }
  | { type: "died"; playerId: string; gx: number; gy: number }
  | { type: "ended"; winnerIds: string[] }
  /** 雷雨：闪电即将劈中某格（客户端显示警示圈） */
  | { type: "lightningWarn"; gx: number; gy: number; strikeAt: number }
  /** 雷雨：闪电落下（劈中软墙会烧毁并可能掉道具，劈中人即死，避雷针可免疫） */
  | { type: "lightningStrike"; gx: number; gy: number; item: ItemType | null };

export function dirDx(d: Dir | null): number {
  return d === "left" ? -1 : d === "right" ? 1 : 0;
}
export function dirDy(d: Dir | null): number {
  return d === "up" ? -1 : d === "down" ? 1 : 0;
}
