// ゲーム全体の定数。描画・ロジック双方から参照する「調整ノブ」。
// ここを触るだけで手触りが変わるように、数値はすべて名前付きで集約する。

export const CONFIG = {
  // ゴール
  targetCount: 100,

  // 家（プレイエリア）。間取り図に合わせた横長のワンルーム。
  // 中心が原点。x は -width/2〜+width/2、z は -depth/2〜+depth/2。
  // 縮尺の目安：1ユニット ≒ 11cm（部屋 約7m×4.6m）。
  house: {
    // SPREAD 倍した間取りに合わせた広さ（歩けるスペースを確保するため拡張）
    width: 78,
    depth: 51,
    wallHeight: 22,
    wallThickness: 1.4,
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
    count: 36,          // フロアに同時に存在する餌の数（危険が増えたぶん供給も増やす）
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

    // ルンバ：直進し、ぶつかると向きを変えて徘徊。進路上のゴキを吸い込む。
    // 動きが読めるぶん「避ける楽しさ」になる。
    // runTime 秒走ったら restTime 秒休む（本物と同じで充電に戻るイメージ）。
    // 常時走らせると部屋中を舐め回して群れが持たないため、安全な時間帯を作る。
    roomba: { speed: 8.0, radius: 3.0, killRadius: 1.8, turnPause: 0.45, runTime: 14, restTime: 16 },

    // 家主：置物ではなく能動的な敵。ゴキの群れを見つけると「歩いて近づき」、
    // 腕を振り上げてから叩く／スプレーを構えて噴射する。
    // 攻撃を人間の動作として見せることが肝心で、
    // 「どこからともなく攻撃が飛んでくる」状態では恐怖にならない。
    owner: {
      walkSpeed: 6.2,      // ゴキ(9)より遅い＝走れば逃げ切れる
      sight: 34,           // 部屋のかなり広い範囲を見渡す
      stopDistance: 7,     // これくらいまで近づいてから攻撃
      raiseTime: 1.3,      // 腕を振り上げてから振り下ろすまで（＝予告時間）
      strikeTime: 0.25,
      recoverTime: 1.2,    // 攻撃後の隙
      restTime: 4.0,       // 次の獲物を探すまでの間
      slipperRadius: 3.2,
      sprayRadius: 5.5,
      sprayThreshold: 5,   // これ以上固まっていたらスプレーを使う（普段はスリッパ）
      approachTimeout: 7,  // 追いつけなければ諦めて攻撃
    },

    // 家蜘蛛：小さくて速い捕食者。家具の上まで追ってくるので高所も安全ではない。
    // feedTime … 1匹捕らえるとその場で食事に入り、その間は動かない。
    //   これが無いと連続で狩り続けてしまい、たった1匹で群れが壊滅する。
    //   数値を弱めるのではなく「休む時間」を作って抑えるのが狙い。
    spider: {
      speed: 7.6, sightRadius: 15, killRadius: 1.3, radius: 0.9,
      wanderInterval: 2.0, climbRate: 9, feedTime: 6.0,
    },

  },


  // ===== 増殖の手段 =====
  // 餌拾いだけだと「床の餌の数」が増殖の上限になり、匹数30前後で
  // 死亡と拮抗して止まる（実測）。死亡は匹数に比例して増えるので、
  // 増殖側にも「増えるほど伸びる」経路が要る。
  breeding: {
    // 卵鞘：低確率で現れるレアアイテム。拾うと一気に孵化する。
    ootheca: { hatch: 6, minDelay: 28, maxDelay: 55, lifetime: 22 },

    // 巣：中に居る仲間は死なない。ただし餌も拾わないので、
    // 入れすぎると増殖が止まる＝「守る」と「稼ぐ」のトレードオフになる。
    nest: { radius: 5.0, spots: [[-34, 21], [33, 20], [-34, -7]] },

    // 集合：押している間だけ、近くの仲間がプレイヤーに付いてくる。
    gather: { radius: 14, speed: 8.0 },
  },

  // 家の汚れ具合（0〜100）。ミッションを達成すると上がり、
  // 汚いほど床の食べ残しが増える＝増殖の上限そのものが上がる。
  dirt: {
    start: 0,
    perFood: 0.34,   // 汚度1につき床の餌がこれだけ増える
    maxFood: 70,     // 餌の数の上限
  },

  // 匹数に応じて危険が段階的に増えていく。
  // 序盤は静かな家、増えるほど住人が本気で駆除にかかる、という筋書き。
  // 「最初から全部の危険が動いている」と、序盤に立ち上がる余地がなくなる。
  escalation: {
    hoihoi: 1,    // 元から仕掛けてある
    cat: 8,       // 猫が異変に気づく
    roomba: 18,   // 掃除が始まる
    owner: 30,    // 家主が本気を出す
    spider: 45,   // 家蜘蛛まで寄ってくる
  },

  // ミッション。達成すると仲間が増える（餌集め以外の増殖手段）。
  // ミッション。達成すると「家の汚度」が上がり、床の食べ残しが増える。
  // 匹数を直接配るより、増殖の上限そのものを押し上げる方が効く。
  missions: [
    { id: 'climb',   label: '家具の上に登る',         dirt: 12 },
    { id: 'food',    label: '餌を10個あつめる',       dirt: 14, goal: 10 },
    { id: 'balcony', label: 'ベランダまで行く',       dirt: 14 },
    { id: 'nest',    label: '仲間を巣に3匹つれて行く', dirt: 16, goal: 3 },
    { id: 'escape',  label: '猫の近くで6秒生き延びる', dirt: 18, goal: 6, near: 9 },
    { id: 'high',    label: 'キッチンの調理台に登る', dirt: 20 },
  ],

  // 仰向けにひっくり返って消えるまでの秒数。
  death: { flipTime: 1.2 },

  // 増殖ゲージ。溜まるほど次の1匹に必要な量が増える（後半ほど大変になる）。
  gauge: {
    base: 42,      // 2匹目に必要な量
    growth: 0.012, // 1匹増えるごとに必要量が +1.2%（後半が重くなりすぎないよう緩めた）
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
  floor:     0xe3b482, // 明るいフローリング（間取り図の無垢材に寄せた）
  floorGrid: 0xc59356, // 板の継ぎ目
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

// ===== 間取り =====
// 実際の間取り図（ワンルームLDK）を測って world 座標に落としたもの。
// すべて矩形（必要なら rotY で回転）。x,z = 中心、w = X幅、d = Z奥行、h = 高さ。
// style は描画側がメッシュを作り分けるためのヒント。ロジックは形を知らない。
//
//   キッチン ── 玄関 ── クローゼット
//   ダイニング ─ リビング ─ ワークスペース
//   ────────  ベランダ  ────────
const RAW_FURNITURE = [
  // --- キッチン（左上）---
  { kind: 'fridge',   style: 'cabinet', x: -27.0, z: -14.1, w: 9.6,  d: 9.9,  h: 16, color: 0xe8e8e8, accent: 0xb0b0b0 , climb: false },
  { kind: 'counter',  style: 'counter', x: -13.3, z: -15.1, w: 13.5, d: 4.6,  h: 8,  color: 0xf2f2f2, accent: 0xc8ccd0 },
  { kind: 'microwave',style: 'box',     x: -17.4, z: -14.9, w: 4.8,  d: 3.7,  h: 12, color: 0xfafafa, accent: 0x444444 },
  { kind: 'trash',    style: 'bin',     x: -21.8, z: -10.8, w: 2.9,  d: 3.6,  h: 5,  color: 0xd9c9a8, accent: 0x8a5a2b },

  // --- ダイニング（左）---
  { kind: 'table',    style: 'table',   x: -22.6, z: 2.4,   w: 9.3,  d: 8.7,  h: 6.5, color: 0xc89a5e, accent: 0x8a5a2b },
  { kind: 'chair',    style: 'chair',   x: -24.5, z: -3.5,  w: 3.7,  d: 3.7,  h: 4.8, color: 0xd9b98a, accent: 0x8a5a2b },
  { kind: 'chair',    style: 'chair',   x: -20.3, z: -3.5,  w: 3.7,  d: 3.7,  h: 4.8, color: 0xd9b98a, accent: 0x8a5a2b },
  { kind: 'chair',    style: 'chair',   x: -24.8, z: 6.3,   w: 3.7,  d: 3.7,  h: 4.8, color: 0xd9b98a, accent: 0x8a5a2b, rotY: Math.PI },
  { kind: 'chair',    style: 'chair',   x: -20.3, z: 6.3,   w: 3.7,  d: 3.7,  h: 4.8, color: 0xd9b98a, accent: 0x8a5a2b, rotY: Math.PI },
  { kind: 'curtain',  style: 'curtain', x: -29.1, z: 3.8,   w: 2.0,  d: 17.4, h: 16, color: 0xe6ded0, accent: 0xb8ac98 , climb: false },
  { kind: 'sidebox',  style: 'box',     x: -25.8, z: 13.8,  w: 3.8,  d: 4.2,  h: 5,  color: 0xc9a06a, accent: 0x6b4423 },

  // --- リビング（中央）---
  { kind: 'sofa',     style: 'sofa',    x: -6.4,  z: 0.5,   w: 12.8, d: 5.0,  h: 7,  color: 0xbfa76a, accent: 0x9c8850 },
  { kind: 'lowtable', style: 'table',   x: -5.4,  z: 6.9,   w: 6.2,  d: 3.6,  h: 3.5, color: 0xd0a878, accent: 0x8a5a2b },
  { kind: 'tvstand',  style: 'tv',      x: -3.8,  z: 13.4,  w: 10.2, d: 2.6,  h: 4,  color: 0x2b2b2b, accent: 0x111111 },
  { kind: 'plant',    style: 'plant',   x: 3.9,   z: 16.0,  w: 3.2,  d: 3.4,  h: 6,  color: 0xdcdcdc, accent: 0x3ba55d },

  // --- 玄関・クローゼット（右上）---
  { kind: 'closet',   style: 'cabinet', x: 17.3,  z: -14.0, w: 16.9, d: 10.1, h: 18, color: 0xd8d4cc, accent: 0x9a938a , climb: false },
  { kind: 'shoebox',  style: 'box',     x: 3.7,   z: -8.7,  w: 4.5,  d: 2.7,  h: 4,  color: 0xcfc4b0, accent: 0x8a7f6a },

  // --- ワークスペース（右）---
  { kind: 'rack',     style: 'rack',    x: 16.2,  z: -2.0,  w: 20.4, d: 2.0,  h: 9,  color: 0xcccccc, accent: 0x8a8a8a , climb: false },
  { kind: 'chest',    style: 'box',     x: 10.5,  z: 0.8,   w: 9.2,  d: 3.7,  h: 6,  color: 0xc08a52, accent: 0x7a5230 },
  { kind: 'desk',     style: 'table',   x: 19.9,  z: 8.0,   w: 6.0,  d: 13.4, h: 7,  color: 0xc08a52, accent: 0x7a5230 },
  { kind: 'chair',    style: 'chair',   x: 14.1,  z: 6.4,   w: 4.8,  d: 4.6,  h: 5,  color: 0xb07840, accent: 0x6b4423, rotY: Math.PI / 2 },
  { kind: 'chair',    style: 'chair',   x: 14.1,  z: 11.9,  w: 4.8,  d: 4.6,  h: 5,  color: 0xb07840, accent: 0x6b4423, rotY: Math.PI / 2 },
];

// 室内の仕切り壁（外周壁は house の寸法から自動生成）。
const RAW_PARTITIONS = [
  // 玄関とリビングを仕切る壁
  { x: 0.7, z: -14.1, w: 1.3, d: 12.9 },
];

// ベランダとの段差（低いので歩いて越えられる＝サッシの敷居）
const RAW_SILLS = [
  { x: -11.0, z: 14.6, w: 32.0, d: 1.2, h: 1.6 },
];

// 床の色分け（当たり判定なし・見た目だけ）。shape は 'rect' か 'circle'。
const RAW_FLOOR_ZONES = [
  { shape: 'rect',   x: -16.0, z: -14.5, w: 32.0, d: 13.0, color: 0xe9e4da, name: 'キッチン' },
  { shape: 'rect',   x: 4.5,   z: -14.5, w: 9.0,  d: 13.0, color: 0xd8d2c4, name: '玄関' },
  { shape: 'rect',   x: -11.0, z: 18.0,  w: 32.0, d: 6.0,  color: 0xbdbdbd, name: 'ベランダ' },
  { shape: 'rect',   x: -6.4,  z: 7.5,   w: 13.2, d: 9.3,  color: 0xd9c9a0, name: 'リビングのラグ' },
  { shape: 'circle', x: 13.7,  z: 9.2,   w: 13.0, d: 13.0, color: 0xa8c86a, name: 'デスクの丸ラグ' },
];

// 餌（食べ残し）の種類。value = 1個あたりのゲージ量、weight = 出現の重み。
// shape は描画側がメッシュを作り分けるためのヒント（ロジックは形を知らなくてよい）。
export const FOODS = {
  chip:   { weight: 5, value: 14, shape: 'chip',   size: 1.1, color: 0xffd93d, accent: 0xe08a2b, label: 'ポテチ' },
  rice:   { weight: 5, value: 9,  shape: 'grain',  size: 0.9, color: 0xffffff, accent: 0xe8e8e8, label: 'ごはん粒' },
  crumb:  { weight: 4, value: 12, shape: 'crumb',  size: 1.0, color: 0xd9a05b, accent: 0x8a5a2b, label: 'パンくず' },
  noodle: { weight: 3, value: 18, shape: 'noodle', size: 1.1, color: 0xffe08a, accent: 0xff9f1c, label: '麺' },
  candy:  { weight: 2, value: 24, shape: 'candy',  size: 1.0, color: 0xff6b6b, accent: 0x6c5ce7, label: 'あめ玉' },
  // 卵鞘（らんしょう）。weight 0 ＝ 通常抽選には出ず、レア枠としてだけ現れる。
  ootheca:{ weight: 0, value: 0,  shape: 'ootheca', size: 1.6, color: 0x7a4a24, accent: 0x3b2a18, label: '卵鞘' },
};

// 特大の人間（障害物として絡む）。sitting=座り姿勢のおばあちゃん、standing=立ちの家主。
// radius は円形コリジョン半径。
export const GIANTS = {
  homeowner: { pose: 'standing', height: 20, radius: 4.5, skin: 0xffcc99, clothes: 0x3d7ea6, hair: 0x2b2b2b },
  grandma:   { pose: 'sitting',  height: 14, radius: 6.0, skin: 0xffddc0, clothes: 0xc75d7a, hair: 0xf0f0f0 },
};

// ===== 間取りの拡大 =====
// 間取り図から起こした座標はそのまま残し、配置だけを一律で広げる。
// 家具の「大きさ」は変えないので、広がるのは通路＝動けるスペースだけ。
const SPREAD = 1.22;
const spreadPos = (o) => ({ ...o, x: o.x * SPREAD, z: o.z * SPREAD });
const spreadAll = (o) => ({ ...o, x: o.x * SPREAD, z: o.z * SPREAD, w: o.w * SPREAD, d: o.d * SPREAD });

export const FURNITURE = RAW_FURNITURE.map(spreadPos);   // 位置だけ広げる
export const PARTITIONS = RAW_PARTITIONS.map(spreadAll); // 壁は長さも伸ばす
export const SILLS = RAW_SILLS.map((o) => ({ ...o, x: o.x * SPREAD, z: o.z * SPREAD, w: o.w * SPREAD }));
export const FLOOR_ZONES = RAW_FLOOR_ZONES.map(spreadAll);
