// 検証用スクリーンショットヘルパー（実装計画の検証手順で使用）
// 使い方: node docs/superpowers/shot.js "<query>" <出力パス> [幅 高さ]
// 例:     node docs/superpowers/shot.js "preview&char=mspn" /path/to/out.png 390 844
const { chromium } = require("playwright");
(async () => {
    const [query, out, w, h] = process.argv.slice(2);
    const browser = await chromium.launch();
    const page = await browser.newPage();
    page.setViewportSize({
        width: Number(w) || 1280,
        height: Number(h) || 720,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("http://localhost:8123/?" + query, {
        waitUntil: "networkidle",
    });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: out });
    console.log("saved:", out);
    if (errors.length) {
        console.error("PAGE ERRORS:\n" + errors.join("\n"));
        process.exitCode = 1;
    }
    await browser.close();
})();
