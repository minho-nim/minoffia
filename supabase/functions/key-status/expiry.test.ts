import { describe, expect, it } from 'vitest';
import { daysLeft, parseGithubExpiry } from './expiry';

describe('GitHub 토큰 만료일 읽기', () => {
  it('UTC와 시간대 표기를 모두 읽는다', () => {
    expect(parseGithubExpiry('2027-02-03 09:00:00 UTC')).toBe('2027-02-03T09:00:00.000Z');
    expect(parseGithubExpiry('2027-02-03 09:00:00 +0900')).toBe('2027-02-03T00:00:00.000Z');
  });
  it('없거나 이상하면 null', () => {
    expect(parseGithubExpiry(null)).toBeNull();
    expect(parseGithubExpiry('언젠가')).toBeNull();
  });
  it('남은 날', () => {
    expect(daysLeft('2027-01-11T00:00:00Z', Date.parse('2027-01-01T00:00:00Z'))).toBe(10);
  });
});
