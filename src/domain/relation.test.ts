import { describe, expect, it } from 'vitest';
import { relLevel, relNet, type RelInput } from './relation';
import { toSkillView } from './skills';

const md = (name: string, cat: string, extra = '') => `---\nname: ${name}\ndescription: ${name} 설명\nmetadata:\n  minoffia-category: ${cat}\n${extra}---\n\n# ${name} 한글\n`;
const skills = [
  toSkillView({ name: 'a', skillMd: md('a', '보안'), files: ['SKILL.md'], license: '' }),
  toSkillView({ name: 'b', skillMd: md('b', '보안', '  minoffia-related: a\n  minoffia-mcp: supabase\n'), files: ['SKILL.md'], license: '' }),
  toSkillView({ name: 'a2', skillMd: md('a2', '보안', '  minoffia-parent: a\n'), files: ['SKILL.md'], license: '' }),
  toSkillView({ name: 'ui', skillMd: md('ui', '화면·디자인'), files: ['SKILL.md'], license: '' }),
];
const d: RelInput = {
  skills,
  projects: [{ id: '1', name: '하나' }, { id: '2', name: '둘' }, { id: '3', name: '셋' }],
  map: { '1': { a: 'same', ui: 'same' }, '2': { a: 'same' }, '3': { a: 'old', b: 'same' } },
  mcp: { '1': ['context7'] },
};
const open = { common: false, cats: [] };

describe('관계 지도(v0.6.71)', () => {
  it('앞머리에서 함께 쓰는 스킬·갈래·MCP를 읽는다', () => {
    expect(skills[1]).toMatchObject({ related: ['a'], mcp: ['supabase'], parent: '' });
    expect(skills[2].parent).toBe('a');
  });
  it('처음은 큰 묶음만: 분류·MCP·프로젝트', () => {
    const l = relLevel(d, null, 'skill', open);
    expect(l.rows[0].map((n) => n.label)).toEqual(['화면·디자인', '보안']);
    expect(l.rows[1].map((n) => n.label)).toEqual(['MCP', '프로젝트']);
    expect(l.edges).toContainEqual(['g:보안', 'g:proj', 3]);
  });
  it('프로젝트 묶음: 모든 곳에 있는 스킬은 한 상자, 선은 다른 점만(나머지는 누를 때만)', () => {
    const l = relLevel(d, { t: 'proj' }, 'skill', open);
    expect(l.rows[1].map((n) => n.id)).toEqual(['c:common', 'c:화면·디자인', 'c:보안']);
    const shown = l.edges.filter((e) => e[3] !== 'q');
    expect(shown).toEqual(expect.arrayContaining([['p:all', 'c:common', 1], ['p:1', 'c:화면·디자인', 1], ['p:3', 'c:보안', 1]]));
    expect(shown).toHaveLength(3);
    // 분류를 펼치면 스킬 하나하나
    const o = relLevel(d, { t: 'proj' }, 'skill', { common: false, cats: ['보안'] });
    expect(o.rows[1].map((n) => n.id)).toContain('s:b');
  });
  it('한 프로젝트: 이어진 스킬(갈래·함께 쓰는 것) 중 아직 없는 것을 세 번째 줄에', () => {
    const l = relLevel(d, { t: 'one', p: '2' }, 'skill', open);
    expect(l.rows[2].map((n) => n.id).sort()).toEqual(['s:a2', 's:b']);
  });
  it('MCP는 이름만, 프로젝트와 잇는다', () => {
    const l = relLevel(d, { t: 'mcp' }, 'both', open);
    expect(l.edges).toEqual([['p:1', 'm:context7', 1]]);
  });
  it('그물 보기: 기본 스킬 묶음 점 하나와 다른 점만 선', () => {
    const n = relNet(d);
    expect(n.nodes.find((x) => x.id === 'hub')?.label).toBe('기본 스킬 1');
    expect(n.links).toContainEqual(['p:3', 's:b']);
    expect(n.links).not.toContainEqual(['p:1', 's:a']);
  });
});
