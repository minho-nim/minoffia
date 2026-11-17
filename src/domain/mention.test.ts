import { describe, expect, it } from 'vitest';
import { answerSlot, applyMention, mentionAllowed, mentionedAssignee, mentionOptions } from './mention';
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
    expect(mentionedAssignee('@제미나이 해줘')).toBeNull();
    expect(mentionedAssignee('메일 a@b.com 고쳐줘')).toBeNull();
    expect(mentionedAssignee(undefined)).toBeNull();
  });

  it('@이름 지정은 어느 저장소에서나 쓴다(Gemini 개발을 뺀 뒤, v0.7.5)', () => {
    const c = mentionedAssignee('@claude')!;
    expect(mentionAllowed(c, 'minho-nim/minoffia')).toBe(true);
  });

  it('작은 일은 지정한 AI로, 휴가면 원래 규칙으로', () => {
    expect(checkSmallTask(spec, 'me/app', {}, 'claude_support')).toMatchObject({ ok: true, preference: 'claude_support' });
    expect(checkSmallTask(spec, 'me/app', { claude: true }, 'claude_support')).toMatchObject({ ok: true, preference: 'codex_primary' });
  });

  it('계획의 모든 작업 담당을 바꾼다', () => {
    const w = { id: 'W1', assignee_preference: 'codex_primary', execution_mode: 'codex_cloud' } as WorkItem;
    expect(applyMention([w, { ...w, id: 'W2' }], { preference: 'claude_support', label: 'Claude' }).map((x) => x.assignee_preference)).toEqual(['claude_support', 'claude_support']);
  });
});

describe('@ 목록(v0.5.47)', () => {
  it('커서 앞 @글자를 찾고, 메일 주소는 무시', async () => {
    const { mentionQuery, mentionOptions, insertMention } = await import('./mention');
    expect(mentionQuery('다크모드 @', 6)).toEqual({ start: 5, query: '' });
    expect(mentionQuery('@cl', 3)).toEqual({ start: 0, query: 'cl' });
    expect(mentionQuery('a@b', 3)).toBeNull();
    expect(mentionOptions('').length).toBe(6);
    expect(mentionOptions('cl').map((o) => o.tag)).toEqual(['Claude']);
    expect(mentionOptions('제').map((o) => o.tag)).toEqual([]);
    expect(insertMention('고쳐줘 @cl', 7, 4, 'Claude')).toEqual({ text: '고쳐줘 @Claude ', caret: 12 });
    expect(mentionedAssignee('@Gemini 해줘')).toBeNull();
  });
  it('@StudioA·@StudioB는 답할 Gemini 키를 고르고 개발 담당으로 읽지 않는다(v0.6.24)', () => {
    expect(answerSlot('@StudioB 이거 뭐야?')).toBe(2);
    expect(answerSlot('@스튜디오A 알려줘')).toBe(1);
    expect(answerSlot('@studio b 알려줘')).toBe(2);
    expect(answerSlot('그냥 질문')).toBeNull();
    expect(mentionedAssignee('@StudioB 버튼 고쳐줘')).toBeNull();
    expect(mentionedAssignee('@Gemini 버튼 고쳐줘')).toBeNull();
    expect(mentionOptions('스튜').map((o) => o.tag)).toEqual(['StudioA', 'StudioB']);
  });
});

describe('@Tavily(v0.7.3, v0.7.52 @Exa 삭제)', () => {
  it('@Tavily·@웹검색이면 웹 조사, @Exa는 더 이상 아님', async () => {
    const { asksSearch, mentionOptions } = await import('./mention');
    expect(asksSearch('@Tavily 요즘 무료 한도')).toBe(true);
    expect(asksSearch('@웹검색 찾아줘')).toBe(true);
    expect(asksSearch('@Exa 찾아줘')).toBe(false);
    expect(asksSearch('@Tavilyish')).toBe(false);
    expect(mentionOptions('ta').map((o) => o.tag)).toEqual(['Tavily']);
    expect(mentionOptions('ex')).toEqual([]);
  });
});

describe('@Firecrawl(v0.7.53)', () => {
  it('웹 조사로 가고, 먼저 쓸 검색을 고른다', async () => {
    const { asksSearch, searchEngineOf, mentionOptions } = await import('./mention');
    expect(asksSearch('@Firecrawl 이 페이지 요약')).toBe(true);
    expect(asksSearch('@파이어크롤 찾아줘')).toBe(true);
    expect(searchEngineOf('@Firecrawl 최신 뉴스')).toBe('firecrawl');
    expect(searchEngineOf('@Tavily 최신 뉴스')).toBe('tavily');
    expect(searchEngineOf('요즘 뉴스 찾아줘')).toBeNull();
    expect(mentionOptions('fi').map((o) => o.tag)).toEqual(['Firecrawl']);
  });
});
