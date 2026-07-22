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
    // 集合（押している間だけ、近くの仲間が付いてくる）
    this.gathering = false;

    this._onDown = (e) => {
      if (e.key === ' ') { this.gathering = true; e.preventDefault(); }
      const k = this._normalize(e.key);
      if (k) {
        this.keys.add(k);
        // 矢印キーでのスクロールを防ぐ
        if (k.startsWith('arrow')) e.preventDefault();
      }
    };
    this._onUp = (e) => {
      if (e.key === ' ') this.gathering = false;
      const k = this._normalize(e.key);
      if (k) this.keys.delete(k);
    };

    window.addEventListener('keydown', this._onDown);
    window.addEventListener('keyup', this._onUp);
    // フォーカスが外れたら押しっぱなし状態をリセット
    window.addEventListener('blur', () => { this.keys.clear(); this.gathering = false; });
  }

  // 集合ボタンを有効化する。キーボードはスペースでも操作できる。
  attachGather(button) {
    const on = () => { this.gathering = true; button.classList.add('on'); };
    const off = () => { this.gathering = false; button.classList.remove('on'); };
    if ('ontouchstart' in window) {
      button.addEventListener('touchstart', (e) => { on(); e.preventDefault(); }, { passive: false });
      for (const el of [button, document]) {
        el.addEventListener('touchend', off, { passive: true });
        el.addEventListener('touchcancel', off, { passive: true });
      }
    } else {
      button.addEventListener('pointerdown', on);
      window.addEventListener('pointerup', off);
      window.addEventListener('pointercancel', off);
    }
    window.addEventListener('blur', off);
    button.style.display = 'flex';
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
  //
  // 指を置いた場所が原点になる「フローティング方式」。
  // 固定位置だと親指の位置が縛られて窮屈になるため。
  //
  // ※タッチ端末では Pointer Events ではなく Touch Events を使う。
  //   iOS Safari の setPointerCapture は指を離した通知を取りこぼすことがあり、
  //   その結果「離したのに走り続ける」状態になっていた。
  //   Touch Events なら touchstart した要素に以降のイベントが必ず届き、
  //   touches.length で「画面に残っている指の数」を直接確認できる。
  attachStick(zone, base, knob) {
    const origin = { x: 0, y: 0 };

    // つまみが台座からはみ出さない上限を、実際の要素サイズから計算する。
    // 目分量で決めるとサイズを変えた時に必ずズレる。
    const radiusOf = (el, fallback) => (el.offsetWidth || fallback) / 2;
    const limit = () => Math.max(10, radiusOf(base, 140) - radiusOf(knob, 56));

    const show = (x, y) => {
      base.style.left = knob.style.left = `${x}px`;
      base.style.top = knob.style.top = `${y}px`;
      base.style.opacity = knob.style.opacity = '1';
    };
    const hide = () => { base.style.opacity = knob.style.opacity = '0'; };

    const begin = (id, x, y) => {
      if (this.stick.pointerId !== null) return; // 1本目の指だけ受け付ける
      this.stick.pointerId = id;
      this.stick.active = true;
      origin.x = x; origin.y = y;
      show(x, y);
    };

    const drag = (x, y) => {
      const maxRadius = limit();
      let dx = x - origin.x;
      let dy = y - origin.y;
      const d = Math.hypot(dx, dy);
      if (d > maxRadius) { dx = (dx / d) * maxRadius; dy = (dy / d) * maxRadius; }
      knob.style.left = `${origin.x + dx}px`;   // 台座の内側に必ず収まる
      knob.style.top = `${origin.y + dy}px`;
      const k = Math.min(1, d / maxRadius);
      const len = Math.max(1e-4, Math.hypot(dx, dy));
      this.stick.x = (dx / len) * k;            // 上へ倒す＝奥＝-z
      this.stick.z = (dy / len) * k;
    };

    // 入力を必ず止める。取りこぼすと永遠に走り続けるので、
    // 疑わしい場面ではすべてここへ集約する。
    const release = () => {
      this.stick.pointerId = null;
      this.stick.active = false;
      this.stick.x = this.stick.z = 0;
      hide();
    };
    this._releaseStick = release;

    if ('ontouchstart' in window) {
      // --- タッチ端末（実機のスマホ）---
      const touchById = (list, id) => {
        for (const t of list) if (t.identifier === id) return t;
        return null;
      };

      zone.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0];
        if (!t) return;
        begin(t.identifier, t.clientX, t.clientY);
        e.preventDefault();
      }, { passive: false });

      zone.addEventListener('touchmove', (e) => {
        const t = touchById(e.touches, this.stick.pointerId);
        if (!t) return;
        drag(t.clientX, t.clientY);
        e.preventDefault();
      }, { passive: false });

      const touchEnd = (e) => {
        // 画面から指がすべて離れたら、識別子に関係なく必ず止める
        if (e.touches.length === 0) { release(); return; }
        // 自分の指が残っていなければ止める
        if (!touchById(e.touches, this.stick.pointerId)) release();
      };
      // 領域の外で離した場合に備え、document でも受ける
      for (const el of [zone, document]) {
        el.addEventListener('touchend', touchEnd, { passive: true });
        el.addEventListener('touchcancel', touchEnd, { passive: true });
      }
    } else {
      // --- マウス等（PCでの確認用）---
      zone.addEventListener('pointerdown', (e) => {
        begin(e.pointerId, e.clientX, e.clientY);
        e.preventDefault();
      });
      zone.addEventListener('pointermove', (e) => {
        if (e.pointerId !== this.stick.pointerId) return;
        drag(e.clientX, e.clientY);
      });
      for (const type of ['pointerup', 'pointercancel']) {
        zone.addEventListener(type, (e) => { if (e.pointerId === this.stick.pointerId) release(); });
        window.addEventListener(type, (e) => { if (e.pointerId === this.stick.pointerId) release(); });
      }
    }

    // アプリ切り替え・着信・画面を隠した時は、どの入力方式でも必ず解除する
    window.addEventListener('blur', release);
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
