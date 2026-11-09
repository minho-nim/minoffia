import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('앱 지도 복사본(v0.5.95)', () => {
  it('앱과 서버 두 곳이 같다', () => {
    const app = readFileSync('src/domain/appMapText.ts', 'utf8');
    for (const f of ['dispatch-gemini-dev', 'dispatch-claude-dev', 'dispatch-claude', 'draft-spec']) expect(readFileSync(`supabase/functions/${f}/appMap.ts`, 'utf8')).toBe(app);
  });
});
