import { AGENTS, WORK_ROOM } from '../domain/agents';
import type { AgentId, Task } from '../domain/types';
import { LOUNGE_SPOTS, RECEPTION, ROOM_BY_ID, type Spot } from './layout';

export type Activity = 'working' | 'helping' | 'blocked' | 'review' | 'waiting' | 'resting';

export const ACTIVITY_LABEL: Record<Activity, string> = {
  working: '작업 중',
  helping: '도와주는 중',
  blocked: '차단됨',
  review: '검토 대기',
  waiting: '대기',
  resting: '휴식 중',
};

export interface AgentScene {
  agent: AgentId;
  spot: Spot;
  activity: Activity;
  /** 현재 보여줄 업무 */
  task: Task | null;
  /** 이 에이전트의 열린 업무 수(완료 제외) */
  open: number;
  /** 모니터가 켜지는 자리 */
  seatId: string | null;
}

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

function pick(tasks: Task[]): Task | null {
  if (tasks.length === 0) return null;
  return [...tasks].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.updatedAt.localeCompare(a.updatedAt),
  )[0];
}

/**
 * 업무 상태만으로 캐릭터 위치와 말풍선을 정한다. 꾸며낸 활동은 없다.
 * - 진행 중: 해당 업무 유형의 방 책상(자기 방이 아니면 그 방 빈자리에서 "도와주는 중")
 * - 차단·검토 대기·접수만 있음: 자기 방
 * - 열린 업무 없음: 휴게실
 */
export function buildScene(tasks: Task[]): AgentScene[] {
  const takenSeats = new Set<string>();
  const result: AgentScene[] = [];
  const openTasks = tasks.filter((t) => t.status !== 'done');

  // 자기 방 자리 먼저 배정해야 도우러 온 에이전트가 빈자리를 고를 수 있다.
  const homeSeat = new Map<AgentId, string>();
  for (const a of AGENTS) {
    if (!a.home) continue;
    const r = ROOM_BY_ID[a.home];
    const residents = AGENTS.filter((x) => x.home === a.home);
    const seat = r.seats[residents.indexOf(a)];
    if (seat) homeSeat.set(a.id, seat.id);
  }

  AGENTS.forEach((agent, index) => {
    const mine = openTasks.filter((t) => t.assignee === agent.id);
    const rest: Spot = { ...LOUNGE_SPOTS[index % LOUNGE_SPOTS.length], zone: 'lounge' };

    if (agent.id === 'mina') {
      // 미나는 접수·검토·차단 메모가 하나라도 있으면 복도 데스크를 지킨다.
      const memos = openTasks.filter((t) => t.status !== 'in_progress');
      result.push({
        agent: agent.id,
        spot: memos.length ? { ...RECEPTION, zone: 'corridor' } : rest,
        activity: memos.length ? 'working' : 'resting',
        task: pick(memos),
        open: memos.length,
        seatId: null,
      });
      return;
    }

    const active = pick(mine.filter((t) => t.status === 'in_progress'));
    if (active) {
      const roomId = WORK_ROOM[active.type];
      const room = ROOM_BY_ID[roomId];
      const own = roomId === agent.home ? room.seats.find((s) => s.id === homeSeat.get(agent.id)) : undefined;
      const seat =
        own ??
        room.seats.find((s) => ![...homeSeat.values()].includes(s.id) && !takenSeats.has(s.id)) ??
        room.seats.find((s) => !takenSeats.has(s.id));
      if (seat) takenSeats.add(seat.id);
      result.push({
        agent: agent.id,
        spot: seat ? { x: seat.x, y: seat.y, zone: roomId } : { ...room.idle, zone: roomId },
        activity: roomId === agent.home ? 'working' : 'helping',
        task: active,
        open: mine.length,
        seatId: seat?.id ?? null,
      });
      return;
    }

    const blocked = pick(mine.filter((t) => t.status === 'blocked'));
    const review = pick(mine.filter((t) => t.status === 'review'));
    const queued = pick(mine.filter((t) => t.status === 'queued'));
    const shown = blocked ?? review ?? queued;
    if (shown && agent.home) {
      const room = ROOM_BY_ID[agent.home];
      // 자기 책상에서 기다린다(모니터는 끈 채로). 자리가 겹치지 않는다.
      const own = room.seats.find((s) => s.id === homeSeat.get(agent.id)) ?? room.idle;
      result.push({
        agent: agent.id,
        spot: { x: own.x, y: own.y, zone: agent.home },
        activity: blocked ? 'blocked' : review ? 'review' : 'waiting',
        task: shown,
        open: mine.length,
        seatId: null,
      });
      return;
    }

    result.push({ agent: agent.id, spot: rest, activity: 'resting', task: null, open: 0, seatId: null });
  });

  return result;
}
