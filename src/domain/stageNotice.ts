/**
 * 업무 단계가 바뀌면 미니엉이 입력창에 알려 주는 말(규칙만, LLM 호출 없음).
 * 기획서·계획·결과 버전이 바뀌어도 알린다. 처음 보는 업무는 기억만 하고 알리지 않는다(접수 때 이미 말함).
 */
import type { Task } from './types';
import { canApprove, deriveWorkflow } from './workflow';
import { STAGE_LABEL, type Stage, type WorkflowData } from './workflow-types';

/** 알림 아래에 둘 버튼. open = 업무 카드 보기, A·B = 그 자리에서 승인 */
export type NoticeAction = 'open' | 'A' | 'B';

export interface StageNotice {
  /** 같은 알림을 두 번 넣지 않도록 쓰는 id(여러 기기에서도 같음) */
  id: string;
  taskId: string;
  projectId: string;
  stage: Stage;
  text: string;
  actions: NoticeAction[];
}

const NEXT: Partial<Record<Stage, string>> = {
  received: '업무 카드에서 "ChatGPT용 자료 복사"로 기획을 시작하세요.',
  planner_handoff: 'ChatGPT 답(기획서)을 업무 카드에 붙여넣으세요.',
  needs_clarification: 'GPT의 확인 질문에 답해 주세요.',
  spec_ready: '기획서를 보고 기획 승인하거나 수정 요청하세요.',
  development_approval_pending: '기획서를 보고 기획 승인하거나 수정 요청하세요.',
  pm_queued: '업무 카드에서 Claude PM에 보내세요.',
  dispatching: 'Claude PM이 계획을 만들고 있어요. 계획이 오면 알려 드릴게요.',
  agent_handoff_pending: 'PM 계획이 왔어요. 업무 카드에서 계획을 보고 작업별로 실행 승인하세요.',
  executing: 'AI가 개발 중이에요. 결과가 나오면 결과 패키지를 등록하세요.',
  validation: '검증 중이에요.',
  result_review: '결과를 보고 올리기 승인(GitHub)하거나 수정 요청하세요.',
  github_approval_pending: '결과를 보고 올리기 승인(GitHub)하세요.',
  github_uploading: '업무 카드의 "PR 요청 복사"로 PR을 올리고 PR 주소를 넣으세요.',
  pr_review: 'PR의 CI와 병합을 확인하세요.',
  deployment_approval_pending: 'CI 통과를 확인했어요. 배포 승인하세요(병합은 서버가 해요).',
  deploying: '배포하고 있어요.',
  completed: '이 업무는 끝났어요.',
  paused: '보류 중이에요.',
  rate_limited: '오늘 한도에 걸렸어요. 내일 다시 하거나 상한을 확인하세요.',
  integration_blocked: '연동이 막혔어요. 업무 카드에서 이유를 확인하세요.',
  failed: '실패했어요. 업무 카드에서 이유를 확인하세요.',
};

/** 단계와 버전을 묶은 표식. 이것이 바뀌면 알린다. */
export function stageSignature(task: Task, all: WorkflowData): string {
  const v = deriveWorkflow(task, all);
  return [v.stage, v.spec?.revision ?? 0, v.plan?.planRevision ?? 0, v.result?.revision ?? 0].join(':');
}

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export function noticeFor(task: Task, all: WorkflowData): StageNotice {
  const v = deriveWorkflow(task, all);
  const lines = [`'${clip(task.title, 40)}' → ${STAGE_LABEL[v.stage]}`];
  const actions: NoticeAction[] = ['open'];
  if (v.spec && !v.aApproved && canApprove(v, 'A').ok) {
    lines.push(`기획서 v${v.spec.revision}: ${clip(v.spec.finalPrompt, 160)}`);
    actions.unshift('A');
  } else if (v.result && !v.bApproved && canApprove(v, 'B').ok) {
    lines.push(`결과 v${v.result.revision}: ${clip(v.result.summary, 160)}`);
    actions.unshift('B');
  }
  if (v.stage === 'needs_clarification' && v.spec?.answer) {
    const q = v.spec.answer.trim();
    lines.push(`확인 질문:\n${q.length > 600 ? `${q.slice(0, 599)}…` : q}`);
    lines.push(v.spec.planner === 'gemini_draft' ? '아래 입력창에 답을 쓰면 Gemini가 기획서를 다시 써요.' : 'ChatGPT에 답하고 새 기획서를 저장하세요.');
  } else lines.push(NEXT[v.stage] ?? '');
  return {
    id: `stage-${task.id}-${stageSignature(task, all)}`,
    taskId: task.id,
    projectId: task.projectId,
    stage: v.stage,
    text: lines.filter(Boolean).join('\n'),
    actions,
  };
}

/**
 * seen(업무 id → 표식)과 지금을 비교해 새 알림을 만든다. 지운 업무는 seen에서 뺀다.
 * 처음 보는 업무는 알리지 않고 기억만 한다.
 */
export function stageNotices(tasks: Task[], all: WorkflowData, seen: Record<string, string>): { notices: StageNotice[]; seen: Record<string, string> } {
  const next: Record<string, string> = {};
  const notices: StageNotice[] = [];
  for (const t of tasks) {
    const sig = stageSignature(t, all);
    next[t.id] = sig;
    if (seen[t.id] !== undefined && seen[t.id] !== sig) notices.push(noticeFor(t, all));
  }
  return { notices, seen: next };
}
