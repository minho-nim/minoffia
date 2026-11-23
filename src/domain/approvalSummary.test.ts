import { describe, expect, it } from 'vitest';
import { afterApprove, buildOk, fileBars, prChips, resultChips, riskChip, skippedNotes, testCount } from './approvalSummary';

const diff = (path: string, add: number, del = 0) => [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, ...Array(add).fill('+x'), ...Array(del).fill('-y')].join('\n');

describe('승인 카드 요약(v0.7.23)', () => {
  it('시험 로그에서 통과/전체 수를 읽는다', () => {
    expect(testCount('      Tests  529 passed (529)')).toEqual({ passed: 529, total: 529 });
    expect(testCount('      Tests  2 failed | 40 passed (42)')).toEqual({ passed: 40, total: 42 });
    expect(testCount('Tests:       1 failed, 41 passed, 42 total')).toEqual({ passed: 41, total: 42 });
    expect(testCount('  12 passing (30ms)\n  1 failing')).toEqual({ passed: 12, total: 13 });
    expect(testCount('===== 3 failed, 10 passed in 0.2s =====')).toEqual({ passed: 10, total: 13 });
    expect(testCount('없음')).toBeNull();
  });
  it('빌드 성공·실패 흔적', () => {
    expect(buildOk('✓ built in 2.47s')).toBe(true);
    expect(buildOk('error during build:')).toBe(false);
    expect(buildOk('typecheck ok')).toBeNull();
  });
  it('바뀐 곳: 화면만·DB 변경', () => {
    expect(riskChip(diff('src/components/A.tsx', 3))).toEqual({ label: '화면만 바뀜', tone: 'plain' });
    expect(riskChip(diff('supabase/migrations/0061_x.sql', 3))?.tone).toBe('warn');
    expect(riskChip(diff('src/domain/a.ts', 3))?.label).toBe('DB·서버 변경 없음');
    expect(riskChip('')).toBeNull();
  });
  it('결과 칩: 시험·빌드·평가·바뀐 곳', () => {
    const r = { diff: diff('src/App.tsx', 2), testLog: 'Tests  42 passed (42)\n✓ built in 1s' } as never;
    const review = { total: 91, panel: [{}, {}, {}] } as never;
    expect(resultChips(r, review).map((c) => c.label)).toEqual(['시험 42/42 ✓', '빌드 ✓', '평가 평균 91점', '화면만 바뀜']);
    expect(resultChips({ diff: '', testLog: '' } as never)[0]).toEqual({ label: '시험 기록 없음', tone: 'warn' });
    // 화면 평가(v0.7.40)
    const withScreen = (score: number, problems: string[]) => resultChips({ diff: '', testLog: 'Tests 1 passed (1)' } as never, { total: 90, screen: { score, problems, judge: '', errors: 0, overflow: false } } as never);
    expect(withScreen(92, [])).toContainEqual({ label: '화면 92점 ✓', tone: 'ok' });
    expect(withScreen(70, ['여백'])).toContainEqual({ label: '화면 70점 · 고칠 곳 1', tone: 'warn' });
    expect(withScreen(40, ['빈 화면'])).toContainEqual({ label: '화면 40점 · 고칠 곳 1', tone: 'bad' });
  });
  it('파일 막대: 많이 바뀐 순, 가장 큰 파일 기준 길이', () => {
    const f = fileBars([diff('a.ts', 10, 2), diff('b.ts', 2), diff('c.ts', 1)].join('\n'), 2);
    expect(f).toMatchObject({ files: 3, add: 13, del: 2, more: 1 });
    expect(f.bars[0]).toMatchObject({ path: 'a.ts', addPct: 83, delPct: 17 });
    expect(f.bars[1].path).toBe('b.ts');
  });
  it('PR 칩', () => {
    expect(prChips(null)[0].label).toBe('PR 검사 확인 전');
    const c = { ciState: 'success', merged: false, checks: [{ name: 'verify', status: 'completed', conclusion: 'success' }, { name: 'ui-check', status: 'completed', conclusion: 'neutral' }] } as never;
    expect(prChips(c).map((x) => x.label)).toEqual(['PR 검사 ✓', 'UI 검사 알림 있음']);
  });
  it('승인하면 한 줄', () => {
    expect(afterApprove('A', { picked: 'B' })).toContain('고른 시안 B');
    expect(afterApprove('B')).toContain('PR');
    expect(afterApprove('C')).toContain('운영');
  });
  it('건너뛴 칸(v0.7.42)', () => {
    expect(skippedNotes('A', { needsDesign: false, drafts: 0 })[0]).toContain('기존 화면을 고치는 일');
    expect(skippedNotes('A', { needsDesign: true, drafts: 0 })[0]).toContain('아직 없어요');
    expect(skippedNotes('A', { needsDesign: true, drafts: 2 })).toEqual([]);
    const review = { panel: [{ who: 'A', judge: 'Gemini · Studio A', status: 'done' }, { who: 'B', judge: 'Gemini · Studio A', status: 'done' }, { who: 'peer', judge: 'Claude', status: 'skipped' }], screen: null } as never;
    const notes = skippedNotes('B', { drafts: 0, review, resultAt: '2026-11-16T10:00:00Z', now: Date.parse('2026-11-16T11:00:00Z') });
    expect(notes).toEqual(['평가: Gemini B 자리를 Studio A가 대신 채점(Studio B 답을 못 받음)', '평가: Claude 빠짐', '화면 평가: 아직 없어요(결과 화면을 못 찍었거나 실패, 업무 카드의 결과 화면에서 이유 확인)']);
  });
});

import { changeLines } from './approvalSummary';
describe('바뀐 점 3줄(v0.8.6)', () => {
  it('글머리에서 3줄, 기록 줄은 빼고', () => {
    expect(changeLines('## 요약\n- 로그인 버튼을 주황으로\n- 휴대폰에서 한 줄로\n- 설정 탭 글씨 키움\n- 네 번째\n시험: 통과')).toEqual(['로그인 버튼을 주황으로', '휴대폰에서 한 줄로', '설정 탭 글씨 키움']);
  });
  it('글머리가 없으면 문장으로', () => {
    expect(changeLines('버튼 색을 바꿨습니다. 휴대폰에서도 확인했습니다.')).toEqual(['버튼 색을 바꿨습니다.', '휴대폰에서도 확인했습니다.']);
    expect(changeLines('')).toEqual([]);
  });
});
