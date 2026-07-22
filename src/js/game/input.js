// キーボード／タッチ入力を「移動ベクトル」に変換するだけの係。
// 描画にもゲームロジックにも依存しない。

// タッチ主体の端末か（スマホ・タブレット）。仮想スティックの出し分けに使う。
export function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

export class InputManager {
  constructor() {
    this.keys = new Set();
    // 仮想スティックの状態（触れていなければ active=false）
    this.stick = { active: false, x: 0, z: 0, pointerId: null };

    this._onDown = (e) => {
      const k = this._normalize(e.key);
      if (k) {
        this.keys.add(k);
        // 矢印キーでのスクロールを防ぐ
        if (k.startsWith('arrow')) e.preventDefault();
      }
    };
    this._onUp = (e) => {
      const k = this._normalize(e.key);
      if (k) this.keys.delete(k);
    };

    window.addEventListener('keydown', this._onDown);
    window.addEventListener('keyup', this._onUp);
    // フォーカスが外れたら押しっぱなし状態をリセット
    window.addEventListener('blur', () => this.keys.clear());
  }

  _normalize(key) {
    switch (key) {
      case 'ArrowUp': case 'w': case 'W': return 'up';
      case 'ArrowDown': case 's': case 'S': return 'down';
      case 'ArrowLeft': case 'a': case 'A': return 'left';
      case 'ArrowRight': case 'd': case 'D': return 'right';
      default: return null;
    }
  }

  // 仮想スティックを有効化する。
  // zone   … 指を置ける領域（画面左半分の透明な div）
  // base   … 指を置いた位置に出るスティックの台座
  // knob   … 傾けた方向に動くつまみ
  // 指を置いた場所が原点になる「フローティング方式」。
  // 固定位置だと親指の位置が縛られて窮屈になるため。
  attachStick(zone, base, knob) {
    const origin = { x: 0, y: 0 };

    // つまみが台座からはみ出さない上限を、実際の要素サイズから計算する。
    // 目分量で決めるとサイズを変えた時に必ずズレる（＝以前はみ出していた）。
    const radiusOf = (el, fallback) => (el.offsetWidth || fallback) / 2;
    const limit = () => Math.max(10, radiusOf(base, 120) - radiusOf(knob, 56));

    const show = (x, y) => {
      base.style.left = knob.style.left = `${x}px`;
      base.style.top = knob.style.top = `${y}px`;
      base.style.opacity = knob.style.opacity = '1';
    };
    const hide = () => { base.style.opacity = knob.style.opacity = '0'; };

    zone.addEventListener('pointerdown', (e) => {
      if (this.stick.pointerId !== null) return; // 1本目の指だけ受け付ける
      this.stick.pointerId = e.pointerId;
      this.stick.active = true;
      origin.x = e.clientX; origin.y = e.clientY;
      show(e.clientX, e.clientY);
      zone.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stick.pointerId) return;
      const maxRadius = limit();
      let dx = e.clientX - origin.x;
      let dy = e.clientY - origin.y;
      const d = Math.hypot(dx, dy);
      if (d > maxRadius) { dx = (dx / d) * maxRadius; dy = (dy / d) * maxRadius; }
      // つまみを傾けた方向へ移動（見た目）。台座の内側に必ず収まる。
      knob.style.left = `${origin.x + dx}px`;
      knob.style.top = `${origin.y + dy}px`;
      // 画面基準のベクトルへ（上へ倒す＝奥＝-z）
      const k = Math.min(1, d / maxRadius);
      const len = Math.max(1e-4, Math.hypot(dx, dy));
      this.stick.x = (dx / len) * k;
      this.stick.z = (dy / len) * k;
      e.preventDefault();
    });

    // 指を離した合図を取りこぼすと入力が入りっぱなしになり、
    // ゴキが永遠に走り続ける。考えられる経路すべてで確実に止める。
    const release = (e) => {
      if (e && e.pointerId !== undefined && e.pointerId !== this.stick.pointerId) return;
      this.stick.pointerId = null;
      this.stick.active = false;
      this.stick.x = this.stick.z = 0;
      hide();
    };
    this._releaseStick = release;

    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      zone.addEventListener(type, release);
      // 領域の外で指を離した場合は zone にイベントが来ないので window でも受ける
      window.addEventListener(type, release);
    }
    // アプリ切り替え・着信などで画面から離れた時も必ず解除する
    window.addEventListener('blur', () => release());
    document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });

    zone.style.display = 'block';
    hide();
  }

  // 画面基準の移動ベクトルを返す。
  // 上=奥(-z)、下=手前(+z)、左=-x、右=+x。
  getMoveVector() {
    // スティックに触れている間はそちらを優先（キーボードと排他）
    if (this.stick.active) return { x: this.stick.x, z: this.stick.z };

    let x = 0;
    let z = 0;
    if (this.keys.has('up')) z -= 1;
    if (this.keys.has('down')) z += 1;
    if (this.keys.has('left')) x -= 1;
    if (this.keys.has('right')) x += 1;
    return { x, z };
  }
}
