import { describe, expect, it } from 'vitest';
import { safeTargets } from './site-check.mjs';

describe('화면 확인 주소 검사(v0.6.9)', () => {
  it('https 공개 주소만, 정해진 이름만', () => {
    const t = safeTargets(JSON.stringify([
      { key: 'after', url: 'https://ai-gemini-x.my-app.pages.dev/' },
      { key: 'before', url: 'http://my-app.pages.dev/' },
      { key: 'live', url: 'https://127.0.0.1/' },
      { key: 'evil', url: 'https://a.dev/' },
      { key: 'live', url: 'https://localhost/' },
    ]));
    expect(t.map((x) => x.key)).toEqual(['after']);
    expect(safeTargets('not json')).toEqual([]);
  });
});
