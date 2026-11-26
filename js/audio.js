/** Jednoduché syntetizované zvuky přes WebAudio (bez externích souborů). */
export class Audio {
  constructor() {
    this.ctx = null;
  }
  start() {
    if (this.ctx) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      this.ctx = new C();
    } catch { return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(c.destination);
    // motor
    this.eng = c.createOscillator();
    this.eng.type = 'sawtooth';
    this.engF = c.createBiquadFilter();
    this.engF.type = 'lowpass';
    this.engF.frequency.value = 400;
    this.engG = c.createGain();
    this.engG.gain.value = 0;
    this.eng.connect(this.engF).connect(this.engG).connect(this.master);
    this.eng.start();
    // siréna
    this.sir = c.createOscillator();
    this.sir.type = 'triangle';
    this.sirG = c.createGain();
    this.sirG.gain.value = 0;
    this.sir.connect(this.sirG).connect(this.master);
    this.sir.start();
  }
  engine(on, speed, heli) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (heli) {
      this.eng.frequency.setTargetAtTime(28 + (Math.sin(t * 40) > 0 ? 6 : 0), t, 0.02);
      this.engG.gain.setTargetAtTime(0.13, t, 0.2);
      this.engF.frequency.setTargetAtTime(260, t, 0.1);
      return;
    }
    const gear = speed % 9;
    this.eng.frequency.setTargetAtTime(45 + gear * 9 + speed * 1.4, t, 0.08);
    this.engF.frequency.setTargetAtTime(300 + speed * 18, t, 0.1);
    this.engG.gain.setTargetAtTime(on ? 0.07 : 0, t, 0.15);
  }
  siren(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sirG.gain.setTargetAtTime(on ? 0.035 : 0, t, 0.3);
    if (on) this.sir.frequency.setTargetAtTime(Math.floor(t * 1.4) % 2 ? 960 : 720, t, 0.05);
  }
  blip(freq, dur, type = 'square', vol = 0.12, slide = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur);
  }
  noise(dur, vol = 0.3, freq = 800) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const b = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(); s.buffer = b;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
  }
  horn() { this.blip(400, 0.35, 'square', 0.08); this.blip(500, 0.35, 'square', 0.06); }
  crash(n) { const now = performance.now(); if (now - (this._cr || 0) < 250) return; this._cr = now; this.noise(0.35, Math.min(0.6, n * 0.04), 600); }
  thud() { this.noise(0.15, 0.3, 300); }
  door() { this.blip(180, 0.08, 'square', 0.08, -80); }
  ding() { this.blip(880, 0.15, 'sine', 0.12); setTimeout(() => this.blip(1320, 0.2, 'sine', 0.1), 120); }
  cash() { [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => this.blip(f, 0.12, 'triangle', 0.1), i * 70)); }
}
