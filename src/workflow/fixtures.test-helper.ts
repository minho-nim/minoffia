import type { Snapshot, Task } from '../domain/types';
import type { ResultReview } from '../domain/workflow-types';
import { EMPTY_WORKFLOW } from '../domain/workflow-types';

export const task: Task = {
  id: 't1', projectId: 'p1', title: '버튼 수정', description: '', type: 'dev', requestedType: 'auto',
  priority: 'normal', assignee: 'codex', routeReason: '', status: 'in_progress', dispatch: { state: 'none' }, createdAt: '', updatedAt: '',
};
export function snapshot(revision = 1): Snapshot {
  return { projects: [], tasks: [task], usage: [], workflow: {
    ...EMPTY_WORKFLOW,
    specs: [{ id: `s${revision}`, taskId: task.id, revision, intent: 'change_request', planner: 'gemini_draft', userOriginalText: '버튼 수정', finalPrompt: '버튼 수정', changeScope: '', preserveConstraints: '', testCriteria: '', answer: '', createdAt: '' }],
    approvals: [{ id: 'a1', taskId: task.id, gate: 'A', decision: 'approved', approvedRevision: revision, previousRevision: null, workItemId: '', scope: {}, actor: '', createdAt: '' }],
    results: [{ id: 'r1', taskId: task.id, revision: 1, planRevision: null, workItemId: '', source: 'manual', summary: '', diff: '', testLog: '', remainingIssues: '', sha256: '', createdAt: '' }],
  } };
}
export const passReview = { taskId: task.id, resultRevision: 1, verdict: 'pass', total: 90, autoRedo: 0 } as ResultReview;
export const planText = JSON.stringify({
  task_id: task.id, repository: 'owner/repo', status: 'planned', questions: [],
  generation_id: '12345678-1234-4234-8234-123456789012',
  work_items: [{ id: 'W1', title: '버튼 수정', goal: '버튼 수정', assignee_preference: 'codex_primary', execution_mode: 'manual_handoff' }],
});
