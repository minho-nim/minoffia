import { describe, expect, it } from 'vitest';
import { creditLine, searchCreditsOf, trustCredits } from './searchCredits';

describe('웹 검색 크레딧(v0.7.53)', () => {
  it('직접 센 추정: Tavily 검색 1, Firecrawl 검색 2·본문 1', () => {
    expect(searchCreditsOf([{ provider: 'tavily', model: 'search' }, { provider: 'firecrawl', model: 'scrape' }, { provider: 'firecrawl', model: 'scrape' }, { provider: 'firecrawl', model: 'search' }, { provider: 'gemini', model: 'x' }])).toEqual({ tavily: 1, firecrawl: 4 });
  });
  it('실제 숫자가 있으면 그걸, 없으면 추정', () => {
    expect(creditLine('tavily', 12, { used: 40, limit: 1000 })).toBe('이번 달 남은 크레딧 960 / 1,000');
    expect(creditLine('firecrawl', 12, null)).toBe('이번 달 남은 크레딧 약 988 / 1,000(추정)');
    expect(creditLine('tavily', undefined, null)).toBe('사용 기록 없음');
  });
});

describe('오늘 조사 횟수(v0.7.55)', () => {
  it('KST 오늘 것만, 공급자별', async () => {
    const { searchTodayOf } = await import('./searchCredits');
    const now = new Date('2026-11-17T05:00:00Z'); // KST 14시
    expect(searchTodayOf([{ provider: 'tavily', model: 'search', created_at: '2026-11-17T01:00:00Z' }, { provider: 'firecrawl', model: 'scrape', created_at: '2026-11-17T02:00:00Z' }, { provider: 'tavily', model: 'search', created_at: '2026-11-16T10:00:00Z' }], now)).toEqual({ tavily: 1, firecrawl: 1 });
  });
});

describe('크레딧이 빠지는 요청·서비스 숫자 믿기(v0.7.88)', () => {
  it('실패해도 서비스에 닿은 요청(403·408)은 세고, 401·402·429·접속 실패는 뺀다', () => {
    const rows = [
      { provider: 'firecrawl', model: 'scrape', ok: true, http_status: 200 },
      { provider: 'firecrawl', model: 'scrape', ok: false, http_status: 403 },
      { provider: 'firecrawl', model: 'scrape', ok: false, http_status: 408 },
      { provider: 'firecrawl', model: 'scrape', ok: false, http_status: 402 },
      { provider: 'firecrawl', model: 'scrape', ok: false, http_status: null },
      { provider: 'tavily', model: 'search', ok: false, http_status: 429 },
    ];
    expect(searchCreditsOf(rows)).toEqual({ tavily: 0, firecrawl: 3 });
  });
  it('서비스 숫자가 앱 기록보다 적으면 앱 기록으로', () => {
    expect(trustCredits({ used: 0, limit: 1000 }, 12)).toEqual({ used: 12, limit: 1000 });
    expect(trustCredits({ used: 9, limit: 1000 }, 6)).toEqual({ used: 9, limit: 1000 });
    expect(trustCredits(null, 6)).toBeNull();
  });
});
