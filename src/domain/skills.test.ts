import { describe, expect, it } from 'vitest';
import { parseSkillMd, skillCategory, skillRequest, skillRisks, skillSource, skillUsage, toSkillView, usedSkills } from './skills';

describe('저장소 스킬 보기(v0.6.55)', () => {
  it('앞머리에서 이름·설명, 나머지는 본문', () => {
    const p = parseSkillMd('---\nname: find-skills\ndescription: "Helps users discover skills"\n---\n\n# Find Skills\n\n본문');
    expect(p.title).toBe('find-skills');
    expect(p.description).toBe('Helps users discover skills');
    expect(p.body.startsWith('# Find Skills')).toBe(true);
  });
  it('한글 제목이 있으면 그걸 이름으로(v0.6.56)', () => {
    expect(parseSkillMd('---\nname: find-skills\ndescription: 스킬 찾기\n---\n\n# 스킬 찾기\n\n본문').title).toBe('스킬 찾기');
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
    expect(skillSource('원문은 anthropics/skills `skills/skill-creator`', 'Apache License')).toEqual({ license: 'Apache-2.0', source: 'anthropics/skills' });
    expect(skillSource('', '')).toEqual({ license: '없음(직접 만듦)', source: '직접 만듦' });
  });
  it('스크립트 수를 센다', () => {
    const v = toSkillView({ name: 'a', skillMd: '---\nname: a\ndescription: d\n---\nx', files: ['SKILL.md', 'scripts/run.py', 'agents/x.md'], license: '' });
    expect(v.scripts).toBe(1);
  });
});

describe('스킬 입력 창(v0.6.57)', () => {
  it('만들기: 쓴 칸만 짧게, 지킬 것 한 줄', () => {
    const t = skillRequest({ kind: 'make', what: '배포 순서  자동', when: '', rules: 'PR\n\n병합' });
    expect(t.split('\n').slice(0, 3)).toEqual([
      '@Claude 스킬 만들기: 배포 순서 자동',
      '지킬 것: PR / 병합',
      '(skill-creator 방식으로 .claude/skills/<짧은-영어-이름>/SKILL.md · 제목·설명·본문은 쉬운 한국어 · 다른 파일 고치지 않기)',
    ]);
    expect(t).toContain('본문 100줄 이내');
  });
  it('찾기: 분야는 정해진 것만', () => {
    const t = skillRequest({ kind: 'find', what: '접근성 검사', areas: ['디자인', '이상한 것'] });
    expect(t.split('\n')[1]).toBe('분야: 디자인');
    expect(t).toContain('-g/-y 금지');
  });
});

describe('쓴 스킬 읽기(v0.6.59)', () => {
  it('요약 끝 한 줄에서 이름만', () => {
    expect(usedSkills('바꿨어요\n쓴 스킬: deploy-steps, `report-format`')).toEqual(['deploy-steps', 'report-format']);
    expect(usedSkills('스킬 확인: report-format')).toEqual(['report-format']);
    expect(usedSkills('쓴 스킬: 없음')).toEqual([]);
    expect(usedSkills('그냥 요약')).toEqual([]);
  });
  it('스킬별 쓰인 업무 수(같은 업무는 한 번)', () => {
    const u = skillUsage([
      { taskId: 't1', summary: '쓴 스킬: a' },
      { taskId: 't1', summary: '쓴 스킬: a' },
      { taskId: 't2', summary: '쓴 스킬: a, b' },
    ]);
    expect(u.get('a')).toBe(2);
    expect(u.get('b')).toBe(1);
  });
});

describe('기본 스킬(v0.6.60)', () => {
  it('앞머리 metadata의 minoffia-default로', () => {
    expect(parseSkillMd('---\nname: a\ndescription: d\nmetadata:\n  minoffia-default: "true"\n---\n# 가').isDefault).toBe(true);
    expect(parseSkillMd('---\nname: a\ndescription: d\n---\n# 가').isDefault).toBe(false);
  });
  it('만들기 요청에 기본 표시 줄', () => {
    expect(skillRequest({ kind: 'make', what: '배포', isDefault: true })).toContain('minoffia-default');
  });
});

describe('스킬 지도 분류(v0.6.61)', () => {
  it('앞머리 분류가 먼저, 없으면 낱말, 도구 스킬은 도구', () => {
    expect(skillCategory({ meta: false, category: '문서', title: '배포', description: '' })).toBe('문서');
    expect(skillCategory({ meta: false, category: '', title: '배포 순서', description: '' })).toBe('배포');
    expect(skillCategory({ meta: false, category: '', title: '작업 보고 형식', description: '결과를 보고할 때' })).toBe('문서');
    expect(skillCategory({ meta: true, category: '', title: '스킬 찾기', description: '' })).toBe('도구');
    expect(skillCategory({ meta: false, category: '없는 분류', title: '아무거나', description: '' })).toBe('기타');
  });
  it('앞머리 minoffia-category를 읽는다', () => {
    expect(parseSkillMd('---\nname: a\ndescription: d\nmetadata:\n  minoffia-category: 시험·점검\n---\n# 가').category).toBe('시험·점검');
  });
});
