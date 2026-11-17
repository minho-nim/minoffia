import { describe, expect, it } from 'vitest';
import { EMPTY_WORKFLOW } from './workflow-types';
import { flowNow } from './flowNow';

describe('지금 주고받는 장면(v0.7.62)', () => {
  it('웹 조사: 찾는 중이면 Tavily 칸, 쓰는 중이면 Gemini 칸', () => {
    expect(flowNow(EMPTY_WORKFLOW, { step: 'search', studio: 'studioA' })).toMatchObject({ steps: ['search', 'firecrawl', 'studioA'], active: 0 });
    expect(flowNow(EMPTY_WORKFLOW, { step: 'write', studio: 'studioB' })).toMatchObject({ steps: ['search', 'firecrawl', 'studioB'], active: 2 });
  });
  it('업무: 앞 작업 AI → 기다리는 AI, 없으면 null', () => {
    const base = { taskId: 't', planRevision: 1, executionMode: 'manual_handoff', statusSource: 'server_verified', providerExecutionId: null, providerTaskUrl: null, actualProviderStatus: '', startedAt: null, lastVerifiedAt: null, updatedAt: '' };
    const wf = {
      ...EMPTY_WORKFLOW,
      plans: [{ id: 'p', taskId: 't', planRevision: 1, plan: { work_items: [{ id: 'W1', dependencies: [] }, { id: 'W2', dependencies: ['W1'] }] } }],
      assignments: [{ ...base, id: '1', workItemId: 'W1', assignee: 'codex', dispatchStatus: 'started' }, { ...base, id: '2', workItemId: 'W2', assignee: 'claude', dispatchStatus: 'proposed' }],
    } as never;
    expect(flowNow(wf, null)).toMatchObject({ steps: ['codex', 'claude'], active: 0 });
    expect(flowNow(EMPTY_WORKFLOW, null)).toBeNull();
  });
});
