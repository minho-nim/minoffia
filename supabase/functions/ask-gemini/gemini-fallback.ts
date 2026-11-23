// Gemini 예비 모델(v0.7.56, v0.8.1 소유자 "업무도 Flash 먼저"): 무료 한도는 모델마다 따로다.
// 기본은 Flash. 한도(429)·과부하(503)·없는 모델(404)이면 같은 키·같은 요청으로 3.5 Flash Lite → 3.1 Flash Lite 순서로 다시 묻는다
// (그다음 키 바꾸기는 각 함수가 하던 대로). Gemini를 부르는 함수마다 같은 내용으로 둔다(동기화 시험: ask-gemini/gemini-fallback.test.ts).

export const MAIN_MODEL = 'gemini-3.5-flash';
export const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'] as const;
export const FALLBACK_MODEL = FALLBACK_MODELS[FALLBACK_MODELS.length - 1];

const modelOf = (url: string) => {
  const m = /\/models\/([^/:?]+):/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
};

/** 같은 요청을 다음 예비 모델로 보낼 주소(마지막 예비이거나 Gemini 주소가 아니면 null) */
export function fallbackUrl(url: string): string | null {
  const now = modelOf(url);
  if (!now) return null;
  const i = FALLBACK_MODELS.indexOf(now as (typeof FALLBACK_MODELS)[number]);
  const next = FALLBACK_MODELS[i + 1];
  if (!next) return null;
  return url.replace(/\/models\/[^/:?]+:/, `/models/${encodeURIComponent(next)}:`);
}

/** fetch와 같게 쓰되, 429·503·404면 다음 예비 모델로. 실제로 답한 모델은 응답 머리 x-gemini-model(예비일 때만) */
export async function geminiFetch(url: string, init: RequestInit, run: typeof fetch = fetch): Promise<Response> {
  let res = await run(url, init);
  let at = url;
  let used: string | null = null;
  for (;;) {
    if (res.status !== 429 && res.status !== 503 && res.status !== 404) break;
    const alt = fallbackUrl(at);
    if (!alt) break;
    const again = await run(alt, init).catch(() => null);
    if (!again) break;
    await res.body?.cancel().catch(() => undefined);
    res = again;
    at = alt;
    used = modelOf(alt);
  }
  if (!used) return res;
  const headers = new Headers(res.headers);
  headers.set('x-gemini-model', used);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
