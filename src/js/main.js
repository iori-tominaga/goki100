// エントリーポイント：状態・入力・描画を束ねてゲームループを回す。
//
// ここが「ゲーム本体」。描画は Renderer 型としてしか触らないので、
// ThreeRenderer を BabylonRenderer に差し替えるのはこの1行だけで済む。

import { GameState } from './game/state.js';
import { InputManager, isTouchDevice } from './game/input.js';
import { ThreeRenderer } from './render/ThreeRenderer.js';

const container = document.getElementById('game');

const state = new GameState();

const input = new InputManager();
const renderer = new ThreeRenderer(); // ← 将来ここを差し替えるだけで乗り換え可能
renderer.init(container, state);

// スマホなら仮想スティックを有効化（PCでは左半分がクリックを奪わないよう出さない）
if (isTouchDevice()) {
  input.attachStick(
    document.getElementById('stick-zone'),
    document.getElementById('stick-base'),
    document.getElementById('stick-knob')
  );
  document.getElementById('controls').innerHTML =
    '<span>左半分でスティック／右半分で視点／2本指でズーム</span>';
}

// HUD 更新（匹数と増殖ゲージ）
const countEl = document.getElementById('count');
const gaugeEl = document.getElementById('gauge-fill');
function updateHud() {
  countEl.textContent = `${state.count} / ${state.target}`;
  const ratio = Math.max(0, Math.min(1, state.gauge / state.gaugeMax));
  gaugeEl.style.width = `${ratio * 100}%`;
  gaugeEl.classList.toggle('hot', ratio > 0.8);
}
updateHud();

window.addEventListener('resize', () => renderer.resize());

// デバッグ用フック（描画検証で使用。ゲーム挙動には影響しない）
window.__goki = { state, renderer };

// 経過時間ベースのゲームループ（フレームレート非依存）
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); // 1フレーム最大50msに制限
  last = now;

  // 1) 入力 → カメラ基準の world ベクトルへ変換 → ゲームロジック更新
  if (!window.__pause) {
    const iv = input.getMoveVector();              // 画面基準（x=右, z=上で-1）
    const yaw = renderer.getCameraYaw();
    const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw); // 画面奥（カメラの向き）
    const rgtX = Math.cos(yaw),  rgtZ = -Math.sin(yaw); // 画面右
    const f = -iv.z, r = iv.x;
    const world = { x: fwdX * f + rgtX * r, z: fwdZ * f + rgtZ * r };
    state.update(world, dt);
    renderer.sync(state, dt);
    state.events.length = 0; // 描画へ渡し終えた出来事は毎フレーム捨てる
    updateHud();
  }

  // 2) 描画
  renderer.render();

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
