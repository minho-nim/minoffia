// @이름으로 맡기기(v0.5.46, 소유자 요청 12번): 요청에 "@클로드"처럼 쓰면 그 AI가 개발을 맡는다(규칙, 모델 호출 없음).
// 작은 일이면 바로 그 AI에 배정하고, PM이 나눈 계획이면 모든 작업의 담당을 그 AI로 바꾼다. 실행 승인(E)은 그대로 소유자가 한다.
import { OFFICE_REPOS } from './smallTask';
import type { AssigneePreference, WorkItem } from './workflow-types';

const NAMES: [RegExp, AssigneePreference, string][] = [
  [/@(코덱스|codex)/i, 'codex_primary', 'Codex'],
  [/@(클로드|claude)/i, 'claude_support', 'Claude'],
  // v0.6.24: @StudioA·@StudioB는 '누가 답할지'(질문용)라 개발 담당으로 읽지 않는다. @Gemini 개발은 2026-11-13 뺐다
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
  void OFFICE_REPOS;
  void repo;
  void m;
  return true;
}

/** 계획의 모든 작업 담당을 지정한 AI로 바꾼다 */
export function applyMention(items: WorkItem[], m: Mention): WorkItem[] {
  return items.map((w) => ({ ...w, assignee_preference: m.preference, execution_mode: 'manual_handoff' }));
}

/** @ 누르면 뜨는 목록(v0.5.47, 카카오톡 태그처럼). 넣는 글은 영어 이름 */
export const MENTION_OPTIONS = [
  { tag: 'Claude', ko: '클로드', desc: '개발·꼼꼼한 수정' },
  { tag: 'Codex', ko: '코덱스', desc: 'Linear로 맡기는 개발' },
  // v0.6.24(소유자 "제미나이도 각각 태그"): 질문에 누가 답할지. 그 키가 안 되면 다른 쪽이 대신 답한다
  { tag: 'StudioA', ko: '스튜디오A', desc: 'Gemini 답(키 A)' },
  { tag: 'StudioB', ko: '스튜디오B', desc: 'Gemini 답(키 B)' },
  // v0.7.3(소유자 "exa도 태그, 얘도 AI니까"): 웹에서 찾아 Gemini가 정리하는 질문. v0.7.52 Tavily로 찾고 Firecrawl로 본문
  { tag: 'Tavily', ko: '타빌리', desc: '웹 조사(Tavily로 찾고 본문 2개 읽어 정리)' },
  // v0.7.53(소유자 "@Firecrawl도 만들어야지"): Firecrawl로 먼저 찾고 본문 2개 읽어 정리
  { tag: 'Firecrawl', ko: '파이어크롤', desc: '웹 조사(Firecrawl로 찾고 본문 2개 읽어 정리)' },
] as const;

/** 질문 글에 @Tavily(@타빌리·@웹검색)·@Firecrawl(@파이어크롤)이 있으면 웹 조사로(v0.7.3, v0.7.52 @Exa 삭제, v0.7.53 @Firecrawl) */
export const asksSearch = (text: string | null | undefined): boolean => /@(?:tavily|타빌리|웹검색|firecrawl|파이어크롤)(?![a-z])/i.test(text ?? '');

/** 먼저 쓸 검색: @Firecrawl이면 firecrawl, @Tavily면 tavily, 없으면 null(기본 Tavily 먼저) */
export function searchEngineOf(text: string | null | undefined): 'tavily' | 'firecrawl' | null {
  if (/@(?:firecrawl|파이어크롤)(?![a-z])/i.test(text ?? '')) return 'firecrawl';
  if (/@(?:tavily|타빌리)(?![a-z])/i.test(text ?? '')) return 'tavily';
  return null;
}

/** 질문 글의 @StudioA·@StudioB → 먼저 쓸 Gemini 키(1=A, 2=B). 없으면 null(기본 A, 안 되면 B) */
export function answerSlot(text: string | null | undefined): 1 | 2 | null {
  const m = /@(?:studio|스튜디오)\s?([ab])(?![a-z])/i.exec(text ?? '');
  return m ? (m[1].toLowerCase() === 'a' ? 1 : 2) : null;
}

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
