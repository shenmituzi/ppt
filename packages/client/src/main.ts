import "../style.css";
import { GameSim, WEATHERS, WEATHER_LABEL, type WeatherType } from "@pt/shared";

// 开发期注册 SW 绕过顽固缓存；生产构建不注册（并清理旧的）
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
} else if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => {
    for (const r of rs) if (r.active && r.active.scriptURL.endsWith("/sw.js")) void r.unregister();
  });
}
import { makeInputHub } from "./input";
import { createTouchControls } from "./touch";
import { Renderer, type GhostView } from "./render/renderer";
import { simToFrame, OnlineFrameBuilder, type FrameData } from "./render/frame";
import type { Room } from "colyseus.js";
import { saveReconnect, tryReconnect } from "./net";
import { initLobby } from "./lobby";
import { sfx } from "./sfx";

function showScreen(id: string) {
  for (const el of document.querySelectorAll(".screen")) el.classList.add("hidden");
  document.getElementById(id)!.classList.remove("hidden");
}

const hub = makeInputHub();
createTouchControls(hub); // 触屏设备显示虚拟摇杆 + 炸弹按钮

/** 游戏画面公共循环：getFrame 每帧产出一个 FrameData（单机/在线共用） */
function runGameLoop(getFrame: (dtMs: number, nowMs: number) => FrameData, myId: string) {
  showScreen("screen-game");
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const hud = document.getElementById("hud")!;
  const overlay = document.getElementById("overlay")!;
  const renderer = new Renderer(canvas);
  const hudAlive = document.createElement("span");
  hudAlive.className = "pill";
  const hudTime = document.createElement("span");
  hudTime.className = "pill warn";
  const hudWx = document.createElement("span");
  hudWx.className = "pill";
  hud.replaceChildren(hudWx, hudAlive, hudTime);
  const ghosts = new Map<string, GhostView>();
  let last = performance.now();
  let prevAlive = new Set<string>(); // 上一帧仍存活的角色
  let prevBombs = 0, prevFlames = 0, prevItems = 0; // 差量音效基准

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

    // 差量音效（两种模式共用：放泡/爆炸/拾取/死亡）
    if (f.bombs.length > prevBombs) sfx.play("bomb");
    if (f.flames.length > prevFlames) sfx.play("explode");
    if (f.items.length < prevItems) sfx.play("pickup");
    if (aliveNow.size < prevAlive.size) sfx.play("die");
    prevBombs = f.bombs.length;
    prevFlames = f.flames.length;
    prevItems = f.items.length;

    // 雾天视野：以自己为中心的光圈参数
    const me = f.players.find(p => p.id === myId);
    const viewer = me && me.alive ? { x: me.x, y: me.y, lantern: !!me.lanternOn } : null;
    renderer.draw(f, now, [...ghosts.values()], viewer);

    // HUD（三枚信息胶囊：天气 / 存活 / 阶段信息）
    hudWx.textContent = WEATHER_LABEL[f.weather as WeatherType] ?? "☀️ 晴朗";
    hudAlive.textContent = `存活 ${f.players.filter(p => p.alive).length}`;
    if (f.phase === "gathering") {
      hudTime.textContent = `🎁 装备搜集 ${Math.max(0, Math.ceil((f.gatherEndsAt - f.elapsedMs) / 1000))}s`;
      hudTime.classList.remove("danger");
    } else if (f.gameType === "adventure") {
      hudTime.textContent = `👾 剩余怪物 ${f.monsters.length}`;
      hudTime.classList.remove("danger");
    } else if (f.elapsedMs >= f.suddenDeathAt) {
      hudTime.textContent = "⚠ 突然死亡！";
      hudTime.classList.add("danger");
    } else {
      hudTime.textContent = `⏱ 突然死亡 ${Math.ceil((f.suddenDeathAt - f.elapsedMs) / 1000)}s`;
      hudTime.classList.remove("danger");
    }

    // 结算
    if (f.phase === "ended" && overlay.classList.contains("hidden")) {
      const win = f.winnerIds.includes(myId);
      const adventureWin = f.gameType === "adventure" && f.winnerIds.length > 0;
      if (win || adventureWin) sfx.play("win");
      else sfx.play("lose");
      const cls = f.winnerIds.length ? (win || adventureWin ? "win" : "lose") : "draw";
      const title = f.gameType === "adventure"
        ? (f.winnerIds.length ? "🏆 击败所有怪物！" : "💀 全军覆没")
        : f.winnerIds.length
          ? (win ? "🏆 胜利！" : "💥 失败")
          : "🤝 平局";
      overlay.innerHTML = `<div class="result ${cls}">${title}</div><button onclick="location.reload()">返回大厅</button>`;
      overlay.classList.remove("hidden");
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

/** 单机练习：规则引擎跑在浏览器本地 */
function enterLocalGame(playerId = "me") {
  // ?weather=rain|snow|fog 可指定天气（调试/演示用），否则随机
  const param = new URLSearchParams(location.search).get("weather") as WeatherType | null;
  const weather: WeatherType =
    param && WEATHERS.includes(param) ? param : WEATHERS[(Math.random() * WEATHERS.length) | 0];
  const sim = new GameSim((Math.random() * 2 ** 31) | 0, [playerId], undefined, weather);
  hub.setHandlers({
    onDir: d => sim.setInput(playerId, d),
    onBomb: () => sim.placeBomb(playerId),
  });
  // 闪电事件 → 客户端特效
  const warns: { gx: number; gy: number; strikeAt: number }[] = [];
  const strikes: { gx: number; gy: number; at: number }[] = [];
  runGameLoop((dt, now) => {
    sim.step(dt);
    for (const ev of sim.drainEvents()) {
      if (ev.type === "lightningWarn") warns.push({ gx: ev.gx, gy: ev.gy, strikeAt: ev.strikeAt });
      else if (ev.type === "lightningStrike") {
        strikes.push({ gx: ev.gx, gy: ev.gy, at: now });
        sfx.play("thunder");
      }
    }
    // 清理过期特效
    for (let i = warns.length - 1; i >= 0; i--) if (sim.elapsedMs > warns[i].strikeAt + 500) warns.splice(i, 1);
    for (let i = strikes.length - 1; i >= 0; i--) if (now - strikes[i].at > 300) strikes.splice(i, 1);
    const f = simToFrame(sim);
    f.warnings = warns;
    f.strikes = strikes;
    return f;
  }, playerId);
}

/** 在线对战：规则引擎跑在服务器，客户端收发输入与状态 */
async function enterOnlineGame(room: Room<any>) {
  saveReconnect(room);
  if (new URLSearchParams(location.search).has("debug")) {
    (window as any).__room = room; // 调试：?debug=1 时暴露房间状态
  }
  room.send("setName", localStorage.getItem("pt-name") || "无名氏");
  hub.setHandlers({
    onDir: d => room.send("dir", { dir: d }),
    onBomb: () => room.send("bomb"),
  });
  const builder = new OnlineFrameBuilder(room);
  room.onMessage("wx-warn", w => builder.addWarn(w));
  room.onMessage("wx-strike", s => {
    builder.addStrike(s);
    sfx.play("thunder");
  });
  runGameLoop((dt, now) => builder.frame(dt, now), room.sessionId);
}

// 启动：有未完成的对局先重连（已结束的旧对局直接放弃），否则进大厅
function goLobby() {
  document.getElementById("screen-lobby")!.classList.remove("hidden");
  initLobby(enterOnlineGame, () => enterLocalGame());
}

tryReconnect().then(room => {
  if (!room) {
    goLobby();
    return;
  }
  if (room.state.phase === "ended") {
    room.leave(); // 旧对局早已结束，别把用户关在结算画面里
    goLobby();
    return;
  }
  enterOnlineGame(room);
});
