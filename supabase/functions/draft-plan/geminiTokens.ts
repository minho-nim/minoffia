// Gemini 실제 토큰 수(v0.5.50, 소유자 목록 14번): 응답의 usageMetadata를 그대로 읽는다(추가 호출 없음). 없으면 null.
// 이 파일은 Gemini를 부르는 서버 함수(ask-gemini·draft-spec·draft-plan·review-result·analyze-image·draft-prototype)에 똑같이 둔다.
export type GeminiTokens = { prompt_tokens: number | null; answer_tokens: number | null; thinking_tokens: number | null };

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

export function tokensOf(data: unknown): GeminiTokens {
  const u = (data as { usageMetadata?: Record<string, unknown> } | null)?.usageMetadata ?? {};
  return { prompt_tokens: count(u.promptTokenCount), answer_tokens: count(u.candidatesTokenCount), thinking_tokens: count(u.thoughtsTokenCount) };
}

/** 스트리밍은 조각마다 누적값이 오므로 값이 있는 마지막 것을 쓴다 */
export function latestTokens(prev: GeminiTokens, data: unknown): GeminiTokens {
  const next = tokensOf(data);
  return {
    prompt_tokens: next.prompt_tokens ?? prev.prompt_tokens,
    answer_tokens: next.answer_tokens ?? prev.answer_tokens,
    thinking_tokens: next.thinking_tokens ?? prev.thinking_tokens,
  };
}

export const NO_TOKENS: GeminiTokens = { prompt_tokens: null, answer_tokens: null, thinking_tokens: null };
