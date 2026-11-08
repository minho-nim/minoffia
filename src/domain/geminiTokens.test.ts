import { describe, expect, it } from 'vitest';
import { latestTokens, NO_TOKENS, tokensOf } from './geminiTokens';

describe('Gemini 실제 토큰(v0.5.50)', () => {
  it('usageMetadata를 읽고 없으면 null', () => {
    expect(tokensOf({ usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 40, thoughtsTokenCount: 15, totalTokenCount: 175 } })).toEqual({ prompt_tokens: 120, answer_tokens: 40, thinking_tokens: 15 });
    expect(tokensOf({})).toEqual(NO_TOKENS);
    expect(tokensOf(null)).toEqual(NO_TOKENS);
    expect(tokensOf({ usageMetadata: { promptTokenCount: -1, candidatesTokenCount: 'x' } })).toEqual(NO_TOKENS);
  });
  it('스트리밍은 값이 있는 마지막 조각을 쓴다', () => {
    let t = NO_TOKENS;
    t = latestTokens(t, { usageMetadata: { promptTokenCount: 100 } });
    t = latestTokens(t, { candidates: [] });
    t = latestTokens(t, { usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 30 } });
    expect(t).toEqual({ prompt_tokens: 100, answer_tokens: 30, thinking_tokens: null });
  });
});
