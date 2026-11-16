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
  it('러너 안 결과 주소는 --local일 때 after 하나만(v0.7.25)', () => {
    const raw = JSON.stringify([
      { key: 'after', url: 'http://127.0.0.1:4173/' },
      { key: 'before', url: 'http://127.0.0.1:4173/' },
      { key: 'after', url: 'http://127.0.0.1:8080/' },
    ]);
    expect(safeTargets(raw)).toEqual([]);
    expect(safeTargets(raw, true).map((x) => `${x.key} ${x.url}`)).toEqual(['after http://127.0.0.1:4173/']);
    // 바뀐 화면 경로(v0.7.34)
    const paths = (u) => safeTargets(JSON.stringify([{ key: 'after', url: u }]), true).length;
    expect(paths('http://127.0.0.1:4173/stats')).toBe(1);
    expect(paths('http://127.0.0.1:4173/#/stats?tab=1')).toBe(1);
    expect(paths('http://127.0.0.1:4173/../etc')).toBe(0);
    expect(paths('http://127.0.0.1:4173/a b')).toBe(0);
  });
});
