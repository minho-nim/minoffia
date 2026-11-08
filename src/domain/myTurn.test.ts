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
    const sent = { ...task, dispatch: { state: 'dispatched' as const, at: '2026-10-31T00:00:00Z' } };
    expect(myTurns([sent], data({ specs: [spec], approvals: [ok('A', 1)] }), Date.parse('2026-10-31T00:05:00Z'))).toEqual([]);
    // PM에 아직 못 보냈으면(저장소 없음 등) 계획[?]로 내 차례(v0.4.20)
    expect(myTurns([task], data({ specs: [spec], approvals: [ok('A', 1)] }))[0]).toMatchObject({ word: '계획' });
    expect(myTurns([{ ...task, status: 'done' }], data({ specs: [spec] }))).toEqual([]);
  });

  it('확인 질문은 질문[?]', () => {
    expect(myTurns([task], data({ specs: [{ ...spec, intent: 'ambiguous', answer: '1. 무엇?' }] }))[0]).toMatchObject({ word: '질문' });
  });
});

describe('시작한 일부터 끝내기(v0.5.45)', () => {
  it('막힘 먼저, 그다음 끝에 가까운 단계, 같으면 오래 기다린 것', async () => {
    const { turnOrder } = await import('./myTurn');
    const t = (taskId: string, step: 'A' | 'B' | 'C' | undefined, at: string, alert = false) => ({ taskId, title: '', word: '', label: '', step, at, alert });
    const sorted = [t('기획', 'A', '1'), t('올리기', 'B', '3'), t('배포', 'C', '4'), t('막힘', undefined, '9', true), t('올리기 옛', 'B', '2')].sort(turnOrder);
    expect(sorted.map((x) => x.taskId)).toEqual(['막힘', '배포', '올리기 옛', '올리기', '기획']);
  });
});
