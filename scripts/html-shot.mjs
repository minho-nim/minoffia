// HTML 한 장을 그림(PNG)으로 찍는다(v0.5.62, 옵시디언 노트용). GitHub Actions에서 playwright가 있는 폴더에서 부른다. AI 없음.
// 사용: node html-shot.mjs <입력.html> <출력.png> [폭=1400]
import { chromium } from 'playwright';
const [input, output, width = '1400'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 1 });
await page.goto(`file://${input}`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.screenshot({ path: output, fullPage: true });
await browser.close();
