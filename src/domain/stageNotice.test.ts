import { describe, expect, it } from 'vitest';
import { stageNotices } from './stageNotice';
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

  it('기획서가 오면 A 승인 버튼과 기획서 요약을 붙여 알린다', () => {
    const { seen } = stageNotices([task], data({}), {});
    const r = stageNotices([task], data({ specs: [spec(1)] }), seen);
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0].actions).toEqual(['A', 'open']);
    expect(r.notices[0].text).toContain('A 승인 대기');
    expect(r.notices[0].text).toContain('비밀번호 보기');
    // 같은 상태로 다시 보면 알리지 않는다
    expect(stageNotices([task], data({ specs: [spec(1)] }), r.seen).notices).toHaveLength(0);
  });

  it('A 승인 뒤에는 승인 버튼 없이 다음 할 일만', () => {
    const { seen } = stageNotices([task], data({ specs: [spec(1)] }), {});
    const r = stageNotices([task], data({ specs: [spec(1)], approvals: [approvalA] }), seen);
    expect(r.notices[0].actions).toEqual(['open']);
    expect(r.notices[0].id).not.toBe(stageNotices([task], data({ specs: [spec(1)] }), { t1: 'x' }).notices[0].id);
  });

  it('지운 업무는 기억에서 뺀다', () => {
    expect(stageNotices([], data({}), { t1: 'x' }).seen).toEqual({});
  });
});
