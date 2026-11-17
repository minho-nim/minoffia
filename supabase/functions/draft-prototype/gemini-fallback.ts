// Gemini 예비 모델(v0.7.56, 소유자 2026-11-17 "3.5 Flash Lite가 막히면 3.1 Flash Lite로, 해야지"): 무료 한도는 모델마다 따로다.
// 3.5 Flash Lite가 한도(429)·과부하(503)면 같은 키·같은 요청으로 3.1 Flash Lite에 한 번 더 묻는다(그다음 키 바꾸기는 각 함수가 하던 대로).
// Gemini를 부르는 함수마다 같은 내용으로 둔다(동기화 시험: ask-gemini/gemini-fallback.test.ts).
// shortcut: 사용 기록(ai_calls)의 model 칸은 처음 모델 이름으로 남는다, 예비 모델 사용 횟수를 따로 볼 필요가 생기면 응답 머리 x-gemini-model을 읽어 기록.

export const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

/** 같은 요청을 예비 모델로 보낼 주소(이미 예비 모델이거나 Gemini 주소가 아니면 null) */
export function fallbackUrl(url: string): string | null {
  const m = /\/models\/([^/:?]+):/.exec(url);
  if (!m || decodeURIComponent(m[1]) === FALLBACK_MODEL) return null;
  return url.replace(m[0], `/models/${encodeURIComponent(FALLBACK_MODEL)}:`);
}

/** fetch와 같게 쓰되, 429·503이면 예비 모델로 한 번 더. 실제로 답한 모델은 응답 머리 x-gemini-model */
export async function geminiFetch(url: string, init: RequestInit, run: typeof fetch = fetch): Promise<Response> {
  const res = await run(url, init);
  if (res.status !== 429 && res.status !== 503) return res;
  const alt = fallbackUrl(url);
  if (!alt) return res;
  const again = await run(alt, init).catch(() => null);
  if (!again) return res;
  await res.body?.cancel().catch(() => undefined);
  const headers = new Headers(again.headers);
  headers.set('x-gemini-model', FALLBACK_MODEL);
  return new Response(again.body, { status: again.status, statusText: again.statusText, headers });
}
