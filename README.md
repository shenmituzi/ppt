# 泡泡堂（多人在线小游戏）

经典炸弹人玩法：炸墙、捡道具、炸对手，最后存活者获胜。支持 2 人/4 人快速匹配与房间号邀请。

![玩法](docs/specs/2026-08-30-paopaotang-design.md)

## 本地运行

```bash
npm install
npm run dev      # 同时启动服务器(ws://localhost:2567)与客户端(http://localhost:5173)
```

打开 http://localhost:5173 —— 多开几个浏览器窗口即可联机对局（本机可模拟多人，局域网内其他设备直接访问 `http://<你的IP>:5173`）。

## 测试

```bash
npm test         # 规则引擎与状态同步单元测试
```

## 操作

- **电脑**：方向键 / WASD 移动，空格放泡泡
- **手机**：左下角虚拟摇杆拖动移动，右下角 💣 按钮放泡泡（触屏设备自动显示，支持多指同时操作）
- 道具：**泡** = 多放一个泡泡，**火** = 火焰加长，**速** = 移动加速
- 泡泡 2.5 秒后爆炸，会连锁引爆；自己被火焰碰到就出局
- 出生有 2 秒无敌；开局 3 分钟后进入**突然死亡**：硬墙从外圈向内合拢

## 架构

```
packages/
├─ shared   无头规则引擎 GameSim —— 单机模式跑在浏览器，联机模式跑在服务器，同一份代码
├─ server   Colyseus 权威服务器：60Hz 模拟 / 15Hz Schema 增量广播，断线 30 秒内可重连
└─ client   Vite + Canvas 2D：只发输入、渲染状态，玩家位置指数平滑插值
```

服务器是唯一裁判：泡泡爆炸、道具掉落、死亡与胜负全部在服务器计算，客户端只发送
"按了哪个方向 / 放泡泡"两种消息，天然防作弊。

## 设计文档

- 设计：`docs/specs/2026-08-30-paopaotang-design.md`
- 实施计划：`docs/plans/2026-08-30-paopaotang-mvp.md`

## 部署（后续）

服务器是独立 Node 进程：`npx tsx packages/server/src/index.ts`；
客户端 `npm run build -w packages/client`（需先在 client 里加 build 脚本）后任意静态托管；
`packages/client/src/net.ts` 里把 ws 地址换成服务器地址即可。
