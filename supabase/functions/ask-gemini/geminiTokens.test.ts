import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Gemini 토큰 읽기 복사본(v0.5.50)', () => {
  it('앱 규칙과 서버 복사본 6곳이 같다', () => {
    const app = readFileSync('src/domain/geminiTokens.ts', 'utf8');
    for (const f of ['ask-gemini', 'draft-spec', 'draft-plan', 'review-result', 'analyze-image', 'draft-prototype'])
      expect(readFileSync(`supabase/functions/${f}/geminiTokens.ts`, 'utf8'), f).toBe(app);
  });
});
