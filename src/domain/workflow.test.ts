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

describe('수정 루프', () => {
  const result = (revision: number) => ({ id: `r${revision}`, taskId: 't1', revision, planRevision: 1, workItemId: '', source: 'manual' as const, summary: '', diff: '', testLog: '', remainingIssues: '', sha256: '', createdAt: '' });
  const rejectA = (revision: number, feedback: string): Approval => ({ ...ok('A', revision), id: `xA${revision}`, decision: 'rejected', scope: { feedback }, createdAt: '2026-10-29T10:00:00Z' });

  it('A에서 수정 요청하면 ChatGPT 재기획(planning)으로 돌아가고 내용을 기억한다', () => {
    const v = deriveWorkflow(task, data({ specs: [spec(1)], approvals: [rejectA(1, '범위를 좁혀줘')] }));
    expect(v.stage).toBe('planning');
    expect(v.plannerFeedback).toBe('범위를 좁혀줘');
    // 새 기획서 버전을 저장하면 이전 버전의 수정 요청은 더 이상 걸리지 않는다
    expect(deriveWorkflow(task, data({ specs: [spec(1), spec(2)], approvals: [rejectA(1, 'x')] })).stage).toBe('development_approval_pending');
  });

  it('결과 검토 수정 요청 → 새 계획 전까지 PM 대기, 옛 계획 실행·B 승인 불가', () => {
    const p1 = { ...plan(1, 1), createdAt: '2026-10-29T10:00:00Z' };
    const request = { id: 'q1', taskId: 't1', specRevision: 1, resultRevision: 1, feedback: '색은 그대로', createdAt: '2026-10-29T11:00:00Z' };
    const v = deriveWorkflow(task, data({ specs: [spec(1)], approvals: [ok('A', 1)], plans: [p1], assignments: [assignment(1)], results: [result(1)], revisionRequests: [request] }));
    expect(v.stage).toBe('pm_queued');
    expect(v.pendingRevision?.feedback).toBe('색은 그대로');
    expect(v.planCurrent).toBe(false);
    expect(canApprove(v, 'E', 'W1').ok).toBe(false);
    expect(canApprove(v, 'B').ok).toBe(false);

    // PM에 다시 보낸 뒤에는 세션 시작 단계
    const sent = { ...task, dispatch: { state: 'dispatched' as const, at: '2026-10-29T11:05:00Z' } };
    expect(deriveWorkflow(sent, data({ specs: [spec(1)], approvals: [ok('A', 1)], plans: [p1], results: [result(1)], revisionRequests: [request] })).stage).toBe('dispatching');

    // 새 계획(v2)이 오면 수정 요청은 해결되고 새 작업의 E 승인을 받는다
    const p2 = { ...plan(2, 1), createdAt: '2026-10-29T11:10:00Z' };
    const after = deriveWorkflow(task, data({ specs: [spec(1)], approvals: [ok('A', 1)], plans: [p1, p2], assignments: [assignment(1), assignment(2)], results: [result(1)], revisionRequests: [request] }));
    expect(after.pendingRevision).toBeNull();
    expect(after.planCurrent).toBe(true);
    expect(canApprove(after, 'E', 'W1').ok).toBe(true);
    // 수정을 요청한 옛 결과 v1은 B 대상이 아니다
    expect(after.stage).toBe('agent_handoff_pending');
    expect(canApprove(after, 'B').ok).toBe(false);
    const withNew = deriveWorkflow(task, data({ specs: [spec(1)], approvals: [ok('A', 1)], plans: [p1, p2], assignments: [assignment(2)], results: [result(1), result(2)], revisionRequests: [request] }));
    expect(withNew.stage).toBe('github_approval_pending');
    expect(canApprove(withNew, 'B').ok).toBe(true);
  });
});

describe('시안 먼저(P 게이트)', () => {
  const protoPlan = (): PmPlan => {
    const p = plan(1, 1);
    return { ...p, plan: { ...p.plan, development_mode: 'prototype_first' } };
  };
  const gemini = { ...assignment(1), id: 'g1', workItemId: 'W1', assignee: 'gemini' as const };
  const codex = { ...assignment(1), id: 'c1', workItemId: 'W2', assignee: 'codex' as const };
  const protoFile = {
    id: 'f1', taskId: 't1', kind: 'prototype' as const, resultRevision: null, planRevision: 1, position: 0, role: 'prototype' as const,
    note: '', fileName: 'proto.zip', mime: 'application/zip', sizeBytes: 10, sha256: 'x', storagePath: 'p', createdAt: '',
  };
  const base = { specs: [spec(1)], approvals: [ok('A', 1)], plans: [protoPlan()], assignments: [gemini, codex] };

  it('시안 없이는 P 불가, Codex E는 P 전에 불가, 시안 작업 E는 가능', () => {
    const v = deriveWorkflow(task, data(base));
    expect(v.prototypeFirst).toBe(true);
    expect(canApprove(v, 'P').ok).toBe(false);
    expect(canApprove(v, 'E', 'W2').ok).toBe(false);
    expect(canApprove(v, 'E', 'W1').ok).toBe(true);
  });

  it('시안을 올리면 P 가능, P 뒤에는 Codex E 가능', () => {
    const withFile = deriveWorkflow(task, data({ ...base, attachments: [protoFile] }));
    expect(canApprove(withFile, 'P').ok).toBe(true);
    const after = deriveWorkflow(task, data({ ...base, attachments: [protoFile], approvals: [ok('A', 1), ok('P', 1)] }));
    expect(after.pApproved).toBe(true);
    expect(canApprove(after, 'E', 'W2').ok).toBe(true);
    expect(canApprove(after, 'P').ok).toBe(false);
  });

  it('바로 개발 계획은 P가 없고 Codex E 바로 가능', () => {
    const v = deriveWorkflow(task, data({ ...base, plans: [plan(1, 1)] }));
    expect(v.prototypeFirst).toBe(false);
    expect(canApprove(v, 'P').ok).toBe(false);
    expect(canApprove(v, 'E', 'W2').ok).toBe(true);
  });
});
