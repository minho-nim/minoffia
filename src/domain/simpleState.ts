// 업무 상태 다섯 가지(v0.6.15, OpenMausBot의 settled/needs-user/failed/stalled 착안, 소유자 "21534 시행" 3번):
// 단계 이름이 많아 무엇을 해야 하는지 바로 안 보였다. 업무마다 다섯 가지 중 하나만 보여 준다(규칙만, 모델 호출 없음).
//   진행 중 = AI가 하는 중 · 내 차례 = 사장님이 승인·답할 일 · 멈춤 = 오래 소식 없음 · 실패 = 막힘·실패 · 끝남
import type { Task } from './types';
import type { WorkflowData } from './workflow-types';
import { deriveWorkflow } from './workflow';
import { myTurns } from './myTurn';
import { stalls } from './stall';
import { staleStart } from './reassign';

export type SimpleState = 'working' | 'turn' | 'stalled' | 'failed' | 'done';
export const SIMPLE_LABEL: Record<SimpleState, string> = { working: '진행 중', turn: '내 차례', stalled: '멈춤', failed: '실패', done: '끝남' };

export function simpleStates(tasks: Task[], all: WorkflowData, now: number = Date.now()): Map<string, SimpleState> {
  const turns = myTurns(tasks, all, now);
  const stalled = new Set(stalls(tasks, all, now).map((s) => s.taskId));
  const out = new Map<string, SimpleState>();
  for (const t of tasks) {
    const myTurn = turns.filter((x) => x.taskId === t.id);
    const v = deriveWorkflow(t, all);
    const mine = v.plan ? all.assignments.filter((a) => a.taskId === t.id && a.planRevision === v.plan!.planRevision) : [];
    const failed = myTurn.some((x) => x.alert) || t.dispatch.state === 'failed' || mine.some((a) => a.dispatchStatus === 'failed');
    // 취소한 업무(v0.6.50)는 작업을 실패로 멈춰 두므로 실패보다 먼저 끝남으로 본다(v0.6.54)
    if (t.stage === 'cancelled') out.set(t.id, 'done');
    else if (failed) out.set(t.id, 'failed');
    else if (t.status === 'done') out.set(t.id, 'done');
    else if (myTurn.length) out.set(t.id, 'turn');
    else if (stalled.has(t.id) || mine.some((a) => a.dispatchStatus === 'blocked_quota' || a.dispatchStatus === 'blocked_integration' || staleStart(a, now))) out.set(t.id, 'stalled');
    else out.set(t.id, 'working');
  }
  return out;
}

/** 한눈에 보기 숫자: 진행 중·내 차례·멈춤과 실패(합쳐서) */
export function stateCounts(states: Map<string, SimpleState>, ids: string[]): { working: number; turn: number; stuck: number } {
  let working = 0, turn = 0, stuck = 0;
  for (const id of ids) {
    const s = states.get(id);
    if (s === 'working') working++;
    else if (s === 'turn') turn++;
    else if (s === 'stalled' || s === 'failed') stuck++;
  }
  return { working, turn, stuck };
}
