import { describe, expect, it } from 'vitest';
import { cleanDesignRefs, DESIGN_REF_GROUPS, DESIGN_REFS } from './designRefs';

describe('참고할 서비스 목록(v0.7.50)', () => {
  it('이름이 겹치지 않고 분류가 맞다', () => {
    expect(new Set(DESIGN_REFS.map((r) => r.slug)).size).toBe(DESIGN_REFS.length);
    for (const r of DESIGN_REFS) {
      expect(DESIGN_REF_GROUPS).toContain(r.group);
      expect(r.slug).toMatch(/^[a-z0-9][a-z0-9.-]{0,39}$/);
      expect(r.mood.length).toBeGreaterThan(3);
    }
  });
  it('목록에 있는 것만, 중복 없이, 3개까지', () => {
    expect(cleanDesignRefs(['vercel', 'nope', 'vercel', 'linear.app', 'stripe', 'notion'])).toEqual(['vercel', 'linear.app', 'stripe']);
  });
});
