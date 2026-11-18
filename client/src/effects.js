import confetti from 'canvas-confetti';
import { storage } from './storage.js';

// All sound effects are synthesized with the Web Audio API, so no audio files are needed.
let ctx;
let muted = storage.isMuted();
const listeners = new Set();

function audio() {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Mobile browsers only allow audio after a user gesture.
if (typeof window !== 'undefined') {
  const unlock = () => {
    audio();
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
}

function tone(freq, { at = 0, dur = 0.15, type = 'sine', vol = 0.18, slideTo } = {}) {
  const ac = audio();
  const start = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

const effects = {
  pop: () => {
    tone(520, { dur: 0.08, type: 'triangle', slideTo: 900 });
    tone(1040, { at: 0.07, dur: 0.1, type: 'triangle', vol: 0.12 });
  },
  start: () => [392, 523, 659, 784].forEach((f, i) => tone(f, { at: i * 0.12, dur: 0.2, type: 'square', vol: 0.08 })),
  steal: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.18, type: 'triangle' }));
    tone(1568, { at: 0.3, dur: 0.35, type: 'sine', vol: 0.12 });
  },
  // The classic "wah wah wah wahhh".
  caught: () =>
    [
      [392, 370],
      [370, 349],
      [349, 330],
      [330, 262],
    ].forEach(([from, to], i) => tone(from, { at: i * 0.38, dur: i === 3 ? 0.9 : 0.34, type: 'sawtooth', vol: 0.1, slideTo: to })),
  win: () => {
    const notes = [523, 523, 523, 659, 784, 659, 784, 1047];
    const times = [0, 0.12, 0.24, 0.36, 0.6, 0.84, 0.96, 1.1];
    notes.forEach((f, i) => tone(f, { at: times[i], dur: i === 7 ? 0.8 : 0.2, type: 'square', vol: 0.08 }));
  },
  error: () => tone(200, { dur: 0.25, type: 'square', vol: 0.08, slideTo: 140 }),
};

export function play(name) {
  if (muted) return;
  try {
    effects[name]?.();
  } catch {
    // Audio unsupported: stay silent.
  }
}

export const isMuted = () => muted;
export function setMuted(value) {
  muted = value;
  storage.setMuted(value);
  listeners.forEach((fn) => fn(value));
}
export function onMuteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function vibrate(pattern) {
  navigator.vibrate?.(pattern);
}

export function celebrate({ big = false } = {}) {
  const colors = ['#FF5FA2', '#FFD23F', '#3DDC97', '#4CC9F0', '#B388FF'];
  confetti({ particleCount: big ? 180 : 90, spread: big ? 110 : 75, origin: { y: 0.6 }, colors });
  if (big) {
    const end = Date.now() + 2500;
    (function frame() {
      confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0 }, colors });
      confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }
}
