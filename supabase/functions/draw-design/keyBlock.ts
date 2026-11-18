// 두 Studio 키가 모두 막혔을 때 키마다 이유(v0.7.87 소유자 "휴가는 상한 다 쓰거나 API 상태 보고 내가 움직인다"): 소유자가 휴가·근무를 판단하게 정확히 알린다.
// 이 파일은 ask-gemini·analyze-image·draft-spec·design-standard·draw-design에 똑같이 둔다(같은지는 keyBlock.test.ts가 확인).
export type KeyWhy = 'ok' | 'full' | 'leave' | 'none';
const LABEL: Record<KeyWhy, string> = { ok: '사용 가능', full: '오늘 상한 다 씀', leave: '휴가', none: '키 없음' };

/** 키 하나의 상태: 키 없음 → 휴가 → 오늘 상한 다 씀 순서로 본다 */
export function keyWhy(key: string, full: boolean, away: boolean): KeyWhy {
  return !key ? 'none' : away ? 'leave' : full ? 'full' : 'ok';
}

/** 둘 다 못 쓰면 알림(모두 휴가·키 없음이면 503 휴가, 상한이 섞이면 429), 하나라도 되면 null */
export function keyBlock(why: [KeyWhy, KeyWhy], cap: string, tail: string): { status: number; leave: boolean; error: string } | null {
  if (why.includes('ok')) return null;
  const line = `Studio A: ${LABEL[why[0]]} · Studio B: ${LABEL[why[1]]}`;
  if (why.every((w) => w !== 'full')) return { status: 503, leave: true, error: `${line}. 팀 관리에서 한 명을 근무로 돌려 주세요.` };
  return { status: 429, leave: false, error: `${line}(키마다 ${cap}). ${tail}` };
}
