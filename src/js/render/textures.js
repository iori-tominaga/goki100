// Canvas でラベル等を「コードで描いた」テクスチャを生成する（Three.js 専用）。
// 塊魂リスペクトの生活小物（牛乳パック・段ボール・サイコロ・缶・本・お菓子）に貼る。

import * as THREE from 'three';

function hex(n) { return '#' + n.toString(16).padStart(6, '0'); }

// 正方 canvas に draw して CanvasTexture を返す。
function canvasTexture(draw, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function mat(tex, extra = {}) {
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, ...extra });
}

// ---- 各小物の面テクスチャ ----

function milkSide(it) {
  return canvasTexture((x, s) => {
    x.fillStyle = '#fff'; x.fillRect(0, 0, s, s);
    x.fillStyle = hex(it.accent); x.fillRect(0, 0, s, s * 0.22);       // 屋根の帯
    x.fillStyle = '#eef6ff'; x.beginPath(); x.arc(s * 0.3, s * 0.72, s * 0.09, 0, 7); x.fill();
    x.beginPath(); x.arc(s * 0.7, s * 0.8, s * 0.07, 0, 7); x.fill();  // 牛柄
    x.fillStyle = hex(it.accent);
    x.font = `bold ${s * 0.22}px sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(it.label, s / 2, s * 0.5);
    x.strokeStyle = '#e2e2e2'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, s - 3, s - 3);
  });
}

function cardboardSide(it) {
  return canvasTexture((x, s) => {
    x.fillStyle = hex(it.color); x.fillRect(0, 0, s, s);
    x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, s * 0.5); x.lineTo(s, s * 0.5); x.stroke(); // 継ぎ目
    // ワレモノ注意スタンプ
    x.strokeStyle = '#c0392b'; x.lineWidth = 4;
    x.strokeRect(s * 0.2, s * 0.14, s * 0.6, s * 0.26);
    x.fillStyle = '#c0392b';
    x.font = `bold ${s * 0.13}px sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(it.label, s / 2, s * 0.27);
    // 上向き矢印
    x.font = `bold ${s * 0.2}px sans-serif`;
    x.fillText('↑↑', s / 2, s * 0.66);
  });
}

function cardboardTop(it) {
  return canvasTexture((x, s) => {
    x.fillStyle = hex(it.color); x.fillRect(0, 0, s, s);
    x.fillStyle = '#e8d6a8';                       // ガムテープ十字
    x.fillRect(0, s * 0.42, s, s * 0.16);
    x.fillRect(s * 0.42, 0, s * 0.16, s);
    x.strokeStyle = 'rgba(0,0,0,0.15)'; x.lineWidth = 2;
    x.strokeRect(1, 1, s - 2, s - 2);
  });
}

function snackFront(it) {
  return canvasTexture((x, s) => {
    x.fillStyle = hex(it.color); x.fillRect(0, 0, s, s);
    x.fillStyle = hex(it.accent);                  // 斜めの帯
    x.beginPath(); x.moveTo(0, s * 0.62); x.lineTo(s, s * 0.4); x.lineTo(s, s * 0.72); x.lineTo(0, s * 0.92); x.fill();
    x.fillStyle = '#7a3b12'; x.beginPath(); x.arc(s * 0.72, s * 0.3, s * 0.16, 0, 7); x.fill(); // クッキー
    x.fillStyle = '#4a2408';
    for (const [ox, oy] of [[-0.05, -0.04], [0.05, 0.02], [0, 0.06]]) {
      x.beginPath(); x.arc(s * (0.72 + ox), s * (0.3 + oy), s * 0.02, 0, 7); x.fill();
    }
    x.fillStyle = '#fff';
    x.font = `bold ${s * 0.22}px sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(it.label, s * 0.42, s * 0.52);
  });
}

function snackSide(it) {
  return canvasTexture((x, s) => {
    x.fillStyle = hex(it.accent); x.fillRect(0, 0, s, s);
    x.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = -1; i < 8; i++) x.fillRect(i * s * 0.16, 0, s * 0.08, s);
  });
}

function bookCover(it) {
  return canvasTexture((x, s) => {
    x.fillStyle = hex(it.color); x.fillRect(0, 0, s, s);
    x.strokeStyle = hex(it.accent); x.lineWidth = 4;
    x.strokeRect(s * 0.1, s * 0.1, s * 0.8, s * 0.8);
    x.fillStyle = hex(it.accent);
    x.font = `bold ${s * 0.16}px serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(it.label, s / 2, s * 0.3);
    x.fillRect(s * 0.25, s * 0.5, s * 0.5, s * 0.03);
  });
}

function bookPages() {
  return canvasTexture((x, s) => {
    x.fillStyle = '#f3ead2'; x.fillRect(0, 0, s, s);
    x.strokeStyle = '#ccbf9c'; x.lineWidth = 1;
    for (let y = s * 0.06; y < s; y += s * 0.05) {
      x.beginPath(); x.moveTo(0, y); x.lineTo(s, y); x.stroke();
    }
  });
}

// サイコロの1面（目の数 n）
function diceFace(n) {
  return canvasTexture((x, s) => {
    x.fillStyle = '#fafafa'; x.fillRect(0, 0, s, s);
    x.strokeStyle = '#ddd'; x.lineWidth = 4; x.strokeRect(2, 2, s - 4, s - 4);
    const p = s * 0.25, m = s * 0.5, q = s * 0.75, r = s * 0.09;
    const spots = {
      1: [[m, m]],
      2: [[p, p], [q, q]],
      3: [[p, p], [m, m], [q, q]],
      4: [[p, p], [q, p], [p, q], [q, q]],
      5: [[p, p], [q, p], [m, m], [p, q], [q, q]],
      6: [[p, p], [q, p], [p, m], [q, m], [p, q], [q, q]],
    }[n];
    x.fillStyle = n === 1 ? '#d33' : '#222';
    for (const [cx, cy] of spots) { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); }
  });
}

function canLabel(it) {
  return canvasTexture((x, s) => {
    x.fillStyle = hex(it.color); x.fillRect(0, 0, s, s);
    x.fillStyle = hex(it.accent); x.fillRect(0, s * 0.4, s, s * 0.2);
    x.fillStyle = '#fff';
    x.font = `bold ${s * 0.16}px sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(it.label, s / 2, s * 0.5);
    x.fillStyle = '#ffe08a'; x.beginPath(); x.arc(s * 0.5, s * 0.78, s * 0.09, 0, 7); x.fill();
  });
}

function canMetal() {
  return canvasTexture((x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, s * 0.05, s / 2, s / 2, s * 0.5);
    g.addColorStop(0, '#f0f0f0'); g.addColorStop(1, '#9a9a9a');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  }, 128);
}

// ---- kind ごとの material（BoxGeometry 面順: [px,nx,py,ny,pz,nz]、Cylinder: [側,上,下]）----

const cache = new Map();

export function makeItemMaterials(kind, it) {
  if (cache.has(kind)) return cache.get(kind);
  let result;

  switch (kind) {
    case 'milk': {
      const side = mat(milkSide(it));
      const cap = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
      result = [side, side, cap, cap, side, side];
      break;
    }
    case 'cardboard': {
      const side = mat(cardboardSide(it));
      const top = mat(cardboardTop(it));
      result = [side, side, top, top, side, side];
      break;
    }
    case 'snack': {
      const front = mat(snackFront(it));
      const side = mat(snackSide(it));
      const cap = new THREE.MeshStandardMaterial({ color: it.accent, roughness: 0.85 });
      result = [side, side, cap, cap, front, front];
      break;
    }
    case 'book': {
      const cover = mat(bookCover(it));
      const pages = mat(bookPages());
      result = [pages, pages, pages, pages, cover, cover];
      break;
    }
    case 'dice': {
      // 対面の和が7になるよう配置（px1/nx6, py2/ny5, pz3/nz4）
      result = [1, 6, 2, 5, 3, 4].map((n) => mat(diceFace(n), { roughness: 0.5 }));
      break;
    }
    case 'can': {
      const side = mat(canLabel(it), { metalness: 0.2, roughness: 0.4 });
      const metal = mat(canMetal(), { metalness: 0.6, roughness: 0.3 });
      result = [side, metal, metal];
      break;
    }
    case 'step': {
      // 木の段（テクスチャ無しの単色でOK）
      result = new THREE.MeshStandardMaterial({ color: it.color, roughness: 0.9 });
      break;
    }
    default:
      result = new THREE.MeshStandardMaterial({ color: 0xcccccc });
  }

  cache.set(kind, result);
  return result;
}
