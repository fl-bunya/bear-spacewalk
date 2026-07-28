// music/ 内の音声ファイルを列挙して music/playlist.json を書き出す。
// Cloudflare Pages 等の静的ホスティングはディレクトリ一覧を返さないため、
// デプロイ前にこのスクリプトで曲一覧を固定する（ローカルサーバでは不要）。
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "music");
const found = fs
    .readdirSync(dir)
    .filter((f) => /\.(mp3|m4a|ogg|wav|flac)$/i.test(f));

// 既存 playlist.json の並び順を保持し、新規ファイルはソートして末尾に追加する
// （手動で並び替えた順序を build で失わないため）
let existing = [];
try {
    existing = JSON.parse(fs.readFileSync(path.join(dir, "playlist.json")));
} catch {}
const files = existing
    .filter((f) => found.includes(f))
    .concat(found.filter((f) => !existing.includes(f)).sort());
fs.writeFileSync(
    path.join(dir, "playlist.json"),
    JSON.stringify(files, null, 2) + "\n",
);
console.log(`music/playlist.json を生成: ${files.length}曲`);
files.forEach((f) => console.log(`  ${f}`));
