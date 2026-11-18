import { describe, expect, it } from 'vitest';
import { byProject, dailyOf, estimateTokens, loggedTokens, rangeIso, rangeOf, summarize, usageText, type UsageInput } from './usageStats';

// 2026-11-18(수) 10시 KST
const now = new Date('2026-11-18T01:00:00Z');
const at = (kst: string) => new Date(Date.parse(`${kst}:00Z`) - 9 * 3600_000).toISOString();
const g = (slot: 1 | 2, purpose: string, tokens: number | null, when = '2026-11-18T09:00', ok = true) => ({ provider: 'gemini', keySlot: slot, purpose, model: 'm', ok, tokens, createdAt: at(when) });

const input: UsageInput = {
  calls: [
    g(1, 'question', 1018),
    g(1, 'research', 9000),
    g(1, 'research', 26882),
    g(2, 'review', 5000, '2026-11-17T09:00'),
    g(2, 'wiki', null),
    g(1, 'question', 99999, '2026-11-18T09:30', false),
    { provider: 'tavily', keySlot: null, purpose: 'research', model: 'search', ok: true, tokens: null, createdAt: at('2026-11-18T09:00') },
    { provider: 'firecrawl', keySlot: null, purpose: 'research', model: 'scrape', ok: true, tokens: null, createdAt: at('2026-11-18T09:00') },
    { provider: 'firecrawl', keySlot: null, purpose: 'research', model: 'search', ok: true, tokens: null, createdAt: at('2026-11-18T09:00') },
  ],
  runs: [
    { agent: 'claude', taskId: 't1', createdAt: at('2026-11-18T08:00') },
    { agent: 'codex', taskId: 't1', createdAt: at('2026-11-18T08:00') },
    { agent: 'codex', taskId: 'gone', createdAt: at('2026-11-16T08:00') },
  ],
  results: [
    { taskId: 't1', source: 'claude_session_auto', summary: '버튼 고침\n쓴 토큰: 12,345', diff: 'x'.repeat(300), testLog: '', createdAt: at('2026-11-18T09:00') },
    { taskId: 't1', source: 'codex_linear_auto', summary: 's'.repeat(30), diff: 'd'.repeat(270), testLog: '', createdAt: at('2026-11-18T09:00') },
  ],
  tasks: [{ id: 't1', title: '버튼 색', projectId: 'p1' }],
  projects: [{ id: 'p1', name: 'MinSnakey' }],
  promptChars: { t1: 300 },
};

describe('기간', () => {
  it('일간·주간(월~일)·월간과 지난 기간', () => {
    expect(rangeOf('day', now)).toMatchObject({ from: '2026-11-18', to: '2026-11-18', label: '11월 18일(수)' });
    expect(rangeOf('week', now)).toMatchObject({ from: '2026-11-16', to: '2026-11-22' });
    expect(rangeOf('week', now, -1)).toMatchObject({ from: '2026-11-09', to: '2026-11-15' });
    expect(rangeOf('month', now)).toMatchObject({ from: '2026-11-01', to: '2026-11-30', label: '2026년 11월' });
    expect(rangeOf('month', now, -11)).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
    expect(rangeIso(rangeOf('day', now))).toEqual({ fromIso: '2026-11-17T15:00:00.000Z', toIso: '2026-11-18T15:00:00.000Z' });
  });
});

describe('사용량 한 계산', () => {
  const day = summarize(input, rangeOf('day', now));
  const row = (id: string) => day.find((x) => x.id === id)!;

  it('Studio는 키별 횟수·토큰, 펼치면 일 종류별(실패는 빼고)', () => {
    expect(row('studioA')).toMatchObject({ n: 3, amount: 36900, source: 'svc' });
    expect(row('studioA').work.map((w) => [w.label, w.n, w.tokens])).toEqual([['웹 조사', 2, 35882], ['질문', 1, 1018]]);
    expect(row('studioB')).toMatchObject({ n: 1, amount: 0 });
    expect(row('studioB').work[0].label).toBe('위키 정리');
  });

  it('0회여도 토큰 수를 보인다', () => {
    const empty = summarize({ ...input, calls: [], runs: [], results: [] }, rangeOf('day', now));
    expect(empty.map(usageText)).toEqual(['0회 · 0 토큰', '0회 · 0 토큰', '0회 · 0 토큰', '0회 · 0 토큰', '0회 · 크레딧 0', '0회 · 크레딧 0']);
  });

  it('Claude는 세션이 적은 쓴 토큰, Codex는 글자 수 추정(약)', () => {
    expect(row('claude')).toMatchObject({ n: 1, amount: 12345, source: 'log' });
    expect(row('codex')).toMatchObject({ n: 1, amount: estimateTokens(300 + 30 + 270), source: 'est' });
    expect(usageText(row('codex'))).toBe('1회 · 약 200 토큰');
    expect(row('claude').work[0]).toMatchObject({ label: 'MinSnakey · 버튼 색', n: 1, tokens: 12345 });
  });

  it('검색은 크레딧(Firecrawl 검색 2·본문 1)', () => {
    expect(row('search')).toMatchObject({ n: 1, amount: 1 });
    expect(row('firecrawl')).toMatchObject({ n: 2, amount: 3 });
  });

  it('주간·날짜별·프로젝트별도 같은 계산', () => {
    const week = summarize(input, rangeOf('week', now));
    expect(week.find((x) => x.id === 'codex')!.n).toBe(2);
    expect(week.find((x) => x.id === 'codex')!.work.map((w) => w.label)).toContain('지운·시험 업무');
    const daily = dailyOf(input, rangeOf('week', now));
    expect(daily).toHaveLength(7);
    expect(daily[1].rows.studioB).toEqual({ n: 1, amount: 5000 });
    expect(daily.reduce((a, d) => a + d.rows.studioA.amount, 0)).toBe(week.find((x) => x.id === 'studioA')!.amount);
    expect(byProject(input, rangeOf('week', now))).toEqual([{ name: 'MinSnakey', claude: 1, codex: 1 }, { name: '지운·시험 업무', claude: 0, codex: 1 }]);
  });

  it('쓴 토큰 줄 읽기', () => {
    expect(loggedTokens('요약\n쓴 토큰: 1,234')).toBe(1234);
    expect(loggedTokens('쓴 토큰：987')).toBe(987);
    expect(loggedTokens('쓴 토큰: 0')).toBeNull();
    expect(loggedTokens('토큰 많이 씀')).toBeNull();
  });
});
