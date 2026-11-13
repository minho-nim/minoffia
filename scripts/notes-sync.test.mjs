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
  it('홈 노트는 프로젝트 노트와 앱 지도 링크(v0.6.90)', () => {
    const home = homeNote([{ name: 'P', map: true, note: true }, { name: 'Q', map: false }]);
    expect(home).toContain('- [[P]] · [[P/앱 지도|앱 지도]]');
    expect(home).toContain('- Q · 아직 지도 없음');
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

describe('버전 노트(v0.6.89)', () => {
  it('버전 이름: package.json 버전, 없으면 날짜', async () => {
    const { versionName } = await import('./notes-sync.mjs');
    expect(versionName({ version: '0.6.89', date: '2026-11-13' })).toBe('v0.6.89');
    expect(versionName({ version: '', date: '2026-11-13' })).toBe('2026.11.13');
  });
  it('같은 업무는 바꾸고, 링크는 버전→스킬·AI만, 묶음은 숫자 목록', async () => {
    const { addEntry, versionNote, readEntries, hubNotes } = await import('./notes-sync.mjs');
    let list = addEntry([], { task: '버튼', date: '2026-11-13', score: '90', pr: 'https://github.com/a/b/pull/3', agent: 'Codex', skills: ['repo-map', 'Bad Name', 'ui-check'] });
    list = addEntry(list, { task: '버튼', date: '2026-11-13', score: '95', agent: 'Claude', skills: ['ui-check'] });
    expect(list).toHaveLength(1);
    const note = versionNote('미노피아', 'v0.6.89', list);
    expect(note).toContain('[[Claude]]');
    expect(note).toContain('[[ui-check]]');
    expect(note).not.toContain('Bad Name');
    expect(readEntries(note)).toEqual(list);
    const hubs = hubNotes('미노피아', { 'v0.6.89': list, 'v0.6.88': [], 'v0.5.1': [] });
    expect(hubs['미노피아 버전.md'].indexOf('## v0.6')).toBeLessThan(hubs['미노피아 버전.md'].indexOf('## v0.5'));
    expect(hubs['미노피아 쓴 스킬.md']).toContain('| ui-check | 1 |');
    expect(hubs['미노피아 쓴 스킬.md']).not.toContain('[[ui-check]]');
    expect(hubs['미노피아 개발.md']).toContain('| Claude | 1 |');
  });
});

describe('지난 기록 채우기(v0.6.90)', () => {
  it('CHANGELOG 제목·버전·날짜, 제목이 버전뿐이면 첫 항목', async () => {
    const { parseChangelog } = await import('./notes-history.mjs');
    expect(parseChangelog('## 지도 고치기(v0.6.88) — 2026-11-12\n- a\n## 0.2.3 — 2026-10-29\n\n- **이미지 첨부(v0.2 §4)**: 설명\n## 0.2.3 — 다시')).toEqual([
      { version: '0.6.88', date: '2026-11-12', task: '지도 고치기' },
      { version: '0.2.3', date: '2026-10-29', task: '이미지 첨부(v0.2 §4)' },
    ]);
  });
  it('커밋으로 만든 AI·쓴 스킬', async () => {
    const { agentOfCommit, skillsOfCommit, parseSkill } = await import('./notes-history.mjs');
    expect(agentOfCommit('me <a@b>', 'x\n\nCo-Authored-By: Claude Opus <noreply@anthropic.com>')).toBe('Claude');
    expect(agentOfCommit('chatgpt-codex-connector[bot] <x>', '')).toBe('Codex');
    expect(agentOfCommit('me <a@b>', '그냥')).toBe('직접');
    expect(skillsOfCommit('요약\n쓴 스킬: repo-map, ui-check')).toEqual(['repo-map', 'ui-check']);
    expect(parseSkill('---\nname: ui-check\ndescription: "화면 확인. 설명"\nmetadata:\n  minoffia-category: 화면·디자인\n  minoffia-related: impeccable, x y\n---\n')).toEqual({ name: 'ui-check', title: '화면 확인', description: '화면 확인. 설명', category: '화면·디자인', related: ['impeccable'] });
  });
});
