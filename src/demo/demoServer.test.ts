import { describe, expect, it } from 'vitest';
import { EMPTY_WORKFLOW } from '../domain/workflow-types';
import type { Snapshot } from '../domain/types';
import { demoNext, demoTask, newDemoTask, DEMO_TAG } from './demoServer';

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
