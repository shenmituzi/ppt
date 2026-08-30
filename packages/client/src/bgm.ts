/**
 * 治愈系背景音乐：WebAudio 现场生成的八音盒风格轻音乐。
 * 五声音阶随机缓缓琶音 + 低音铺底，无需任何音频文件。
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let loopTimer: number | null = null;
let step = 0;

const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]; // C5 D5 E5 G5 A5 C6
const BASS = [130.81, 98.0, 110.0, 98.0]; // C3 G2 A2 G2 循环

function audio(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;
    master.connect(lp).connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function note(freq: number, dur: number, vol: number, type: OscillatorType = "sine") {
  const a = audio();
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime);
  g.gain.linearRampToValueAtTime(vol, a.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  osc.connect(g).connect(master!);
  osc.start();
  osc.stop(a.currentTime + dur + 0.05);
}

function musicStep() {
  // 旋律：随机五声音阶音符（八音盒质感）
  const pick = SCALE[Math.floor(Math.random() * SCALE.length)];
  note(pick, 2.2, 0.10, "sine");
  if (Math.random() < 0.4) {
    const second = SCALE[Math.floor(Math.random() * SCALE.length)];
    setTimeout(() => note(second, 1.8, 0.06, "triangle"), 300);
  }
  // 低音：每 4 步一次
  if (step % 4 === 0) note(BASS[Math.floor(step / 4) % BASS.length], 3.6, 0.07, "sine");
  step++;
}

export const bgm = {
  start() {
    if (loopTimer) return;
    audio();
    musicStep();
    loopTimer = window.setInterval(musicStep, 620);
  },
  stop() {
    if (loopTimer) {
      clearInterval(loopTimer);
      loopTimer = null;
    }
  },
  get running() {
    return loopTimer !== null;
  },
};
