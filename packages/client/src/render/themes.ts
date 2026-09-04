import type { MapId } from "@pt/shared";

export interface Theme {
  groundA: string; groundB: string; detail: string; flower: string[];
  vine: string; stream: string; spawn: string; parallax: string; detailRate: number;
}

/** Client-only art registry. Tile semantics remain owned by shared. */
export const THEMES: Record<MapId, Theme> = {
  classic: { groundA: "#9cd478", groundB: "#96cc71", detail: "#7dbb5d", flower: ["#ffffff"], vine: "#496447", stream: "#73c9b0", spawn: "#ffffff", parallax: "#ffffff", detailRate: 0 },
  garden: { groundA: "#a9df86", groundB: "#8fca6b", detail: "#72b85e", flower: ["#fff4bd", "#f59b91", "#d9b6ef", "#fffdf6"], vine: "#3f9b55", stream: "#73c9b0", spawn: "#ffe49a", parallax: "#619b58", detailRate: 9 },
};
