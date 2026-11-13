// 담당 바꾸기·한도 넘기기(v0.5.73, 소유자 "한도에 걸리면 다른 AI로 이어받기"): 지금 계획을 그대로 두고
// 한 작업의 담당만 바꾼 새 계획 버전을 만든다(계획은 추가만 하는 기록). 새 계획의 작업은 실행 승인(E)을 다시 받는다.
import type { AgentAssignment, AssigneePreference, PmPlan } from './workflow-types';

export const REASSIGN_MARK = '담당 바꿈';
/** 두 AI 비교(v0.6.54, Conductor 비교 모드 착안): 같은 작업을 다른 AI에게도 따로 시킬 때의 이유 글 머리 */
export const COMPARE_WHY = '비교';

/** 비교 버튼을 보일 때: 작업 하나짜리 계획이 끝났고, 그 결과에 작업 브랜치가 있고, 아직 올리기 승인 전 */
export function canCompare(v: { plan: { plan: { work_items: unknown[] } } | null; bApproved: boolean; waitingWork: unknown[]; result: { workItemId: string } | null }, a: { workItemId: string; dispatchStatus: string; assignee: string }): boolean {
  return !!v.plan && v.plan.plan.work_items.length === 1 && !v.bApproved && v.waitingWork.length === 0 && a.dispatchStatus === 'completed' && v.result?.workItemId === a.workItemId && (a.assignee === 'codex' || a.assignee === 'claude');
}

/** 비교할 다른 AI(Codex ↔ Claude) */
export function compareTarget(assignee: string): 'claude_support' | 'codex_primary' {
  return assignee === 'claude' ? 'codex_primary' : 'claude_support';
}

export const PREF_LABEL: Record<'claude_support' | 'codex_primary', string> = {
  claude_support: 'Claude',
  codex_primary: 'Codex',
};

/** 한도(사용량·요청 수)에 걸린 흔적이 있는지(규칙, 글자로만 본다) */
export function quotaHit(a: Pick<AgentAssignment, 'dispatchStatus' | 'actualProviderStatus'>): boolean {
  return a.dispatchStatus === 'blocked_quota' || /한도|사용량|limit|quota|429|resource_exhausted|rate.?limit/i.test(a.actualProviderStatus ?? '');
}

/** 바꿀 수 있는 담당(지금 담당 제외, AI Office 저장소에는 Gemini 개발 없음) */
export function reassignTargets(current: AgentAssignment['assignee'], officeRepo: boolean): (keyof typeof PREF_LABEL)[] {
  const all: (keyof typeof PREF_LABEL)[] = ['claude_support', 'codex_primary'];
  const now = current === 'claude' ? 'claude_support' : current === 'codex' ? 'codex_primary' : null;
  void officeRepo;
  return all.filter((p) => p !== now);
}

/** 한 작업의 담당만 바꾼 새 계획(JSON 글). 이어받는 AI가 알 수 있게 이전 담당·이유를 목표 끝에 적는다 */
export function reassignPlanText(plan: PmPlan, workItemId: string, to: AssigneePreference, why: string): string {
  const body = plan.plan;
  const items = body.work_items.map((w) =>
    w.id !== workItemId
      ? w
      : {
          ...w,
          assignee_preference: to,
          execution_mode: 'manual_handoff' as const,
          goal: (why.startsWith(COMPARE_WHY)
            ? `${w.goal}\n\n[비교] 다른 AI가 같은 일을 이미 했다. 비교하려는 것이니 이전 결과·작업 브랜치는 보지 말고 처음부터 따로 한다.`
            : `${w.goal}\n\n[이어받기] 이전 담당이 멈춰서 넘겨받은 작업이다(${why}). 작업 브랜치나 이전 결과가 있으면 먼저 확인하고 이어서 한다.`
          ).slice(0, 8000),
        },
  );
  return JSON.stringify({
    ...body,
    plan_revision: plan.planRevision + 1,
    mode_reason: `${body.mode_reason ? `${body.mode_reason} · ` : ''}${REASSIGN_MARK}: ${workItemId} → ${PREF_LABEL[to as keyof typeof PREF_LABEL] ?? to}(${why})`.slice(0, 300),
    work_items: items,
  });
}

/** CI(PR 검사) 실패를 같은 AI에게 다시 맡길 이유 글. 같은 커밋으로는 한 번만 만들게 표시를 남긴다(v0.5.75) */
export function ciFixWhy(check: { headSha: string; checks: { name: string; conclusion: string | null }[] }): string {
  const failed = check.checks.filter((c) => c.conclusion && !['success', 'skipped', 'neutral'].includes(c.conclusion)).map((c) => c.name).slice(0, 5);
  return `CI 고치기 ${check.headSha.slice(0, 7)}: 실패한 검사 ${failed.length ? failed.join(', ') : '(이름 없음)'}`;
}

export const ciFixDone = (modeReason: string | undefined, headSha: string) => (modeReason ?? '').includes(`CI 고치기 ${headSha.slice(0, 7)}`);

export function prefOf(assignee: AgentAssignment['assignee']): AssigneePreference {
  return assignee === 'claude' ? 'claude_support' : 'codex_primary';
}

/** 한도에 걸린 작업을 넘길 다음 AI(v0.5.81): Claude → Codex 순, 지금 담당·휴가는 뺀다(Gemini 개발은 2026-11-13 뺐다) */
export function nextAgent(current: AgentAssignment['assignee'], away: { claude?: boolean; codex?: boolean; gemini?: boolean }, _officeRepo: boolean): AssigneePreference | null {
  const order: [AssigneePreference, boolean][] = [
    ['claude_support', !away.claude && current !== 'claude'],
    ['codex_primary', !away.codex && current !== 'codex'],
  ];
  return order.find(([, ok]) => ok)?.[0] ?? null;
}

/** 시작했는데 소식이 없는 작업(v0.5.84, '지시 받음' 확인): 시작 요청이 안 끝났거나, 시작 뒤 너무 오래 결과가 없으면 경고 글 */
const STALE_MIN: Record<string, number> = { gemini: 35, claude: 60, codex: 120 };
export function staleStart(a: Pick<AgentAssignment, 'assignee' | 'dispatchStatus' | 'startedAt' | 'updatedAt'>, now = Date.now()): string | null {
  const since = Date.parse(a.startedAt ?? a.updatedAt);
  if (!Number.isFinite(since)) return null;
  const min = Math.floor((now - since) / 60_000);
  if (a.dispatchStatus === 'starting' && min >= 5) return `시작 요청을 보낸 지 ${min}분이 지났는데 시작됐다는 확인이 없어요. 지시가 전달되지 않았을 수 있어요.`;
  const limit = STALE_MIN[a.assignee] ?? 60;
  if (a.dispatchStatus === 'started' && min >= limit) return `시작한 지 ${min}분째 결과 소식이 없어요(보통 ${limit}분 안에 와요). 멈췄을 수 있어요.`;
  return null;
}
