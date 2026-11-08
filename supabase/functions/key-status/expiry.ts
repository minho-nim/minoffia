// 비밀 열쇠 만료일(v0.5.38, 소유자 "90일 걸어둔 것 화면에 보이게"). 외부 의존 없음(Deno 함수와 vitest가 같이 쓴다).
// GitHub는 만료일이 있는 토큰으로 요청하면 응답 머리 github-authentication-token-expiration에 만료 시각을 준다.
// 예: "2027-02-03 09:00:00 UTC" 또는 "2027-02-03 09:00:00 +0900". 읽지 못하면 null(만료 없음 또는 모름).
export function parseGithubExpiry(header: string | null | undefined): string | null {
  const m = (header ?? '').trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*(UTC|Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) return null;
  const zone = !m[3] || m[3] === 'UTC' || m[3] === 'Z' ? 'Z' : `${m[3].slice(0, 3)}:${m[3].slice(-2)}`;
  const d = new Date(`${m[1]}T${m[2]}${zone}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 남은 날(올림). 지났으면 0 이하 */
export function daysLeft(iso: string, now = Date.now()): number {
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}
