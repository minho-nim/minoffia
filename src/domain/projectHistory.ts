/**
 * 프로젝트 '한 일 기록'(v0.4.74, 읽기 쉽게 v0.4.75 소유자): 업무마다 접수 → 기획서 → 승인 → 계획 → 결과·채점 → PR → 배포를
 * 짧은 이름표와 한 줄로 모은다. 대화는 따로 켜야 보인다. AI 호출 없음.
 */
import { AGENT_BY_ID } from './agents';
import type { ChatEntry } from './devlog';
import { VERDICT_LABEL } from './review';
import { STATUS_LABEL, type Snapshot, type TaskStatus } from './types';
import { kstDay } from './usage';
import { GATE_LABEL, INTENT_LABEL } from './workflow-types';

export type Step = 'intake' | 'spec' | 'approval' | 'revision' | 'plan' | 'result' | 'review' | 'pr' | 'deploy' | 'chat';

export const STEP_LABEL: Record<Step, string> = {
  intake: '접수',
  spec: '기획서',
  approval: '승인',
  revision: '수정 요청',
  plan: '계획',
  result: '결과',
  review: '채점',
  pr: 'PR',
  deploy: '배포',
  chat: '대화',
};

export interface StoryItem {
  at: string;
  day: string;
  time: string;
  step: Step;
  /** 한 줄 요약 */
  line: string;
  /** 펼치면 보이는 전체(없으면 빈 문자열) */
  detail: string;
  /** 실패·수정 요청 같은 눈여겨볼 줄 */
  warn?: boolean;
}

export interface TaskStory {
  taskId: string | null;
  title: string;
  status: TaskStatus | null;
  statusLabel: string;
  lastAt: string;
  items: StoryItem[];
}

export interface ProjectStory {
  tasks: TaskStory[];
  counts: { total: number; done: number; active: number };
  lastDay: string | null;
}

const ROLE: Record<ChatEntry['role'], string> = { me: '나', office: '미니엉', gemini: 'Gemini' };
const kstTime = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(11, 16);
const cut = (s: string, n = 70) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n)}…` : one;
};

/** 프로젝트의 업무별 이야기. 최근에 움직인 업무부터, 업무 안은 시간순. chat을 주면 대화도 끼운다. */
export function projectStory(snap: Snapshot, chat: ChatEntry[], projectId: string, withChat = false): ProjectStory {
  const tasks = snap.tasks.filter((t) => t.projectId === projectId);
  const ids = new Set(tasks.map((t) => t.id));
  const byTask = new Map<string, StoryItem[]>();
  const push = (taskId: string, at: string, step: Step, line: string, detail = '', warn = false) => {
    if (!ids.has(taskId) || !at) return;
    byTask.set(taskId, [...(byTask.get(taskId) ?? []), { at, day: kstDay(new Date(at)), time: kstTime(at), step, line, detail, warn }]);
  };
  const w = snap.workflow;
  for (const t of tasks) push(t.id, t.createdAt, 'intake', `담당 ${AGENT_BY_ID[t.assignee]?.name ?? t.assignee}`, t.userOriginalText ?? '');
  for (const s of w.specs) push(s.taskId, s.createdAt, 'spec', `v${s.revision} · ${INTENT_LABEL[s.intent]}`, s.finalPrompt || s.answer || '');
  for (const a of w.approvals) {
    const ok = a.decision === 'approved';
    push(a.taskId, a.createdAt, ok ? 'approval' : 'revision', `${GATE_LABEL[a.gate]} ${ok ? '승인' : '수정 요청'} (v${a.approvedRevision}${a.workItemId ? ` · ${a.workItemId}` : ''})`, '', !ok);
  }
  for (const p of w.plans) push(p.taskId, p.createdAt, 'plan', `v${p.planRevision} · 작업 ${p.plan.work_items.length}개`, p.plan.work_items.map((i) => `${i.id} ${i.title}`).join('\n'));
  for (const r of w.results) push(r.taskId, r.createdAt, 'result', `v${r.revision} · ${cut(r.summary || '(요약 없음)')}`, [r.summary, r.remainingIssues ? `남은 문제: ${r.remainingIssues}` : ''].filter(Boolean).join('\n'));
  for (const r of w.revisionRequests) push(r.taskId, r.createdAt, 'revision', `결과 v${r.resultRevision} → ${cut(r.feedback)}`, r.feedback, true);
  for (const r of w.reviews ?? []) push(r.taskId, r.createdAt, 'review', `결과 v${r.resultRevision} · ${r.total ?? '-'}점 · ${VERDICT_LABEL[r.verdict]}`, r.reasons.join('\n'), r.verdict !== 'pass');
  for (const c of w.prChecks) push(c.taskId, c.checkedAt, 'pr', `CI ${c.ciState} · ${c.merged ? '병합됨' : '병합 전'}`, c.prUrl);
  for (const d of w.deployments) push(d.taskId, d.createdAt, 'deploy', d.ok ? `완료 → ${d.toSha.slice(0, 7)}` : `실패 · ${cut(d.error ?? '')}`, d.ok ? '' : d.error ?? '', !d.ok);

  const loose: StoryItem[] = [];
  if (withChat) {
    for (const m of chat) {
      const item: StoryItem = { at: m.createdAt, day: kstDay(new Date(m.createdAt)), time: kstTime(m.createdAt), step: 'chat', line: `${ROLE[m.role]}: ${cut(m.text, 90)}`, detail: m.text.length > 90 || m.text.includes('\n') ? m.text : '' };
      if (m.taskId && ids.has(m.taskId)) byTask.set(m.taskId, [...(byTask.get(m.taskId) ?? []), item]);
      else if (m.projectId === projectId) loose.push(item);
    }
  }

  const stories: TaskStory[] = tasks
    .map((t) => {
      const items = (byTask.get(t.id) ?? []).sort((a, b) => a.at.localeCompare(b.at));
      return { taskId: t.id, title: t.title, status: t.status, statusLabel: STATUS_LABEL[t.status], lastAt: items.at(-1)?.at ?? t.updatedAt, items };
    })
    .filter((s) => s.items.length);
  if (loose.length) {
    loose.sort((a, b) => a.at.localeCompare(b.at));
    stories.push({ taskId: null, title: '업무 밖 대화', status: null, statusLabel: '', lastAt: loose.at(-1)!.at, items: loose });
  }
  stories.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  const last = stories[0]?.lastAt;
  return {
    tasks: stories,
    counts: { total: tasks.length, done: tasks.filter((t) => t.status === 'done').length, active: tasks.filter((t) => t.status !== 'done').length },
    lastDay: last ? kstDay(new Date(last)) : null,
  };
}
