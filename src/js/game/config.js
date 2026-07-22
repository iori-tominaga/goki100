// ゲーム全体の定数。描画・ロジック双方から参照する「調整ノブ」。
// ここを触るだけで手触りが変わるように、数値はすべて名前付きで集約する。

export const CONFIG = {
  // ゴール
  targetCount: 100,

  // 家（プレイエリア）の広さ。中心を原点(0,0)とした一辺の半分。
  // ゴキは小さく、家具は特大なので家自体もそれなりに広く取る。
  house: {
    halfSize: 24,     // -24〜+24 の正方形フロア
    wallHeight: 8,
  },

  // ゴキブリ本体
  roach: {
    radius: 0.6,      // 当たり判定にも使う半径（=とても小さい）
    moveSpeed: 9,     // 1秒あたりの移動距離（ユニット/秒）
    turnSpeed: 14,    // 向き変更の追従速度（大きいほどキビキビ）
    climbSpeed: 7,    // よじ登り速度（ユニット/秒）
  },

  // 高さ・登り・重力
  physics: {
    stepHeight: 0.9,  // これ以下の段差は歩いて自動で登る（A）。超える面はよじ登る（C）
    gravity: 30,      // 落下加速（ユニット/秒^2）
    snapUp: 40,       // 段差を上る際のY追従速度

    // よじ登りの掴み条件。
    // grabDot … 進行方向が障害物の方をどれだけ向いていれば掴むか（1=真正面）。
    //           これが無いと「離れようとしても掴む」＝抜け出せなくなる。
    // grabCooldown … 登りから降りた直後、この秒数は掴み直さない（再取り付きループ防止）。
    grabDot: 0.25,
    grabCooldown: 0.35,
  },

  // 餌（食べ残し）。拾うとゲージが溜まり、少し経つと別の場所へ再湧きする。
  food: {
    count: 26,          // フロアに同時に存在する餌の数
    respawnDelay: 3.5,  // 拾ってから別地点に復活するまでの秒数
    pickupRadius: 1.3,  // ゴキの中心とこの距離まで近づくと回収
    reachHeight: 1.6,   // 高さ方向の許容差（上の階の餌を拾わないため）
    spinSpeed: 1.6,     // 見た目の回転（描画側が使う）
    bobHeight: 0.22,    // ふわふわ上下する幅
    bobSpeed: 2.4,
  },

  // 仲間ゴキの自律AI。「普段はふらつき、餌が視界に入ったら食いつく」型。
  ai: {
    wanderSpeed: 4.5,     // 徘徊中の速度（プレイヤーより遅い＝主役はあくまで君）
    seekSpeed: 7.0,       // 餌へ向かう時の速度
    sightRadius: 11,      // この距離に入った餌に食いつく
    wanderInterval: 1.6,  // 徘徊の向きを変える平均間隔（秒）
    wanderTurn: 1.2,      // 1回の方向転換の最大ふらつき（ラジアン）
    separation: 1.7,      // 個体同士がこの倍率×半径より近いと押し合う（団子防止）
  },

  // 死亡アクション（Phase 3）。理不尽さが売りなので、どれも容赦なく効く。
  hazards: {
    // ゴキブリホイホイ：床に固定。踏むと粘着して数秒後に死亡。
    // capacity 匹で満員になり機能停止。refillTime 秒後に家主が別の場所へ新品を置く。
    // これで「同じ罠に延々ハマって全滅」を構造的に防ぎつつ、緊張は持続する。
    hoihoi: { count: 4, radius: 1.4, stickTime: 2.6, capacity: 3, refillTime: 18, keepFromSpawn: 9 },
    // 飼い猫：家を徘徊し、見つけたゴキを追って前足で叩く（範囲攻撃）。
    // speed は索敵中のゴキ(seekSpeed=7.0)より遅くしてある＝逃げ切る余地を残すため。
    cat: {
      speed: 5.8, sightRadius: 12, swipeRadius: 2.0,
      swipeInterval: 2.4, wanderInterval: 2.5, radius: 2.2,
    },
    // 家主のゴキジェット：予告してから、ゴキの居るあたりへ噴射。範囲内は全滅。
    spray: { interval: 16, warning: 2.2, radius: 6.0 },
  },

  // 仰向けにひっくり返って消えるまでの秒数。
  death: { flipTime: 1.2 },

  // 増殖ゲージ。溜まるほど次の1匹に必要な量が増える（後半ほど大変になる）。
  gauge: {
    base: 55,      // 2匹目に必要な量
    growth: 0.02,  // 1匹増えるごとに必要量が +2%（100匹時で約7倍。上げると後半が重くなる）
  },

  // オービットカメラ（ドラッグ回転＋ホイールズーム／移動はカメラ基準）
  camera: {
    yaw: 0,            // 水平角の初期値
    pitch: 0.62,       // 仰角（0=真横〜約1.4=真上）
    distance: 11,      // ターゲットからの距離
    minPitch: 0.15,
    maxPitch: 1.35,
    minDistance: 4,
    maxDistance: 30,
    lookAtHeight: 1.2, // 注視点の高さ（ターゲットのY＋この値）
    followLerp: 8,     // 追従の滑らかさ（大きいほど速い）
    rotateSpeed: 0.005,
    zoomSpeed: 0.02,
    fov: 60,
  },
};

// 塊魂リスペクトの原色ポップなパレット（16進）
export const PALETTE = {
  floor:     0xf6d365, // 明るい黄土のフロア
  floorGrid: 0xffe9a8,
  wall:      0xffb3c6, // ポップなピンク壁
  sky:       0xa0e7ff, // 陽気な水色の背景
  roachBody: 0x8b5a2b, // ゴキ着ぐるみ（茶）
  roachShell:0x6b4423, // 背中の羽（濃茶）
  roachSkin: 0xffd8a8, // 人間の顔・手足（肌色）
  roachEye:  0x2b2b2b,
  // 特大ガラクタ用のビビッドな差し色
  props: [0xff6b6b, 0x4ecdc4, 0xffd93d, 0x6c5ce7, 0xff9f1c, 0x2ec4b6, 0xe84393],
};

// ゴキブリの顔タイプ（着ぐるみ本体は共通、顔だけ差し替える）。
// weight = 出現の重み。合計に対する比率で抽選される。
// gokirea（宇宙人グレイ）はレア枠なので weight を大きく下げてある。
export const VARIANTS = {
  ojisan:  { weight: 46, label: 'おじさんゴキ', skin: 0xffcc99 }, // 太眉・口ひげ・ハゲ
  obaasan: { weight: 46, label: 'おばあゴキ',   skin: 0xffe0c0 }, // 白髪お団子・丸メガネ
  gokirea: { weight: 8,  label: 'ゴキレア',     skin: 0x8fd9a8 }, // 宇宙人グレイ・大きな黒目（レア）
};

// 特大の生活小物（塊魂リスペクト）。shape と基準サイズ・配色・ラベルを定義。
// 実サイズは state 側で weight 抽選＋倍率でばらつかせる。テクスチャは描画側が Canvas 生成。
export const ITEMS = {
  milk:      { shape: 'box',      w: 3.2, h: 6.8, d: 3.2, weight: 3, color: 0xffffff, accent: 0x2a86e0, label: '牛乳' },
  cardboard: { shape: 'box',      w: 5.5, h: 4.6, d: 5.5, weight: 4, color: 0xcfa06a, accent: 0x8a5a2b, label: '取扱注意' },
  snack:     { shape: 'box',      w: 4.2, h: 5.2, d: 2.0, weight: 3, color: 0xff9f1c, accent: 0xe84393, label: 'おかし' },
  book:      { shape: 'box',      w: 4.4, h: 5.6, d: 1.1, weight: 2, color: 0x4a6fa5, accent: 0xffe08a, label: 'BOOK' },
  dice:      { shape: 'box',      w: 3.2, h: 3.2, d: 3.2, weight: 2, color: 0xffffff, accent: 0x222222, label: '' },
  can:       { shape: 'cylinder', r: 1.6,          h: 4.8, weight: 2, color: 0xd94f3a, accent: 0xffe08a, label: 'JUICE' },
  // 階段用（weight 0＝ランダム抽選されない。generateStairs が使う木の段）
  step:      { shape: 'box',      w: 5.0, h: 1.0, d: 3.0, weight: 0, color: 0xb8865b, accent: 0x8a5a2b, label: '' },
};

// 餌（食べ残し）の種類。value = 1個あたりのゲージ量、weight = 出現の重み。
// shape は描画側がメッシュを作り分けるためのヒント（ロジックは形を知らなくてよい）。
export const FOODS = {
  chip:   { weight: 5, value: 14, shape: 'chip',   size: 1.1, color: 0xffd93d, accent: 0xe08a2b, label: 'ポテチ' },
  rice:   { weight: 5, value: 9,  shape: 'grain',  size: 0.9, color: 0xffffff, accent: 0xe8e8e8, label: 'ごはん粒' },
  crumb:  { weight: 4, value: 12, shape: 'crumb',  size: 1.0, color: 0xd9a05b, accent: 0x8a5a2b, label: 'パンくず' },
  noodle: { weight: 3, value: 18, shape: 'noodle', size: 1.1, color: 0xffe08a, accent: 0xff9f1c, label: '麺' },
  candy:  { weight: 2, value: 24, shape: 'candy',  size: 1.0, color: 0xff6b6b, accent: 0x6c5ce7, label: 'あめ玉' },
};

// 特大の人間（障害物として絡む）。sitting=座り姿勢のおばあちゃん、standing=立ちの家主。
// radius は円形コリジョン半径。
export const GIANTS = {
  homeowner: { pose: 'standing', height: 20, radius: 4.5, skin: 0xffcc99, clothes: 0x3d7ea6, hair: 0x2b2b2b },
  grandma:   { pose: 'sitting',  height: 14, radius: 6.0, skin: 0xffddc0, clothes: 0xc75d7a, hair: 0xf0f0f0 },
};
