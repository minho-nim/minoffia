// 로그 비밀값 가리기(v0.5.49, 소유자 목록 17번): 결과의 시험 기록·요약을 저장하기 전에 토큰·키처럼 생긴 글자를 가린다(규칙, 모델 호출 없음).
// diff는 실제 코드 변경이라 바꾸지 않는다(바꾸면 PR이 깨진다). 이 파일은 supabase/functions/submit-result/maskSecrets.ts와 똑같이 유지한다.
const PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,
  /\bsb_secret_[A-Za-z0-9_-]{10,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\blin_api_[A-Za-z0-9]{20,}\b/g,
];
/** "api_key=…", "password: …", "Authorization: Bearer …"처럼 이름 뒤에 붙은 값 */
const NAMED = /((?:api[_-]?key|secret|token|password|passwd|authorization)["']?\s*[:=]\s*["']?)(?:bearer\s+)?([^\s"'`,;]{8,})/gi;

export const MASK = '[가림]';

export function maskSecrets(text: string): string {
  let out = text;
  for (const re of PATTERNS) out = out.replace(re, MASK);
  return out.replace(NAMED, (_, name: string, value: string) => (value === MASK ? `${name}${value}` : `${name}${MASK}`));
}
