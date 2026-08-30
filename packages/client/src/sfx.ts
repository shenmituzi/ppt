type SfxName = "bomb" | "explode" | "pickup" | "die" | "win" | "lose" | "thunder";

let ctx: AudioContext | null = null;
function audio(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function beep(freq: number, dur: number, type: OscillatorType, gain = 0.15, slideTo?: number) {
  const a = audio();
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, a.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  osc.connect(g).connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + dur);
}

/** WebAudio 合成音效，无外部资源 */
export const sfx = {
  play(name: SfxName) {
    try {
      switch (name) {
        case "bomb": beep(300, 0.12, "square", 0.12, 180); break;
        case "explode": beep(80, 0.4, "sawtooth", 0.25, 40); break;
        case "pickup": beep(660, 0.09, "triangle", 0.18, 880); break;
        case "die": beep(400, 0.5, "square", 0.2, 60); break;
        case "win": beep(523, 0.15, "triangle"); setTimeout(() => beep(659, 0.3, "triangle"), 150); break;
        case "lose": beep(220, 0.4, "sawtooth", 0.2, 110); break;
        case "thunder":
          // 低频轰鸣 + 快速衰减，模拟雷声
          beep(60, 0.9, "sawtooth", 0.3, 30);
          setTimeout(() => beep(45, 0.7, "square", 0.18, 25), 120);
          break;
      }
    } catch {
      /* 音频不可用则静默 */
    }
  },
};
