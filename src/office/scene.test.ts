import { describe, expect, it } from 'vitest';
import type { Task } from '../domain/types';
import { pathBetween, ROOM_BY_ID } from './layout';
import { buildScene } from './scene';

const base: Omit<Task, 'id' | 'title' | 'type' | 'assignee' | 'status'> = {
  projectId: 'p',
  description: '',
  requestedType: 'auto',
  priority: 'normal',
  routeReason: '',
  dispatch: { state: 'none' },
  createdAt: '2026-10-29T00:00:00Z',
  updatedAt: '2026-10-29T00:00:00Z',
};
const task = (p: Pick<Task, 'id' | 'type' | 'assignee' | 'status'>): Task => ({ ...base, title: p.id, ...p });
const of = (tasks: Task[], id: string) => buildScene(tasks).find((s) => s.agent === id)!;

describe('buildScene', () => {
  it('업무가 없으면 모두 휴게실에서 쉰다', () => {
    for (const s of buildScene([])) {
      expect(s.activity).toBe('resting');
      expect(s.spot.zone).toBe('lounge');
    }
  });

  it('진행 중이면 자기 방 책상에서 작업하고 모니터를 켠다', () => {
    const s = of([task({ id: 'a', type: 'dev', assignee: 'codex', status: 'in_progress' })], 'codex');
    expect(s).toMatchObject({ activity: 'working', seatId: 'dev-0' });
    expect(s.spot.zone).toBe('dev');
  });

  it('다른 방 유형의 일을 하면 그 방 빈자리에서 도와준다', () => {
    const tasks = [
      task({ id: 'a', type: 'dev', assignee: 'codex', status: 'in_progress' }),
      task({ id: 'b', type: 'dev', assignee: 'claude', status: 'in_progress' }),
    ];
    const s = of(tasks, 'claude');
    expect(s.activity).toBe('helping');
    expect(s.spot.zone).toBe('dev');
    expect(s.seatId).not.toBe('dev-0');
  });

  it('차단된 업무는 자기 방에서 차단 상태로 보인다', () => {
    expect(of([task({ id: 'a', type: 'research', assignee: 'grok', status: 'blocked' })], 'grok').activity).toBe('blocked');
  });

  it('완료된 업무만 있으면 휴게실로 간다', () => {
    expect(of([task({ id: 'a', type: 'qa', assignee: 'ci', status: 'done' })], 'ci').spot.zone).toBe('lounge');
  });

  it('접수 메모가 있으면 미니엉이 복도 데스크를 지킨다', () => {
    const s = of([task({ id: 'a', type: 'planning', assignee: 'claude', status: 'queued' })], 'mina');
    expect(s.spot.zone).toBe('corridor');
    expect(s.open).toBe(1);
  });
});

describe('pathBetween', () => {
  it('방에서 방으로는 문과 복도를 거친다', () => {
    const from = { ...ROOM_BY_ID.dev.seats[0], zone: 'dev' as const };
    const to = { x: 240, y: 200, zone: 'lounge' as const };
    const path = pathBetween(from, to);
    expect(path[0]).toEqual(ROOM_BY_ID.dev.door.inside);
    expect(path.at(-1)).toEqual({ x: 240, y: 200 });
    expect(path).toContainEqual(ROOM_BY_ID.lounge.door.outside);
  });

  it('같은 방 안에서는 바로 간다', () => {
    expect(pathBetween({ x: 1, y: 1, zone: 'dev' }, { x: 5, y: 5, zone: 'dev' })).toEqual([{ x: 5, y: 5 }]);
  });
});

describe('겹침', () => {
  it('같은 방에서 기다리는 에이전트끼리 같은 자리에 서지 않는다', () => {
    const tasks = [
      task({ id: 'a', type: 'planning', assignee: 'claude', status: 'queued' }),
      task({ id: 'b', type: 'design', assignee: 'studioA', status: 'review' }),
      task({ id: 'c', type: 'prototype', assignee: 'studioB', status: 'blocked' }),
    ];
    const spots = buildScene(tasks).map((s) => `${s.spot.x},${s.spot.y}`);
    expect(new Set(spots).size).toBe(spots.length);
  });
});

describe('배정 기록 반영', () => {
  const parent = task({ id: 'p1', type: 'planning', assignee: 'claude', status: 'queued' });
  const assignment = (dispatchStatus: 'awaiting_user_execution_approval' | 'started' | 'completed') => ({
    id: 'a1', taskId: 'p1', planRevision: 1, workItemId: 'W1', title: '버튼 키우기', assignee: 'codex' as const,
    executionMode: 'manual_handoff' as const, dispatchStatus, statusSource: 'user_reported' as const,
    providerExecutionId: null, providerTaskUrl: null, actualProviderStatus: '', startedAt: null, lastVerifiedAt: null, updatedAt: '',
  });

  it('E 승인 전 Codex 배정은 대기로만 보인다', () => {
    const s = buildScene([parent], [assignment('awaiting_user_execution_approval')]).find((x) => x.agent === 'codex')!;
    expect(s.activity).toBe('waiting');
  });

  it('사용자가 시작을 기록하면 Codex가 작업 중', () => {
    const s = buildScene([parent], [assignment('started')]).find((x) => x.agent === 'codex')!;
    expect(s.activity).toBe('working');
    expect(s.task?.title).toBe('버튼 키우기');
  });

  it('끝난 배정은 캐릭터를 움직이지 않는다', () => {
    expect(buildScene([parent], [assignment('completed')]).find((x) => x.agent === 'codex')!.activity).toBe('resting');
  });
});
