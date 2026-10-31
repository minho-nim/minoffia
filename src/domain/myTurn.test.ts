import { describe, expect, it } from 'vitest';
import { myTurns } from './myTurn';
import type { Task } from './types';
import type { Approval, WorkflowData } from './workflow-types';
import { EMPTY_WORKFLOW } from './workflow-types';

const task: Task = {
  id: 't1', projectId: 'p', title: 'README 한 줄', description: '', type: 'dev', requestedType: 'auto',
  priority: 'normal', assignee: 'claude', routeReason: '', status: 'queued', dispatch: { state: 'none' },
  createdAt: '', updatedAt: '2026-10-31T00:00:00Z',
};
const spec = { id: 's1', taskId: 't1', revision: 1, intent: 'change_request' as const, planner: 'gemini_draft' as const, userOriginalText: '원문', finalPrompt: 'p', changeScope: '', preserveConstraints: '', testCriteria: '', answer: '', createdAt: '' };
const ok = (gate: Approval['gate'], rev: number): Approval => ({ id: gate, taskId: 't1', gate, decision: 'approved', approvedRevision: rev, previousRevision: null, workItemId: '', scope: {}, actor: '', createdAt: '' });
const data = (d: Partial<WorkflowData>): WorkflowData => ({ ...EMPTY_WORKFLOW, ...d });

describe('내 차례(v0.4.8)', () => {
  it('기획서가 오면 기획 승인을 바로 누를 수 있다', () => {
    expect(myTurns([task], data({ specs: [spec] }))).toEqual([
      expect.objectContaining({ taskId: 't1', word: '기획', quick: 'A' }),
    ]);
  });

  it('A 승인 뒤 PM이 계획 중이면 내 차례가 아니다, 끝난 업무도 아니다', () => {
    expect(myTurns([task], data({ specs: [spec], approvals: [ok('A', 1)] }))).toEqual([]);
    expect(myTurns([{ ...task, status: 'done' }], data({ specs: [spec] }))).toEqual([]);
  });

  it('확인 질문은 질문[?]', () => {
    expect(myTurns([task], data({ specs: [{ ...spec, intent: 'ambiguous', answer: '1. 무엇?' }] }))[0]).toMatchObject({ word: '질문' });
  });
});
