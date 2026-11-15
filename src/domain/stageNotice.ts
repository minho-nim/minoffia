/**
 * 업무 단계가 바뀌면 미니엉이 입력창에 알려 주는 말(규칙만, LLM 호출 없음).
 * 기획서·계획·결과 버전이 바뀌어도 알린다. 처음 보는 업무는 기억만 하고 알리지 않는다(접수 때 이미 말함).
 * v0.4.12(소유자 2026-10-31): 승인 차례는 "내 차례"와 사무실 말풍선이 보여 주므로, 입력창에는
 * 확인 질문과 막힘만 알린다(기억은 모든 업무에 대해 계속 한다).
 * v0.7.14(소유자 "단계 진행상황을 대화에서 알려줘야 해"): 시안 도착·평가 점수(동료 점수 포함)·PR 열림·검사도 알리고, 지금 흐름(실행 승인 자동)에 맞게 문구를 고쳤다.
 */
import type { Task } from './types';
import { canApprove, deriveWorkflow } from './workflow';
import { STAGE_LABEL, type Stage, type WorkflowData } from './workflow-types';
import { staleStart } from './reassign';
import { DRAW_STYLE_LABEL } from './designDraft';
import { VERDICT_LABEL } from './review';

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
  /** 한 메시지로 묶은 다른 알림 id(v0.7.16, 다시 넣지 않게) */
  ids?: string[];
}

const NEXT: Partial<Record<Stage, string>> = {
  received: 'Gemini가 기획서 초안을 쓸 차례예요.',
  planner_handoff: 'Gemini가 기획서 초안을 쓰고 있어요.',
  needs_clarification: 'GPT의 확인 질문에 답해 주세요.',
  spec_ready: '기획서를 보고 기획 승인하거나 수정 요청하세요.',
  development_approval_pending: '기획서를 보고 기획 승인하거나 수정 요청하세요.',
  pm_queued: '업무 카드에서 Claude PM에 보내세요.',
  dispatching: 'Claude PM이 작업으로 나누고 있어요. 계획이 오면 알려 드릴게요.',
  agent_handoff_pending: '작업 계획이 정해졌어요. 실행 승인은 기획 승인에 포함돼 AI가 곧 개발을 시작해요.',
  executing: '개발 중이에요. 결과가 오면 알려 드릴게요.',
  validation: '검증 중이에요.',
  result_review: '결과를 보고 결과 승인(PR 열림)하거나 수정 요청하세요.',
  github_approval_pending: '결과를 보고 결과 승인하세요(승인하면 PR이 열려요).',
  github_uploading: 'PR을 여는 중이에요(1~2분).',
  pr_review: 'PR을 열었어요. 검사(CI)가 끝나면 알려 드릴게요.',
  deployment_approval_pending: 'CI 통과를 확인했어요. 배포 승인하세요(병합은 서버가 해요).',
  deploying: '배포하고 있어요.',
  completed: '배포까지 끝났어요.',
  paused: '보류 중이에요.',
  rate_limited: '오늘 한도에 걸렸어요. 내일 다시 하거나 상한을 확인하세요.',
  integration_blocked: '연동이 막혔어요. 업무 카드에서 이유를 확인하세요.',
  failed: '실패했어요. 업무 카드에서 이유를 확인하세요.',
};

/**
 * 입력창에 알리는 단계: 확인 질문·막힘 + 손댈 일이 생기는 주요 단계(v0.5.26 소유자 "단계가 대화에 업데이트가 안돼").
 * 잠깐 지나가는 단계(기획 중·PM 전송 중·검증 중·배포 중)는 알리지 않는다.
 */
export const NOTICE_STAGES: ReadonlySet<Stage> = new Set<Stage>([
  'needs_clarification',
  'failed',
  'integration_blocked',
  'rate_limited',
  'spec_ready',
  'development_approval_pending',
  'dispatching',
  'agent_handoff_pending',
  'executing',
  'result_review',
  'github_approval_pending',
  'github_uploading',
  'pr_review',
  'deployment_approval_pending',
  'completed',
]);

/** 단계와 버전을 묶은 표식. 이것이 바뀌면 알린다. */
export function stageSignature(task: Task, all: WorkflowData): string {
  const v = deriveWorkflow(task, all);
  // v0.7.14: 시안 수·평가(판정과 점수 온 채점자 수)·PR 검사 상태가 바뀌어도 알린다
  const drafts = v.spec ? (all.designDrafts ?? []).filter((d) => d.taskId === task.id && d.specRevision === v.spec!.revision).length : 0;
  const rv = v.result ? (all.reviews ?? []).find((r) => r.taskId === task.id && r.resultRevision === v.result!.revision) : undefined;
  const review = rv ? `${rv.verdict}${(rv.panel ?? []).filter((p) => p.status === 'done').length}` : '';
  const pr = [...(all.prChecks ?? [])].filter((c) => c.taskId === task.id).pop()?.ciState ?? '';
  return [v.stage, v.spec?.revision ?? 0, v.plan?.planRevision ?? 0, v.result?.revision ?? 0, drafts, review, pr].join(':');
}

const AGENT: Record<string, string> = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini' };

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
  // 시안(v0.7.13): 기획 승인 전, 이 기획서 버전의 시안 점수
  if (v.spec && !v.aApproved) {
    const drafts = (all.designDrafts ?? []).filter((d) => d.taskId === task.id && d.specRevision === v.spec!.revision).sort((a, b) => a.who.localeCompare(b.who));
    if (drafts.length) lines.push(`시안 ${drafts.length}장: ${drafts.map((d) => `${d.who}(${DRAW_STYLE_LABEL[d.who]}) ${d.review ? `${d.review.total}점` : '점수 없음'}`).join(' · ')} — 업무 카드에서 하나를 고를 수 있어요.`);
  }
  // 3중 평가(v0.7.8): 채점자별 점수와 평균, 판정
  const rv = v.result ? (all.reviews ?? []).find((r) => r.taskId === task.id && r.resultRevision === v.result!.revision) : undefined;
  if (rv && !v.bApproved) {
    const panel = rv.panel ?? [];
    const each = panel.map((p) => `${p.who === 'peer' ? p.judge : `Gemini ${p.who}`} ${p.status === 'done' ? `${p.total}점` : p.status === 'pending' ? '기다리는 중' : '빠짐'}`).join(' · ');
    const waiting = panel.some((p) => p.status === 'pending');
    lines.push(`평가${rv.total === null ? '' : ` 평균 ${rv.total}점`}${each ? `(${each})` : ''} → ${waiting ? '점수 모으는 중' : VERDICT_LABEL[rv.verdict]}${rv.verdict === 'redo' && !waiting ? '(자동으로 다시 보냈어요)' : ''}`);
  }
  // PR 검사(v0.6.31): 배포 승인 차례여도 검사가 끝나기 전에는 '통과'라고 하지 않는다
  const pr = [...(all.prChecks ?? [])].filter((c) => c.taskId === task.id).pop();
  if (v.stage === 'deployment_approval_pending') {
    lines.push(
      pr?.ciState === 'success'
        ? 'PR 검사(CI)를 통과했어요. 배포 승인하세요(병합은 서버가 해요).'
        : pr?.ciState === 'failure'
          ? 'PR 검사(CI)가 실패했어요. 업무 카드에서 이유를 보고 고치기를 맡기세요.'
          : 'PR을 열고 검사(CI)하는 중이에요. 통과하면 알려 드릴게요.',
    );
  } else if (v.stage === 'needs_clarification' && v.spec?.answer) {
    const q = v.spec.answer.trim();
    lines.push(`확인 질문:\n${q.length > 600 ? `${q.slice(0, 599)}…` : q}`);
    lines.push('아래 입력창에 답을 쓰면 Gemini가 기획서를 다시 써요.');
  } else if (v.stage === 'executing' && v.plan) {
    // 누가 개발하는지(v0.7.15 소유자 "지금 클로드가 개발함")
    const running = all.assignments.filter((a) => a.taskId === task.id && a.planRevision === v.plan!.planRevision && (a.dispatchStatus === 'started' || a.dispatchStatus === 'starting'));
    lines.push(running.length ? `${running.map((a) => `${AGENT[a.assignee] ?? a.assignee}(${a.workItemId})`).join(' · ')}가 개발 중이에요. 결과가 오면 알려 드릴게요.` : NEXT.executing!);
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
    if (seen[t.id] === undefined || seen[t.id] === sig) continue;
    const n = noticeFor(t, all);
    if (NOTICE_STAGES.has(n.stage)) notices.push(n);
  }
  return { notices, seen: next };
}

/**
 * 개발이 오래 걸릴 때 대화창 알림(v0.6.80 소유자 "너무 오래 걸리면 대화창이나 알림으로 알려줘"): 지금 계획의 작업 중
 * 시작했는데 소식이 없는 것(staleStart, 업무 카드 경고와 같은 기준)을 한 번씩. id는 작업+시작 시각이라 다시 시작하면 다시 알린다.
 */
export function staleNotices(tasks: Task[], all: WorkflowData, now = Date.now()): StageNotice[] {
  const out: StageNotice[] = [];
  for (const t of tasks) {
    if (t.status === 'done') continue;
    const v = deriveWorkflow(t, all);
    if (!v.plan) continue;
    for (const a of all.assignments.filter((x) => x.taskId === t.id && x.planRevision === v.plan!.planRevision)) {
      const why = staleStart(a, now);
      if (!why) continue;
      out.push({
        id: `stale-${a.id}-${a.startedAt ?? a.updatedAt}`,
        taskId: t.id,
        projectId: t.projectId,
        stage: v.stage,
        text: `'${clip(t.title, 40)}' — ${AGENT[a.assignee] ?? a.assignee} ${a.workItemId}: ${why}\n업무 카드에서 다시 시도하거나 다른 AI로 넘길 수 있어요.`,
        actions: ['open'],
      });
    }
  }
  return out;
}

const GATE_DONE: Record<string, string> = { A: '기획 승인', B: '결과 승인(올리기)', C: '배포 승인', P: '견본 승인' };
/** 최근에 한 일만 알린다(처음 열 때 지난 기록이 쏟아지지 않게) */
const ACTION_WINDOW_MS = 30 * 60_000;

/**
 * 사장님이 누른 것도 대화에 남긴다(v0.7.15 소유자 "채팅에서 내가 눌러 승인한 것도"): 기획·결과·배포 승인과 되돌리기,
 * 수정 요청(자동 평가가 보낸 다시 개발은 따로), 시안 고르기. id는 기록 id라 여러 기기에서도 한 번씩.
 * 실행 승인(E)은 기획 승인에 포함된 자동 기록이라 알리지 않는다.
 */
export function actionNotices(tasks: Task[], all: WorkflowData, now = Date.now()): StageNotice[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const recent = (at: string) => now - Date.parse(at) < ACTION_WINDOW_MS;
  const out: { at: string; n: StageNotice }[] = [];
  const push = (id: string, taskId: string, at: string, text: string) => {
    const t = byId.get(taskId);
    if (!t || !recent(at)) return;
    out.push({ at, n: { id, taskId, projectId: t.projectId, stage: deriveWorkflow(t, all).stage, text: `'${clip(t.title, 40)}' — ${text}`, actions: ['open'] } });
  };
  for (const a of all.approvals) {
    if (a.gate === 'E' || !GATE_DONE[a.gate]) continue;
    const what = a.gate === 'A' ? `기획서 v${a.approvedRevision}` : a.gate === 'P' ? `견본` : `결과 v${a.approvedRevision}`;
    push(`act-${a.id}`, a.taskId, a.createdAt, a.decision === 'approved' ? `✓ ${GATE_DONE[a.gate]}을 눌렀어요(${what}).` : `${GATE_DONE[a.gate]}을 되돌렸어요(${what}).`);
  }
  for (const r of all.revisionRequests) {
    const auto = r.feedback.startsWith('[자동 평가]');
    push(`act-${r.id}`, r.taskId, r.createdAt, auto ? '자동 평가가 기준 미달이라 다시 개발을 보냈어요.' : `수정 요청을 보냈어요: ${clip(r.feedback, 80)}`);
  }
  for (const p of all.designPicks ?? []) {
    const d = (all.designDrafts ?? []).find((x) => x.id === p.draftId);
    push(`act-${p.id}`, p.taskId, p.createdAt, `Gemini ${d?.who ?? ''} 시안을 골랐어요. 개발 AI에게 같이 넘어가요.`);
  }
  return out.sort((a, b) => a.at.localeCompare(b.at)).map((x) => x.n);
}

/**
 * 같은 업무에서 한꺼번에 일어난 것은 한 메시지로(v0.7.16 소유자 "한 번에 끝나면 한 번에 했다고"):
 * 사장님이 누른 것(act-)과 그 결과 단계 알림(stage-)이 같이 오면 "✓ 배포 승인을 눌렀어요 → 완료"처럼 묶는다.
 */
export function mergeNotices(list: StageNotice[]): StageNotice[] {
  const out: StageNotice[] = [];
  const done = new Set<StageNotice>();
  for (const n of list) {
    if (done.has(n)) continue;
    const acts = list.filter((x) => x.taskId === n.taskId && x.id.startsWith('act-') && !done.has(x));
    const stage = list.find((x) => x.taskId === n.taskId && x.id.startsWith('stage-') && !done.has(x));
    if (!/^(act|stage)-/.test(n.id) || !acts.length || !stage) {
      done.add(n);
      out.push(n);
      continue;
    }
    [...acts, stage].forEach((x) => done.add(x));
    const [head, ...rest] = stage.text.split('\n');
    const [title, ...label] = head.split(' → ');
    const did = acts.map((x) => x.text.split(' — ').slice(1).join(' — ')).join(' ');
    out.push({ ...stage, text: [`${title} — ${did} → ${label.join(' → ')}`, ...rest].join('\n'), ids: acts.map((x) => x.id) });
  }
  return out;
}
