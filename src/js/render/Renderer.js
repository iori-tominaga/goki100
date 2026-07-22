// 描画係の「共通インターフェース」（基底クラス）。
//
// ゲーム本体は、この Renderer 型のオブジェクトしか知らない。
// Three.js 版 = ThreeRenderer、将来の Babylon.js 版 = BabylonRenderer が
// このクラスを継承し、同じメソッドを実装する。
// こうしておけば main.js は new ThreeRenderer() を new BabylonRenderer() に
// 差し替えるだけで乗り換えられる。

export class Renderer {
  // 初期化：DOM 要素にキャンバスを差し込み、シーン/カメラ/ライトを用意する。
  // state を渡すのは、静的な家具などを最初に構築するため。
  init(container, state) {
    throw new Error('Renderer.init() を実装してください');
  }

  // 毎フレーム：state の内容を見た目へ反映する（位置・角度・増減など）。
  // dt は前フレームからの経過秒。カメラ追従などの補間に使う。
  sync(state, dt) {
    throw new Error('Renderer.sync() を実装してください');
  }

  // 実際に1フレーム描画する。
  render() {
    throw new Error('Renderer.render() を実装してください');
  }

  // ウィンドウリサイズ対応。
  resize() {
    throw new Error('Renderer.resize() を実装してください');
  }
}
