import { describe, expect, it } from 'vitest';
import { parseNeedFiles, safePath, withFiles } from './needFiles';

describe('채점 AI의 파일 요청(v0.5.52)', () => {
  it('파일 요청을 읽고 위험한 경로는 뺀다', () => {
    expect(parseNeedFiles('{"need_files":["src/App.tsx","./src/x.ts","../etc/passwd",".env.local","src/App.tsx","a.ts","b.ts"]}')).toEqual(['src/App.tsx', 'src/x.ts', 'a.ts']);
    expect(parseNeedFiles('```json\n{"need_files":["supabase/functions/push/index.ts"]}\n```')).toEqual(['supabase/functions/push/index.ts']);
    expect(parseNeedFiles('{"parts":{}}')).toBeNull();
    expect(parseNeedFiles('{"need_files":["/abs"]}')).toBeNull();
    expect(parseNeedFiles('점수 못 냄')).toBeNull();
  });
  it('비밀 파일·바깥 경로는 안전하지 않다', () => {
    expect(safePath('keys/server.pem')).toBe(false);
    expect(safePath('.git/config')).toBe(false);
    expect(safePath('src//x.ts')).toBe(false);
    expect(safePath('src/domain/review.ts')).toBe(true);
  });
  it('파일 내용을 붙이고 길면 자른다', () => {
    const out = withFiles('자료', [{ path: 'a.ts', text: 'x'.repeat(13_000) }, { path: 'b.ts', text: null }]);
    expect(out).toContain('--- a.ts ---');
    expect(out).toContain('…(뒤는 생략)');
    expect(out).toContain('b.ts: 읽지 못함');
    expect(out).toContain('반드시 점수 JSON');
  });
});
