import { describe, expect, it } from 'vitest';
import { buildCodexHandoff, buildGptPackage, buildCodexPrRequest, buildPrototypeHandoff, codexBranch } from './handoffV2';
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

describe('견본 먼저(v0.3.5)', () => {
  const proto = {
    id: 'abcdef12-0000', taskId: task.id, kind: 'prototype' as const, resultRevision: null, planRevision: 1, position: 0, role: 'prototype' as const,
    note: 'AI Studio 1차', fileName: 'proto.zip', mime: 'application/zip', sizeBytes: 10, sha256: 'x', storagePath: 'p', createdAt: '',
  };

  it('AI Studio 지시서: 이유·기획서·저장소 금지·ZIP 올리기', () => {
    const t = buildPrototypeHandoff(task, spec, item, project, '새 화면이라 견본부터');
    expect(t).toContain('# AI Studio Build 견본');
    expect(t).toContain('새 화면이라 견본부터');
    expect(t).toContain('README 맨 아래에 한 줄 추가');
    expect(t).toContain('저장소는 바꾸지 않는다');
    expect(t).toContain('ZIP');
  });

  it('Codex 지시서: 승인된 견본을 보존하며 통합', () => {
    const t = buildCodexHandoff(task, spec, item, project, '', [], [], [proto]);
    expect(t).toContain('## 승인된 견본');
    expect(t).toContain('proto.zip');
    expect(t).toContain('보존하면서');
    expect(buildCodexHandoff(task, spec, item, project, '', [], [])).not.toContain('승인된 견본');
    expect(buildCodexHandoff(task, spec, item, project, '', [], [])).not.toContain('이 프로젝트에서 지켜야 할 것');
    expect(buildCodexHandoff(task, spec, item, project, '', [], [], [], ['결제 기능 넣지 않기'])).toContain('## 이 프로젝트에서 지켜야 할 것 (기본 규칙과 앞선 업무에서 적어 둔 것, 어기지 않는다)\n- 결제 기능 넣지 않기');
  });
});

describe('Claude 보조 개발 PR 요청(v0.3.8)', () => {
  it('세션의 작업 브랜치(ai/claude/)를 푸시하고 병합하지 않는다', () => {
    const t = buildCodexPrRequest(task, 1, 'W2', project, 'claude');
    expect(t).toContain('이 세션의 작업 브랜치 ai/claude/28333f7e-w2');
    expect(t).toContain('병합하지 않는다');
    expect(codexBranch(task, 'W2', 'claude')).toBe('ai/claude/28333f7e-w2');
  });
});

describe('기획 요청에 요청 전 대화(v0.3.9)', () => {
  it('원문에 없는 설명(앞 대화)은 따로 붙이고, 원문과 같은 설명은 두 번 넣지 않는다', () => {
    const withCtx = buildGptPackage({ ...task, userOriginalText: '그거 만들어줘', description: '## 요청 전 대화(Gemini 무료, 참고용 · 틀릴 수 있음)\n질문: q' }, project, null);
    expect(withCtx).toContain('## 요청 전 대화');
    const same = buildGptPackage({ ...task, userOriginalText: '긴 요청 원문', description: '긴 요청 원문' }, project, null);
    expect(same.split('긴 요청 원문').length).toBe(2);
  });
});
