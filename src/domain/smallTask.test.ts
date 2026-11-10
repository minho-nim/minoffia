import { describe, expect, it } from 'vitest';
import { parsePmPlan } from './pmPlan';
import { checkSmallTask, smallPlanText } from './smallTask';
import type { TaskSpec } from './workflow-types';

const spec = (o: Partial<TaskSpec> = {}): TaskSpec => ({
  id: 's1',
  taskId: 't1',
  revision: 1,
  intent: 'change_request',
  planner: 'gemini_draft',
  userOriginalText: '원문',
  finalPrompt: 'README에 설치 방법 한 줄 추가',
  changeScope: 'README.md',
  preserveConstraints: '다른 문단은 그대로',
  testCriteria: '- README에 설치 줄이 있다',
  answer: '',
  sizeHint: { difficulty: 2, single_task: true, needs_design: false },
  createdAt: '',
  ...o,
});

describe('작은 일 바로 배정(v0.5.20)', () => {
  it('쉬운 일은 Gemini, 보통(4~5)은 Codex', () => {
    expect(checkSmallTask(spec(), 'me/app')).toEqual({ ok: true, preference: 'codex_primary', difficulty: 2 });
    expect(checkSmallTask(spec(), 'me/app', { codex: true })).toMatchObject({ ok: true, preference: 'claude_support' });
    expect(checkSmallTask(spec(), 'me/app', { codex: true, claude: true })).toMatchObject({ ok: true, preference: 'gemini_dev' });
    expect(checkSmallTask(spec({ sizeHint: { difficulty: 5, single_task: true, needs_design: false } }), 'me/app')).toMatchObject({ ok: true, preference: 'codex_primary' });
  });

  it('AI Office 저장소나 Studio A·B 휴가면 쉬운 일도 Codex', () => {
    expect(checkSmallTask(spec(), 'minho-nim/MinLab-AI-Office')).toMatchObject({ ok: true, preference: 'codex_primary' });
    expect(checkSmallTask(spec(), 'me/app', { gemini: true })).toMatchObject({ ok: true, preference: 'codex_primary' });
    expect(checkSmallTask(spec({ sizeHint: { difficulty: 4, single_task: true, needs_design: false } }), 'me/app', { codex: true, claude: true })).toEqual({ ok: false, why: ['맡을 AI가 휴가'] });
  });

  it('힌트·범위·위험한 말·저장소 중 하나라도 걸리면 PM', () => {
    const no = (s: TaskSpec, repo: string | null = 'me/app') => {
      const r = checkSmallTask(s, repo);
      return r.ok ? [] : r.why;
    };
    expect(no(spec({ sizeHint: null }))).toContain('크기 힌트 없음');
    expect(no(spec({ sizeHint: { difficulty: 6, single_task: true, needs_design: false } }))).toContain('난이도 6');
    expect(no(spec({ sizeHint: { difficulty: 2, single_task: false, needs_design: true } }))).toEqual(['작업 여러 개', '새 디자인 필요']);
    expect(no(spec({ intent: 'asset_request' }))).toContain('개발·수정 요청이 아님');
    expect(no(spec({ changeScope: 'a\nb\nc\nd' }))).toContain('바꿀 범위가 김');
    expect(no(spec({ testCriteria: '1\n2\n3\n4\n5\n6\n7' }))).toContain('확인할 것이 많음');
    expect(no(spec({ testCriteria: '1\n2\n3\n4\n5\n6' }))).not.toContain('확인할 것이 많음');
    expect(no(spec({ finalPrompt: '로그인 화면 버튼 색 바꾸기' }))).toContain('로그인·권한');
    expect(no(spec({ finalPrompt: 'DB에 칸 하나 추가' }))).toContain('DB');
    expect(no(spec({ finalPrompt: '모든 화면 글꼴 바꾸기' }))).toContain('전체 화면');
    expect(no(spec(), null)).toContain('저장소 없음');
  });

  it('만든 계획은 PM 계획 검사를 지나고, 작업 하나·실행 승인 필요', () => {
    const c = checkSmallTask(spec(), 'me/app');
    if (!c.ok) throw new Error('작은 일이어야 함');
    const r = parsePmPlan(smallPlanText('t1', 'me/app', spec(), c), 't1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.work_items).toHaveLength(1);
    expect(r.plan.work_items[0]).toMatchObject({ assignee_preference: 'codex_primary', difficulty: 2, requires_execution_approval: true, acceptance_tests: ['README에 설치 줄이 있다'] });
    expect(r.plan.development_mode).toBe('direct');
  });
});
