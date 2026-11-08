import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('비밀값 가리기 복사본(v0.5.49)', () => {
  it('앱 규칙과 서버 복사본이 같다', () => {
    expect(readFileSync('supabase/functions/submit-result/maskSecrets.ts', 'utf8')).toBe(readFileSync('src/domain/maskSecrets.ts', 'utf8'));
  });
});
