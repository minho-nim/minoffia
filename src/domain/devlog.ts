/**
 * 개발일지: 입력창 대화와 업무 기록(기획서·승인·계획·결과·PR·배포)을 프로젝트별·날짜(KST)별로 모은다.
 * AI 호출 없음. 여기서 만든 Markdown을 개발일지 프로젝트에 올리고, 정리는 AI가 한다.
 */
import { AGENT_BY_ID } from './agents';
import type { Snapshot } from './types';
import { kstDay } from './usage';
import { GATE_LABEL, INTENT_LABEL } from './workflow-types';

export type ChatRole = 'me' | 'office' | 'gemini';

/** 대화 기록 한 줄(0011 chat_messages) */
export interface ChatEntry {
  id: string;
  role: ChatRole;
  text: string;
  projectId: string | null;
  taskId: string | null;
  createdAt: string;
}

export interface DevlogEvent {
  at: string;
  projectId: string | null;
  taskId: string | null;
  kind: 'chat' | 'task';
  text: string;
}

const ROLE_LABEL: Record<ChatRole, string> = { me: '나', office: '미니엉', gemini: 'Gemini' };

/** 프로젝트가 없는 대화를 묶는 이름 */
export const NO_PROJECT = '일반 대화(프로젝트 없음)';

const kstTime = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(11, 16);

/** 대화와 업무 기록을 시간순 사건 목록으로 */
export function devlogEvents(snap: Snapshot, chat: ChatEntry[]): DevlogEvent[] {
  const taskById = new Map(snap.tasks.map((t) => [t.id, t]));
  const projectOf = (taskId: string | null) => (taskId ? taskById.get(taskId)?.projectId ?? null : null);
  const ev: DevlogEvent[] = [];
  const add = (at: string, taskId: string, text: string) => ev.push({ at, taskId, projectId: projectOf(taskId), kind: 'task', text });
  const w = snap.workflow;

  for (const t of snap.tasks) {
    if (t.sample) continue;
    add(t.createdAt, t.id, `업무 접수: ${t.title} (담당 ${AGENT_BY_ID[t.assignee]?.name ?? t.assignee})${t.userOriginalText ? `\n요청 원문: ${t.userOriginalText}` : ''}`);
  }
  for (const s of w.specs) add(s.createdAt, s.taskId, `기획서 v${s.revision} (${INTENT_LABEL[s.intent]})${s.finalPrompt ? `\n최종 프롬프트: ${s.finalPrompt}` : ''}${s.answer ? `\nGPT 답변: ${s.answer}` : ''}`);
  for (const a of w.approvals) add(a.createdAt, a.taskId, `${GATE_LABEL[a.gate]}: ${a.decision === 'approved' ? '승인' : '수정 요청'} (v${a.approvedRevision}${a.workItemId ? ` · ${a.workItemId}` : ''})`);
  for (const p of w.plans) add(p.createdAt, p.taskId, `Claude PM 계획 v${p.planRevision}: 작업 ${p.plan.work_items.length}개 (${p.plan.work_items.map((i) => `${i.id} ${i.title}`).join(', ')})`);
  for (const r of w.results) add(r.createdAt, r.taskId, `결과 v${r.revision}: ${r.summary || '(요약 없음)'}${r.remainingIssues ? `\n남은 문제: ${r.remainingIssues}` : ''}`);
  for (const r of w.revisionRequests) add(r.createdAt, r.taskId, `수정 요청(결과 v${r.resultRevision}): ${r.feedback}`);
  for (const c of w.prChecks) add(c.checkedAt, c.taskId, `PR·CI 확인: ${c.prUrl} · CI ${c.ciState} · ${c.merged ? '병합됨' : '병합 전'}`);
  for (const d of w.deployments) add(d.createdAt, d.taskId, d.ok ? `운영 배포: ${d.repo} release → ${d.toSha.slice(0, 7)}` : `운영 배포 실패: ${d.error}`);

  for (const m of chat) {
    ev.push({ at: m.createdAt, taskId: m.taskId, projectId: m.projectId ?? projectOf(m.taskId), kind: 'chat', text: `${ROLE_LABEL[m.role]}: ${m.text}` });
  }
  return ev.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * 기간(KST 날짜, 양끝 포함)의 개발일지 Markdown. projectId를 주면 그 프로젝트만.
 * 형식: ## 프로젝트 → ### 날짜 → - 시각 [업무] 내용
 */
export function buildDevlog(snap: Snapshot, chat: ChatEntry[], range: { from: string; to: string }, projectId?: string): string {
  const names = new Map(snap.projects.map((p) => [p.id, p.name]));
  const titles = new Map(snap.tasks.map((t) => [t.id, t.title]));
  const events = devlogEvents(snap, chat).filter((e) => {
    const day = kstDay(new Date(e.at));
    return day >= range.from && day <= range.to && (!projectId || e.projectId === projectId);
  });
  if (!events.length) return `# 개발일지 ${range.from === range.to ? range.from : `${range.from} ~ ${range.to}`}\n\n(기록 없음)\n`;

  // 프로젝트 ID로 묶는다(이름이 같거나 바뀌어도 섞이지 않게). '' = 프로젝트 없음
  const byProject = new Map<string, DevlogEvent[]>();
  for (const e of events) {
    const key = e.projectId && names.has(e.projectId) ? e.projectId : '';
    byProject.set(key, [...(byProject.get(key) ?? []), e]);
  }
  // 프로젝트 이름순, 프로젝트 없는 대화는 맨 뒤
  const order = [...byProject.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : names.get(a)!.localeCompare(names.get(b)!, 'ko')));

  const out = [`# 개발일지 ${range.from === range.to ? range.from : `${range.from} ~ ${range.to}`}`, ''];
  for (const id of order) {
    // 나중에 개발일지 프로젝트에 올릴 때 ID로 정확히 묶을 수 있게 함께 적는다.
    out.push(id ? `## ${names.get(id)} (프로젝트 ID: ${id})` : `## ${NO_PROJECT}`, '');
    let day = '';
    for (const e of byProject.get(id)!) {
      const d = kstDay(new Date(e.at));
      if (d !== day) {
        if (day) out.push('');
        out.push(`### ${d}`, '');
        day = d;
      }
      const tag = e.kind === 'task' && e.taskId ? ` [${titles.get(e.taskId) ?? '업무'}]` : '';
      out.push(`- ${kstTime(e.at)}${tag} ${e.text.replace(/\n/g, '\n  ')}`);
    }
    out.push('');
  }
  return out.join('\n');
}

