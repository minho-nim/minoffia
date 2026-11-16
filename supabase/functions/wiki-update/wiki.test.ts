import { describe, expect, it } from 'vitest';
import { appendDecisions, cleanWiki, diffFiles, factsText, wikiPrompt, WIKI_MAX } from './wiki';

const t = { date: '2026-11-16', title: '점수 상승 시각 효과 추가', spec: '점수가 오를 때\n효과', result: '파티클 효과 추가', files: ['src/game.ts'], feedback: ['더 크게'] };

describe('LLM 위키(v0.7.41)', () => {
  it('업무 기록을 자료로 정리한다', () => {
    const f = factsText(t);
    expect(f).toContain('### 2026-11-16 · 점수 상승 시각 효과 추가');
    expect(f).toContain('요구: 점수가 오를 때 효과');
    expect(f).toContain('소유자 수정 요청: 더 크게');
    expect(wikiPrompt({ name: 'MinSnakey', description: '' }, '', [t])).toContain('(아직 없음)');
  });
  it('AI 답 다듬기: 울타리 벗기기·제목 없으면 버림·길이 제한', () => {
    expect(cleanWiki('```markdown\n## 이 앱은\n뱀 게임\n```')).toBe('## 이 앱은\n뱀 게임');
    expect(cleanWiki('그냥 글')).toBeNull();
    expect(cleanWiki(`## 이 앱은\n${'가'.repeat(WIKI_MAX + 50)}`)!.length).toBe(WIKI_MAX);
  });
  it('AI 없이: 지난 결정 맨 위에 한 줄', () => {
    const w = appendDecisions('## 이 앱은\n뱀 게임\n## 지난 결정\n- 2026-11-01 - 예전 것', [t]);
    expect(w).toBe('## 이 앱은\n뱀 게임\n## 지난 결정\n- 2026-11-16 - 점수 상승 시각 효과 추가 (src/game.ts)\n- 2026-11-01 - 예전 것');
    expect(appendDecisions('', [t])).toContain('## 지난 결정\n- 2026-11-16');
  });
  it('diff에서 파일', () => {
    expect(diffFiles('diff --git a/a.ts b/a.ts\n+x\ndiff --git a/b.ts b/b.ts')).toEqual(['a.ts', 'b.ts']);
  });
});
