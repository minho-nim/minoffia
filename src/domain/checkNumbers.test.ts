import { describe, expect, it } from 'vitest';
import { checkNumbers } from './checkNumbers';

describe('확인할 숫자(v0.8.6)', () => {
  it('근거 번호 없는 숫자 문장만', () => {
    const a = '테슬라 주가는 $345입니다. 매출은 12% 늘었습니다 [2]. 회사는 2003년에 세워졌다.\n- 직원 수 12만 명\n그냥 설명하는 문장입니다.';
    expect(checkNumbers(a)).toEqual(['테슬라 주가는 $345입니다.', '회사는 2003년에 세워졌다.', '직원 수 12만 명']);
  });
  it('코드 블록·영상 시각은 빼고, 숫자 없으면 빈 목록', () => {
    expect(checkNumbers('```js\nconst a = 100%;\n```\n[1:23] 장면 설명')).toEqual([]);
    expect(checkNumbers('파이썬은 배우기 쉬운 언어예요.')).toEqual([]);
    expect(checkNumbers('React 19.2 버전에서 바뀌었어요.')).toEqual(['React 19.2 버전에서 바뀌었어요.']);
  });
});
