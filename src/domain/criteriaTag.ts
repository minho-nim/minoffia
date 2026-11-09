// 완료 기준 태그(v0.5.99, 소유자 "(꼭)·(좋음)을 직접 치지 말고 채팅 위에서 태그를 눌러서, 아이콘도 좋고"):
// 입력창 위 [● 꼭][◐ 좋음][○ 선택]을 누르면 다음 줄에 "(꼭) "이 들어간다. 기획서·채점은 지금처럼 이 글자를 읽는다(모델 호출 없음).
export const CRITERIA_TAGS = [
  { tag: '꼭', icon: '●', desc: '반드시 지킬 것(못 지키면 다시 개발)' },
  { tag: '좋음', icon: '◐', desc: '되면 좋은 것' },
  { tag: '선택', icon: '○', desc: '여유 있으면' },
] as const;

/** 커서 자리에 "(꼭) "을 넣는다. 줄 중간이면 새 줄을 열고 넣는다. 새 글과 커서 위치 */
export function insertCriterion(text: string, caret: number, tag: string): { text: string; caret: number } {
  const before = text.slice(0, caret).replace(/[ \t]+$/, '');
  const after = text.slice(caret);
  const head = `${before}${before && !before.endsWith('\n') ? '\n' : ''}(${tag}) `;
  return { text: head + after.replace(/^[ \t]+/, ''), caret: head.length };
}
