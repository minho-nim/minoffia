import { describe, expect, it } from 'vitest';
import { skillPickRule, suggestSkills } from './skillPick';

describe('개발 스킬 고르기(v0.7.0)', () => {
  const installed = ['ui-check', 'frontend-ui-engineering', 'db-security-check', 'security-and-hardening', 'debugging-and-error-recovery', 'repo-map'];
  it('업무 글로 저장소에 있는 스킬만 추천', () => {
    expect(suggestSkills('로그인 버튼이 휴대폰에서 안 돼요', installed)).toEqual(['debugging-and-error-recovery', 'ui-check', 'frontend-ui-engineering', 'db-security-check']);
    expect(suggestSkills('README 한 줄 추가', installed)).toEqual([]);
    expect(suggestSkills('화면 디자인 다듬기', ['ui-check'])).toEqual(['ui-check']);
  });
  it('고른 스킬은 지시서 규칙 한 줄, 이상한 이름은 뺀다', () => {
    expect(skillPickRule([])).toEqual([]);
    expect(skillPickRule(undefined)).toEqual([]);
    const r = skillPickRule(['ui-check', 'Bad Name', 'ui-check']);
    expect(r).toHaveLength(1);
    expect(r[0]).toContain('소유자가 이 업무에 고른 스킬: ui-check —');
  });
});

describe('게임 스킬 추천(v0.7.46)', () => {
  const installed = ['game-design', 'game-gameplay', 'game-ui', 'game-qa', 'game-debug', 'ui-check', 'debugging-and-error-recovery'];
  it('게임 업무면 게임 스킬을 먼저', () => {
    expect(suggestSkills('MinSnakey 레벨 난이도 올려 줘', installed)).toEqual(['game-design', 'game-gameplay', 'game-ui', 'game-qa']);
    expect(suggestSkills('게임이 휴대폰에서 끊겨', installed)[0]).toBe('game-debug');
  });
  it('게임 스킬이 없는 저장소면 추천하지 않는다', () => {
    expect(suggestSkills('게임 점수판 버튼 고쳐', ['ui-check', 'debugging-and-error-recovery'])).toEqual(['debugging-and-error-recovery', 'ui-check']);
  });
});
