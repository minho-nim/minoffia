/**
 * 확인할 숫자(v0.8.6 소유자 "답 아래 투명성 줄 + 확인할 숫자"): 답에서 사실처럼 보이는 숫자(가격·%·날짜·개수·버전·단위)를 찾아
 * 근거([1] 같은 출처 번호)가 붙지 않은 문장을 '확인할 숫자'로 모은다. 규칙만(모델 0). 코드 블록·표 머리·[분:초]는 뺀다.
 */
const NUM = /(?:[$₩€¥]\s?\d[\d,.]*|\d[\d,.]*\s?(?:%|퍼센트|원|달러|엔|유로|만|억|조|천|명|개|건|배|년|월|일|시간|분|초|kg|g|km|m|cm|mb|gb|tb|kb|ms|fps|토큰|회|위|점|세|살)|\bv?\d+\.\d+(?:\.\d+)?\b|\b(?:19|20)\d{2}\b)/i;
const CITE = /\[\d+\]/;
const TIMESTAMP = /\[\d{1,2}:\d{2}(?::\d{2})?\]/g;

export function checkNumbers(answer: string): string[] {
  const body = answer.replace(/```[\s\S]*?```/g, ' ').replace(TIMESTAMP, ' ');
  const sentences = body
    .split(/\n+|(?<=[.!?。])\s+|(?<=다\.)\s*/)
    .map((s) => s.replace(/^[\s>*\-•·|#\d.)]+/, '').replace(/\*\*/g, '').trim())
    .filter((s) => s.length >= 6 && !/^[-|:\s]+$/.test(s));
  const out: string[] = [];
  for (const s of sentences) {
    if (!NUM.test(s) || CITE.test(s)) continue;
    const short = s.length > 90 ? `${s.slice(0, 89)}…` : s;
    if (!out.includes(short)) out.push(short);
  }
  return out.slice(0, 8);
}
