const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setViewportSize({ width: 1280, height: 720 });

  await page.goto('http://localhost:8000?preview', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const screenshotPath = '/tmp/bear-spacewalk-screenshot.png';
  await page.screenshot({ path: screenshotPath });

  console.log(`Screenshot saved to ${screenshotPath}`);
  await browser.close();
})();
