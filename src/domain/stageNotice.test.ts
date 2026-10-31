import { describe, expect, it } from 'vitest';
import { noticeFor, stageNotices } from './stageNotice';
import type { Task } from './types';
import type { Approval, WorkflowData } from './workflow-types';
import { EMPTY_WORKFLOW } from './workflow-types';

const task: Task = {
  id: 't1', projectId: 'p', title: '로그인 개선', description: '', type: 'planning', requestedType: 'auto',
  priority: 'normal', assignee: 'codex', routeReason: '', status: 'queued', dispatch: { state: 'none' },
  createdAt: '', updatedAt: '',
};
const spec = (revision: number) => ({
  id: `s${revision}`, taskId: 't1', revision, intent: 'change_request' as const, planner: 'chatgpt_manual' as const, userOriginalText: '원문',
  finalPrompt: '로그인 화면에 비밀번호 보기 버튼 추가', changeScope: '', preserveConstraints: '', testCriteria: '', answer: '', createdAt: '',
});
const approvalA: Approval = {
  id: 'a', taskId: 't1', gate: 'A', decision: 'approved', approvedRevision: 1, previousRevision: null, workItemId: '', scope: {}, actor: '', createdAt: '',
};
const data = (d: Partial<WorkflowData>): WorkflowData => ({ ...EMPTY_WORKFLOW, ...d });

describe('단계 알림(v0.3.9)', () => {
  it('처음 보는 업무는 기억만 하고 알리지 않는다', () => {
    const r = stageNotices([task], data({}), {});
    expect(r.notices).toHaveLength(0);
    expect(r.seen.t1).toBeTruthy();
  });

  it('기획서가 와도 입력창에는 알리지 않는다(내 차례·말풍선이 보여 줌), 기억은 바뀐다', () => {
    const { seen } = stageNotices([task], data({}), {});
    const r = stageNotices([task], data({ specs: [spec(1)] }), seen);
    expect(r.notices).toHaveLength(0);
    expect(r.seen.t1).not.toBe(seen.t1);
  });

  it('A 승인 뒤 단계 변화도 알리지 않는다', () => {
    const { seen } = stageNotices([task], data({ specs: [spec(1)] }), {});
    expect(stageNotices([task], data({ specs: [spec(1)], approvals: [approvalA] }), seen).notices).toHaveLength(0);
  });

  it('noticeFor는 승인할 수 있으면 A 버튼과 기획서 요약을 붙인다', () => {
    const n = noticeFor(task, data({ specs: [spec(1)] }));
    expect(n.actions).toEqual(['A', 'open']);
    expect(n.text).toContain('비밀번호 보기');
  });

  it('지운 업무는 기억에서 뺀다', () => {
    expect(stageNotices([], data({}), { t1: 'x' }).seen).toEqual({});
  });

  it('Gemini 초안이 확인 질문을 남기면 질문과 "입력창에 답하기"를 알린다', () => {
    const { seen } = stageNotices([task], data({}), {});
    const ask = { ...spec(1), intent: 'ambiguous' as const, planner: 'gemini_draft' as const, finalPrompt: '', answer: '1. 어느 화면인가요?' };
    const r = stageNotices([task], data({ specs: [ask] }), seen);
    expect(r.notices[0].stage).toBe('needs_clarification');
    expect(r.notices[0].text).toContain('확인 질문:\n1. 어느 화면인가요?');
    expect(r.notices[0].text).toContain('입력창에 답을 쓰면 Gemini');
    // 같은 상태로 다시 보면 알리지 않는다
    expect(stageNotices([task], data({ specs: [ask] }), r.seen).notices).toHaveLength(0);
  });
});
