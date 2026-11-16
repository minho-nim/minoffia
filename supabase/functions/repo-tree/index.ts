// 구조도(v0.5.24, 소유자 "기본으로 내 구조도가 보이게"): 프로젝트 저장소의 파일 경로 목록만 돌려준다(내용은 읽지 않음, 모델 호출 없음).
// 소유자만, RLS를 거쳐 내 프로젝트의 저장소만. 토큰은 secret GITHUB_REPO_TOKEN에만.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const MAX_PATHS = 3000;
const SKIP = /(^|\/)(node_modules|dist|build|vendor|\.git|coverage|\.next|\.turbo|\.cache)\//;

/** GitHub Pages 기본 주소: owner.github.io/repo/ (저장소 이름이 owner.github.io면 그 주소 그대로) */
function demoUrl(repo: string): string {
  const [owner, name] = repo.split('/');
  const host = `${owner.toLowerCase()}.github.io`;
  return name.toLowerCase() === host ? `https://${host}/` : `https://${host}/${name}/`;
}

const env = (key: string) => (Deno.env.get(key) ?? '').trim();
const cors = {
  'Access-Control-Allow-Origin': env('OFFICE_ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST만 받습니다.' });
  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  const token = env('GITHUB_REPO_TOKEN');
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });
  if (!token) return reply(503, { ok: false, error: '저장소를 읽을 토큰(GITHUB_REPO_TOKEN)이 없습니다.' });

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });

  let body: { projectId?: string; action?: string; projectIds?: string[]; skill?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  // 스킬 목록(v0.6.55, 소유자 "minoffia에서 스킬을 간단히 보게"): 이 저장소 main의 .claude/skills/*/SKILL.md를 그대로 읽는다.
  // AI 호출 없음(GitHub 읽기만). 스킬마다 파일 목록과 라이선스 첫 줄도 함께. 크기는 스킬당 60KB, 최대 40개.
  // 스킬 모음 저장소(v0.6.65): 기본은 minho-nim/minoffia-skills(스킬 원본), SKILLS_REPO로 바꿀 수 있다. 어느 폴더든 <이름>/SKILL.md를 스킬로 본다.
  const skillsRepo = env('SKILLS_REPO') || 'minho-nim/minoffia-skills';
  const gh = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'minlab-ai-office' };
  const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
  // 프로젝트에 넣지 않는 도구용 스킬(스킬을 만들고 찾는 데만 쓰는 것)
  const META_SKILLS = ['find-skills', 'skill-creator'];
  const skillBlob = async (repo: string, path: string): Promise<string> => {
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, { headers: gh, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!r || !r.ok) return '';
    return String(((await r.json()) as { sha?: string }).sha ?? '');
  };
  const sourceSkillPath = async (name: string): Promise<string> => {
    const res = await fetch(`https://api.github.com/repos/${skillsRepo}/git/trees/HEAD?recursive=1`, { headers: gh, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return '';
    const data = (await res.json()) as { tree?: { path: string; type: string }[] };
    return (data.tree ?? []).find((t) => t.type === 'blob' && (t.path === `${name}/SKILL.md` || t.path.endsWith(`/${name}/SKILL.md`)))?.path ?? '';
  };
  // 프로젝트마다 이 스킬이 들어 있는지(.agents/skills, 없으면 .claude/skills): same = 모음과 같음, old = 다름(옛 버전), none = 없음
  if (body.action === 'skillStatus') {
    const name = String(body.skill ?? '');
    if (!SKILL_NAME.test(name)) return reply(400, { ok: false, error: '스킬 이름이 이상합니다.' });
    const src = await sourceSkillPath(name);
    if (!src) return reply(404, { ok: false, error: '스킬 모음에서 그 스킬을 찾지 못했어요.' });
    const srcSha = await skillBlob(skillsRepo, src);
    const { data: rows } = await userClient.from('projects').select('id, repo').not('repo', 'is', null);
    const status: Record<string, 'same' | 'old' | 'none'> = {};
    await Promise.all(
      (rows ?? []).map(async (r: { id: string; repo: string | null }) => {
        const repo = (r.repo ?? '').trim();
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || repo.toLowerCase() === 'minho-nim/minlab') return;
        // .claude/skills에만 둔 저장소도 '있음'으로(v0.6.92, 스킬 지도와 같게)
        const sha = (await skillBlob(repo, `.agents/skills/${name}/SKILL.md`)) || (await skillBlob(repo, `.claude/skills/${name}/SKILL.md`));
        status[r.id] = !sha ? 'none' : sha === srcSha ? 'same' : 'old';
      }),
    );
    return reply(200, { ok: true, status, meta: META_SKILLS.includes(name) });
  }
  // 스킬 그림 지도(v0.6.62): 프로젝트마다 .agents/skills 폴더 목록을 한 번씩 읽어(저장소당 GitHub 1번) 스킬 폴더의 tree sha를
  // 스킬 모음의 같은 폴더 sha와 견준다. same = 같음, old = 다름(옛 버전), extra = 모음에 없음. 없는 스킬은 빠진다. AI 호출 없음.
  if (body.action === 'skillMap') {
    const res = await fetch(`https://api.github.com/repos/${skillsRepo}/git/trees/HEAD?recursive=1`, { headers: gh, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return reply(502, { ok: false, error: `GitHub 응답 ${res.status}` });
    const tree = ((await res.json()) as { tree?: { path: string; type: string; sha: string }[] }).tree ?? [];
    const dirSha = new Map<string, string>();
    for (const t of tree) {
      const m = t.type === 'blob' ? t.path.match(/^(?:(.*)\/)?([\w.-]+)\/SKILL\.md$/) : null;
      if (!m || !SKILL_NAME.test(m[2]) || dirSha.has(m[2])) continue;
      const dir = (m[1] ? `${m[1]}/` : '') + m[2];
      const d = tree.find((x) => x.type === 'tree' && x.path === dir);
      if (d) dirSha.set(m[2], d.sha);
    }
    const { data: rows } = await userClient.from('projects').select('id, repo').not('repo', 'is', null);
    const map: Record<string, Record<string, 'same' | 'old' | 'extra'>> = {};
    await Promise.all(
      (rows ?? []).map(async (r: { id: string; repo: string | null }) => {
        const repo = (r.repo ?? '').trim();
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || repo.toLowerCase() === 'minho-nim/minlab') return;
        // .agents/skills(Codex)와 .claude/skills(Claude) 둘 다 읽는다(v0.6.88: 미노피아·스킬 모음처럼 .claude/skills에만 둔 저장소가 floorplan 하나로 보이던 것). 같은 이름은 .agents 것 먼저
        const dirList = async (dir: string) => {
          const list = await fetch(`https://api.github.com/repos/${repo}/contents/${dir}`, { headers: gh, signal: AbortSignal.timeout(10_000) }).catch(() => null);
          const j = list && list.ok ? ((await list.json()) as { name?: string; type?: string; sha?: string }[]) : [];
          return Array.isArray(j) ? j : [];
        };
        const [a, c] = await Promise.all([dirList('.agents/skills'), dirList('.claude/skills')]);
        const entries = [...a, ...c.filter((e) => !a.some((x) => x.name === e.name))];
        const got: Record<string, 'same' | 'old' | 'extra'> = {};
        for (const e of entries) {
          if (e.type !== 'dir' || !e.name || !SKILL_NAME.test(e.name)) continue;
          // extra = 프로젝트에만 있고 스킬 모음에는 없는 스킬(직접 넣은 것)
          got[e.name] = !dirSha.has(e.name) ? 'extra' : dirSha.get(e.name) === e.sha ? 'same' : 'old';
        }
        map[r.id] = got;
      }),
    );
    // 앱이 켤 때 바로 읽게 저장(v0.6.70). 소유자 권한(RLS)으로 내 행만. 저장 실패는 응답에 영향 없음
    await userClient.from('skill_cache').upsert({ owner_id: user.id, map, updated_at: new Date().toISOString() }).then(() => null, () => null);
    return reply(200, { ok: true, map });
  }
  // 프로젝트마다 쓰는 MCP(v0.6.71 관계 지도): 저장소 맨 위 .mcp.json(Claude Code 표준)의 mcpServers 이름만 읽는다.
  // 명령·주소·env 같은 값은 비밀이 들어 있을 수 있어 버리고 이름만 돌려준다. 없으면 빈 목록.
  if (body.action === 'mcpMap') {
    const { data: rows } = await userClient.from('projects').select('id, repo').not('repo', 'is', null);
    const mcp: Record<string, string[]> = {};
    await Promise.all(
      (rows ?? []).map(async (r: { id: string; repo: string | null }) => {
        const repo = (r.repo ?? '').trim();
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || repo.toLowerCase() === 'minho-nim/minlab') return;
        const res = await fetch(`https://api.github.com/repos/${repo}/contents/.mcp.json`, { headers: { ...gh, Accept: 'application/vnd.github.raw' }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
        if (!res || !res.ok) return void (mcp[r.id] = []);
        try {
          const servers = ((await res.json()) as { mcpServers?: Record<string, unknown> }).mcpServers ?? {};
          mcp[r.id] = Object.keys(servers).map((k) => k.toLowerCase()).filter((k) => /^[a-z0-9][a-z0-9_.-]{0,40}$/.test(k)).slice(0, 20);
        } catch {
          mcp[r.id] = [];
        }
      }),
    );
    await userClient.from('skill_cache').upsert({ owner_id: user.id, mcp, updated_at: new Date().toISOString() }).then(() => null, () => null);
    return reply(200, { ok: true, mcp });
  }
  // 프로젝트에 넣기: 고른 프로젝트마다 Actions '스킬 넣기'(skill-sync.yml)를 한 번씩 시작한다. 버튼을 누른 것이 소유자 승인이다
  if (body.action === 'skillInstall') {
    // 여러 스킬을 쉼표로(v0.6.64): 프로젝트마다 Actions 한 번·PR 하나로 넣는다
    const names = [...new Set(String(body.skill ?? '').split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 10);
    if (!names.length || !names.every((n) => SKILL_NAME.test(n))) return reply(400, { ok: false, error: '스킬 이름이 이상합니다.' });
    const name = names.join(',');
    const mode = body.mode === 'remove' ? 'remove' : 'add';
    if (names.some((n) => META_SKILLS.includes(n)) && mode === 'add') return reply(409, { ok: false, error: '스킬을 만들고 찾는 도구 스킬은 미노피아에만 둬요.' });
    const actionsToken = env('GITHUB_ACTIONS_TOKEN');
    if (!actionsToken) return reply(503, { ok: false, error: 'Actions를 시작할 토큰(GITHUB_ACTIONS_TOKEN)이 없습니다.' });
    if (mode === 'add') for (const n of names) if (!(await sourceSkillPath(n))) return reply(404, { ok: false, error: `스킬 모음에서 ${n}을 찾지 못했어요.` });
    const ids = (Array.isArray(body.projectIds) ? body.projectIds : []).filter((x) => typeof x === 'string').slice(0, 12);
    const { data: rows } = await userClient.from('projects').select('id, repo').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    const officeRepo = env('OFFICE_REPO') || 'minho-nim/minoffia';
    const started: string[] = [];
    const failed: string[] = [];
    for (const r of (rows ?? []) as { id: string; repo: string | null }[]) {
      const repo = (r.repo ?? '').trim();
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || repo.toLowerCase() === 'minho-nim/minlab') continue;
      const res = await fetch(`https://api.github.com/repos/${officeRepo}/actions/workflows/skill-sync.yml/dispatches`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${actionsToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'minoffia', 'Content-Type': 'application/json' },
        // 넣을 때는 미노피아 작업 규칙 칸도 같이 맞춘다(v0.6.82, 같은 PR 하나, 이미 같으면 바뀌는 것 없음)
        body: JSON.stringify({ ref: 'main', inputs: { repo, skill: name, source: skillsRepo, mode, rules: mode === 'add' ? 'true' : 'false' } }),
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null);
      (res && res.ok ? started : failed).push(repo);
    }
    return reply(200, { ok: true, started, failed });
  }
  // 모든 프로젝트 스킬 최신으로(2026-11-16 소유자 "매번 한 번씩 돌아야 돼?"): Actions '모든 프로젝트 스킬 최신으로'를 한 번 시작한다.
  // 저장소 있는 내 프로젝트 전부(MinLab·스킬 원본 저장소 제외). 각 저장소에 이미 있는 스킬 중 원본과 다른 것만 맞춘다. 버튼을 누른 것이 소유자 승인이다
  if (body.action === 'skillRefresh' || body.action === 'uiCheckInstall') {
    const actionsToken = env('GITHUB_ACTIONS_TOKEN');
    if (!actionsToken) return reply(503, { ok: false, error: 'Actions를 시작할 토큰(GITHUB_ACTIONS_TOKEN)이 없습니다.' });
    const ids = (Array.isArray(body.projectIds) ? body.projectIds : []).filter((x) => typeof x === 'string').slice(0, 30);
    let q = userClient.from('projects').select('id, repo').not('repo', 'is', null);
    if (body.action === 'uiCheckInstall') q = q.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    const { data: rows } = await q;
    const repos = [...new Set(((rows ?? []) as { repo: string | null }[]).map((r) => (r.repo ?? '').trim()).filter((r) => /^[\w.-]+\/[\w.-]+$/.test(r) && r.toLowerCase() !== 'minho-nim/minlab' && r.toLowerCase() !== skillsRepo.toLowerCase()))];
    if (!repos.length) return reply(409, { ok: false, error: '저장소가 연결된 프로젝트가 없어요.' });
    const officeRepo = env('OFFICE_REPO') || 'minho-nim/minoffia';
    const workflow = body.action === 'skillRefresh' ? 'skills-refresh.yml' : 'ui-check-sync.yml';
    const inputs = body.action === 'skillRefresh' ? { repos: repos.join(','), source: skillsRepo } : { repos: repos.join(',') };
    const res = await fetch(`https://api.github.com/repos/${officeRepo}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${actionsToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'minoffia', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main', inputs }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!res || !res.ok) return reply(502, { ok: false, error: `Actions를 시작하지 못했어요(${res?.status ?? '연결 실패'}).` });
    return reply(200, { ok: true, repos });
  }
  // UI 코드 검사가 들어 있는지(2026-11-16): 프로젝트 저장소에 .github/workflows/ui-check.yml이 있는지만 본다(읽기 전용 토큰)
  if (body.action === 'uiCheckStatus') {
    const { data: rows } = await userClient.from('projects').select('id, repo').not('repo', 'is', null);
    const has: Record<string, boolean> = {};
    await Promise.all(
      ((rows ?? []) as { id: string; repo: string | null }[]).map(async (r) => {
        const repo = (r.repo ?? '').trim();
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || repo.toLowerCase() === 'minho-nim/minlab') return;
        const res = await fetch(`https://api.github.com/repos/${repo}/contents/.github/workflows/ui-check.yml`, { headers: gh, signal: AbortSignal.timeout(10_000) }).catch(() => null);
        has[r.id] = Boolean(res && res.ok);
      }),
    );
    return reply(200, { ok: true, has });
  }
  if (body.action === 'skills') {
    const repo = skillsRepo;
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'minlab-ai-office' };
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`, { headers, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return reply(502, { ok: false, error: `GitHub 응답 ${res.status}` });
      const data = (await res.json()) as { tree?: { path: string; type: string }[] };
      const files = new Map<string, string[]>();
      const blobs: string[] = [];
      const dirOf = new Map<string, string>();
      for (const t of data.tree ?? []) {
        // 어느 폴더든 <이름>/SKILL.md가 있는 폴더를 스킬로 본다(이 저장소는 .claude/skills, 스킬 모음 저장소는 common/·프로젝트 폴더 등)
        if (t.type === 'blob' && /(^|\/)node_modules\//.test(t.path)) continue;
        if (t.type === 'blob') blobs.push(t.path);
      }
      for (const path of blobs) {
        const m = path.match(/^(?:(.*)\/)?([\w.-]+)\/SKILL\.md$/);
        if (m && SKILL_NAME.test(m[2]) && !dirOf.has(m[2])) dirOf.set(m[2], (m[1] ? `${m[1]}/` : '') + m[2]);
      }
      for (const [name, dir] of dirOf) files.set(name, blobs.filter((b) => b.startsWith(`${dir}/`)).map((b) => b.slice(dir.length + 1)));
      const names = [...files.keys()].filter((n) => files.get(n)!.includes('SKILL.md')).sort().slice(0, 40);
      const raw = (path: string) =>
        fetch(`https://api.github.com/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, { headers: { ...headers, Accept: 'application/vnd.github.raw' }, signal: AbortSignal.timeout(10_000) })
          .then((r) => (r.ok ? r.text() : ''))
          .catch(() => '');
      const skills = await Promise.all(
        names.map(async (name) => {
          const list = files.get(name)!;
          const lic = list.find((f) => /^LICEN[SC]E/i.test(f));
          const dir = dirOf.get(name)!;
          const [md, licText] = await Promise.all([raw(`${dir}/SKILL.md`), lic ? raw(`${dir}/${lic}`) : Promise.resolve('')]);
          return { name, dir, meta: META_SKILLS.includes(name), skillMd: md.slice(0, 60_000), files: list.slice(0, 80), license: licText.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join(' ').slice(0, 200) };
        }),
      );
      await userClient.from('skill_cache').upsert({ owner_id: user.id, files: skills, updated_at: new Date().toISOString() }).then(() => null, () => null);
      return reply(200, { ok: true, repo, skills });
    } catch (e) {
      return reply(504, { ok: false, error: `GitHub가 늦게 답했습니다(${(e as Error).name}).` });
    }
  }
  // 데모 주소(v0.5.91, 소유자 "운영은 Cloudflare, 데모는 github.io"): GitHub Pages가 켜진 저장소만 데모 주소를 돌려준다.
  if (body.action === 'pages') {
    const ids = (Array.isArray(body.projectIds) ? body.projectIds : []).filter((x) => typeof x === 'string').slice(0, 30);
    const { data: rows } = await userClient.from('projects').select('id, repo').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'minlab-ai-office' };
    const pages: Record<string, string> = {};
    await Promise.all(
      (rows ?? []).map(async (r: { id: string; repo: string | null }) => {
        const repo = (r.repo ?? '').trim();
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return;
        try {
          const info = await fetch(`https://api.github.com/repos/${repo}`, { headers, signal: AbortSignal.timeout(10_000) });
          if (!info.ok || !((await info.json()) as { has_pages?: boolean }).has_pages) return;
          const pg = await fetch(`https://api.github.com/repos/${repo}/pages`, { headers, signal: AbortSignal.timeout(10_000) });
          const url = pg.ok ? String(((await pg.json()) as { html_url?: string }).html_url ?? '') : '';
          pages[r.id] = /^https:\/\/[\w.-]+(\/[\w./-]*)?$/.test(url) ? url : demoUrl(repo);
        } catch {
          // 못 읽으면 데모 버튼을 안 보인다
        }
      }),
    );
    return reply(200, { ok: true, pages });
  }
  const { data: project } = await userClient.from('projects').select('repo').eq('id', body.projectId ?? '').maybeSingle();
  const repo = (project?.repo ?? '').trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return reply(409, { ok: false, error: '프로젝트에 저장소가 없습니다.' });

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'minlab-ai-office' },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404 || res.status === 409) return reply(200, { ok: true, paths: [], note: '빈 저장소이거나 읽을 수 없습니다.' });
    if (!res.ok) return reply(502, { ok: false, error: `GitHub 응답 ${res.status}` });
    const data = (await res.json()) as { tree?: { path?: string; type?: string }[]; truncated?: boolean };
    const paths = (data.tree ?? []).filter((t) => t.type === 'blob' && t.path && !SKIP.test(t.path)).map((t) => t.path!).slice(0, MAX_PATHS);
    return reply(200, { ok: true, paths, truncated: !!data.truncated || paths.length >= MAX_PATHS });
  } catch (e) {
    return reply(504, { ok: false, error: `GitHub가 늦게 답했습니다(${(e as Error).name}).` });
  }
});
