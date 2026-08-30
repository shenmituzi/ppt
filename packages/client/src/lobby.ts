import type { Room } from "colyseus.js";
import { quickMatch, createRoom, joinByCode } from "./net";
import type { GameRoomStateView } from "./schema-types";

type GameRoom = Room<GameRoomStateView>;

export function initLobby(onEnter: (room: GameRoom) => void, onLocal: () => void) {
  const lobby = document.getElementById("screen-lobby")!;
  const status = document.getElementById("lobby-status")!;
  const nickname = document.getElementById("nickname") as HTMLInputElement;
  nickname.value = localStorage.getItem("pt-name") || "";
  // input 事件：无论手输还是程序填充都能及时保存
  nickname.addEventListener("input", () => localStorage.setItem("pt-name", nickname.value.trim()));

  const say = (s: string) => (status.textContent = s);
  const guard = (fn: () => Promise<void>) =>
    fn().catch(e => say(`❌ ${e instanceof Error ? e.message : String(e)}`));

  /** 监听房间进入 playing → 进入游戏画面；进房即报昵称 */
  function watchAndEnter(room: GameRoom) {
    room.send("setName", localStorage.getItem("pt-name") || "无名氏");
    const check = () => {
      if (room.state.phase === "playing") onEnter(room);
    };
    room.onStateChange(check);
    check();
  }

  /** 创建房间后的等待画面：玩家列表 + 房主"开始游戏"按钮 */
  function showWaiting(room: GameRoom) {
    lobby.querySelectorAll("button, input, p").forEach(el => {
      if (el.id !== "lobby-status") (el as HTMLElement).style.display = "none";
    });
    const info = document.createElement("p");
    const startBtn = document.createElement("button");
    startBtn.textContent = "开始游戏";
    startBtn.onclick = () => room.send("start");
    lobby.appendChild(info);
    lobby.appendChild(startBtn);
    const refresh = () => {
      const names: string[] = [];
      room.state.players.forEach(p => names.push(p.name));
      info.textContent = `玩家：${names.join("、")}（${names.length}/4）—— 满员自动开局，房主可直接开始`;
    };
    room.onStateChange(refresh);
    refresh();
  }

  // 单机练习入口
  const localBtn = document.createElement("button");
  localBtn.textContent = "单机练习";
  localBtn.onclick = onLocal;
  lobby.appendChild(localBtn);

  document.getElementById("btn-quick2")!.onclick = () =>
    guard(async () => {
      say("匹配中…（30 秒没凑齐就创建房间喊朋友吧）");
      watchAndEnter(await quickMatch(2));
    });
  document.getElementById("btn-quick4")!.onclick = () =>
    guard(async () => {
      say("匹配中…");
      watchAndEnter(await quickMatch(4));
    });
  document.getElementById("btn-create")!.onclick = () =>
    guard(async () => {
      say("创建中…");
      const { room, code } = await createRoom();
      say(code ? `房间号 ${code} —— 发给朋友，满员自动开局` : "已创建房间");
      watchAndEnter(room);
      showWaiting(room);
    });
  document.getElementById("btn-join")!.onclick = () =>
    guard(async () => {
      const code = (document.getElementById("room-code") as HTMLInputElement).value.trim();
      if (code.length !== 4) {
        say("请输入 4 位房间号");
        return;
      }
      say("加入中…");
      watchAndEnter(await joinByCode(code));
    });
}
