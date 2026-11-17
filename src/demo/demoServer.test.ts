import { describe, expect, it } from 'vitest';
import { EMPTY_WORKFLOW } from '../domain/workflow-types';
import type { Snapshot } from '../domain/types';
import { advanceDemo, demoNext, demoTask, newDemoTask, DEMO_TAG } from './demoServer';

const snapOf = (tasks: Snapshot['tasks'], wf = {}): Snapshot => ({ projects: [], tasks, usage: [], workflow: { ...EMPTY_WORKFLOW, ...wf } } as unknown as Snapshot);

describe('체험 업무(v0.7.7)', () => {
  it('체험 업무를 만들고, 기획서가 없으면 먼저 기획서를 쓴다', () => {
    const t = newDemoTask('p1', '2026-11-13T00:00:00Z');
    expect(t.title.startsWith(DEMO_TAG)).toBe(true);
    const s = snapOf([t]);
    expect(demoTask(s)?.id).toBe(t.id);
    expect(demoNext(t, s)).toBe('spec');
  });
  it('끝난 체험 업무는 다시 잡지 않는다', () => {
    const t = { ...newDemoTask('p1'), status: 'done' as const };
    expect(demoTask(snapOf([t]))).toBeNull();
  });
});

describe('체험 넘겨주기(v0.7.58)', () => {
  it('W1이 끝날 때가 되면 W2(기다리던 작업)에게 넘긴다', () => {
    const t = newDemoTask('p1', '2026-11-13T00:00:00Z');
    const base = { taskId: t.id, planRevision: 1, executionMode: 'manual_handoff', statusSource: 'server_verified', providerExecutionId: null, providerTaskUrl: null, actualProviderStatus: '', lastVerifiedAt: null, updatedAt: '2026-11-13T00:00:00Z' };
    const spec = { id: 's', taskId: t.id, revision: 1, intent: 'change_request', createdAt: '2026-11-13T00:00:00Z' };
    const appr = { id: 'a', taskId: t.id, gate: 'A', decision: 'approved', approvedRevision: 1, createdAt: '2026-11-13T00:00:00Z' };
    const plan = { id: 'p', taskId: t.id, planRevision: 1, approvedSpecRevision: 1, plan: { status: 'planned', work_items: [] }, createdAt: '2026-11-13T00:00:00Z' };
    const wf = (w2: string) => ({ specs: [spec], approvals: [appr], plans: [plan], assignments: [{ ...base, id: '1', workItemId: 'W1', assignee: 'codex', dispatchStatus: 'started', startedAt: '2026-11-13T00:00:00Z' }, { ...base, id: '2', workItemId: 'W2', assignee: 'claude', dispatchStatus: w2, startedAt: null }] });
    const later = Date.parse('2026-11-13T00:00:11Z');
    expect(demoNext(t, snapOf([t], wf('proposed')), later)).toBe('handoff');
    expect(demoNext(t, snapOf([t], wf('proposed')), Date.parse('2026-11-13T00:00:01Z'))).toBeNull();
  });
});

describe('체험 업무 담당(v0.7.66, 키 나눠 쓰기)', () => {
  it('기획서 초안은 업무 담당 Studio B가 쓴다고 안내한다', async () => {
    const task = newDemoTask('p1', '2026-11-17T00:00:00Z');
    const snap = snapOf([task]);
    expect(demoNext(task, snap, Date.now())).toBe('spec');
    const store = new Proxy({}, { get: () => async () => undefined }) as unknown as Parameters<typeof advanceDemo>[0];
    expect(await advanceDemo(store, snap)).toContain('Studio B');
  });
});
