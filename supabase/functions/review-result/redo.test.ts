import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('서버 다시 개발 복사본(v0.6.12)', () => {
  it('review-result와 submit-review의 redo.ts가 같다', () => {
    expect(readFileSync('supabase/functions/submit-review/redo.ts', 'utf8')).toBe(readFileSync('supabase/functions/review-result/redo.ts', 'utf8'));
  });
});
