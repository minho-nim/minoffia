import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { originalSection } from '../../../src/domain/handoffV2';

describe('개발 지시서의 소유자 원문(v0.7.97)', () => {
  it('기획서와 다르면 참고용으로 붙이고, 같거나 비면 빼고, 길면 자른다', () => {
    expect(originalSection('버튼 좀 파랗게 해줘', '로그인 버튼 색을 #2a78d6으로 바꾼다')).toEqual(['', '## 소유자 원문 (참고용 — 승인된 기획서와 다르면 기획서를 따른다)', '버튼 좀 파랗게 해줘']);
    expect(originalSection('', 'x')).toEqual([]);
    expect(originalSection('같은 글', '기획서: 같은 글')).toEqual([]);
    expect(originalSection('가'.repeat(2100), 'x')[2]).toHaveLength(2001);
  });
  it('세 지시서(앱 Codex·서버 Codex·Claude)에 같은 규칙', () => {
    const body = (f: string) => {
      const s = readFileSync(f, 'utf8');
      const i = s.indexOf('export function originalSection');
      return s.slice(i, s.indexOf('\n}\n', i));
    };
    const app = body('src/domain/handoffV2.ts');
    expect(app.length).toBeGreaterThan(50);
    expect(body('supabase/functions/codex-linear/serverHandoff.ts')).toBe(app);
    expect(body('supabase/functions/dispatch-claude-dev/payload.ts')).toBe(app);
  });
});
