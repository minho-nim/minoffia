import { describe, expect, it } from 'vitest';
import { shortcutsInDiff } from './shortcuts';

describe('미뤄 둔 일(shortcut 주석)', () => {
  const diff = [
    'diff --git a/src/a.ts b/src/a.ts',
    '+++ b/src/a.ts',
    '+  // shortcut: 100개까지만 읽음, 사용자가 늘면 페이지 나누기',
    '-  // shortcut: 지워진 줄은 세지 않음',
    ' // shortcut: 바뀌지 않은 줄도 세지 않음',
    '+++ b/db.sql',
    '+-- shortcut: 색인 없음',
    '+const s = "shortcut: 글자 안의 낱말은 주석이 아니면 무시";',
  ].join('\n');
  it('추가된 주석 줄만 파일과 함께 모은다', () => {
    expect(shortcutsInDiff(diff)).toEqual([
      { file: 'src/a.ts', text: '100개까지만 읽음, 사용자가 늘면 페이지 나누기' },
      { file: 'db.sql', text: '색인 없음' },
    ]);
  });
});
