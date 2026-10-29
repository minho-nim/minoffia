import { describe, expect, it } from 'vitest';
import type { Task } from './types';
import { canApprove, deriveWorkflow, officeStatus } from './workflow';
import type { Approval, PmPlan, WorkflowData } from './workflow-types';
import { EMPTY_WORKFLOW } from './workflow-types';

const task: Task = {
  id: 't1', projectId: 'p', title: '로그인 개선', description: '', type: 'planning', requestedType: 'auto',
  priority: 'normal', assignee: 'claude', routeReason: '', status: 'queued', dispatch: { state: 'none' },
  createdAt: '', updatedAt: '',
};
const spec = (revision: number, intent: 'change_request' | 'question' | 'ambiguous' = 'change_request', answer = '') => ({
  id: `s${revision}`, taskId: 't1', revision, intent, planner: 'chatgpt_manual' as const, userOriginalText: '원문',
  finalPrompt: 'p', changeScope: '', preserveConstraints: '', testCriteria: '', answer, createdAt: '',
});
const ok = (gate: Approval['gate'], approvedRevision: number, workItemId = ''): Approval => ({
  id: `${gate}${approvedRevision}${workItemId}`, taskId: 't1', gate, decision: 'approved', approvedRevision,
  previousRevision: null, workItemId, scope: {}, actor: '', createdAt: '',
});
const plan = (planRevision: number, approvedSpecRevision: number): PmPlan => ({
  id: `p${planRevision}`, taskId: 't1', planRevision, approvedSpecRevision, targetBaseRevision: '', source: 'manual', createdAt: '',
  plan: { task_id: 't1', repository: 'o/r', target_base_revision: '', plan_revision: planRevision, status: 'planned', questions: [], work_items: [] },
});
const assignment = (planRevision: number, dispatchStatus: 'awaiting_user_execution_approval' | 'started' = 'awaiting_user_execution_approval') => ({
  id: `a${planRevision}`, taskId: 't1', planRevision, workItemId: 'W1', title: 'w', assignee: 'codex' as const,
  executionMode: 'manual_handoff' as const, dispatchStatus, statusSource: 'none' as const, providerExecutionId: null,
  providerTaskUrl: null, actualProviderStatus: 'unknown', startedAt: null, lastVerifiedAt: null, updatedAt: '',
});
const data = (d: Partial<WorkflowData>): WorkflowData => ({ ...EMPTY_WORKFLOW, ...d });

describe('deriveWorkflow', () => {
  it('기획서가 없으면 접수, 단순 질문은 GPT 답변으로 완료(개발 경로 없음)', () => {
    expect(deriveWorkflow(task, data({})).stage).toBe('received');
    const v = deriveWorkflow(task, data({ specs: [spec(1, 'question', '답변')] }));
    expect(v.stage).toBe('completed');
    expect(canApprove(v, 'A').ok).toBe(false);
  });

  it('의도 불분명은 확인 필요, 개발 요청은 A 승인 대기', () => {
    expect(deriveWorkflow(task, data({ specs: [spec(1, 'ambiguous')] })).stage).toBe('needs_clarification');
    expect(deriveWorkflow(task, data({ specs: [spec(1)] })).stage).toBe('development_approval_pending');
  });

  it('A 승인 후 기획서를 고치면 이전 승인은 무효', () => {
    const v = deriveWorkflow(task, data({ specs: [spec(1), spec(2)], approvals: [ok('A', 1)] }));
    expect(v.aApproved).toBe(false);
    expect(v.aStale).toBe(true);
    expect(v.stage).toBe('development_approval_pending');
    expect(canApprove(v, 'A').ok).toBe(true);
  });

  it('PM 세션이 시작돼도 계획이 오기 전까지는 완료가 아니다', () => {
    const t = { ...task, dispatch: { state: 'dispatched' as const } };
    expect(deriveWorkflow(t, data({ specs: [spec(1)], approvals: [ok('A', 1)] })).stage).toBe('dispatching');
  });

  it('배정 완료 ≠ 실행 중: E 승인 전에는 실행 승인 대기', () => {
    const v = deriveWorkflow(task, data({ specs: [spec(1)], approvals: [ok('A', 1)], plans: [plan(1, 1)], assignments: [assignment(1)] }));
    expect(v.stage).toBe('agent_handoff_pending');
    expect(canApprove(v, 'E', 'W1').ok).toBe(true);
    expect(canApprove(v, 'E', 'W9').ok).toBe(false);
  });

  it('기획서가 바뀌면 옛 계획으로 실행 승인 불가', () => {
    const v = deriveWorkflow(task, data({ specs: [spec(1), spec(2)], approvals: [ok('A', 1), ok('A', 2)], plans: [plan(1, 1)], assignments: [assignment(1)] }));
    expect(v.planCurrent).toBe(false);
    expect(canApprove(v, 'E', 'W1').ok).toBe(false);
    expect(v.stage).toBe('pm_queued');
  });

  it('실행 기록 → 개발 중, 결과 → B 대기, B → C 대기, C → 완료', () => {
    const base = { specs: [spec(1)], plans: [plan(1, 1)] };
    expect(deriveWorkflow(task, data({ ...base, approvals: [ok('A', 1), ok('E', 1, 'W1')], assignments: [assignment(1, 'started')] })).stage).toBe('executing');
    const result = { id: 'r1', taskId: 't1', revision: 1, planRevision: 1, workItemId: 'W1', source: 'manual' as const, summary: '', diff: '', testLog: '', remainingIssues: '', sha256: '', createdAt: '' };
    const withResult = data({ ...base, results: [result], approvals: [ok('A', 1)] });
    const v1 = deriveWorkflow(task, withResult);
    expect(v1.stage).toBe('github_approval_pending');
    expect(canApprove(v1, 'C').ok).toBe(false);
    const v2 = deriveWorkflow(task, { ...withResult, approvals: [ok('A', 1), ok('B', 1)] });
    expect(v2.stage).toBe('deployment_approval_pending');
    expect(canApprove(v2, 'C').ok).toBe(true);
    expect(deriveWorkflow(task, { ...withResult, approvals: [ok('A', 1), ok('B', 1), ok('C', 1)] }).stage).toBe('completed');
  });

  it('새 결과가 오면 이전 B 승인으로 배포할 수 없다', () => {
    const r = (revision: number) => ({ id: `r${revision}`, taskId: 't1', revision, planRevision: 1, workItemId: '', source: 'manual' as const, summary: '', diff: '', testLog: '', remainingIssues: '', sha256: '', createdAt: '' });
    const v = deriveWorkflow(task, data({ specs: [spec(1)], approvals: [ok('A', 1), ok('B', 1)], results: [r(1), r(2)] }));
    expect(v.bApproved).toBe(false);
    expect(canApprove(v, 'C').ok).toBe(false);
  });
});

describe('officeStatus', () => {
  it('실제 실행·검토 단계만 캐릭터를 움직인다', () => {
    expect(officeStatus('executing', 'queued')).toBe('in_progress');
    expect(officeStatus('agent_handoff_pending', 'queued')).toBe('queued');
    expect(officeStatus('github_approval_pending', 'in_progress')).toBe('review');
    expect(officeStatus('integration_blocked', 'queued')).toBe('blocked');
    expect(officeStatus('completed', 'review')).toBe('done');
  });
});
