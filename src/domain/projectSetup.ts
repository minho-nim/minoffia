// 프로젝트 준비 체크리스트(v0.6.32, 소유자 "새로 만든 건 또 이 작업을 해야 하나"): 자동으로 못 하는 설정(Codex 환경·Claude 루틴 저장소)을
// 프로젝트 카드에서 바로 하게 링크·복사 버튼을 두고, 최근 업무에서 막힌 흔적이 있으면 알려 준다(규칙만, 확인한 기록만).
import type { Task } from './types';
import type { WorkflowData } from './workflow-types';

/** 결과 제출용 서버 주소(공개 주소, 비밀값 아님): Codex 환경의 '추가 허용 도메인'에 넣는다 */
export const SUBMIT_HOST = 'kmmicksimbredbyvdmvx.supabase.co';
export const CODEX_ENV_URL = 'https://chatgpt.com/codex/settings/environments';
export const ROUTINES_URL = 'https://claude.ai/code';

export interface SetupIssues {
  /** Codex가 이 프로젝트 업무에서 '환경 없음'으로 시작하지 못한 적이 있음(가장 최근 것) */
  codex: string | null;
  /** Claude가 이 프로젝트 저장소를 열지 못한 적이 있음 */
  claude: string | null;
  /** 그 실패 기록 시각(소유자가 '넣었어요'를 체크한 뒤의 실패만 다시 알리려고, v0.7.20) */
  codexAt?: string;
  claudeAt?: string;
}

/** 소유자가 설정을 마쳤다고 체크한 시각보다 오래된 실패는 알리지 않는다(v0.7.20 소유자 "다 넣었음") */
export function openIssue(issue: string | null, failedAt: string | undefined, checkedAt: string | null): string | null {
  if (!issue) return null;
  if (checkedAt && failedAt && failedAt <= checkedAt) return null;
  return issue;
}

export function setupIssues(projectId: string, tasks: Task[], wf: WorkflowData): SetupIssues {
  const ids = new Set(tasks.filter((t) => t.projectId === projectId).map((t) => t.id));
  const mine = wf.assignments.filter((a) => ids.has(a.taskId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const codexA = mine.find((a) => a.assignee === 'codex' && /no available environments|create an environment|환경 없음/i.test(a.actualProviderStatus ?? ''));
  const codexOk = mine.find((a) => a.assignee === 'codex' && (a.dispatchStatus === 'completed' || /Working|작업 중/i.test(a.actualProviderStatus ?? '')));
  const claudeA = mine.find((a) => a.assignee === 'claude' && /저장소 없음/.test(a.actualProviderStatus ?? ''));
  const claudeOk = mine.find((a) => a.assignee === 'claude' && a.dispatchStatus === 'completed' && !/저장소 없음/.test(a.actualProviderStatus ?? ''));
  return {
    codex: codexA && (!codexOk || codexOk.updatedAt < codexA.updatedAt) ? 'Codex가 이 저장소 환경을 찾지 못했어요' : null,
    claude: claudeA && (!claudeOk || claudeOk.updatedAt < claudeA.updatedAt) ? 'Claude 루틴에 이 저장소가 없어요' : null,
    ...(codexA ? { codexAt: codexA.updatedAt } : {}),
    ...(claudeA ? { claudeAt: claudeA.updatedAt } : {}),
  };
}
