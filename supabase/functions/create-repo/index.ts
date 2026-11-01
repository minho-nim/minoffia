// 새 프로젝트의 GitHub 저장소를 만든다(소유자가 "만들기"를 눌렀을 때만).
// 비공개 + README·CLAUDE.md(AI 작업 규칙, v0.4.55)만 있는 빈 저장소. 코드는 지금처럼 B 승인 뒤에만 올라간다.
// 토큰(GITHUB_REPO_TOKEN)은 secrets에만 있고, 이 함수는 저장소 만들기와 첫 규칙 파일(CLAUDE.md) 넣기 외에는 쓰지 않는다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { projectClaudeMd } from './rules.ts';
import { repoNameError } from './naming.ts';

/** 하루(KST)에 만들 수 있는 저장소 수 */
const DAILY_REPO_CAP = 5;

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
  if (!token) return reply(503, { ok: false, error: 'GitHub 토큰(GITHUB_REPO_TOKEN)이 설정되지 않았습니다. 프로젝트 탭에서 저장소를 직접 입력하세요.' });

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });

  let body: { projectId?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  const name = (body.name ?? '').trim();
  const nameError = repoNameError(name);
  if (!body.projectId || nameError) return reply(400, { ok: false, error: nameError ?? '프로젝트가 필요합니다.' });

  // RLS를 거쳐 내 프로젝트인지, 아직 저장소가 없는지 확인
  const { data: project } = await userClient.from('projects').select('id, name, repo').eq('id', body.projectId).maybeSingle();
  if (!project) return reply(404, { ok: false, error: '프로젝트를 찾을 수 없습니다.' });
  if (project.repo) return reply(409, { ok: false, error: `이미 저장소(${project.repo})가 연결된 프로젝트입니다.` });

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const kstMidnight = new Date(Math.floor((Date.now() + 9 * 3600_000) / 86400_000) * 86400_000 - 9 * 3600_000).toISOString();
  const { count } = await admin.from('managed_repos').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).gte('created_at', kstMidnight);
  if ((count ?? 0) >= DAILY_REPO_CAP) return reply(429, { ok: false, error: `오늘 저장소 만들기 ${DAILY_REPO_CAP}회를 모두 썼습니다.` });

  let res: Response;
  try {
    res = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'MinLabAIOffice',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        private: true,
        auto_init: true,
        description: `MinLab AI Office 프로젝트: ${String(project.name).slice(0, 200)}`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return reply(504, { ok: false, error: `GitHub가 응답하지 않았습니다(${(e as Error).name}). GitHub에서 저장소가 생겼는지 먼저 확인하세요.` });
  }
  const data = (await res.json().catch(() => ({}))) as { full_name?: string; html_url?: string; message?: string; errors?: { message?: string }[] };
  if (res.status !== 201 || !data.full_name) {
    const detail = data.errors?.[0]?.message ?? data.message ?? '';
    const hint =
      res.status === 422
        ? '같은 이름의 저장소가 이미 있거나 이름을 쓸 수 없습니다.'
        : res.status === 401
          ? '토큰이 틀렸거나 만료됐습니다.'
          : res.status === 403
            ? '토큰에 저장소 만들기 권한(Administration: Read and write)이 없습니다.'
            : 'GitHub가 저장소를 만들지 못했습니다.';
    return reply(502, { ok: false, error: `${hint} ${detail}`.trim().slice(0, 300) });
  }

  await admin.from('managed_repos').insert({ owner_id: user.id, project_id: project.id, full_name: data.full_name, html_url: data.html_url ?? '' });
  // AI 작업 규칙 파일(CLAUDE.md)을 함께 넣는다(v0.4.55). 실패해도 저장소는 그대로 쓰고 알림만 남긴다.
  let rulesWarning = '';
  try {
    const content = btoa(String.fromCharCode(...new TextEncoder().encode(projectClaudeMd(String(project.name)))));
    const put = await fetch(`https://api.github.com/repos/${data.full_name}/contents/CLAUDE.md`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'MinLabAIOffice',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'docs: AI 작업 규칙(CLAUDE.md) 추가', content }),
      signal: AbortSignal.timeout(15_000),
    });
    if (put.status !== 201) rulesWarning = `작업 규칙 파일(CLAUDE.md)을 넣지 못했습니다(HTTP ${put.status}). 토큰에 Contents 쓰기 권한이 있는지 확인하세요.`;
  } catch (e) {
    rulesWarning = `작업 규칙 파일(CLAUDE.md)을 넣지 못했습니다(${(e as Error).name}).`;
  }
  // 연결은 사용자 권한(RLS)으로 한다.
  const { error: linkError } = await userClient.from('projects').update({ repo: data.full_name }).eq('id', project.id);
  if (linkError) {
    return reply(200, { ok: true, repo: data.full_name, url: data.html_url, warning: `저장소는 만들었지만 프로젝트에 연결하지 못했습니다: ${linkError.message}${rulesWarning ? ` ${rulesWarning}` : ''}` });
  }
  return reply(200, { ok: true, repo: data.full_name, url: data.html_url, ...(rulesWarning ? { warning: rulesWarning } : {}) });
});
