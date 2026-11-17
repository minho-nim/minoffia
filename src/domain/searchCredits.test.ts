import { describe, expect, it } from 'vitest';
import { creditLine, searchCreditsOf } from './searchCredits';

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
