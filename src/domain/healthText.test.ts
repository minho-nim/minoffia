import { describe, expect, it } from 'vitest';
import { koIssue, parseHealth } from './healthText';

describe('앱 건강 검진 결과(v0.5.53)', () => {
  it('종류별로 한국어로 바꾸고 모르는 종류는 원문', () => {
    expect(koIssue({ kind: 'large-file', severity: 'low', title: '3 files are very large', detail: 'x', items: [] })).toMatchObject({ title: '너무 큰 파일이 있어요', severity: '사소' });
    expect(koIssue({ kind: 'new-kind', severity: 'high', title: 'Something', detail: 'd', items: [] })).toEqual({ title: 'Something', detail: 'd', severity: '중요' });
  });
  it('모양이 이상하면 버리고, 맞으면 정리한다', () => {
    expect(parseHealth(null)).toBeNull();
    expect(parseHealth({ checkedAt: 'x' })).toBeNull();
    const r = parseHealth({ checkedAt: '2026-11-08T00:00:00Z', head: 'abc', files: 10, summary: { high: 1, medium: -2, low: 'x' }, issues: [{ kind: 'secret', severity: 'high', title: 't', detail: 'd', items: ['a.ts', 3] }, 5] });
    expect(r).toMatchObject({ summary: { high: 1, medium: 0, low: 0 }, issues: [{ kind: 'secret', items: ['a.ts', '3'] }] });
  });
});
