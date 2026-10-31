/**
 * 사무실 말풍선: 업무 단계만 보고 "누가 사용자에게 무엇을 기다리는지"를 정한다(규칙만, 꾸며낸 활동 없음).
 * - ask: 사용자의 승인·답을 기다림  - busy: 실제로 진행 중("…")  - alert: 막힘·실패
 * 한 캐릭터에 여러 업무가 걸리면 alert > ask > busy, 같으면 최근 업무를 보인다.
 */
import type { AgentId, Task } from '../domain/types';
import { deriveWorkflow } from '../domain/workflow';
import type { AgentAssignment, WorkflowData } from '../domain/workflow-types';

export type SpeechKind = 'ask' | 'busy' | 'alert';

export interface Speech {
  text: string;
  kind: SpeechKind;
  /** 누르면 열 업무 */
  taskId: string;
}

const RANK: Record<SpeechKind, number> = { alert: 0, ask: 1, busy: 2 };

const agentOf = (assignee: AgentAssignment['assignee']): AgentId => (assignee === 'gemini' ? 'studioA' : assignee);

export function speechFor(tasks: Task[], all: WorkflowData): Map<AgentId, Speech> {
  const found: { agent: AgentId; speech: Speech; at: string }[] = [];
  const say = (agent: AgentId, kind: SpeechKind, text: string, task: Task) => found.push({ agent, speech: { text, kind, taskId: task.id }, at: task.updatedAt });

  for (const t of tasks) {
    if (t.status === 'done') continue;
    const v = deriveWorkflow(t, all);
    const planner: AgentId = v.spec?.planner === 'gemini_draft' ? 'studioA' : 'mina';
    const mine = v.plan ? all.assignments.filter((a) => a.taskId === t.id && a.planRevision === v.plan!.planRevision) : [];
    switch (v.stage) {
      case 'needs_clarification':
        say(planner, 'ask', '확인할 게 있어요', t);
        break;
      case 'spec_ready':
      case 'development_approval_pending':
        say(planner, 'ask', '기획 승인해 주세요', t);
        break;
      case 'dispatching':
        say('claude', 'busy', '…', t);
        break;
      case 'agent_handoff_pending':
        if (v.prototypeFirst && !v.pApproved && v.prototypeCount > 0) say('studioA', 'ask', '견본 승인해 주세요', t);
        else if (mine.some((a) => a.dispatchStatus === 'awaiting_user_execution_approval')) say('claude', 'ask', '실행 승인해 주세요', t);
        break;
      case 'executing':
        for (const a of mine) if (a.dispatchStatus === 'started' || a.dispatchStatus === 'starting') say(agentOf(a.assignee), 'busy', '…', t);
        break;
      case 'result_review':
      case 'github_approval_pending': {
        const by = mine.find((a) => a.workItemId === v.result?.workItemId) ?? mine[0];
        say(by ? agentOf(by.assignee) : t.assignee, 'ask', '결과 보고!\n올리기 승인해 주세요', t);
        break;
      }
      case 'github_uploading':
      case 'pr_review':
      case 'deploying':
        say('ci', 'busy', '…', t);
        break;
      case 'deployment_approval_pending':
        say('ci', 'ask', '배포 승인해 주세요', t);
        break;
      case 'failed':
      case 'integration_blocked':
      case 'rate_limited':
        say('mina', 'alert', '막혔어요!', t);
        break;
      default:
        break;
    }
  }

  const out = new Map<AgentId, Speech>();
  found
    .sort((a, b) => RANK[a.speech.kind] - RANK[b.speech.kind] || b.at.localeCompare(a.at))
    .forEach((f) => {
      if (!out.has(f.agent)) out.set(f.agent, f.speech);
    });
  return out;
}
