/**
 * 좌표 → 동네 이름(v0.8.12 소유자 "위치에 이름 못 찾음"): 서버(Supabase)에서 부르면 Photon·Nominatim이 모두 403으로 막혀
 * (데이터센터 주소를 막음) 휴대폰 브라우저가 직접 부른다. BigDataCloud(키 없음·브라우저용 무료) → Nominatim → 서버 순.
 * 좌표는 이름을 찾는 데만 쓰고 기록하지 않는다.
 */
type Run = (url: string) => Promise<Response>;

interface Admin {
  name?: string;
  adminLevel?: number;
  order?: number;
}

/** BigDataCloud 답 → '성남시 분당구 수내동'(시·구·동 순, 겹치는 이름 빼고 3개까지) */
export function nameFromBdc(json: unknown): string {
  const j = (json ?? {}) as { city?: string; locality?: string; localityInfo?: { administrative?: Admin[] } };
  const admin = (j.localityInfo?.administrative ?? []).filter((a) => a.name && (a.adminLevel ?? 0) >= 5).sort((a, b) => (a.adminLevel ?? 0) - (b.adminLevel ?? 0) || (a.order ?? 0) - (b.order ?? 0));
  const names = [...new Set([...admin.map((a) => String(a.name).trim()), String(j.locality ?? '').trim()].filter(Boolean))];
  const ko = names.filter((n) => /[가-힣]/.test(n));
  const pick = (ko.length ? ko : names).slice(-3);
  return pick.length ? pick.join(' ') : [j.city, j.locality].filter(Boolean).join(' ');
}

/** Nominatim 답 → '성남시 분당구 수내동'(서버 weather.ts와 같은 규칙) */
export function nameFromNominatim(json: unknown): string {
  const a = ((json as { address?: Record<string, string> })?.address ?? {}) as Record<string, string>;
  const gu = a.borough || a.city_district;
  return [a.city || a.county || a.province || a.state, gu, a.quarter || a.neighbourhood || a.village || (gu ? '' : a.suburb)].filter(Boolean).join(' ');
}

export async function areaNameInBrowser(lat: number, lon: number, run: Run = (u) => fetch(u, { signal: AbortSignal.timeout(6000) })): Promise<string> {
  const la = lat.toFixed(3);
  const lo = lon.toFixed(3);
  const tries: [string, (j: unknown) => string][] = [
    [`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${la}&longitude=${lo}&localityLanguage=ko`, nameFromBdc],
    [`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${la}&lon=${lo}&zoom=16&accept-language=ko`, nameFromNominatim],
  ];
  for (const [url, read] of tries) {
    try {
      const res = await run(url);
      if (!res.ok) continue;
      const name = read(await res.json());
      if (name) return name;
    } catch {
      /* 다음 곳으로 */
    }
  }
  return '';
}
