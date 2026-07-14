# キャラクターのドラッグ回転 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** キャラをドラッグで回転でき、離すと2〜3秒で元の揺蕩いに戻る。

**Architecture:** ドラッグ状態（dragYaw/dragPitch）をモジュールスコープに持ち、pointerイベントで更新、アニメーションループの揺蕩い回転に加算合成。減衰はループ内の指数減衰。

**Tech Stack:** Three.js r149 / 単一 index.html / 検証は Playwright ドラッグ＋スクショ。

**Spec:** `docs/superpowers/specs/2026-07-14-drag-rotate-design.md`

## Global Constraints

- 音楽開始クリック・音量UI・ファイルdrag&drop・カメラ遊覧・キャラ配置は不変。
- 熊・mspn 両対応（`character.group` を対象にレイキャスト）。
- `?preview` でもドラッグオフセットは効く（検証用）。
- コメントは日本語・既存密度。

### Task 1: ドラッグ回転の実装と検証

**Files:**
- Modify: `index.html`（キャラ生成直後にドラッグ制御ブロックを追加、ループの回転代入を合成に変更 index.html:2872-2878 付近）

**Interfaces:**
- Produces: `dragYaw` / `dragPitch`（number, モジュールスコープ）、`updateDragDecay(dt)`（ループから毎フレーム呼ぶ）

- [ ] **Step 1: ドラッグ制御ブロックを追加**（`const { armL, ... } = character;` の直後）

```js
// ====== キャラのドラッグ回転：掴んで回せる。離すとゆっくり元の揺蕩いへ ======
let dragYaw = 0;
let dragPitch = 0;
let dragging = false;
const dragRay = new THREE.Raycaster();
const dragNDC = new THREE.Vector2();
function pickCharacter(e) {
    dragNDC.set(
        (e.clientX / innerWidth) * 2 - 1,
        -(e.clientY / innerHeight) * 2 + 1,
    );
    dragRay.setFromCamera(dragNDC, camera);
    return dragRay.intersectObject(bear, true).length > 0;
}
renderer.domElement.addEventListener("pointerdown", (e) => {
    if (!pickCharacter(e)) return;
    dragging = true;
    renderer.domElement.setPointerCapture(e.pointerId);
    renderer.domElement.style.cursor = "grabbing";
});
renderer.domElement.addEventListener("pointermove", (e) => {
    if (dragging) {
        dragYaw += e.movementX * 0.01;
        dragPitch = THREE.MathUtils.clamp(
            dragPitch + e.movementY * 0.01,
            -0.8,
            0.8,
        );
    } else {
        // ホバーで「掴める」ことを示す
        renderer.domElement.style.cursor = pickCharacter(e) ? "grab" : "";
    }
});
for (const ev of ["pointerup", "pointercancel"]) {
    renderer.domElement.addEventListener(ev, () => {
        dragging = false;
        renderer.domElement.style.cursor = "";
    });
}
// 離した後：指数減衰で元の姿勢へ（時定数0.8s ≒ 2.5秒で実質ゼロ）
function updateDragDecay(dt) {
    if (dragging) return;
    const k = Math.exp(-dt / 0.8);
    dragYaw *= k;
    dragPitch *= k;
}
```

- [ ] **Step 2: ループの回転代入を合成に変更**（現 index.html:2872-2878）

変更前:

```js
bear.rotation.z = Math.sin(t * 0.12) * 0.35 - 0.15;
bear.rotation.x = Math.sin(t * 0.09 + 0.7) * 0.25;
if (t < 0.1)
    bear.rotation.y = -0.6; // スタート時は左に向く
else bear.rotation.y += dt * 0.08;

if (isPreview) bear.rotation.set(0, 0, 0); // 撮影確認用に正面固定
```

変更後（`bearYaw` は宣言をブロック外の状態変数群へ・初期値 -0.6）:

```js
updateDragDecay(dt);
bear.rotation.z = Math.sin(t * 0.12) * 0.35 - 0.15;
if (t >= 0.1) bearYaw += dt * 0.08; // スタート時は左向き(-0.6)から回り始める
if (isPreview) {
    // 撮影確認用に正面固定（ドラッグ分だけ効かせて検証可能に）
    bear.rotation.set(dragPitch, dragYaw, 0);
} else {
    bear.rotation.x = Math.sin(t * 0.09 + 0.7) * 0.25 + dragPitch;
    bear.rotation.y = bearYaw + dragYaw;
}
```

状態変数の宣言（`let blinkUntil` があった付近＝ループ手前）に追加:

```js
let bearYaw = -0.6; // 揺蕩いのヨー角（スタート時は左向き）
```

- [ ] **Step 3: Playwright ドラッグで検証**

```bash
node -e '
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  p.setViewportSize({ width: 1280, height: 720 });
  await p.goto("http://localhost:8123/?preview&char=mspn", { waitUntil: "networkidle" });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: "$S/drag-0before.png", clip: {x:840,y:250,width:300,height:320} });
  await p.mouse.move(985, 400);
  await p.mouse.down();
  await p.mouse.move(1100, 430, { steps: 10 });
  await p.screenshot({ path: "$S/drag-1during.png", clip: {x:840,y:250,width:300,height:320} });
  await p.mouse.up();
  await p.waitForTimeout(3500);
  await p.screenshot({ path: "$S/drag-2after.png", clip: {x:840,y:250,width:300,height:320} });
  await b.close();
})();
'
```

期待: 0before=正面 / 1during=右へ約60°回った姿 / 2after=正面に復帰。
熊（`?preview` のみ）でも同様に1回実行。非ドラッグの熊リグレッションも1枚。

- [ ] **Step 4: コミット**

```bash
git add index.html
git commit -m "キャラをドラッグで回転できるように（離すとゆっくり元の揺蕩いへ復帰）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
