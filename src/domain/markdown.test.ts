import { describe, expect, it } from 'vitest';
import { inline, parseMarkdown } from './markdown';

describe('챗봇 답 마크다운(v0.7.99)', () => {
  it('굵게·기울임·코드·링크(http만)', () => {
    expect(inline('**굵게** 와 *기울임* `코드` [구글](https://google.com)')).toEqual([
      { t: 'b', v: '굵게' },
      { t: 'text', v: ' 와 ' },
      { t: 'i', v: '기울임' },
      { t: 'text', v: ' ' },
      { t: 'code', v: '코드' },
      { t: 'text', v: ' ' },
      { t: 'link', v: '구글', href: 'https://google.com' },
    ]);
    // javascript: 링크는 꾸밈으로 보지 않고 글자 그대로
    expect(inline('[x](javascript:alert(1))')).toEqual([{ t: 'text', v: '[x](javascript:alert(1))' }]);
  });
  it('제목·목록·코드 블록·표·인용·구분선', () => {
    const b = parseMarkdown('# 제목\n\n- 하나\n- 둘\n\n1. 첫째\n2. 둘째\n\n```ts\nconst a = 1;\n```\n\n| 이름 | 값 |\n|---|---|\n| A | 1 |\n| B | 2 |\n\n> 인용\n\n---\n문단 끝');
    expect(b.map((x) => x.t)).toEqual(['h', 'ul', 'ol', 'code', 'table', 'quote', 'hr', 'p']);
    expect(b[3]).toEqual({ t: 'code', lang: 'ts', v: 'const a = 1;' });
    const table = b[4] as { head: unknown[]; rows: unknown[][] };
    expect(table.head).toHaveLength(2);
    expect(table.rows).toHaveLength(2);
  });
  it('HTML은 글자 그대로(그리지 않음)', () => {
    expect(parseMarkdown('<img src=x onerror=alert(1)>')).toEqual([{ t: 'p', v: [{ t: 'text', v: '<img src=x onerror=alert(1)>' }] }]);
  });
});
