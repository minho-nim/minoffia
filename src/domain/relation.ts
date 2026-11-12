// 관계 지도(v0.6.71, 소유자 "프로젝트·스킬·MCP가 어떻게 이어졌나, 줄 보기 기본 + 그물 보기"): 규칙만(AI 없음).
// 줄 보기는 큰 묶음에서 시작해 누르면 안으로(분류 → 스킬, 프로젝트 → 스킬·MCP). 모든 프로젝트에 있는 스킬은 '기본 스킬' 한 상자로 접고
// 선은 다른 점만 그린다(소유자 "묶음에서 너무 빽빽"). 그물 보기는 같은 자료를 점과 선으로.
import { SKILL_CATEGORIES, type SkillCategory, type SkillMapData, type SkillView } from './skills';

export interface RelInput {
  skills: SkillView[];
  /** 저장소가 있는 프로젝트(순서대로) */
  projects: { id: string; name: string }[];
  map: SkillMapData;
  /** 프로젝트 id → MCP 이름 */
  mcp: Record<string, string[]>;
}
export type RelKind = 'group' | 'proj' | 'skill' | 'mcp';
export type RelGo = { t: 'cat'; c: SkillCategory } | { t: 'mcp' } | { t: 'proj' } | { t: 'one'; p: string };
export interface RelNode {
  id: string;
  label: string;
  kind: RelKind;
  sub?: string;
  small?: boolean;
  /** 같은 줄에서 묶음이 바뀌는 곳에 점선 */
  group: string;
  go?: RelGo;
  /** 누르면 펼치기/접기(줄 보기 안에서) */
  toggle?: string;
  /** 한 번 누르면 선택, 한 번 더 누르면 들어가기 */
  selFirst?: boolean;
}
/** [from, to, 굵기, 'q' = 누를 때만 보이는 선] */
export type RelEdge = [string, string, number, ('q' | undefined)?];
export interface RelLevel {
  rows: RelNode[][];
  edges: RelEdge[];
  hint: string;
}
export interface RelOpen {
  common: boolean;
  cats: string[];
}

interface Model {
  skill: Map<string, { name: string; title: string; category: SkillCategory; parent: string; related: string[]; mcp: string[] }>;
  has: Map<string, string[]>;
  mcpOf: Map<string, string[]>;
  common: string[];
  projects: { id: string; name: string }[];
}
function model(d: RelInput): Model {
  const skill = new Map<string, { name: string; title: string; category: SkillCategory; parent: string; related: string[]; mcp: string[] }>();
  for (const s of d.skills) skill.set(s.name, { name: s.name, title: s.title, category: s.category, parent: s.parent, related: s.related, mcp: s.mcp });
  // 함께 쓰는 스킬은 양쪽으로(한쪽에만 적어도 서로 이어진다)
  for (const v of [...skill.values()]) for (const r of v.related) { const o = skill.get(r); if (o && !o.related.includes(v.name)) skill.set(r, { ...o, related: [...o.related, v.name] }); }
  const has = new Map<string, string[]>();
  for (const p of d.projects) {
    const names = Object.keys(d.map[p.id] ?? {});
    // 스킬 모음에 없는 스킬(프로젝트에만 있음)도 보여 준다(분류는 기타)
    for (const n of names) if (!skill.has(n)) skill.set(n, { name: n, title: n, category: '기타', parent: '', related: [], mcp: [] });
    has.set(p.id, names);
  }
  const mcpOf = new Map(d.projects.map((p) => [p.id, d.mcp[p.id] ?? []]));
  const common = d.projects.length >= 2 ? [...skill.keys()].filter((n) => d.projects.every((p) => has.get(p.id)!.includes(n))) : [];
  return { skill, has, mcpOf, common, projects: d.projects };
}
const S = (n: string) => `s:${n}`;
const M = (n: string) => `m:${n}`;
const P = (id: string) => `p:${id}`;

/** 줄 보기 한 단계 */
export function relLevel(d: RelInput, here: RelGo | null, kind: 'skill' | 'mcp' | 'both', open: RelOpen): RelLevel {
  const m = model(d);
  const cats = SKILL_CATEGORIES.filter((c) => [...m.skill.values()].some((s) => s.category === c));
  const inCat = (c: string) => [...m.skill.values()].filter((s) => s.category === c);
  const projCount = (n: string) => m.projects.filter((p) => m.has.get(p.id)!.includes(n)).length;
  const allMcp = [...new Set([...m.mcpOf.values()].flat().concat([...m.skill.values()].flatMap((s) => s.mcp)))];

  if (!here) {
    const top: RelNode[] = cats.map((c) => ({ id: `g:${c}`, label: c, sub: `스킬 ${inCat(c).length}`, kind: 'group', group: 's', go: { t: 'cat', c } }));
    const bottom: RelNode[] = [
      ...(allMcp.length ? [{ id: 'g:mcp', label: 'MCP', sub: `${allMcp.length}개`, kind: 'group' as const, group: 'm', go: { t: 'mcp' } as RelGo }] : []),
      { id: 'g:proj', label: '프로젝트', sub: `${m.projects.length}개`, kind: 'group', group: 'p', go: { t: 'proj' } },
    ];
    const edges: RelEdge[] = [];
    for (const c of cats) {
      const names = inCat(c).map((s) => s.name);
      const np = m.projects.filter((p) => m.has.get(p.id)!.some((n) => names.includes(n))).length;
      if (np) edges.push([`g:${c}`, 'g:proj', np]);
      const nm = inCat(c).filter((s) => s.mcp.length).length;
      if (nm && allMcp.length) edges.push([`g:${c}`, 'g:mcp', nm]);
    }
    return { rows: [top, bottom], edges, hint: '묶음을 누르면 그 안으로 들어가요. 선 굵기는 이어진 수예요.' };
  }

  if (here.t === 'cat') {
    const list = inCat(here.c);
    const names = new Set(list.map((s) => s.name));
    const parents = list.filter((s) => !s.parent || !names.has(s.parent));
    const vars = list.filter((s) => s.parent && names.has(s.parent));
    const mcps = [...new Set(list.flatMap((s) => s.mcp))];
    const np = m.projects.filter((p) => m.has.get(p.id)!.some((n) => names.has(n))).length;
    const rows: RelNode[][] = [parents.map((s) => ({ id: S(s.name), label: s.title, sub: `${projCount(s.name)}곳`, kind: 'skill', group: 'a' }))];
    if (vars.length) rows.push(vars.map((s) => ({ id: S(s.name), label: s.title, sub: `${projCount(s.name)}곳`, kind: 'skill', small: true, group: s.parent })));
    rows.push([...mcps.map((x) => ({ id: M(x), label: x, kind: 'mcp' as const, group: 'm' })), { id: 'out:proj', label: `→ 프로젝트 ${np}`, kind: 'group', group: 'p', go: { t: 'proj' } }]);
    const edges: RelEdge[] = [
      ...vars.map((s): RelEdge => [S(s.parent), S(s.name), 1]),
      ...list.flatMap((s) => s.related.filter((r) => names.has(r) && s.name < r).map((r): RelEdge => [S(s.name), S(r), 1])),
      ...list.flatMap((s) => s.mcp.map((x): RelEdge => [S(s.name), M(x), 1])),
      ...list.filter((s) => projCount(s.name)).map((s): RelEdge => [S(s.name), 'out:proj', projCount(s.name)]),
    ];
    return { rows, edges, hint: '위 = 스킬, 가운데 작은 상자 = 갈라져 나온 스킬, 아래 = 쓰는 MCP와 들어간 프로젝트 수. 상자를 누르면 이어진 선만 진하게.' };
  }

  if (here.t === 'mcp') {
    const prj = m.projects.filter((p) => m.mcpOf.get(p.id)!.length);
    return {
      rows: [prj.map((p) => ({ id: P(p.id), label: p.name, kind: 'proj', group: 'p', go: { t: 'one', p: p.id } as RelGo, selFirst: true })), allMcp.map((x) => ({ id: M(x), label: x, kind: 'mcp', group: x }))],
      edges: prj.flatMap((p) => m.mcpOf.get(p.id)!.map((x): RelEdge => [P(p.id), M(x), 1])),
      hint: prj.length ? '위 = 프로젝트, 아래 = MCP(각 저장소 .mcp.json 기준, Claude용 설정).' : '.mcp.json이 있는 프로젝트가 아직 없어요.',
    };
  }

  // 프로젝트 묶음(전체) 또는 한 프로젝트
  const prjs = here.t === 'one' ? m.projects.filter((p) => p.id === here.p) : m.projects;
  const common = m.common;
  const extra = (pid: string) => m.has.get(pid)!.filter((n) => !common.includes(n));
  const top: RelNode[] = [
    ...(here.t === 'proj' && common.length ? [{ id: 'p:all', label: '모든 프로젝트', sub: `${m.projects.length}개`, kind: 'group' as const, group: 'all' }] : []),
    ...prjs.map((p): RelNode => ({ id: P(p.id), label: p.name, kind: 'proj', group: 'p', sub: `스킬 ${m.has.get(p.id)!.length}${m.mcpOf.get(p.id)!.length ? ` · MCP ${m.mcpOf.get(p.id)!.length}` : ''}`, ...(here.t === 'proj' ? { go: { t: 'one', p: p.id } as RelGo, selFirst: true } : {}) })),
  ];
  const bottom: RelNode[] = [];
  const edges: RelEdge[] = [];
  if (kind !== 'mcp') {
    const mine = here.t === 'one' ? common.filter((n) => m.has.get(here.p)!.includes(n)) : common;
    if (mine.length) {
      const to = open.common ? mine.map(S) : ['c:common'];
      if (open.common) mine.forEach((n) => bottom.push({ id: S(n), label: m.skill.get(n)!.title, sub: '모든 곳', kind: 'skill', group: 'common', toggle: 'common' }));
      else bottom.push({ id: 'c:common', label: `기본 스킬 ${mine.length}개`, sub: '누르면 펼침', kind: 'group', group: 'common', toggle: 'common' });
      const from = here.t === 'proj' ? 'p:all' : P(here.p);
      to.forEach((t) => edges.push([from, t, open.common ? 1 : mine.length]));
      if (here.t === 'proj') prjs.forEach((p) => to.forEach((t) => edges.push([P(p.id), t, 1, 'q'])));
    }
    const ex = [...new Set(prjs.flatMap((p) => extra(p.id)))];
    const target = (n: string) => (open.cats.includes(m.skill.get(n)!.category) ? S(n) : `c:${m.skill.get(n)!.category}`);
    for (const c of SKILL_CATEGORIES) {
      const list = ex.filter((n) => m.skill.get(n)!.category === c);
      if (!list.length) continue;
      if (open.cats.includes(c)) list.forEach((n) => bottom.push({ id: S(n), label: m.skill.get(n)!.title, sub: `${projCount(n)}곳`, kind: 'skill', group: c, toggle: `cat:${c}` }));
      else bottom.push({ id: `c:${c}`, label: c, sub: `스킬 ${list.length} · 누르면 펼침`, kind: 'group', group: c, toggle: `cat:${c}` });
    }
    const w = new Map<string, number>();
    prjs.forEach((p) => extra(p.id).forEach((n) => { const k = `${P(p.id)}|${target(n)}`; w.set(k, (w.get(k) ?? 0) + 1); }));
    w.forEach((n, k) => { const [a, b] = k.split('|'); edges.push([a, b, n]); });
  }
  if (kind !== 'skill') {
    const used = [...new Set(prjs.flatMap((p) => m.mcpOf.get(p.id)!))];
    used.forEach((x) => bottom.push({ id: M(x), label: x, kind: 'mcp', group: 'mcp', sub: `${m.projects.filter((p) => m.mcpOf.get(p.id)!.includes(x)).length}곳` }));
    prjs.forEach((p) => m.mcpOf.get(p.id)!.forEach((x) => edges.push([P(p.id), M(x), 1])));
  }
  const rows = [top, bottom];
  if (here.t === 'one' && kind !== 'mcp') {
    // 이 프로젝트 스킬과 이어진 스킬(갈래·함께 쓰는 것) 중 아직 없는 것
    const mineAll = m.has.get(here.p)!;
    const near = [...new Set(mineAll.flatMap((n) => [...m.skill.get(n)!.related, ...[...m.skill.values()].filter((s) => s.parent === n).map((s) => s.name)]))].filter((n) => m.skill.has(n) && !mineAll.includes(n));
    if (near.length) {
      rows.push(near.map((n) => ({ id: S(n), label: m.skill.get(n)!.title, sub: '없음 · 이어진 스킬', kind: 'skill', small: true, group: 'near' })));
      mineAll.forEach((n) => {
        const s = m.skill.get(n)!;
        const visible = bottom.some((b) => b.id === S(n)) ? S(n) : common.includes(n) ? 'c:common' : `c:${s.category}`;
        s.related.filter((r) => near.includes(r)).forEach((r) => edges.push([visible, S(r), 1]));
        [...m.skill.values()].filter((v) => v.parent === n && near.includes(v.name)).forEach((v) => edges.push([visible, S(v.name), 1]));
      });
    }
  }
  return {
    rows,
    edges,
    hint:
      here.t === 'proj'
        ? `모든 프로젝트에 있는 ${common.length}개는 한 상자로, 선은 다른 점만. 프로젝트를 한 번 누르면 그 프로젝트의 선이 다 보이고, 한 번 더 누르면 그 프로젝트만. 묶음 상자를 누르면 펼쳐져요.`
        : '이 프로젝트의 스킬: 기본 스킬은 한 상자, 나머지는 분류별. 상자를 누르면 펼쳐져요.',
  };
}

export type NetType = 'proj' | 'hub' | 'cat' | 'skill' | 'mcp';
export interface NetSpec {
  nodes: { id: string; label: string; type: NetType; desc: string }[];
  links: [string, string][];
}
/** 그물 보기: 프로젝트·기본 스킬 묶음·분류·스킬·MCP를 점으로, 이어진 것을 선으로 */
export function relNet(d: RelInput): NetSpec {
  const m = model(d);
  const nodes: NetSpec['nodes'] = [];
  const links: [string, string][] = [];
  const skills = [...m.skill.values()];
  for (const p of m.projects) nodes.push({ id: P(p.id), label: p.name, type: 'proj', desc: `스킬 ${m.has.get(p.id)!.length}개${m.mcpOf.get(p.id)!.length ? ` · MCP ${m.mcpOf.get(p.id)!.join(', ')}` : ''}` });
  if (m.common.length) nodes.push({ id: 'hub', label: `기본 스킬 ${m.common.length}`, type: 'hub', desc: '모든 프로젝트에 들어 있는 스킬 묶음.' });
  for (const c of SKILL_CATEGORIES) {
    const list = skills.filter((s) => s.category === c);
    if (list.length) nodes.push({ id: `g:${c}`, label: c, type: 'cat', desc: `${c} 스킬 ${list.length}개` });
  }
  for (const s of skills) {
    nodes.push({ id: S(s.name), label: s.title, type: 'skill', desc: s.parent ? `${m.skill.get(s.parent)?.title ?? s.parent}에서 갈라진 스킬` : `${m.projects.filter((p) => m.has.get(p.id)!.includes(s.name)).length}곳에 들어 있음` });
    links.push([`g:${s.category}`, S(s.name)]);
    if (s.parent && m.skill.has(s.parent)) links.push([S(s.parent), S(s.name)]);
    s.related.filter((r) => m.skill.has(r) && s.name < r).forEach((r) => links.push([S(s.name), S(r)]));
    s.mcp.forEach((x) => links.push([S(s.name), M(x)]));
  }
  const mcps = [...new Set([...m.mcpOf.values()].flat().concat(skills.flatMap((s) => s.mcp)))];
  mcps.forEach((x) => nodes.push({ id: M(x), label: x, type: 'mcp', desc: `MCP · ${m.projects.filter((p) => m.mcpOf.get(p.id)!.includes(x)).length}곳` }));
  m.common.forEach((n) => links.push(['hub', S(n)]));
  for (const p of m.projects) {
    if (m.common.length) links.push([P(p.id), 'hub']);
    m.has.get(p.id)!.filter((n) => !m.common.includes(n)).forEach((n) => links.push([P(p.id), S(n)]));
    m.mcpOf.get(p.id)!.forEach((x) => links.push([P(p.id), M(x)]));
  }
  return { nodes, links };
}
