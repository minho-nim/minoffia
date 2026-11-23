import { describe, expect, it } from 'vitest';
import { checkFiles, okPath } from './notePaths';

describe('노트 경로 검사(v0.8.5)', () => {
  it('자동 노트 자리만', () => {
    expect(okPath('미노피아/업무/2026-11-20 로그인.md')).toBe(true);
    expect(okPath('미노피아/채팅/2026-11-20 질문 abc123.md')).toBe(true);
    expect(okPath('미노피아/위키.md')).toBe(true);
    expect(okPath('채팅/2026-11-20 질문.md')).toBe(true);
    expect(okPath('데일리/2026-11-20.md')).toBe(true);
    expect(okPath('자료/cnbc.com Tesla 주가.md')).toBe(true);
    expect(okPath('대시보드/업무.base')).toBe(true);
    expect(okPath('대시보드/한눈에.md')).toBe(true);
    expect(okPath('미노피아/업무 목록.md')).toBe(true);
    expect(okPath('미노피아/지식.md')).toBe(true);
    expect(okPath('미노피아/대화/2026-11-21.md')).toBe(true);
    expect(okPath('결정/2026-11.md')).toBe(true);
    expect(okPath('스킬/ui-check.md')).toBe(true);
    expect(okPath('스킬/분류/화면·디자인.md')).toBe(true);
    expect(okPath('스킬/a/b.md')).toBe(false);
    expect(okPath('주간/2026-W48.md')).toBe(true);
    expect(okPath('아이디어/2026-11-21 블로그.md')).toBe(true);
    expect(okPath('미노피아/업무.base')).toBe(false);
    expect(okPath('대시보드/../x.base')).toBe(false);
  });
  it('내 메모·위로 가기·숨김·다른 자리·다른 확장자는 거절', () => {
    expect(okPath('내 메모/일기.md')).toBe(false);
    expect(okPath('../x.md')).toBe(false);
    expect(okPath('미노피아/../../x.md')).toBe(false);
    expect(okPath('.github/workflows/x.md')).toBe(false);
    expect(okPath('미노피아/미노피아.md')).toBe(false);
    expect(okPath('홈.md')).toBe(false);
    expect(okPath('미노피아/업무/x.sh')).toBe(false);
    expect(okPath('미노피아/업무/a/b.md')).toBe(false);
  });
  it('목록 검사', () => {
    expect(checkFiles([])).toBe('보낼 노트가 없습니다.');
    expect(checkFiles([{ path: '홈.md', content: 'x' }])).toMatch(/허락하지 않은/);
    expect(checkFiles([{ path: '데일리/2026-11-20.md', content: 'x' }, { path: '데일리/2026-11-20.md', content: 'y' }])).toEqual([{ path: '데일리/2026-11-20.md', content: 'x' }]);
  });
});

import { brainNotes } from '../../../src/domain/brainNotes';
import { EMPTY_WORKFLOW } from '../../../src/domain/workflow-types';

describe('앱이 만드는 노트 경로는 서버가 모두 허락', () => {
  it('업무·채팅(프로젝트 있음·없음)·위키·데일리', () => {
    const projects = [{ id: 'p', name: '미니어리 (Minially)' }] as never;
    const tasks = [{ id: 't', projectId: 'p', title: '로그인: "버튼" 색?', status: 'queued', assignee: 'claude', createdAt: '2026-11-20T01:00:00Z' }] as never;
    const chats = [{ id: 'c1xxxxxx', title: '질문/답', updatedAt: '2026-11-21T00:00:00Z', projectId: 'p', messages: [{ role: 'user', text: 'a', at: '2026-11-21T00:00:00Z' }, { role: 'model', text: 'b', at: '2026-11-21T00:00:01Z', sources: [{ title: 'Tesla: Q2/실적?', uri: 'https://www.cnbc.com/x' }] }] }, { id: 'c2yyyyyy', title: '.숨김', updatedAt: '2026-11-21T00:00:00Z', projectId: null, messages: [{ role: 'user', text: 'b', at: '2026-11-21T00:00:00Z' }] }] as never;
    const files = brainNotes({ projects, tasks, workflow: EMPTY_WORKFLOW, chats, chatIndex: chats, wikis: [{ projectId: 'p', body: 'x', updatedAt: '2026-11-21T00:00:00Z' }] });
    expect(files.length).toBe(15);
    expect(checkFiles(files)).toHaveLength(15);
    expect(files.some((f) => f.path === '자료/cnbc.com Tesla Q2 실적.md')).toBe(true);
  });
});
