import { describe, expect, it } from 'vitest';
import { ago, dashboard } from './dashboard';
import { EMPTY_WORKFLOW } from './workflow-types';
import type { Project, Task } from './types';
import type { MyTurn } from './myTurn';

const now = Date.parse('2026-11-23T12:00:00Z');
const T = (id: string, projectId: string, status: string, extra: Partial<Task> = {}) => ({ id, projectId, title: id, status, dispatch: { state: 'none' }, ...extra }) as unknown as Task;
const P = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 's', name: '예시', sample: true }] as unknown as Project[];

describe('대시보드(v0.8.6)', () => {
  const tasks = [T('1', 'a', 'in_progress'), T('2', 'a', 'review'), T('3', 'b', 'queued'), T('4', 'b', 'blocked'), T('5', 'b', 'done'), T('6', 'a', 'queued', { dispatch: { state: 'failed' } as Task['dispatch'] })];
  const wf = {
    ...EMPTY_WORKFLOW,
    deployments: [{ taskId: '5', ok: true, createdAt: '2026-11-22T00:00:00Z' }, { taskId: '1', ok: false, createdAt: '2026-11-23T00:00:00Z' }],
    approvals: [{ taskId: '5', gate: 'C', decision: 'approved', createdAt: '2026-11-22T00:00:00Z' }],
  } as unknown as typeof EMPTY_WORKFLOW;
  const turns = [{ taskId: '2', title: '2', word: '결과', label: '' }, { taskId: '4', title: '4', word: '배포', label: '', alert: true }] as MyTurn[];
  const d = dashboard(tasks, wf, turns, P, now);
  it('막힘이 먼저, 숫자', () => {
    expect(d.turns[0].taskId).toBe('4');
    expect(d.alerts).toBe(1);
    expect(d.working.map((t) => t.id)).toEqual(['1']);
    expect(d.blocked.map((t) => t.id)).toEqual(['4', '6']);
    expect(d.deploysWeek).toBe(1);
    expect(d.doneWeek).toBe(1);
    expect(d.status.map((s) => s.n)).toEqual([2, 1, 1, 1]);
  });
  it('프로젝트는 내 차례·진행 순, 예시는 뺌', () => {
    expect(d.projects.map((p) => p.id)).toEqual(['a', 'b']);
    expect(d.projects.find((p) => p.id === 'b')!.lastDeploy).toBe('2026-11-22T00:00:00Z');
  });
  it('얼마 전', () => {
    expect(ago('2026-11-23T11:57:00Z', now)).toBe('3분 전');
    expect(ago('2026-11-23T09:00:00Z', now)).toBe('3시간 전');
    expect(ago('2026-11-20T12:00:00Z', now)).toBe('3일 전');
    expect(ago(null, now)).toBe('-');
  });
});
