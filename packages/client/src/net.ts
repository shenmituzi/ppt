import { Client, type Room } from "colyseus.js";

/** 开发连本机；生产走同域反向代理（nginx /ws → 127.0.0.1:2567） */
function serverUrl(): string {
  if (import.meta.env.DEV) return "ws://localhost:2567";
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

export const colyseus = new Client(serverUrl());

export interface RoomMeta { code?: string; mode?: number }

/** 快速匹配：join 选项必须完全一致（只含 mode），昵称进房后 setName */
export function quickMatch(mode: 2 | 4): Promise<Room> {
  return colyseus.joinOrCreate("game", { mode });
}

/** 冒险模式：5 人席位（真人+人机补位） */
export function adventureMatch(): Promise<Room> {
  return colyseus.joinOrCreate("game", { mode: 5, gameType: "adventure" });
}

/** 创建房间；房间号由服务器通过 code 消息回发给房主 */
export async function createRoom(): Promise<{ room: Room; code: string }> {
  const room = await colyseus.create("game", {});
  room.send("code"); // 向服务器询问房间号
  const code = await new Promise<string>(resolve => {
    const timer = setTimeout(() => resolve(""), 3000);
    room.onMessage("code", (c: string) => {
      clearTimeout(timer);
      resolve(c);
    });
  });
  return { room, code };
}

/** 按房间号查找并加入（开局后房间已 lock，列表里查不到 → 提示不存在） */
export async function joinByCode(code: string): Promise<Room> {
  const rooms = await colyseus.getAvailableRooms("game");
  const target = rooms.find(r => (r.metadata as RoomMeta)?.code === code.toUpperCase());
  if (!target) throw new Error("房间不存在或已开局");
  return colyseus.joinById(target.roomId, {});
}

/** 保存重连令牌（对局中刷新页面后可回到原对局） */
export function saveReconnect(room: Room) {
  sessionStorage.setItem(
    "pt-rejoin",
    JSON.stringify({ roomId: room.roomId, token: room.reconnectionToken }),
  );
  room.onLeave.once(() => sessionStorage.removeItem("pt-rejoin"));
}

/** 尝试重连上次的对局（服务器 allowReconnection 窗口 30 秒内有效） */
export async function tryReconnect(): Promise<Room | null> {
  const raw = sessionStorage.getItem("pt-rejoin");
  if (!raw) return null;
  try {
    const { token } = JSON.parse(raw);
    return await colyseus.reconnect(token);
  } catch {
    sessionStorage.removeItem("pt-rejoin");
    return null;
  }
}
