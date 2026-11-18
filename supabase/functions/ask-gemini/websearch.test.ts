import { describe, expect, it } from 'vitest';
import { BODY_MAX, deepSearch, failMessage, isHit, outOfCredit, parseFirecrawl, parseScrape, parseTavily, pickPages, searchText, webContext, webQuery, webSearch, WEB_RULE, type SearchOutcome } from './websearch';

describe('웹 조사 검색(v0.7.51~ Tavily → Firecrawl)', () => {
  it('검색어 정리', () => {
    expect(webQuery('  a\n\nb  ')).toBe('a b');
    expect(webQuery('가'.repeat(400))).toHaveLength(300);
  });
  it('Tavily·Firecrawl 답 읽기(http 주소만, 5개까지)', () => {
    expect(parseTavily({ results: [{ title: 'T', url: 'https://a.com', content: '본문' }, { title: 'x', url: 'javascript:1', content: '' }] })).toMatchObject([{ title: 'T', url: 'https://a.com', text: '본문' }]);
    expect(parseFirecrawl({ success: true, data: { web: [{ title: 'F', url: 'https://b.com', description: '설명' }] } })).toMatchObject([{ title: 'F', url: 'https://b.com', text: '설명' }]);
    expect(parseFirecrawl({ data: [{ title: 'v1', url: 'https://c.com', description: 'd' }] })[0].url).toBe('https://c.com');
    expect(parseTavily({})).toEqual([]);
  });
  it('Tavily가 되면 Firecrawl은 부르지 않는다', async () => {
    const ok = (engine: 'tavily' | 'firecrawl'): SearchOutcome => ({ ok: true, engine, results: [{ title: '', url: 'https://x.com', text: '' }], status: 200, error: '' });
    let fc = 0;
    const r = await webSearch({ tavily: 'k', firecrawl: 'k' }, 'q', { tavily: async () => ok('tavily'), firecrawl: async () => (fc++, ok('firecrawl')) });
    expect(r.hit?.engine).toBe('tavily');
    expect(fc).toBe(0);
  });
  it('Tavily 사용량이 끝나면 Firecrawl로', async () => {
    const r = await webSearch({ tavily: 'k', firecrawl: 'k' }, 'q', {
      tavily: async () => ({ ok: false, engine: 'tavily', results: [], status: 432, error: 'limit' }),
      firecrawl: async () => ({ ok: true, engine: 'firecrawl', results: [{ title: '', url: 'https://y.com', text: '' }], status: 200, error: '' }),
    });
    expect(r.hit?.engine).toBe('firecrawl');
    expect(r.tries).toHaveLength(2);
  });
  it('키가 없으면 건너뛰고, 다 실패하면 이유를 알린다', async () => {
    const r = await webSearch({ tavily: '', firecrawl: 'k' }, 'q', { tavily: async () => { throw new Error('불리면 안 됨'); }, firecrawl: async () => ({ ok: false, engine: 'firecrawl', results: [], status: 402, error: '' }) });
    expect(r.hit).toBeNull();
    expect(failMessage(r.tries)).toContain('Firecrawl: 무료 사용량 끝');
    expect(failMessage([])).toContain('TAVILY_API_KEY');
    expect(outOfCredit(432)).toBe(true);
  });
  it('자료 칸과 규칙', () => {
    expect(webContext([{ title: 'T', url: 'https://x.com', text: '본문' }])).toContain('[1] T');
    expect(webContext([])).toBe('');
    expect(WEB_RULE).toContain('[1]');
  });
});

describe('3단계 조사: 알짜 2개 본문(v0.7.52)', () => {
  const r = (url: string, score: number) => ({ title: url, url, text: '요약', score });
  it('점수 순, 같은 사이트 하나, 영상·SNS·PDF 빼기', () => {
    const picks = pickPages([r('https://youtube.com/w', 0.99), r('https://a.com/1', 0.9), r('https://www.a.com/2', 0.8), r('https://b.com/x.pdf', 0.7), r('https://c.com', 0.6)]);
    expect(picks.map((p) => p.url)).toEqual(['https://a.com/1', 'https://c.com']);
  });
  it('본문 마크다운 정리(그림 빼기, 링크는 글자만, 길이 제한)', () => {
    expect(parseScrape({ data: { markdown: '# 제목\n![x](https://i.png)\n[링크](https://a.com) 본문\n\n\n\n끝' } })).toBe('# 제목\n\n링크 본문\n\n끝');
    expect(parseScrape({ data: { markdown: 'a'.repeat(BODY_MAX + 10) } })).toHaveLength(BODY_MAX);
    expect(parseScrape({})).toBe('');
  });
  it('찾고 → 2개 본문, 하나 실패하면 요약으로 남긴다', async () => {
    const res = await deepSearch({ tavily: 'k', firecrawl: 'k' }, 'q', {
      tavily: async () => ({ ok: true, engine: 'tavily', results: [r('https://a.com', 0.9), r('https://b.com', 0.8), r('https://c.com', 0.7)], status: 200, error: '' }),
      firecrawl: async () => { throw new Error('검색은 Tavily가 됐으니 불리면 안 됨'); },
      scrape: async (_k, url) => (url === 'https://a.com' ? { ok: true, body: '본문A', status: 200, error: '' } : { ok: false, body: '', status: 402, error: 'credit' }),
    });
    expect(res.pages).toBe(1);
    expect(res.hit?.results[0]).toMatchObject({ url: 'https://a.com', body: '본문A' });
    expect(res.scrapeFails).toEqual([{ url: 'https://b.com', status: 402, error: 'credit' }]);
  });
  it('본문을 붙여도 성공한 검색으로 기록된다(v0.7.82: 운영에서 성공한 Tavily 6건이 결과 없음으로 기록됨)', async () => {
    const res = await deepSearch({ tavily: 'k', firecrawl: 'k' }, 'q', {
      tavily: async () => ({ ok: true, engine: 'tavily', results: [r('https://a.com', 0.9), r('https://b.com', 0.8)], status: 200, error: '' }),
      firecrawl: async () => { throw new Error('x'); },
      scrape: async () => ({ ok: true, body: '본문', status: 200, error: '' }),
    });
    expect(res.tries[0]).not.toBe(res.hit); // 새 객체라 === 비교는 거짓
    expect(isHit(res.tries[0], res.hit)).toBe(true);
    expect(isHit(res.tries[0], null)).toBe(false);
  });
  it('Firecrawl 키가 없으면 본문 없이 요약만', async () => {
    let scraped = 0;
    const res = await deepSearch({ tavily: 'k', firecrawl: '' }, 'q', {
      tavily: async () => ({ ok: true, engine: 'tavily', results: [r('https://a.com', 0.9)], status: 200, error: '' }),
      firecrawl: async () => { throw new Error('x'); },
      scrape: async () => (scraped++, { ok: true, body: 'b', status: 200, error: '' }),
    });
    expect(res.pages).toBe(0);
    expect(scraped).toBe(0);
  });
});

describe('@Firecrawl이면 Firecrawl 먼저(v0.7.53)', () => {
  it('first = firecrawl', async () => {
    const order: string[] = [];
    const ok = (engine: 'tavily' | 'firecrawl'): SearchOutcome => ({ ok: true, engine, results: [{ title: '', url: 'https://x.com', text: '' }], status: 200, error: '' });
    const r = await webSearch({ tavily: 'k', firecrawl: 'k' }, 'q', { tavily: async () => (order.push('t'), ok('tavily')), firecrawl: async () => (order.push('f'), ok('firecrawl')) }, 'firecrawl');
    expect(r.hit?.engine).toBe('firecrawl');
    expect(order).toEqual(['f']);
  });
});

describe('남은 크레딧 읽기(v0.7.53)', () => {
  it('Tavily·Firecrawl 사용량 답', async () => {
    const { parseTavilyUsage, parseFirecrawlUsage } = await import('./websearch');
    expect(parseTavilyUsage({ account: { plan_usage: 40, plan_limit: 1000 } })).toEqual({ used: 40, limit: 1000 });
    expect(parseTavilyUsage({ key: { usage: 3, limit: 1000 } })).toEqual({ used: 3, limit: 1000 });
    expect(parseTavilyUsage({})).toBeNull();
    expect(parseFirecrawlUsage({ success: true, data: { remainingCredits: 990, planCredits: 1000 } })).toEqual({ used: 10, limit: 1000 });
    expect(parseFirecrawlUsage({ data: {} })).toBeNull();
  });
});

describe('배포 도구 함정(2026-11-17)', () => {
  it('export 뒤 첫 따옴표 글이 255바이트를 넘지 않는다(넘으면 배포 도구가 경로로 읽다 실패)', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    for (const dir of readdirSync('supabase/functions', { withFileTypes: true }).filter((d) => d.isDirectory())) {
      for (const f of readdirSync(`supabase/functions/${dir.name}`).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
        const s = readFileSync(`supabase/functions/${dir.name}/${f}`, 'utf8');
        for (const m of s.matchAll(/export[^'"`]*['"]([^'"]*)['"]/g)) {
          const longest = Math.max(...m[1].split('/').map((x) => new TextEncoder().encode(x).length));
          expect(longest, `${dir.name}/${f}: ${m[1].slice(0, 30)}`).toBeLessThan(255);
        }
      }
    }
  });
});

describe('검색어 만들기(v0.7.65)', () => {
  it('@부르기 표시는 검색어에서 뺀다', () => {
    expect(webQuery('@Tavily 무료 AI 서비스 알려줘')).toBe('무료 AI 서비스 알려줘');
    expect(webQuery('메일 a@b.com 확인')).toBe('메일 a@b.com 확인');
  });
  it('"다시·물어본" 같은 말이면 앞 사용자 질문을 붙인다', () => {
    const history = [
      { role: 'user', text: '무료로 쓸 수 있는 AI 서비스 뭐 있어?' },
      { role: 'model', text: '…' },
    ];
    expect(searchText('@Tavily ai서비스 물어본거 다시 대답해봐', history)).toBe('무료로 쓸 수 있는 AI 서비스 뭐 있어? ai서비스 물어본거 다시 대답해봐');
    expect(searchText('더', history)).toContain('무료로 쓸 수 있는 AI 서비스');
  });
  it('새 질문이면 앞 질문을 붙이지 않는다', () => {
    expect(searchText('서울 내일 날씨 알려줘요', [{ role: 'user', text: '무료 AI 서비스' }])).toBe('서울 내일 날씨 알려줘요');
    expect(searchText('아까 그거', [])).toBe('아까 그거');
  });
});
