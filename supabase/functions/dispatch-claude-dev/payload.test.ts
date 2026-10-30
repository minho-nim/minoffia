import { describe, expect, it } from 'vitest';
import { codexBranch } from '../../../src/domain/handoffV2';
import { buildDevPayload, claudeBranch } from './payload';

const input = {
  taskId: '28333f7e-53cd-44d4-b481-4659e53d5708',
  repo: 'minho-nim/MinLab-AI-Office',
  projectName: 'AI Office',
  specRevision: 2,
  planRevision: 1,
  finalPrompt: '버튼 색을 바꾼다',
  changeScope: 'src/styles.css',
  preserveConstraints: '다른 화면은 그대로',
  testCriteria: 'npm test 통과',
  item: { id: 'W1', title: '버튼 색', goal: '주 버튼을 초록으로', acceptance_tests: ['npm run build'], preserve_constraints: ['다크 모드 유지'] },
  attachments: ['1. [목표·참고 디자인] goal.png'],
  prototypes: [],
};

describe('Claude 보조 개발 지시문', () => {
  const t = buildDevPayload(input);

  it('업무·작업·브랜치·기획서·완료 기준을 담는다', () => {
    expect(t).toContain('업무 ID 28333f7e-53cd-44d4-b481-4659e53d5708 / 작업 W1');
    expect(t).toContain('작업 브랜치: ai/claude/28333f7e-w1');
    expect(t).toContain('버튼 색을 바꾼다');
    expect(t).toContain('- 다크 모드 유지');
    expect(t).toContain('- npm run build');
    expect(t).toContain('goal.png');
    expect(t).not.toContain('승인된 견본');
  });

  it('B 승인 전 푸시·PR 금지와 결과 보고 형식', () => {
    expect(t).toContain('git push·PR·병합·배포를 하지 않는다');
    expect(t).toContain('git diff main...HEAD');
    expect(t).not.toMatch(/\n\n\n/);
  });

  it('브랜치 규칙은 Codex와 같은 모양(ai/<도구>/)', () => {
    expect(claudeBranch(input.taskId, 'W1').replace('ai/claude/', '')).toBe(codexBranch({ id: input.taskId } as never, 'W1').replace('ai/codex/', ''));
  });
});
