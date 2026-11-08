// 바뀐 곳 구조도(Archify)를 모든 결과에(v0.5.43, 소유자 "Archify만 화면에"). AI 호출 없음, 토큰 0.
// 결과 diff → 파일 나무 JSON → GitHub Actions(archify.yml)가 Archify(고정 커밋)로 그림 HTML을 만들어
// 이 함수가 만든 1회용 업로드 주소(그 파일 하나만, 2시간)로 올린다. 앱은 소유자 폴더의 그 파일을 연다.
// 비밀값: GITHUB_ACTIONS_TOKEN(이 저장소 Actions 실행만). 업로드 주소에는 저장소 열쇠가 들어 있지 않다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { archifyPath, changeTree, statsFromDiff } from './tree.ts';

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
  const officeRepo = env('OFFICE_REPO') || 'minho-nim/MinLab-AI-Office';
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });
  if (!ghToken) return reply(503, { ok: false, error: '구조도를 그릴 GitHub 토큰(GITHUB_ACTIONS_TOKEN)이 없습니다.' });

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });

  let body: { taskId?: string; revision?: number };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  const revision = Number(body.revision);
  if (!body.taskId || !Number.isInteger(revision) || revision < 1) return reply(400, { ok: false, error: 'taskId·revision이 필요합니다.' });

  // RLS를 거쳐 내 결과만
  const { data: result } = await userClient.from('result_packages').select('diff').eq('task_id', body.taskId).eq('revision', revision).maybeSingle();
  if (!result) return reply(404, { ok: false, error: '결과를 찾을 수 없습니다.' });
  const { data: task } = await userClient.from('tasks').select('projects(repo, name)').eq('id', body.taskId).maybeSingle();
  const project = task?.projects as unknown as { repo: string | null; name: string } | null;
  const files = statsFromDiff(String(result.diff ?? ''));
  if (!files.length) return reply(409, { ok: false, error: '바뀐 파일이 없는 결과라 구조도를 그리지 않습니다.' });

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const path = archifyPath(user.id, body.taskId, revision);
  const { data: existing } = await admin.storage.from('attachments').list(`${user.id}/${body.taskId}`, { search: `archify-r${revision}.html` });
  if ((existing ?? []).some((f) => f.name === `archify-r${revision}.html`)) return reply(200, { ok: true, ready: true, path });

  const { data: signed, error: signError } = await admin.storage.from('attachments').createSignedUploadUrl(path, { upsert: true });
  if (signError || !signed?.signedUrl) return reply(500, { ok: false, error: '업로드 주소를 만들지 못했습니다.' });

  const tree = JSON.stringify(changeTree(files, project?.repo || project?.name || ''));
  const res = await fetch(`https://api.github.com/repos/${officeRepo}/actions/workflows/archify.yml/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'minoffia',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main', inputs: { tree, upload_url: signed.signedUrl } }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res || !res.ok) return reply(502, { ok: false, error: `구조도 작업을 시작하지 못했습니다(GitHub ${res?.status ?? '응답 없음'}).` });
  return reply(200, { ok: true, started: true, path });
});
