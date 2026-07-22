// ゲームの「中身」。Three.js を一切 import しない純粋なデータと更新ロジック。
// 描画側(Renderer)はこの state を読むだけ。だから将来レンダラを差し替えても
// このファイルは無傷で済む。

import {
  CONFIG, VARIANTS, ITEMS, GIANTS, FOODS,
  FURNITURE, PARTITIONS, SILLS,
} from './config.js';

let nextId = 1;

// ===== 矩形（回転あり）の当たり判定ヘルパー =====
// 家具も壁も「回転できる箱」で統一する。円だと辺に沿って歩けず、
// ソファや壁を丸く滑って避けてしまうため。

// world 座標 → 箱のローカル座標（箱の回転を打ち消す）
function boxLocal(o, x, z) {
  const dx = x - o.x, dz = z - o.z;
  const c = Math.cos(o.rotY), s = Math.sin(o.rotY);
  return { lx: dx * c + dz * s, lz: -dx * s + dz * c };
}

// 箱のローカル座標 → world 座標
function boxToWorld(o, lx, lz) {
  const c = Math.cos(o.rotY), s = Math.sin(o.rotY);
  return { x: o.x + lx * c - lz * s, z: o.z + lx * s + lz * c };
}

// 点が箱の footprint の内側か（margin だけ広げて判定できる）
function insideBox(o, x, z, margin = 0) {
  const { lx, lz } = boxLocal(o, x, z);
  return Math.abs(lx) <= o.w / 2 + margin && Math.abs(lz) <= o.d / 2 + margin;
}

// 半径 rr の円が箱にめり込んでいたら、押し出した座標と面の法線を返す。
// 当たっていなければ null。
function boxResolve(o, x, z, rr) {
  const { lx, lz } = boxLocal(o, x, z);
  const hw = o.w / 2, hd = o.d / 2;
  const cx = Math.max(-hw, Math.min(hw, lx));
  const cz = Math.max(-hd, Math.min(hd, lz));
  let ox = lx - cx, oz = lz - cz;
  let dist = Math.hypot(ox, oz);
  let nlx, nlz;

  if (dist < 1e-6) {
    // 円の中心が箱の内部にある：一番近い面へ逃がす
    const ex = hw - Math.abs(lx), ez = hd - Math.abs(lz);
    if (ex <= ez) {
      const sx = lx >= 0 ? 1 : -1;
      ox = sx; oz = 0; nlx = sx * (hw + rr); nlz = lz;
    } else {
      const sz = lz >= 0 ? 1 : -1;
      ox = 0; oz = sz; nlx = lx; nlz = sz * (hd + rr);
    }
  } else if (dist >= rr) {
    return null; // 当たっていない
  } else {
    ox /= dist; oz /= dist;
    nlx = cx + ox * rr; nlz = cz + oz * rr;
  }

  const w = boxToWorld(o, nlx, nlz);
  // 面の外向き法線を world へ（回転のみ適用）
  const c = Math.cos(o.rotY), s = Math.sin(o.rotY);
  return { x: w.x, z: w.z, nx: ox * c - oz * s, nz: ox * s + oz * c, lx, lz };
}

// 箱の障害物を1つ作る。rotY 省略時は 0。
function makeBox(src, top, climbable) {
  return {
    x: src.x, z: src.z, w: src.w, d: src.d,
    rotY: src.rotY || 0, top, climbable,
  };
}

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

// 部屋の外周壁を4枚の箱として作る。壁も家具と同じ「箱」に統一することで、
// 壁専用の登り処理を持たなくて済む（＝分岐が減ってバグりにくい）。
function buildWalls() {
  const { width, depth, wallThickness: t } = CONFIG.house;
  const hw = width / 2, hd = depth / 2;
  return [
    { x: 0, z: -hd - t / 2, w: width + t * 2, d: t },  // 奥
    { x: 0, z: hd + t / 2, w: width + t * 2, d: t },   // 手前
    { x: -hw - t / 2, z: 0, w: t, d: depth + t * 2 },  // 左
    { x: hw + t / 2, z: 0, w: t, d: depth + t * 2 },   // 右
  ];
}

// 生活小物（塊魂味の特大ガラクタ）を家具の隙間に散らす。
// 間取りの家具だけだと整然としすぎるので、散らかり感を足す役目。
function generateProps(blockers) {
  const props = [];
  const { width, depth } = CONFIG.house;
  const count = 10;

  let attempts = 0;
  while (props.length < count && attempts < 400) {
    attempts++;

    const kind = pickItemKind();
    const scaleXZ = 0.6 + Math.random() * 0.5;
    const scaleY = 0.6 + Math.random() * 0.5;
    const dim = dimsOf(kind, scaleXZ, scaleY);
    const margin = dim.foot / 2 + 1.5;

    const x = (Math.random() * 2 - 1) * (width / 2 - margin);
    const z = (Math.random() * 2 - 1) * (depth / 2 - margin);

    if (Math.hypot(x, z) < 6) continue; // スポーン地点を空ける
    if (blockers.some((b) => insideBox(b, x, z, dim.foot / 2 + 1))) continue;
    if (props.some((p) => Math.hypot(p.x - x, p.z - z) < (p.foot + dim.foot) / 2 + 1)) continue;

    props.push({
      id: nextId++, kind, x, z, rotY: Math.random() * Math.PI * 2,
      scaleXZ, scaleY, foot: dim.foot, top: dim.top, climbable: true,
    });
  }
  return props;
}

// 特大の人間（障害物・登れない）。間取りに合わせた定位置に立たせる／座らせる。
function generateGiants() {
  return [
    { id: nextId++, kind: 'homeowner', x: 6.5, z: -4.0, rotY: Math.PI * 0.75, radius: GIANTS.homeowner.radius },
    { id: nextId++, kind: 'grandma',   x: -14.5, z: 9.5, rotY: -Math.PI * 0.25, radius: GIANTS.grandma.radius },
  ];
}

export class GameState {
  constructor() {
    this.target = CONFIG.targetCount;
    this.gauge = 0;
    this.phase = 0;

    // --- 間取り（描画側にもそのまま渡す）---
    this.furniture = FURNITURE;
    this.partitions = PARTITIONS;
    this.sills = SILLS;
    this.walls = buildWalls();
    this.giants = generateGiants();

    // 家具・壁を箱の障害物へ。これらを避けて生活小物を散らす。
    const structure = [
      ...this.walls.map((w) => makeBox(w, CONFIG.house.wallHeight, true)),
      ...this.partitions.map((w) => makeBox(w, CONFIG.house.wallHeight, true)),
      ...this.furniture.map((f) => makeBox(f, f.h, true)),
      ...this.sills.map((s) => makeBox(s, s.h, true)),
      ...this.giants.map((g) => makeBox(
        { x: g.x, z: g.z, w: g.radius * 2, d: g.radius * 2, rotY: g.rotY },
        GIANTS[g.kind].height * 0.9, false
      )),
    ];
    this.props = generateProps(structure);

    // 箱の障害物（登り・立ち・押し出しに使う）。top と climbable を持つ。
    this.obstacles = [
      ...structure,
      ...this.props.map((p) => makeBox(
        { x: p.x, z: p.z, w: p.foot * 0.85, d: p.foot * 0.85, rotY: p.rotY }, p.top, true
      )),
    ];

    // 侵入してきた最初の1匹（プレイヤー操作）。y と登り状態を持つ。
    this.roaches = [{
      id: nextId++, x: 0, y: 0, z: 0, angle: 0, variant: pickVariant(), isPlayer: true,
      mode: 'ground', vy: 0, climbRef: null, climbY: 0, climbNormalAngle: 0,
      climbAxis: 'x', climbSign: 1, climbLat: 0,
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
      id: nextId++, x: CONFIG.house.width * 0.3, z: -CONFIG.house.depth * 0.3,
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
    const hx = CONFIG.house.width / 2 - 2, hz = CONFIG.house.depth / 2 - 2;
    let x = 0, z = 0;
    for (let i = 0; i < 80; i++) {
      x = (Math.random() * 2 - 1) * hx;
      z = (Math.random() * 2 - 1) * hz;
      if (Math.hypot(x, z) < keepFromSpawn) continue;
      // 家具の footprint に埋もれた位置は避ける（低い家具の上なら乗ってもよい）
      const blocked = this.obstacles.some(
        (o) => o.top > CONFIG.physics.stepHeight && insideBox(o, x, z, CONFIG.roach.radius + 0.5)
      );
      if (!blocked) break;
    }
    return { x, z };
  }

  addRoach(x = 0, z = 0, variant = pickVariant(), preview = false) {
    const roach = {
      id: nextId++, x, y: 0, z, angle: 0, variant, preview, isPlayer: false,
      mode: 'ground', vy: 0, climbRef: null, climbY: 0, climbNormalAngle: 0,
      climbAxis: 'x', climbSign: 1, climbLat: 0,
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
      const edgeX = CONFIG.house.width / 2 - 5, edgeZ = CONFIG.house.depth / 2 - 5;
      if (Math.abs(cat.x) > edgeX || Math.abs(cat.z) > edgeZ) {
        cat.wanderAngle = Math.atan2(-cat.x, -cat.z) + (Math.random() - 0.5);
      }
      dirX = Math.sin(cat.wanderAngle); dirZ = Math.cos(cat.wanderAngle);
    }

    // 移動（猫は大きいので、背の高い家具にだけぶつかる簡易版）
    cat.angle = Math.atan2(dirX, dirZ);
    let nx = cat.x + dirX * c.speed * dt;
    let nz = cat.z + dirZ * c.speed * dt;
    for (const o of this.obstacles) {
      if (o.top < 6) continue; // 低い家具はまたぐ
      const hit = boxResolve(o, nx, nz, c.radius);
      if (hit) { nx = hit.x; nz = hit.z; }
    }
    const boundX = CONFIG.house.width / 2 - c.radius;
    const boundZ = CONFIG.house.depth / 2 - c.radius;
    cat.x = Math.max(-boundX, Math.min(boundX, nx));
    cat.z = Math.max(-boundZ, Math.min(boundZ, nz));

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
        const edgeX = CONFIG.house.width / 2 - 3, edgeZ = CONFIG.house.depth / 2 - 3;
        if (Math.abs(r.x) > edgeX || Math.abs(r.z) > edgeZ) {
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
      if (o.top - r.y <= stepHeight) continue;   // 低い段は歩いて乗る
      const hit = boxResolve(o, nx, nz, rr);     // 高い家具は面に沿って滑る
      if (hit) { nx = hit.x; nz = hit.z; }
    }

    const boundX = CONFIG.house.width / 2 - rr;
    const boundZ = CONFIG.house.depth / 2 - rr;
    r.x = Math.max(-boundX, Math.min(boundX, nx));
    r.z = Math.max(-boundZ, Math.min(boundZ, nz));

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
      const stepUp = o.top - p.y;
      if (stepUp <= stepHeight) continue;         // 低い→歩いて乗る（A）
      const hit = boxResolve(o, newX, newZ, rr);
      if (!hit) continue;

      // 高い→よじ登る（C）。ただし「その面へ向かって進んでいる」時だけ掴む。
      // 向きを見ずに掴むと、降りた直後（面のすぐ際に居る）に再取り付きして
      // 二度と抜け出せなくなる。離れる向きの入力は必ず素通りさせること。
      if (o.climbable && len > 0.001 && p.climbCooldown <= 0) {
        const facing = -(nx * hit.nx + nz * hit.nz); // 面の法線と逆向き＝押し込んでいる
        if (facing > grabDot) { this._startClimb(p, o, hit); return; }
      }
      newX = hit.x; newZ = hit.z;                 // 掴まない→面に沿って滑る
    }

    const boundX = CONFIG.house.width / 2 - rr;
    const boundZ = CONFIG.house.depth / 2 - rr;
    newX = Math.max(-boundX, Math.min(boundX, newX));
    newZ = Math.max(-boundZ, Math.min(boundZ, newZ));
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
      if (!insideBox(o, x, z)) continue;
      if (o.top <= curY + CONFIG.physics.stepHeight + 0.05) h = Math.max(h, o.top);
    }
    return h;
  }

  // 掴んだ面を記録して登りモードへ。面は箱のローカル軸で持つ（±X面か±Z面）。
  _startClimb(p, o, hit) {
    const hw = o.w / 2, hd = o.d / 2;
    // ローカル座標での「はみ出し量」が大きい方が、実際にぶつかった面。
    const overX = Math.abs(hit.lx) - hw;
    const overZ = Math.abs(hit.lz) - hd;

    p.mode = 'climb'; p.climbRef = o; p.vy = 0;
    p.climbY = Math.max(p.y, 0);
    if (overX >= overZ) {
      p.climbAxis = 'x';
      p.climbSign = hit.lx >= 0 ? 1 : -1;
      p.climbLat = Math.max(-hd, Math.min(hd, hit.lz)); // 面に沿った位置
    } else {
      p.climbAxis = 'z';
      p.climbSign = hit.lz >= 0 ? 1 : -1;
      p.climbLat = Math.max(-hw, Math.min(hw, hit.lx));
    }
    this._applyClimbPose(p);
  }

  // 面の情報から world 座標・姿勢を求めて反映する。
  _applyClimbPose(p) {
    const o = p.climbRef;
    const rr = CONFIG.roach.radius;
    const hw = o.w / 2, hd = o.d / 2;
    const gap = rr * 0.4;

    let lx, lz, nlx, nlz;
    if (p.climbAxis === 'x') {
      lx = p.climbSign * (hw + gap); lz = p.climbLat;
      nlx = p.climbSign; nlz = 0;
    } else {
      lx = p.climbLat; lz = p.climbSign * (hd + gap);
      nlx = 0; nlz = p.climbSign;
    }
    const w = boxToWorld(o, lx, lz);
    p.x = w.x; p.z = w.z; p.y = p.climbY;

    // 面の外向き法線を world 角度へ（描画の姿勢もこれを使う）
    const c = Math.cos(o.rotY), s = Math.sin(o.rotY);
    const nx = nlx * c - nlz * s, nz = nlx * s + nlz * c;
    p.climbNormalAngle = Math.atan2(nz, nx);
    p.angle = p.climbNormalAngle;
  }

  // --- 登りモード：画面基準で「上へ倒す＝登る／下へ倒す＝降りる」 ---
  //
  // 面の法線から上下を決める方式はやめた。物の周りを回り込むと法線が回転し、
  // 同じ入力の意味が変わってしまうため（＝操作がぐちゃぐちゃになる原因）。
  // 画面の前後入力をそのまま昇降に対応させれば、どこに張り付いていても意味は不変。
  _updateClimb(p, v, dt) {
    const o = p.climbRef;
    const rr = CONFIG.roach.radius;
    const cs = CONFIG.roach.climbSpeed;
    const hw = o.w / 2, hd = o.d / 2;
    const halfLen = p.climbAxis === 'x' ? hd : hw; // 面の横幅の半分

    // 左右：カメラの右方向に近い側へ進む＝「右に倒せば画面の右へ動く」
    const c = Math.cos(o.rotY), s = Math.sin(o.rotY);
    const tlx = p.climbAxis === 'x' ? 0 : 1;       // 面に沿ったローカル接線
    const tlz = p.climbAxis === 'x' ? 1 : 0;
    const tX = tlx * c - tlz * s, tZ = tlx * s + tlz * c;
    const side = (tX * v.rightX + tZ * v.rightZ) >= 0 ? 1 : -1;

    p.climbY = Math.max(0, Math.min(o.top, p.climbY + v.fwd * cs * dt));
    p.climbLat = Math.max(-halfLen, Math.min(halfLen, p.climbLat + side * v.right * cs * dt));
    this._applyClimbPose(p);

    if (p.climbY >= o.top - 0.02) {
      // 上端 → 天面に立つ（面から内側へ半径分入った位置）
      const lx = p.climbAxis === 'x' ? p.climbSign * Math.max(0, hw - rr) : p.climbLat;
      const lz = p.climbAxis === 'x' ? p.climbLat : p.climbSign * Math.max(0, hd - rr);
      const w = boxToWorld(o, lx, lz);
      p.mode = 'ground'; p.y = o.top; p.vy = 0;
      p.x = w.x; p.z = w.z;
      p.climbCooldown = CONFIG.physics.grabCooldown;
    } else if (p.climbY <= 0.02) {
      // 地面 → 面から半径分の外まで押し出してから離す（際で離すと即再取り付きする）
      const lx = p.climbAxis === 'x' ? p.climbSign * (hw + rr + 0.05) : p.climbLat;
      const lz = p.climbAxis === 'x' ? p.climbLat : p.climbSign * (hd + rr + 0.05);
      const w = boxToWorld(o, lx, lz);
      p.mode = 'ground'; p.y = 0; p.vy = 0;
      p.x = w.x; p.z = w.z;
      p.climbCooldown = CONFIG.physics.grabCooldown;
    }
  }
}
