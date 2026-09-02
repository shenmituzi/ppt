import type { Client } from "colyseus";
import {
  GameSim, SUDDEN_DEATH_AT_MS, WEATHERS, pickAdventureWeather,
  type DirInput, type WeatherType, type GameType,
} from "@pt/shared";
import { Room } from "../interop";
import { BotBrain } from "../bots";
import { GameRoomState, PlayerState } from "../state/GameRoomState";
import { syncState, gridToString } from "../state/sync";
import { generateRoomCode, generateSeed } from "./code";

interface JoinOptions { mode?: number; gameType?: string; create?: boolean }

const DIR_INPUTS = new Set<string>(["up", "down", "left", "right", "none"]);

/**
 * 对战房间：waiting（等人）→ gathering（冒险搜集期，仅冒险模式）→ playing（对局）→ ended（结算）。
 * 服务器是权威：60Hz 跑 GameSim，15Hz 向客户端广播 Schema 增量。
 * gameType = pvp（经典对战）/ adventure（冒险模式，人机补位）。
 */
export class GameRoom extends Room<GameRoomState> {
  maxClients = 4;
  gameType: GameType = "pvp";
  /** 进房顺序 = 颜色/出生点顺序；第一个是房主 */
  joinOrder: string[] = [];
  private sim: GameSim | undefined;
  private bots: BotBrain[] = [];
  private startScheduled = false;

  onCreate(options: JoinOptions) {
    this.gameType = options.gameType === "adventure" ? "adventure" : "pvp";
    this.maxClients = this.gameType === "adventure"
      ? 5
      : options.mode === 2 ? 2 : 4;
    this.setState(new GameRoomState());
    this.setPatchRate(1000 / 15); // 约 15Hz 状态广播
    this.setSimulationInterval(dt => this.tick(dt), 1000 / 60);

    if (options.create === true && options.gameType !== "adventure") {
      // 玩家创建的房间：生成 4 位房间号；房主可询问（客户端拿不到自己的 metadata）
      const code = generateRoomCode();
      this.setMetadata({ code, mode: this.maxClients });
      this.onMessage("code", client => {
        if (this.clients[0] === client) client.send("code", code);
      });
    }

    this.onMessage("setName", (client, name: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const s = String(name ?? "").trim().slice(0, 12);
      p.name = s || `玩家${p.colorIndex + 1}`;
    });
    this.onMessage("start", client => {
      if (this.state.phase === "waiting" && this.joinOrder[0] === client.sessionId) {
        this.startGame();
      }
    });
    this.onMessage("dir", (client, data: { dir?: string }) => {
      const dir = data?.dir;
      if (this.sim && typeof dir === "string" && DIR_INPUTS.has(dir)) {
        this.sim.setInput(client.sessionId, dir as DirInput);
      }
    });
    this.onMessage("bomb", client => {
      this.sim?.placeBomb(client.sessionId);
    });
    this.onMessage("attack", client => {
      this.sim?.attack(client.sessionId);
    });
    this.onMessage("buy", (client, data: { itemId?: string }) => {
      if (!this.sim || !data?.itemId) return;
      const res = this.sim.buy(client.sessionId, data.itemId);
      client.send("buyResult", { itemId: data.itemId, ...res });
    });
  }

  onJoin(client: Client) {
    if (this.state.phase !== "waiting") {
      throw new Error("对局已开始，无法加入");
    }
    const p = new PlayerState();
    p.id = client.sessionId;
    p.colorIndex = this.joinOrder.length;
    p.name = `玩家${p.colorIndex + 1}`;
    this.joinOrder.push(client.sessionId);
    this.state.players.set(client.sessionId, p);
    if (this.clients.length >= this.maxClients) {
      this.startGame(); // 满员自动开局（快速匹配的核心路径）
    } else if (this.gameType === "adventure" && this.clients.length === 1 && !this.startScheduled) {
      // 冒险模式：第一个人进房后 6 秒自动开局，空位由人机补位
      this.startScheduled = true;
      this.clock.setTimeout(() => {
        if (this.state.phase === "waiting") this.startGame();
      }, 6_000);
    }
  }

  async onLeave(client: Client, consented: boolean) {
    const p = this.state.players.get(client.sessionId);
    if (this.state.phase === "waiting") {
      this.state.players.delete(client.sessionId);
      this.joinOrder = [...this.state.players.keys()];
      [...this.state.players.values()].forEach((pl, i) => (pl.colorIndex = i));
      return;
    }
    if (!p || !p.alive) return;
    if (consented) {
      // 主动退出：直接判负
      this.sim?.forfeit(client.sessionId);
      return;
    }
    // 意外断线：保留席位 30 秒等重连（Task 15 在客户端接入）
    p.connected = false;
    try {
      await this.allowReconnection(client, 30_000);
      p.connected = true;
    } catch {
      this.sim?.forfeit(client.sessionId); // 超时判负
    }
  }

  startGame() {
    if (this.state.phase !== "waiting") return;
    // 经典对战必须 >=2 名真人；冒险模式不足 5 人由人机补位
    if (this.gameType === "pvp" && this.clients.length < 2) return;
    // 冒险模式天气概率不同（迷雾很稀有）
    const weather: WeatherType = this.gameType === "adventure"
      ? pickAdventureWeather(Math.random)
      : WEATHERS[(Math.random() * WEATHERS.length) | 0];
    if (this.gameType === "adventure") {
      const missing = this.maxClients - this.joinOrder.length;
      for (let i = 0; i < missing; i++) {
        const botId = `bot-${i + 1}`;
        const bp = new PlayerState();
        bp.id = botId;
        bp.colorIndex = this.joinOrder.length;
        bp.name = `机器人${i + 1}`;
        bp.connected = true;
        this.joinOrder.push(botId);
        this.state.players.set(botId, bp);
      }
      this.bots = [];
    }
    this.sim = new GameSim(
      generateSeed(),
      this.joinOrder,
      undefined,
      weather,
      { gameType: this.gameType },
    );
    // 给每个人机挂上 AI 大脑
    if (this.gameType === "adventure") {
      this.bots = this.joinOrder
        .filter(id => id.startsWith("bot-"))
        .map(id => new BotBrain(this.sim!, id));
    }
    this.state.grid = gridToString(this.sim.grid);
    this.state.weather = weather;
    this.state.gameType = this.gameType;
    this.state.gatherEndsAt = this.gameType === "adventure" ? 120_000 : 0;
    this.state.suddenDeathAt = SUDDEN_DEATH_AT_MS;
    this.state.phase = this.gameType === "adventure" ? "gathering" : "playing";
    this.state.serverElapsedMs = 0;
    this.lock(); // 开局后不再接受匹配/加入
  }

  private tick(dtMs: number) {
    if (!this.sim || (this.state.phase !== "playing" && this.state.phase !== "gathering")) return;
    for (const bot of this.bots) bot.tick(this.sim.elapsedMs); // 人机先决策
    this.sim.step(Math.min(dtMs, 100));
    syncState(this.state, this.sim);
    for (const ev of this.sim.drainEvents()) {
      // 闪电事件广播给客户端做警示圈与落雷特效
      if (ev.type === "lightningWarn") {
        this.broadcast("wx-warn", { gx: ev.gx, gy: ev.gy, strikeAt: ev.strikeAt });
      } else if (ev.type === "lightningStrike") {
        this.broadcast("wx-strike", { gx: ev.gx, gy: ev.gy });
      } else if (ev.type === "laser") {
        this.broadcast("laser", { cells: ev.cells.flatMap(c => [c.gx, c.gy]) });
      }
    }
  }
}
