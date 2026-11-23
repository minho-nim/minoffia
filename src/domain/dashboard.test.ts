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

import { deltaText, monthCalendar, routines, stale, weekCompare } from './dashboard';
describe('대시보드 더하기(v0.8.7)', () => {
  it('지난주 대비', () => {
    const c = weekCompare(['2026-11-22T00:00:00Z', '2026-11-20T00:00:00Z', '2026-11-12T00:00:00Z'], now);
    expect(c).toEqual({ now: 2, prev: 1 });
    expect(deltaText(c)).toBe('지난주보다 +1');
    expect(deltaText({ now: 1, prev: 1 })).toBe('지난주와 같아요');
  });
  it('이번 달 달력(일~토, 한국 날짜)', () => {
    const w = monthCalendar([{ createdAt: '2026-11-22T20:00:00Z' }], [{ ok: true, createdAt: '2026-11-03T01:00:00Z' }, { ok: false, createdAt: '2026-11-03T02:00:00Z' }], now);
    const all = w.flat();
    expect(w.every((r) => r.length === 7)).toBe(true);
    expect(all.filter((d) => d.inMonth)).toHaveLength(30);
    expect(all[0].inMonth).toBe(true); // 2026-11-01은 일요일
    expect(all.find((d) => d.day === '2026-11-23')!.created).toBe(1);
    expect(all.find((d) => d.day === '2026-11-03')!.deployed).toBe(1);
  });
  it('자동 작업: 실패 먼저, 노트 오래되면 표시, MinLab 아닌 저장소만', () => {
    const r = routines(
      [
        { repo: 'minho-nim/minoffia', workflow: '운영 배포', ok: true, createdAt: '2026-11-23T03:00:00Z' },
        { repo: 'minho-nim/minoffia', workflow: '운영 배포', ok: true, createdAt: '2026-11-22T03:00:00Z' },
        { repo: 'minho-nim/minoffia', workflow: '앱 지도', ok: false, createdAt: '2026-11-21T03:00:00Z' },
        { repo: 'minho-nim/other', workflow: '남의 일', ok: true, createdAt: '2026-11-23T03:00:00Z' },
      ],
      '2026-11-20T00:00:00Z',
      now,
    );
    expect(r.map((x) => x.name)).toEqual(['앱 지도', '운영 배포', '옵시디언 노트 보내기']);
    expect(r[2].note).toBe('이틀 넘게 안 보냄');
    expect(stale('2026-11-23T11:55:00Z', now)).toBe(false);
    expect(stale('2026-11-23T11:00:00Z', now)).toBe(true);
  });
});
