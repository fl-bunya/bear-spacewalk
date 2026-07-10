# キャラクター差し替え機構 + 新キャラ「mspn」実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** カメラに同伴する黄色い熊を `?char=mspn` で新キャラ「mspn」（materials/IMG_9841.jpg 準拠）に差し替え可能にする。既定は元の熊のまま。

**Architecture:** `index.html` にベタ書きされた熊の造形コードを `buildBear()` に関数化し、`buildMspn()` を並置。両者は共通インターフェース `{ group, armL, armR, legL, legR, updateFace(t, forceBlink) }` を返し、アニメーションループはこのインターフェースだけを参照する。共通部品（`charBase()` の part/輪郭線ヘルパー・`gradientMap`・宇宙飛行士装備 `addGear()`）は関数外で共有。

**Tech Stack:** Three.js r149（UMD, `lib/three.min.js` 同梱）、単一 `index.html`、検証は Playwright スクリーンショット（テストフレームワークなし・目視検証が本プロジェクトの流儀）。

**Spec:** `docs/superpowers/specs/2026-07-10-character-swap-design.md`

## Global Constraints

- 体色は両キャラとも `CONFIG.bearColor`（0xf7d452）を使う。
- mspn にシャツ・ロゴ帯はない。`?shirt=` は熊専用のまま（mspn では無効）。
- mspn の装備はヘルメット・首リング・酸素タンク（熊と同じ）。
- mspn の顔は固定（まばたきなし）：下がり気味の短い線の目＋小さな口、鼻なし。
- `?char=` 指定なし・未知の値 → 元の熊。生成するのは選択された1体のみ。
- 熊の見た目・挙動は一切変えない（Task 1 は純リファクタ）。
- コードコメントは日本語・既存の密度に合わせる。

## 検証環境の前提（全タスク共通）

HTTPサーバを起動しておく（Task 1 開始時に1回）:

```bash
cd /Users/bunya/my/earth && python3 -m http.server 8000 &
```

スクリーンショット取得は以下のインラインスクリプトを使う（`screenshot.js` は /tmp 直書き・URL固定のため使わない。`$SCRATCH` は環境のスクラッチパッドディレクトリに読み替え）:

```bash
node -e '
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setViewportSize({ width: 1280, height: 720 });
  const [query, out] = process.argv.slice(1);
  await page.goto("http://localhost:8000?" + query, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: out });
  console.log("saved:", out);
  await browser.close();
})();
' "preview" "$SCRATCH/bear.png"
```

`?preview` を付けるとキャラが正面固定になり確認しやすい（既存機能）。
ページ内エラーの有無は Playwright の `page.on("pageerror", ...)` を足すか、取得画像が真っ黒/キャラ不在でないかで判断する。

---

### Task 1: 熊の造形コードを buildBear() に関数化（挙動不変リファクタ）

**Files:**
- Modify: `index.html:1606-1876`（造形コード一帯）
- Modify: `index.html:2428-2434`（blink状態変数）
- Modify: `index.html:2586-2616`（アニメーションループの参照）

**Interfaces:**
- Produces: `charBase() → { group: THREE.Group, part(geo, mat, x, y, z, opts) → THREE.Mesh, applyOutlines() }`
- Produces: `addGear(group, part, ringRadius: number)` — ヘルメット・首リング・酸素タンクを装着
- Produces: `buildBear() → { group, armL, armR, legL, legR, updateFace(t: number, forceBlink: boolean) }`
- Produces: `const character`（選択されたキャラ）、`const bear = character.group`（既存の配置コードが参照する変数名を維持）

- [ ] **Step 1: 現状のスクリーンショットを取得（リファクタ前の基準）**

```bash
# 検証環境の前提のスクリプトで
"preview" "$SCRATCH/before-bear.png"
"preview&shirt=あ" "$SCRATCH/before-shirt.png"
"preview&blink" "$SCRATCH/before-blink.png"
```

Read ツールで3枚を開き、熊・シャツ文字「あ」・閉じ目が写っていることを確認。

- [ ] **Step 2: 共通ヘルパーへの再構成**

`index.html` の造形セクション（現1606行〜）を以下の構成に書き換える。
`gradientMap`・`matSuit`・`makeFaceTexture`・`makeLogoTexture` は現行コードのまま位置だけこの順に整理。`matBear`・`matShirt`・`matBearFace`・`faceTexOpen/Blink` は Step 3 で `buildBear()` 内へ移す。`matOutline`（現1723行）は共有スコープへ移動。

```js
// ====== キャラクター共通の素材・ヘルパー ======
const gradientMap = (() => { /* 現1607-1614をそのまま */ })();
const matSuit = new THREE.MeshToonMaterial({
    color: 0xdfe5ec,
    gradientMap,
});
const matOutline = new THREE.MeshBasicMaterial({
    color: 0x1c1814,
    side: THREE.BackSide,
});

// キャラ造形の土台：グループ・部品追加・輪郭線（inverted hull）
function charBase() {
    const group = new THREE.Group();
    const outlined = []; // 輪郭線を付けるメッシュ
    function part(geo, mat, x, y, z, opts) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        if (opts && opts.rot) m.rotation.set(...opts.rot);
        if (opts && opts.scale) m.scale.set(...opts.scale);
        group.add(m);
        if (!opts || opts.outline !== false) outlined.push(m);
        return m;
    }
    // 輪郭線：本体メッシュの子にして手足の動きに追従させる
    function applyOutlines() {
        for (const m of outlined) {
            const o = new THREE.Mesh(m.geometry, matOutline);
            o.scale.setScalar(1.05);
            m.add(o);
        }
    }
    return { group, part, applyOutlines };
}

// 宇宙飛行士装備：ヘルメット（透明バブル）・首リング・酸素タンク
// ringRadius: 首リング半径（胴の太さに合わせてキャラごとに指定）
function addGear(group, part, ringRadius) {
    const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 48, 48),
        new THREE.MeshPhongMaterial({
            color: 0xbcd8ff,
            transparent: true,
            opacity: 0.16,
            shininess: 120,
            specular: 0xffffff,
            depthWrite: false,
        }),
    );
    helmet.position.set(0, 0.42, 0);
    group.add(helmet);
    part(new THREE.TorusGeometry(ringRadius, 0.075, 12, 32), matSuit, 0, -0.06, 0, {
        rot: [Math.PI / 2, 0, 0],
    });
    part(new THREE.CapsuleGeometry(0.12, 0.36, 8, 16), matSuit, -0.16, -0.34, -0.46);
    part(new THREE.CapsuleGeometry(0.12, 0.36, 8, 16), matSuit, 0.16, -0.34, -0.46);
}
```

- [ ] **Step 3: buildBear() を定義**

現1728-1864行（`const bear = new THREE.Group()` 〜 輪郭線ループ）を `buildBear()` に移す。造形部品のコード（胴体・シャツ・ロゴ帯・頭・耳・腕・脚・しっぽ、現1741-1821行）は**一切変更せずそのまま移動**。変わるのは外枠と装備・輪郭線・瞬きの扱いのみ:

```js
// ====== 黄色い熊（プリミティブによるコード造形・トゥーン調） ======
function buildBear() {
    const { group, part, applyOutlines } = charBase();
    const matBear = new THREE.MeshToonMaterial({
        color: CONFIG.bearColor,
        gradientMap,
    });
    const matShirt = new THREE.MeshToonMaterial({
        color: CONFIG.shirtColor,
        gradientMap,
    });
    const faceTexOpen = makeFaceTexture(false);
    const faceTexBlink = makeFaceTexture(true);
    const matBearFace = new THREE.MeshToonMaterial({
        color: CONFIG.bearColor,
        gradientMap,
        map: faceTexOpen,
    });

    // …… 現1741-1821行の造形コードをそのまま貼る ……
    // （胴体・シャツ・ロゴ帯・頭・耳・腕・脚・しっぽ。
    //   ただし logoBand の追加先 `bear.add(logoBand)` は `group.add(logoBand)` に読み替え）

    addGear(group, part, 0.42); // 現1822-1857行の装備コードは addGear へ集約済み
    applyOutlines();            // 現1859-1864行の輪郭線ループは applyOutlines へ集約済み

    // 瞬き：3〜7秒間隔でランダム、たまに二連（状態はクロージャに保持）
    let blinkUntil = -1;
    let nextBlinkAt = 3;
    function updateFace(t, forceBlink) {
        if (t >= nextBlinkAt) {
            blinkUntil = t + 0.13;
            nextBlinkAt =
                Math.random() < 0.25 ? t + 0.45 : t + 3 + Math.random() * 4;
        }
        matBearFace.map =
            forceBlink || t < blinkUntil ? faceTexBlink : faceTexOpen;
    }
    return { group, armL, armR, legL, legR, updateFace };
}
```

注意: 現行コードの `part()` は `bear.add(m)` している。移動後は `charBase()` の `part()`（`group.add`）を使うので、関数内ローカルの `part` 定義（現1731-1739行）は削除する。

- [ ] **Step 4: キャラ生成と参照の差し替え**

`buildBear()` 定義の直後（カメラリグのセクション、現1866行の手前）:

```js
// キャラ生成（Task 2 で ?char= 選択に置き換える）
const character = buildBear();
const bear = character.group; // 配置・回転コード（既存）はこの名前で参照
const { armL, armR, legL, legR } = character;
```

アニメーションループの変更:

現2433-2434行の外側状態変数を削除:

```js
// 削除する2行
let blinkUntil = -1;
let nextBlinkAt = 3;
```

現2588-2597行（瞬きブロック）を1行に置換:

```js
// 瞬き・表情はキャラ側に委譲（熊: 3〜7秒間隔のまばたき / mspn: 固定顔）
character.updateFace(t, forceBlink);
```

現2613-2616行（armL/armR/legL/legR の代入）と `bear.position/rotation`（現2574-2586行）、`camera.add(bear)`・`bear.position.set(...CONFIG.bearOffset)`・`bear.scale.setScalar(...)`（現1869-1871行）は**変更不要**（同名の変数を維持しているため）。

- [ ] **Step 5: リファクタ後のスクリーンショットで挙動不変を確認**

```bash
"preview" "$SCRATCH/after-bear.png"
"preview&shirt=あ" "$SCRATCH/after-shirt.png"
"preview&blink" "$SCRATCH/after-blink.png"
```

Read ツールで before/after を並べて比較。期待: 3組とも見た目が同一（熊の造形・シャツ文字・閉じ目）。ブラウザコンソールエラーがないこと（真っ黒画像・キャラ不在は失敗のサイン）。

- [ ] **Step 6: コミット**

```bash
git add index.html
git commit -m "熊の造形コードをbuildBear()に関数化（キャラ差し替えの下準備・挙動不変）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: buildMspn() の造形と ?char= 選択機構

**Files:**
- Modify: `index.html`（Task 1 の `buildBear()` 直後に `makeMspnFaceTexture()` と `buildMspn()` を追加、`const character = buildBear()` を選択式に変更）

**Interfaces:**
- Consumes: `charBase()`, `addGear(group, part, ringRadius)`, `gradientMap`, `CONFIG.bearColor`（Task 1）
- Produces: `buildMspn() → { group, armL, armR, legL, legR, updateFace }`（`updateFace` は no-op）

- [ ] **Step 1: mspn の顔テクスチャを追加**

`buildBear()` の直後に追加:

```js
// ====== mspn（materials/IMG_9841.jpg 準拠：ずんぐり・手足短い・服なし） ======
// 顔：下がり気味の短い線の目＋小さな∧の口。鼻なし・まばたきなし（原画の表情を固定）
function makeMspnFaceTexture() {
    const cv = document.createElement("canvas");
    cv.width = 1024;
    cv.height = 512; // 球のequirectangular展開。中央(512)が顔の正面
    const g = cv.getContext("2d");
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 1024, 512);
    g.strokeStyle = "#332b22";
    g.lineCap = "round";
    g.lineWidth = 9;
    // 目：内側が下がる短い線（左右）
    g.beginPath();
    g.moveTo(392, 222);
    g.lineTo(434, 236);
    g.stroke();
    g.beginPath();
    g.moveTo(632, 222);
    g.lineTo(590, 236);
    g.stroke();
    // 口：小さな∧
    g.beginPath();
    g.moveTo(512, 262);
    g.lineTo(499, 274);
    g.stroke();
    g.beginPath();
    g.moveTo(512, 262);
    g.lineTo(525, 274);
    g.stroke();
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
}
```

- [ ] **Step 2: buildMspn() を追加**

```js
function buildMspn() {
    const { group, part, applyOutlines } = charBase();
    const matBody = new THREE.MeshToonMaterial({
        color: CONFIG.bearColor,
        gradientMap,
    });
    const matFace = new THREE.MeshToonMaterial({
        color: CONFIG.bearColor,
        gradientMap,
        map: makeMspnFaceTexture(),
    });

    // 胴：頭と重なる幅広カプセルで洋ナシ型のずんぐり体型に（服なし・全身同色）
    part(new THREE.CapsuleGeometry(0.48, 0.3, 8, 24), matBody, 0, -0.5, 0, {
        scale: [1, 1, 0.92],
    });
    // 頭（顔テクスチャの正面が +z を向くよう -90° 回転）
    part(new THREE.SphereGeometry(0.5, 48, 48), matFace, 0, 0.38, 0, {
        rot: [0, -Math.PI / 2, 0],
        scale: [1, 0.94, 1.08],
    });
    // 耳：熊より小さめ
    part(new THREE.SphereGeometry(0.11, 24, 24), matBody, -0.3, 0.82, 0);
    part(new THREE.SphereGeometry(0.11, 24, 24), matBody, 0.3, 0.82, 0);
    // 腕：短いカプセル（付け根を軸に回転できるようオフセット）
    const armGeoL = new THREE.CapsuleGeometry(0.11, 0.14, 8, 16);
    armGeoL.translate(0, 0.07, 0);
    const armL = part(armGeoL, matBody, -0.46, -0.32, 0.08, {
        rot: [0, 0, 0.9],
    });
    const armGeoR = new THREE.CapsuleGeometry(0.11, 0.14, 8, 16);
    armGeoR.translate(0, 0.07, 0);
    const armR = part(armGeoR, matBody, 0.48, -0.38, 0.05, {
        rot: [0, 0, -0.7],
    });
    // 脚：短いカプセル
    const legGeoL = new THREE.CapsuleGeometry(0.13, 0.1, 8, 16);
    legGeoL.translate(0, -0.05, 0);
    const legL = part(legGeoL, matBody, -0.19, -0.98, 0.05, {
        rot: [0.25, 0, 0.15],
    });
    const legGeoR = new THREE.CapsuleGeometry(0.13, 0.1, 8, 16);
    legGeoR.translate(0, -0.05, 0);
    const legR = part(legGeoR, matBody, 0.19, -0.98, 0.05, {
        rot: [0.25, 0, -0.15],
    });
    // しっぽ：お尻に丸く
    part(new THREE.SphereGeometry(0.11, 24, 24), matBody, 0, -0.75, -0.45);

    addGear(group, part, 0.5); // 胴が太いぶん首リングは熊より大きめ
    applyOutlines();

    return {
        group,
        armL,
        armR,
        legL,
        legR,
        updateFace() {}, // まばたきなし：原画の表情を固定
    };
}
```

- [ ] **Step 3: キャラ選択を ?char= 対応に変更**

Task 1 Step 4 の生成行を置換:

```js
// ====== キャラ選択：?char=mspn で新キャラ、それ以外（既定）は熊 ======
const charName = new URLSearchParams(location.search).get("char");
const character = charName === "mspn" ? buildMspn() : buildBear();
const bear = character.group; // 配置・回転コード（既存）はこの名前で参照
const { armL, armR, legL, legR } = character;
```

- [ ] **Step 4: スクリーンショットで確認・原画と見比べて微調整**

```bash
"preview&char=mspn" "$SCRATCH/mspn.png"
"preview" "$SCRATCH/bear-regression.png"
"preview&char=mspn&flail" "$SCRATCH/mspn-flail.png"
```

Read ツールで確認する項目:
1. `mspn.png`: ずんぐり体型・小さい耳・短い腕脚・装備あり・シャツなし・全身黄色・線の目＋小さな口
2. `materials/IMG_9841.jpg` と並べて雰囲気を比較。ズレが大きければ座標・スケールを微調整（顔のパーツ位置、胴の太さなど）。微調整したら再スクショ。
3. `bear-regression.png`: 熊が従来どおり（リグレッションなし）
4. `mspn-flail.png`: 短い腕脚が回転している（バタバタアニメが効く）

- [ ] **Step 5: コミット**

```bash
git add index.html
git commit -m "新キャラmspnを追加（?char=mspn で切り替え・既定は熊のまま）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: README 追記と最終回帰確認

**Files:**
- Modify: `README.md:70-71` 付近（`?shirt=` の説明の直後）

**Interfaces:**
- Consumes: `?char=mspn`（Task 2）

- [ ] **Step 1: README に ?char= の説明を追記**

`?shirt=` の段落（README.md:70-71）の直後に追加:

```markdown
キャラクターは `?char=mspn` で mspn（ずんぐり体型・服なし）に
切り替えられる。指定なしは黄色い熊。
```

- [ ] **Step 2: 最終回帰確認**

```bash
"preview&shirt=宇宙" "$SCRATCH/final-shirt.png"
"preview&char=mspn" "$SCRATCH/final-mspn.png"
"preview&char=unknown" "$SCRATCH/final-fallback.png"
```

期待: シャツ文字「宇宙」表示（熊）、mspn 表示、未知の値では熊にフォールバック。
モバイル縦画面の配置確認としてビューポート 390x844 でも1枚:

```bash
# インラインスクリプトの setViewportSize を { width: 390, height: 844 } に変えて
"preview&char=mspn" "$SCRATCH/final-mspn-portrait.png"
```

期待: mspn が画面内に収まっている（bearXFrac ベースの配置が機能）。

- [ ] **Step 3: コミット**

```bash
git add README.md
git commit -m "READMEに?char=mspnの説明を追記

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
