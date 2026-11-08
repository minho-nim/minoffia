import { describe, expect, it } from 'vitest';
import { recommendedReply } from './recommend';

describe('확인 질문 추천 답', () => {
  it('질문마다 붙은 추천을 번호 순서대로 모은다', () => {
    expect(recommendedReply('1. 어느 화면이에요? → 추천: 홈 화면\n2. 색은요? → 추천： 남색')).toBe('1. 홈 화면\n2. 남색');
    expect(recommendedReply(['저장소는? → 추천: TestRepo', '마감은?'])).toBe('1. TestRepo');
  });
  it('추천이 없으면 버튼을 보이지 않는다', () => {
    expect(recommendedReply('1. 어느 화면이에요?')).toBeNull();
  });
});
