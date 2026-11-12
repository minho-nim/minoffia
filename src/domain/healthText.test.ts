import { describe, expect, it } from 'vitest';
import { appMapKinds, koIssue, parseAppMap, parseHealth } from './healthText';

describe('앱 점검 결과(v0.5.53)', () => {
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

describe('스킬 모음 저장소 지도(v0.6.70)', () => {
  it('by=skill이면 칸을 스킬 분류로 두고 모르는 분류는 기타로', () => {
    const m = parseAppMap({ summary: 's', by: 'skill', parts: [{ name: '버그 고치기', kind: '시험·점검', what: 'x', folder: '.claude/skills/a', files: [] }, { name: 'b', kind: '화면', what: '', folder: '', files: [] }] });
    expect(m?.by).toBe('skill');
    expect(m?.parts.map((p) => p.kind)).toEqual(['시험·점검', '기타']);
    expect(appMapKinds(m!)).toContain('화면·디자인');
  });
  it('앱 지도는 그대로(화면·기능·서버…)', () => {
    const m = parseAppMap({ summary: '', by: 'ai', parts: [{ name: 'a', kind: '시험·점검', what: '', folder: '', files: [] }] });
    expect(m?.parts[0].kind).toBe('기능');
    expect(appMapKinds(m!)).toEqual(['화면', '기능', '서버', '데이터', '설정']);
  });
});
