import { describe, expect, it } from 'vitest';
import { applyMention, mentionAllowed, mentionedAssignee } from './mention';
import { checkSmallTask } from './smallTask';
import type { TaskSpec, WorkItem } from './workflow-types';

const spec: TaskSpec = {
  id: 's1', taskId: 't1', revision: 1, intent: 'change_request', planner: 'gemini_draft', userOriginalText: '', finalPrompt: 'README 한 줄',
  changeScope: 'README.md', preserveConstraints: '', testCriteria: '- 줄이 있다', answer: '', sizeHint: { difficulty: 2, single_task: true, needs_design: false }, createdAt: '',
};

describe('@이름으로 맡기기(v0.5.46)', () => {
  it('한글·영어 이름을 읽고 먼저 나온 것을 쓴다', () => {
    expect(mentionedAssignee('@클로드 다크모드 고쳐줘')).toEqual({ preference: 'claude_support', label: 'Claude' });
    expect(mentionedAssignee('이건 @Codex 말고 @gemini')).toMatchObject({ preference: 'codex_primary' });
    expect(mentionedAssignee('@제미나이 해줘')).toMatchObject({ preference: 'gemini_dev' });
    expect(mentionedAssignee('메일 a@b.com 고쳐줘')).toBeNull();
    expect(mentionedAssignee(undefined)).toBeNull();
  });

  it('AI Office 자신에는 Gemini 지정을 쓰지 않는다', () => {
    const g = mentionedAssignee('@gemini')!;
    expect(mentionAllowed(g, 'minho-nim/minoffia')).toBe(false);
    expect(mentionAllowed(g, 'me/app')).toBe(true);
  });

  it('작은 일은 지정한 AI로, 휴가면 원래 규칙으로', () => {
    expect(checkSmallTask(spec, 'me/app', {}, 'claude_support')).toMatchObject({ ok: true, preference: 'claude_support' });
    expect(checkSmallTask(spec, 'me/app', { claude: true }, 'claude_support')).toMatchObject({ ok: true, preference: 'gemini_dev' });
    expect(checkSmallTask(spec, 'minho-nim/minoffia', {}, 'gemini_dev')).toMatchObject({ ok: true, preference: 'codex_primary' });
  });

  it('계획의 모든 작업 담당을 바꾼다', () => {
    const w = { id: 'W1', assignee_preference: 'codex_primary', execution_mode: 'codex_cloud' } as WorkItem;
    expect(applyMention([w, { ...w, id: 'W2' }], { preference: 'claude_support', label: 'Claude' }).map((x) => x.assignee_preference)).toEqual(['claude_support', 'claude_support']);
  });
});
