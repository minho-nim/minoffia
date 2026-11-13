import { describe, expect, it } from 'vitest';
import { usedSkills as original } from '../../../src/domain/skills';
import { agentOf, usedSkills, versionInputs } from './versionNote';

describe('옵시디언 버전 노트 입력', () => {
  const samples: [string, string][] = [
    ['요약\n쓴 스킬: repo-map, ui-check', ''],
    ['find-skills 절차로 찾고 skill-creator 스킬대로 만들었다', 'node .claude/skills/repo-map/scripts/map.mjs'],
    ['스킬 확인: report-format', '.agents/skills/ui-check/check.sh'],
    ['아무것도 없음', ''],
  ];
  it('쓴 스킬 찾기는 앱(src/domain/skills.ts)과 같다', () => {
    for (const [s, t] of samples) expect(usedSkills(s, t)).toEqual(original(s, t));
  });
  it('결과 출처로 만든 AI를 고른다', () => {
    expect(agentOf('codex_linear_auto')).toBe('Codex');
    expect(agentOf('claude_session_auto')).toBe('Claude');
    expect(agentOf('gemini_dev')).toBe('Gemini');
    expect(agentOf('manual')).toBe('직접');
  });
  it('입력을 짧고 안전하게 만든다', () => {
    const v = versionInputs({ project: '미노피아\n', repo: 'minho-nim/minoffia', sha: 'abc1234', task: '버튼 고치기', score: 91.6, pr: 'https://github.com/minho-nim/minoffia/pull/381', source: 'codex_linear_auto', summary: '쓴 스킬: repo-map', testLog: '', at: '2026-11-13T01:02:03Z' });
    expect(v).toEqual({ project: '미노피아', repo: 'minho-nim/minoffia', sha: 'abc1234', task: '버튼 고치기', score: '92', pr: 'https://github.com/minho-nim/minoffia/pull/381', agent: 'Codex', skills: 'repo-map', date: '2026-11-13' });
    expect(versionInputs({ project: 'a', repo: 'b/c', sha: 'x; rm', task: 't', score: null, pr: 'javascript:1', source: '', summary: '', testLog: '', at: '' })).toMatchObject({ sha: '', pr: '', score: '', agent: '직접' });
  });
});
