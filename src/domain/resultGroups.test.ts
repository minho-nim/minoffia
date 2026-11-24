import { describe, expect, it } from 'vitest';
import { appOf, appsOf, byApp, topFolders } from './resultGroups';

const DESC =
  '미니어리(일정·할 일·메모, minially/)와 미니로그(사진 중심 AI 블로그, minilog/), 공통 대시보드 허브(hub/)를 한 저장소에서 관리. 시험은 npm run <앱>:test.';
const diffOf = (...files: string[]) => files.map((f) => `diff --git a/${f} b/${f}\n+x`).join('\n');

describe('결과물 묶기', () => {
  it('프로젝트 설명에서 앱 목록을 읽는다', () => {
    expect(appsOf(DESC)).toEqual([
      { name: '미니어리', folder: 'minially' },
      { name: '미니로그', folder: 'minilog' },
      { name: '허브', folder: 'hub' },
    ]);
    expect(appsOf('일정·할 일을 관리하는 플래너.')).toEqual([]);
  });

  it('바뀐 파일의 맨 위 폴더', () => {
    expect(topFolders(diffOf('minilog/src/a.ts', 'minilog/b.ts', 'shared/c.ts', 'README.md'))).toEqual(['minilog', 'shared']);
  });

  it('제목 → 바뀐 폴더 순으로 앱을 고른다', () => {
    const apps = appsOf(DESC);
    expect(appOf(apps, '미니로그: 사진 올리기', '')?.folder).toBe('minilog');
    expect(appOf(apps, '글자 크기', diffOf('minially/src/a.tsx', 'shared/x.ts'))?.folder).toBe('minially');
    // 두 앱을 건드리면 모른다
    expect(appOf(apps, '로그인 공통화', diffOf('minially/a.ts', 'minilog/b.ts'))).toBeNull();
    expect(appOf([], '미니로그', '')).toBeNull();
  });

  it('앱 순서대로 묶고 모르는 것은 맨 뒤', () => {
    const apps = appsOf(DESC);
    const items = [
      { title: '공통 색', diff: diffOf('shared/a.ts') },
      { title: '허브 사용량', diff: '' },
      { title: '미니어리 달력', diff: '' },
    ];
    expect(byApp(apps, items, (x) => x).map((g) => [g.label, g.items.length])).toEqual([
      ['미니어리', 1],
      ['허브', 1],
      ['공통·기타', 1],
    ]);
    expect(byApp([], items, (x) => x)).toHaveLength(1);
  });
});
