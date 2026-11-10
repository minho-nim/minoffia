import { describe, expect, it } from 'vitest';
import { autoApproved, autoExecutionTargets } from './autoExecute';
import type { WorkflowView } from './workflow';
import type { AgentAssignment, Approval } from './workflow-types';

const a = (id: string, status: AgentAssignment['dispatchStatus'] = 'awaiting_user_execution_approval') =>
  ({ id, taskId: 't', planRevision: 2, workItemId: id, assignee: 'codex', dispatchStatus: status }) as AgentAssignment;

function view(over: Partial<WorkflowView> = {}): WorkflowView {
  return {
    aApproved: true, planCurrent: true, prototypeFirst: false, pApproved: false,
    plan: { planRevision: 2, plan: { status: 'planned', work_items: [] } },
    assignments: [a('W1'), a('W2', 'ready')], eApproved: (id: string) => id === 'W2',
    ...over,
  } as unknown as WorkflowView;
}

describe('승인 3개: 실행 승인 자동 기록(v0.6.22)', () => {
  it('기획 승인된 최신 계획의 승인 대기 작업만', () => {
    expect(autoExecutionTargets(view()).map((x) => x.workItemId)).toEqual(['W1']);
  });
  it('기획 승인 전·지난 계획·확인 질문 계획이면 하지 않는다', () => {
    expect(autoExecutionTargets(view({ aApproved: false }))).toEqual([]);
    expect(autoExecutionTargets(view({ planCurrent: false }))).toEqual([]);
    expect(autoExecutionTargets(view({ plan: { planRevision: 2, plan: { status: 'needs_clarification' } } as unknown as WorkflowView['plan'] }))).toEqual([]);
  });
  it('견본 먼저 계획은 견본 승인 뒤에만', () => {
    expect(autoExecutionTargets(view({ prototypeFirst: true }))).toEqual([]);
    expect(autoExecutionTargets(view({ prototypeFirst: true, pApproved: true })).map((x) => x.workItemId)).toEqual(['W1']);
  });
  it('자동 기록인지 구분한다(손으로 승인한 것은 아님)', () => {
    const base = { taskId: 't', gate: 'E', decision: 'approved', approvedRevision: 2, workItemId: 'W1' };
    expect(autoApproved([{ ...base, scope: { auto: true } } as unknown as Approval], a('W1'))).toBe(true);
    expect(autoApproved([{ ...base, scope: {} } as unknown as Approval], a('W1'))).toBe(false);
  });
});
