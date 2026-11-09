// 재현 시험(v0.5.82): App.tsx에서 '일찍 끝내기'(로그인 전 화면 등) 뒤에 훅을 부르면 로그인 순간 훅 수가 달라져 화면이 하얗게 멈춘다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('App 훅 순서', () => {
  it('첫 일찍 끝내기 줄 뒤에는 React 훅을 부르지 않는다', () => {
    const lines = readFileSync('src/App.tsx', 'utf8').split('\n');
    const first = lines.findIndex((l) => /^\s{2}if \(.+\) return </.test(l));
    expect(first).toBeGreaterThan(0);
    const late = lines.slice(first).map((l, i) => [first + i + 1, l]).filter(([, l]) => /\buse(State|Ref|Effect|Memo|Callback|LayoutEffect|Reducer|Context)\(/.test(l));
    expect(late).toEqual([]);
  });
});
