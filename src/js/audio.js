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
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.startBgm();
    }
    // 作りたての context は iOS/Safari では停止状態なので、
    // ユーザー操作の中で必ず resume する（これが無いとBGMが鳴らない）。
    if (this.ctx.state === 'suspended') this.ctx.resume();
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

  // 複数の周波数を滑らかに繋ぐ「うねり」音（鳴き声・悲鳴向け）。
  _glide(freqs, dur, type = 'sawtooth', vol = 0.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    const seg = dur / (freqs.length - 1);
    osc.frequency.setValueAtTime(freqs[0], t);
    for (let i = 1; i < freqs.length; i++) {
      osc.frequency.linearRampToValueAtTime(freqs[i], t + seg * i);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.setValueAtTime(vol, t + dur * 0.6);
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
    const min = { pickup: 0.05, spawn: 0.05, death: 0.05, swipe: 0.08, spray: 0.2, meow: 0.25, chitter: 0.3, scream: 0.5 }[name] || 0;
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
      // 生き物・人の声
      case 'meow':   this._glide([620, 1040, 900, 560], 0.4, 'sawtooth', 0.16); break;      // 子猫の鳴き声
      case 'chitter':for (let i = 0; i < 7; i++) this._blip(1700 + Math.random() * 700, 0.028, 'square', 0.07, i * 0.038); break; // 蜘蛛のカチカチ
      case 'scream': this._glide([780, 1180, 980, 1240, 760], 0.6, 'sawtooth', 0.2); break; // 家主の悲鳴
      default: break;
    }
  }

  // 懐かしい夏休み調のループBGM。
  // フリー素材「少年達の夏休み的なBGM」の“雰囲気”を参考にした自作曲で、
  // 楽曲そのものは使っていない（著作権を尊重し、単一ファイルのまま鳴らす）。
  // 王道進行（F→G→Em→Am）＋やわらかい三角波で、明るくも少し切なく。
  startBgm() {
    if (!this.ctx || this.bgmOn) return;
    this.bgmOn = true;

    // 4小節（各8個の8分音符 = 32ステップ）。0 は休符。
    const bass = [87.31, 98.00, 82.41, 110.00]; // F2 G2 E2 A2（小節ごと）
    const pad = [                                // 各小節の和音（低め・やわらかく）
      [174.61, 220.00, 261.63], // F: F3 A3 C4
      [196.00, 246.94, 293.66], // G: G3 B3 D4
      [164.81, 196.00, 246.94], // Em:E3 G3 B3
      [220.00, 261.63, 329.63], // Am:A3 C4 E4
    ];
    const lead = [
      523.25, 0, 587.33, 698.46, 0, 659.25, 587.33, 523.25, // F 小節
      587.33, 0, 659.25, 783.99, 0, 587.33, 493.88, 0,      // G 小節
      659.25, 587.33, 0, 493.88, 0, 440.00, 392.00, 0,      // Em 小節
      440.00, 0, 523.25, 659.25, 0, 587.33, 523.25, 493.88, // Am 小節
    ];

    const bpm = 100, beat = 60 / bpm, eighth = beat / 2;
    const AHEAD = 0.25;
    this._step = 0;
    this._nextNoteTime = this.ctx.currentTime + 0.2;

    const loop = () => {
      if (!this.bgmOn) return;
      while (this._nextNoteTime < this.ctx.currentTime + AHEAD) {
        const s = this._step % 32;   // 32個の8分で1ループ
        const bar = (s / 8) | 0;
        const t = this._nextNoteTime;

        // リード（8分）：あたたかい三角波
        const mf = lead[s];
        if (mf) this._bgmNote(mf, eighth * 1.6, 'triangle', 0.06, t);

        // 小節頭：ベースと和音パッド
        if (s % 8 === 0) {
          this._bgmNote(bass[bar], beat * 3.6, 'triangle', 0.08, t);
          for (const pf of pad[bar]) this._bgmNote(pf, beat * 3.6, 'sine', 0.035, t);
        }
        // 各拍でやさしいアルペジオ（和音の音を1つ）
        if (s % 2 === 0) {
          const pf = pad[bar][(s / 2) % pad[bar].length];
          this._bgmNote(pf * 2, eighth * 1.2, 'sine', 0.025, t);
        }

        this._step++;
        this._nextNoteTime += eighth;
      }
      this._bgmTimer = setTimeout(loop, 50);
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
