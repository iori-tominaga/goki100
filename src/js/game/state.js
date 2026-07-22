// ゲームの「中身」。Three.js を一切 import しない純粋なデータと更新ロジック。
// 描画側(Renderer)はこの state を読むだけ。だから将来レンダラを差し替えても
// このファイルは無傷で済む。

import { CONFIG, VARIANTS, ITEMS, GIANTS, FOODS } from './config.js';

let nextId = 1;

// 顔タイプを重み付きで抽選する。gokirea は weight が小さいのでレアに出る。
export function pickVariant() {
  const entries = Object.entries(VARIANTS);
  const total = entries.reduce((sum, [, v]) => sum + v.weight, 0);
  let r = Math.random() * total;
  for (const [key, v] of entries) {
    r -= v.weight;
    if (r <= 0) return key;
  }
  return entries[0][0];
}

// 生活小物の種類を重み付きで抽選（weight 0 の kind＝step 等は抽選されない）。
function pickItemKind() {
  const entries = Object.entries(ITEMS).filter(([, v]) => v.weight > 0);
  const total = entries.reduce((sum, [, v]) => sum + v.weight, 0);
  let r = Math.random() * total;
  for (const [key, v] of entries) {
    r -= v.weight;
    if (r <= 0) return key;
  }
  return entries[0][0];
}

// 餌の種類を重み付きで抽選。あめ玉（高得点）はレア寄り。
function pickFoodKind() {
  const entries = Object.entries(FOODS);
  const total = entries.reduce((sum, [, v]) => sum + v.weight, 0);
  let r = Math.random() * total;
  for (const [key, v] of entries) {
    r -= v.weight;
    if (r <= 0) return key;
  }
  return entries[0][0];
}

// kind と XZ/Y 倍率から実寸法を求める（描画・当たり判定の単一情報源）。
export function dimsOf(kind, scaleXZ, scaleY) {
  const it = ITEMS[kind];
  if (it.shape === 'cylinder') {
    const r = it.r * scaleXZ, h = it.h * scaleY;
    return { shape: 'cylinder', r, h, foot: r * 2, top: h };
  }
  const w = it.w * scaleXZ, h = it.h * scaleY, d = it.d * scaleXZ;
  return { shape: 'box', w, h, d, foot: Math.max(w, d), top: h };
}

// 歩いて登れる階段（A の要素）。低い段を並べ、自動ステップで上れる。
function generateStairs() {
  const steps = [];
  const baseX = -3, baseZ = 9;
  for (let i = 0; i < 4; i++) {
    const scaleY = (0.7 * (i + 1)) / ITEMS.step.h; // 天面高 = 0.7,1.4,2.1,2.8
    const scaleXZ = 1;
    const dim = dimsOf('step', scaleXZ, scaleY);
    steps.push({
      id: nextId++, kind: 'step', x: baseX + i * 3, z: baseZ,
      rotY: 0, scaleXZ, scaleY, foot: dim.foot, top: dim.top, climbable: true,
    });
  }
  return steps;
}

// 特大の生活小物（塊魂的なガラクタ）を配置。giants / stairs と重ならないよう避ける。
function generateProps(avoid) {
  const props = [];
  const half = CONFIG.house.halfSize;
  const count = 15;

  let attempts = 0;
  while (props.length < count && attempts < 500) {
    attempts++;

    const kind = pickItemKind();
    const scaleXZ = 0.8 + Math.random() * 0.7;
    const scaleY = 0.8 + Math.random() * 0.7;
    const dim = dimsOf(kind, scaleXZ, scaleY);
    const margin = dim.foot / 2 + 1;

    const x = (Math.random() * 2 - 1) * (half - margin);
    const z = (Math.random() * 2 - 1) * (half - margin);

    if (Math.hypot(x, z) < 7) continue; // スポーン地点を空ける
    if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < a.radius + dim.foot / 2 + 1)) continue;
    if (props.some((p) => Math.hypot(p.x - x, p.z - z) < (p.foot + dim.foot) / 2 + 0.5)) continue;

    props.push({
      id: nextId++, kind, x, z, rotY: Math.random() * Math.PI * 2,
      scaleXZ, scaleY, foot: dim.foot, top: dim.top, climbable: true,
    });
  }
  return props;
}

// 特大の人間（障害物・登れない）。家主とおばあちゃんを左右反対側に配置し中心を向かせる。
function generateGiants() {
  const half = CONFIG.house.halfSize;
  const giants = [];
  const layout = [['grandma', -1], ['homeowner', 1]];
  for (const [kind, side] of layout) {
    const g = GIANTS[kind];
    const x = side * (half * 0.5) + (Math.random() * 4 - 2);
    const z = (Math.random() * 2 - 1) * (half * 0.4);
    giants.push({ id: nextId++, kind, x, z, rotY: Math.atan2(-x, -z), radius: g.radius });
  }
  return giants;
}

export class GameState {
  constructor() {
    this.target = CONFIG.targetCount;
    this.gauge = 0;
    this.phase = 0;

    this.giants = generateGiants();
    this.stairs = generateStairs();
    const avoid = [
      ...this.giants.map((g) => ({ x: g.x, z: g.z, radius: g.radius })),
      ...this.stairs.map((s) => ({ x: s.x, z: s.z, radius: s.foot / 2 })),
    ];
    // props と stairs を合わせて「小物」とする（描画・当たり判定の両方で使う）
    this.props = [...generateProps(avoid), ...this.stairs];

    // 円形障害物（登り・立ち・押し出しに使う）。top と climbable を持つ。
    this.obstacles = [
      ...this.props.map((p) => ({ x: p.x, z: p.z, radius: (p.foot / 2) * 0.9, top: p.top, climbable: p.climbable })),
      ...this.giants.map((g) => ({ x: g.x, z: g.z, radius: g.radius, top: GIANTS[g.kind].height * 0.9, climbable: false })),
    ];

    // 侵入してきた最初の1匹（プレイヤー操作）。y と登り状態を持つ。
    this.roaches = [{
      id: nextId++, x: 0, y: 0, z: 0, angle: 0, variant: pickVariant(), isPlayer: true,
      mode: 'ground', vy: 0, climbRef: null, climbAngle: 0, climbY: 0, climbNormalAngle: 0,
      climbCooldown: 0,
      dying: 0, stuck: null,
    }];
    // 操作中の個体は id で覚える（死んだら仲間へ乗り移るため、配列の先頭固定にはできない）
    this.playerId = this.roaches[0].id;
    this.gameOver = false;

    // --- 危険（Phase 3）---
    // ゴキブリホイホイ：床に固定配置
    this.traps = [];
    for (let i = 0; i < CONFIG.hazards.hoihoi.count; i++) {
      const spot = this._randomFoodSpot(CONFIG.hazards.hoihoi.keepFromSpawn);
      this.traps.push({
        id: nextId++, x: spot.x, z: spot.z, radius: CONFIG.hazards.hoihoi.radius,
        filled: 0, refill: 0,
      });
    }
    // 飼い猫：徘徊しつつゴキを狩る
    this.cat = {
      id: nextId++, x: CONFIG.house.halfSize * 0.6, z: -CONFIG.house.halfSize * 0.6,
      angle: 0, wanderAngle: 0, wanderTimer: 0, swipeCd: 0, chasing: false, swipeAnim: 0,
    };
    // 家主のゴキジェット：予告 → 噴射 のサイクル
    this.spray = { phase: 'idle', timer: CONFIG.hazards.spray.interval, x: 0, z: 0 };

    // フロアに散らばる餌。拾うと非アクティブ化し、少し後に別地点へ復活する。
    this.foods = [];
    for (let i = 0; i < CONFIG.food.count; i++) {
      const spot = this._randomFoodSpot();
      this.foods.push({
        id: nextId++, kind: pickFoodKind(), x: spot.x, y: 0, z: spot.z,
        active: true, timer: 0, phase: Math.random() * Math.PI * 2,
      });
    }

    // 描画側へ渡す一過性の出来事（拾った・増えた）。sync 後に main.js がクリアする。
    // state 側は「何が起きたか」だけを伝え、演出の中身は知らない＝レンダラ差し替え可能。
    this.events = [];
  }

  // 次の1匹に必要なゲージ量。匹数が増えるほど少しずつ重くなる。
  get gaugeMax() {
    return CONFIG.gauge.base * Math.pow(1 + CONFIG.gauge.growth, this.count - 1);
  }

  // 障害物と重ならないフロア上の座標を探す（見つからなければ最後の候補を返す）。
  // keepFromSpawn … スポーン地点(原点)から最低限離す距離。
  // 罠は必ず指定すること：足元に置かれると開始直後に即死する。
  _randomFoodSpot(keepFromSpawn = 0) {
    const half = CONFIG.house.halfSize - 2;
    let x = 0, z = 0;
    for (let i = 0; i < 60; i++) {
      x = (Math.random() * 2 - 1) * half;
      z = (Math.random() * 2 - 1) * half;
      if (Math.hypot(x, z) < keepFromSpawn) continue;
      const blocked = this.obstacles.some(
        (o) => Math.hypot(o.x - x, o.z - z) < o.radius + CONFIG.roach.radius + 0.5
      );
      if (!blocked) break;
    }
    return { x, z };
  }

  addRoach(x = 0, z = 0, variant = pickVariant(), preview = false) {
    const roach = {
      id: nextId++, x, y: 0, z, angle: 0, variant, preview, isPlayer: false,
      mode: 'ground', vy: 0, climbRef: null, climbAngle: 0, climbY: 0, climbNormalAngle: 0,
      climbCooldown: 0,
      dying: 0, stuck: null,
    };
    this.roaches.push(roach);
    return roach;
  }

  // 死にかけ（仰向け演出中）はもう頭数に入れない＝HUD が即座に減って手応えが出る。
  get count() { return this.roaches.filter((r) => !r.preview && !r.dying).length; }
  get player() { return this.roaches.find((r) => r.id === this.playerId) || this.roaches[0]; }

  // 1フレーム分の進行。main.js はこれだけ呼べばよい。
  update(worldVec, dt) {
    this.updatePlayer(worldVec, dt);
    this._updateAI(dt);
    this._separateRoaches();
    this._updateFoods(dt);
    this._updateTraps(dt);
    this._updateCat(dt);
    this._updateSpray(dt);
    this._updateDying(dt);
  }

  // --- 死亡まわり ---
  // 死は「即消滅」ではなく dying カウントダウン。演出の時間を稼ぎつつ、
  // 頭数からは即座に外す（count ゲッタ参照）。
  _kill(roach, cause) {
    if (roach.dying || roach.preview) return;
    roach.dying = CONFIG.death.flipTime;
    roach.stuck = null;
    this.events.push({ type: 'death', x: roach.x, y: roach.y, z: roach.z, cause });
    if (roach.id === this.playerId) this._takeover(roach);
  }

  // プレイヤー個体が死んだら、一番近い仲間へ乗り移る。誰も居なければゲームオーバー。
  _takeover(dead) {
    dead.isPlayer = false;
    let best = Infinity, next = null;
    for (const r of this.roaches) {
      if (r.dying || r.preview || r.id === dead.id) continue;
      const d = Math.hypot(r.x - dead.x, r.z - dead.z);
      if (d < best) { best = d; next = r; }
    }
    if (!next) { this.gameOver = true; return; }
    this.playerId = next.id;
    next.isPlayer = true;
    next.ai = null; // AI を捨てて操作対象に戻す
    this.events.push({ type: 'takeover', x: next.x, y: next.y, z: next.z });
  }

  _updateDying(dt) {
    for (let i = this.roaches.length - 1; i >= 0; i--) {
      const r = this.roaches[i];
      if (!r.dying) continue;
      r.dying -= dt;
      if (r.dying > 0) continue;
      // 最後の1匹は死体として残す（カメラの寄る先が消えると破綻するため）
      if (this.roaches.length <= 1) { r.dying = 0.0001; continue; }
      this.roaches.splice(i, 1);
    }
    // 生きた個体が1匹も居なくなった時だけゲームオーバー（復活したら解除される）
    this.gameOver = !this.roaches.some((r) => !r.dying && !r.preview);
  }

  // --- ゴキブリホイホイ：踏むと粘着、数秒後に死亡。満員になると機能停止＆置き換え ---
  _updateTraps(dt) {
    const h = CONFIG.hazards.hoihoi;

    // 満員の罠は時間経過で家主が新品に交換（別の場所へ）
    for (const t of this.traps) {
      if (t.filled < h.capacity) continue;
      t.refill -= dt;
      if (t.refill > 0) continue;
      const spot = this._randomFoodSpot(h.keepFromSpawn);
      t.x = spot.x; t.z = spot.z; t.filled = 0;
      this.events.push({ type: 'trapReset', id: t.id, x: t.x, y: 0, z: t.z });
    }

    for (const r of this.roaches) {
      if (r.dying || r.preview) continue;
      if (r.stuck) {
        r.stuck.t -= dt;
        if (r.stuck.t > 0) continue;
        const trap = this.traps.find((t) => t.id === r.stuck.trapId);
        if (trap) {
          trap.filled++;
          // 交換タイマーは満員になった瞬間だけ開始する。
          // （既に粘着済みの個体が後から死んでもタイマーを延長させない）
          if (trap.filled === h.capacity) trap.refill = h.refillTime;
        }
        this._kill(r, 'hoihoi');
        continue;
      }
      if (r.y > 0.6) continue; // 家具の上に居るゴキは踏まない
      for (const t of this.traps) {
        if (t.filled >= h.capacity) continue; // 満員の罠はもう捕らえられない
        if (Math.hypot(r.x - t.x, r.z - t.z) > t.radius) continue;
        r.stuck = { t: h.stickTime, trapId: t.id };
        this.events.push({ type: 'stick', x: r.x, y: r.y, z: r.z });
        break;
      }
    }
  }

  // --- 飼い猫：徘徊 → 見つけたら追跡 → 前足で範囲攻撃 ---
  _updateCat(dt) {
    const c = CONFIG.hazards.cat;
    const cat = this.cat;
    cat.swipeCd -= dt;
    if (cat.swipeAnim > 0) cat.swipeAnim -= dt;

    // 一番近いゴキを探す（高い所へ逃げた個体は諦める＝登りが避難になる）
    let best = c.sightRadius, target = null;
    for (const r of this.roaches) {
      if (r.dying || r.preview || r.y > 1.5) continue;
      const d = Math.hypot(r.x - cat.x, r.z - cat.z);
      if (d < best) { best = d; target = r; }
    }
    cat.chasing = !!target;

    let dirX, dirZ;
    if (target) {
      const d = Math.max(1e-4, best);
      dirX = (target.x - cat.x) / d; dirZ = (target.z - cat.z) / d;
    } else {
      cat.wanderTimer -= dt;
      if (cat.wanderTimer <= 0) {
        cat.wanderTimer = c.wanderInterval * (0.5 + Math.random());
        cat.wanderAngle += (Math.random() * 2 - 1) * 1.4;
      }
      const edge = CONFIG.house.halfSize - 4;
      if (Math.abs(cat.x) > edge || Math.abs(cat.z) > edge) {
        cat.wanderAngle = Math.atan2(-cat.x, -cat.z) + (Math.random() - 0.5);
      }
      dirX = Math.sin(cat.wanderAngle); dirZ = Math.cos(cat.wanderAngle);
    }

    // 移動（家具は避けるが、猫は大きいので押し出しだけの簡易版）
    cat.angle = Math.atan2(dirX, dirZ);
    let nx = cat.x + dirX * c.speed * dt;
    let nz = cat.z + dirZ * c.speed * dt;
    for (const o of this.obstacles) {
      const dx = nx - o.x, dz = nz - o.z;
      const d = Math.hypot(dx, dz);
      const minD = o.radius + c.radius;
      if (d < minD && d > 1e-4) { nx = o.x + (dx / d) * minD; nz = o.z + (dz / d) * minD; }
    }
    const bound = CONFIG.house.halfSize - c.radius;
    cat.x = Math.max(-bound, Math.min(bound, nx));
    cat.z = Math.max(-bound, Math.min(bound, nz));

    // 猫パンチ：射程に入っていればクールダウン毎に範囲攻撃
    if (target && best < c.swipeRadius && cat.swipeCd <= 0) {
      cat.swipeCd = c.swipeInterval;
      cat.swipeAnim = 0.35;
      this.events.push({ type: 'swipe', x: cat.x, y: 0, z: cat.z });
      for (const r of this.roaches) {
        if (r.dying || r.preview || r.y > 1.5) continue;
        if (Math.hypot(r.x - cat.x, r.z - cat.z) < c.swipeRadius) this._kill(r, 'cat');
      }
    }
  }

  // --- 家主のゴキジェット：予告 → 噴射。狙いはゴキが居るあたり（理不尽）---
  _updateSpray(dt) {
    const s = CONFIG.hazards.spray;
    const sp = this.spray;
    sp.timer -= dt;
    if (sp.timer > 0) return;

    if (sp.phase === 'idle') {
      // 生きているゴキを1匹選び、その周辺を狙う
      const alive = this.roaches.filter((r) => !r.dying && !r.preview);
      if (!alive.length) { sp.timer = s.interval; return; }
      const mark = alive[Math.floor(Math.random() * alive.length)];
      sp.x = mark.x; sp.z = mark.z;
      sp.phase = 'warn';
      sp.timer = s.warning;
      this.events.push({ type: 'sprayWarn', x: sp.x, y: 0, z: sp.z, radius: s.radius });
      return;
    }

    // 噴射：範囲内は高さに関係なく全滅（壁を登って逃げても無駄）
    sp.phase = 'idle';
    sp.timer = s.interval;
    this.events.push({ type: 'spray', x: sp.x, y: 0, z: sp.z, radius: s.radius });
    for (const r of this.roaches) {
      if (r.dying || r.preview) continue;
      if (Math.hypot(r.x - sp.x, r.z - sp.z) < s.radius) this._kill(r, 'spray');
    }
  }

  // --- 仲間ゴキの自律AI ---
  // 視界に餌がなければふらふら徘徊、入ったら真っ直ぐ食いつく。
  // 登りはしない（プレイヤーの特権）。地上のみを歩き、低い段差だけ乗り越える。
  _updateAI(dt) {
    const a = CONFIG.ai;
    for (const r of this.roaches) {
      if (r.isPlayer || r.preview || r.dying || r.stuck) continue;
      if (!r.ai) r.ai = { wanderAngle: r.angle, timer: 0 };

      // 1) 一番近い餌を探す（視界内のみ）
      let best = a.sightRadius, tx = 0, tz = 0, seeking = false;
      for (const f of this.foods) {
        if (!f.active) continue;
        const d = Math.hypot(f.x - r.x, f.z - r.z);
        if (d < best) { best = d; tx = f.x; tz = f.z; seeking = true; }
      }

      // 2) 進む向きを決める
      let dirX, dirZ;
      if (seeking) {
        const d = Math.max(1e-4, Math.hypot(tx - r.x, tz - r.z));
        dirX = (tx - r.x) / d; dirZ = (tz - r.z) / d;
      } else {
        r.ai.timer -= dt;
        if (r.ai.timer <= 0) {
          r.ai.timer = a.wanderInterval * (0.5 + Math.random());
          r.ai.wanderAngle += (Math.random() * 2 - 1) * a.wanderTurn;
        }
        // 壁際まで来たら中心へ向き直す（隅で延々こすらないように）
        const edge = CONFIG.house.halfSize - 3;
        if (Math.abs(r.x) > edge || Math.abs(r.z) > edge) {
          r.ai.wanderAngle = Math.atan2(-r.x, -r.z) + (Math.random() - 0.5);
        }
        dirX = Math.sin(r.ai.wanderAngle); dirZ = Math.cos(r.ai.wanderAngle);
      }

      this._moveAI(r, dirX, dirZ, seeking ? a.seekSpeed : a.wanderSpeed, dt);
    }
  }

  // AI 個体の移動。障害物は「低ければ乗り、高ければ滑って回り込む」だけの簡易版。
  _moveAI(r, dirX, dirZ, speed, dt) {
    const rr = CONFIG.roach.radius;
    const { stepHeight, snapUp } = CONFIG.physics;
    r.angle = Math.atan2(dirX, dirZ);

    let nx = r.x + dirX * speed * dt;
    let nz = r.z + dirZ * speed * dt;

    for (const o of this.obstacles) {
      const dx = nx - o.x, dz = nz - o.z;
      const d = Math.hypot(dx, dz);
      const minD = o.radius + rr;
      if (d < minD) {
        if (o.top - r.y <= stepHeight) continue;                 // 低い段は歩いて乗る
        if (d > 1e-4) { nx = o.x + (dx / d) * minD; nz = o.z + (dz / d) * minD; } // 壁面に沿って滑る
      }
    }

    const bound = CONFIG.house.halfSize - rr;
    r.x = Math.max(-bound, Math.min(bound, nx));
    r.z = Math.max(-bound, Math.min(bound, nz));

    // 高さは足元へ素早く追従（AI は落下演出を持たない簡易版）
    const g = this._groundHeightAt(r.x, r.z, r.y);
    const maxStep = snapUp * dt;
    r.y += Math.max(-maxStep, Math.min(maxStep, g - r.y));
  }

  // 個体同士の押し合い。同じ餌に群がっても団子にならないよう軽く反発させる。
  _separateRoaches() {
    const rr = CONFIG.roach.radius;
    const minD = rr * CONFIG.ai.separation;
    // 粘着中・死亡中は押し合いから除外（トラップから押し出されたら台無し）
    const list = this.roaches.filter((r) => !r.preview && !r.dying && !r.stuck);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (Math.abs(a.y - b.y) > 1) continue; // 高さが違えば重ならない
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= minD || d < 1e-4) continue;
        const push = (minD - d) / 2;
        const ux = dx / d, uz = dz / d;
        // プレイヤーは押されない（操作感を濁らせないため）
        if (a.isPlayer) { b.x += ux * push * 2; b.z += uz * push * 2; }
        else if (b.isPlayer) { a.x -= ux * push * 2; a.z -= uz * push * 2; }
        else {
          a.x -= ux * push; a.z -= uz * push;
          b.x += ux * push; b.z += uz * push;
        }
      }
    }
  }

  // 餌の回収と再湧き。
  _updateFoods(dt) {
    for (const f of this.foods) {
      if (!f.active) {
        f.timer -= dt;
        if (f.timer <= 0) {
          const spot = this._randomFoodSpot();
          f.x = spot.x; f.z = spot.z; f.kind = pickFoodKind(); f.active = true;
        }
        continue;
      }
      // どのゴキでも拾える＝Phase 2 の自律AIもそのままこの判定に乗る。
      for (const r of this.roaches) {
        if (r.preview || r.dying) continue;
        if (Math.abs(r.y - f.y) > CONFIG.food.reachHeight) continue;
        if (Math.hypot(r.x - f.x, r.z - f.z) > CONFIG.food.pickupRadius + CONFIG.roach.radius) continue;
        this._collect(f, r);
        break;
      }
    }
  }

  _collect(food, roach) {
    food.active = false;
    food.timer = CONFIG.food.respawnDelay;
    this.gauge += FOODS[food.kind].value;
    this.events.push({ type: 'pickup', x: food.x, y: food.y, z: food.z, kind: food.kind });

    // 満タン分だけ増殖（高得点の餌で一気に2匹増えることもある）
    while (this.count < this.target && this.gauge >= this.gaugeMax) {
      this.gauge -= this.gaugeMax;
      this._breed(roach);
    }
    if (this.count >= this.target) this.gauge = 0;
  }

  // 親のそばに1匹湧かせる。Phase 2 でこの個体に自律AIが入る。
  _breed(parent) {
    const a = Math.random() * Math.PI * 2;
    const d = CONFIG.roach.radius * 3;
    const child = this.addRoach(parent.x + Math.cos(a) * d, parent.z + Math.sin(a) * d);
    child.y = parent.y;
    child.angle = a;
    this.events.push({ type: 'spawn', x: child.x, y: child.y, z: child.z, id: child.id });
    return child;
  }

  // worldVec はカメラ基準に変換済みの移動ベクトル（world 空間の {x,z}）。
  updatePlayer(worldVec, dt) {
    const p = this.player;
    if (!p || p.dying || p.stuck) return; // 粘着中・死亡中は動けない
    if (p.mode === 'climb') { this._updateClimb(p, worldVec, dt); return; }
    this._updateGround(p, worldVec, dt);
  }

  // --- 地上モード：移動・オートステップ・立ち・重力・登り開始 ---
  _updateGround(p, worldVec, dt) {
    const rr = CONFIG.roach.radius;
    const { stepHeight, gravity, snapUp, grabDot, grabCooldown } = CONFIG.physics;
    if (p.climbCooldown > 0) p.climbCooldown -= dt;
    const len = Math.hypot(worldVec.x, worldVec.z);
    let nx = 0, nz = 0;
    if (len > 0.001) { nx = worldVec.x / len; nz = worldVec.z / len; p.angle = Math.atan2(nx, nz); }

    const dist = CONFIG.roach.moveSpeed * dt;
    let newX = p.x + nx * dist;
    let newZ = p.z + nz * dist;

    for (const o of this.obstacles) {
      const dx = newX - o.x, dz = newZ - o.z;
      const d = Math.hypot(dx, dz);
      const minD = o.radius + rr;
      if (d < minD) {
        const stepUp = o.top - p.y;
        if (stepUp <= stepHeight) continue;          // 低い→歩いて乗る（A）

        // 高い→よじ登る（C）。ただし「その障害物へ向かって進んでいる」時だけ掴む。
        // 向きを見ずに掴むと、降りた直後（判定円の内側に居る）に再取り付きして
        // 二度と抜け出せなくなる。離れる向きの入力は必ず素通りさせること。
        if (o.climbable && len > 0.001 && p.climbCooldown <= 0) {
          const toX = o.x - p.x, toZ = o.z - p.z;
          const toLen = Math.hypot(toX, toZ) || 1;
          const facing = (nx * toX + nz * toZ) / toLen;
          if (facing > grabDot) { this._startClimb(p, o); return; }
        }
        if (d > 1e-4) { newX = o.x + (dx / d) * minD; newZ = o.z + (dz / d) * minD; } // 掴まない→ブロック
      }
    }

    // 壁：押し込んだら登る（降りた直後は掴み直さない）
    const bound = CONFIG.house.halfSize - rr;
    if (len > 0.001 && p.climbCooldown <= 0) {
      const wall = this._wallAt(newX, newZ, bound);
      if (wall) { this._startWallClimb(p, wall); return; }
    }
    newX = Math.max(-bound, Math.min(bound, newX));
    newZ = Math.max(-bound, Math.min(bound, newZ));
    p.x = newX; p.z = newZ;

    // 垂直：足元の高さへ。段差は素早く上り、宙に浮いたら重力で落下。
    const g = this._groundHeightAt(p.x, p.z, p.y);
    if (p.y < g) { p.y = Math.min(g, p.y + snapUp * dt); p.vy = 0; }
    else if (p.y > g) {
      p.vy -= gravity * dt;
      p.y += p.vy * dt;
      if (p.y <= g) { p.y = g; p.vy = 0; }
    }
  }

  // 足元の地面高：xz を含む天面のうち、今の高さから段差内で到達できる最大値。
  _groundHeightAt(x, z, curY) {
    let h = 0;
    for (const o of this.obstacles) {
      if (Math.hypot(x - o.x, z - o.z) < o.radius) {
        if (o.top <= curY + CONFIG.physics.stepHeight + 0.05) h = Math.max(h, o.top);
      }
    }
    return h;
  }

  _startClimb(p, o) {
    p.mode = 'climb'; p.climbRef = o; p.vy = 0;
    p.climbAngle = Math.atan2(p.z - o.z, p.x - o.x);
    p.climbY = Math.max(p.y, 0);
    p.climbNormalAngle = p.climbAngle;
  }

  _startWallClimb(p, wall) {
    p.mode = 'climb'; p.climbRef = wall; p.vy = 0;
    p.climbY = Math.max(p.y, 0);
    p.climbNormalAngle = wall.normalAngle;
  }

  // 押し込んだ境界の壁記述子を返す（なければ null）。
  _wallAt(newX, newZ, bound) {
    const over = [
      { v: newX - bound, wall: { wall: true, axis: 'x', sign: 1, top: CONFIG.house.wallHeight, normalAngle: Math.PI } },
      { v: -bound - newX, wall: { wall: true, axis: 'x', sign: -1, top: CONFIG.house.wallHeight, normalAngle: 0 } },
      { v: newZ - bound, wall: { wall: true, axis: 'z', sign: 1, top: CONFIG.house.wallHeight, normalAngle: -Math.PI / 2 } },
      { v: -bound - newZ, wall: { wall: true, axis: 'z', sign: -1, top: CONFIG.house.wallHeight, normalAngle: Math.PI / 2 } },
    ].filter((o) => o.v > 0).sort((a, b) => b.v - a.v);
    return over.length ? over[0].wall : null;
  }

  // --- 登りモード：画面基準で「上へ倒す＝登る／下へ倒す＝降りる」 ---
  //
  // 面の法線から上下を決める方式はやめた。物の周りを回り込むと法線が回転し、
  // 同じ入力の意味が変わってしまうため（＝操作がぐちゃぐちゃになる原因）。
  // 画面の前後入力をそのまま昇降に対応させれば、どこに張り付いていても意味は不変。
  _updateClimb(p, v, dt) {
    const o = p.climbRef;
    if (o.wall) { this._updateWallClimb(p, v, dt); return; }

    const rr = CONFIG.roach.radius;
    const cs = CONFIG.roach.climbSpeed;

    // 左右：カメラの右方向に近い側へ回る＝「右に倒せば画面の右へ動く」
    const tX = -Math.sin(p.climbAngle), tZ = Math.cos(p.climbAngle); // 反時計回りの接線
    const side = (tX * v.rightX + tZ * v.rightZ) >= 0 ? 1 : -1;

    p.climbY += v.fwd * cs * dt;
    p.climbAngle += side * v.right * (cs / Math.max(1, o.radius)) * dt;
    p.climbY = Math.max(0, Math.min(o.top, p.climbY));

    p.x = o.x + Math.cos(p.climbAngle) * (o.radius + rr * 0.4);
    p.z = o.z + Math.sin(p.climbAngle) * (o.radius + rr * 0.4);
    p.y = p.climbY;
    p.climbNormalAngle = p.climbAngle;
    p.angle = p.climbAngle;

    if (p.climbY >= o.top - 0.02) {
      // 上端 → 天面に立つ
      p.mode = 'ground'; p.y = o.top; p.vy = 0;
      const inR = Math.max(0, o.radius - rr);
      p.x = o.x + Math.cos(p.climbAngle) * inR;
      p.z = o.z + Math.sin(p.climbAngle) * inR;
      p.climbCooldown = CONFIG.physics.grabCooldown;
    } else if (p.climbY <= 0.02) {
      // 地面 → 判定円の外まで押し出してから離す（内側で離すと即再取り付きする）
      p.mode = 'ground'; p.y = 0; p.vy = 0;
      p.x = o.x + Math.cos(p.climbAngle) * (o.radius + rr + 0.05);
      p.z = o.z + Math.sin(p.climbAngle) * (o.radius + rr + 0.05);
      p.climbCooldown = CONFIG.physics.grabCooldown;
    }
  }

  _updateWallClimb(p, v, dt) {
    const w = p.climbRef;
    const rr = CONFIG.roach.radius;
    const cs = CONFIG.roach.climbSpeed;
    const bound = CONFIG.house.halfSize - rr;

    // 壁に沿った接線（部屋の内側から見て左右）をカメラの右向きに合わせる
    const nx = Math.cos(w.normalAngle), nz = Math.sin(w.normalAngle);
    const tX = -nz, tZ = nx;
    const side = (tX * v.rightX + tZ * v.rightZ) >= 0 ? 1 : -1;
    const slide = side * v.right * cs * dt; // 接線方向への移動量

    p.climbY = Math.max(0, Math.min(w.top, p.climbY + v.fwd * cs * dt));
    // 壁は軸に平行なので、接線成分はどちらか一方の軸にしか出ない
    if (w.axis === 'x') {
      p.x = w.sign * bound;
      p.z = Math.max(-bound, Math.min(bound, p.z + tZ * slide));
    } else {
      p.z = w.sign * bound;
      p.x = Math.max(-bound, Math.min(bound, p.x + tX * slide));
    }
    p.y = p.climbY;
    p.climbNormalAngle = w.normalAngle;

    if (p.climbY <= 0.02) {
      // 壁から離れて着地（壁の内側へ少し押し出す）
      p.mode = 'ground'; p.y = 0; p.vy = 0;
      p.x = Math.max(-bound + 0.05, Math.min(bound - 0.05, p.x + nx * 0.3));
      p.z = Math.max(-bound + 0.05, Math.min(bound - 0.05, p.z + nz * 0.3));
      p.climbCooldown = CONFIG.physics.grabCooldown;
    }
  }
}
