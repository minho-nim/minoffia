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
    expect(files.filter((f) => !f.path.startsWith('대시보드/') && !f.path.endsWith('업무 목록.md')).map((f) => f.path)).toEqual(['미노피아/업무/2026-11-20 로그인 버튼 색 바꾸기.md', '채팅/파이썬 질문 abcdef.md', '미노피아/위키.md', '데일리/2026-11-20.md', '데일리/2026-11-21.md']);
    expect(files.find((f) => f.path === '데일리/2026-11-21.md')!.content).toContain('업무 배포: [[미노피아/업무/2026-11-20 로그인 버튼 색 바꾸기|로그인 버튼 색 바꾸기]]');
    expect(files.some((f) => f.path.startsWith('내 메모'))).toBe(false);
    expect(chatNote(chat, null)).toContain('**Gemini B**');
    // 허브(v0.8.7): Bases 표 3개 + 한눈에 + 프로젝트 업무 목록
    expect(files.filter((f) => f.path.startsWith('대시보드/')).map((f) => f.path)).toEqual(['대시보드/업무.base', '대시보드/자료.base', '대시보드/채팅.base', '대시보드/한눈에.md']);
    const hub = files.find((f) => f.path === '미노피아/업무 목록.md')!.content;
    expect(hub).toContain('file.inFolder("미노피아/업무")');
    expect(files.find((f) => f.path === '대시보드/한눈에.md')!.content).toContain('[[데일리/2026-11-21|2026-11-21]]');
  });
  it('지문', () => {
    expect(noteHash('a')).toBe(noteHash('a'));
    expect(noteHash('a')).not.toBe(noteHash('b'));
  });
});
