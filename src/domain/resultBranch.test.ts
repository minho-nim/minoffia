import { describe, expect, it } from 'vitest';
import { resultWithoutBranch } from './workflow';

describe('브랜치 없는 Gemini 결과(v0.5.74)', () => {
  it('Gemini 결과인데 작업 브랜치 줄이 없으면 올릴 수 없는 결과', () => {
    expect(resultWithoutBranch({ source: 'gemini_actions_auto', summary: '바뀐 파일: CLAUDE.md' })).toBe(true);
    expect(resultWithoutBranch({ source: 'gemini_actions_auto', summary: '요약\n작업 브랜치: ai/gemini/abc-w1 (Gemini가 올림)' })).toBe(false);
    expect(resultWithoutBranch({ source: 'claude_session_auto', summary: '요약' })).toBe(false);
    expect(resultWithoutBranch(null)).toBe(false);
  });
});

describe('다시 하기 중 단계(v0.5.85)', () => {
  it('새 계획이 결과보다 새로우면 지난 결과의 올리기 승인으로 배포 대기가 되지 않는다', async () => {
    const { deriveWorkflow } = await import('./workflow');
    const { EMPTY_WORKFLOW } = await import('./workflow-types');
    const task = { id: 't', projectId: 'p', title: 'x', description: '', type: 'dev', requestedType: 'auto', priority: 'normal', assignee: 'gemini', routeReason: '', status: 'queued', dispatch: { state: 'none' } } as never;
    const spec = { id: 's', taskId: 't', revision: 1, intent: 'change_request', planner: 'gemini_draft', userOriginalText: '', finalPrompt: 'x', changeScope: '', preserveConstraints: '', testCriteria: '', answer: '', createdAt: '' };
    const plan = (rev: number) => ({ id: `p${rev}`, taskId: 't', planRevision: rev, approvedSpecRevision: 1, targetBaseRevision: '', source: 'manual', createdAt: '', plan: { status: 'planned', development_mode: 'direct', work_items: [{ id: 'W1' }] } });
    const ap = (gate: string, rev: number, wi = '') => ({ id: gate + rev, taskId: 't', gate, approvedRevision: rev, decision: 'approved', workItemId: wi, createdAt: '' });
    const data = {
      ...EMPTY_WORKFLOW,
      specs: [spec], plans: [plan(2), plan(3)],
      approvals: [ap('A', 1), ap('E', 3, 'W1'), ap('B', 1)],
      assignments: [{ id: 'a3', taskId: 't', planRevision: 3, workItemId: 'W1', assignee: 'gemini', dispatchStatus: 'started' }],
      results: [{ id: 'r1', taskId: 't', revision: 1, planRevision: 2, workItemId: 'W1', source: 'gemini_actions_auto', summary: '', diff: '', testLog: '', remainingIssues: '', sha256: '', createdAt: '' }],
    } as never;
    const v = deriveWorkflow(task, data);
    expect(v.bApproved).toBe(false);
    expect(v.stage).toBe('executing');
  });
});
