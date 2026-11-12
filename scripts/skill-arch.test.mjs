import { describe, expect, it } from 'vitest';
import { readSkill, skillAppMap, skillArchitecture } from './skill-arch.mjs';

const md = (head, body = '') => `---\n${head}\n---\n\n${body}`;

describe('스킬 모음 지도(v0.6.70)', () => {
  it('앞머리 분류·한글 제목을 쓰고, 도구 스킬은 분류가 없어도 도구', () => {
    const a = readSkill(md('name: fix-bugs\ndescription: 버그 고치기. 시험이 깨질 때 쓴다.\nmetadata:\n  minoffia-category: 시험·점검', '# 버그 고치기\n'), 'fix-bugs');
    expect(a).toMatchObject({ name: 'fix-bugs', title: '버그 고치기', category: '시험·점검' });
    expect(readSkill(md('name: find-skills\ndescription: 스킬 찾기.'), 'find-skills').category).toBe('도구');
    expect(readSkill(md('name: x\ndescription: 뭔가 한다.\nmetadata:\n  minoffia-category: 없는분류'), 'x').category).toBe('기타');
  });
  it('자세한 지도는 분류 → 스킬, 간략 지도는 같은 분류·이름', () => {
    const skills = [
      { name: 'a', title: '가', description: '설명', category: '보안', folder: '.claude/skills/a', files: ['.claude/skills/a/SKILL.md', '.claude/skills/a/LICENSE'] },
      { name: 'b', title: '나', description: '설명2', category: '보안', folder: '.claude/skills/b', files: [] },
    ];
    const arch = skillArchitecture(skills, '스킬');
    const cat = arch.nodes.find((n) => n.label === '보안');
    expect(arch.nodes.filter((n) => n.parent === cat.id).map((n) => n.label)).toEqual(['가', '나']);
    expect(arch.ignore).toContain('.agents/**');
    const map = skillAppMap(skills);
    expect(map.by).toBe('skill');
    expect(map.parts[0]).toMatchObject({ name: '가', kind: '보안', files: ['.claude/skills/a/SKILL.md'] });
  });
});
