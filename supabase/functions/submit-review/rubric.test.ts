import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('서버 채점 규칙은 앱과 같다', () => {
  it('src/domain/review.ts를 그대로 복사한 파일', () => {
    expect(readFileSync(new URL('./rubric.ts', import.meta.url), 'utf8')).toBe(readFileSync(new URL('../../../src/domain/review.ts', import.meta.url), 'utf8'));
  });
});
