// 디자인 자동 검사(v0.5.56, 소유자 목록 26번): 결과의 미리보기 주소를 GitHub Actions(design-check.yml)가
// impeccable(Apache-2.0, 고정 버전)로 AI 없이 검사한다(데스크톱·휴대폰 폭). 프로젝트 디자인 기준(DESIGN.md)이 확정돼 있으면 함께 쓴다.
// 결과 JSON은 이 함수가 만든 1회용 업로드 주소(그 파일만, 2시간)로 올라온다. 비밀값: GITHUB_ACTIONS_TOKEN(이 저장소 Actions 실행만).
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
  if (!ghToken) return reply(503, { ok: false, error: '검사를 시작할 GitHub 토큰(GITHUB_ACTIONS_TOKEN)이 없습니다.' });

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
  if (!body.taskId || !/^[0-9a-f-]{36}$/i.test(body.taskId) || !Number.isInteger(revision) || revision < 1) return reply(400, { ok: false, error: 'taskId·revision이 필요합니다.' });

  // RLS를 거쳐 내 결과·프로젝트만
  const { data: result } = await userClient.from('result_packages').select('preview_url').eq('task_id', body.taskId).eq('revision', revision).maybeSingle();
  if (!result) return reply(404, { ok: false, error: '결과를 찾을 수 없습니다.' });
  const url = String(result.preview_url ?? '');
  if (!/^https:\/\/[a-z0-9.-]+(\/[^\s]*)?$/i.test(url)) return reply(409, { ok: false, error: '미리보기 주소가 있는 결과만 검사할 수 있어요.' });
  const { data: task } = await userClient.from('tasks').select('projects(design_md)').eq('id', body.taskId).maybeSingle();
  const designMd = String((task?.projects as unknown as { design_md?: string } | null)?.design_md ?? '').slice(0, 8000);

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const path = `${user.id}/${body.taskId}/design-r${revision}.json`;
  await admin.storage.from('attachments').remove([path]);
  const { data: signed, error: signError } = await admin.storage.from('attachments').createSignedUploadUrl(path, { upsert: true });
  if (signError || !signed?.signedUrl) return reply(500, { ok: false, error: '업로드 주소를 만들지 못했습니다.' });

  const res = await fetch(`https://api.github.com/repos/${officeRepo}/actions/workflows/design-check.yml/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'minoffia',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main', inputs: { url, design_md: designMd, upload_url: signed.signedUrl } }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res || !res.ok) return reply(502, { ok: false, error: `검사를 시작하지 못했습니다(GitHub ${res?.status ?? '응답 없음'}).` });
  return reply(200, { ok: true, started: true });
});
