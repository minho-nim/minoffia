import { describe, expect, it } from 'vitest';
import { kstDay, remainingToday, runsToday } from './usage';

describe('usage', () => {
  it('KST 자정 기준으로 날짜를 나눈다', () => {
    expect(kstDay(new Date('2026-10-28T14:59:00Z'))).toBe('2026-10-28');
    expect(kstDay(new Date('2026-10-28T15:00:00Z'))).toBe('2026-10-29');
  });

  it('오늘 실행만 세고 남은 횟수를 계산한다', () => {
    const now = new Date('2026-10-29T03:00:00Z');
    const usage = [
      { id: '1', agent: 'claude' as const, taskId: null, kind: 'cloud' as const, day: '2026-10-29', createdAt: '' },
      { id: '2', agent: 'claude' as const, taskId: null, kind: 'cloud' as const, day: '2026-10-28', createdAt: '' },
    ];
    expect(runsToday(usage, 'claude', now)).toBe(1);
    expect(remainingToday(usage, 'claude', now)).toBe(1);
    expect(remainingToday(usage, 'mina', now)).toBe(Infinity);
  });
});
