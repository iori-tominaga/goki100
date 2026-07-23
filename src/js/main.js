// エントリーポイント：ホーム → プレイ → 結果発表 → ホーム の画面遷移を束ね、
// プレイ中だけゲームループを回す。
//
// 描画は Renderer 型としてしか触らないので、ThreeRenderer を
// BabylonRenderer に差し替えるのは new する1行だけで済む。

import { GameState } from './game/state.js';
import { CONFIG } from './game/config.js';
import { InputManager, isTouchDevice } from './game/input.js';
import { ThreeRenderer } from './render/ThreeRenderer.js';
import { AudioManager } from './audio.js';

const container = document.getElementById('game');

// --- 永続化される入力・描画・音（ゲームをやり直しても使い回す）---
const input = new InputManager();
const renderer = new ThreeRenderer();
const audio = new AudioManager();

// ゲーム状態はプレイのたびに作り直す
let state = new GameState();
renderer.init(container, state);

// 画面フェーズ：'home' | 'playing' | 'result'
let phase = 'home';
let startTime = 0;
let clearSec = 0;
let resultShown = false;

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
input.attachActionButton(gatherBtn, () => { if (phase === 'playing') state.toggleRecruit(); });

// --- 音（最初のユーザー操作で解禁）---
for (const ev of ['pointerdown', 'touchstart', 'keydown']) {
  window.addEventListener(ev, () => audio.unlock(), { once: true });
}
const muteBtn = document.getElementById('mute-btn');
const paintMute = () => { muteBtn.textContent = audio.muted ? '🔇' : '🔊'; };
paintMute();
muteBtn.addEventListener('click', () => { audio.unlock(); audio.toggleMute(); paintMute(); });

// ===== 成績（localStorage に保存）=====
function loadRecords() {
  try { return JSON.parse(localStorage.getItem('goki-records')) || {}; } catch { return {}; }
}
function saveRecords(r) { try { localStorage.setItem('goki-records', JSON.stringify(r)); } catch {} }

function fmtTime(sec) {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// クリアタイム → 称号（速いほど上位）
function rankFor(sec) {
  for (const r of CONFIG.ranks) if (sec <= r.sec) return r;
  return CONFIG.ranks[CONFIG.ranks.length - 1];
}
function stars(n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }

// ===== ホーム画面 =====
const homeEl = document.getElementById('home');
function refreshHomeStats() {
  const rec = loadRecords();
  document.getElementById('stat-clears').textContent = rec.clears || 0;
  document.getElementById('stat-best').textContent = fmtTime(rec.bestSec);
  const rankTxt = rec.bestSec != null ? `${rankFor(rec.bestSec).name}` : '—';
  document.getElementById('stat-rank').textContent = rankTxt;
  document.getElementById('home-best').textContent =
    rec.bestSec != null ? `ベスト：${fmtTime(rec.bestSec)}` : 'ベスト：—';
}
function showHome() {
  phase = 'home';
  document.body.classList.remove('playing');
  homeEl.hidden = false;
  document.getElementById('result').hidden = true;
  refreshHomeStats();
  audio.startBgm();
}

// ===== ゲーム開始（新しいステージを立て直す）=====
function startGame() {
  state = new GameState();
  renderer.reset(state);
  window.__goki.state = state; // デバッグフックも差し替える
  resultShown = false;

  phase = 'playing';
  startTime = performance.now();
  document.body.classList.add('playing');
  homeEl.hidden = true;
  document.getElementById('result').hidden = true;

  audio.unlock();
  audio.startBgm();
  updateHud();
}

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('result-retry').addEventListener('click', startGame);
document.getElementById('result-home').addEventListener('click', showHome);

// ===== HUD =====
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
    gatherBtn.textContent = `つれていく\n(${recruitable})`;
    gatherBtn.style.display = 'flex';
  } else if (following > 0) {
    gatherBtn.textContent = `解散\n(${following})`;
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

// ===== トースト＆効果音 =====
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

// ===== 結果発表 =====
function showResult(won) {
  if (resultShown) return;
  resultShown = true;
  phase = 'result';
  document.body.classList.remove('playing');
  audio.sfx(won ? 'win' : 'lose');
  audio.stopBgm();

  const rankBox = document.getElementById('result-rank');
  const note = document.getElementById('result-note');

  if (won) {
    clearSec = (performance.now() - startTime) / 1000;
    const rank = rankFor(clearSec);
    document.getElementById('result-icon').textContent = rank.emoji || '🎉';
    document.getElementById('result-title').textContent = 'クリア！';
    document.getElementById('result-time').textContent = `タイム ${fmtTime(clearSec)}`;
    document.getElementById('rank-stars').textContent = stars(rank.stars);
    document.getElementById('rank-name').textContent = rank.name;
    rankBox.hidden = false;

    // 成績を更新（ベスト更新なら知らせる）
    const rec = loadRecords();
    rec.clears = (rec.clears || 0) + 1;
    let best = false;
    if (rec.bestSec == null || clearSec < rec.bestSec) { rec.bestSec = clearSec; best = true; }
    saveRecords(rec);
    note.textContent = best ? '🏆 自己ベスト更新！' : `ベスト ${fmtTime(rec.bestSec)}`;
  } else {
    document.getElementById('result-icon').textContent = '🪳';
    document.getElementById('result-title').textContent = 'ぜんめつ…';
    document.getElementById('result-time').textContent = 'この家のゴキブリは絶えた';
    rankBox.hidden = true;
    note.textContent = 'ホームからもう一度挑戦しよう';
  }
  document.getElementById('result').hidden = false;
}

// ===== 画面サイズ追従 =====
function refreshSize() { renderer.resize(); }
window.addEventListener('resize', refreshSize);
window.addEventListener('orientationchange', () => { refreshSize(); setTimeout(refreshSize, 300); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', refreshSize);

// デバッグ用フック（描画検証で使用。ゲーム挙動には影響しない）
window.__goki = { state, renderer, input, audio, startGame, showHome };

// 初期表示はホーム
showHome();

// ===== ゲームループ（フレームレート非依存）=====
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (phase === 'playing' && !window.__pause) {
    const iv = input.getMoveVector();
    const yaw = renderer.getCameraYaw();
    const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw);
    const rgtX = Math.cos(yaw), rgtZ = -Math.sin(yaw);
    const f = -iv.z, r = iv.x;
    const move = {
      x: fwdX * f + rgtX * r, z: fwdZ * f + rgtZ * r,
      fwd: f, right: r,
      rightX: rgtX, rightZ: rgtZ,
    };
    state.update(move, dt);
    renderer.sync(state, dt);
    handleNotices();
    state.events.length = 0;
    updateHud();

    if (state.cleared) showResult(true);
    else if (state.gameOver) showResult(false);
  } else if (phase === 'home') {
    // ホームでは家をゆっくり見回す（生きた背景）
    renderer.orbit.yaw += dt * 0.15;
    renderer._applyCamera();
  }

  renderer.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
