import { describe, expect, it } from 'vitest';
import { numberedRequirements, uncoveredRequirements } from './requirements';

const criteria = '- 토글 버튼이 보인다\n2. 다크모드로 바뀐다\n\n새로고침해도 유지된다';

describe('요구사항 번호', () => {
  it('줄마다 R 번호를 붙인다(앞 표시는 뗀다)', () => {
    expect(numberedRequirements(criteria)).toBe('R1. 토글 버튼이 보인다\nR2. 다크모드로 바뀐다\nR3. 새로고침해도 유지된다');
  });
  it('어느 작업도 맡지 않은 번호를 찾는다', () => {
    expect(uncoveredRequirements(criteria, [{ covers: ['R1'] }, { covers: ['r2'] }])).toEqual([{ id: 'R3', text: '새로고침해도 유지된다' }]);
  });
  it('covers가 하나도 없는 예전 계획은 판단하지 않는다', () => {
    expect(uncoveredRequirements(criteria, [{}, { covers: [] }])).toEqual([]);
  });
});
