import { describe, expect, it } from 'vitest';
import { researchMessage, unannounced, type ClaudeResearch } from './claudeResearch';

const now = Date.parse('2026-11-14T10:00:00Z');
const row = (id: string, status: ClaudeResearch['status'], ago: number, expiresIn = 3600_000): ClaudeResearch => ({
  id, question: '오늘 원달러 환율', status, answer: status === 'done' ? '1,380원(11/14 기준)' : '', sources: [], sessionUrl: null,
  createdAt: new Date(now - ago).toISOString(), expiresAt: new Date(now - ago + expiresIn).toISOString(),
});

describe('Claude 웹 조사 답 띄우기', () => {
  it('끝난 것만, 한 번씩, 최근 2일만', () => {
    const rows = [row('a', 'done', 60_000), row('b', 'pending', 60_000), row('c', 'done', 3 * 86400_000), row('d', 'failed', 1000)];
    expect(unannounced(rows, new Set(), now).map((r) => r.id)).toEqual(['a', 'd']);
    expect(unannounced(rows, new Set(['a']), now).map((r) => r.id)).toEqual(['d']);
  });
  it('기한이 지난 기다림은 못 받았다고 알린다', () => {
    const late = row('e', 'pending', 3 * 3600_000, 2 * 3600_000);
    expect(unannounced([late], new Set(), now).map((r) => r.id)).toEqual(['e']);
    expect(researchMessage(late)).toContain('시간 안에');
  });
  it('답에는 질문을 앞에 붙인다', () => {
    expect(researchMessage(row('a', 'done', 0))).toBe('[웹 조사: 오늘 원달러 환율]\n1,380원(11/14 기준)');
  });
});
