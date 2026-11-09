import { describe, expect, it } from 'vitest';
import { appMapNote, archifyNote, healthNote, homeNote, safeName, scopeCanvas, scopeLinks } from './notes-sync.mjs';

describe('옵시디언 노트 쌓기(v0.5.62)', () => {
  it('이름에서 문제 되는 글자를 뺀다', () => {
    expect(safeName('a/b:c*?')).toBe('a b c');
    expect(safeName('  ')).toBe('이름 없음');
    expect(safeName('..숨김')).toBe('숨김');
  });
  it('점검은 최신을 위에, 지난 점검을 쌓는다', () => {
    const r1 = { checkedAt: '2026-11-08T10:00:00Z', summary: { high: 0, medium: 0, low: 1 }, issues: [{ severity: 'low', title: '큰 파일', items: ['src/App.tsx'] }] };
    const n1 = healthNote('P', r1);
    expect(n1).toContain('중요 **0**');
    expect(n1).toContain('| 사소 | 큰 파일 | src/App.tsx |');
    const n2 = healthNote('P', { ...r1, checkedAt: '2026-11-09T10:00:00Z', summary: { high: 1, medium: 0, low: 0 }, issues: [] }, n1);
    expect(n2.split('## 지난 점검')[1].trim().split('\n')).toEqual(['- 2026-11-09 10:00 · 중요 1 · 고칠 만함 0 · 사소 0', '- 2026-11-08 10:00 · 중요 0 · 고칠 만함 0 · 사소 1']);
  });
  it('업무 노트는 결과 버전을 위에서부터 쌓고 같은 버전은 바꾼다', () => {
    const a = archifyNote('P', '다크모드', 1, '다크모드-r1.png', '요약1');
    const b = archifyNote('P', '다크모드', 2, '다크모드-r2.png', '요약2', a);
    expect(b.indexOf('## 결과 v2')).toBeLessThan(b.indexOf('## 결과 v1'));
    const c = archifyNote('P', '다크모드', 2, '다크모드-r2.png', '새 요약', b);
    expect(c.match(/## 결과 v2/g)).toHaveLength(1);
    expect(c).toContain('새 요약');
  });
  it('그래프 링크·캔버스 경로를 프로젝트 폴더 안으로', () => {
    const names = new Set(['App()', 'Inbox()']);
    expect(scopeLinks('- [[App()]] - calls\n- [[밖]]\n- [[Inbox()|받은함]]', 'P/코드 그래프', names)).toBe('- [[P/코드 그래프/App()|App()]] - calls\n- [[밖]]\n- [[P/코드 그래프/Inbox()|받은함]]');
    expect(JSON.parse(scopeCanvas('{"nodes":[{"type":"file","file":"App().md"},{"type":"group"}]}', 'P/코드 그래프')).nodes[0].file).toBe('P/코드 그래프/App().md');
  });
  it('홈 노트는 프로젝트별 앱 지도 링크만', () => {
    const home = homeNote([{ name: 'P', map: true }, { name: 'Q', map: false }]);
    expect(home).toContain('- [[P/앱 지도|P]]');
    expect(home).toContain('- Q (아직 지도 없음)');
  });
  it('앱 지도 노트: 종류별 표, 표 글자 안의 | 는 바꾼다(v0.5.94)', () => {
    const note = appMapNote('P', { checkedAt: '2026-11-09T10:00:00Z', appMap: { summary: '운동 기록 앱', parts: [
      { name: '운동 기록 화면', kind: '화면', what: '세트|횟수 입력', folder: 'src/workout', files: [] },
      { name: 'DB', kind: '데이터', what: '기록 저장', folder: '', files: ['supabase/x.sql'] },
    ] } });
    expect(note).toContain('> [!summary] 운동 기록 앱');
    expect(note.indexOf('## 화면')).toBeLessThan(note.indexOf('## 데이터'));
    expect(note).toContain('| **운동 기록 화면** | 세트/횟수 입력 | src/workout/ |');
    expect(note).toContain('| **DB** | 기록 저장 | supabase/x.sql |');
    expect(appMapNote('P', { checkedAt: '' })).toContain('아직 쉬운 지도가 없어요');
  });
});
