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

describe('화면·게임·보안 새 스킬 추천(v0.7.48)', () => {
  const all = ['hallmark', 'impeccable', 'unslop', 'emil-design-eng', 'web-design-guidelines', 'ui-check', 'frontend-ui-engineering', 'security-audit', 'game-balance', 'game-playtest', 'game-design', 'game-gameplay', 'game-ui', 'game-qa'];
  it('새 화면이면 hallmark, 움직임이면 emil, 접근성이면 규칙 점검', () => {
    expect(suggestSkills('랜딩 새 페이지 만들어 줘', all)[0]).toBe('hallmark');
    expect(suggestSkills('팝업 열릴 때 애니메이션 다듬어', all)).toContain('emil-design-eng');
    expect(suggestSkills('버튼 접근성 키보드 점검', all)).toContain('web-design-guidelines');
  });
  it('게임 밸런스·플레이 기록', () => {
    expect(suggestSkills('MinSnakey 난이도가 너무 어려워', all)[0]).toBe('game-balance');
    expect(suggestSkills('게임 해 보니 첫 판이 헷갈려, 플레이 테스트 정리', all)[0]).toBe('game-playtest');
  });
  it('깊은 보안 감사는 요청할 때만', () => {
    expect(suggestSkills('로그인 권한 고쳐', all)).not.toContain('security-audit');
    expect(suggestSkills('전체 보안 감사 해 줘', all)).toContain('security-audit');
  });
});
