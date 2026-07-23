// エントリーポイント：状態・入力・描画を束ねてゲームループを回す。
//
// ここが「ゲーム本体」。描画は Renderer 型としてしか触らないので、
// ThreeRenderer を BabylonRenderer に差し替えるのはこの1行だけで済む。

import { GameState } from './game/state.js';
import { InputManager, isTouchDevice } from './game/input.js';
import { ThreeRenderer } from './render/ThreeRenderer.js';
import { AudioManager } from './audio.js';

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
// 「つれていく／解散」ボタン（PCはスペースキーでも可）
const gatherBtn = document.getElementById('gather-btn');
input.attachActionButton(gatherBtn, () => state.toggleRecruit());

// --- 音（効果音＋BGM）---
const audio = new AudioManager();
// ブラウザの自動再生制限：最初のユーザー操作で音を有効化する
const unlockAudio = () => audio.unlock();
for (const ev of ['pointerdown', 'touchstart', 'keydown']) {
  window.addEventListener(ev, unlockAudio, { once: true });
}
// ミュートボタン
const muteBtn = document.getElementById('mute-btn');
const paintMute = () => { muteBtn.textContent = audio.muted ? '🔇' : '🔊'; };
paintMute();
muteBtn.addEventListener('click', () => { audio.unlock(); audio.toggleMute(); paintMute(); });

// HUD 更新（匹数と増殖ゲージ）
const countEl = document.getElementById('count');
const gaugeEl = document.getElementById('gauge-fill');
const dirtEl = document.getElementById('dirt-fill');
const missionEl = document.getElementById('mission');
const missionTextEl = document.getElementById('mission-text');
function updateHud() {
  countEl.textContent = `${state.count} / ${state.target}`;
  const ratio = Math.max(0, Math.min(1, state.gauge / state.gaugeMax));
  gaugeEl.style.width = `${ratio * 100}%`;
  gaugeEl.classList.toggle('hot', ratio > 0.8);
  dirtEl.style.width = `${Math.min(100, state.dirt)}%`;

  // ボタン：近くに未加入の仲間が居れば「つれていく」、隊列があれば「解散」
  const recruitable = state.recruitableCount();
  const following = state.recruitedCount;
  if (recruitable > 0) {
    gatherBtn.textContent = `つれていく
(${recruitable})`;
    gatherBtn.style.display = 'flex';
  } else if (following > 0) {
    gatherBtn.textContent = `解散
(${following})`;
    gatherBtn.style.display = 'flex';
  } else {
    gatherBtn.style.display = 'none';
  }

  const m = state.currentMission;
  if (!m) {
    missionTextEl.textContent = 'ミッション全達成！';
    missionEl.classList.add('done');
  } else {
    const progress = m.goal ? `（${Math.floor(m.progress)}/${m.goal}）` : '';
    missionTextEl.textContent = `${m.label}${progress} → よごれ +${m.dirt}`;
    missionEl.classList.remove('done');
  }
}
updateHud();

// 危険の出現・ミッション達成を数秒だけ知らせる
const toastEl = document.getElementById('toast');
const HAZARD_NAMES = {
  hoihoi: '🪤 ゴキブリホイホイが仕掛けられた！',
  cat: '🐱 飼い猫が気づいた！',
  roomba: '🤖 ルンバが動き出した！',
  owner: '😠 家主が本気になった！',
  spider: '🕷 家蜘蛛が寄ってきた！',
};
let toastTimer = null;
function showToast(text, danger) {
  toastEl.textContent = text;
  toastEl.classList.toggle('danger', !!danger);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}
// state のイベント → 効果音
const SFX_FOR = {
  pickup: 'pickup', spawn: 'spawn', hatch: 'hatch', death: 'death',
  mission: 'mission', recruit: 'recruit', nested: 'nested',
  hazardAppear: 'danger', oothecaAppear: 'hatch',
  swipe: 'swipe', ownerSlam: 'swipe', ownerSpray: 'spray', spray: 'spray',
};
function handleNotices() {
  for (const ev of state.events) {
    const sfx = SFX_FOR[ev.type];
    if (sfx) audio.sfx(sfx);
    if (ev.type === 'hazardAppear' && HAZARD_NAMES[ev.name]) showToast(HAZARD_NAMES[ev.name], true);
    else if (ev.type === 'mission') showToast(`🎯 ${ev.label} 達成！ 家が汚れた（+${ev.dirt}） 餌が${ev.foods}個に`, false);
    else if (ev.type === 'oothecaAppear') showToast('🥚 卵鞘が出現した！ 急いで取りに行こう', false);
    else if (ev.type === 'hatch') showToast(`🥚 卵鞘が孵化！ ${ev.count}匹増えた`, false);
    else if (ev.type === 'recruit') showToast(`🐜 ${ev.count}匹を引き連れた！ 巣の穴へ運ぼう`, false);
    else if (ev.type === 'nested') showToast('🕳 仲間が巣に潜った（安全）', false);
  }
}

// --- 画面サイズ追従 ---
// スマホのブラウザはURLバーが出入りするたびに見える高さが変わる。
// resize だけでは取りこぼすので visualViewport も監視し、
// さらに回転直後は値が確定していないことがあるので少し遅らせて測り直す。
function refreshSize() {
  renderer.resize();
}
window.addEventListener('resize', refreshSize);
window.addEventListener('orientationchange', () => {
  refreshSize();
  setTimeout(refreshSize, 300);
});
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', refreshSize);
}

// --- 決着表示（全滅／100匹達成） ---
const resultEl = document.getElementById('result');
document.getElementById('result-retry').addEventListener('click', () => location.reload());
let resultShown = false;

function checkResult() {
  const won = state.count >= state.target;
  // 決着していなければ引っ込める（復帰した場合に出しっぱなしにしない）
  if (!state.gameOver && !won) {
    if (resultShown) { resultEl.hidden = true; resultShown = false; }
    return;
  }
  if (resultShown) return;

  resultShown = true;
  audio.sfx(won ? 'win' : 'lose');
  audio.stopBgm();
  document.getElementById('result-icon').textContent = won ? '🎉' : '🪳';
  document.getElementById('result-title').textContent = won ? '100匹 達成！' : 'ぜんめつ…';
  document.getElementById('result-text').textContent = won
    ? 'この家はもうあなたのものですヌルフフ'
    : 'この家のゴキブリは絶えました';
  resultEl.hidden = false;
}

// デバッグ用フック（描画検証で使用。ゲーム挙動には影響しない）
window.__goki = { state, renderer, input };

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

    // 地上は world ベクトルで動くが、よじ登り中は「画面の前後＝昇降」を使う。
    // 面の向きから昇降を決めると、回り込むたびに操作の意味が変わってしまうため。
    const move = {
      x: fwdX * f + rgtX * r, z: fwdZ * f + rgtZ * r, // world 基準（地上用）
      fwd: f, right: r,                               // 画面基準（登り用）
      rightX: rgtX, rightZ: rgtZ,                     // カメラ右ベクトル（左右の向き合わせ）
    };
    state.update(move, dt);
    renderer.sync(state, dt);
    handleNotices();
    state.events.length = 0; // 描画へ渡し終えた出来事は毎フレーム捨てる
    updateHud();
    checkResult();
  }

  // 2) 描画
  renderer.render();

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
