// ============================================================
// MACHINA X DEUS — app.js
// State-based selector, interactive faders/knobs, dynamic phase-plot circular scope
// ============================================================

import { gsap } from 'gsap';

// ── SCRAMBLE TEXT ────────────────────────────────────────────
const scrambleState = new WeakMap();

function scrambleText(el, duration = 750) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  // Store true original on first call; never overwrite with scrambled text
  if (!el.dataset.scrambleOriginal) {
    el.dataset.scrambleOriginal = el.textContent;
  }
  const original = el.dataset.scrambleOriginal;

  // Cancel any in-flight animation
  const prev = scrambleState.get(el);
  if (prev) clearInterval(prev);

  const frameMs = 30;
  let elapsed = 0;

  const id = setInterval(() => {
    elapsed += frameMs;
    const progress = Math.min(elapsed / duration, 1);
    el.textContent = original.split('').map((char, i) => {
      if (char === ' ') return ' ';
      return progress > i / original.length
        ? char
        : chars[Math.floor(Math.random() * chars.length)];
    }).join('');
    if (elapsed >= duration) {
      el.textContent = original;
      clearInterval(id);
      scrambleState.delete(el);
    }
  }, frameMs);

  scrambleState.set(el, id);
}

// ── STATE MANAGEMENT ────────────────────────────────────────
let activeModule = 'butterfly'; // 'butterfly', 'chua', 'double'

const moduleConfig = {
  butterfly: {
    displayName: 'BUTTERFLY3000',
    color: '#00f0ff', // Luminous Cyan
    colorRgb: '0, 240, 255'
  },
  chua: {
    displayName: 'CHUA CHUA',
    color: '#ff2e4c', // Luminous Crimson
    colorRgb: '255, 46, 76'
  },
  double: {
    displayName: 'DOUBLE SCROLL',
    color: '#ffa000', // Luminous Amber
    colorRgb: '255, 160, 0'
  }
};

// Rates driven by interactive sliders
let simulationRate = 1.0; 
let simulationZoom = 1.0;

// ── INTERACTIVE FADERS & KNOBS ────────────────────────────────
function initHardwareControls() {
  // Knobs: hovering rotates cap, clicking/dragging pivots pointer
  document.querySelectorAll('.eurorack-knob').forEach(knob => {
    const cap = knob.querySelector('.knob-cap');
    
    knob.addEventListener('mouseenter', () => {
      gsap.to(cap, { rotation: '+=30', duration: 0.3, ease: 'power2.out' });
    });
    knob.addEventListener('mouseleave', () => {
      gsap.to(cap, { rotation: 0, duration: 0.4, ease: 'power1.out' });
    });
    
    let isDragging = false;
    let startY = 0;
    let rotation = 0;
    
    knob.addEventListener('mousedown', (e) => {
      isDragging = true;
      startY = e.clientY;
      rotation = gsap.getProperty(cap, 'rotation') || 0;
      document.body.style.cursor = 'ns-resize';
      e.preventDefault();
    });
    
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaY = startY - e.clientY;
      const newRotation = Math.max(-135, Math.min(135, rotation + deltaY * 1.6));
      gsap.set(cap, { rotation: newRotation });
    });
    
    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = 'default';
      }
    });
  });

  // Faders: vertical dragging updates simulation parameters!
  document.querySelectorAll('.fader-container').forEach((fader, index) => {
    const track = fader.querySelector('.fader-track');
    const handle = fader.querySelector('.fader-handle');
    
    let isDragging = false;
    let startY = 0;
    let startTop = 0;
    
    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startY = e.clientY;
      startTop = parseFloat(window.getComputedStyle(handle).top) || 31; // centered is 31px
      document.body.style.cursor = 'ns-resize';
      e.preventDefault();
    });
    
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaY = e.clientY - startY;
      // Track height is 74px, handle height is 12px. Bounds: 0px to 62px.
      const newTop = Math.max(0, Math.min(62, startTop + deltaY));
      handle.style.top = `${newTop}px`;
      
      // Calculate normalized value (0.0 to 1.0)
      const normalizedValue = 1.0 - (newTop / 62);
      
      if (index === 0) {
        // Left fader (EVERS) controls Simulation Speed Rate (0.2 to 2.5)
        simulationRate = 0.2 + normalizedValue * 2.3;
      } else {
        // Right fader (DENSITY) controls Scope Zoom Level (0.5 to 1.8)
        simulationZoom = 0.5 + normalizedValue * 1.3;
      }
    });
    
    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = 'default';
      }
    });
  });
}

// ── STATE ACTION TRIGGERS ────────────────────────────────────
function initSelectorList() {
  const displayLabel = document.getElementById('module-display-name');
  
  document.querySelectorAll('.selector-item').forEach(item => {
    item.addEventListener('click', () => {
      const moduleType = item.getAttribute('data-module');
      if (moduleType === activeModule) return;
      
      // Update UI active styles
      document.querySelectorAll('.selector-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      activeModule = moduleType;
      scrambleText(item.querySelector('.selector-title'));
      const config = moduleConfig[activeModule];
      
      // Smooth display text transition
      gsap.to(displayLabel, {
        opacity: 0,
        y: -10,
        duration: 0.15,
        onComplete: () => {
          displayLabel.textContent = config.displayName;
          displayLabel.style.color = config.color;
          gsap.to(displayLabel, { opacity: 1, y: 0, duration: 0.2 });
        }
      });
    });
  });
}

// ── BOTTOM DRAWERS OVERLAY MECHANICS ──────────────────────────
function initDrawers() {
  document.querySelectorAll('.footer-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const drawerId = `drawer-${btn.getAttribute('data-drawer')}`;
      const targetDrawer = document.getElementById(drawerId);
      
      if (targetDrawer) {
        // Close other drawers first
        document.querySelectorAll('.drawer').forEach(d => {
          if (d !== targetDrawer) d.classList.remove('open');
        });
        targetDrawer.classList.toggle('open');
      }
    });
  });

  document.querySelectorAll('.drawer-close').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
      closeBtn.closest('.drawer').classList.remove('open');
    });
  });

  // Close drawers if clicking outside on body main
  window.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.drawer') && !e.target.closest('.footer-btn')) {
      document.querySelectorAll('.drawer').forEach(d => d.classList.remove('open'));
    }
  });
}

// ── DYNAMIC CIRCULAR SCOPE SIMULATION ─────────────────────────
function initScopeCanvas() {
  const canvas = document.getElementById('circular-scope-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  // Set high resolution canvas dimensions
  const dpr = window.devicePixelRatio || 1;
  const w = 160;
  const h = 160;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  
  // Chaotic attractors state variables
  let lX = 0.1, lY = 0.0, lZ = 0.0; // Lorenz coordinates
  let cX = 0.1, cY = 0.0, cZ = 0.0; // Chua coordinates
  let tX = 0.1, tY = 0.1, tZ = 0.1; // Thomas coordinates
  
  // Historical trace trail coordinate queues
  const butterflyTrail = [];
  const chuaTrail = [];
  const doubleTrail = [];
  const maxPoints = 260;

  // Non-linear function for Chua's diode
  function chuaF(v) {
    const m0 = -1.143;
    const m1 = -0.714;
    return m1 * v + 0.5 * (m0 - m1) * (Math.abs(v + 1) - Math.abs(v - 1));
  }

  function renderLoop() {
    ctx.fillStyle = '#0c0d0c';
    ctx.fillRect(0, 0, w, h);
    
    // Draw oscilloscope concentric green grid rings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 40, 0, Math.PI * 2);
    ctx.arc(w / 2, h / 2, 70, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();

    const config = moduleConfig[activeModule];
    const rate = simulationRate;
    const zoom = simulationZoom;

    if (activeModule === 'butterfly') {
      // Execute 4 Lorenz equations calculations per frame
      const steps = 4;
      const sigma = 10.0;
      const rho = 28.0;
      const beta = 8/3;
      const dt = 0.007 * rate;
      
      for (let i = 0; i < steps; i++) {
        const dx = sigma * (lY - lX) * dt;
        const dy = (lX * (rho - lZ) - lY) * dt;
        const dz = (lX * lY - beta * lZ) * dt;
        lX += dx;
        lY += dy;
        lZ += dz;
      }
      
      // Plot XZ Plane
      const px = w / 2 + lX * 2.8 * zoom;
      const py = h / 2 + (lZ - 25) * 2.5 * zoom;
      butterflyTrail.push({ x: px, y: py });
      if (butterflyTrail.length > maxPoints) butterflyTrail.shift();
      
      drawTrail(butterflyTrail, config.colorRgb);
      drawTelemetry(lX, lY, lZ, 'X', 'Y', 'Z');
      
    } else if (activeModule === 'chua') {
      // Execute 4 Chua equations steps per frame
      const steps = 4;
      const alpha = 15.6;
      const beta = 28.0;
      const dt = 0.008 * rate;
      
      for (let i = 0; i < steps; i++) {
        const dx = alpha * (cY - cX - chuaF(cX)) * dt;
        const dy = (cX - cY + cZ) * dt;
        const dz = -beta * cY * dt;
        cX += dx;
        cY += dy;
        cZ += dz;
      }
      
      // Plot XY Plane
      const px = w / 2 + cX * 20 * zoom;
      const py = h / 2 + cY * 20 * zoom;
      chuaTrail.push({ x: px, y: py });
      if (chuaTrail.length > maxPoints) chuaTrail.shift();
      
      drawTrail(chuaTrail, config.colorRgb);
      drawTelemetry(cX, cY, cZ, 'V1', 'V2', 'IL');
      
    } else if (activeModule === 'double') {
      // Execute 4 Labyrinthine Thomas attractor equations steps
      const steps = 4;
      const b = 0.208;
      const dt = 0.06 * rate;
      
      for (let i = 0; i < steps; i++) {
        const dx = (Math.sin(tY) - b * tX) * dt;
        const dy = (Math.sin(tZ) - b * tY) * dt;
        const dz = (Math.sin(tX) - b * tZ) * dt;
        tX += dx;
        tY += dy;
        tZ += dz;
      }
      
      // Plot XY Plane
      const px = w / 2 + tX * 22 * zoom;
      const py = h / 2 + tY * 22 * zoom;
      doubleTrail.push({ x: px, y: py });
      if (doubleTrail.length > maxPoints) doubleTrail.shift();
      
      drawTrail(doubleTrail, config.colorRgb);
      drawTelemetry(tX, tY, tZ, 'S1', 'S2', 'HYST');
    }

    requestAnimationFrame(renderLoop);
  }

  // Draw fading tail line
  function drawTrail(trail, rgbStr) {
    if (trail.length < 2) return;
    for (let i = 1; i < trail.length; i++) {
      const alpha = i / trail.length;
      ctx.strokeStyle = `rgba(${rgbStr}, ${alpha * 0.95})`;
      ctx.lineWidth = alpha * 1.5;
      
      // Dynamic glowing glow shadows
      ctx.shadowColor = `rgba(${rgbStr}, 0.55)`;
      ctx.shadowBlur = alpha * 3;
      
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0; // reset
  }

  // Draw miniature dynamic diagnostic telemetry readouts in scope
  function drawTelemetry(v1, v2, v3, label1, label2, label3) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.font = '5px "Space Mono", monospace';
    ctx.fillText(`${label1}: ${v1.toFixed(2)}`, 14, 18);
    ctx.fillText(`${label2}: ${v2.toFixed(2)}`, 14, 26);
    ctx.fillText(`${label3}: ${v3.toFixed(2)}`, 14, 34);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillText(`RATE: ${simulationRate.toFixed(1)}x`, 112, 18);
    ctx.fillText(`ZOOM: ${simulationZoom.toFixed(1)}x`, 112, 26);
  }

  renderLoop();
}

// ── WINDOW START ─────────────────────────────────────────────
function initHorizontalScroll() {
  const wrapper = document.querySelector('.page-wrapper');
  const cursor = document.getElementById('hscroll-cursor');
  if (!wrapper) return;

  let target = 0;
  let current = 0;
  let raf = null;

  function tick() {
    const diff = target - current;
    current += diff * 0.1;
    wrapper.scrollLeft = current;
    if (Math.abs(diff) > 0.5) {
      raf = requestAnimationFrame(tick);
    } else {
      wrapper.scrollLeft = target;
      current = target;
      raf = null;
    }
  }

  window.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    const max = wrapper.scrollWidth - wrapper.clientWidth;
    target = Math.max(0, Math.min(max, target + e.deltaY * 5));
    if (!raf) raf = requestAnimationFrame(tick);
  }, { passive: false });

  // Custom cursor on philosophy panels
  window.addEventListener('mousemove', (e) => {
    if (cursor) gsap.set(cursor, { x: e.clientX, y: e.clientY });
  });

  document.querySelectorAll('.hscroll-panel').forEach(panel => {
    panel.addEventListener('mouseenter', () => cursor?.classList.add('visible'));
    panel.addEventListener('mouseleave', () => cursor?.classList.remove('visible'));
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initSelectorList();
  initHardwareControls();
  initDrawers();
  initScopeCanvas();
  initHorizontalScroll();
  const logo = document.querySelector('.nav-logo');
  scrambleText(logo);
  logo.addEventListener('mouseenter', () => scrambleText(logo));
});
