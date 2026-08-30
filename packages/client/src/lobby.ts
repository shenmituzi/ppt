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

  /** 监听房间进入 playing → 进入游戏画面（只触发一次）；进房即报昵称 */
  function watchAndEnter(room: GameRoom) {
    room.send("setName", localStorage.getItem("pt-name") || "无名氏");
    let entered = false;
    const check = () => {
      // 状态补丁在对局中会以 15Hz 持续到达，onEnter 绝不能重复执行
      if (entered || room.state.phase !== "playing") return;
      entered = true;
      room.onStateChange.remove(check);
      onEnter(room);
    };
    room.onStateChange(check);
    check();
  }

  /** 等待画面：玩家列表；withStart 时显示房主"开始游戏"按钮；
   *  need 传入匹配目标人数，超过 10 秒未凑齐在状态栏给出指引 */
  function showWaiting(room: GameRoom, withStart: boolean, need = 0) {
    lobby.querySelectorAll("button, input, p").forEach(el => {
      if (el.id !== "lobby-status") (el as HTMLElement).style.display = "none";
    });
    const info = document.createElement("p");
    const startBtn = document.createElement("button");
    startBtn.textContent = "开始游戏";
    startBtn.onclick = () => room.send("start");
    if (withStart) lobby.appendChild(startBtn);
    lobby.appendChild(info);
    const startAt = Date.now();
    let hinted = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = () => {
      if (room.state.phase === "playing" && timer) {
        // 已开局：停止轮询并退订状态监听
        clearInterval(timer);
        room.onStateChange.remove(refresh);
      }
      const names: string[] = [];
      room.state.players.forEach(p => names.push(p.name));
      info.textContent = withStart
        ? `玩家：${names.join("、")}（${names.length}/4）—— 满员自动开局，房主可直接开始`
        : `已进入匹配队列（当前 ${names.length} 人）—— 满员自动开局，请稍候`;
      if (need > 0 && !hinted && names.length < need && Date.now() - startAt > 10_000) {
        hinted = true;
        say("还没凑齐人：再开一个窗口/标签页点同样的匹配，或先点【单机练习】");
      }
    };
    room.onStateChange(refresh);
    refresh();
    timer = setInterval(refresh, 1000); // 单人等待时状态不再变化，靠轮询驱动提示
  }

  // 单机练习入口（一个人也能立刻玩，放显眼位置）
  const localBtn = document.createElement("button");
  localBtn.textContent = "单机练习（无需等待）";
  localBtn.onclick = onLocal;
  lobby.appendChild(localBtn);

  // 匹配：进入队列后显示等待室；10 秒还没凑齐人给出明确指引
  let waitHint: ReturnType<typeof setTimeout> | undefined;
  const startQuick = (mode: 2 | 4) =>
    guard(async () => {
      say("匹配中…");
      clearTimeout(waitHint);
      waitHint = setTimeout(
        () => say("还没凑齐人：再开一个窗口/标签页点同样的匹配，或先点【单机练习】"),
        10_000,
      );
      const room = await quickMatch(mode);
      clearTimeout(waitHint);
      watchAndEnter(room);
      showWaiting(room, false, mode);
    });

  document.getElementById("btn-quick2")!.onclick = () => startQuick(2);
  document.getElementById("btn-quick4")!.onclick = () => startQuick(4);
  document.getElementById("btn-create")!.onclick = () =>
    guard(async () => {
      say("创建中…");
      const { room, code } = await createRoom();
      say(code ? `房间号 ${code} —— 发给朋友，满员自动开局` : "已创建房间");
      watchAndEnter(room);
      showWaiting(room, true);
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
