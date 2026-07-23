// 効果音とBGMを Web Audio API で合成する係。
// 音源ファイルを持たない（＝単一ファイル版でもそのまま動く）。
//
// ブラウザは「最初のユーザー操作」までは音を鳴らせないので、
// unlock() を最初のタップ／キー入力で1回だけ呼ぶ。
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.bgmOn = false;
    this._bgmTimer = null;
    this._step = 0;
    this._nextNoteTime = 0;
    this._last = {}; // 効果音ごとの最終再生時刻（連打を間引く）
    let muted = false;
    try { muted = localStorage.getItem('goki-muted') === '1'; } catch {}
    this.muted = muted;
  }

  // 最初のユーザー操作で呼ぶ。以後は何度呼んでも安全。
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.startBgm();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('goki-muted', m ? '1' : '0'); } catch {}
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  // --- 音の部品 ---
  _blip(freq, dur, type = 'square', vol = 0.25, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  _slide(f0, f1, dur, type = 'sawtooth', vol = 0.25) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  _noise(dur, vol = 0.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g); g.connect(this.master);
    src.start(t);
  }

  // イベント名 → 効果音。min 秒以内の連打は無視して音の洪水を防ぐ。
  sfx(name) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const min = { pickup: 0.05, spawn: 0.05, death: 0.05, swipe: 0.08, spray: 0.2 }[name] || 0;
    if (min && this._last[name] && now - this._last[name] < min) return;
    this._last[name] = now;

    switch (name) {
      case 'pickup': this._blip(880, 0.07, 'square', 0.14); break;
      case 'spawn':  this._blip(660, 0.05, 'square', 0.16); this._blip(990, 0.07, 'square', 0.16, 0.05); break;
      case 'hatch':  [523, 659, 784, 1047].forEach((f, i) => this._blip(f, 0.1, 'square', 0.2, i * 0.06)); break;
      case 'death':  this._slide(300, 80, 0.22, 'sawtooth', 0.18); break;
      case 'mission':[523, 659, 784, 1047, 1319].forEach((f, i) => this._blip(f, 0.14, 'triangle', 0.24, i * 0.08)); break;
      case 'recruit':this._blip(440, 0.07, 'square', 0.18); this._blip(660, 0.09, 'square', 0.18, 0.07); break;
      case 'nested': this._blip(220, 0.16, 'sine', 0.26); this._blip(165, 0.2, 'sine', 0.22, 0.05); break;
      case 'danger': this._blip(330, 0.13, 'sawtooth', 0.22); this._blip(330, 0.13, 'sawtooth', 0.22, 0.18); break;
      case 'swipe':  this._noise(0.11, 0.16); break;
      case 'spray':  this._noise(0.4, 0.14); break;
      case 'win':    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this._blip(f, 0.16, 'triangle', 0.3, i * 0.1)); break;
      case 'lose':   this._slide(440, 110, 0.7, 'sawtooth', 0.26); break;
      default: break;
    }
  }

  // 陽気なループBGM。塊魂リスペクトの軽快さを、ベース＋16分メロディで出す。
  // 先読みスケジューラで setTimeout の揺れを吸収する。
  startBgm() {
    if (!this.ctx || this.bgmOn) return;
    this.bgmOn = true;

    const bass = [130.81, 130.81, 174.61, 196.00];               // C C F G
    const mel = [
      523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880.00, 698.46,
      698.46, 880.00, 1046.50, 880.00, 783.99, 659.25, 587.33, 523.25,
    ];
    const bpm = 138, beat = 60 / bpm, sixteenth = beat / 4;
    const AHEAD = 0.2;

    this._step = 0;
    this._nextNoteTime = this.ctx.currentTime + 0.15;

    const loop = () => {
      if (!this.bgmOn) return;
      while (this._nextNoteTime < this.ctx.currentTime + AHEAD) {
        const s = this._step % 16;
        const mf = mel[s];
        if (mf) this._bgmNote(mf, sixteenth * 0.9, 'square', 0.05, this._nextNoteTime);
        if (s % 4 === 0) {
          this._bgmNote(bass[((this._step / 4) | 0) % 4], beat * 0.95, 'triangle', 0.09, this._nextNoteTime);
        }
        this._step++;
        this._nextNoteTime += sixteenth;
      }
      this._bgmTimer = setTimeout(loop, 45);
    };
    loop();
  }

  _bgmNote(freq, dur, type, vol, when) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(when); osc.stop(when + dur + 0.02);
  }

  stopBgm() { this.bgmOn = false; clearTimeout(this._bgmTimer); }
}
