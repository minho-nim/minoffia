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
    expect(of([task({ id: 'a', type: 'research', assignee: 'studioA', status: 'blocked' })], 'studioA').activity).toBe('blocked');
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

  it('아래 두 방(기획실↔휴게실) 사이는 가로 복도를 찍지 않고 바로 간다', () => {
    const path = pathBetween({ x: 60, y: 190, zone: 'planning' }, { x: 240, y: 200, zone: 'lounge' });
    expect(path.every((p) => p.y > 113)).toBe(true);
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

describe('막힘·대기도 업무의 방에서(v0.7.59)', () => {
  it('Studio A의 조사 업무가 막히면 리서치실에서 기다린다', () => {
    const s = of([task({ id: 'r', type: 'research', assignee: 'studioA', status: 'blocked' })], 'studioA');
    expect(s.activity).toBe('blocked');
    expect(s.spot.zone).toBe('research');
  });
  it('자기 방 업무면 자기 책상에서 기다린다', () => {
    const s = of([task({ id: 'd', type: 'dev', assignee: 'codex', status: 'queued' })], 'codex');
    expect(s.spot.zone).toBe('dev');
  });
});

describe('웹 조사 연출(v0.7.60)', () => {
  it('찾고 쓰는 동안 쉬던 Tavily·Firecrawl은 리서치실 자기 자리로, 끝나면 그대로', async () => {
    const { withResearch } = await import('./scene');
    const base = buildScene([]);
    const on = withResearch(base, 'search');
    for (const id of ['search', 'firecrawl']) {
      const s = on.find((x) => x.agent === id)!;
      expect(s.spot.zone).toBe('research');
      expect(s.activity).toBe('working');
    }
    expect(on.find((x) => x.agent === 'search')!.seatId).not.toBe(on.find((x) => x.agent === 'firecrawl')!.seatId);
    expect(withResearch(base, null)).toBe(base);
    expect(withResearch(base, 'write').find((x) => x.agent === 'search')!.spot.zone).toBe('research');
  });
});

describe('방별 움직임 전체 확인(v0.7.61)', () => {
  const ROOM_OF = { planning: 'planning', dev: 'dev', design: 'planning', prototype: 'planning', research: 'research', qa: 'terminal' } as const;
  const workers = ['claude', 'codex', 'studioA', 'studioB', 'ci'] as const;
  for (const agent of workers) {
    for (const type of Object.keys(ROOM_OF) as (keyof typeof ROOM_OF)[]) {
      for (const status of ['in_progress', 'blocked', 'review', 'queued'] as const) {
        it(`${agent} · ${type} · ${status} → ${ROOM_OF[type]}`, () => {
          const s = of([task({ id: 'x', type, assignee: agent, status })], agent);
          expect(s.spot.zone).toBe(ROOM_OF[type]);
        });
      }
    }
  }
  it('미니엉은 메모가 있으면 복도 접수 데스크, 없으면 휴게실', () => {
    expect(of([task({ id: 'm', type: 'dev', assignee: 'codex', status: 'queued' })], 'mina').spot.zone).toBe('corridor');
    expect(of([], 'mina').spot.zone).toBe('lounge');
  });
  it('같은 방에 여럿이 몰려도 겹쳐 서지 않는다', () => {
    const tasks = (['claude', 'codex', 'studioA', 'studioB', 'ci'] as const).map((a, i) => task({ id: `r${i}`, type: 'research', assignee: a, status: 'in_progress' }));
    const scene = buildScene(tasks);
    const spots = scene.filter((s) => s.spot.zone === 'research').map((s) => `${s.spot.x},${s.spot.y}`);
    expect(spots.length).toBe(5);
    expect(new Set(spots).size).toBe(spots.length);
  });
  it('웹 조사: 찾는 동안 Tavily·Firecrawl, 쓰는 동안 정리하는 Gemini도 리서치실(겹치지 않게)', async () => {
    const { withResearch } = await import('./scene');
    const w = withResearch(buildScene([]), 'write', 'studioB');
    for (const id of ['search', 'firecrawl', 'studioB']) expect(w.find((x) => x.agent === id)!.spot.zone).toBe('research');
    expect(w.find((x) => x.agent === 'studioA')!.spot.zone).toBe('lounge');
    const pos = w.filter((x) => x.spot.zone === 'research').map((x) => `${x.spot.x},${x.spot.y}`);
    expect(new Set(pos).size).toBe(pos.length);
    // 정리하는 Gemini가 업무 중이면 그대로 둔다
    const busy = withResearch(buildScene([task({ id: 'p', type: 'planning', assignee: 'studioA', status: 'in_progress' })]), 'write', 'studioA');
    expect(busy.find((x) => x.agent === 'studioA')!.spot.zone).toBe('planning');
  });
});
