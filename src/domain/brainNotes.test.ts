import { describe, expect, it } from 'vitest';
import { brainNotes, chatNote, noteHash, safeName, taskNote } from './brainNotes';
import { EMPTY_WORKFLOW } from './workflow-types';
import type { Project, Task } from './types';
import type { ChatThread } from '../data/store';

const P = [{ id: 'p', name: '미노피아' }] as unknown as Project[];
const task = { id: 't', projectId: 'p', title: '로그인 버튼: 색 바꾸기', status: 'done', assignee: 'claude', createdAt: '2026-11-20T01:00:00Z', userOriginalText: '로그인 버튼 주황으로. 토큰 ghp_abcdefghijklmnopqrstuvwxyz123456', prUrl: 'https://github.com/x/y/pull/1' } as unknown as Task;
const wf = {
  ...EMPTY_WORKFLOW,
  specs: [{ taskId: 't', revision: 1, planner: 'gemini_draft', finalPrompt: '버튼 색을 주황으로', testCriteria: '버튼이 주황', answer: '' }],
  approvals: [
    { taskId: 't', gate: 'A', decision: 'approved', approvedRevision: 1, createdAt: '2026-11-20T02:00:00Z' },
    { taskId: 't', gate: 'C', decision: 'approved', approvedRevision: 1, createdAt: '2026-11-21T02:00:00Z' },
  ],
  results: [{ taskId: 't', revision: 1, summary: '바꿨어요', remainingIssues: '' }],
} as unknown as typeof EMPTY_WORKFLOW;

describe('옵시디언 세컨드 브레인(v0.8.5)', () => {
  it('업무 노트: 속성·원문(비밀값 가림)·기획서·결과·결정', () => {
    const n = taskNote(task, '미노피아', wf);
    expect(n).toContain('프로젝트: "[[미노피아]]"');
    expect(n).toContain('상태: 완료');
    expect(n).toContain('끝난날: 2026-11-21');
    expect(n).toContain('[가림]');
    expect(n).not.toContain('ghp_abc');
    expect(n).toContain('## 기획서');
    expect(n).toContain('- 2026-11-21 배포 승인 승인(v1)');
  });
  it('파일 이름에 못 쓰는 글자 빼기', () => {
    expect(safeName('로그인 버튼: 색/바꾸기?')).toBe('로그인 버튼 색 바꾸기');
  });
  it('전체: 업무·채팅·위키·데일리, 내 메모는 없음', () => {
    const chat = { id: 'abcdef123', title: '파이썬 질문', updatedAt: '2026-11-21T03:00:00Z', projectId: null, messages: [{ role: 'user', text: '파이썬?', at: '2026-11-21T03:00:00Z' }, { role: 'model', text: '언어예요', at: '2026-11-21T03:00:05Z', by: 'B' }] } as ChatThread;
    const files = brainNotes({ projects: P, tasks: [task], workflow: wf, chats: [chat], chatIndex: [{ id: chat.id, title: chat.title, updatedAt: chat.updatedAt, projectId: null }], wikis: [{ projectId: 'p', body: '# 위키', updatedAt: '2026-11-22T00:00:00Z' }] });
    expect(files.filter((f) => !f.path.startsWith('대시보드/') && !f.path.startsWith('주간/') && !/(업무 목록|지식)\.md$/.test(f.path)).map((f) => f.path)).toEqual(['미노피아/업무/2026-11-20 로그인 버튼 색 바꾸기.md', '채팅/파이썬 질문 abcdef.md', '미노피아/위키.md', '데일리/2026-11-20.md', '데일리/2026-11-21.md']);
    expect(files.find((f) => f.path === '데일리/2026-11-21.md')!.content).toContain('업무 배포: [[미노피아/업무/2026-11-20 로그인 버튼 색 바꾸기|로그인 버튼 색 바꾸기]]');
    expect(files.some((f) => f.path.startsWith('내 메모'))).toBe(false);
    expect(chatNote(chat, null)).toContain('**Gemini B**');
    // 허브(v0.8.7): Bases 표 3개 + 한눈에 + 프로젝트 업무 목록
    expect(files.filter((f) => f.path.startsWith('대시보드/')).map((f) => f.path)).toEqual(['대시보드/업무.base', '대시보드/자료.base', '대시보드/채팅.base', '대시보드/아이디어.base', '대시보드/한눈에.md']);
    const hub = files.find((f) => f.path === '미노피아/업무 목록.md')!.content;
    expect(hub).toContain('file.inFolder("미노피아/업무")');
    expect(files.find((f) => f.path === '대시보드/한눈에.md')!.content).toContain('[[데일리/2026-11-21|2026-11-21]]');
  });
  it('지문', () => {
    expect(noteHash('a')).toBe(noteHash('a'));
    expect(noteHash('a')).not.toBe(noteHash('b'));
  });
});

import { chatExtras, decisionNotes, inboxNotes, isoWeek, knowledgeNote, weeklyNotes } from './brainNotes';
describe('옵시디언 더 넣기(v0.8.8)', () => {
  it('지식: 지켜야 할 것·결정 모음', () => {
    const n = knowledgeNote(P[0], [task], wf, [{ id: 'r', projectId: 'p', rule: '휴대폰 400px 확인', source: 'result', taskId: 't', createdAt: '2026-11-21T00:00:00Z' }]);
    expect(n).toContain('> - 휴대폰 400px 확인 _(개발 결과 · 2026-11-21)_ · [[미노피아/업무/2026-11-20 로그인 버튼 색 바꾸기|로그인 버튼 색 바꾸기]]');
    expect(n).toContain('## 결정 모음');
  });
  it('결정: 변경 기록의 소유자 말만 달마다', () => {
    const f = decisionNotes('# 변경 기록\n\n## 챗봇(v0.7.99) — 2026-11-22\n\n- 소유자 "지난 대화는 서버에 둔다": 저장\n- 그냥 줄\n## 옛것(v0.1.0) — 2026-10-01\n- 소유자 결정 "추가 결제 0원": 규칙');
    expect(f.map((x) => x.path)).toEqual(['결정/2026-11.md', '결정/2026-10.md']);
    expect(f[0].content).toContain('2026-11-22 · v0.7.99 — "지난 대화는 서버에 둔다"');
  });
  it('업무 대화: 질문·답만, 프로젝트·날짜마다', () => {
    const t0 = Date.parse('2026-11-21T03:00:00Z');
    const f = inboxNotes([{ id: `${t0}-ab`, from: 'me', text: '이거 뭐야', home: 'p' }, { id: `${t0 + 1000}-cd`, from: 'gemini', text: '답', home: 'p' }, { id: 'stage-x', from: 'office', text: '알림' }], (id) => (id === 'p' ? '미노피아' : null));
    expect(f.map((x) => x.path)).toEqual(['미노피아/대화/2026-11-21.md']);
    expect(f[0].content).toContain('**Gemini**');
  });
  it('유튜브 요약 → 자료, 아이디어: → 아이디어', () => {
    const c = { id: 'c1', title: 't', updatedAt: '2026-11-21T00:00:00Z', projectId: null, messages: [{ role: 'user', text: 'https://youtu.be/dQw4w9WgXcQ', at: '2026-11-21T00:00:00Z' }, { role: 'model', text: '## 핵심\n- 노래', at: '2026-11-21T00:00:05Z', by: 'A' }, { role: 'user', text: '아이디어: 블로그 자동화', at: '2026-11-21T01:00:00Z' }] } as ChatThread;
    const f = chatExtras([c], () => null);
    expect(f.map((x) => x.path)).toEqual(['자료/유튜브 핵심 dQw4w9WgXcQ.md', '아이디어/2026-11-21 블로그 자동화.md']);
  });
  it('주간 회고', () => {
    expect(isoWeek('2026-11-23')).toBe('2026-W48');
    const f = weeklyNotes([task], wf, () => '미노피아');
    expect(f.map((x) => x.path)).toEqual(['주간/2026-W47.md']);
    expect(f[0].content).toContain('배포 **1**');
    expect(f[0].content).toContain('[[내 메모/주간 회고/2026-W47|여기에 쓰기]]');
  });
});
