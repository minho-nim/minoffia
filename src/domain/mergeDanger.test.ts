import { describe, expect, it } from 'vitest';
import { diffFiles, mergeDanger } from './mergeDanger';

const d = (path: string, body = '+x') => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n${body}\n`;

describe('되돌리기 쉬운가(v0.5.21)', () => {
  it('화면·문서만 바뀌면 되돌리기 쉬움, 영향 범위는 맨 위 폴더 수', () => {
    const r = mergeDanger(d('src/App.tsx') + d('src/ui/a.css') + d('README.md'));
    expect(r).toEqual({ oneWay: false, reasons: [], files: 3, areas: 2 });
  });

  it('DB·배포 설정·서버 함수·비밀값 파일이면 되돌리기 어려움', () => {
    expect(mergeDanger(d('supabase/migrations/0040_x.sql')).reasons).toEqual(['DB 변경']);
    expect(mergeDanger(d('.github/workflows/ci.yml')).reasons).toEqual(['배포·CI 설정']);
    expect(mergeDanger(d('supabase/functions/push/index.ts')).reasons).toEqual(['서버 함수']);
    expect(mergeDanger(d('.env.production')).reasons).toEqual(['비밀값 파일']);
  });

  it('추가된 줄의 데이터 삭제는 어려움, 지운 줄은 보지 않음', () => {
    expect(mergeDanger(d('src/db.ts', '+await sql`delete from users`')).reasons).toEqual(['데이터 삭제 SQL']);
    expect(mergeDanger(d('src/a.ts', '+localStorage.clear()')).reasons).toEqual(['저장된 데이터 지우기']);
    expect(mergeDanger(d('src/a.ts', '-localStorage.clear()')).oneWay).toBe(false);
  });

  it('diff 머리 줄에서 파일 목록', () => {
    expect(diffFiles(d('a.ts') + d('b/c.ts') + d('a.ts'))).toEqual(['a.ts', 'b/c.ts']);
  });
});
