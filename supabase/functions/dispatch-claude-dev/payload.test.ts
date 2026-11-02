import { describe, expect, it } from 'vitest';
import { CLAUDE_MD_SYNC as APP_SYNC, codexBranch } from '../../../src/domain/handoffV2';
import { buildDevPayload, CLAUDE_MD_SYNC, claudeBranch } from './payload';

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

  it('미리보기 push는 작업 브랜치만, PR·병합·배포는 금지, 결과 보고 형식', () => {
    expect(t).toContain('git push --force-with-lease -u origin ai/claude/28333f7e-w1');
    expect(t).toContain('PR·병합·배포는 하지 않는다');
    expect(t).not.toContain('미리보기 주소:');
    expect(buildDevPayload({ ...input, previewUrl: 'https://ai-claude-28333f7e-w1.x.pages.dev' })).toContain('미리보기 주소: https://ai-claude-28333f7e-w1.x.pages.dev');
    expect(t).toContain('git diff main...HEAD');
    expect(t).not.toMatch(/\n\n\n/);
  });

  it('브랜치 규칙은 Codex와 같은 모양(ai/<도구>/)', () => {
    expect(claudeBranch(input.taskId, 'W1').replace('ai/claude/', '')).toBe(codexBranch({ id: input.taskId } as never, 'W1').replace('ai/codex/', ''));
  });

  it('결과 자동 저장: 제출표가 있으면 보내는 방법을 붙이고, 없으면 붙이지 않는다', () => {
    const withSubmit = buildDevPayload({ ...input, submit: { url: 'https://x.supabase.co/functions/v1/submit-result', token: 't'.repeat(64) } });
    expect(withSubmit).toContain('## 결과 보내기');
    expect(withSubmit).toContain("curl -sS -X POST 'https://x.supabase.co/functions/v1/submit-result'");
    expect(withSubmit).toContain('"branch":"ai/claude/28333f7e-w1"');
    expect(withSubmit).toContain('"preview_pushed":');
    expect(withSubmit).toContain('"project_rules":[]');
    expect(t).not.toContain('결과 보내기');
  });

  it('프로젝트에서 지켜야 할 것이 있으면 절로 넣고 CLAUDE.md도 맞추게 한다', () => {
    expect(t).not.toContain('## 이 프로젝트에서 지켜야 할 것 (');
    const withRules = buildDevPayload({ ...input, projectRules: ['모바일 400px 가로 넘침 없게'] });
    expect(withRules).toContain('## 이 프로젝트에서 지켜야 할 것 (');
    expect(withRules).toContain('- 모바일 400px 가로 넘침 없게');
    expect(withRules).toContain('CLAUDE.md');
  });

  it('CLAUDE.md를 알아서 만들거나 맞추라는 문장은 앱(Codex 지시서)과 같다(v0.4.75)', () => {
    expect(CLAUDE_MD_SYNC).toBe(APP_SYNC);
  });
});
