import { describe, expect, it } from 'vitest';
import { MASK, maskSecrets } from './maskSecrets';

describe('로그 비밀값 가리기(v0.5.49)', () => {
  it('토큰·키처럼 생긴 글자를 가린다', () => {
    const fake = 'ghp_' + 'a'.repeat(36);
    expect(maskSecrets(`push with ${fake} ok`)).toBe(`push with ${MASK} ok`);
    expect(maskSecrets('GEMINI_API_KEY=abcd1234efgh5678')).toBe(`GEMINI_API_KEY=${MASK}`);
    expect(maskSecrets('Authorization: Bearer abcdefghijklmnop')).toBe(`Authorization: ${MASK}`);
    expect(maskSecrets('key AIza' + 'B'.repeat(35))).toBe(`key ${MASK}`);
    expect(maskSecrets('-----BEGIN RSA PRIVATE KEY-----\nxyz\n-----END RSA PRIVATE KEY-----')).toBe(MASK);
    expect(maskSecrets('jwt eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4')).toBe(`jwt ${MASK}`);
  });
  it('평범한 시험 기록은 그대로 둔다', () => {
    const log = '✓ 328 tests passed\ntoken count: 12\npassword field shows error';
    expect(maskSecrets(log)).toBe(log);
  });
});
