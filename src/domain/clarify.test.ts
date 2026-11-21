import { describe, expect, it } from 'vitest';
import { clarifyQuestions, withAnswers } from './clarify';

describe('기획서 전에 되묻기(v0.7.97)', () => {
  it('짧거나 모호하면 1~3개 묻는다', () => {
    expect(clarifyQuestions('이거 좀 고쳐줘')).toEqual(['무엇을 어떻게 바꾸면 될까요? 화면·기능 이름을 알려 주세요.']);
    expect(clarifyQuestions('로그인이 안 돼요')).toEqual(['어느 화면에서 무엇을 했을 때 그런가요? 원래는 어떻게 되어야 하나요?']);
    expect(clarifyQuestions('버튼 색 파랗게')).toEqual([]);
    expect(clarifyQuestions('색을 좀 더 밝게 바꿔줘요')).toEqual(['어느 화면(탭)의 어디를 바꿀까요?']);
    expect(clarifyQuestions('검색 기능 추가')).toEqual(['무엇을 어떻게 바꾸면 될까요? 화면·기능 이름을 알려 주세요.', '다 되면 무엇이 되어야 하나요? (완료 기준 한 줄)']);
    expect(clarifyQuestions('알아서 개선해줘, 버그도 많고 에러 나고').length).toBeLessThanOrEqual(3);
  });
  it('충분히 자세하거나 장소·완료 기준이 있으면 묻지 않는다', () => {
    expect(clarifyQuestions('설정 탭의 사용량 칸에서 통계 보기 버튼 색을 주황으로 바꾸고, 누르면 팝업이 열리게 해 주세요. 휴대폰 폭에서도 한 줄로 보이게요.')).toEqual([]);
    expect(clarifyQuestions('업무 탭 카드 글씨 크기 키워줘')).toEqual([]);
    expect(clarifyQuestions('대화 탭에 음성 입력 버튼을 추가해서 누르면 받아쓰기 되게')).toEqual([]);
  });
  it('답을 요청 글 뒤에 붙인다(빈 답이면 그대로)', () => {
    expect(withAnswers('이거 고쳐줘', ['무엇을?'], '대화 탭 입력창 높이')).toBe('이거 고쳐줘\n\n[미니엉 질문에 대한 답]\n- 무엇을?\n→ 대화 탭 입력창 높이');
    expect(withAnswers('이거', ['무엇을?'], '  ')).toBe('이거');
  });
});
