import { describe, expect, it } from 'vitest';
import { myTurns } from './myTurn';
import { stalls } from './stall';
import type { Task } from './types';
import type { AgentAssignment, Approval, PmPlan, WorkflowData } from './workflow-types';
import { EMPTY_WORKFLOW } from './workflow-types';

const NOW = Date.parse('2026-10-31T12:00:00Z');
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const task: Task = {
  id: 't1', projectId: 'p', title: 'README 한 줄', description: '', type: 'dev', requestedType: 'auto',
  priority: 'normal', assignee: 'claude', routeReason: '', status: 'in_progress', dispatch: { state: 'dispatched', at: ago(45) },
  createdAt: '', updatedAt: ago(45),
};
const spec = { id: 's1', taskId: 't1', revision: 1, intent: 'change_request' as const, planner: 'gemini_draft' as const, userOriginalText: '원문', finalPrompt: 'p', changeScope: '', preserveConstraints: '', testCriteria: '', answer: '', createdAt: '' };
const ok = (gate: Approval['gate'], rev: number, workItemId = ''): Approval => ({ id: gate + workItemId, taskId: 't1', gate, decision: 'approved', approvedRevision: rev, previousRevision: null, workItemId, scope: {}, actor: '', createdAt: ago(200) });
const plan: PmPlan = { id: 'p1', taskId: 't1', planRevision: 1, approvedSpecRevision: 1, targetBaseRevision: '', source: 'manual', createdAt: '', plan: { task_id: 't1', repository: 'o/r', target_base_revision: '', plan_revision: 1, status: 'planned', questions: [], work_items: [] } };
const started = (assignee: AgentAssignment['assignee'], min: number): AgentAssignment => ({
  id: 'a1', taskId: 't1', planRevision: 1, workItemId: 'W1', title: 'w', assignee, executionMode: 'manual_handoff', dispatchStatus: 'started',
  statusSource: 'server_verified', providerExecutionId: null, providerTaskUrl: null, actualProviderStatus: '', startedAt: ago(min), lastVerifiedAt: null, updatedAt: ago(min),
});
const data = (d: Partial<WorkflowData>): WorkflowData => ({ ...EMPTY_WORKFLOW, ...d });

describe('멈춤 자동 감지(v0.4.10)', () => {
  it('PM 계획이 30분 넘게 안 오면 계획[!]', () => {
    const s = stalls([task], data({ specs: [spec], approvals: [ok('A', 1)] }), NOW);
    expect(s).toEqual([expect.objectContaining({ word: '계획' })]);
    expect(stalls([{ ...task, dispatch: { state: 'dispatched', at: ago(10) } }], data({ specs: [spec], approvals: [ok('A', 1)] }), NOW)).toEqual([]);
  });

  it('Claude 결과가 3시간 넘게 없으면 개발[!], Codex는 하루', () => {
    const base = { specs: [spec], approvals: [ok('A', 1), ok('E', 1, 'W1')], plans: [plan] };
    expect(stalls([task], data({ ...base, assignments: [started('claude', 200)] }), NOW)).toEqual([expect.objectContaining({ word: '개발' })]);
    expect(stalls([task], data({ ...base, assignments: [started('claude', 60)] }), NOW)).toEqual([]);
    expect(stalls([task], data({ ...base, assignments: [started('codex', 200)] }), NOW)).toEqual([]);
  });

  it('내 차례에서 멈춤은 [!]로 맨 위', () => {
    const turns = myTurns([task], data({ specs: [spec], approvals: [ok('A', 1)] }), NOW);
    expect(turns[0]).toMatchObject({ word: '계획', alert: true });
  });
});
