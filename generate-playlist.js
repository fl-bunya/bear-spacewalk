// music/ 内の音声ファイルを列挙して music/playlist.json を書き出す。
// Cloudflare Pages 等の静的ホスティングはディレクトリ一覧を返さないため、
// デプロイ前にこのスクリプトで曲一覧を固定する（ローカルサーバでは不要）。
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "music");
const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(mp3|m4a|ogg|wav|flac)$/i.test(f))
    .sort();
fs.writeFileSync(
    path.join(dir, "playlist.json"),
    JSON.stringify(files, null, 2) + "\n",
);
console.log(`music/playlist.json を生成: ${files.length}曲`);
files.forEach((f) => console.log(`  ${f}`));
