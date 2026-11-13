// 옵시디언 지난 기록 모으기(v0.6.90, 소유자 "깃허브 모두 다 긁어서 올려줘"): GitHub Actions(notes-backfill.yml)가 부른다. AI 없음.
// 프로젝트 저장소마다 버전 기록(CHANGELOG 제목, 없으면 package.json 버전이 바뀐 커밋, 그것도 없으면 날짜별 커밋)과
// 들어 있는 스킬을 읽고, 스킬 모음의 SKILL.md 설명을 읽어 JSON 하나로 낸다. 노트는 notes-sync.mjs backfill이 만든다.
// 사용: node scripts/notes-history.mjs <projects.json> <스킬 모음 폴더> <out.json>
//   projects.json = [{ "name": "미노피아", "dir": "/tmp/repos/0" }]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VER = /^\d+\.\d+\.\d+[\w.-]*$/;
const SKILL = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** 날짜별로 묶을 때 최근 며칠까지(버전 번호가 없는 저장소) */
export const MAX_DAYS = 120;

/** CHANGELOG의 '## 제목(v1.2.3) — 2026-11-13' · '## 1.2.3 — 날짜' · '## v1.2.3 제목' */
export function parseChangelog(text) {
  const out = [];
  const lines = String(text ?? '').split('\n');
  for (const [i, line] of lines.entries()) {
    if (!line.startsWith('## ')) continue;
    const h = line.slice(3).trim();
    const v = h.match(/v?(\d+\.\d+\.\d+[\w.-]*)/);
    if (!v) continue;
    const date = (h.match(/(\d{4}-\d{2}-\d{2})/) ?? [])[1] ?? '';
    const task = h
      .replace(/\(?v?\d+\.\d+\.\d+[\w.-]*\)?/, '')
      .replace(/\d{4}-\d{2}-\d{2}/, '')
      .replace(/[—–]\s*$/, '')
      .replace(/^\s*[—–:-]\s*/, '')
      .replace(/\s*[—–-]\s*$/, '')
      .trim();
    // 제목이 버전뿐이면 아래 첫 항목을 제목으로
    const first = lines.slice(i + 1, i + 15).find((l) => /^\s*[-*]\s+\S/.test(l)) ?? '';
    const bullet = first.replace(/^\s*[-*]\s+/, '').replace(/\*\*|`/g, '').split(/[:：。]|\.\s/)[0].trim().slice(0, 80);
    out.push({ version: v[1].replace(/\.$/, ''), date, task: task || bullet || `버전 ${v[1]}` });
  }
  // 같은 버전이 두 번 나오면 처음(가장 최근) 것만
  return out.filter((e, i) => out.findIndex((x) => x.version === e.version) === i);
}

/** 커밋 작성자·본문으로 만든 AI */
export function agentOfCommit(author, body) {
  const t = `${author}\n${body}`.toLowerCase();
  // Claude 표시를 먼저(v0.6.98: 제목에 'Codex'라는 글자만 있어도 Codex로 보던 것)
  if (/co-authored-by:\s*claude|claude-session:|claude\.ai\/code|generated with \[claude code\]|claude\[bot\]|noreply@anthropic\.com/.test(t) || /^claude\b/.test(author.toLowerCase())) return 'Claude';
  if (/chatgpt-codex|codex\[bot\]|\bcodex\//.test(t) || /codex|chatgpt/.test(author.toLowerCase())) return 'Codex';
  if (/gemini\[bot\]|gemini-dev/.test(t) || /gemini/.test(author.toLowerCase())) return 'Gemini';
  // Claude 대화로 하지 않은 것은 모두 Codex(소유자 2026-11-13)
  return 'Codex';
}

/** 커밋 본문의 '쓴 스킬:' 줄과 '<스킬> 절차로' */
export function skillsOfCommit(body) {
  const out = new Set();
  for (const m of String(body ?? '').matchAll(/^(?:쓴 스킬|스킬 확인)\s*[:：]\s*(.+)$/gm)) for (const n of m[1].split(/[,，、\s]+/)) { const k = n.trim().replace(/[`'".]/g, '').toLowerCase(); if (SKILL.test(k)) out.add(k); }
  for (const m of String(body ?? '').matchAll(/\b([a-z0-9]+(?:-[a-z0-9]+)+)\s*(?:절차|스킬)\s*(?:로|대로|을 따라|를 따라)/g)) out.add(m[1]);
  return [...out];
}

/** 기록을 바로잡을 커밋(소유자 "실제 내용만"): v0.6.98 커밋의 '쓴 MCP: supabase'는 형식 시험이라 실제로 쓰지 않았다 */
export const NOT_REAL_MCP = new Set(['b4634c3640c8c538134404c4fc5c9810c32fde13']);
/** 커밋 본문의 '쓴 MCP:' 줄(v0.6.98) */
export function mcpOfCommit(body, sha = '') {
  if (NOT_REAL_MCP.has(sha)) return [];
  const out = new Set();
  for (const m of String(body ?? '').matchAll(/^쓴 MCP\s*[:：]\s*(.+)$/gim)) for (const n of m[1].split(/[,，、\s]+/)) { const k = n.trim().replace(/[`'".]/g, '').toLowerCase(); if (/^[a-z0-9][a-z0-9_-]{0,40}$/.test(k)) out.add(k); }
  return [...out];
}

/** SKILL.md 앞머리에서 이름·설명·분류·함께 쓰는 스킬 */
export function parseSkill(text) {
  const fm = (String(text ?? '').match(/^---\n([\s\S]*?)\n---/) ?? [])[1] ?? '';
  const get = (k) => ((fm.match(new RegExp(`^\\s*${k}:\\s*(.*)$`, 'm')) ?? [])[1] ?? '').trim().replace(/^["']|["']$/g, '');
  const description = get('description');
  return {
    name: get('name'),
    title: description.split(/[.。]/)[0].trim(),
    description,
    category: get('minoffia-category') || '기타',
    related: get('minoffia-related').split(',').map((s) => s.trim()).filter((s) => SKILL.test(s)),
  };
}

const git = (dir, args) => {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return '';
  }
};
/** 커밋 목록(오래된 것부터): [{ sha, date, author, subject, body }] */
function commits(dir, file) {
  const raw = git(dir, ['log', '--reverse', '--date=short', '--format=%H%x1f%ad%x1f%an <%ae>%x1f%s%x1f%B%x1e', ...(file ? ['--', file] : [])]);
  return raw.split('\x1e').map((r) => r.trim()).filter(Boolean).map((r) => {
    const [sha, date, author, subject, body] = r.split('\x1f');
    return { sha, date, author, subject, body: body ?? '' };
  });
}

/** 저장소 하나의 버전 기록 */
export function projectVersions(dir) {
  // 1) package.json 버전이 바뀐 커밋
  const bumps = [];
  let prev = '';
  for (const c of commits(dir, 'package.json')) {
    let v = '';
    try { v = JSON.parse(git(dir, ['show', `${c.sha}:package.json`]) || '{}').version ?? ''; } catch { v = ''; }
    if (VER.test(v) && v !== prev) bumps.push({ ...c, version: v });
    if (VER.test(v)) prev = v;
  }
  const byVer = new Map(bumps.map((b) => [b.version, b]));
  // 2) CHANGELOG 제목이 있으면 그 제목을, 커밋에서 날짜·만든 AI·쓴 스킬을
  const cl = ['CHANGELOG.md', 'changelog.md', 'docs/CHANGELOG.md'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  const log = cl ? parseChangelog(fs.readFileSync(cl, 'utf8')) : [];
  if (log.length >= 3) {
    return log.reverse().map((e) => {
      const b = byVer.get(e.version);
      return { version: e.version, date: e.date || b?.date || '', task: e.task, agent: b ? agentOfCommit(b.author, b.body) : 'Codex', skills: b ? skillsOfCommit(b.body) : [], mcp: b ? mcpOfCommit(b.body, b.sha) : [] };
    });
  }
  // 버전을 거의 안 올린 저장소(3번 미만)는 날짜별 커밋이 더 자세하다
  if (bumps.length >= 3) return bumps.map((b) => ({ version: b.version, date: b.date, task: b.subject.slice(0, 120), agent: agentOfCommit(b.author, b.body), skills: skillsOfCommit(b.body), mcp: mcpOfCommit(b.body, b.sha) }));
  // 3) 버전 번호가 없거나 거의 안 바뀌면 커밋을 날짜별로(최근 MAX_DAYS일)
  const days = new Map();
  for (const c of commits(dir)) days.set(c.date, [...(days.get(c.date) ?? []), c]);
  return [...days].slice(-MAX_DAYS).map(([date, list]) => {
    const agents = [...new Set(list.map((c) => agentOfCommit(c.author, c.body)))];
    return {
      version: '',
      date,
      task: `${list[list.length - 1].subject.slice(0, 100)}${list.length > 1 ? ` 외 ${list.length - 1}개` : ''}`,
      agent: agents.includes('Claude') ? 'Claude' : agents[0] ?? 'Codex',
      skills: [...new Set(list.flatMap((c) => skillsOfCommit(c.body)))],
      mcp: [...new Set(list.flatMap((c) => mcpOfCommit(c.body, c.sha)))],
    };
  });
}

/** 저장소에 들어 있는 스킬(.agents/skills·.claude/skills) */
export function installedSkills(dir) {
  const names = new Set();
  for (const d of ['.agents/skills', '.claude/skills']) {
    const p = path.join(dir, d);
    if (fs.existsSync(p)) for (const e of fs.readdirSync(p, { withFileTypes: true })) if (e.isDirectory() && SKILL.test(e.name)) names.add(e.name);
  }
  return [...names].sort();
}

/** 저장소 파일 목록(점검과 같은 제외 규칙, 3000개까지) — 앱 지도의 폴더 구조용 */
export function repoFiles(dir) {
  return git(dir, ['ls-files']).split('\n').filter((f) => f && !/(^|\/)(node_modules|dist|build|vendor|\.git|coverage|\.next|\.turbo|\.cache)\//.test(f)).slice(0, 3000);
}

function main([projectsFile, skillsDir, outFile]) {
  const projects = JSON.parse(fs.readFileSync(projectsFile, 'utf8'));
  const skills = [];
  for (const d of ['.claude/skills', '.agents/skills']) {
    const p = path.join(skillsDir, d);
    if (!fs.existsSync(p)) continue;
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const f = path.join(p, e.name, 'SKILL.md');
      if (e.isDirectory() && fs.existsSync(f) && !skills.some((s) => s.name === e.name)) skills.push({ ...parseSkill(fs.readFileSync(f, 'utf8')), name: e.name });
    }
  }
  const out = {
    projects: projects.filter((p) => fs.existsSync(p.dir)).map((p) => ({ name: p.name, versions: projectVersions(p.dir), skills: installedSkills(p.dir), files: repoFiles(p.dir) })),
    skills,
  };
  fs.writeFileSync(outFile, JSON.stringify(out));
  for (const p of out.projects) console.log(`${p.name}: 버전 ${p.versions.length}개 · 스킬 ${p.skills.length}개`);
  console.log(`스킬 설명 ${skills.length}개`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main(process.argv.slice(2));
