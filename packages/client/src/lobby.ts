import type { Room } from "colyseus.js";
import { quickMatch, createRoom, joinByCode, adventureMatch } from "./net";
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

  /** 监听房间开局（playing 或冒险的 gathering）→ 进入游戏画面；进房即报昵称 */
  function watchAndEnter(room: GameRoom) {
    room.send("setName", localStorage.getItem("pt-name") || "无名氏");
    let entered = false;
    const check = () => {
      // 状态补丁在对局中会持续到达，onEnter 绝不能重复执行
      // 必须等 grid 非空才进入游戏画面（防止 Schema 分批同步导致 phase 先到但 grid 仍为空）
      if (entered || room.state.phase === "waiting" || !room.state.grid) return;
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
    const card = document.getElementById("lobby-card")!;
    card.querySelectorAll("button, input, p, .divider").forEach(el => {
      if (el.id !== "lobby-status") (el as HTMLElement).style.display = "none";
    });
    const info = document.createElement("p");
    const startBtn = document.createElement("button");
    startBtn.className = "btn primary";
    startBtn.textContent = "开始游戏";
    startBtn.onclick = () => room.send("start");
    if (withStart) card.appendChild(startBtn);
    card.appendChild(info);
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
        ? `玩家：${names.join("、")}（${names.length}/${need || 2}）—— 满员自动开局，房主可直接开始`
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

  // 单机练习入口（index.html 中的 btn-local）
  document.getElementById("btn-local")!.onclick = onLocal;

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
  document.getElementById("btn-adventure")!.onclick = () =>
    guard(async () => {
      say("冒险匹配中…（凑不齐 5 人会由人机补位，6 秒后自动开局）");
      const room = await adventureMatch();
      watchAndEnter(room);
      // 冒险模式：显示等待提示，6 秒后自动开局（人机补位）
      const card = document.getElementById("lobby-card")!;
      card.querySelectorAll("button, input, p, .divider").forEach(el => {
        if (el.id !== "lobby-status") (el as HTMLElement).style.display = "none";
      });
      const info = document.createElement("p");
      info.textContent = "🎮 冒险模式准备中…6 秒后自动开局（空位由机器人补位）";
      card.appendChild(info);
      let countdown = 6;
      const timer = setInterval(() => {
        countdown--;
        if (countdown <= 0 || room.state.phase !== "waiting") {
          clearInterval(timer);
          if (room.state.phase !== "waiting") info.textContent = "⚔️ 对局开始！";
        } else {
          info.textContent = `🎮 冒险模式准备中…${countdown} 秒后自动开局`;
        }
      }, 1000);
      room.onStateChange(() => {
        if (room.state.phase !== "waiting") {
          clearInterval(timer);
          info.textContent = "⚔️ 对局开始！";
        }
      });
    });
  const create = (mode: 2 | 4) =>
    guard(async () => {
      say("创建中…");
      const { room, code } = await createRoom(mode);
      say(code ? `房间号 ${code} —— ${mode}人房间，满员自动开局` : "已创建房间");
      watchAndEnter(room);
      showWaiting(room, true, mode);
    });
  document.getElementById("btn-create")!.onclick = () => create(2);
  document.getElementById("btn-create4")!.onclick = () => create(4);
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
