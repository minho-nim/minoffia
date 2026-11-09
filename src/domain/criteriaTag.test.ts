import { describe, expect, it } from 'vitest';
import { insertCriterion } from './criteriaTag';

describe('완료 기준 태그 넣기(v0.5.99)', () => {
  it('빈 칸이면 맨 앞에', () => {
    expect(insertCriterion('', 0, '꼭')).toEqual({ text: '(꼭) ', caret: 4 });
  });
  it('줄 중간·끝이면 새 줄을 열고', () => {
    expect(insertCriterion('@제미나이 바꿔줘 ', 10, '꼭')).toEqual({ text: '@제미나이 바꿔줘\n(꼭) ', caret: 14 });
  });
  it('이미 새 줄 첫머리면 그 자리에', () => {
    const r = insertCriterion('요청\n', 3, '좋음');
    expect(r.text).toBe('요청\n(좋음) ');
  });
  it('뒤에 글이 있어도 이어 붙는다', () => {
    expect(insertCriterion('요청 끝', 2, '선택').text).toBe('요청\n(선택) 끝');
  });
});
