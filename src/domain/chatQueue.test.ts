import { describe, expect, it } from 'vitest';
import { isShortReply, MAX_MERGED, takeQueued } from './chatQueue';

const q = (text: string, files: string[] = []) => ({ text, files });

describe('답 기다리는 동안 보낸 말(v0.4.59)', () => {
  it('이어 보낸 말은 하나로 합친다(첨부도 함께)', () => {
    const r = takeQueued([q('MuscleMap에', ['a.png']), q('다크 모드 넣어줘'), q('useEffect는 뭐야?', ['b.png'])]);
    expect(r.next).toEqual({ text: 'MuscleMap에\n다크 모드 넣어줘\nuseEffect는 뭐야?', files: ['a.png', 'b.png'] });
    expect(r.merged).toBe(3);
    expect(r.rest).toEqual([]);
  });
  it('짧은 대답은 합치지 않고 따로', () => {
    expect(takeQueued([q('응'), q('그리고 이것도')]).next?.text).toBe('응');
    const r = takeQueued([q('다크 모드 넣어줘'), q('ㅇㅇ'), q('또 하나')]);
    expect(r.next?.text).toBe('다크 모드 넣어줘');
    expect(r.rest.map((x) => x.text)).toEqual(['ㅇㅇ', '또 하나']);
  });
  it('"어떻게 해?"처럼 대답처럼 시작하는 긴 질문은 대답이 아니다', () => {
    expect(isShortReply('어떻게 하면 빨라져?')).toBe(false);
    expect(isShortReply('네')).toBe(true);
  });
  it('너무 길면 상한까지만 합친다', () => {
    const big = 'x'.repeat(MAX_MERGED - 10);
    const r = takeQueued([q(big), q('y'.repeat(50))]);
    expect(r.merged).toBe(1);
    expect(r.rest).toHaveLength(1);
  });
  it('빈 줄이면 없음', () => {
    expect(takeQueued([]).next).toBeNull();
  });
});
