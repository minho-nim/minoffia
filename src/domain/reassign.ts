// 담당 바꾸기·한도 넘기기(v0.5.73, 소유자 "한도에 걸리면 다른 AI로 이어받기"): 지금 계획을 그대로 두고
// 한 작업의 담당만 바꾼 새 계획 버전을 만든다(계획은 추가만 하는 기록). 새 계획의 작업은 실행 승인(E)을 다시 받는다.
import type { AgentAssignment, AssigneePreference, PmPlan } from './workflow-types';

export const REASSIGN_MARK = '담당 바꿈';

export const PREF_LABEL: Record<'claude_support' | 'gemini_dev' | 'codex_primary', string> = {
  claude_support: 'Claude',
  gemini_dev: 'Gemini 개발',
  codex_primary: 'Codex',
};

/** 한도(사용량·요청 수)에 걸린 흔적이 있는지(규칙, 글자로만 본다) */
export function quotaHit(a: Pick<AgentAssignment, 'dispatchStatus' | 'actualProviderStatus'>): boolean {
  return a.dispatchStatus === 'blocked_quota' || /한도|사용량|limit|quota|429|resource_exhausted|rate.?limit/i.test(a.actualProviderStatus ?? '');
}

/** 바꿀 수 있는 담당(지금 담당 제외, AI Office 저장소에는 Gemini 개발 없음) */
export function reassignTargets(current: AgentAssignment['assignee'], officeRepo: boolean): (keyof typeof PREF_LABEL)[] {
  const all: (keyof typeof PREF_LABEL)[] = ['claude_support', 'gemini_dev', 'codex_primary'];
  const now = current === 'claude' ? 'claude_support' : current === 'codex' ? 'codex_primary' : current === 'gemini' ? 'gemini_dev' : null;
  return all.filter((p) => p !== now && !(officeRepo && p === 'gemini_dev'));
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
          goal: `${w.goal}\n\n[이어받기] 이전 담당이 멈춰서 넘겨받은 작업이다(${why}). 작업 브랜치나 이전 결과가 있으면 먼저 확인하고 이어서 한다.`.slice(0, 8000),
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
  return assignee === 'claude' ? 'claude_support' : assignee === 'codex' ? 'codex_primary' : 'gemini_dev';
}
