/**
 * 개발 작업 시작 규칙(DB 0009_concurrency_limit.sql과 같다).
 * - AI마다 동시에 1개: 같은 AI에게 시작된 작업이 있으면 그 AI의 다른 작업은 기다린다. 다른 AI끼리는 동시에.
 * - 순서: PM 계획의 dependencies에 적힌 앞 작업이 끝나야(completed) 시작한다.
 */
import { AGENT_BY_ID } from './agents';
import type { AgentAssignment, PmPlan } from './workflow-types';

const running = (a: AgentAssignment) => a.dispatchStatus === 'started' || a.dispatchStatus === 'starting';
const agentName = (a: AgentAssignment) => AGENT_BY_ID[a.assignee === 'gemini' ? 'studioA' : a.assignee].name;

/** 시작할 수 없는 이유(한국어), 시작할 수 있으면 null */
export function startBlocker(target: AgentAssignment, all: AgentAssignment[], plan: PmPlan | null): string | null {
  if (running(target)) return null;
  const busy = all.find((a) => a.id !== target.id && a.assignee === target.assignee && running(a));
  if (busy) return `${agentName(target)}가 이미 다른 작업(${busy.workItemId} ${busy.title})을 하고 있습니다. 그 작업의 결과를 등록하거나 중단한 뒤 시작하세요.`;
  const item = plan?.plan.work_items.find((w) => w.id === target.workItemId);
  const waiting = (item?.dependencies ?? []).filter(
    (dep) => !all.some((a) => a.taskId === target.taskId && a.planRevision === target.planRevision && a.workItemId === dep && a.dispatchStatus === 'completed'),
  );
  if (waiting.length) return `앞 작업(${waiting.join(', ')})이 끝나야 시작할 수 있습니다.`;
  return null;
}
