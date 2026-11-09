import { describe, expect, it } from 'vitest';
import { homepageStart } from './homepage';

describe('새 홈페이지 출발점(v0.5.58)', () => {
  it('홈페이지 견본에만, Studio A·B는 다른 구성', () => {
    expect(homepageStart('설정 화면 버튼 정리', 't1', 0)).toBe('');
    const a = homepageStart('회사 소개 페이지 새로 만들기', 't1', 0);
    const b = homepageStart('회사 소개 페이지 새로 만들기', 't1', 1);
    expect(a).toContain('[첫 화면 출발점(정해 줌)]');
    expect(a).not.toBe(b);
    expect(homepageStart('회사 소개 페이지 새로 만들기', 't1', 0)).toBe(a);
  });
});
