import { describe, expect, it } from 'vitest';
import { pointNotesText, whereText } from './pointNotes';

describe('화면 짚어서 수정 요청(v0.5.48)', () => {
  it('위치를 말로 바꾼다', () => {
    expect(whereText(10, 10)).toBe('위쪽 왼쪽');
    expect(whereText(50, 50)).toBe('한가운데');
    expect(whereText(90, 80)).toBe('아래쪽 오른쪽');
  });
  it('설명 있는 표시만 번호대로 넣는다', () => {
    expect(pointNotesText('desktop.png', [{ x: 12.4, y: 8, note: ' 버튼 크게 ' }, { x: 50, y: 50, note: '' }, { x: 80, y: 90, note: '여백 줄이기' }])).toBe(
      "[화면 짚기] 결과 스크린샷 'desktop.png'\n1) 위쪽 왼쪽(가로 12%·세로 8%): 버튼 크게\n2) 아래쪽 오른쪽(가로 80%·세로 90%): 여백 줄이기",
    );
    expect(pointNotesText('a.png', [{ x: 1, y: 1, note: ' ' }])).toBe('');
  });
});
