import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('시안 규칙 서버 복사본', () => {
  it('src/domain/designDraft.ts와 같다(그리기·Codex 지시서·Claude 개발 지시서)', () => {
    const app = readFileSync('src/domain/designDraft.ts', 'utf8');
    for (const f of ['draw-design', 'codex-linear', 'dispatch-claude-dev']) expect(readFileSync(`supabase/functions/${f}/designDraft.ts`, 'utf8'), f).toBe(app);
  });
});
