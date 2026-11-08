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

/** @ 누르면 뜨는 목록(v0.5.47, 카카오톡 태그처럼). 넣는 글은 영어 이름 */
export const MENTION_OPTIONS = [
  { tag: 'Claude', ko: '클로드', desc: '개발·꼼꼼한 수정' },
  { tag: 'Codex', ko: '코덱스', desc: 'Linear로 맡기는 개발' },
  { tag: 'Gemini', ko: '제미나이', desc: '쉬운 개발(다른 저장소만)' },
] as const;

/** 커서 바로 앞이 "@글자"면 그 시작 위치와 글자. 메일 주소(a@b)는 무시 */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|\s)@([^\s@]{0,12})$/.exec(text.slice(0, caret));
  return m ? { start: caret - m[2].length - 1, query: m[2] } : null;
}

export function mentionOptions(query: string) {
  const q = query.toLowerCase();
  return MENTION_OPTIONS.filter((o) => o.tag.toLowerCase().startsWith(q) || o.ko.startsWith(query));
}

/** 고른 이름을 넣은 새 글과 커서 위치 */
export function insertMention(text: string, caret: number, start: number, tag: string): { text: string; caret: number } {
  const head = `${text.slice(0, start)}@${tag} `;
  return { text: head + text.slice(caret).replace(/^\s+/, ''), caret: head.length };
}
