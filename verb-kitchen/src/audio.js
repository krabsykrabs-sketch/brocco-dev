// WebAudio synth — no samples. All SFX built from oscillators + noise.
const SOUND_KEY = 'krabsy_vkitchen_sound';

class Audio {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem(SOUND_KEY) === 'off';
    this.master = null;
    this.sizzleNode = null;
    this.alarmTimer = null;
    this.franticTimer = null;
    this.franticOn = false;
    this._inactive = false;         // tab hidden / window blurred → master muted
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this._applyMaster();
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.55;
      this.musicGain.connect(this.master);
    } catch (e) { this.ctx = null; }
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem(SOUND_KEY, m ? 'off' : 'on');
    this._applyMaster();
  }

  _applyMaster() {
    if (this.master) this.master.gain.value = (this.muted || this._inactive) ? 0 : 0.5;
  }

  /** Tab hidden or window blurred → silence output. The game loop and the music
   *  scheduler may keep running while away, so we just zero the master gain (no
   *  node teardown): sound resumes seamlessly on return and never bursts. */
  setActive(active) {
    this._inactive = !active;
    if (active) this.resume();      // wake a ctx the browser auto-suspended in the background
    this._applyMaster();
  }

  // ---- primitives ----
  env(node, t0, a, peak, d) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.linearRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  tone(freq, dur = 0.15, type = 'sine', peak = 0.3, when = 0, slide = 0, dest = null) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    this.env(g, t0, 0.008, peak, dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  noise(dur = 0.2, peak = 0.25, when = 0, filterFreq = 2000, type = 'bandpass', dest = null) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    this.env(g, t0, 0.005, peak, dur);
    src.connect(f); f.connect(g); g.connect(dest || this.master);
    src.start(t0);
  }

  // ---- background music (chiptune sequencer, 16th-note lookahead) ----
  music(levelIdx = 0) {
    this.musicStop();
    if (!this.ctx) return;
    const P = MUSIC_PATTERNS[levelIdx % MUSIC_PATTERNS.length];
    const stepDur = 60 / P.bpm / 4;
    let nextStep = this.ctx.currentTime + 0.1;
    let step = 0;
    const N = P.lead.length;
    this.musicTimer = setInterval(() => {
      if (!this.ctx) return;
      while (nextStep < this.ctx.currentTime + 0.28) {
        const when = Math.max(0, nextStep - this.ctx.currentTime);
        const i = step % N;
        const lead = P.lead[i];
        if (lead) this.tone(midi(lead), stepDur * 1.7, 'square', 0.055, when, 0, this.musicGain);
        if (i % 4 === 0) {
          const b = P.bass[(step / 4) % P.bass.length | 0];
          if (b) this.tone(midi(b), stepDur * 3.2, 'triangle', 0.13, when, 0, this.musicGain);
        }
        if (P.hat[i % P.hat.length]) this.noise(0.03, 0.05, when, 8500, 'highpass', this.musicGain);
        nextStep += stepDur;
        step++;
      }
    }, 90);
  }
  musicStop() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
  /** Soften music while the player thinks at the sink. */
  duck(on) {
    if (!this.ctx || !this.musicGain) return;
    this.musicGain.gain.linearRampToValueAtTime(on ? 0.18 : 0.55, this.ctx.currentTime + 0.25);
  }

  // ---- named SFX ----
  chop() {
    const p = 130 + Math.random() * 55;
    this.noise(0.08, 0.55, 0, 550, 'lowpass');
    this.tone(p, 0.07, 'square', 0.13);
    this.tone(p * 4.7, 0.025, 'square', 0.04);
  }
  pickup() { this.tone(520, 0.07, 'triangle', 0.2); this.tone(740, 0.07, 'triangle', 0.16, 0.05); }
  putdown() { this.tone(300, 0.08, 'triangle', 0.18); }
  reject() { this.tone(140, 0.12, 'sawtooth', 0.15, 0, -40); }
  ding() { this.tone(1320, 0.5, 'sine', 0.25); this.tone(1980, 0.4, 'sine', 0.1, 0.02); }
  serve() { // ding + cha-ching + coin shimmer
    this.tone(880, 0.12, 'sine', 0.25); this.tone(1175, 0.12, 'sine', 0.25, 0.1);
    this.noise(0.12, 0.18, 0.22, 5000); this.tone(1568, 0.3, 'sine', 0.22, 0.24);
    this.tone(2093, 0.18, 'sine', 0.1, 0.3); this.tone(2637, 0.22, 'sine', 0.07, 0.36);
  }
  trash() { this.noise(0.18, 0.3, 0, 300, 'lowpass'); this.tone(90, 0.15, 'square', 0.12, 0.02, -30); }
  splash() { this.noise(0.35, 0.3, 0, 1200); this.noise(0.25, 0.18, 0.12, 2400); }
  clatter() {
    this.tone(2200, 0.05, 'square', 0.08); this.tone(1800, 0.05, 'square', 0.07, 0.06);
    this.tone(2600, 0.06, 'square', 0.05, 0.12); this.noise(0.08, 0.1, 0.02, 4000);
  }
  correct() { // bright arpeggio
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.22, i * 0.07));
  }
  washComplete() { // a clean plate! triumphant rising fanfare + sparkle shimmer
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.24, i * 0.075));
    this.tone(1760, 0.45, 'sine', 0.14, 0.42); this.tone(2637, 0.3, 'sine', 0.09, 0.48);
    this.noise(0.1, 0.12, 0.4, 6000, 'highpass');
  }
  wrong() { this.tone(180, 0.25, 'sawtooth', 0.2); this.tone(150, 0.3, 'sawtooth', 0.18, 0.05); }
  trombone() { // sad wah-wah-wahhh
    [330, 311, 294].forEach((f, i) => this.tone(f, i === 2 ? 0.6 : 0.25, 'sawtooth', 0.13, i * 0.28, i === 2 ? -50 : -10));
  }
  skid() { this.noise(0.1, 0.12, 0, 3000, 'highpass'); }
  tick() { this.tone(900, 0.04, 'square', 0.06); }

  sizzle(on) {
    if (!this.ctx) return;
    if (on && !this.sizzleNode) {
      const len = this.ctx.sampleRate * 1;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3500;
      const g = this.ctx.createGain(); g.gain.value = 0.05;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start();
      this.sizzleNode = src;
    } else if (!on && this.sizzleNode) {
      try { this.sizzleNode.stop(); } catch (e) {}
      this.sizzleNode = null;
    }
  }

  alarm(on) {
    if (on && !this.alarmTimer) {
      const beep = () => { this.tone(950, 0.18, 'square', 0.14); this.tone(950, 0.18, 'square', 0.12, 0.28); };
      beep();
      this.alarmTimer = setInterval(beep, 900);
    } else if (!on && this.alarmTimer) {
      clearInterval(this.alarmTimer); this.alarmTimer = null;
    }
  }

  frantic(on) {
    if (on === this.franticOn) return;
    this.franticOn = on;
    if (on && !this.franticTimer) {
      let step = 0;
      const seq = [220, 0, 220, 247, 0, 220, 0, 196];
      this.franticTimer = setInterval(() => {
        const f = seq[step % seq.length];
        if (f) { this.tone(f, 0.09, 'square', 0.07); this.tone(f * 2, 0.05, 'square', 0.03); }
        step++;
      }, 140);
    } else if (!on && this.franticTimer) {
      clearInterval(this.franticTimer); this.franticTimer = null;
    }
  }

  stopAll() { this.sizzle(false); this.alarm(false); this.frantic(false); this.musicStop(); }
}

function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }

// 32-step (2-bar) loops; lead = 16ths (0 = rest), bass = quarter notes.
const MUSIC_PATTERNS = [
  { // Garden Bistro — sunny C-pentatonic stroll
    bpm: 104,
    lead: [64, 0, 67, 0, 69, 0, 67, 64, 62, 0, 64, 0, 60, 0, 0, 0,
           64, 0, 67, 0, 72, 0, 69, 67, 64, 62, 64, 0, 60, 0, 0, 0],
    bass: [48, 43, 45, 48, 48, 43, 41, 43],
    hat:  [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0],
  },
  { // Burger Bar — bouncy diner shuffle in G
    bpm: 116,
    lead: [67, 0, 71, 0, 74, 0, 71, 67, 69, 0, 72, 0, 67, 0, 0, 0,
           67, 0, 71, 0, 74, 0, 76, 74, 72, 69, 67, 0, 62, 0, 0, 0],
    bass: [43, 50, 43, 50, 41, 48, 43, 50],
    hat:  [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0],
  },
  { // Pizzeria — driving E-minor tarantella-ish
    bpm: 124,
    lead: [64, 0, 64, 67, 71, 0, 67, 64, 62, 0, 62, 66, 69, 0, 66, 62,
           64, 0, 64, 67, 71, 0, 74, 71, 69, 66, 62, 0, 64, 0, 0, 0],
    bass: [52, 52, 55, 52, 50, 50, 52, 52],
    hat:  [1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0],
  },
];

export const audio = new Audio();
