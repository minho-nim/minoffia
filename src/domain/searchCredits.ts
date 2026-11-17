// 웹 검색 크레딧(v0.7.53 소유자 "Tavily·Firecrawl 사용량 대시보드 연결"): 팀 관리의 Tavily·Firecrawl 칸.
// 서비스 사용량 API(서버 ask-gemini usage)가 되면 그 숫자를, 무료 등급에서 막혀 있으면 앱이 직접 센 추정을 보여 주고 정확한 숫자는 대시보드로 넘긴다.

/** 무료 등급 월 크레딧(카드 없음). 서비스가 바꾸면 여기만 고친다 */
export const FREE_MONTHLY = { tavily: 1000, firecrawl: 1000 } as const;
/** 각 서비스 사용량 화면 */
export const DASHBOARD = { tavily: 'https://app.tavily.com/home', firecrawl: 'https://www.firecrawl.dev/app/usage' } as const;
/** 한 번에 드는 크레딧 추정: Tavily 기본 검색 1, Firecrawl 검색(결과 5개) 2·본문 1 */
const COST: Record<string, Record<string, number>> = { tavily: { search: 1 }, firecrawl: { search: 2, scrape: 1 } };

/** 성공한 검색 기록(공급자·종류) → 이번 달 쓴 크레딧 추정 */
export function searchCreditsOf(rows: { provider: string; model: string }[]): { tavily: number; firecrawl: number } {
  const out = { tavily: 0, firecrawl: 0 };
  for (const r of rows) if (r.provider === 'tavily' || r.provider === 'firecrawl') out[r.provider] += COST[r.provider][r.model] ?? 1;
  return out;
}

export interface Credits {
  used: number;
  limit: number;
}
/** 화면 한 줄: 실제 숫자가 있으면 "남은 크레딧 n / 한도", 없으면 "약 n / 1,000 사용(추정)" */
export function creditLine(engine: 'tavily' | 'firecrawl', used: number | undefined, live: Credits | null | undefined): string {
  const fmt = (n: number) => n.toLocaleString('ko-KR');
  if (live) return `이번 달 남은 크레딧 ${fmt(Math.max(0, live.limit - live.used))} / ${fmt(live.limit)}`;
  if (used === undefined) return '사용 기록 없음';
  return `이번 달 남은 크레딧 약 ${fmt(Math.max(0, FREE_MONTHLY[engine] - used))} / ${fmt(FREE_MONTHLY[engine])}(추정)`;
}
