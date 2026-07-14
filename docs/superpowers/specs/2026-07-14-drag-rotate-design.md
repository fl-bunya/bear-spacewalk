# キャラクターのドラッグ回転 設計

日付: 2026-07-14

## 目的

画面に浮かぶキャラクター（熊 / mspn 共通）をポインタでドラッグして回転させ、
好きな角度から眺められるようにする。手を離すと2〜3秒かけて元の「揺蕩い」姿勢に
滑らかに戻る（アンビエントな世界観を壊さないオモチャ的操作）。

## 入力と当たり判定

- `renderer.domElement` 上の `pointerdown` で `THREE.Raycaster` により
  `character.group` 配下（ヘルメット含む＝当たり判定が広く触りやすい）をヒット判定。
- ヒットしたらドラッグ開始・`setPointerCapture`。キャンバス外へ出ても追従する。
- Pointer Events を使い、マウスとタッチを同一コードで対応する。
- ホバー時（非ドラッグ中の `pointermove` でレイキャスト）はカーソルを `grab`、
  ドラッグ中は `grabbing` にする。

## 回転の合成

- ドラッグ量を `dragYaw`（横）/ `dragPitch`（縦、±0.8rad にクランプ）として保持。
- 感度は 1px ≈ 0.01rad 目安（実装時に目視調整可）。
- アニメーションループの揺蕩い回転と合成する：
  - `rotation.x = 揺蕩いsin + dragPitch`
  - `rotation.y = bearYaw + dragYaw`（既存の `rotation.y += dt*0.08` の積算は
    変数 `bearYaw` への積算に変更し、代入時に合成する）
  - `rotation.z` は揺蕩いのまま（ドラッグでは操作しない）
- `?preview` の正面固定時もオフセットは加算する（Playwright での検証を可能にする）。

## 離した後の復帰

- `pointerup` / `pointercancel` でドラッグ終了。
- `dragYaw` / `dragPitch` は毎フレーム指数減衰（時定数 ≈ 0.8s、約2.5秒で実質0）で
  0 へ戻す。バネの跳ね返りはなし。

## 非干渉

- 初回クリックの音楽開始、音量スライダー、曲送り UI、音楽ファイルの
  drag & drop（window の dragover/drop）はいずれも変更しない。
- カメラ遊覧・キャラの配置ロジックには触れない。

## 検証

- Playwright の `mouse.down/move/up` でキャラ位置をドラッグし、
  1) ドラッグ中に向きが変わる 2) リリース約3秒後に元の姿勢へ戻る、を
  スクリーンショットで確認（`?preview&char=mspn` と既定の熊の両方）。
- 熊のリグレッション（ドラッグしない状態の見た目不変）を確認。
