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
  it('홈 노트는 프로젝트로만 이어진다(v0.6.93)', () => {
    const home = homeNote([{ name: 'P', map: true, note: true }, { name: 'Q', map: false }]);
    expect(home).toContain('- [[P]]');
    expect(home).not.toContain('앱 지도|');
    expect(home).toContain('- Q');
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
  it('큰 버전마다 노트 하나: 링크는 맨 위 AI·스킬 한 번씩, 작은 버전은 글자 칸(v0.6.97)', async () => {
    const { addEntry, versionNote, readEntries, hubNotes, groupName } = await import('./notes-sync.mjs');
    let list = addEntry([], { version: '0.6.89', task: '버튼', date: '2026-11-13', score: '90', pr: 'https://github.com/a/b/pull/3', agent: 'Codex', skills: ['repo-map', 'Bad Name', 'ui-check'] });
    list = addEntry(list, { version: '0.6.89', task: '버튼', date: '2026-11-13', score: '95', agent: 'Claude', skills: ['ui-check'] });
    expect(list).toHaveLength(1);
    list = addEntry(list, { version: '0.6.88', task: '지도', agent: 'Codex', skills: ['ui-check'] });
    expect(list.map((e) => e.v)).toEqual(['v0.6.89', 'v0.6.88']);
    expect(groupName('v0.6.89')).toBe('v0.6');
    expect(groupName('2026.11.13')).toBe('2026.11');
    const note = versionNote('미노피아', 'v0.6', list);
    expect(note.match(/\[\[ui-check\]\]/g)).toHaveLength(1);
    expect(note).toContain('만든 AI: [[Claude]] [[Codex]]');
    expect(note).toContain('## v0.6.89 · 버튼');
    expect(note).not.toContain('Bad Name');
    expect(note).not.toContain('[[미노피아]]');
    expect(readEntries(note).map((e) => e.v)).toEqual(['v0.6.89', 'v0.6.88']);
    const hubs = hubNotes('미노피아', { 'v0.6': list, 'v0.5': [] });
    expect(Object.keys(hubs)).toEqual(['미노피아.md', '미노피아 버전.md']);
    expect(hubs['미노피아 버전.md']).toContain('[[미노피아 v0.6|v0.6]] · 작은 버전 2개 · 최근 v0.6.89 버튼');
    expect(hubs['미노피아 버전.md'].indexOf('v0.6|')).toBeLessThan(hubs['미노피아 버전.md'].indexOf('v0.5|'));
    expect(hubs['미노피아.md']).toContain('큰 버전 2개 · 작은 버전 2개');
    expect(addEntry([], { task: 'x', agent: '직접' })[0].agent).toBe('Codex');
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
    expect(agentOfCommit('me <a@b>', '그냥')).toBe('Codex');
    expect(skillsOfCommit('요약\n쓴 스킬: repo-map, ui-check')).toEqual(['repo-map', 'ui-check']);
    expect(parseSkill('---\nname: ui-check\ndescription: "화면 확인. 설명"\nmetadata:\n  minoffia-category: 화면·디자인\n  minoffia-related: impeccable, x y\n---\n')).toEqual({ name: 'ui-check', title: '화면 확인', description: '화면 확인. 설명', category: '화면·디자인', related: ['impeccable'] });
  });
});

describe('구조·사무실 그림판(v0.6.94)', () => {
  it('폴더 나무: 3단계까지, 설명·파일 수, 스킬 폴더는 접음', async () => {
    const { folderTree } = await import('./notes-sync.mjs');
    const t = folderTree(['README.md', 'src/components/A.tsx', 'src/components/B.tsx', 'src/domain/x/y/z.ts', '.claude/skills/ui-check/SKILL.md'], { parts: [{ folder: 'src/components', name: '업무 화면' }] }).join('\n');
    expect(t).toContain('파일 5개 · 맨 위 파일 1개');
    expect(t).toMatch(/ {2}components\/\s+업무 화면 \(2\)/);
    expect(t).toMatch(/ {4}x\//);
    expect(t).not.toContain('y/');
    expect(t).not.toContain('skills/');
    expect(folderTree([], null)).toEqual([]);
  });
  it('흐름 그림은 종류가 둘 이상일 때만, 이름의 특수 글자는 뺀다', async () => {
    const { flowMermaid } = await import('./notes-sync.mjs');
    expect(flowMermaid({ parts: [{ kind: '화면', name: 'a' }] })).toEqual([]);
    const m = flowMermaid({ parts: [{ kind: '화면', name: '대화"창' }, { kind: '서버', name: '함수' }] }).join('\n');
    expect(m).toContain('```mermaid');
    expect(m).toContain('K0_0["대화 창"]');
    expect(m).toContain('K0 --> K1');
  });
  it('그림판: 선은 있는 상자만 잇고, 앱 사무실 지도와 이름이 같다', async () => {
    const fs = await import('node:fs');
    const { officeCanvas, OFFICE_CLOUD, OFFICE_FLOW, OFFICE_WHO } = await import('./notes-sync.mjs');
    const c = JSON.parse(officeCanvas([{ name: '미노피아', note: true }, { name: 'MINOVA', map: true }]));
    const ids = new Set(c.nodes.map((n) => n.id));
    expect(ids.size).toBe(c.nodes.length);
    for (const e of c.edges) expect(ids.has(e.fromNode) && ids.has(e.toNode)).toBe(true);
    expect(c.nodes.filter((n) => n.type === 'file').map((n) => n.file)).toEqual(['미노피아/미노피아.md', 'MINOVA/MINOVA(앱 지도).md']);
    const app = fs.readFileSync(new URL('../src/components/OfficeMap.tsx', import.meta.url), 'utf8');
    for (const [, label] of OFFICE_CLOUD.nodes) expect(app).toContain(`'${label}'`);
    for (const [, label] of [...OFFICE_FLOW, ...OFFICE_WHO]) expect(app).toContain(`'${label}'`);
  });
});

describe('앱 지도 고치기(v0.6.94)', () => {
  it('표에서 부분을 읽어 흐름·폴더 구조를 그림 앞에 넣고, 두 번 해도 한 번만', async () => {
    const { appMapNote, upgradeAppMap } = await import('./notes-sync.mjs');
    const note = appMapNote('P', { checkedAt: '2026-11-09T10:00:00Z', appMap: { summary: 's', parts: [{ kind: '화면', name: '대화', what: '말하기', folder: 'src/components', files: [] }, { kind: '서버', name: '함수', what: '처리', folder: '', files: ['f.ts'] }] } });
    const once = upgradeAppMap(note, ['src/components/A.tsx', 'f.ts']);
    const twice = upgradeAppMap(once, ['src/components/A.tsx', 'f.ts']);
    expect(twice).toBe(once);
    expect(once.indexOf('## 흐름')).toBeLessThan(once.indexOf('![[P/P(앱 지도).png]]'));
    expect(upgradeAppMap('# old\n\n![[P/앱 지도.png]]\n', ['a/b.ts']).indexOf('## 폴더 구조')).toBeLessThan(upgradeAppMap('# old\n\n![[P/앱 지도.png]]\n', ['a/b.ts']).indexOf('![[P/앱 지도.png]]'));
    expect(once).toMatch(/components\/\s+대화 \(1\)/);
  });
});

describe('Claude 찾기·MCP·예전 폴더(v0.6.98)', () => {
  it('제목에 Codex라는 글자가 있어도 Claude 표시가 있으면 Claude', async () => {
    const { agentOfCommit, mcpOfCommit } = await import('./notes-history.mjs');
    expect(agentOfCommit('minho-nim <x>', 'Codex 환경 경고\n\nClaude-Session: https://claude.ai/code/session_1\n\nCo-authored-by: Claude <noreply@anthropic.com>')).toBe('Claude');
    expect(agentOfCommit('minho-nim <x>', 'Codex 환경 경고')).toBe('Codex');
    expect(agentOfCommit('chatgpt-codex-connector[bot] <x>', '')).toBe('Codex');
    expect(mcpOfCommit('x\n쓴 MCP: supabase, Playwright')).toEqual(['supabase', 'playwright']);
  });
  it('버전 노트 맨 위에 쓴 MCP 링크', async () => {
    const { addEntry, versionNote } = await import('./notes-sync.mjs');
    const note = versionNote('P', 'v1.0', addEntry([], { version: '1.0.1', task: 't', mcp: ['supabase', 'Bad Name'] }));
    expect(note).toContain('쓴 MCP: [[supabase (MCP)]]');
    expect(note).not.toContain('Bad');
  });
  it('홈은 프로젝트 노트로만(앱 지도 직접 링크 없음)', async () => {
    const { homeNote } = await import('./notes-sync.mjs');
    const h = homeNote([{ name: '테스트', map: true, note: false }, { name: 'P', map: true, note: true }]);
    expect(h).not.toContain('앱 지도|');
    expect(h).toContain('- 테스트');
  });
});
