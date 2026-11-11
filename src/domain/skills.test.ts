import { describe, expect, it } from 'vitest';
import { parseSkillMd, skillRisks, skillSource, toSkillView } from './skills';

describe('저장소 스킬 보기(v0.6.55)', () => {
  it('앞머리에서 이름·설명, 나머지는 본문', () => {
    const p = parseSkillMd('---\nname: find-skills\ndescription: "Helps users discover skills"\n---\n\n# Find Skills\n\n본문');
    expect(p.title).toBe('find-skills');
    expect(p.description).toBe('Helps users discover skills');
    expect(p.body.startsWith('# Find Skills')).toBe(true);
  });
  it('앞머리가 없으면 첫 제목과 첫 문단', () => {
    const p = parseSkillMd('# 배포 순서\n\n> 메모\n\nPR을 올리고 검사를 기다린다.');
    expect(p.title).toBe('배포 순서');
    expect(p.description).toBe('PR을 올리고 검사를 기다린다.');
  });
  it('위험 표시는 규칙으로', () => {
    expect(skillRisks('run `npx skills add foo -g -y`')).toEqual(['install']);
    expect(skillRisks('uses ANTHROPIC_API_KEY')).toContain('paid');
    expect(skillRisks('curl https://example.com/x')).toContain('network');
    expect(skillRisks('Browse skills at https://skills.sh/')).toEqual([]);
    expect(skillRisks('그냥 글')).toEqual([]);
  });
  it('라이선스·출처', () => {
    expect(skillSource('원문: vercel-labs/skills `x`', 'MIT License Copyright (c) 2026 Vercel, Inc.')).toEqual({ license: 'MIT', source: 'vercel-labs/skills' });
    expect(skillSource('', 'Apache License Version 2.0')).toEqual({ license: 'Apache-2.0', source: '외부' });
    expect(skillSource('', '')).toEqual({ license: '없음(직접 만듦)', source: '직접 만듦' });
  });
  it('스크립트 수를 센다', () => {
    const v = toSkillView({ name: 'a', skillMd: '---\nname: a\ndescription: d\n---\nx', files: ['SKILL.md', 'scripts/run.py', 'agents/x.md'], license: '' });
    expect(v.scripts).toBe(1);
  });
});
