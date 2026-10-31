import { describe, expect, it } from 'vitest';
import type { Task } from '../domain/types';
import type { AgentAssignment, Approval, PmPlan, WorkflowData } from '../domain/workflow-types';
import { EMPTY_WORKFLOW } from '../domain/workflow-types';
import { speechFor } from './speech';

const task: Task = {
  id: 't1', projectId: 'p', title: '로그인 개선', description: '', type: 'planning', requestedType: 'auto',
  priority: 'normal', assignee: 'codex', routeReason: '', status: 'queued', dispatch: { state: 'none' },
  createdAt: '', updatedAt: '2026-10-31T00:00:00Z',
};
const spec = (planner: 'chatgpt_manual' | 'gemini_draft' = 'gemini_draft') => ({
  id: 's1', taskId: 't1', revision: 1, intent: 'change_request' as const, planner, userOriginalText: '원문',
  finalPrompt: 'p', changeScope: '', preserveConstraints: '', testCriteria: '', answer: '', createdAt: '',
});
const ok = (gate: Approval['gate'], rev: number, workItemId = ''): Approval => ({
  id: `${gate}${rev}${workItemId}`, taskId: 't1', gate, decision: 'approved', approvedRevision: rev, previousRevision: null, workItemId, scope: {}, actor: '', createdAt: '',
});
const plan: PmPlan = {
  id: 'p1', taskId: 't1', planRevision: 1, approvedSpecRevision: 1, targetBaseRevision: '', source: 'manual', createdAt: '',
  plan: { task_id: 't1', repository: 'o/r', target_base_revision: '', plan_revision: 1, status: 'planned', questions: [], work_items: [] },
};
const assignment = (dispatchStatus: AgentAssignment['dispatchStatus'], assignee: AgentAssignment['assignee'] = 'codex'): AgentAssignment => ({
  id: 'a1', taskId: 't1', planRevision: 1, workItemId: 'W1', title: 'w', assignee, executionMode: 'manual_handoff', dispatchStatus,
  statusSource: 'none', providerExecutionId: null, providerTaskUrl: null, actualProviderStatus: 'unknown', startedAt: null, lastVerifiedAt: null, updatedAt: '',
});
const data = (d: Partial<WorkflowData>): WorkflowData => ({ ...EMPTY_WORKFLOW, ...d });

describe('사무실 말풍선(v0.4.4)', () => {
  it('Gemini 초안이 오면 Gemini(스튜디오 A)가 기획 승인을 부탁한다', () => {
    const s = speechFor([task], data({ specs: [spec()] }));
    expect(s.get('studioA')).toEqual({ text: '기획?', label: '기획 승인해 주세요', kind: 'ask', taskId: 't1' });
    expect(speechFor([task], data({ specs: [spec('chatgpt_manual')] })).get('mina')?.text).toBe('기획?');
  });

  it('계획이 오면 Claude가 실행 승인을, 개발 중이면 맡은 AI가 "…"', () => {
    const base = { specs: [spec()], approvals: [ok('A', 1)], plans: [plan] };
    expect(speechFor([task], data({ ...base, assignments: [assignment('awaiting_user_execution_approval')] })).get('claude')?.text).toBe('실행?');
    const running = speechFor([task], data({ ...base, approvals: [ok('A', 1), ok('E', 1, 'W1')], assignments: [assignment('started')] }));
    expect(running.get('codex')).toMatchObject({ text: '…', kind: 'busy' });
    expect(running.has('claude')).toBe(false);
  });

  it('끝난 업무와 기록 없는 업무는 말하지 않는다', () => {
    expect(speechFor([{ ...task, status: 'done' }], data({ specs: [spec()] })).size).toBe(0);
    expect(speechFor([task], data({})).size).toBe(0);
  });
});
