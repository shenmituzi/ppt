const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 去掉易混淆的 I L O 0 1

export function generateRoomCode(): string {
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

export function generateSeed(): number {
  return (Math.random() * 2 ** 31) | 0;
}
