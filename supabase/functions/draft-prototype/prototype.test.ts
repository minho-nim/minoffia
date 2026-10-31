import { describe, expect, it } from 'vitest';
import { extractHtml, stripActive } from './prototype';

describe('Gemini 견본 HTML 정리(v0.4.7)', () => {
  it('코드 블록·앞뒤 설명을 벗기고 HTML 문서만', () => {
    const h = extractHtml('여기 있습니다\n```html\n<!doctype html><html><body><h1>화면 1</h1><p>예시 내용입니다</p></body></html>\n```\n끝');
    expect(h?.startsWith('<!doctype html>')).toBe(true);
    expect(h?.endsWith('</html>')).toBe(true);
    expect(extractHtml('그냥 글')).toBeNull();
  });

  it('스크립트·이벤트 속성·외부 불러오기를 지운다', () => {
    const s = stripActive('<html><head><link rel="stylesheet" href="https://x"><script>alert(1)</script></head><body><button onclick="x()">버튼</button><iframe src="https://y"></iframe></body></html>');
    expect(s).not.toMatch(/script|onclick|<link|iframe/i);
    expect(s).toContain('<button>버튼</button>');
  });
});
