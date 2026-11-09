// 앱 점검·기본 지도(floorplan 1단계, v0.5.53, 소유자 목록 28번). AI 호출 없음, 토큰 0.
// 프로젝트 저장소를 GitHub Actions(floorplan.yml)가 floorplan(고정 커밋)으로 훑어 지도 HTML과 점검 JSON을 만들고,
// 이 함수가 만든 1회용 업로드 주소(그 파일만, 2시간)로 올린다. 앱은 소유자 폴더의 두 파일을 연다.
// 비밀값: GITHUB_ACTIONS_TOKEN(이 저장소 Actions 실행만). 대상 저장소 읽기는 Actions secrets(TARGET_REPO_TOKEN)만 쓴다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

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
  const ghToken = env('GITHUB_ACTIONS_TOKEN');
  const officeRepo = env('OFFICE_REPO') || 'minho-nim/minoffia';
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });
  if (!ghToken) return reply(503, { ok: false, error: '점검을 시작할 GitHub 토큰(GITHUB_ACTIONS_TOKEN)이 없습니다.' });

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });

  let body: { projectId?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  if (!body.projectId || !/^[0-9a-f-]{36}$/i.test(body.projectId)) return reply(400, { ok: false, error: 'projectId가 필요합니다.' });

  // RLS를 거쳐 내 프로젝트만
  const { data: project } = await userClient.from('projects').select('id, name, repo').eq('id', body.projectId).maybeSingle();
  if (!project) return reply(404, { ok: false, error: '프로젝트를 찾을 수 없습니다.' });
  const repo = String(project.repo ?? '');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return reply(409, { ok: false, error: '연결된 GitHub 저장소가 없는 프로젝트예요.' });
  if (repo.toLowerCase() === 'minho-nim/minlab') return reply(403, { ok: false, error: '이 저장소는 점검하지 않습니다.' });

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const dir = `${user.id}/projects/${project.id}`;
  // 예전 결과를 지워야 앱이 새 결과가 왔는지 알 수 있다
  await admin.storage.from('attachments').remove([`${dir}/floorplan.html`, `${dir}/health.json`]);
  const [map, health] = await Promise.all([
    admin.storage.from('attachments').createSignedUploadUrl(`${dir}/floorplan.html`, { upsert: true }),
    admin.storage.from('attachments').createSignedUploadUrl(`${dir}/health.json`, { upsert: true }),
  ]);
  if (map.error || health.error || !map.data?.signedUrl || !health.data?.signedUrl) return reply(500, { ok: false, error: '업로드 주소를 만들지 못했습니다.' });

  const res = await fetch(`https://api.github.com/repos/${officeRepo}/actions/workflows/floorplan.yml/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'minoffia',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main', inputs: { repo, name: String(project.name ?? '').slice(0, 80), map_url: map.data.signedUrl, health_url: health.data.signedUrl } }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res || !res.ok) return reply(502, { ok: false, error: `점검을 시작하지 못했습니다(GitHub ${res?.status ?? '응답 없음'}).` });
  return reply(200, { ok: true, started: true });
});
