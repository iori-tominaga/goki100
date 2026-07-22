// Three.js による描画実装。Renderer インターフェースを満たす。
// ゲームロジックはここに一切依存しない（差し替え可能）。

import * as THREE from 'three';
import { Renderer } from './Renderer.js';
import {
  CONFIG, PALETTE, VARIANTS, ITEMS, GIANTS, FOODS, FLOOR_ZONES,
} from '../game/config.js';
import { makeItemMaterials } from './textures.js';

// 顔タイプごとの人間パーツ＋触角を組み付けた「頭アセンブリ」を返す。
// 中心=頭の中心、正面=+z、上=+y。直立キャラの首の上に載せて使う。
function buildFace(variant, R) {
  const head = new THREE.Group();
  const v = VARIANTS[variant] || VARIANTS.ojisan;
  const skinMat = new THREE.MeshStandardMaterial({ color: v.skin, roughness: 0.7 });
  const eyeMat  = new THREE.MeshStandardMaterial({ color: PALETTE.roachEye, roughness: 0.3 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.9 }); // 白髪
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 0.8 }); // 眉・口ひげ

  const isAlien = variant === 'gokirea';
  const headR = isAlien ? R * 0.6 : R * 0.52;
  head.userData.headR = headR;

  const skull = new THREE.Mesh(new THREE.SphereGeometry(headR, 20, 16), skinMat);
  skull.castShadow = true;
  if (isAlien) skull.scale.set(1.15, 1.25, 0.9);
  head.add(skull);

  const fz = headR * (isAlien ? 0.72 : 0.85); // 顔の前面 z

  if (isAlien) {
    // ゴキレア：大きな黒いアーモンド型の目
    const eyeGeo = new THREE.SphereGeometry(R * 0.2, 12, 12);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(sx * headR * 0.42, headR * 0.05, fz);
      eye.scale.set(0.6, 1.3, 0.5);
      eye.rotation.z = sx * 0.55;
      head.add(eye);
    }
  } else {
    // 人間の小さな目
    const eyeGeo = new THREE.SphereGeometry(R * 0.09, 8, 8);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(sx * headR * 0.4, headR * 0.05, fz);
      head.add(eye);
    }
  }

  if (variant === 'ojisan') {
    // 太い眉
    const browGeo = new THREE.BoxGeometry(R * 0.26, R * 0.07, R * 0.08);
    for (const sx of [-1, 1]) {
      const brow = new THREE.Mesh(browGeo, darkMat);
      brow.position.set(sx * headR * 0.4, headR * 0.32, fz * 0.98);
      brow.rotation.z = sx * -0.15;
      head.add(brow);
    }
    // 口ひげ
    const mustache = new THREE.Mesh(new THREE.BoxGeometry(R * 0.42, R * 0.1, R * 0.1), darkMat);
    mustache.position.set(0, -headR * 0.42, fz * 0.98);
    head.add(mustache);
    // ハゲ頭の横に残った髪
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.SphereGeometry(R * 0.17, 8, 8), darkMat);
      side.position.set(sx * headR * 0.92, 0, -headR * 0.1);
      side.scale.set(0.5, 0.85, 1);
      head.add(side);
    }
  } else if (variant === 'obaasan') {
    // 白髪のお団子
    const bun = new THREE.Mesh(new THREE.SphereGeometry(R * 0.36, 12, 12), hairMat);
    bun.position.set(0, headR * 1.05, -headR * 0.3);
    head.add(bun);
    // 頭を覆う白髪
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(headR * 1.04, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      hairMat
    );
    head.add(cap);
    // 丸メガネ
    const glassGeo = new THREE.TorusGeometry(R * 0.14, R * 0.028, 8, 16);
    for (const sx of [-1, 1]) {
      const gl = new THREE.Mesh(glassGeo, darkMat);
      gl.position.set(sx * headR * 0.4, headR * 0.05, fz);
      head.add(gl);
    }
  }
  // gokirea はキモかわ優先で口などは付けずシンプルに。
  // ※触角は「殻が覆う」新デザインでは殻の上に付けるため、createRoachMesh 側で生成する。

  return head;
}

// 進行方向(+z)を向いた「二足歩行キモかわゴキブリ（着ぐるみ）」を Group で返す。
// gokisample 参考：大きな殻(carapace)が背中〜頭上を覆い、人間の顔が前から覗く。
// 人間の腕・脚（手足つき）で直立し、腕脚はピボット付きで歩行スイング可能。
function createRoachMesh(variant) {
  const g = new THREE.Group();

  const bodyMat  = new THREE.MeshStandardMaterial({ color: PALETTE.roachBody, roughness: 0.55 });
  const shellMat = new THREE.MeshStandardMaterial({ color: PALETTE.roachShell, roughness: 0.45 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0xcaa06a, roughness: 0.7 });
  const skinMat  = new THREE.MeshStandardMaterial({ color: (VARIANTS[variant] || VARIANTS.ojisan).skin, roughness: 0.7 });

  const R = CONFIG.roach.radius;

  // 各部の寸法
  const legLen    = R * 0.9;
  const armLen    = R * 0.95;
  const hipY      = legLen;
  const shellCY   = hipY + R * 1.15;   // 殻の中心高さ
  const shoulderY = hipY + R * 1.1;
  const hipX      = R * 0.3;
  const shoulderX = R * 0.62;

  // 大きな殻（背中〜頭上を覆うカラペイス）＝体の主役。前は開けて人間の顔を見せる。
  const shellY = shellCY + R * 0.1;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 22, 18), shellMat);
  shell.scale.set(1.4, 1.4, 1.35);
  shell.position.set(0, shellY, -R * 0.85);   // 後ろに寄せる
  shell.castShadow = true;
  g.add(shell);

  // 殻の背中の合わせ目（羽の筋）
  const seam = new THREE.Mesh(new THREE.BoxGeometry(R * 0.07, R * 0.03, R * 1.9), bodyMat);
  seam.position.set(0, shellY + R * 0.55, -R * 0.85);
  g.add(seam);

  // お腹（前面の明るい前身頃＝人間の胴）
  const belly = new THREE.Mesh(new THREE.SphereGeometry(R * 0.8, 18, 14), bellyMat);
  belly.scale.set(0.95, 1.25, 0.7);
  belly.position.set(0, hipY + R * 0.8, R * 0.55);
  belly.castShadow = true;
  g.add(belly);

  // 人間の顔（殻の前から前方へ覗く）
  const head = buildFace(variant, R);
  head.position.set(0, hipY + R * 1.3, R * 0.85);
  g.add(head);

  // 大きな触角（殻の上・前寄りから2本、外に開いて先が前へ垂れる）
  for (const sx of [-1, 1]) {
    const antenna = new THREE.Group();
    const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.04, R * 0.055, R * 1.2, 6), shellMat);
    seg1.position.y = R * 0.6;
    antenna.add(seg1);
    const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.02, R * 0.038, R * 1.0, 6), shellMat);
    seg2.position.set(0, R * 1.2 + R * 0.4, R * 0.3);
    seg2.rotation.x = 0.95; // 先端が前へ垂れる
    antenna.add(seg2);
    antenna.position.set(sx * R * 0.35, shellY + R * 0.85, -R * 0.1);
    antenna.rotation.z = sx * 0.4;
    antenna.rotation.x = -0.25;   // 少し後ろへ
    g.add(antenna);
  }

  // ゴキの脚（殻の左右から生える茶脚、3対）
  for (const sx of [-1, 1]) {
    let i = 0;
    for (const zz of [0.6, 0.0, -0.6]) {
      const gleg = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.04, R * 0.02, R * 0.95, 6), shellMat);
      gleg.position.set(sx * R * 0.72, shellCY - R * 0.55, zz * R);
      gleg.rotation.z = sx * (1.15 + i * 0.05);
      gleg.rotation.x = zz > 0 ? -0.5 : zz < 0 ? 0.5 : 0;
      g.add(gleg);
      i++;
    }
  }

  // お尻の尾毛（尾突起）2本
  for (const sx of [-1, 1]) {
    const cercus = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.02, R * 0.05, R * 0.5, 6), shellMat);
    cercus.position.set(sx * R * 0.2, hipY + R * 0.15, -R * 0.95);
    cercus.rotation.x = -1.0;
    cercus.rotation.z = sx * 0.2;
    g.add(cercus);
  }

  // 腕・脚のピボット生成（上端で回転 → 前後スイング）。end='hand'|'foot' で人間の手足を付ける。
  function makeLimb(len, radius, end) {
    const pivot = new THREE.Group();
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.85, len, 8), skinMat);
    limb.position.y = -len / 2;
    limb.castShadow = true;
    pivot.add(limb);
    if (end === 'foot') {
      // 人間の足（前方に伸びる）
      const foot = new THREE.Mesh(new THREE.BoxGeometry(R * 0.16, R * 0.1, R * 0.34), skinMat);
      foot.position.set(0, -len - R * 0.02, R * 0.1);
      foot.castShadow = true;
      pivot.add(foot);
    } else {
      // 人間の手（軽く潰した楕円）
      const hand = new THREE.Mesh(new THREE.SphereGeometry(R * 0.12, 10, 8), skinMat);
      hand.scale.set(1, 1.15, 0.65);
      hand.position.y = -len - R * 0.05;
      pivot.add(hand);
    }
    return pivot;
  }

  const leftLeg  = makeLimb(legLen, R * 0.12, 'foot');
  const rightLeg = makeLimb(legLen, R * 0.12, 'foot');
  leftLeg.position.set(-hipX, hipY, R * 0.05);
  rightLeg.position.set(hipX, hipY, R * 0.05);
  g.add(leftLeg, rightLeg);

  const leftArm  = makeLimb(armLen, R * 0.09, 'hand');
  const rightArm = makeLimb(armLen, R * 0.09, 'hand');
  leftArm.position.set(-shoulderX, shoulderY, R * 0.2);
  rightArm.position.set(shoulderX, shoulderY, R * 0.2);
  leftArm.rotation.z = 0.25;   // 外に開く
  rightArm.rotation.z = -0.25;
  g.add(leftArm, rightArm);

  g.userData = {
    displayAngle: 0,
    prevX: null, prevZ: null,   // 移動量算出用（初回は sync で初期化）
    walkPhase: 0, walkAmt: 0,   // 歩行スイングの位相と強さ
    torso: shell, torsoBaseY: shellY,
    head, headBaseY: head.position.y,
    leftLeg, rightLeg, leftArm, rightArm,
  };
  return g;
}

// 特大の人間（障害物）を組み立てて Group で返す。塊魂風の簡素なブロック体。
// 正面 = +z（配置側で中心を向くよう rotY を設定）。
function createGiantMesh(kind) {
  const spec = GIANTS[kind];
  const H = spec.height;
  const g = new THREE.Group();
  const skinMat  = new THREE.MeshStandardMaterial({ color: spec.skin, roughness: 0.8 });
  const clothMat = new THREE.MeshStandardMaterial({ color: spec.clothes, roughness: 0.85 });
  const hairMat  = new THREE.MeshStandardMaterial({ color: spec.hair, roughness: 0.9 });
  const eyeMat   = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 });

  // 頭グループ（中心=頭中心）に簡単な顔を付ける。
  function addFace(head, hr, opts = {}) {
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.12, 8, 8), eyeMat);
      eye.position.set(sx * hr * 0.4, hr * 0.1, hr * 0.92);
      head.add(eye);
      if (opts.glasses) {
        const gl = new THREE.Mesh(new THREE.TorusGeometry(hr * 0.22, hr * 0.04, 8, 16), eyeMat);
        gl.position.set(sx * hr * 0.4, hr * 0.1, hr * 0.92);
        head.add(gl);
      }
      if (opts.brows) {
        const brow = new THREE.Mesh(new THREE.BoxGeometry(hr * 0.38, hr * 0.1, hr * 0.1), hairMat);
        brow.position.set(sx * hr * 0.4, hr * 0.42, hr * 0.9);
        brow.rotation.z = sx * 0.3; // 怒り眉
        head.add(brow);
      }
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(hr * 0.5, hr * 0.09, hr * 0.1), eyeMat);
    mouth.position.set(0, -hr * 0.42, hr * 0.9);
    head.add(mouth);
  }

  if (spec.pose === 'standing') {
    const legH = H * 0.42, torsoH = H * 0.4, headR = H * 0.11;
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.8 });
    // 脚も股関節を支点にして歩行スイングできるようにする
    const legMeshes = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * H * 0.1, legH, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(H * 0.13, legH, H * 0.15), clothMat);
      leg.position.y = -legH / 2;
      leg.castShadow = true; pivot.add(leg);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(H * 0.14, H * 0.05, H * 0.22), shoeMat);
      shoe.position.set(0, -legH + H * 0.025, H * 0.05); pivot.add(shoe);
      g.add(pivot);
      legMeshes.push(pivot);
    }
    const torso = new THREE.Mesh(new THREE.BoxGeometry(H * 0.36, torsoH, H * 0.22), clothMat);
    torso.position.y = legH + torsoH / 2; torso.castShadow = true; g.add(torso);

    // 腕は肩を支点にした Group にする（振り上げ→振り下ろしを見せるため）
    const arms = {};
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * H * 0.24, legH + torsoH * 0.98, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(H * 0.09, torsoH * 0.95, H * 0.11), clothMat);
      arm.position.y = -torsoH * 0.475;
      arm.castShadow = true; pivot.add(arm);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(H * 0.1, H * 0.08, H * 0.11), skinMat);
      hand.position.y = -torsoH * 0.95;
      pivot.add(hand);
      g.add(pivot);
      arms[sx > 0 ? 'right' : 'left'] = pivot;

      if (sx > 0) {
        // 右手にスリッパ（叩く方）
        const slipper = new THREE.Group();
        const sole = new THREE.Mesh(
          new THREE.BoxGeometry(H * 0.16, H * 0.04, H * 0.3),
          new THREE.MeshStandardMaterial({ color: 0x5b7fd4, roughness: 0.8 })
        );
        sole.castShadow = true;
        slipper.add(sole);
        const strap = new THREE.Mesh(
          new THREE.BoxGeometry(H * 0.16, H * 0.07, H * 0.06),
          new THREE.MeshStandardMaterial({ color: 0x3f5ea8, roughness: 0.8 })
        );
        strap.position.set(0, H * 0.04, H * 0.07);
        slipper.add(strap);
        slipper.position.y = -torsoH * 1.05;
        pivot.add(slipper);
        arms.slipper = slipper;
      } else {
        // 左手にゴキジェットの缶（噴射する方）
        const can = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(H * 0.05, H * 0.05, H * 0.22, 10),
          new THREE.MeshStandardMaterial({ color: 0xd94f3a, roughness: 0.4, metalness: 0.3 })
        );
        body.castShadow = true;
        can.add(body);
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(H * 0.03, H * 0.03, H * 0.05, 8),
          new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.5 })
        );
        cap.position.y = H * 0.13;
        can.add(cap);
        can.position.y = -torsoH * 1.05;
        pivot.add(can);
        arms.can = can;
      }
    }
    g.userData.arms = arms;
    g.userData.legs = legMeshes;
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.BoxGeometry(headR * 2, headR * 2.2, headR * 1.9), skinMat);
    skull.castShadow = true; head.add(skull);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(headR * 2.1, headR * 0.7, headR * 2.0), hairMat);
    hair.position.y = headR * 0.95; head.add(hair);
    addFace(head, headR, { brows: true });
    head.position.y = legH + torsoH + headR * 1.05;
    g.add(head);
  } else {
    // 座り姿勢のおばあちゃん
    const bodyH = H * 0.62, headR = H * 0.14;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.28, H * 0.44, bodyH, 14), clothMat);
    body.position.y = bodyH / 2; body.castShadow = true; g.add(body);
    for (const sx of [-1, 1]) {
      const knee = new THREE.Mesh(new THREE.BoxGeometry(H * 0.16, H * 0.14, H * 0.32), clothMat);
      knee.position.set(sx * H * 0.18, H * 0.08, H * 0.3); knee.castShadow = true; g.add(knee);
    }
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.BoxGeometry(headR * 2, headR * 2.1, headR * 1.9), skinMat);
    skull.castShadow = true; head.add(skull);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.6, 10, 8), hairMat);
    bun.position.y = headR * 1.25; head.add(bun);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(headR * 1.06, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat
    );
    cap.position.y = headR * 0.2; head.add(cap);
    addFace(head, headR, { glasses: true });
    head.position.y = bodyH + headR * 0.9;
    g.add(head);
  }

  return g;
}

// 餌のメッシュ。config の shape ヒントだけを見てローポリの食べ残しを作る。
function createFoodMesh(kind) {
  const f = FOODS[kind];
  const s = f.size;
  const mat = new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.6 });
  const accentMat = new THREE.MeshStandardMaterial({ color: f.accent, roughness: 0.6 });
  const g = new THREE.Group();

  let body;
  switch (f.shape) {
    case 'chip': // 波打ったポテトチップス（薄い円盤を少し傾ける）
      body = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.5, s * 0.42, s * 0.12, 7), mat);
      body.rotation.set(0.5, 0, 0.25);
      break;
    case 'grain': // ごはん粒
      body = new THREE.Mesh(new THREE.SphereGeometry(s * 0.3, 10, 8), mat);
      body.scale.set(1, 0.75, 1.5);
      break;
    case 'crumb': // パンくず（ゴツゴツした塊）
      body = new THREE.Mesh(new THREE.DodecahedronGeometry(s * 0.36, 0), mat);
      break;
    case 'noodle': // 丸まった麺
      body = new THREE.Mesh(new THREE.TorusGeometry(s * 0.34, s * 0.13, 8, 14), mat);
      body.rotation.x = Math.PI / 2 - 0.3;
      break;
    case 'poison': { // 毒餌（ブラックキャップ）：明らかに「容器」と分かる見た目にする
      body = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.42, s * 0.46, s * 0.3, 6), mat);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.3, s * 0.3, s * 0.1, 6), accentMat);
      lid.position.y = s * 0.2;
      g.add(lid);
      for (const sx of [-1, 1]) { // 側面の入口スリット
        const slit = new THREE.Mesh(new THREE.BoxGeometry(s * 0.16, s * 0.12, s * 0.1), accentMat);
        slit.position.set(sx * s * 0.4, 0, 0);
        g.add(slit);
      }
      break;
    }
    default: // あめ玉（包み紙つき）
      body = new THREE.Mesh(new THREE.SphereGeometry(s * 0.34, 12, 10), mat);
      for (const sx of [-1, 1]) {
        const wrap = new THREE.Mesh(new THREE.ConeGeometry(s * 0.2, s * 0.26, 6), accentMat);
        wrap.position.x = sx * s * 0.44;
        wrap.rotation.z = sx * Math.PI / 2;
        g.add(wrap);
      }
      break;
  }
  body.castShadow = true;
  g.add(body);

  // 見つけやすくする足元の光の輪（塊魂的なポップさ）
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(s * 0.5, s * 0.68, 18),
    new THREE.MeshBasicMaterial({ color: f.accent, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -s * 0.45 + 0.03; // 群の原点が浮くので床へ下ろす
  g.add(halo);
  g.userData = { baseY: s * 0.45, halo };
  return g;
}

// ゴキブリホイホイ：黄色い家型の箱＋中の真っ黒な粘着面。
function createTrapMesh(radius) {
  const g = new THREE.Group();
  const r = radius;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(r * 2.2, r * 0.5, r * 2.2),
    new THREE.MeshStandardMaterial({ color: 0xffd93d, roughness: 0.7 })
  );
  base.position.y = r * 0.25;
  base.receiveShadow = true;
  g.add(base);

  // 粘着面（見るからにヤバい黒）
  const glue = new THREE.Mesh(
    new THREE.BoxGeometry(r * 1.8, r * 0.06, r * 1.8),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.25, metalness: 0.1 })
  );
  glue.position.y = r * 0.52;
  g.add(glue);

  // 入口のアーチ（家型の目印）
  for (const sz of [-1, 1]) {
    const arch = new THREE.Mesh(
      new THREE.BoxGeometry(r * 2.2, r * 0.7, r * 0.12),
      new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.7 })
    );
    arch.position.set(0, r * 0.85, sz * r * 1.05);
    g.add(arch);
  }
  g.userData = { glue }; // 捕獲数に応じて色と厚みを変えるため保持
  return g;
}

// 飼い猫：ローポリのポップな猫。前足を振り下ろすアニメ用に paw を userData に持つ。
function createCatMesh() {
  const g = new THREE.Group();
  const S = CONFIG.hazards.cat.radius; // 体格の基準
  const furMat  = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.85 });
  const spotMat = new THREE.MeshStandardMaterial({ color: 0xff9f1c, roughness: 0.85 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.4 });
  const pinkMat = new THREE.MeshStandardMaterial({ color: 0xff8fa3, roughness: 0.7 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(S * 0.85, 16, 12), furMat);
  body.scale.set(1, 0.85, 1.4);
  body.position.set(0, S * 0.8, -S * 0.3);
  body.castShadow = true;
  g.add(body);

  // 背中のぶち模様
  for (const p of [[0.3, 0.4], [-0.35, -0.2], [0.1, -0.7]]) {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(S * 0.3, 10, 8), spotMat);
    spot.scale.set(1, 0.35, 1);
    spot.position.set(p[0] * S, S * 1.45, (p[1] - 0.3) * S);
    g.add(spot);
  }

  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(S * 0.55, 16, 12), furMat);
  skull.castShadow = true;
  head.add(skull);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(S * 0.2, S * 0.36, 4), furMat);
    ear.position.set(sx * S * 0.3, S * 0.55, 0);
    head.add(ear);
    // 半目の意地悪そうな目
    const eye = new THREE.Mesh(new THREE.SphereGeometry(S * 0.11, 10, 8), darkMat);
    eye.position.set(sx * S * 0.24, S * 0.08, S * 0.46);
    eye.scale.set(1, 0.6, 1);
    head.add(eye);
    // ひげ
    const whisker = new THREE.Mesh(new THREE.BoxGeometry(S * 0.5, S * 0.02, S * 0.02), darkMat);
    whisker.position.set(sx * S * 0.35, -S * 0.12, S * 0.45);
    head.add(whisker);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(S * 0.09, S * 0.12, 4), pinkMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -S * 0.05, S * 0.56);
  head.add(nose);
  head.position.set(0, S * 1.15, S * 0.75);
  g.add(head);

  // しっぽ
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.09, S * 0.13, S * 1.3, 8), furMat);
  tail.position.set(0, S * 1.2, -S * 1.5);
  tail.rotation.x = -0.9;
  g.add(tail);

  // 前足（猫パンチで振り下ろす方）
  const paw = new THREE.Group();
  const foreleg = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.14, S * 0.16, S * 0.9, 8), furMat);
  foreleg.position.y = -S * 0.45;
  paw.add(foreleg);
  const pad = new THREE.Mesh(new THREE.SphereGeometry(S * 0.2, 10, 8), furMat);
  pad.position.y = -S * 0.9;
  paw.add(pad);
  paw.position.set(S * 0.4, S * 0.95, S * 0.55);
  g.add(paw);

  // もう片方の前足（固定）
  const paw2 = paw.clone();
  paw2.position.x = -S * 0.4;
  g.add(paw2);

  // 後ろ足
  for (const sx of [-1, 1]) {
    const hind = new THREE.Mesh(new THREE.SphereGeometry(S * 0.3, 10, 8), furMat);
    hind.position.set(sx * S * 0.5, S * 0.32, -S * 0.9);
    g.add(hind);
  }

  g.userData = { paw };
  return g;
}

// 家具1つ分のメッシュ。style ごとに作り分ける。
// 原点は「床に置いた時の中心・底面」＝ y=0 が床。
function createFurnitureMesh(f) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.85 });
  const accent = new THREE.MeshStandardMaterial({ color: f.accent, roughness: 0.8 });
  const hw = f.w / 2, hd = f.d / 2;

  const block = (w, h, d, x, y, z, m = mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };

  switch (f.style) {
    case 'table': {
      // 天板＋4本脚（脚の間はゴキが通り抜けられそうに見えるのが狙い）
      const topH = f.h * 0.12;
      block(f.w, topH, f.d, 0, f.h - topH / 2, 0);
      const legW = Math.min(f.w, f.d) * 0.12;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        block(legW, f.h - topH, legW, sx * (hw - legW), (f.h - topH) / 2, sz * (hd - legW), accent);
      }
      break;
    }
    case 'chair': {
      const seatH = f.h * 0.55;
      block(f.w, f.h * 0.12, f.d, 0, seatH, 0);              // 座面
      block(f.w, f.h * 0.75, f.d * 0.14, 0, seatH + f.h * 0.38, -hd + f.d * 0.07, accent); // 背もたれ
      const legW = Math.min(f.w, f.d) * 0.14;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        block(legW, seatH, legW, sx * (hw - legW), seatH / 2, sz * (hd - legW), accent);
      }
      break;
    }
    case 'sofa': {
      block(f.w, f.h * 0.5, f.d, 0, f.h * 0.25, 0);                       // 座面
      block(f.w, f.h * 0.55, f.d * 0.3, 0, f.h * 0.72, -hd + f.d * 0.15, accent); // 背もたれ
      for (const sx of [-1, 1]) {                                          // 肘掛け
        block(f.w * 0.08, f.h * 0.28, f.d, sx * (hw - f.w * 0.04), f.h * 0.62, 0, accent);
      }
      break;
    }
    case 'counter': {
      block(f.w, f.h, f.d, 0, f.h / 2, 0);
      block(f.w * 0.98, f.h * 0.06, f.d * 0.98, 0, f.h, 0, accent);        // 天板の縁
      const sink = new THREE.Mesh(new THREE.CylinderGeometry(f.d * 0.3, f.d * 0.3, f.h * 0.1, 16), accent);
      sink.position.set(f.w * 0.22, f.h + 0.05, 0);                        // シンク
      g.add(sink);
      break;
    }
    case 'cabinet': {
      block(f.w, f.h, f.d, 0, f.h / 2, 0);
      // 扉の合わせ目
      block(f.w * 0.03, f.h * 0.9, f.d * 0.02, 0, f.h / 2, hd, accent);
      for (const sx of [-1, 1]) {
        block(f.w * 0.06, f.h * 0.02, f.d * 0.04, sx * f.w * 0.12, f.h * 0.55, hd, accent); // 取っ手
      }
      break;
    }
    case 'tv': {
      block(f.w, f.h, f.d, 0, f.h / 2, 0);                                 // テレビ台
      const screen = new THREE.Mesh(
        new THREE.BoxGeometry(f.w * 0.8, f.h * 2.2, f.d * 0.25),
        new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.25 })
      );
      screen.position.set(0, f.h + f.h * 1.1, -hd * 0.2);
      screen.castShadow = true;
      g.add(screen);
      break;
    }
    case 'rack': {
      // ハンガーラック：支柱2本＋横バー＋ぶら下がった服
      const postW = 0.6;
      for (const sx of [-1, 1]) block(postW, f.h, postW, sx * (hw - postW), f.h / 2, 0, accent);
      block(f.w, 0.5, 0.5, 0, f.h - 0.4, 0, accent);
      for (let i = 0; i < 6; i++) {
        const cloth = block(f.w * 0.1, f.h * 0.45, f.d * 0.8, -hw + f.w * (0.12 + i * 0.15), f.h * 0.5, 0);
        cloth.material = new THREE.MeshStandardMaterial({
          color: [0x4a6fa5, 0xd94f3a, 0xf0f0f0, 0x3ba55d, 0xffd93d, 0x6c5ce7][i], roughness: 0.9,
        });
      }
      break;
    }
    case 'curtain': {
      // 波打つカーテン（薄い板を並べる）
      const n = 8;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1) - 0.5;
        const panel = block(f.w * 0.7, f.h, f.d / n * 0.9, Math.sin(i * 1.7) * f.w * 0.15, f.h / 2, t * f.d);
        panel.material = i % 2 ? accent : mat;
      }
      break;
    }
    case 'bin': {
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(f.w * 0.5, f.w * 0.4, f.h, 12), mat);
      bin.position.y = f.h / 2;
      bin.castShadow = true;
      g.add(bin);
      block(f.w * 1.05, f.h * 0.08, f.d * 1.05, 0, f.h, 0, accent); // フタの縁
      break;
    }
    case 'plant': {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(f.w * 0.4, f.w * 0.3, f.h * 0.35, 10), mat);
      pot.position.y = f.h * 0.175;
      pot.castShadow = true;
      g.add(pot);
      for (let i = 0; i < 5; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(f.w * 0.22, f.h * 0.7, 5), accent);
        leaf.position.set(Math.cos(i * 1.3) * f.w * 0.2, f.h * 0.6, Math.sin(i * 1.3) * f.w * 0.2);
        leaf.rotation.z = Math.cos(i * 1.3) * 0.35;
        leaf.rotation.x = -Math.sin(i * 1.3) * 0.35;
        leaf.castShadow = true;
        g.add(leaf);
      }
      break;
    }
    default:
      block(f.w, f.h, f.d, 0, f.h / 2, 0);
      block(f.w * 1.01, f.h * 0.08, f.d * 1.01, 0, f.h * 0.75, 0, accent);
      break;
  }
  return g;
}

// ルンバ：黒い円盤＋天面のボタン。回転する様子が分かるよう目印を付ける。
function createRoombaMesh() {
  const R = CONFIG.hazards.roomba.radius;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.5 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xc0c4cc, roughness: 0.4, metalness: 0.3 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.95, R * 0.45, 24), bodyMat);
  body.position.y = R * 0.25;
  body.castShadow = true;
  g.add(body);

  const top = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.45, R * 0.45, R * 0.12, 20), trimMat);
  top.position.y = R * 0.5;
  g.add(top);

  // 前方のバンパー（進行方向が分かる目印）
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(R * 1.5, R * 0.28, R * 0.25), trimMat);
  bumper.position.set(0, R * 0.25, R * 0.85);
  g.add(bumper);

  // 側面のブラシ
  for (const sx of [-1, 1]) {
    const brush = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.28, R * 0.28, R * 0.08, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd93d, roughness: 0.8 }));
    brush.position.set(sx * R * 0.7, R * 0.06, R * 0.6);
    g.add(brush);
  }
  return g;
}

// 家蜘蛛：小さくて速い捕食者。脚は歩行に合わせて上下させる。
function createSpiderMesh() {
  const S = CONFIG.hazards.spider.radius;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b2d2b, roughness: 0.7 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff3b3b, roughness: 0.3 });

  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(S * 0.9, 12, 10), bodyMat);
  abdomen.scale.set(1, 0.8, 1.2);
  abdomen.position.set(0, S * 0.9, -S * 0.5);
  abdomen.castShadow = true;
  g.add(abdomen);

  const head = new THREE.Mesh(new THREE.SphereGeometry(S * 0.55, 10, 8), bodyMat);
  head.position.set(0, S * 0.85, S * 0.7);
  g.add(head);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(S * 0.12, 6, 6), eyeMat);
    eye.position.set(sx * S * 0.22, S * 0.95, S * 1.05);
    g.add(eye);
  }

  // 8本脚（歩行アニメ用に保持）
  const legs = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.07, S * 0.04, S * 1.5, 5), bodyMat);
      leg.position.set(sx * S * 0.7, -S * 0.2, 0);
      leg.rotation.z = sx * 1.0;
      pivot.add(leg);
      pivot.position.set(0, S * 0.85, (1.5 - i) * S * 0.45);
      g.add(pivot);
      legs.push({ pivot, phase: i * 0.8 + (sx > 0 ? Math.PI : 0) });
    }
  }
  g.userData = { legs };
  return g;
}

export class ThreeRenderer extends Renderer {
  init(container, state) {
    this.width = container.clientWidth;
    this.height = container.clientHeight;

    // スマホは GPU が非力なので、解像度と影の精度を落として滑らかさを優先する
    this.mobile = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

    this.renderer = new THREE.WebGLRenderer({ antialias: !this.mobile });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.5 : 2));
    this.renderer.setSize(this.width, this.height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.sky);

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.camera.fov, this.width / this.height, 0.1, 500
    );
    // オービットカメラの状態（ドラッグ回転・ホイールズームで変化）
    this.orbit = {
      yaw: CONFIG.camera.yaw,
      pitch: CONFIG.camera.pitch,
      distance: CONFIG.camera.distance,
    };
    this.followTarget = new THREE.Vector3(0, CONFIG.camera.lookAtHeight, 0);
    this._setupCameraControls();

    this._buildLights();
    this._buildHouse(state);
    this._buildFurniture(state);
    this._buildGiants(state);
    this._buildProps(state);
    this._buildHazards(state);

    // ゴキブリのメッシュ（id -> Group）
    this.roachMeshes = new Map();
    this._syncRoachMeshes(state);

    // 餌のメッシュ（id -> Group）と、一過性の演出リスト
    this.foodMeshes = new Map();
    this.foodKinds = new Map(); // 再湧きで種類が変わったら作り直すため
    this.effects = [];
    this.elapsed = 0;

    this._applyCamera(); // 初期配置
  }

  // マウスドラッグ／1本指スワイプで回転、ホイール／2本指ピンチでズーム。
  _setupCameraControls() {
    const el = this.renderer.domElement;
    const c = CONFIG.camera;
    const pointers = new Map(); // 同時に触れている指を追跡（ピンチ判定用）
    let pinchDist = 0;

    const clampZoom = (d) => Math.max(c.minDistance, Math.min(c.maxDistance, d));

    el.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      if (pointers.size === 2) pinchDist = this._pointerGap(pointers);
    });

    const release = (e) => {
      pointers.delete(e.pointerId);
      pinchDist = 0;
      try { el.releasePointerCapture(e.pointerId); } catch {}
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);

    el.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;

      if (pointers.size >= 2) {
        // ピンチ：2点間の距離の変化をズームに変換
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const gap = this._pointerGap(pointers);
        if (pinchDist > 0) this.orbit.distance = clampZoom(this.orbit.distance - (gap - pinchDist) * 0.05);
        pinchDist = gap;
        return;
      }

      // 1点：カメラ回転
      this.orbit.yaw -= (e.clientX - prev.x) * c.rotateSpeed;
      this.orbit.pitch = Math.max(
        c.minPitch,
        Math.min(c.maxPitch, this.orbit.pitch + (e.clientY - prev.y) * c.rotateSpeed)
      );
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.orbit.distance = clampZoom(this.orbit.distance + e.deltaY * c.zoomSpeed);
    }, { passive: false });
  }

  // 触れている最初の2点の距離（ピンチ量の算出用）
  _pointerGap(pointers) {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // 移動をカメラ基準に変換するための水平角を返す（main.js が使用）。
  getCameraYaw() { return this.orbit.yaw; }

  _applyCamera() {
    const { yaw, pitch, distance } = this.orbit;
    const t = this.followTarget;
    const cp = Math.cos(pitch);
    this.camera.position.set(
      t.x + distance * cp * Math.sin(yaw),
      t.y + distance * Math.sin(pitch),
      t.z + distance * cp * Math.cos(yaw)
    );
    this.camera.lookAt(t);
    this._cullNearWalls();
  }

  // カメラが部屋の外へ回り込んだら、その壁を消す（ドールハウス方式）。
  // 壁で視界が塞がると何も見えなくなるため、手前だけ抜く。
  _cullNearWalls() {
    if (!this.wallMeshes) return;
    const c = this.camera.position;
    for (const w of this.wallMeshes) {
      // 壁から見てカメラが内側にあるか（内向き法線との内積が正なら室内側）
      const inside = (c.x - w.x) * w.nx + (c.z - w.z) * w.nz > 0;
      w.mesh.visible = inside;
    }
  }

  _buildLights() {
    // 陽気でフラットなトゥーン風の光（塊魂リスペクト）
    const hemi = new THREE.HemisphereLight(0xffffff, 0xffd9a0, 0.9);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(18, 30, 12);
    dir.castShadow = true;
    dir.shadow.mapSize.set(this.mobile ? 512 : 1024, this.mobile ? 512 : 1024);
    const s = Math.max(CONFIG.house.width, CONFIG.house.depth) / 2 + 8;
    dir.shadow.camera.left = -s;
    dir.shadow.camera.right = s;
    dir.shadow.camera.top = s;
    dir.shadow.camera.bottom = -s;
    dir.shadow.camera.far = 100;
    this.scene.add(dir);
  }

  // 間取りデータから部屋そのもの（床・ゾーン・壁・仕切り・敷居）を建てる。
  _buildHouse(state) {
    const { width, depth, wallHeight } = CONFIG.house;

    // フローリング
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color: PALETTE.floor, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 床の色分け（キッチンのタイル、ベランダ、ラグなど）
    for (const z of FLOOR_ZONES) {
      const geo = z.shape === 'circle'
        ? new THREE.CircleGeometry(z.w / 2, 32)
        : new THREE.PlaneGeometry(z.w, z.d);
      const patch = new THREE.Mesh(
        geo, new THREE.MeshStandardMaterial({ color: z.color, roughness: 0.95 })
      );
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(z.x, 0.02, z.z);
      patch.receiveShadow = true;
      this.scene.add(patch);
    }

    // フローリングの目地（板の継ぎ目）
    const lineMat = new THREE.LineBasicMaterial({ color: PALETTE.floorGrid, transparent: true, opacity: 0.35 });
    const pts = [];
    for (let x = -width / 2; x <= width / 2; x += 4) {
      pts.push(new THREE.Vector3(x, 0.05, -depth / 2), new THREE.Vector3(x, 0.05, depth / 2));
    }
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat));

    // 外周壁（カメラが外に出たら消せるよう、内向き法線と一緒に覚えておく）
    const wallMat = new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.9 });
    this.wallMeshes = [];
    for (const w of state.walls) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, wallHeight, w.d), wallMat);
      mesh.position.set(w.x, wallHeight / 2, w.z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      const len = Math.hypot(w.x, w.z) || 1;
      this.wallMeshes.push({ mesh, x: w.x, z: w.z, nx: -w.x / len, nz: -w.z / len }); // 内向き
    }

    // 仕切り壁（部屋の内側なので常に表示）
    for (const w of state.partitions) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, wallHeight, w.d), wallMat);
      mesh.position.set(w.x, wallHeight / 2, w.z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    // ベランダとの段差（サッシの敷居）
    const sillMat = new THREE.MeshStandardMaterial({ color: 0xb9b2a4, roughness: 0.8 });
    for (const s of state.sills) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), sillMat);
      mesh.position.set(s.x, s.h / 2, s.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  // 間取りの家具を配置
  _buildFurniture(state) {
    for (const f of state.furniture) {
      const mesh = createFurnitureMesh(f);
      mesh.position.set(f.x, 0, f.z);
      mesh.rotation.y = f.rotY || 0;
      this.scene.add(mesh);
    }
  }

  // 特大の生活小物（Canvasテクスチャ付き）を配置
  _buildProps(state) {
    for (const p of state.props) {
      const it = ITEMS[p.kind];
      let geo, h;
      if (it.shape === 'cylinder') {
        const r = it.r * p.scaleXZ;
        h = it.h * p.scaleY;
        geo = new THREE.CylinderGeometry(r, r, h, 20);
      } else {
        h = it.h * p.scaleY;
        geo = new THREE.BoxGeometry(it.w * p.scaleXZ, h, it.d * p.scaleXZ);
      }
      const mesh = new THREE.Mesh(geo, makeItemMaterials(p.kind, it));
      mesh.position.set(p.x, h / 2, p.z);
      mesh.rotation.y = p.rotY;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  // 特大の人間（障害物）。家主は歩いて攻撃するのでメッシュを保持しておく。
  _buildGiants(state) {
    this.giantMeshes = new Map();
    for (const g of state.giants) {
      const mesh = createGiantMesh(g.kind);
      mesh.position.set(g.x, 0, g.z);
      mesh.rotation.y = g.rotY;
      this.scene.add(mesh);
      this.giantMeshes.set(g.id, mesh);
    }
  }

  // 家主の動作を見せる：歩く・振り上げる・振り下ろす。
  // 「攻撃が人間から出ている」と分かることが、この演出の目的。
  _syncOwner(state, dt) {
    const g = state.ownerGiant;
    if (!g) return;
    const mesh = this.giantMeshes.get(g.id);
    if (!mesh) return;
    const o = state.owner;

    mesh.position.set(g.x, 0, g.z);
    // 向きは滑らかに追従（急に振り向くと不自然）
    const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, g.rotY, 0));
    mesh.quaternion.slerp(target, Math.min(1, 6 * dt));

    const arms = mesh.userData.arms;
    const legs = mesh.userData.legs;
    if (!arms) return;

    // 歩行：脚を前後に振る
    this.ownerWalkPhase = (this.ownerWalkPhase || 0) + (o.walking ? dt * 5 : 0);
    const swing = o.walking ? Math.sin(this.ownerWalkPhase) * 0.5 : 0;
    if (legs) { legs[0].rotation.x = swing; legs[1].rotation.x = -swing; }

    // 攻撃：狙う側の腕を振り上げ（anim 0→1）、strike で一気に振り下ろす
    const useRight = o.weapon === 'slipper';
    const active = useRight ? arms.right : arms.left;
    const idle = useRight ? arms.left : arms.right;

    let angle = 0;
    if (o.phase === 'raise') angle = -o.anim * 2.4;          // 頭上へ振り上げる
    else if (o.phase === 'strike') angle = 0.9;              // 振り下ろした状態
    else if (o.phase === 'approach') angle = -0.25;          // 構えながら歩く

    active.rotation.x = THREE.MathUtils.lerp(active.rotation.x, angle, Math.min(1, 18 * dt));
    idle.rotation.x = THREE.MathUtils.lerp(idle.rotation.x, o.walking ? -swing * 0.6 : 0, Math.min(1, 10 * dt));

    // 手に持つ武器は使う方だけ見せる
    if (arms.slipper) arms.slipper.visible = useRight;
    if (arms.can) arms.can.visible = !useRight;
  }

  // 危険（ホイホイ・猫）のメッシュを構築
  _buildHazards(state) {
    this.trapMeshes = new Map();
    for (const t of state.traps) {
      const mesh = createTrapMesh(t.radius);
      mesh.position.set(t.x, 0, t.z);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      this.trapMeshes.set(t.id, mesh);
      this.scene.add(mesh);
    }
    this.catMesh = createCatMesh();
    this.scene.add(this.catMesh);

    this.roombaMesh = createRoombaMesh();
    this.scene.add(this.roombaMesh);

    this.spiderMesh = createSpiderMesh();
    this.scene.add(this.spiderMesh);

    // 家主が狙っている場所を示すマーカー
    this.aimMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 32),
      new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    this.aimMesh.rotation.x = -Math.PI / 2;
    this.aimMesh.position.y = 0.06;
    this.aimMesh.visible = false;
    this.scene.add(this.aimMesh);
  }

  // ホイホイ：位置（交換で移動する）と、捕獲数に応じた「詰まり具合」を反映
  _syncTraps(state) {
    const cap = CONFIG.hazards.hoihoi.capacity;
    for (const t of state.traps) {
      const mesh = this.trapMeshes.get(t.id);
      if (!mesh) continue;
      if (mesh.position.x !== t.x || mesh.position.z !== t.z) {
        mesh.position.set(t.x, 0, t.z);          // 家主が新品を置き直した
        mesh.rotation.y = Math.random() * Math.PI * 2;
      }
      // 埋まるほど粘着面が茶色く盛り上がる＝満員が一目で分かる
      const k = Math.min(1, t.filled / cap);
      const glue = mesh.userData.glue;
      glue.material.color.setHex(k >= 1 ? 0x6b4423 : 0x1a1a1a);
      glue.scale.y = 1 + k * 6;
    }
  }

  // 猫の位置・向き・猫パンチのモーション
  _syncCat(state, dt) {
    const cat = state.cat;
    this.catMesh.position.set(cat.x, 0, cat.z);
    // 進行方向へ滑らかに向き直す
    const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, cat.angle, 0));
    this.catMesh.quaternion.slerp(target, Math.min(1, 8 * dt));
    // 前足：swipeAnim の間だけ振り下ろす
    const paw = this.catMesh.userData.paw;
    const swing = cat.swipeAnim > 0 ? Math.sin((1 - cat.swipeAnim / 0.35) * Math.PI) : 0;
    paw.rotation.x = -swing * 1.6;
  }

  // ルンバ・家蜘蛛・スリッパの見た目を state に合わせる
  _syncNewHazards(state, dt) {
    // まだ解禁されていない敵は登場させない
    this.roombaMesh.visible = state.unlocked.roomba;
    this.spiderMesh.visible = state.unlocked.spider;
    this.catMesh.visible = state.unlocked.cat;

    // ルンバ：位置と向き（方向転換中はその場で回る）
    const rb = state.roomba;
    this.roombaMesh.position.set(rb.x, 0, rb.z);
    this.roombaMesh.rotation.y = rb.angle;

    // 家蜘蛛：位置・高さ・脚の上下
    const sp = state.spider;
    this.spiderMesh.position.set(sp.x, sp.y, sp.z);
    this.spiderMesh.rotation.y = sp.angle;
    for (const l of this.spiderMesh.userData.legs) {
      l.pivot.rotation.x = Math.sin(sp.legPhase + l.phase) * 0.35;
    }

    // 家主が狙っている場所を示すマーカーは _syncAim が担当する
  }

  // 家主の狙点（腕の振り上げと合わせて予告として機能させる）
  _syncAim(state) {
    const o = state.owner;
    const show = o.phase === 'raise' || o.phase === 'approach';
    this.aimMesh.visible = show;
    if (!show) return;
    const c = CONFIG.hazards.owner;
    const r = o.weapon === 'spray' ? c.sprayRadius : c.slipperRadius;
    this.aimMesh.position.set(o.targetX, 0.06, o.targetZ);
    this.aimMesh.scale.setScalar(r);
    // 振り上げが進むほど激しく点滅（もうすぐ来る合図）
    this.aimMesh.material.opacity = o.phase === 'raise'
      ? 0.5 + 0.5 * Math.abs(Math.sin(this.elapsed * 14))
      : 0.3;
  }

  // state.roaches と実メッシュを同期（増減対応）
  _syncRoachMeshes(state) {
    const alive = new Set();
    for (const r of state.roaches) {
      alive.add(r.id);
      if (!this.roachMeshes.has(r.id)) {
        const mesh = createRoachMesh(r.variant);
        this.roachMeshes.set(r.id, mesh);
        this.scene.add(mesh);
      }
    }
    // 死亡個体のメッシュを撤去（Phase 3 以降で活躍）
    for (const [id, mesh] of this.roachMeshes) {
      if (!alive.has(id)) {
        this.scene.remove(mesh);
        this.roachMeshes.delete(id);
      }
    }
  }

  // 餌：位置・種類の同期＋ふわふわ回転。非アクティブ（拾われた直後）は非表示。
  _syncFoods(state, dt) {
    const fc = CONFIG.food;
    for (const f of state.foods) {
      let mesh = this.foodMeshes.get(f.id);
      if (!mesh || this.foodKinds.get(f.id) !== f.kind) {
        if (mesh) this.scene.remove(mesh);
        mesh = createFoodMesh(f.kind);
        this.foodMeshes.set(f.id, mesh);
        this.foodKinds.set(f.id, f.kind);
        this.scene.add(mesh);
      }
      mesh.visible = f.active;
      if (!f.active) continue;
      const bob = Math.sin(this.elapsed * fc.bobSpeed + f.phase) * fc.bobHeight;
      mesh.position.set(f.x, f.y + mesh.userData.baseY + bob, f.z);
      mesh.rotation.y += fc.spinSpeed * dt;
    }
  }

  // state からの出来事を演出に変換する。state は演出の中身を知らない。
  _consumeEvents(state) {
    for (const ev of state.events) {
      switch (ev.type) {
        case 'pickup':  this._addRing(ev, FOODS[ev.kind].accent, 2.2, 0.45); break;
        case 'spawn':   this._addRing(ev, 0xffe08a, 5.0, 0.8); break;
        case 'stick':   this._addRing(ev, 0x1a1a1a, 1.6, 0.5); break;   // 粘着した瞬間
        case 'death':   this._addRing(ev, 0xffffff, 3.0, 0.6); break;   // 昇天の煙
        case 'swipe':   this._addRing(ev, 0xff6b6b, 4.0, 0.4); break;   // 猫パンチ
        case 'takeover':this._addRing(ev, 0x4ecdc4, 6.0, 0.9); break;   // 乗り移り先を教える
        case 'roombaBump': this._addRing(ev, 0xc0c4cc, 2.0, 0.35); break; // ルンバが壁で反転
        case 'ownerNotice': this._addRing(ev, 0xff9f1c, 3.0, 0.6); break;           // 家主が気づいた
        case 'ownerSlam':  this._addRing(ev, 0x5b7fd4, ev.radius * 1.3, 0.5); break; // スリッパ着弾
        case 'ownerSpray': this._addRing(ev, 0xb8ff5b, ev.radius * 1.5, 0.9); break; // 噴射
      }
    }
  }

  // 広がりながら消えるリング。拾った時＝小、増殖＝大。
  _addRing(at, color, maxR, life) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.85, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, at.y + 0.15, at.z);
    this.scene.add(ring);
    this.effects.push({ mesh: ring, t: 0, life, maxR });
  }

  _updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      const k = e.t / e.life;
      if (k >= 1) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        this.effects.splice(i, 1);
        continue;
      }
      const s = 1 + k * e.maxR;
      e.mesh.scale.set(s, s, s);
      e.mesh.material.opacity = 0.9 * (1 - k);
    }
  }

  sync(state, dt) {
    this.elapsed += dt;
    this._syncRoachMeshes(state);
    this._syncFoods(state, dt);
    this._syncTraps(state);
    this._syncCat(state, dt);
    this._syncNewHazards(state, dt);
    this._syncAim(state);
    this._syncOwner(state, dt);
    this._consumeEvents(state);
    this._updateEffects(dt);

    // 各ゴキの位置・姿勢・歩行アニメを反映
    for (const r of state.roaches) {
      const mesh = this.roachMeshes.get(r.id);
      const u = mesh.userData;
      mesh.position.set(r.x, r.y, r.z);

      // 目標姿勢（地上=直立、登り=面に沿って傾く、死亡=仰向け）へスラープ
      const target = this._roachQuaternion(r);
      mesh.quaternion.slerp(target, Math.min(1, CONFIG.roach.turnSpeed * dt));

      if (r.dying) { this._animateDeath(r, u, mesh, dt); continue; }
      mesh.scale.setScalar(1);
      this._animateWalk(r, u, dt);
    }

    this._followCamera(state, dt);
  }

  // 仰向けにひっくり返って足をピクピク → 最後にしゅっと縮んで消える。
  _animateDeath(r, u, mesh, dt) {
    const k = 1 - r.dying / CONFIG.death.flipTime; // 0→1 の進行度
    // メッシュの原点は足元なので、ひっくり返すと体が床に埋まる。その分だけ持ち上げる。
    mesh.position.y = r.y + CONFIG.roach.radius * 2.4 * Math.min(1, k * 5);
    const twitch = Math.sin(this.elapsed * 26) * 0.5 * (1 - k); // 断末魔ほど激しく
    u.leftLeg.rotation.x = twitch;
    u.rightLeg.rotation.x = -twitch;
    u.leftArm.rotation.x = -twitch;
    u.rightArm.rotation.x = twitch;
    // 最後の3割で縮んで消滅
    mesh.scale.setScalar(k > 0.7 ? Math.max(0.01, 1 - (k - 0.7) / 0.3) : 1);
  }

  // ゴキの目標姿勢クォータニオンを返す。
  _roachQuaternion(r) {
    if (r.dying) {
      // 仰向け：進行方向は保ったまま、体を180度ひっくり返す
      return new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.angle, Math.PI));
    }
    if (r.mode === 'climb') {
      // 殻(local +y)を面の外向き法線へ、頭(local +z)を上へ。
      const a = r.climbNormalAngle;
      const yA = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));   // 外向き
      const up = new THREE.Vector3(0, 1, 0);
      const xA = new THREE.Vector3().crossVectors(yA, up).normalize();
      const zA = new THREE.Vector3().crossVectors(xA, yA).normalize();
      const m = new THREE.Matrix4().makeBasis(xA, yA, zA);
      return new THREE.Quaternion().setFromRotationMatrix(m);
    }
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.angle, 0));
  }

  // 二足歩行のスイング：移動量から「歩いているか」を判定し、
  // 腕と脚を逆位相で振る。止まると滑らかに直立へ戻る。
  _animateWalk(r, u, dt) {
    if (u.prevX === null) { u.prevX = r.x; u.prevZ = r.z; }
    const dist = Math.hypot(r.x - u.prevX, r.z - u.prevZ);
    u.prevX = r.x;
    u.prevZ = r.z;

    const speed = dt > 0 ? dist / dt : 0;
    const moving = speed > 0.2;

    // 歩行の強さ walkAmt を 0↔1 へ滑らかに寄せる
    const targetAmt = moving ? 1 : 0;
    u.walkAmt += (targetAmt - u.walkAmt) * Math.min(1, 12 * dt);
    if (moving) u.walkPhase += dt * (6 + speed * 0.9);

    const swing = Math.sin(u.walkPhase) * 0.7 * u.walkAmt; // 腕脚の振り角
    u.leftLeg.rotation.x  = swing;
    u.rightLeg.rotation.x = -swing;
    u.leftArm.rotation.x  = -swing; // 腕は脚と逆
    u.rightArm.rotation.x = swing;

    // 上下の弾み（歩数の倍の周期）
    const bob = Math.abs(Math.sin(u.walkPhase)) * 0.06 * u.walkAmt * CONFIG.roach.radius * 4;
    u.torso.position.y = u.torsoBaseY + bob;
    u.head.position.y = u.headBaseY + bob;
  }

  _followCamera(state, dt) {
    const p = state.player;
    const desired = new THREE.Vector3(p.x, p.y + CONFIG.camera.lookAtHeight, p.z);
    this.followTarget.lerp(desired, Math.min(1, CONFIG.camera.followLerp * dt));
    this._applyCamera();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const el = this.renderer.domElement.parentElement;
    this.width = el.clientWidth;
    this.height = el.clientHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }
}
