// ============================================================
// MACHINA X DEUS — sequencer.js
// 4-track × 16-step drum sequencer with Web Audio API synthesis
// ============================================================

const TRACKS = 4;
const STEPS = 16;

// Default pattern — a basic groove to start
const DEFAULT_PATTERN = [
  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], // KK
  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], // SN
  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], // HH
  [0,0,0,1, 0,0,0,0, 0,0,0,1, 0,0,0,0], // PC
];

// State
let pattern = DEFAULT_PATTERN.map(r => [...r]);
let muted = [false, false, false, false];
let playing = false;
let currentStep = 0;
let bpm = 120;
let scheduleTimer = null;
let audioCtx = null;
let nextNoteTime = 0;
const LOOKAHEAD = 0.1;
const SCHEDULE_INTERVAL = 25;

// DOM refs
const grid = document.getElementById('seq-grid');
const playBtn = document.getElementById('play-btn');
const playIcon = document.getElementById('play-icon');
const bpmSlider = document.getElementById('bpm-slider');
const bpmValue = document.getElementById('bpm-value');
const clearBtn = document.getElementById('clear-btn');
const playhead = document.getElementById('playhead');
const nav = document.getElementById('nav');
const navLogo = document.getElementById('nav-logo');

// ── BUILD GRID ────────────────────────────────────────────────
function buildGrid() {
  grid.innerHTML = '';
  for (let t = 0; t < TRACKS; t++) {
    for (let s = 0; s < STEPS; s++) {
      const cell = document.createElement('div');
      cell.className = 'step' + (pattern[t][s] ? ' on' : '');
      cell.dataset.track = t;
      cell.dataset.step = s;
      cell.addEventListener('click', () => toggleStep(t, s, cell));
      grid.appendChild(cell);
    }
  }
}

function toggleStep(track, step, cell) {
  pattern[track][step] ^= 1;
  cell.classList.toggle('on', !!pattern[track][step]);
}

// ── AUDIO SYNTHESIS ───────────────────────────────────────────
function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playKick(time) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.45);
  gain.gain.setValueAtTime(1.0, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
  osc.start(time);
  osc.stop(time + 0.5);
}

function playSnare(time) {
  const ctx = getCtx();
  // Noise burst
  const bufLen = ctx.sampleRate * 0.18;
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const noiseGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2200;
  filter.Q.value = 0.7;
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noiseGain.gain.setValueAtTime(0.65, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
  noise.start(time);
  noise.stop(time + 0.18);

  // Tone body
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.frequency.setValueAtTime(180, time);
  oscGain.gain.setValueAtTime(0.5, time);
  oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
  osc.start(time);
  osc.stop(time + 0.12);
}

function playHihat(time) {
  const ctx = getCtx();
  const bufLen = ctx.sampleRate * 0.06;
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 8000;
  const gain = ctx.createGain();
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.4, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
  noise.start(time);
  noise.stop(time + 0.06);
}

function playPerc(time) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(340, time);
  osc.frequency.exponentialRampToValueAtTime(120, time + 0.08);
  gain.gain.setValueAtTime(0.6, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
  osc.start(time);
  osc.stop(time + 0.12);
}

const synths = [playKick, playSnare, playHihat, playPerc];

// ── SCHEDULER ────────────────────────────────────────────────
function stepDuration() {
  return (60 / bpm) / 4; // 16th notes
}

function scheduleStep(step, time) {
  for (let t = 0; t < TRACKS; t++) {
    if (pattern[t][step] && !muted[t]) {
      synths[t](time);
    }
  }
}

function scheduler() {
  while (nextNoteTime < getCtx().currentTime + LOOKAHEAD) {
    scheduleStep(currentStep, nextNoteTime);
    advancePlayhead(currentStep, nextNoteTime);
    currentStep = (currentStep + 1) % STEPS;
    nextNoteTime += stepDuration();
  }
  scheduleTimer = setTimeout(scheduler, SCHEDULE_INTERVAL);
}

// ── VISUAL PLAYHEAD ───────────────────────────────────────────
let displayStep = -1;

function advancePlayhead(step, time) {
  const delay = (time - getCtx().currentTime) * 1000;
  setTimeout(() => {
    updatePlayheadVisual(step);
  }, Math.max(0, delay));
}

function updatePlayheadVisual(step) {
  // Remove playing class from previous step column
  document.querySelectorAll('.step.playing').forEach(el => el.classList.remove('playing'));

  // Add playing to current column
  document.querySelectorAll(`.step[data-step="${step}"]`).forEach(el => {
    el.classList.add('playing');
  });

  // Move playhead line
  const stepWidth = grid.offsetWidth / STEPS;
  playhead.style.left = `${step * stepWidth}px`;
  playhead.style.width = `${stepWidth}px`;

  displayStep = step;
}

// ── PLAY / STOP ───────────────────────────────────────────────
function startSequencer() {
  const ctx = getCtx();
  if (ctx.state === 'suspended') ctx.resume();
  playing = true;
  currentStep = 0;
  nextNoteTime = ctx.currentTime;
  scheduler();
  playBtn.classList.add('playing');
  playIcon.textContent = '■';
  playhead.classList.add('visible');
}

function stopSequencer() {
  playing = false;
  clearTimeout(scheduleTimer);
  scheduleTimer = null;
  playBtn.classList.remove('playing');
  playIcon.textContent = '▶';
  playhead.classList.remove('visible');
  document.querySelectorAll('.step.playing').forEach(el => el.classList.remove('playing'));
}

// ── MUTE BUTTONS ─────────────────────────────────────────────
document.querySelectorAll('.mute-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const t = parseInt(btn.dataset.track);
    muted[t] = !muted[t];
    btn.classList.toggle('active', !muted[t]);
  });
});

// ── CONTROLS ─────────────────────────────────────────────────
playBtn.addEventListener('click', () => {
  if (playing) stopSequencer();
  else startSequencer();
});

bpmSlider.addEventListener('input', () => {
  bpm = parseInt(bpmSlider.value);
  bpmValue.textContent = bpm;
});

clearBtn.addEventListener('click', () => {
  pattern = Array.from({ length: TRACKS }, () => Array(STEPS).fill(0));
  document.querySelectorAll('.step.on').forEach(el => el.classList.remove('on'));
});

// ── NAV SCROLL EFFECT ─────────────────────────────────────────
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 40);
});

// ── SCRAMBLE TEXT ────────────────────────────────────────────
function scramble(el, duration = 600) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  if (!el.dataset.orig) el.dataset.orig = el.textContent;
  const orig = el.dataset.orig;
  let elapsed = 0;
  const interval = setInterval(() => {
    elapsed += 30;
    const p = Math.min(elapsed / duration, 1);
    el.textContent = orig.split('').map((c, i) =>
      c === ' ' ? ' ' : p > i / orig.length ? c : chars[Math.floor(Math.random() * chars.length)]
    ).join('');
    if (elapsed >= duration) {
      el.textContent = orig;
      clearInterval(interval);
    }
  }, 30);
}

navLogo.addEventListener('mouseenter', () => scramble(navLogo));

// ── INIT ──────────────────────────────────────────────────────
buildGrid();
