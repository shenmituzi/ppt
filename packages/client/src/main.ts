import { GameSim } from "@pt/shared";
import { makeInputHub } from "./input";
import { Renderer, type GhostView } from "./render/renderer";
import { simToFrame, OnlineFrameBuilder, type FrameData } from "./render/frame";
import type { Room } from "colyseus.js";
import { saveReconnect, tryReconnect } from "./net";
import { initLobby } from "./lobby";

function showScreen(id: string) {
  for (const el of document.querySelectorAll(".screen")) el.classList.add("hidden");
  document.getElementById(id)!.classList.remove("hidden");
}

const hub = makeInputHub();

/** 游戏画面公共循环：getFrame 每帧产出一个 FrameData（单机/在线共用） */
function runGameLoop(getFrame: (dtMs: number, nowMs: number) => FrameData, myId: string) {
  showScreen("screen-game");
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const hud = document.getElementById("hud")!;
  const overlay = document.getElementById("overlay")!;
  const renderer = new Renderer(canvas);
  const ghosts = new Map<string, GhostView>();
  let last = performance.now();
  let prevAlive = new Set<string>(); // 上一帧仍存活的角色

  function loop(now: number) {
    const dt = Math.min(50, now - last);
    last = now;
    const f = getFrame(dt, now);

    // 死亡瞬间 → 生成幽灵（上一帧活着、这一帧死了）
    const aliveNow = new Set(f.players.filter(p => p.alive).map(p => p.id));
    for (const p of f.players) {
      if (prevAlive.has(p.id) && !aliveNow.has(p.id) && !ghosts.has(p.id)) {
        ghosts.set(p.id, { x: p.x, y: p.y, colorIndex: p.colorIndex, diedAtMs: now });
      }
    }
    prevAlive = aliveNow;

    renderer.draw(f, now, [...ghosts.values()]);

    // HUD
    const remain = Math.max(0, Math.ceil((f.suddenDeathAt - f.elapsedMs) / 1000));
    hud.textContent = f.elapsedMs >= f.suddenDeathAt
      ? "⚠ 突然死亡！"
      : `存活 ${f.players.filter(p => p.alive).length} · 突然死亡倒计时 ${remain}s`;

    // 结算
    if (f.phase === "ended" && overlay.classList.contains("hidden")) {
      const win = f.winnerIds.includes(myId);
      overlay.innerHTML = f.winnerIds.length
        ? `<div>${win ? "🏆 胜利！" : "💥 失败"}</div><button onclick="location.reload()">返回大厅</button>`
        : `<div>🤝 平局</div><button onclick="location.reload()">返回大厅</button>`;
      overlay.classList.remove("hidden");
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

/** 单机练习：规则引擎跑在浏览器本地 */
function enterLocalGame(playerId = "me") {
  const sim = new GameSim((Math.random() * 2 ** 31) | 0, [playerId]);
  hub.setHandlers({
    onDir: d => sim.setInput(playerId, d),
    onBomb: () => sim.placeBomb(playerId),
  });
  runGameLoop(() => simToFrame(sim), playerId);
}

/** 在线对战：规则引擎跑在服务器，客户端收发输入与状态 */
async function enterOnlineGame(room: Room<any>) {
  saveReconnect(room);
  room.send("setName", localStorage.getItem("pt-name") || "无名氏");
  hub.setHandlers({
    onDir: d => room.send("dir", { dir: d }),
    onBomb: () => room.send("bomb"),
  });
  const builder = new OnlineFrameBuilder(room);
  runGameLoop((dt, now) => builder.frame(dt, now), room.sessionId);
}

// 启动：有未完成的对局先重连，否则进大厅
tryReconnect().then(room => {
  if (room) {
    enterOnlineGame(room);
  } else {
    document.getElementById("screen-lobby")!.classList.remove("hidden");
    initLobby(enterOnlineGame, () => enterLocalGame());
  }
});
