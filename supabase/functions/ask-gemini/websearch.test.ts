import { describe, expect, it } from 'vitest';
import { failMessage, outOfCredit, parseFirecrawl, parseTavily, webContext, webQuery, webSearch, WEB_RULE, type SearchOutcome } from './websearch';

describe('웹 조사 검색(v0.7.51 Tavily → Firecrawl)', () => {
  it('검색어 정리', () => {
    expect(webQuery('  a\n\nb  ')).toBe('a b');
    expect(webQuery('가'.repeat(400))).toHaveLength(300);
  });
  it('Tavily·Firecrawl 답 읽기(http 주소만, 5개까지)', () => {
    expect(parseTavily({ results: [{ title: 'T', url: 'https://a.com', content: '본문' }, { title: 'x', url: 'javascript:1', content: '' }] })).toEqual([{ title: 'T', url: 'https://a.com', text: '본문' }]);
    expect(parseFirecrawl({ success: true, data: { web: [{ title: 'F', url: 'https://b.com', description: '설명' }] } })).toEqual([{ title: 'F', url: 'https://b.com', text: '설명' }]);
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
