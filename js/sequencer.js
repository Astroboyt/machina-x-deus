// ============================================================
// MACHINA X DEUS — sequencer.js
// 4-track × 16-step drum sequencer with Web Audio API synthesis
// ============================================================

const TRACKS = 4;
const STEPS  = 16;

const DEFAULT_PATTERN = [
  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], // KK
  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], // SN
  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], // HH
  [0,0,0,1, 0,0,0,0, 0,0,0,1, 0,0,0,0], // PC
];

let pattern      = DEFAULT_PATTERN.map(r => [...r]);
let muted        = [false, false, false, false];
let playing      = false;
let currentStep  = 0;
let bpm          = 120;
let scheduleTimer= null;
let audioCtx     = null;
let nextNoteTime = 0;

const LOOKAHEAD         = 0.1;   // seconds
const SCHEDULE_INTERVAL = 25;    // ms

// ── DOM ───────────────────────────────────────────────────────
const grid      = document.getElementById('seq-grid');
const seqEl     = document.getElementById('sequencer');
const playBtn   = document.getElementById('play-btn');
const playIcon  = document.getElementById('play-icon');
const bpmSlider = document.getElementById('bpm-slider');
const bpmVal    = document.getElementById('bpm-value');
const clearBtn  = document.getElementById('clear-btn');
const playhead  = document.getElementById('playhead');
const nav       = document.getElementById('nav');
const navLogo   = document.getElementById('nav-logo');

// ── BUILD GRID ────────────────────────────────────────────────
function buildGrid() {
  grid.innerHTML = '';
  for (let t = 0; t < TRACKS; t++) {
    for (let s = 0; s < STEPS; s++) {
      const cell = document.createElement('div');
      cell.className = 'step' + (pattern[t][s] ? ' on' : '');
      cell.dataset.track = t;
      cell.dataset.step  = s;
      cell.addEventListener('click', () => {
        pattern[t][s] ^= 1;
        cell.classList.toggle('on', !!pattern[t][s]);
      });
      grid.appendChild(cell);
    }
  }
}

// ── AUDIO CTX ─────────────────────────────────────────────────
function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// ── SYNTH VOICES ──────────────────────────────────────────────
function playKick(t) {
  const c = ctx();
  const osc = c.createOscillator(), gain = c.createGain();
  osc.connect(gain); gain.connect(c.destination);
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.45);
  gain.gain.setValueAtTime(1.0, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc.start(t); osc.stop(t + 0.5);
}

function playSnare(t) {
  const c = ctx();
  const buf = c.createBuffer(1, c.sampleRate * 0.18, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const flt = c.createBiquadFilter();
  flt.type = 'bandpass'; flt.frequency.value = 2200; flt.Q.value = 0.7;
  const ng = c.createGain();
  noise.connect(flt); flt.connect(ng); ng.connect(c.destination);
  ng.gain.setValueAtTime(0.65, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  noise.start(t); noise.stop(t + 0.18);

  const osc = c.createOscillator(), og = c.createGain();
  osc.connect(og); og.connect(c.destination);
  osc.frequency.setValueAtTime(180, t);
  og.gain.setValueAtTime(0.5, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.start(t); osc.stop(t + 0.12);
}

function playHihat(t) {
  const c = ctx();
  const buf = c.createBuffer(1, c.sampleRate * 0.06, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const flt = c.createBiquadFilter();
  flt.type = 'highpass'; flt.frequency.value = 8000;
  const gain = c.createGain();
  noise.connect(flt); flt.connect(gain); gain.connect(c.destination);
  gain.gain.setValueAtTime(0.4, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  noise.start(t); noise.stop(t + 0.06);
}

function playPerc(t) {
  const c = ctx();
  const osc = c.createOscillator(), gain = c.createGain();
  osc.type = 'sine';
  osc.connect(gain); gain.connect(c.destination);
  osc.frequency.setValueAtTime(340, t);
  osc.frequency.exponentialRampToValueAtTime(120, t + 0.08);
  gain.gain.setValueAtTime(0.6, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  osc.start(t); osc.stop(t + 0.12);
}

const synths = [playKick, playSnare, playHihat, playPerc];

// ── SCHEDULER ─────────────────────────────────────────────────
function stepDuration() { return (60 / bpm) / 4; }

function scheduler() {
  while (nextNoteTime < ctx().currentTime + LOOKAHEAD) {
    for (let t = 0; t < TRACKS; t++) {
      if (pattern[t][currentStep] && !muted[t]) synths[t](nextNoteTime);
    }
    scheduleVisual(currentStep, nextNoteTime);
    currentStep = (currentStep + 1) % STEPS;
    nextNoteTime += stepDuration();
  }
  scheduleTimer = setTimeout(scheduler, SCHEDULE_INTERVAL);
}

// ── VISUAL PLAYHEAD ───────────────────────────────────────────
function scheduleVisual(step, time) {
  const delay = (time - ctx().currentTime) * 1000;
  setTimeout(() => paintStep(step), Math.max(0, delay));
}

function paintStep(step) {
  document.querySelectorAll('.step.playing').forEach(el => el.classList.remove('playing'));
  document.querySelectorAll(`.step[data-step="${step}"]`).forEach(el => el.classList.add('playing'));

  // offset playhead by the track-labels column width
  const gridLeft = grid.getBoundingClientRect().left - seqEl.getBoundingClientRect().left;
  const stepW    = grid.offsetWidth / STEPS;
  playhead.style.left  = `${gridLeft + step * stepW}px`;
  playhead.style.width = `${stepW}px`;
}

// ── PLAY / STOP ───────────────────────────────────────────────
function start() {
  const c = ctx();
  if (c.state === 'suspended') c.resume();
  playing = true;
  currentStep  = 0;
  nextNoteTime = c.currentTime;
  scheduler();
  playBtn.classList.add('playing');
  playIcon.textContent = '■';
  playhead.classList.add('visible');
}

function stop() {
  playing = false;
  clearTimeout(scheduleTimer);
  scheduleTimer = null;
  playBtn.classList.remove('playing');
  playIcon.textContent = '▶';
  playhead.classList.remove('visible');
  document.querySelectorAll('.step.playing').forEach(el => el.classList.remove('playing'));
}

// ── EVENT LISTENERS ───────────────────────────────────────────
playBtn.addEventListener('click', () => playing ? stop() : start());

bpmSlider.addEventListener('input', () => {
  bpm = parseInt(bpmSlider.value);
  bpmVal.textContent = bpm;
});

clearBtn.addEventListener('click', () => {
  pattern = Array.from({ length: TRACKS }, () => Array(STEPS).fill(0));
  document.querySelectorAll('.step.on').forEach(el => el.classList.remove('on'));
});

document.querySelectorAll('.mute-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const t = parseInt(btn.dataset.track);
    muted[t] = !muted[t];
    btn.classList.toggle('active', !muted[t]);
  });
});


// ── SCRAMBLE ──────────────────────────────────────────────────
function scramble(el, ms = 600) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  if (!el.dataset.orig) el.dataset.orig = el.textContent;
  const orig = el.dataset.orig;
  let elapsed = 0;
  const id = setInterval(() => {
    elapsed += 30;
    const p = Math.min(elapsed / ms, 1);
    el.textContent = orig.split('').map((c, i) =>
      c === ' ' ? ' ' : p > i / orig.length ? c : chars[Math.floor(Math.random() * chars.length)]
    ).join('');
    if (elapsed >= ms) { el.textContent = orig; clearInterval(id); }
  }, 30);
}

navLogo.addEventListener('mouseenter', () => scramble(navLogo));

// ── INIT ──────────────────────────────────────────────────────
buildGrid();
