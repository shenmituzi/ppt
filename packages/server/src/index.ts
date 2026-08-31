import { Server } from "./interop";
import { GameRoom } from "./rooms/GameRoom";

const gameServer = new Server();
gameServer.define("game", GameRoom);

gameServer.listen(2567).then(() => {
  console.log("泡泡堂服务器已启动: ws://localhost:2567");
});
