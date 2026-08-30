/** 服务器 GameRoomState 的客户端只读视图（与 server/src/state/GameRoomState.ts 字段一一对应） */
export interface PlayerStateView {
  id: string; name: string; colorIndex: number;
  x: number; y: number; moving: boolean;
  bombsMax: number; flameLen: number; speedLevel: number;
  alive: boolean; invincible: boolean; connected: boolean;
}
export interface GameRoomStateView {
  phase: "waiting" | "playing" | "ended";
  grid: string;
  serverElapsedMs: number;
  suddenDeathAt: number;
  players: Map<string, PlayerStateView>;
  bombs: Map<string, { id: string; gx: number; gy: number; power: number; fuse: number; ownerId: string }>;
  flames: Map<string, { id: string; cells: number[]; life: number }>;
  items: Map<string, { id: string; gx: number; gy: number; type: number }>;
  winnerIds: string[];
}
