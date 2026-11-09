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

  let body: { projectId?: string; action?: string; projectIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
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
