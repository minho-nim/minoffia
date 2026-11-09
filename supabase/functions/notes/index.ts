// 옵시디언 노트 보관함(v0.5.62): action graph = 프로젝트 코드 그래프(Graphify) 다시 만들기, action remove = 지운 프로젝트·업무의 노트 지우기.
// 둘 다 GitHub Actions(graphify.yml·notes-remove.yml)를 시작만 한다. AI 없음. 비밀값: GITHUB_ACTIONS_TOKEN(이 저장소 Actions 실행만).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const env = (key: string) => (Deno.env.get(key) ?? '').trim();
const cors = {
  'Access-Control-Allow-Origin': env('OFFICE_ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const dispatch = async (token: string, repo: string, workflow: string, inputs: Record<string, string>) =>
  fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'minoffia', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);

const name = (v: unknown) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST만 받습니다.' });
  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  const ghToken = env('GITHUB_ACTIONS_TOKEN');
  const officeRepo = env('OFFICE_REPO') || 'minho-nim/minoffia';
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });
  if (!ghToken) return reply(503, { ok: false, error: 'GitHub 토큰(GITHUB_ACTIONS_TOKEN)이 없습니다.' });

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });

  let body: { action?: string; projectId?: string; project?: string; task?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }

  if (body.action === 'graph') {
    if (!body.projectId || !/^[0-9a-f-]{36}$/i.test(body.projectId)) return reply(400, { ok: false, error: 'projectId가 필요합니다.' });
    const { data: project } = await userClient.from('projects').select('name, repo').eq('id', body.projectId).maybeSingle();
    if (!project) return reply(404, { ok: false, error: '프로젝트를 찾을 수 없습니다.' });
    const repo = String(project.repo ?? '');
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return reply(409, { ok: false, error: '연결된 GitHub 저장소가 없는 프로젝트예요.' });
    if (repo.toLowerCase() === 'minho-nim/minlab') return reply(403, { ok: false, error: '이 저장소는 읽지 않습니다.' });
    const res = await dispatch(ghToken, officeRepo, 'graphify.yml', { repo, name: name(project.name) || repo });
    if (!res?.ok) return reply(502, { ok: false, error: `코드 그래프를 시작하지 못했습니다(GitHub ${res?.status ?? '응답 없음'}).` });
    return reply(200, { ok: true, started: true });
  }
  if (body.action === 'remove') {
    const project = name(body.project);
    if (!project) return reply(400, { ok: false, error: '프로젝트 이름이 필요합니다.' });
    const res = await dispatch(ghToken, officeRepo, 'notes-remove.yml', { project, task: name(body.task) });
    if (!res?.ok) return reply(502, { ok: false, error: `노트 지우기를 시작하지 못했습니다(GitHub ${res?.status ?? '응답 없음'}).` });
    return reply(200, { ok: true, started: true });
  }
  return reply(400, { ok: false, error: 'action은 graph 또는 remove입니다.' });
});
