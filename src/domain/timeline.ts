// 업무 기록 타임라인(v0.6.54, 소유자 "다른 오케스트레이션 아이디어": 실행 추적·넘겨주기 표시).
// 이미 저장된 기록(기획서·승인·계획·작업·결과·채점·PR·배포)을 시간순 한 줄씩으로 보여 준다. AI 호출 없음.
import type { WorkflowData } from './workflow-types';
import { usedSkills } from './skills';

export type TimelineTone = 'info' | 'ok' | 'bad' | 'turn';
export interface TimelineEvent {
  at: string;
  text: string;
  tone: TimelineTone;
  /** 누가 했는지(v0.7.19: 나·Gemini A·Claude·Codex·평가·미노·자동). 글이 그 이름으로 시작하면 화면에서 다시 붙이지 않는다 */
  who?: string;
}

const WHO: Record<string, string> = { codex: 'Codex', claude: 'Claude', gemini: 'Gemini' };
const who = (a: string) => WHO[a] ?? a;
const GATE: Record<string, string> = { A: '기획 승인', P: '견본 승인', E: '실행 승인', B: '올리기 승인', C: '배포 승인' };
const RESULT_SOURCE: Record<string, string> = {
  codex_linear_auto: 'Codex 자동 제출',
  codex_cloud_manual: 'Codex 수동 등록',
  claude_session_auto: 'Claude 자동 제출',
  claude_manual: 'Claude 수동 등록',
  gemini_actions_auto: 'Gemini 개발',
  manual: '수동 등록',
};
const PLAN_SOURCE: Record<string, string> = {
  routine_session_auto: 'Claude PM',
  routine_session_manual_import: 'Claude PM(붙여 넣기)',
  rule_small: '작은 일 규칙',
  gemini_fallback: 'Gemini 분배',
  manual: '수동',
};
const PLAN_WHO: Record<string, string> = { routine_session_auto: 'Claude', routine_session_manual_import: 'Claude', rule_small: '규칙', gemini_fallback: 'Gemini', manual: '나' };
const HANDOFF_MARK = '담당 바꿈';
const cut = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 이 업무의 기록을 시간순으로(오래된 것 먼저). 같은 시각이면 들어온 순서 그대로 */
export function taskTimeline(taskId: string, wf: WorkflowData): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  const push = (at: string | null | undefined, text: string, tone: TimelineTone = 'info', by = '') => {
    if (at) out.push({ at, text, tone, ...(by ? { who: by } : {}) });
  };

  for (const s of wf.specs.filter((x) => x.taskId === taskId)) {
    push(s.createdAt, `기획서 v${s.revision}${s.planner === 'gemini_draft' ? ' (Gemini 초안)' : ''}`, 'info', s.planner === 'gemini_draft' ? 'Gemini A' : '나');
  }
  // Gemini 시안(v0.7.13): 기획서 버전마다 도착 한 줄, 고른 것 한 줄
  const drafts = (wf.designDrafts ?? []).filter((x) => x.taskId === taskId);
  for (const rev of [...new Set(drafts.map((d) => d.specRevision))]) {
    const ds = drafts.filter((d) => d.specRevision === rev).sort((a, b) => a.who.localeCompare(b.who));
    push(ds[0].createdAt, `시안 ${ds.length}장: ${ds.map((d) => `${d.who} ${d.review ? `${d.review.total}점` : '점수 없음'}`).join(' · ')}`, 'info', 'Gemini A·B');
  }
  for (const p of (wf.designPicks ?? []).filter((x) => x.taskId === taskId)) {
    const d = drafts.find((x) => x.id === p.draftId);
    push(p.createdAt, `Gemini ${d?.who ?? ''} 시안을 고름`, 'turn', '나');
  }
  for (const a of wf.approvals.filter((x) => x.taskId === taskId)) {
    const auto = a.gate === 'E' && (a.scope as { auto?: boolean }).auto === true;
    const label = GATE[a.gate] ?? a.gate;
    const what = a.workItemId ? ` · ${a.workItemId}` : '';
    if (a.decision === 'approved') push(a.createdAt, auto ? `${label}(기획 승인에 포함, 자동)${what}` : `✓ ${label}${what}`, auto ? 'info' : 'turn', auto ? '자동' : '나');
    else push(a.createdAt, `${label} 반려${what}`, 'bad', '나');
  }

  const plans = wf.plans.filter((x) => x.taskId === taskId).sort((a, b) => a.planRevision - b.planRevision);
  const assigns = wf.assignments.filter((x) => x.taskId === taskId);
  for (const p of plans) {
    const items = p.plan.work_items ?? [];
    const reason = String(p.plan.mode_reason ?? '');
    const handoff = reason.includes(HANDOFF_MARK);
    if (handoff) {
      // 넘겨주기(Agents SDK의 handoff): 왜 담당이 바뀌었는지 한 줄로
      const m = reason.match(new RegExp(`${HANDOFF_MARK}: ([^ ]+) → (\\S+)\\((.*)\\)`));
      if (m && m[3].startsWith('비교')) push(p.createdAt, `비교: ${m[1]}을 ${m[2]}에게도 따로 맡김`, 'info', '나');
      else push(p.createdAt, m ? `넘겨주기: ${m[1]} → ${m[2]} (${cut(m[3], 60)})` : `넘겨주기: ${cut(reason, 80)}`, 'turn', '자동');
    } else {
      const names = [...new Set(assigns.filter((a) => a.planRevision === p.planRevision).map((a) => who(a.assignee)))];
      push(p.createdAt, `계획 v${p.planRevision}: 작업 ${items.length}개${names.length ? ` (${names.join('·')})` : ''} · ${PLAN_SOURCE[p.source] ?? p.source}`, 'info', PLAN_WHO[p.source] ?? '');
    }
  }

  for (const a of assigns) {
    const name = `${who(a.assignee)} ${a.workItemId}`;
    const by = who(a.assignee);
    if (a.startedAt) push(a.startedAt, `${name} 시작`, 'info', by);
    if (a.dispatchStatus === 'failed') push(a.updatedAt, `${name} 실패: ${cut(a.actualProviderStatus || '이유 없음')}`, 'bad', by);
    else if (a.dispatchStatus === 'blocked_quota') push(a.updatedAt, `${name} 한도 대기`, 'bad', by);
    else if (a.dispatchStatus === 'completed') push(a.updatedAt, `${name} 끝냄`, 'ok', by);
  }

  for (const r of wf.results.filter((x) => x.taskId === taskId)) {
    const used = usedSkills(r.summary ?? '', r.testLog ?? '');
    push(r.createdAt, `결과 v${r.revision} 도착 (${RESULT_SOURCE[r.source] ?? r.source})${used.length ? ` · 쓴 스킬: ${used.join(', ')}` : ''}`, 'ok', r.source.startsWith('codex') ? 'Codex' : r.source.startsWith('claude') ? 'Claude' : r.source.startsWith('gemini') ? 'Gemini' : '나');
  }
  for (const v of (wf.reviews ?? []).filter((x) => x.taskId === taskId)) {
    const score = v.total == null ? '점수 없음' : `${v.total}점`;
    const cross = v.crossTotal != null ? ` · 교차 ${v.crossTotal}점(${v.crossJudge ?? ''})` : '';
    const tone: TimelineTone = v.verdict === 'pass' ? 'ok' : v.verdict === 'redo' ? 'bad' : 'turn';
    push(v.createdAt, `채점 v${v.resultRevision}: ${score} (${v.judge})${cross}${v.verdict === 'redo' ? ' → 다시 개발' : ''}`, tone, '평가');
  }
  for (const q of wf.revisionRequests.filter((x) => x.taskId === taskId)) {
    const autoRedo = q.feedback.startsWith('[자동 평가]');
    push(q.createdAt, autoRedo ? '기준 미달이라 다시 개발' : `수정 요청: ${cut(q.feedback, 60)}`, 'turn', autoRedo ? '자동 평가' : '나');
  }
  // PR은 마지막 확인만(1분마다 확인 기록이 쌓여 다 보이면 길다)
  const pr = wf.prChecks.filter((x) => x.taskId === taskId).sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))[0];
  if (pr) push(pr.checkedAt, `PR ${pr.merged ? '병합됨' : pr.prState === 'open' ? '열림' : '닫힘'} · 검사 ${pr.ciState === 'success' ? '통과' : pr.ciState === 'failure' ? '실패' : pr.ciState === 'pending' ? '진행 중' : '없음'}`, pr.ciState === 'failure' ? 'bad' : pr.merged ? 'ok' : 'info', '미노');
  for (const d of wf.deployments.filter((x) => x.taskId === taskId)) {
    push(d.createdAt, d.ok ? `배포 ${d.repo} ${d.fromSha.slice(0, 7)} → ${d.toSha.slice(0, 7)}` : `배포 실패: ${cut(d.error)}`, d.ok ? 'ok' : 'bad', '미노');
  }

  return out.map((e, i) => ({ e, i })).sort((a, b) => a.e.at.localeCompare(b.e.at) || a.i - b.i).map((x) => x.e);
}

/** 화면용 시각(같은 날이면 시:분, 아니면 월/일 시:분, 한국 시간) */
export function timelineTime(at: string, now = new Date()): string {
  const d = new Date(at);
  const kst = (x: Date) => new Date(x.getTime() + 9 * 3600_000).toISOString();
  const k = kst(d);
  const sameDay = k.slice(0, 10) === kst(now).slice(0, 10);
  return sameDay ? k.slice(11, 16) : `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))} ${k.slice(11, 16)}`;
}
