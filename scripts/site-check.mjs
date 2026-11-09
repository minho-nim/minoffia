// 화면 확인(v0.6.9, 소유자 "승인 전 중간에서 보는 건?" + 배포 뒤 운영 확인): 실제 사이트(미리보기·운영)를 열어
// PC 1400px·휴대폰 400px로 찍고 콘솔 오류·가로 넘침을 적는다. AI 호출 없음. GitHub Actions(site-check.yml)가 부른다.
// 사용: node scripts/site-check.mjs '<targets JSON [{"key":"after","url":"https://…"}]>' <출력 폴더>
// 미리보기는 Cloudflare 빌드가 끝나야 열리므로 200이 될 때까지 최대 8분 기다린다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const SIZES = [
  ['pc', 1400, 900],
  ['mobile', 400, 860],
];

/** https 주소만, 내부 주소는 받지 않는다 */
export function safeTargets(raw) {
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  return (Array.isArray(list) ? list : [])
    .filter((t) => t && /^(before|after|live)$/.test(t.key) && typeof t.url === 'string')
    .filter((t) => {
      try {
        const u = new URL(t.url);
        return u.protocol === 'https:' && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname) && u.hostname.includes('.');
      } catch {
        return false;
      }
    })
    .slice(0, 3);
}

async function waitUp(url, ms = 8 * 60_000) {
  const until = Date.now() + ms;
  let last = 0;
  while (Date.now() < until) {
    last = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) }).then((r) => r.status).catch(() => 0);
    if (last >= 200 && last < 400) return last;
    await new Promise((r) => setTimeout(r, 20_000));
  }
  return last;
}

async function main([raw, out]) {
  // require로 불러야 놓인 폴더의 node_modules와 전역 설치 둘 다 찾는다
  const { chromium } = createRequire(import.meta.url)('playwright');
  fs.mkdirSync(out, { recursive: true });
  const targets = safeTargets(raw);
  const result = { checkedAt: new Date().toISOString(), targets: [] };
  const browser = await chromium.launch();
  for (const t of targets) {
    const status = await waitUp(t.url);
    const entry = { key: t.key, url: t.url, status, shots: [] };
    if (status >= 200 && status < 400) {
      for (const [name, w, h] of SIZES) {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
        await page.goto(t.url, { waitUntil: 'networkidle', timeout: 30_000 }).catch((e) => errors.push(`열기 실패: ${e.message}`.slice(0, 200)));
        await page.waitForTimeout(800);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1).catch(() => false);
        const file = `${t.key}-${name}.jpg`;
        await page.screenshot({ path: path.join(out, file), type: 'jpeg', quality: 60 });
        entry.shots.push({ size: name, width: w, errors: errors.slice(0, 5), errorCount: errors.length, overflow, file });
        await page.close();
      }
    }
    result.targets.push(entry);
    console.log(`${t.key}: HTTP ${status}, ${entry.shots.map((s) => `${s.size} 오류 ${s.errorCount} 넘침 ${s.overflow ? '있음' : '없음'}`).join(' / ')}`);
  }
  await browser.close();
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main(process.argv.slice(2));
