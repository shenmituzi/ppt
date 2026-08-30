import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";
import { ItemType, Weather } from "@pt/shared";

export class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("uint8") colorIndex = 0;
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("boolean") moving = false;
  @type("uint8") bombsMax = 1;
  @type("uint8") flameLen = 1;
  @type("uint8") speedLevel = 1;
  @type("boolean") alive = true;
  @type("boolean") invincible = false;
  @type("boolean") connected = true;
  /** 天气专属道具状态 */
  @type("boolean") bootsOn = false;
  @type("boolean") rodOn = false;
  @type("boolean") lanternOn = false;
}

export class BombState extends Schema {
  @type("string") id = "";
  @type("int8") gx = 0;
  @type("int8") gy = 0;
  @type("uint8") power = 1;
  /** 剩余引信毫秒，客户端做脉动动画 */
  @type("float32") fuse = 0;
  @type("string") ownerId = "";
}

export class FlameState extends Schema {
  @type("string") id = "";
  /** 扁平化 [gx,gy, gx,gy, ...] */
  @type(["int16"]) cells = new ArraySchema<number>();
  /** 剩余毫秒 */
  @type("float32") life = 0;
}

export class ItemState extends Schema {
  @type("string") id = "";
  @type("int8") gx = 0;
  @type("int8") gy = 0;
  @type("uint8") type = ItemType.Bomb;
}

export class MonsterState extends Schema {
  @type("string") id = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("uint8") hp = 1;
  @type("uint8") maxHp = 1;
  @type("uint8") level = 1;
  @type("string") state = "hunt";
}

export class HouseState extends Schema {
  @type("string") id = "";
  @type("int8") gx = 0;
  @type("int8") gy = 0;
  @type("uint8") hp = 1;
  @type("uint8") maxHp = 1;
  @type("boolean") destroyed = false;
}

export class GameRoomState extends Schema {
  @type("string") phase: string = "waiting";
  @type("string") gameType: string = "pvp";
  @type("string") weather: string = Weather.Sunny;
  /** 地图布局，每格一个字符 '0' Floor '1' HardWall '2' 木箱 '3' 水晶 '4' 石头 '5' 冰块；waiting 阶段为空串 */
  @type("string") grid = "";
  @type("uint32") serverElapsedMs = 0;
  @type("uint32") suddenDeathAt = 0;
  @type("uint32") gatherEndsAt = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: BombState }) bombs = new MapSchema<BombState>();
  @type({ map: FlameState }) flames = new MapSchema<FlameState>();
  @type({ map: ItemState }) items = new MapSchema<ItemState>();
  @type({ map: MonsterState }) monsters = new MapSchema<MonsterState>();
  @type({ map: HouseState }) houses = new MapSchema<HouseState>();
  @type(["string"]) winnerIds = new ArraySchema<string>();
}
