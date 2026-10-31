/**
 * 사무실 말풍선: 업무 단계만 보고 "누가 사용자에게 무엇을 기다리는지"를 정한다(규칙만, 꾸며낸 활동 없음).
 * - ask: 사용자의 승인·답을 기다림  - busy: 실제로 진행 중("…")  - alert: 막힘·실패
 * 한 캐릭터에 여러 업무가 걸리면 alert > ask > busy, 같으면 최근 업무를 보인다.
 */
import type { AgentId, Task } from '../domain/types';
import { deriveWorkflow, latestPrCheck, prCheckPasses } from '../domain/workflow';
import type { AgentAssignment, WorkflowData } from '../domain/workflow-types';

export type SpeechKind = 'ask' | 'busy' | 'alert';

export interface Speech {
  /** 말풍선: 단계[표시] — ? 내 손이 가는 일(승인·답·시작), … 진행 중, ! 막힘 */
  text: string;
  /** 화면 읽기용 전체 문장 */
  label: string;
  kind: SpeechKind;
  /** 누르면 열 업무 */
  taskId: string;
}

const RANK: Record<SpeechKind, number> = { alert: 0, ask: 1, busy: 2 };

const agentOf = (assignee: AgentAssignment['assignee']): AgentId => (assignee === 'gemini' ? 'studioA' : assignee);

export function speechFor(tasks: Task[], all: WorkflowData): Map<AgentId, Speech> {
  const found: { agent: AgentId; speech: Speech; at: string }[] = [];
  const say = (agent: AgentId, kind: SpeechKind, text: string, task: Task, label = text) =>
    found.push({ agent, speech: { text, label, kind, taskId: task.id }, at: task.updatedAt });

  for (const t of tasks) {
    if (t.status === 'done') continue;
    const v = deriveWorkflow(t, all);
    const planner: AgentId = v.spec?.planner === 'gemini_draft' ? 'studioA' : 'mina';
    const mine = v.plan ? all.assignments.filter((a) => a.taskId === t.id && a.planRevision === v.plan!.planRevision) : [];
    // 말풍선 = 단계[표시]: ? 내 손이 가는 일, … 진행 중, ! 막힘(소유자 요청 2026-10-31)
    const mark = { ask: '?', busy: '…', alert: '!' } as const;
    const tag = (agent: AgentId, kind: SpeechKind, word: string, label: string) => say(agent, kind, `${word}[${mark[kind]}]`, t, label);
    // 실행 승인된 작업: 시작 전이면 내가 넘겨야 함(Codex 지시서 등), 진행 중이면 …, 실패면 !
    const work = () => {
      for (const a of mine) {
        if (a.dispatchStatus === 'ready') tag(agentOf(a.assignee), 'ask', '개발', `${a.workItemId} 개발 시작이 필요해요`);
        else if (a.dispatchStatus === 'started' || a.dispatchStatus === 'starting') tag(agentOf(a.assignee), 'busy', '개발', `${a.workItemId} 개발하는 중`);
        else if (a.dispatchStatus === 'failed' || a.dispatchStatus.startsWith('blocked')) tag(agentOf(a.assignee), 'alert', '개발', `${a.workItemId} 개발이 막혔어요`);
      }
    };
    switch (v.stage) {
      case 'needs_clarification':
        tag(planner, 'ask', '질문', '확인할 게 있어요');
        break;
      case 'spec_ready':
      case 'development_approval_pending':
        tag(planner, 'ask', '기획', '기획 승인해 주세요');
        break;
      case 'dispatching':
        tag('claude', 'busy', '계획', 'PM 계획을 쓰는 중');
        break;
      case 'agent_handoff_pending':
        if (v.prototypeFirst && !v.pApproved && v.prototypeCount > 0) tag('studioA', 'ask', '견본', '견본 승인해 주세요');
        else if (mine.some((a) => a.dispatchStatus === 'awaiting_user_execution_approval')) tag('claude', 'ask', '실행', '실행 승인해 주세요');
        work();
        break;
      case 'executing':
        work();
        break;
      case 'result_review':
      case 'github_approval_pending': {
        const by = mine.find((a) => a.workItemId === v.result?.workItemId) ?? mine[0];
        tag(by ? agentOf(by.assignee) : t.assignee, 'ask', '결과', '결과 보고, 올리기 승인해 주세요');
        break;
      }
      case 'github_uploading':
      case 'pr_review':
        tag('ci', 'busy', 'PR', 'PR·CI를 확인하는 중');
        break;
      case 'deploying':
        tag('ci', 'busy', '배포', '배포하는 중');
        break;
      case 'deployment_approval_pending':
        // 올리기 승인 뒤 PR·CI가 끝나야 내 차례다. 그 전에는 CI 봇이 일하는 중.
        if (prCheckPasses(latestPrCheck(t, all))) tag('ci', 'ask', '배포', '배포 승인해 주세요');
        else tag('ci', 'busy', 'PR', 'PR·CI를 확인하는 중');
        break;
      case 'failed':
      case 'integration_blocked':
      case 'rate_limited':
        tag('mina', 'alert', '막힘', '막혔어요, 업무 카드를 확인해 주세요');
        break
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
