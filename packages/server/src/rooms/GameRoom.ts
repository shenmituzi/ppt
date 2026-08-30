import type { Client } from "colyseus";
import { GameSim, SUDDEN_DEATH_AT_MS, type DirInput } from "@pt/shared";
import { Room } from "../interop";
import { GameRoomState, PlayerState } from "../state/GameRoomState";
import { syncState, gridToString } from "../state/sync";
import { generateRoomCode, generateSeed } from "./code";

interface JoinOptions { mode?: number }

const DIR_INPUTS = new Set<string>(["up", "down", "left", "right", "none"]);

/**
 * 对战房间：waiting（等人）→ playing（对局）→ ended（结算）。
 * 服务器是权威：60Hz 跑 GameSim，15Hz 向客户端广播 Schema 增量。
 */
export class GameRoom extends Room<GameRoomState> {
  maxClients = 4;
  /** 进房顺序 = 颜色/出生点顺序；第一个是房主 */
  joinOrder: string[] = [];
  private sim: GameSim | undefined;

  onCreate(options: JoinOptions) {
    this.maxClients = options.mode === 2 ? 2 : 4;
    this.setState(new GameRoomState());
    this.setPatchRate(1000 / 15); // 约 15Hz 状态广播
    this.setSimulationInterval(dt => this.tick(dt), 1000 / 60);

    if (options.mode === undefined) {
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
    if (this.state.phase !== "waiting" || this.clients.length < 2) return;
    this.sim = new GameSim(generateSeed(), this.joinOrder);
    this.state.grid = gridToString(this.sim.grid);
    this.state.suddenDeathAt = SUDDEN_DEATH_AT_MS;
    this.state.phase = "playing";
    this.state.serverElapsedMs = 0;
    this.lock(); // 开局后不再接受匹配/加入
  }

  private tick(dtMs: number) {
    if (!this.sim || this.state.phase !== "playing") return;
    this.sim.step(Math.min(dtMs, 100));
    syncState(this.state, this.sim);
    // 一次性事件目前仅驱动结算（syncState 已兜底写 phase/winnerIds）；
    // 其余事件（音效广播等）留待后续扩展
    this.sim.drainEvents();
  }
}
