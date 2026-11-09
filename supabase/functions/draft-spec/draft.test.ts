import { describe, expect, it } from 'vitest';
import { titleFrom } from '../../../src/domain/triage';
import { autoTitle, cleanTitle, parseDraft } from './draft';

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

  it('크기 힌트(v0.5.20): 개발 요청에서 셋 다 맞을 때만 받는다', () => {
    expect(parseDraft('{"intent":"change_request","final_prompt":"x","difficulty":2,"single_task":true,"needs_design":false}')?.sizeHint).toEqual({ difficulty: 2, single_task: true, needs_design: false });
    expect(parseDraft('{"intent":"change_request","final_prompt":"x","difficulty":"3","single_task":false,"needs_design":true}')?.sizeHint).toEqual({ difficulty: 3, single_task: false, needs_design: true });
    expect(parseDraft('{"intent":"change_request","final_prompt":"x","difficulty":11,"single_task":true,"needs_design":false}')?.sizeHint).toBeNull();
    expect(parseDraft('{"intent":"change_request","final_prompt":"x","difficulty":2,"single_task":"yes","needs_design":false}')?.sizeHint).toBeNull();
    expect(parseDraft('{"intent":"change_request","final_prompt":"x"}')?.sizeHint).toBeNull();
    expect(parseDraft('{"intent":"change_request","final_prompt":"x","difficulty":4,"single_task":true,"needs_design":false,"bug":true}')?.sizeHint).toEqual({ difficulty: 4, single_task: true, needs_design: false, bug: true });
    expect(parseDraft('{"intent":"asset_request","final_prompt":"x","difficulty":2,"single_task":true,"needs_design":false}')?.sizeHint).toBeNull();
  });

  it('불분명하면 확인 질문을 answer에', () => {
    expect(parseDraft('{"intent":"ambiguous","answer":"1. 어느 화면인가요?"}')?.answer).toContain('어느 화면');
  });

  it('앞으로 지킬 것(project_rules)은 다듬어 받고, 없으면 빈 목록', () => {
    expect(parseDraft('{"intent":"change_request","final_prompt":"x","project_rules":["- 항상 다크 모드 지원"]}')?.projectRules).toEqual(['항상 다크 모드 지원']);
    expect(parseDraft('{"intent":"change_request","final_prompt":"x"}')?.projectRules).toEqual([]);
  });

  it('짧은 제목을 받아 다듬는다(v0.4.78)', () => {
    const d = parseDraft('{"intent":"change_request","title":"\\"운동 기록 다크 모드.\\"","final_prompt":"다크 모드 추가"}');
    expect(d?.title).toBe('운동 기록 다크 모드');
    expect(cleanTitle('가'.repeat(31))).toBe('');
    expect(cleanTitle(3)).toBe('');
    expect(parseDraft('{"intent":"change_request","final_prompt":"x"}')?.title).toBe('');
  });

  it('자동 제목 규칙은 앱(titleFrom)과 같다', () => {
    for (const t of ['  첫 줄\n둘째 줄', '가'.repeat(80), '이 화면의 다른 스타일을 만들고 싶어 스타일 바꾸고, 구조도 변경']) expect(autoTitle(t)).toBe(titleFrom(t));
  });
});

describe('목록으로 온 칸(v0.5.68)', () => {
  it('완료 기준·유지 조건이 목록이어도 글로 바꿔 받는다', async () => {
    const { parseDraft } = await import('./draft');
    const d = parseDraft(JSON.stringify({ intent: 'change_request', final_prompt: '버튼 글씨 키우기', test_criteria: ['400px에서 가로 넘침 없음', '- 버튼 글씨가 16px'], preserve_constraints: ['색은 그대로'] }))!;
    expect(d.testCriteria).toBe('- 400px에서 가로 넘침 없음\n- 버튼 글씨가 16px');
    expect(d.preserveConstraints).toBe('- 색은 그대로');
  });
});
