import { describe, expect, it } from 'vitest';
import { branchName, buildHandoff } from './handoff';
import type { Task } from './types';

const task: Task = {
  id: 'abcd1234-0000-4000-8000-000000000000',
  projectId: 'p1',
  title: '로그인 버그 수정',
  description: '세션이 끊기는 문제',
  type: 'dev',
  requestedType: 'auto',
  priority: 'high',
  assignee: 'codex',
  routeReason: '',
  status: 'queued',
  dispatch: { state: 'none' },
  createdAt: '',
  updatedAt: '',
};

describe('handoff', () => {
  it('브랜치 이름은 담당자와 작업 ID 앞 8자리', () => {
    expect(branchName(task)).toBe('ai/codex/abcd1234');
  });

  it('지시서에 저장소, 할 일, main 금지 규칙이 들어간다', () => {
    const text = buildHandoff(task, { id: 'p1', name: 'MuscleMap', repo: 'minho-nim/MuscleMap', description: '', createdAt: '' });
    expect(text).toContain('minho-nim/MuscleMap');
    expect(text).toContain('로그인 버그 수정');
    expect(text).toContain('main에 직접 푸시');
    expect(text).toContain('우선순위 높음');
  });

  it('저장소가 없으면 텍스트 보고를 요청한다', () => {
    expect(buildHandoff(task, undefined)).toContain('저장소 미연결');
  });
});
