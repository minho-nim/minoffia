// 조사(v0.4.61, 소유자 2026-11-02 "제미나이 ㅇㅋ"): 웹에서 찾아봐야 하는 질문은 Gemini의 Google 검색 연결로 답하고 출처를 붙인다.
// (v0.7.1부터 웹 조사는 Exa로 찾고 Gemini가 정리.) 검색이 필요한지는 규칙으로만 정한다(토큰 0). 아니면 답 아래 "웹에서 찾아보기"로 다시 묻는다.

export interface Source {
  title: string;
  uri: string;
}

const NEEDS_WEB = [
  /최신|요즘|최근|현재|지금\s?(나와|나온|가격|버전)|오늘|이번\s?(주|달)|올해|내년/,
  /뉴스|소식|발표|출시|릴리스|업데이트|새\s?버전|버전\s?(뭐|몇)/,
  /가격|요금|구독료|무료\s?한도|한도가?\s?(몇|얼마)|시세|환율|주가|날씨/,
  /찾아\s?(봐|줘|주세요)|검색해|조사해|알아\s?(봐|봐줘|봐 줘)|출처|링크\s?(줘|알려)/,
  /비교해|대안|경쟁\s?(앱|서비스)|비슷한\s?(앱|서비스|사이트)/,
];

/** 웹 검색이 필요해 보이는 질문인지(규칙) */
export function needsResearch(text: string): boolean {
  return NEEDS_WEB.some((r) => r.test(text));
}

/** 서버가 보낸 출처를 다듬는다: http(s) 주소만, 같은 주소 한 번, 최대 5개 */
export function cleanSources(raw: unknown): Source[] {
  if (!Array.isArray(raw)) return [];
  const out: Source[] = [];
  for (const s of raw as { title?: unknown; uri?: unknown }[]) {
    const uri = typeof s?.uri === 'string' ? s.uri : '';
    if (!/^https?:\/\//i.test(uri) || out.some((o) => o.uri === uri)) continue;
    out.push({ uri, title: typeof s.title === 'string' && s.title.trim() ? s.title.trim().slice(0, 120) : uri.replace(/^https?:\/\//, '').slice(0, 60) });
    if (out.length >= 5) break;
  }
  return out;
}
