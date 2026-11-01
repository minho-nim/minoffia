import { describe, expect, it } from 'vitest';
import { parseDraft } from './draft';

describe('Gemini 기획서 초안 해석(v0.4.0)', () => {
  it('코드 블록에 싸인 JSON도 읽는다', () => {
    const d = parseDraft('```json\n{"intent":"change_request","final_prompt":"README에 한 줄 추가","change_scope":"README.md","preserve_constraints":"","test_criteria":"npm test","answer":""}\n```');
    expect(d?.intent).toBe('change_request');
    expect(d?.finalPrompt).toBe('README에 한 줄 추가');
    expect(d?.changeScope).toBe('README.md');
  });

  it('개발 요청인데 지시가 비었거나, 모르는 의도면 거절', () => {
    expect(parseDraft('{"intent":"change_request","final_prompt":""}')).toBeNull();
    expect(parseDraft('{"intent":"build","final_prompt":"x"}')).toBeNull();
    expect(parseDraft('그냥 글')).toBeNull();
  });

  it('불분명하면 확인 질문을 answer에', () => {
    expect(parseDraft('{"intent":"ambiguous","answer":"1. 어느 화면인가요?"}')?.answer).toContain('어느 화면');
  });

  it('앞으로 지킬 것(project_rules)은 다듬어 받고, 없으면 빈 목록', () => {
    expect(parseDraft('{"intent":"change_request","final_prompt":"x","project_rules":["- 항상 다크 모드 지원"]}')?.projectRules).toEqual(['항상 다크 모드 지원']);
    expect(parseDraft('{"intent":"change_request","final_prompt":"x"}')?.projectRules).toEqual([]);
  });
});
