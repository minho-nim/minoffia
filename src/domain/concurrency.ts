/**
 * 개발 작업 시작 규칙(DB 0009_concurrency_limit.sql과 같다).
 * - AI별 동시 작업 상한: Codex Cloud·Claude Code는 여러 작업을 동시에 돌릴 수 있다. 기본 Codex 3·Claude 3·Gemini 2,
 *   소유자가 1~5로 바꾼다. 다른 AI끼리는 서로 세지 않는다.
 * - 순서: PM 계획의 dependencies에 적힌 앞 작업이 끝나야(completed) 시작한다(같은 파일 충돌 방지).
 */
import { AGENT_BY_ID } from './agents';
import type { AgentAssignment, AgentKind, PmPlan } from './workflow-types';

export type AgentLimits = Partial<Record<AgentKind, number>>;

export const DEFAULT_AGENT_LIMITS: Record<AgentKind, number> = { codex: 3, claude: 3, gemini: 2 };
export const MAX_AGENT_LIMIT = 5;

export function limitFor(kind: AgentKind, limits: AgentLimits = {}): number {
  return limits[kind] ?? DEFAULT_AGENT_LIMITS[kind];
}

const running = (a: AgentAssignment) => a.dispatchStatus === 'started' || a.dispatchStatus === 'starting';
const agentName = (a: AgentAssignment) => AGENT_BY_ID[a.assignee === 'gemini' ? 'studioA' : a.assignee].name;

/** 시작할 수 없는 이유(한국어), 시작할 수 있으면 null */
export function startBlocker(target: AgentAssignment, all: AgentAssignment[], plan: PmPlan | null, limits: AgentLimits = {}): string | null {
  if (running(target)) return null;
  const busy = all.filter((a) => a.id !== target.id && a.assignee === target.assignee && running(a));
  const cap = limitFor(target.assignee, limits);
  if (busy.length >= cap) {
    return `${agentName(target)}가 이미 ${busy.length}개 작업(${busy.map((b) => b.workItemId).join(', ')})을 하고 있습니다(동시 상한 ${cap}개). 하나를 끝내거나 중단하거나, 에이전트 탭에서 상한을 올리세요.`;
  }
  const waiting = waitingOn(target, all, plan).map((w) => w.workItemId);
  if (waiting.length) return `앞 작업(${waiting.join(', ')})이 끝나야 시작할 수 있습니다.`;
  return null;
}

/**
 * 아직 안 끝난 앞 작업(v0.5.22 소유자 "누가 누구를 기다리나", pixel-office 아이디어). 계획의 dependencies로만 정한다.
 * 업무 카드에 "⏳ W2(Codex) 결과 대기"로 보이고, 시작 규칙(startBlocker)도 같은 판단을 쓴다.
 */
export function waitingOn(target: AgentAssignment, all: AgentAssignment[], plan: PmPlan | null): { workItemId: string; agent: string }[] {
  const item = plan?.plan.work_items.find((w) => w.id === target.workItemId);
  const same = (a: AgentAssignment) => a.taskId === target.taskId && a.planRevision === target.planRevision;
  return (item?.dependencies ?? [])
    .filter((dep) => !all.some((a) => same(a) && a.workItemId === dep && a.dispatchStatus === 'completed'))
    .map((dep) => {
      const a = all.find((x) => same(x) && x.workItemId === dep);
      return { workItemId: dep, agent: a ? agentName(a) : '' };
    });
}
