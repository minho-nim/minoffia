// 웹 검색 크레딧(v0.7.53 소유자 "Tavily·Firecrawl 사용량 대시보드 연결"): 팀 관리의 Tavily·Firecrawl 칸.
// 서비스 사용량 API(서버 ask-gemini usage, 서버 키로 대시보드와 같은 숫자)가 되면 그 숫자를, 막혀 있으면 앱이 직접 센 추정을 보여 준다(v0.7.55 오늘 사용량에도).

/** 무료 등급 월 크레딧(카드 없음). 서비스가 바꾸면 여기만 고친다 */
export const FREE_MONTHLY = { tavily: 1000, firecrawl: 1000 } as const;
/** 한 번에 드는 크레딧 추정: Tavily 기본 검색 1, Firecrawl 검색(결과 5개) 2·본문 1 */
const COST: Record<string, Record<string, number>> = { tavily: { search: 1 }, firecrawl: { search: 2, scrape: 1 } };

/**
 * 크레딧이 빠지는 요청인가(v0.7.88 소유자 Firecrawl 대시보드 7일 16 크레딧 vs 앱 성공 10건): 서비스에 도착한 요청은 실패(상대 사이트 거절 403·시간 초과 408 등)도 센다.
 * 키 오류 401·크레딧 없음 402·횟수 제한 429·접속 실패(상태 없음)는 빼고. ok가 없으면(예전 호출부) 성공으로 본다
 */
export function billable(r: { ok?: boolean; http_status?: number | null; status?: number | null }): boolean {
  if (r.ok !== false) return true;
  const s = r.http_status ?? r.status ?? 0;
  return s > 0 && s !== 401 && s !== 402 && s !== 429;
}

/** 검색 기록(공급자·종류, 크레딧이 빠진 것만) → 이번 달 쓴 크레딧 추정 */
export function searchCreditsOf(rows: { provider: string; model: string; ok?: boolean; http_status?: number | null; status?: number | null }[]): { tavily: number; firecrawl: number } {
  const out = { tavily: 0, firecrawl: 0 };
  for (const r of rows) if ((r.provider === 'tavily' || r.provider === 'firecrawl') && billable(r)) out[r.provider] += COST[r.provider][r.model] ?? 1;
  return out;
}

/** 오늘(KST) 성공한 조사 횟수: Tavily 검색 수, Firecrawl 검색+본문 수 */
export function searchTodayOf(rows: { provider: string; model: string; created_at: string; ok?: boolean; http_status?: number | null }[], now = new Date()): { tavily: number; firecrawl: number } {
  const day = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const out = { tavily: 0, firecrawl: 0 };
  for (const r of rows) if ((r.provider === 'tavily' || r.provider === 'firecrawl') && billable(r) && day(new Date(r.created_at)) === day(now)) out[r.provider] += 1;
  return out;
}

export interface Credits {
  used: number;
  limit: number;
}
/** 서비스 숫자가 앱 기록보다 적으면 믿지 않는다(v0.7.88: Firecrawl 사용량 API가 0을 답했지만 대시보드는 16) → 앱 기록으로 */
export function trustCredits(live: Credits | null | undefined, app: number | undefined): Credits | null {
  if (!live) return null;
  return app !== undefined && live.used < app ? { used: app, limit: live.limit } : live;
}
/** 화면 한 줄: 실제 숫자가 있으면 "남은 크레딧 n / 한도", 없으면 "약 n / 1,000 사용(추정)" */
export function creditLine(engine: 'tavily' | 'firecrawl', used: number | undefined, live: Credits | null | undefined): string {
  const fmt = (n: number) => n.toLocaleString('ko-KR');
  if (live) return `이번 달 남은 크레딧 ${fmt(Math.max(0, live.limit - live.used))} / ${fmt(live.limit)}`;
  if (used === undefined) return '사용 기록 없음';
  return `이번 달 남은 크레딧 약 ${fmt(Math.max(0, FREE_MONTHLY[engine] - used))} / ${fmt(FREE_MONTHLY[engine])}(추정)`;
}
