/*
 * SLOW BURN: an interactive cigarette and smoke animation.
 * Plain HTML canvas, CSS and JavaScript. No libraries.
 *
 * Interaction
 *   Hold (mouse / touch / Space)  draw on the cigarette: the ember brightens
 *   Release                       exhale a plume of smoke
 *   Click or tap the ash / F      flick the ash
 *   Move the pointer              your cursor stirs the smoke
 *   N  light another              M  sound on / off
 */
(() => {
  'use strict';

  // ------------------------------------------------------------------ helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ---- 3D simplex noise (drives the swirling motion of the smoke) ----
  const noise3 = (() => {
    const grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
    const perm = new Uint8Array(512), permMod = new Uint8Array(512);
    let seed = 1337;
    const r = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; permMod[i] = perm[i] % 12; }
    const F3 = 1 / 3, G3 = 1 / 6;
    return function (xin, yin, zin) {
      let n0, n1, n2, n3;
      const s = (xin + yin + zin) * F3;
      const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
      const t = (i + j + k) * G3;
      const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else {
        if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
        else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
        else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      }
      const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
      const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
      const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
      const ii = i & 255, jj = j & 255, kk = k & 255;
      const g0 = grad3[permMod[ii + perm[jj + perm[kk]]]];
      const g1 = grad3[permMod[ii + i1 + perm[jj + j1 + perm[kk + k1]]]];
      const g2 = grad3[permMod[ii + i2 + perm[jj + j2 + perm[kk + k2]]]];
      const g3 = grad3[permMod[ii + 1 + perm[jj + 1 + perm[kk + 1]]]];
      let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (t0 < 0) n0 = 0; else { t0 *= t0; n0 = t0 * t0 * (g0[0] * x0 + g0[1] * y0 + g0[2] * z0); }
      let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (t1 < 0) n1 = 0; else { t1 *= t1; n1 = t1 * t1 * (g1[0] * x1 + g1[1] * y1 + g1[2] * z1); }
      let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (t2 < 0) n2 = 0; else { t2 *= t2; n2 = t2 * t2 * (g2[0] * x2 + g2[1] * y2 + g2[2] * z2); }
      let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (t3 < 0) n3 = 0; else { t3 *= t3; n3 = t3 * t3 * (g3[0] * x3 + g3[1] * y3 + g3[2] * z3); }
      return 32 * (n0 + n1 + n2 + n3);
    };
  })();

  // ------------------------------------------------------------------ DOM
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  const hintEl = document.getElementById('hint');
  const toastEl = document.getElementById('toast');
  const drawBar = document.querySelector('.drawbar');
  const drawFill = document.getElementById('drawFill');
  const statBurn = document.getElementById('statBurn');
  const statPuffs = document.getElementById('statPuffs');
  const statTime = document.getElementById('statTime');
  const btnFlick = document.getElementById('btnFlick');
  const btnNew = document.getElementById('btnNew');
  const btnSound = document.getElementById('btnSound');

  let W = 0, H = 0, dpr = 1;
  const MAX_HOLD = 5;                       // seconds you can hold a drag
  const TIP_TURB = 52;                      // swirl strength of the smoke
  let maxParticles = 1500;

  // ------------------------------------------------------------------ state
  const S = {
    time: 0,
    burned: 0,          // 0..1 of the tobacco
    ashLen: 0,          // px
    ember: 0,           // 0..1 brightness
    mode: 'lighting',   // lighting | lit | finished
    modeT: 0,
    inhale: false,
    hold: 0,
    tilt: 0,
    puffs: 0,
    litTime: 0,
    exhaleLeft: 0,
    exhaleRate: 0,
    exhaleAmt: 0,
    spawnAcc: 0,
    exhaleAcc: 0,
    everFlicked: false,
    everPuffed: false,
    ashSeed: [],
  };
  const pointer = { x: -999, y: -999, vx: 0, vy: 0, last: 0, down: false, id: null };

  let particles = [];
  let flakes = [];
  let sparks = [];
  let motes = [];

  // ------------------------------------------------------------------ sprites
  // Soft, slightly uneven puffs, generated once so no image files are needed.
  const sprites = [];
  function buildSprites() {
    for (let v = 0; v < 5; v++) {
      const size = 128, c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const img = g.createImageData(size, size);
      const off = v * 17.3;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = (x - 63.5) / 64, dy = (y - 63.5) / 64;
          const r = Math.sqrt(dx * dx + dy * dy);
          if (r >= 1) continue;
          const f = 1 - r;
          let a = f * f * (3 - 2 * f);
          const n = noise3(x * 0.045 + off, y * 0.045, off) * 0.6 + noise3(x * 0.11, y * 0.11 + off, 3) * 0.3;
          a *= clamp(0.85 + n * 0.6, 0, 1.3);
          const i = (y * size + x) * 4;
          img.data[i] = 226; img.data[i + 1] = 232; img.data[i + 2] = 244;
          img.data[i + 3] = clamp(a * 255, 0, 255);
        }
      }
      g.putImageData(img, 0, 0);
      sprites.push(c);
    }
  }

  // ------------------------------------------------------------------ geometry
  function reseedAsh() { S.ashSeed = Array.from({ length: 40 }, Math.random); }

  function geom() {
    const portrait = W < H * 0.9;
    const L0 = portrait ? W * 1.02 : clamp(W * 0.5, 300, 720);
    const D = clamp(L0 * 0.052, 15, 40);
    const fL = L0 * 0.22;
    const base = portrait ? -0.70 : -0.385;
    const sway = Math.sin(S.time * 0.45) * 0.004 + Math.sin(S.time * 1.3) * 0.0015;
    const follow = pointer.x > -900 ? (pointer.x / W - 0.5) * 0.01 : 0;
    const ang = base + sway + follow - S.tilt * 0.035;
    const ax = portrait ? -W * 0.05 : -W * 0.03;
    const ay = portrait ? H * 0.80 : H * 0.88;
    const paperLen = (L0 - fL) * (1 - S.burned);
    const paperEnd = fL + paperLen;
    const tipLocal = paperEnd + S.ashLen;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    return {
      L0, D, fL, ang, ax, ay, paperLen, paperEnd, tipLocal, cos, sin,
      wx: (lx, ly) => ax + lx * cos - ly * sin,
      wy: (lx, ly) => ay + lx * sin + ly * cos,
    };
  }

  // ------------------------------------------------------------------ sound (synthesised, optional)
  const Snd = {
    on: false, ctx: null, master: null, noise: null, inhaleSrc: null, inhaleGain: null, inhaleFilter: null, crackle: null,

    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // very quiet room tone
      const room = this.ctx.createBufferSource();
      room.buffer = this.noise; room.loop = true;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
      const rg = this.ctx.createGain(); rg.gain.value = 0.05;
      room.connect(lp).connect(rg).connect(this.master);
      room.start();
      return true;
    },

    toggle() {
      this.on = !this.on;
      if (this.on && !this.ensure()) this.on = false;
      if (!this.on) this.inhaleStop();
      btnSound.textContent = this.on ? 'Sound on' : 'Sound off';
      btnSound.setAttribute('aria-pressed', String(this.on));
    },

    tick(vol) {
      if (!this.on || !this.ctx) return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource(); src.buffer = this.noise;
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = rand(1800, 3600);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + rand(0.01, 0.03));
      src.connect(hp).connect(g).connect(this.master);
      src.start(t, Math.random() * 1.5, 0.05);
    },

    inhaleStart() {
      if (!this.on || !this.ctx) return;
      const t = this.ctx.currentTime;
      this.inhaleSrc = this.ctx.createBufferSource(); this.inhaleSrc.buffer = this.noise; this.inhaleSrc.loop = true;
      this.inhaleFilter = this.ctx.createBiquadFilter(); this.inhaleFilter.type = 'bandpass'; this.inhaleFilter.Q.value = 0.8;
      this.inhaleFilter.frequency.setValueAtTime(500, t);
      this.inhaleFilter.frequency.linearRampToValueAtTime(1500, t + MAX_HOLD);
      this.inhaleGain = this.ctx.createGain();
      this.inhaleGain.gain.setValueAtTime(0, t);
      this.inhaleGain.gain.linearRampToValueAtTime(0.05, t + 0.3);
      this.inhaleSrc.connect(this.inhaleFilter).connect(this.inhaleGain).connect(this.master);
      this.inhaleSrc.start();
      this.crackle = setInterval(() => { if (Math.random() < 0.6) this.tick(rand(0.05, 0.16)); }, 55);
    },

    inhaleStop() {
      if (this.crackle) { clearInterval(this.crackle); this.crackle = null; }
      if (!this.inhaleSrc || !this.ctx) return;
      const t = this.ctx.currentTime, src = this.inhaleSrc, g = this.inhaleGain;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.15);
      src.stop(t + 0.2);
      this.inhaleSrc = null;
    },

    exhale(amt) {
      if (!this.on || !this.ctx) return;
      const t = this.ctx.currentTime, dur = 0.9 + 1.4 * amt;
      const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.6;
      bp.frequency.setValueAtTime(1100, t); bp.frequency.exponentialRampToValueAtTime(450, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11 * (0.4 + amt), t + 0.18);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp).connect(g).connect(this.master);
      src.start(t); src.stop(t + dur + 0.1);
    },

    flick() {
      if (!this.on || !this.ctx) return;
      for (let i = 0; i < 4; i++) setTimeout(() => this.tick(rand(0.08, 0.2)), i * 28);
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.16);
    },

    lighter() {
      if (!this.on || !this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = 2400;
      const og = this.ctx.createGain(); og.gain.setValueAtTime(0.05, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(og).connect(this.master); o.start(t); o.stop(t + 0.04);
      const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 0.7;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t + 0.06); g.gain.linearRampToValueAtTime(0.07, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      src.connect(bp).connect(g).connect(this.master); src.start(t); src.stop(t + 1.6);
    },
  };

  // ------------------------------------------------------------------ UI helpers
  let toastTimer = 0;
  function toast(msg, ms = 2600) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), ms);
  }
  function setHint(text) {
    if (!text) { hintEl.classList.add('is-hidden'); return; }
    hintEl.classList.remove('is-hidden');
    hintEl.style.animation = 'none';
    hintEl.style.opacity = '1';
    hintEl.textContent = text;
  }

  // ------------------------------------------------------------------ actions
  function startInhale() {
    if (S.mode !== 'lit' || S.inhale) return;
    S.inhale = true; S.hold = 0;
    Snd.inhaleStart();
    drawBar.classList.add('is-on');
    const g = geom();
    for (let i = 0; i < 6; i++) addSpark(g.wx(g.paperEnd + S.ashLen * 0.5, 0), g.wy(g.paperEnd + S.ashLen * 0.5, 0), 0.6);
  }

  function endInhale() {
    if (!S.inhale) return;
    S.inhale = false;
    Snd.inhaleStop();
    drawBar.classList.remove('is-on');
    drawFill.style.width = '0%';
    if (S.hold > 0.3) {
      const amt = clamp(S.hold / 3.5, 0.15, 1);
      S.exhaleAmt = amt;
      S.exhaleLeft = Math.round(110 + 260 * amt);
      S.exhaleRate = S.exhaleLeft / (0.9 + 1.1 * amt);
      S.puffs++;
      Snd.exhale(amt);
      if (!S.everPuffed) { S.everPuffed = true; setHint('Move your cursor through the smoke.'); setTimeout(() => { if (!S.everFlicked) setHint(''); }, 6000); }
    }
    S.hold = 0;
  }

  function flickAsh() {
    if (S.mode === 'lighting') return;
    if (S.ashLen < 6) { toast('Nothing to flick yet. Let it burn.'); return; }
    dropAsh(false);
  }

  function dropAsh(natural) {
    const g = geom();
    const a0 = g.paperEnd, len = S.ashLen;
    // one larger piece plus crumbs
    flakes.push({
      x: g.wx(a0 + len / 2, 0), y: g.wy(a0 + len / 2, 0),
      vx: rand(30, 90) * (natural ? 0.3 : 1), vy: rand(-60, -10), rot: g.ang, vr: rand(-3, 3),
      w: len, h: g.D * 0.82, life: 3.2, age: 0, shade: 150,
    });
    const crumbs = Math.round(8 + len * 0.35);
    for (let i = 0; i < crumbs; i++) {
      const lx = a0 + Math.random() * len;
      flakes.push({
        x: g.wx(lx, 0), y: g.wy(lx, rand(-g.D / 3, g.D / 3)),
        vx: rand(-40, 110) * (natural ? 0.4 : 1), vy: rand(-120, 20), rot: Math.random() * 6, vr: rand(-8, 8),
        w: rand(2, 7), h: rand(2, 5), life: rand(1.6, 3), age: 0, shade: rand(90, 190),
      });
    }
    for (let i = 0; i < 9; i++) addSpark(g.wx(a0, rand(-3, 3)), g.wy(a0, rand(-3, 3)), 1);
    S.ashLen = 0;
    reseedAsh();
    S.ember = Math.min(1, S.ember + 0.35);
    if (!natural) {
      Snd.flick();
      S.everFlicked = true;
      setHint('');
    }
  }

  function newCigarette() {
    endInhale();
    if (S.mode !== 'finished' && S.ashLen > 0) dropAsh(true);
    S.burned = 0; S.ashLen = 0; S.ember = 0;
    S.mode = 'lighting'; S.modeT = 0;
    S.puffs = 0; S.litTime = 0; S.exhaleLeft = 0;
    reseedAsh();
    btnNew.classList.remove('is-primary');
    Snd.lighter();
    setHint('');
  }

  // ------------------------------------------------------------------ spawners
  function addSpark(x, y, power) {
    sparks.push({
      x, y, vx: rand(-90, 90) * power, vy: rand(-160, -20) * power,
      age: 0, life: rand(0.35, 1.0), r: rand(0.8, 1.9),
    });
  }

  function pushParticle(p) {
    if (particles.length >= maxParticles) particles.shift();
    particles.push(p);
  }

  function spawnTip(g) {
    const lx = g.tipLocal + 1;
    pushParticle({
      x: g.wx(lx, rand(-g.D * 0.2, g.D * 0.2)), y: g.wy(lx, rand(-g.D * 0.2, g.D * 0.2)),
      vx: rand(-5, 5), vy: -rand(38, 62),
      age: 0, life: rand(6.5, 10), s0: rand(3, 6) * g.D / 24, s1: rand(70, 140) * g.D / 24,
      a: rand(0.10, 0.17), rot: Math.random() * 6.28, vr: rand(-0.3, 0.3),
      spr: Math.floor(Math.random() * sprites.length),
      drag: 0.75, buoy: 62, turbStart: 0.5,
    });
  }

  function spawnExhale(g, amt) {
    const lx = g.fL * 0.1, ly = -g.D * 0.2;
    const a = g.ang + rand(-0.38, 0.18);
    const sp = rand(380, 600) * (0.6 + 0.6 * amt);
    pushParticle({
      x: g.wx(lx, ly) + rand(-6, 6), y: g.wy(lx, ly) + rand(-6, 6),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      age: 0, life: rand(5, 9), s0: rand(22, 40) * g.D / 24, s1: rand(220, 400) * g.D / 28,
      a: rand(0.07, 0.12) * (0.7 + 0.5 * amt), rot: Math.random() * 6.28, vr: rand(-0.25, 0.25),
      spr: Math.floor(Math.random() * sprites.length),
      drag: 1.05, buoy: 24, turbStart: 0.05,
    });
  }

  // ------------------------------------------------------------------ update
  const cv = { x: 0, y: 0 };
  function curl(x, y, t, fine) {
    const f = 0.0032, u = x * f, v = y * f, w = t * 0.11, e = 0.02;
    let dx = (noise3(u + e, v, w) - noise3(u - e, v, w)) / (2 * e);
    let dy = (noise3(u, v + e, w) - noise3(u, v - e, w)) / (2 * e);
    cv.x = dy; cv.y = -dx;
    if (fine) {
      const f2 = 0.0095, u2 = x * f2 + 40, v2 = y * f2 + 40, e2 = 0.02;
      const dx2 = (noise3(u2 + e2, v2, w * 1.6) - noise3(u2 - e2, v2, w * 1.6)) / (2 * e2);
      const dy2 = (noise3(u2, v2 + e2, w * 1.6) - noise3(u2, v2 - e2, w * 1.6)) / (2 * e2);
      cv.x += dy2 * 0.28; cv.y -= dx2 * 0.28;
    }
  }

  function update(dt) {
    S.time += dt;
    const g = geom();

    // pointer velocity fades when the cursor stops
    const decay = Math.exp(-dt * 6);
    pointer.vx *= decay; pointer.vy *= decay;
    const pSpeed = Math.hypot(pointer.vx, pointer.vy);

    // --- cigarette state ---
    S.modeT += dt;
    if (S.mode === 'lighting' && S.modeT > 1.5) { S.mode = 'lit'; S.modeT = 0; }
    if (S.mode === 'lit') {
      S.litTime += dt;
      const rate = S.inhale ? 1 / 55 : 1 / 330;
      const db = rate * dt;
      S.burned = Math.min(1, S.burned + db);
      S.ashLen += db * (g.L0 - g.fL) * 0.9;
      if (S.ashLen > g.D * 2.7) dropAsh(true);
      if (S.burned >= 1) {
        endInhale();
        if (S.ashLen > 2) dropAsh(true);
        S.mode = 'finished'; S.modeT = 0;
        btnNew.classList.add('is-primary');
        setHint('That was the last of it. Light another.');
      }
    }
    if (S.mode === 'lit' && !S.everFlicked && S.ashLen > g.D * 1.5 && !hintEl.dataset.ashHint && S.everPuffed) {
      hintEl.dataset.ashHint = '1'; setHint('Click or tap the ash to flick it.');
    }

    if (S.inhale) {
      S.hold += dt;
      drawFill.style.width = (S.hold / MAX_HOLD * 100).toFixed(1) + '%';
      if (S.hold >= MAX_HOLD) endInhale();
    }
    S.tilt += ((S.inhale ? 1 : 0) - S.tilt) * (1 - Math.exp(-dt * 5));

    // ember brightness
    let target = 0;
    if (S.mode === 'lighting') target = clamp((S.modeT - 0.5) / 0.9, 0, 1) * 0.5;
    else if (S.mode === 'lit') target = S.inhale ? 1 : 0.36 + 0.11 * noise3(S.time * 1.7, 4.2, 1.3) + 0.04 * Math.sin(S.time * 9);
    else target = 0;
    const speed = S.inhale ? 6 : (S.mode === 'finished' ? 0.45 : 2.5);
    S.ember += (target - S.ember) * (1 - Math.exp(-dt * speed));

    // --- smoke from the tip ---
    let tipRate = 0;
    if (S.mode === 'lit') tipRate = (S.inhale ? 18 : 44);
    else if (S.mode === 'lighting' && S.modeT > 0.7) tipRate = 10;
    else if (S.mode === 'finished') tipRate = 22 * clamp(S.ember * 2.2, 0, 1);
    S.spawnAcc += tipRate * dt;
    while (S.spawnAcc >= 1) { S.spawnAcc -= 1; spawnTip(g); }

    // --- exhale plume ---
    if (S.exhaleLeft > 0) {
      S.exhaleAcc += S.exhaleRate * dt;
      while (S.exhaleAcc >= 1 && S.exhaleLeft > 0) { S.exhaleAcc -= 1; S.exhaleLeft--; spawnExhale(g, S.exhaleAmt); }
    }

    // --- smoke particles ---
    const fine = Math.min(W, H) > 600;
    const wind = Math.sin(S.time * 0.13) * 7 + 3;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) { particles[i] = particles[particles.length - 1]; particles.pop(); continue; }
      const t = p.age / p.life;
      const turb = smooth(p.turbStart, p.turbStart + 1.8, p.age);
      curl(p.x, p.y, S.time, fine);
      p.vx += (cv.x * TIP_TURB * turb + wind * 0.2) * dt;
      p.vy += (cv.y * TIP_TURB * turb - p.buoy * (1 - 0.55 * t)) * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k;

      // the pointer pushes the smoke around
      if (pSpeed > 25) {
        const dx = p.x - pointer.x, dy = p.y - pointer.y, R = 190;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          const f = 1 - Math.sqrt(d2) / R, wgt = Math.min(1, pSpeed / 500) * f * f * Math.min(1, dt * 9);
          p.vx += (pointer.vx * 0.6 - p.vx) * wgt;
          p.vy += (pointer.vy * 0.6 - p.vy) * wgt;
        }
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }

    // --- ash flakes ---
    for (let i = flakes.length - 1; i >= 0; i--) {
      const f = flakes[i];
      f.age += dt;
      if (f.age >= f.life || f.y > H + 40) { flakes.splice(i, 1); continue; }
      f.vy += 560 * dt;
      const k = Math.exp(-0.5 * dt); f.vx *= k;
      f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
    }

    // --- sparks ---
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dt;
      if (s.age >= s.life) { sparks.splice(i, 1); continue; }
      s.vy += 380 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
    }
    if (S.inhale && Math.random() < dt * 14) addSpark(g.wx(g.paperEnd + S.ashLen * 0.6, 0), g.wy(g.paperEnd + S.ashLen * 0.6, 0), 0.5);

    // --- dust motes ---
    for (const m of motes) {
      m.x += (m.vx + Math.sin(S.time * 0.3 + m.ph) * 4) * dt;
      m.y += (m.vy + Math.cos(S.time * 0.25 + m.ph) * 3) * dt;
      if (m.x < -10) m.x = W + 10; if (m.x > W + 10) m.x = -10;
      if (m.y < -10) m.y = H + 10; if (m.y > H + 10) m.y = -10;
    }
  }

  // ------------------------------------------------------------------ drawing
  let shaftCanvas = null;
  function buildShaft() {
    shaftCanvas = document.createElement('canvas');
    shaftCanvas.width = Math.max(1, Math.round(W / 2)); shaftCanvas.height = Math.max(1, Math.round(H / 2));
    const g = shaftCanvas.getContext('2d');
    g.scale(0.5, 0.5);
    g.translate(W * 0.84, -H * 0.1);
    g.rotate(0.46);
    const wd = W * 0.34;
    const grad = g.createLinearGradient(-wd, 0, wd, 0);
    grad.addColorStop(0, 'rgba(150,175,215,0)');
    grad.addColorStop(0.5, 'rgba(160,185,225,0.085)');
    grad.addColorStop(1, 'rgba(150,175,215,0)');
    g.fillStyle = grad;
    g.fillRect(-wd, -H * 0.3, wd * 2, H * 1.9);
  }

  function shaftBrightness(x, y) {
    // distance from the centre line of the light shaft
    const cx = W * 0.84, cy = -H * 0.1, a = 0.46;
    const dx = x - cx, dy = y - cy;
    const dist = dx * Math.cos(a) + dy * Math.sin(a);
    const wd = W * 0.17;
    return Math.exp(-(dist * dist) / (wd * wd));
  }

  function drawMotes() {
    for (const m of motes) {
      const b = shaftBrightness(m.x, m.y);
      const tw = 0.6 + 0.4 * Math.sin(S.time * m.tw + m.ph);
      const a = (0.05 + 0.5 * b) * tw * m.a;
      if (a < 0.01) continue;
      ctx.fillStyle = `rgba(210,225,245,${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 6.2832); ctx.fill();
    }
  }

  const speckles = Array.from({ length: 90 }, () => [Math.random(), Math.random(), Math.random()]);

  function drawCigarette(g) {
    const D = g.D, h = D / 2, E = S.ember;
    ctx.save();
    ctx.translate(g.ax, g.ay);
    ctx.rotate(g.ang);

    // soft contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-80, h + 3, g.paperEnd + 80, 4);

    // filter / tipping paper
    const fg = ctx.createLinearGradient(0, -h, 0, h);
    fg.addColorStop(0, '#e6c48f'); fg.addColorStop(0.3, '#d2a86b'); fg.addColorStop(0.75, '#a67a43'); fg.addColorStop(1, '#6a4824');
    ctx.fillStyle = fg;
    ctx.fillRect(-90, -h, g.fL + 90, D);
    ctx.fillStyle = 'rgba(80,50,20,0.38)';
    for (const s of speckles) {
      ctx.globalAlpha = 0.25 + s[2] * 0.35;
      ctx.fillRect(-60 + s[0] * (g.fL + 60), -h + s[1] * D, 1.2, 1.2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(55,34,14,0.55)'; ctx.fillRect(g.fL - 1.6, -h, 2.4, D);
    ctx.fillStyle = 'rgba(255,240,210,0.22)'; ctx.fillRect(-90, -h + 1.2, g.fL + 90, 1.4);

    // paper
    const pe = g.paperEnd;
    if (pe > g.fL + 1) {
      const pg = ctx.createLinearGradient(0, -h, 0, h);
      pg.addColorStop(0, '#fcfbf7'); pg.addColorStop(0.22, '#f0eee7'); pg.addColorStop(0.6, '#d2cec4'); pg.addColorStop(0.88, '#9b968a'); pg.addColorStop(1, '#65615a');
      ctx.fillStyle = pg;
      ctx.fillRect(g.fL, -h, pe - g.fL, D);
      ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(g.fL, h * 0.35, pe - g.fL, 1);

      // scorch and ember light creeping up the paper
      const sw = Math.min(D * 3.4, pe - g.fL);
      const sg = ctx.createLinearGradient(pe - sw, 0, pe, 0);
      sg.addColorStop(0, 'rgba(120,85,40,0)'); sg.addColorStop(0.65, 'rgba(110,78,36,0.28)'); sg.addColorStop(1, 'rgba(28,17,8,0.9)');
      ctx.fillStyle = sg; ctx.fillRect(pe - sw, -h, sw, D);
      const wg = ctx.createLinearGradient(pe - D * 4, 0, pe, 0);
      wg.addColorStop(0, 'rgba(255,120,40,0)'); wg.addColorStop(1, `rgba(255,110,30,${(0.42 * E).toFixed(3)})`);
      ctx.fillStyle = wg; ctx.fillRect(pe - D * 4, -h, D * 4, D);
    }

    // charred burn ring
    const ringW = D * 0.5;
    const rg = ctx.createLinearGradient(pe, 0, pe + ringW, 0);
    rg.addColorStop(0, 'rgba(20,12,8,1)');
    rg.addColorStop(0.6, `rgba(${Math.round(60 + 120 * E)},${Math.round(20 + 28 * E)},8,1)`);
    rg.addColorStop(1, `rgba(255,${Math.round(80 + 100 * E)},30,${(0.35 + 0.65 * E).toFixed(3)})`);
    ctx.fillStyle = rg;
    ctx.fillRect(pe, -h * 0.97, ringW, D * 0.97);

    // ash column or bare ember
    const ash = S.ashLen;
    if (ash > 1.5) {
      const N = 14, seed = S.ashSeed;
      const x0 = pe + ringW * 0.6, len = Math.max(1, ash - ringW * 0.6);
      const prof = (t, k) => {
        let hw = h * (0.9 - 0.15 * Math.pow(t, 1.5)) * (0.93 + 0.11 * seed[(k + (t * N | 0)) % 40]);
        if (t > 0.88) hw *= 1 - Math.pow((t - 0.88) / 0.12, 2) * 0.5;
        return hw;
      };
      ctx.beginPath();
      for (let i = 0; i <= N; i++) { const t = i / N; ctx.lineTo(x0 + t * len, -prof(t, 0)); }
      for (let i = N; i >= 0; i--) { const t = i / N; ctx.lineTo(x0 + t * len, prof(t, 11)); }
      ctx.closePath();
      const ag = ctx.createLinearGradient(0, -h, 0, h);
      ag.addColorStop(0, '#d2d0c9'); ag.addColorStop(0.5, '#979590'); ag.addColorStop(1, '#4a4946');
      ctx.fillStyle = ag; ctx.fill();
      ctx.save(); ctx.clip();
      const ig = ctx.createLinearGradient(x0, 0, x0 + len * 0.7, 0);
      ig.addColorStop(0, `rgba(255,110,30,${(0.7 * E).toFixed(3)})`); ig.addColorStop(1, 'rgba(255,110,30,0)');
      ctx.fillStyle = ig; ctx.fillRect(x0, -h, len, D);
      ctx.strokeStyle = 'rgba(30,30,28,0.4)'; ctx.lineWidth = 0.9;
      for (let c = 0; c < 4; c++) {
        const cx = x0 + (0.18 + 0.2 * c + seed[20 + c] * 0.08) * len;
        ctx.beginPath(); ctx.moveTo(cx, -h); ctx.lineTo(cx + (seed[24 + c] - 0.5) * 6, 0); ctx.lineTo(cx + (seed[28 + c] - 0.5) * 8, h); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x0, -h * 0.82, len, 1.2);
      ctx.restore();
    } else {
      // exposed ember: bumpy dome of glowing coal
      const cx = pe + ringW * 0.55;
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI;
        const r = h * (0.88 + 0.12 * S.ashSeed[i]);
        ctx.lineTo(cx + Math.cos(a) * r * 0.55, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = '#1b1210'; ctx.fill();
      ctx.save(); ctx.clip();
      const eg = ctx.createRadialGradient(cx, 0, 0, cx, 0, h * 1.1);
      eg.addColorStop(0, `rgba(255,236,176,${E.toFixed(3)})`);
      eg.addColorStop(0.45, `rgba(255,140,40,${E.toFixed(3)})`);
      eg.addColorStop(1, `rgba(170,40,10,${(E * 0.9).toFixed(3)})`);
      ctx.fillStyle = eg; ctx.fillRect(cx - h, -h, h * 2.2, D);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawSmoke() {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const t = p.age / p.life;
      const a = p.a * Math.min(1, p.age / 0.5) * Math.pow(1 - t, 1.4);
      if (a < 0.004) continue;
      const sz = lerp(p.s0, p.s1, 1 - Math.pow(1 - t, 0.55));
      const c = Math.cos(p.rot) * dpr, s = Math.sin(p.rot) * dpr;
      ctx.setTransform(c, s, -s, c, p.x * dpr, p.y * dpr);
      ctx.globalAlpha = a;
      ctx.drawImage(sprites[p.spr], -sz / 2, -sz / 2, sz, sz);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
  }

  function drawFlakes() {
    for (const f of flakes) {
      const t = f.age / f.life;
      const a = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
      ctx.save();
      ctx.translate(f.x, f.y); ctx.rotate(f.rot);
      ctx.globalAlpha = a;
      const v = Math.round(f.shade);
      ctx.fillStyle = `rgb(${v},${v},${v - 4})`;
      ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawSparks() {
    ctx.globalCompositeOperation = 'lighter';
    for (const s of sparks) {
      const t = s.age / s.life, a = 1 - t;
      ctx.fillStyle = `rgba(255,${Math.round(150 + 80 * (1 - t))},60,${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (1 - t * 0.5), 0, 6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawGlow(g) {
    const E = S.ember;
    if (E < 0.02) return;
    const x = g.wx(g.paperEnd + S.ashLen * 0.25, 0), y = g.wy(g.paperEnd + S.ashLen * 0.25, 0);
    ctx.globalCompositeOperation = 'lighter';
    const r1 = g.D * (1.8 + 3.6 * E);
    let gr = ctx.createRadialGradient(x, y, 0, x, y, r1);
    gr.addColorStop(0, `rgba(255,170,70,${(0.5 * E).toFixed(3)})`);
    gr.addColorStop(0.3, `rgba(255,100,25,${(0.24 * E).toFixed(3)})`);
    gr.addColorStop(1, 'rgba(255,60,10,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r1, 0, 6.2832); ctx.fill();
    const r2 = g.D * (8 + 9 * E);
    gr = ctx.createRadialGradient(x, y, 0, x, y, r2);
    gr.addColorStop(0, `rgba(255,95,28,${(0.085 * E).toFixed(3)})`);
    gr.addColorStop(1, 'rgba(255,70,15,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r2, 0, 6.2832); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFlame(g) {
    if (S.mode !== 'lighting' || S.modeT > 1.5) return;
    const fade = S.modeT < 1.1 ? 1 : 1 - (S.modeT - 1.1) / 0.4;
    const intro = smooth(0, 0.25, S.modeT);
    const a = fade * intro;
    const tx = g.wx(g.tipLocal, 0), ty = g.wy(g.tipLocal, 0);
    const fh = g.D * 3.4, fw = g.D * 0.9;
    const bx = tx + g.D * 0.5, by = ty + fh;
    const fl = noise3(S.time * 9, 1.1, 0) * 0.14, fl2 = noise3(S.time * 7, 3.3, 2) * 0.12;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    const glow = ctx.createRadialGradient(tx, ty + fh * 0.5, 0, tx, ty + fh * 0.5, fh * 1.6);
    glow.addColorStop(0, 'rgba(255,170,80,0.35)'); glow.addColorStop(1, 'rgba(255,100,30,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(tx, ty + fh * 0.5, fh * 1.6, 0, 6.2832); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.bezierCurveTo(bx - fw * (1.1 + fl), by - fh * 0.35, bx - fw * 0.5, by - fh * 0.7, tx + fl * 12, ty + fh * 0.06);
    ctx.bezierCurveTo(bx + fw * 0.45, by - fh * 0.7, bx + fw * (1.1 + fl2), by - fh * 0.35, bx, by);
    const fg = ctx.createLinearGradient(0, by, 0, ty);
    fg.addColorStop(0, 'rgba(90,130,255,0.85)'); fg.addColorStop(0.2, 'rgba(255,240,190,0.95)');
    fg.addColorStop(0.6, 'rgba(255,170,60,0.85)'); fg.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = fg; ctx.fill();
    ctx.restore();
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (shaftCanvas) ctx.drawImage(shaftCanvas, 0, 0, W, H);
    drawMotes();
    const g = geom();
    drawCigarette(g);
    drawSmoke();
    drawFlakes();
    drawGlow(g);
    drawSparks();
    drawFlame(g);
  }

  // ------------------------------------------------------------------ input
  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function overAsh(x, y, touch) {
    if (S.ashLen < 6 || S.mode === 'lighting') return false;
    const g = geom();
    const dx = x - g.ax, dy = y - g.ay;
    const lx = dx * g.cos + dy * g.sin, ly = -dx * g.sin + dy * g.cos;
    const pad = touch ? 16 : 7;
    return lx >= g.paperEnd - 10 && lx <= g.paperEnd + S.ashLen + 18 && Math.abs(ly) <= g.D * 0.9 + pad;
  }

  canvas.addEventListener('pointerdown', e => {
    if (pointer.down) return;
    const p = pointerPos(e);
    pointer.down = true; pointer.id = e.pointerId; pointer.x = p.x; pointer.y = p.y; pointer.last = performance.now();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (Snd.on) Snd.ensure();
    if (overAsh(p.x, p.y, e.pointerType === 'touch')) flickAsh();
    else if (S.mode === 'finished') toast('Nothing left to draw. Light another.');
    else startInhale();
  });

  canvas.addEventListener('pointermove', e => {
    const p = pointerPos(e), now = performance.now();
    const dt = Math.max(1, now - pointer.last) / 1000;
    if (pointer.x > -900) {
      const vx = (p.x - pointer.x) / dt, vy = (p.y - pointer.y) / dt;
      pointer.vx = lerp(pointer.vx, clamp(vx, -1600, 1600), 0.35);
      pointer.vy = lerp(pointer.vy, clamp(vy, -1600, 1600), 0.35);
    }
    pointer.x = p.x; pointer.y = p.y; pointer.last = now;
    canvas.style.cursor = overAsh(p.x, p.y, false) ? 'pointer' : 'default';
  });

  const release = e => {
    if (pointer.id !== null && e.pointerId !== pointer.id) return;
    pointer.down = false; pointer.id = null;
    endInhale();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      if (!e.repeat) { if (S.mode === 'finished') toast('Nothing left to draw. Light another.'); else startInhale(); }
    } else if (e.code === 'KeyF' && !e.repeat) flickAsh();
    else if (e.code === 'KeyN' && !e.repeat) newCigarette();
    else if (e.code === 'KeyM' && !e.repeat) Snd.toggle();
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space') endInhale(); });
  window.addEventListener('blur', endInhale);
  document.addEventListener('visibilitychange', () => { if (document.hidden) endInhale(); });

  btnFlick.addEventListener('click', flickAsh);
  btnNew.addEventListener('click', newCigarette);
  btnSound.addEventListener('click', () => Snd.toggle());
  [btnFlick, btnNew, btnSound].forEach(b => b.addEventListener('pointerup', () => { if (b.matches(':not(:focus-visible)')) b.blur(); }));

  // ------------------------------------------------------------------ sizing & loop
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    maxParticles = Math.min(W, H) < 600 ? 850 : 1500;
    buildShaft();
    const n = Math.min(90, Math.round(W * H / 14000));
    motes = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: rand(0.5, 1.7),
      vx: rand(-4, 4), vy: rand(-6, 2), ph: Math.random() * 6.28, tw: rand(0.4, 1.4), a: rand(0.5, 1),
    }));
  }
  window.addEventListener('resize', resize);

  let hudTimer = 0;
  function updateHud() {
    statBurn.textContent = Math.round(S.burned * 100) + '%';
    statPuffs.textContent = String(S.puffs);
    const sec = Math.floor(S.litTime);
    statTime.textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    hudTimer += dt;
    if (hudTimer > 0.25) { hudTimer = 0; updateHud(); }
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------ go
  buildSprites();
  reseedAsh();
  resize();
  // the opening: the screen fades up while a lighter flame catches the cigarette
  S.mode = 'lighting'; S.modeT = -1.0;
  updateHud();
  requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
})();
