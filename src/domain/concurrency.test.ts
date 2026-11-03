import { describe, expect, it } from 'vitest';
import { startBlocker, waitingOn } from './concurrency';
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
  it('AI별 상한까지는 동시에, 넘으면 기다림(기본 Codex 3)', () => {
    const all = [a('W1', 'codex', 'started'), a('W2', 'claude'), a('W4', 'codex'), a('W5', 'codex', 'started'), a('W6', 'codex', 'started')];
    expect(startBlocker(all[1], all, plan)).toBeNull();
    expect(startBlocker(all[2], all, plan)).toContain('3개 작업(W1, W5, W6)');
    expect(startBlocker(all[2], all, plan, { codex: 4 })).toBeNull();
    expect(startBlocker(all[1], [a('W9', 'claude', 'started'), all[1]], plan, { claude: 1 })).toContain('동시 상한 1개');
  });

  it('앞 작업이 끝나야 시작', () => {
    const all = [a('W1', 'codex', 'started'), a('W3', 'claude')];
    expect(startBlocker(all[1], all, plan)).toContain('앞 작업(W1)');
    const done = [a('W1', 'codex', 'completed'), a('W3', 'claude')];
    expect(startBlocker(done[1], done, plan)).toBeNull();
  });
});

describe('waitingOn(누가 누구를 기다리나, v0.5.22)', () => {
  it('안 끝난 앞 작업과 그 담당 AI, 끝나면 빈 목록', () => {
    const all = [a('W1', 'codex', 'started'), a('W3', 'claude')];
    expect(waitingOn(all[1], all, plan)).toEqual([{ workItemId: 'W1', agent: 'Codex (Linear)' }]);
    expect(waitingOn(all[0], all, plan)).toEqual([]);
    const done = [a('W1', 'codex', 'completed'), a('W3', 'claude')];
    expect(waitingOn(done[1], done, plan)).toEqual([]);
  });
});
