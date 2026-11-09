// 완료 기준 태그(v0.5.99, 소유자 "(꼭)·(좋음)을 직접 치지 말고 채팅 위에서 태그를 눌러서, 아이콘도 좋고"):
// 입력창 위 [● 필수][◐ 권장][○ 선택]을 누르면 다음 줄에 "(필수) "이 들어간다. 기획서·채점은 이 글자를 읽는다(모델 호출 없음).
// v0.6.0(소유자 "단어를 더 좋은 걸로"): 꼭·좋음·선택 → 필수·권장·선택. 예전 글자(꼭·좋음)도 같은 뜻으로 읽는다.
// v0.6.1(소유자 "필수가 텍스트 말고 아이콘"): 요청 글에는 "(필수) " 대신 아이콘 "● "만 넣는다(보통 글의 '필수'와 헷갈리지 않게). ●·◐·○도 같은 뜻으로 읽는다.
export const CRITERIA_TAGS = [
  { tag: '필수', icon: '●', cls: 'must', desc: '반드시 지킬 것(못 지키면 다시 개발)' },
  { tag: '권장', icon: '◐', cls: 'nice', desc: '되면 좋은 것' },
  { tag: '선택', icon: '○', cls: 'opt', desc: '여유 있으면' },
] as const;
export type CriteriaTag = (typeof CRITERIA_TAGS)[number]['tag'];

const OLD: Record<string, CriteriaTag> = { 꼭: '필수', 좋음: '권장', 필수: '필수', 권장: '권장', 선택: '선택', '●': '필수', '◐': '권장', '○': '선택' };
const ICON: Record<string, string> = Object.fromEntries(CRITERIA_TAGS.map((c) => [c.tag, c.icon]));

/** 커서 자리에 아이콘("● ")을 넣는다. 줄 중간이면 새 줄을 열고 넣는다. 새 글과 커서 위치 */
export function insertCriterion(text: string, caret: number, tag: string): { text: string; caret: number } {
  const before = text.slice(0, caret).replace(/[ \t]+$/, '');
  const after = text.slice(caret);
  const head = `${before}${before && !before.endsWith('\n') ? '\n' : ''}${ICON[tag] ?? `(${tag})`} `;
  return { text: head + after.replace(/^[ \t]+/, ''), caret: head.length };
}

/** 완료 기준 한 줄 = 앞머리(- , R1. 등) + 태그 + 본문 */
export type CriterionLine = { lead: string; tag: CriteriaTag | null; body: string };
const LINE = /^(\s*(?:[-*]\s*)?(?:R\d+[.):]?\s*)?)(?:(?:[([](꼭|좋음|필수|권장|선택)[)\]]|([●◐○]))\s*)?(.*)$/;

export function splitCriteria(text: string): CriterionLine[] {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const m = LINE.exec(l)!;
      const t = m[2] ?? m[3];
      return { lead: m[1], tag: t ? OLD[t] : null, body: m[4] };
    });
}

export function joinCriteria(lines: CriterionLine[]): string {
  return lines.map((l) => `${l.lead}${l.tag ? `(${l.tag}) ` : ''}${l.body}`).join('\n');
}

/** 누를 때마다 필수 → 권장 → 선택 → 필수 */
export function nextTag(tag: CriteriaTag | null): CriteriaTag {
  return tag === '필수' ? '권장' : tag === '권장' ? '선택' : '필수';
}
