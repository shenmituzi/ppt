/** 服务器 GameRoomState 的客户端只读视图（与 server/src/state/GameRoomState.ts 字段一一对应） */
export interface PlayerStateView {
  id: string; name: string; colorIndex: number;
  x: number; y: number; moving: boolean;
  bombsMax: number; flameLen: number; speedLevel: number;
  alive: boolean; invincible: boolean; connected: boolean;
  bootsOn: boolean; rodOn: boolean; lanternOn: boolean;
  lives: number; weapon: string; mounted: boolean; trapped: boolean;
  sun: number; mushroomLv: number;
}
export interface MonsterStateView {
  id: string; x: number; y: number;
  hp: number; maxHp: number; level: number; state: string;
}
export interface HouseStateView {
  id: string; gx: number; gy: number;
  hp: number; maxHp: number; destroyed: boolean;
}
export interface DeviceStateView {
  id: string; type: string; gx: number; gy: number;
}
export interface GameRoomStateView {
  mapId: string;
  gardenPhase: "day" | "night";
  gardenPhaseProgress: number;
  vineCells: number[];
  vineRegrowAt: number[];
  phase: "waiting" | "gathering" | "playing" | "ended";
  gameType: string;
  weather: string;
  grid: string;
  serverElapsedMs: number;
  suddenDeathAt: number;
  gatherEndsAt: number;
  players: Map<string, PlayerStateView>;
  bombs: Map<string, { id: string; gx: number; gy: number; power: number; fuse: number; ownerId: string }>;
  flames: Map<string, { id: string; cells: number[]; life: number }>;
  items: Map<string, { id: string; gx: number; gy: number; type: number }>;
  monsters: Map<string, MonsterStateView>;
  houses: Map<string, HouseStateView>;
  devices: Map<string, DeviceStateView>;
  bullets: Map<string, { id: string; x: number; y: number }>;
  portals: Map<string, { id: string; ax: number; ay: number; bx: number; by: number; remainingMs: number }>;
  winnerIds: string[];
}
