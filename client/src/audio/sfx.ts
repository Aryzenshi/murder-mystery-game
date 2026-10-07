/**
 * Tiny WebAudio sound bank. Every effect is synthesised at runtime — there is
 * no audio file, and certainly nothing copyrighted.
 */

type Ctx = AudioContext & { _mansion?: boolean };

let ctx: Ctx | null = null;
let enabled = true;

function audio(): Ctx | null {
  if (typeof window === 'undefined' || !enabled) return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor() as Ctx;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/**
 * Sound is created lazily: browsers only allow an AudioContext to start after a
 * real gesture, so we never touch it until the player clicks something.
 */
export function setSoundEnabled(next: boolean) {
  enabled = next;
  if (!next && ctx) void ctx.suspend();
}

/** Call from a real user gesture to warm the audio engine up. */
export function unlockAudio() {
  if (!enabled) return;
  const context = audio();
  if (context && context.state === 'suspended') void context.resume();
}

export function isSoundEnabled() {
  return enabled;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const pauseSfx = () => {
    if (ctx && ctx.state === 'running') void ctx.suspend();
  };
  const resumeSfx = () => {
    if (enabled && ctx && ctx.state === 'suspended' && !document.hidden) {
      void ctx.resume();
    }
  };
  
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseSfx();
    else resumeSfx();
  });
  window.addEventListener('blur', pauseSfx);
  window.addEventListener('focus', resumeSfx);
}

function noiseBuffer(seconds: number): AudioBuffer | null {
  const context = audio();
  if (!context) return null;
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function playNoise(
  duration: number,
  filterFreq: number,
  gain: number,
  type: BiquadFilterType = 'bandpass',
  q = 1,
) {
  if (!enabled) return;
  const context = audio();
  const buffer = noiseBuffer(duration);
  if (!context || !buffer) return;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  filter.Q.value = q;
  const gainNode = context.createGain();
  gainNode.gain.setValueAtTime(gain, context.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  source.connect(filter).connect(gainNode).connect(context.destination);
  source.start();
  source.stop(context.currentTime + duration);
}

function tone(
  freq: number,
  duration: number,
  gain = 0.08,
  type: OscillatorType = 'sine',
  delay = 0,
) {
  if (!enabled) return;
  const context = audio();
  if (!context) return;
  const osc = context.createOscillator();
  const gainNode = context.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const start = context.currentTime + delay;
  gainNode.gain.setValueAtTime(0.0001, start);
  gainNode.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gainNode).connect(context.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export const sfx = {
  click() {
    playNoise(0.045, 2400, 0.05, 'bandpass', 2);
  },
  dice() {
    playNoise(0.09, 1500, 0.09, 'bandpass', 1.2);
    setTimeout(() => playNoise(0.08, 1900, 0.07, 'bandpass', 1.4), 90);
    setTimeout(() => playNoise(0.07, 1200, 0.05, 'bandpass', 1.1), 180);
  },
  move() {
    tone(190, 0.11, 0.05, 'sine');
    playNoise(0.05, 700, 0.03, 'lowpass');
  },
  card() {
    playNoise(0.16, 3200, 0.045, 'highpass', 0.7);
  },
  reveal() {
    playNoise(0.13, 2600, 0.05, 'highpass', 0.6);
    tone(660, 0.18, 0.05, 'triangle', 0.04);
  },
  suggest() {
    tone(392, 0.16, 0.06, 'triangle');
    tone(523, 0.18, 0.05, 'triangle', 0.1);
  },
  accuse() {
    tone(196, 0.3, 0.07, 'sawtooth');
    tone(233, 0.28, 0.05, 'triangle', 0.06);
  },
  wrong() {
    tone(180, 0.34, 0.07, 'sawtooth');
    tone(140, 0.4, 0.06, 'sawtooth', 0.12);
  },
  victory() {
    [392, 523, 659, 784].forEach((freq, i) => tone(freq, 0.5, 0.07, 'triangle', i * 0.13));
  },
  defeat() {
    [392, 330, 262].forEach((freq, i) => tone(freq, 0.5, 0.06, 'sine', i * 0.16));
  },
  join() {
    tone(523, 0.14, 0.05, 'triangle');
    tone(784, 0.18, 0.045, 'triangle', 0.09);
  },
};
