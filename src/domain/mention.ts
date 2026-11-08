// @이름으로 맡기기(v0.5.46, 소유자 요청 12번): 요청에 "@클로드"처럼 쓰면 그 AI가 개발을 맡는다(규칙, 모델 호출 없음).
// 작은 일이면 바로 그 AI에 배정하고, PM이 나눈 계획이면 모든 작업의 담당을 그 AI로 바꾼다. 실행 승인(E)은 그대로 소유자가 한다.
import { OFFICE_REPOS } from './smallTask';
import type { AssigneePreference, WorkItem } from './workflow-types';

const NAMES: [RegExp, AssigneePreference, string][] = [
  [/@(코덱스|codex)/i, 'codex_primary', 'Codex'],
  [/@(클로드|claude)/i, 'claude_support', 'Claude'],
  [/@(제미나이|제미니|gemini|스튜디오|studio)/i, 'gemini_dev', 'Gemini 개발'],
];

export type Mention = { preference: AssigneePreference; label: string };

/** 요청 글에서 가장 먼저 나온 @이름. 없으면 null */
export function mentionedAssignee(text: string | null | undefined): Mention | null {
  let best: { at: number; m: Mention } | null = null;
  for (const [re, preference, label] of NAMES) {
    const at = (text ?? '').search(re);
    if (at >= 0 && (!best || at < best.at)) best = { at, m: { preference, label } };
  }
  return best?.m ?? null;
}

/** 이 저장소에서 쓸 수 있는 지정인지(AI Office 자신에는 Gemini 개발을 쓰지 않는다) */
export function mentionAllowed(m: Mention, repo: string | null | undefined): boolean {
  return m.preference !== 'gemini_dev' || !OFFICE_REPOS.includes((repo ?? '').toLowerCase());
}

/** 계획의 모든 작업 담당을 지정한 AI로 바꾼다 */
export function applyMention(items: WorkItem[], m: Mention): WorkItem[] {
  return items.map((w) => ({ ...w, assignee_preference: m.preference, execution_mode: 'manual_handoff' }));
}
