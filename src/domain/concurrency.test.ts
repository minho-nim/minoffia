import { describe, expect, it } from 'vitest';
import { startBlocker } from './concurrency';
import type { AgentAssignment, PmPlan } from './workflow-types';

const a = (id: string, assignee: AgentAssignment['assignee'], dispatchStatus: AgentAssignment['dispatchStatus'] = 'ready'): AgentAssignment => ({
  id,
  taskId: 't',
  planRevision: 1,
  workItemId: id,
  title: `작업 ${id}`,
  assignee,
  executionMode: 'manual_handoff',
  dispatchStatus,
  statusSource: 'none',
  providerExecutionId: null,
  providerTaskUrl: null,
  actualProviderStatus: 'unknown',
  startedAt: null,
  lastVerifiedAt: null,
  updatedAt: '',
});

const plan = { plan: { work_items: [{ id: 'W1', dependencies: [] }, { id: 'W2', dependencies: [] }, { id: 'W3', dependencies: ['W1'] }] } } as unknown as PmPlan;

describe('startBlocker', () => {
  it('다른 AI끼리는 동시에, 같은 AI는 하나만', () => {
    const all = [a('W1', 'codex', 'started'), a('W2', 'claude'), a('W4', 'codex')];
    expect(startBlocker(all[1], all, plan)).toBeNull();
    expect(startBlocker(all[2], all, plan)).toContain('Codex가 이미 다른 작업(W1');
  });

  it('앞 작업이 끝나야 시작', () => {
    const all = [a('W1', 'codex', 'started'), a('W3', 'claude')];
    expect(startBlocker(all[1], all, plan)).toContain('앞 작업(W1)');
    const done = [a('W1', 'codex', 'completed'), a('W3', 'claude')];
    expect(startBlocker(done[1], done, plan)).toBeNull();
  });
});
