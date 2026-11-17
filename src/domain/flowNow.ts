// 지금 주고받는 장면(v0.7.62 소유자 "대화창을 크게 볼 때 사무실은 오른쪽 위에 작게, 그 왼쪽에 AI가 주고받는 애니메이션"):
// 얇은 머리에 띄울 한 줄. 웹 조사 중이면 Tavily → Firecrawl → Gemini, 아니면 업무의 기다림 관계(앞 작업 AI → 기다리는 AI).
// 둘 다 없으면 null(꾸며낸 활동은 보이지 않는다). 규칙만, 모델 호출 없음.
import type { AgentId } from './types';
import type { WorkflowData } from './workflow-types';

export interface FlowNow {
  steps: AgentId[];
  /** 지금 일하는 칸(0부터) */
  active: number;
  label: string;
}

const agentOf = (assignee: string): AgentId => (assignee === 'gemini' ? 'studioA' : (assignee as AgentId));

export function flowNow(workflow: WorkflowData, research: { step: 'search' | 'write'; studio: 'studioA' | 'studioB' } | null): FlowNow | null {
  if (research) {
    return {
      steps: ['search', 'firecrawl', research.studio],
      active: research.step === 'search' ? 0 : 2,
      label: research.step === 'search' ? '웹 조사: Tavily가 찾고 Firecrawl이 본문을 읽는 중' : '웹 조사: Gemini가 정리하는 중',
    };
  }
  for (const a of workflow.assignments) {
    if (a.dispatchStatus !== 'started' && a.dispatchStatus !== 'starting') continue;
    const plan = workflow.plans.find((p) => p.taskId === a.taskId && p.planRevision === a.planRevision);
    const waiter = workflow.assignments.find(
      (w) =>
        w.taskId === a.taskId &&
        w.planRevision === a.planRevision &&
        w.id !== a.id &&
        w.dispatchStatus !== 'completed' &&
        w.dispatchStatus !== 'started' &&
        (plan?.plan.work_items.find((i) => i.id === w.workItemId)?.dependencies ?? []).includes(a.workItemId),
    );
    if (waiter && agentOf(a.assignee) !== agentOf(waiter.assignee)) {
      return { steps: [agentOf(a.assignee), agentOf(waiter.assignee)], active: 0, label: `${a.workItemId} 하는 중 → 끝나면 ${waiter.workItemId}로 넘김` };
    }
  }
  return null;
}
