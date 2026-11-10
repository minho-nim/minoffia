// 지금 할 일(v0.6.27, 소유자 2026-11-10 "너무 복잡해" → 화면 상태 5개 + 지금 할 일 버튼 하나):
// 업무 카드 맨 위에 '지금 상태 한 줄 + 눌러야 할 버튼 하나'만 보여 주고 단계별 기록은 접는다(규칙만, 모델 호출 없음).
import type { WorkflowView } from './workflow';
import { canApprove } from './workflow';
import type { AgentAssignment, ResultReview } from './workflow-types';
import type { SimpleState } from './simpleState';

const WHO: Record<string, string> = { codex: 'Codex', claude: 'Claude', gemini: 'Gemini', grok: 'Grok' };

export type NowAction =
  | { kind: 'approveA' | 'approveB' | 'approveC' }
  | { kind: 'jump'; step: 'qa' | 'plan' | 'pm' | 'E' | 'B' | 'C' };

export interface NowInfo {
  tone: SimpleState;
  /** 한 줄 설명 */
  text: string;
  /** 큰 버튼(있으면 하나) */
  primary?: { label: string; action: NowAction };
  /** 작은 보조 버튼(내용 보기) */
  secondary?: { label: string; action: NowAction };
}

export function nowInfo(view: WorkflowView, opts: { done: boolean; review?: ResultReview | null; ciPassed?: boolean; dispatchFailed?: boolean }): NowInfo {
  const failed = view.assignments.find((a) => a.dispatchStatus === 'failed');
  const running = view.assignments.find((a) => a.dispatchStatus === 'started' || a.dispatchStatus === 'starting');
  const who = (a?: AgentAssignment) => (a ? WHO[a.assignee] ?? a.assignee : 'AI');
  if (opts.done || view.stage === 'completed') return { tone: 'done', text: '끝났어요.' };
  switch (view.stage) {
    case 'needs_clarification':
      return { tone: 'turn', text: 'AI가 확인 질문을 했어요. 답해 주세요.', primary: { label: '질문에 답하기', action: { kind: 'jump', step: 'qa' } } };
    case 'development_approval_pending':
      return canApprove(view, 'A').ok
        ? { tone: 'turn', text: `기획서(v${view.spec?.revision ?? ''})가 준비됐어요. 보고 승인하면 AI가 바로 계획·개발해요.`, primary: { label: '기획 승인', action: { kind: 'approveA' } }, secondary: { label: '기획서 보기', action: { kind: 'jump', step: 'plan' } } }
        : { tone: 'working', text: '기획서를 쓰는 중이에요.' };
    case 'planning':
    case 'received':
    case 'spec_ready':
      return { tone: 'working', text: '기획서를 쓰는 중이에요.' };
    case 'pm_queued':
    case 'dispatching':
      return { tone: 'working', text: '업무 계획을 세우는 중이에요.' };
    case 'integration_blocked':
      return { tone: 'failed', text: '업무 계획(PM)에 보내지 못했어요.', primary: { label: '이유 보기', action: { kind: 'jump', step: 'pm' } } };
    case 'rate_limited':
      return { tone: 'stalled', text: `${who(view.assignments.find((a) => a.dispatchStatus === 'blocked_quota'))} 한도가 차서 기다리는 중이에요.`, secondary: { label: '작업 보기', action: { kind: 'jump', step: 'E' } } };
    case 'agent_handoff_pending':
    case 'executing':
      if (failed) return { tone: 'failed', text: `${who(failed)}가 시작하지 못했어요: ${(failed.actualProviderStatus || '이유 확인 필요').replace(/^linear: /, '').slice(0, 90)}`, primary: { label: '작업 보기·다시 시작', action: { kind: 'jump', step: 'E' } } };
      if (running) return { tone: 'working', text: `${who(running)}가 개발하는 중이에요. 끝나면 결과와 점수가 여기 와요.`, secondary: { label: '작업 보기', action: { kind: 'jump', step: 'E' } } };
      return { tone: 'working', text: '개발을 시작하는 중이에요(자동).', secondary: { label: '작업 보기', action: { kind: 'jump', step: 'E' } } };
    case 'result_review':
    case 'github_approval_pending': {
      const r = opts.review;
      const score = r ? (r.total === null ? '' : ` · 평가 ${r.crossTotal != null && r.total !== null ? Math.round((r.total + r.crossTotal) / 2) : r.total}점`) : ' · 평가 중';
      return {
        tone: 'turn',
        text: `결과(v${view.result?.revision ?? ''})가 왔어요${score}. 보고 올리기 승인하면 PR이 열려요.`,
        primary: canApprove(view, 'B').ok ? { label: '올리기 승인', action: { kind: 'approveB' } } : undefined,
        secondary: { label: '결과 보기', action: { kind: 'jump', step: 'B' } },
      };
    }
    case 'deployment_approval_pending':
      return opts.ciPassed && canApprove(view, 'C').ok
        ? { tone: 'turn', text: 'PR 검사(CI)를 통과했어요. 배포 승인하면 운영에 나가요.', primary: { label: '배포 승인', action: { kind: 'approveC' } }, secondary: { label: 'PR 보기', action: { kind: 'jump', step: 'C' } } }
        : { tone: 'working', text: 'PR과 검사(CI)를 확인하는 중이에요.', secondary: { label: 'PR 보기', action: { kind: 'jump', step: 'C' } } };
    case 'failed':
      return { tone: 'failed', text: '실패했어요. 이유를 확인해 주세요.', primary: { label: '이유 보기', action: { kind: 'jump', step: 'E' } } };
    default:
      return { tone: 'working', text: '진행 중이에요.' };
  }
}
