import { describe, expect, it } from 'vitest';
import { insertCriterion, joinCriteria, nextTag, splitCriteria } from './criteriaTag';

describe('완료 기준 태그 넣기(v0.5.99)', () => {
  it('빈 칸이면 맨 앞에', () => {
    expect(insertCriterion('', 0, '필수')).toEqual({ text: '(필수) ', caret: 5 });
  });
  it('줄 중간·끝이면 새 줄을 열고', () => {
    expect(insertCriterion('@제미나이 바꿔줘 ', 10, '필수')).toEqual({ text: '@제미나이 바꿔줘\n(필수) ', caret: 15 });
  });
  it('이미 새 줄 첫머리면 그 자리에', () => {
    const r = insertCriterion('요청\n', 3, '좋음');
    expect(r.text).toBe('요청\n(좋음) ');
  });
  it('뒤에 글이 있어도 이어 붙는다', () => {
    expect(insertCriterion('요청 끝', 2, '선택').text).toBe('요청\n(선택) 끝');
  });
});

describe('기획서 완료 기준 중요도 바꾸기(v0.6.0)', () => {
  it('예전 (꼭)·(좋음)도 읽고, 앞머리는 그대로', () => {
    const lines = splitCriteria('- (꼭) 버튼 16px\nR2. (좋음) 그림자\n태그 없음');
    expect(lines.map((l) => l.tag)).toEqual(['필수', '권장', null]);
    expect(joinCriteria(lines)).toBe('- (필수) 버튼 16px\nR2. (권장) 그림자\n태그 없음');
  });
  it('누를 때마다 필수 → 권장 → 선택 → 필수', () => {
    expect([nextTag(null), nextTag('필수'), nextTag('권장'), nextTag('선택')]).toEqual(['필수', '권장', '선택', '필수']);
  });
});
