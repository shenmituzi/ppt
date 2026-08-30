import { Client, type Room } from "colyseus.js";

export const colyseus = new Client("ws://localhost:2567");

export interface RoomMeta { code?: string; mode?: number }

/** 快速匹配：join 选项必须完全一致（只含 mode），昵称进房后 setName */
export function quickMatch(mode: 2 | 4): Promise<Room> {
  return colyseus.joinOrCreate("game", { mode });
}

/** 创建房间；房间号由服务器通过 code 消息回发给房主 */
export async function createRoom(): Promise<{ room: Room; code: string }> {
  const room = await colyseus.create("game", {});
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
  sessionStorage.setItem("pt-rejoin", JSON.stringify({ roomId: room.roomId, sessionId: room.sessionId }));
  room.onLeave.once(() => sessionStorage.removeItem("pt-rejoin"));
}

/** 尝试重连上次的对局 */
export async function tryReconnect(): Promise<Room | null> {
  const raw = sessionStorage.getItem("pt-rejoin");
  if (!raw) return null;
  try {
    const { roomId, sessionId } = JSON.parse(raw);
    return await colyseus.reconnect(roomId, sessionId);
  } catch {
    sessionStorage.removeItem("pt-rejoin");
    return null;
  }
}
