import { describe, expect, it } from 'vitest';
import { buildCodexHandoff, buildCodexPrRequest, codexBranch } from './handoffV2';
import type { Project, Task } from './types';
import type { TaskSpec, WorkItem } from './workflow-types';

const task: Task = {
  id: '28333f7e-53cd-44d4-b481-4659e53d5708', projectId: 'p', title: 'README', description: '', type: 'planning', requestedType: 'auto',
  priority: 'normal', assignee: 'codex', routeReason: '', status: 'in_progress', dispatch: { state: 'none' },
  createdAt: '', updatedAt: '',
};
const project: Project = { id: 'p', name: 'AI Office', repo: 'minho-nim/MinLab-AI-Office', description: '', createdAt: '' };
const spec: TaskSpec = {
  id: 's1', taskId: task.id, revision: 1, intent: 'change_request', planner: 'chatgpt_manual', userOriginalText: '원문',
  finalPrompt: 'README 맨 아래에 한 줄 추가', changeScope: 'README.md', preserveConstraints: '', testCriteria: '', answer: '', createdAt: '',
};
const item: WorkItem = {
  id: 'W1', title: '한 줄 추가', goal: '', dependencies: [], assignee_preference: 'codex_primary', execution_mode: 'manual_handoff',
  acceptance_tests: [], preserve_constraints: [], attachment_refs: [], requires_execution_approval: true,
};

describe('buildCodexHandoff', () => {
  const text = buildCodexHandoff(task, spec, item, project, '6a16ac1', [], []);

  it('기준 커밋은 참고용이고 최신 main에서 작업하라고 쓴다', () => {
    expect(text).toContain('계획 당시 기준 커밋: 6a16ac1');
    expect(text).toContain('최신 기본 브랜치(main)');
    expect(text).not.toContain('@ 6a16ac1');
  });

  it('PR·푸시는 B 승인 뒤에만, 시험 결과는 그대로 보고', () => {
    expect(text).toContain('PR 생성·브랜치 푸시를 하지 않는다');
    expect(text).toContain('그대로 보고');
    expect(text).toContain('모바일(약 400px) 스크린샷');
  });
});

describe('buildCodexPrRequest', () => {
  it('승인된 결과 버전, 정해진 브랜치, 병합 금지', () => {
    const text = buildCodexPrRequest(task, 2, 'W1', project);
    expect(text).toContain('결과 v2');
    expect(text).toContain('ai/codex/28333f7e-w1');
    expect(text).toContain('병합하지 않는다');
    expect(text).toContain('minho-nim/MinLab-AI-Office');
  });

  it('브랜치 이름에 안전한 글자만 쓴다', () => {
    expect(codexBranch(task, 'W 1;rm')).toBe('ai/codex/28333f7e-w1rm');
    expect(codexBranch(task, '')).toBe('ai/codex/28333f7e');
  });
});
