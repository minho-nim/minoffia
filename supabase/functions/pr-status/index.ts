// 업무에 기록된 PR의 상태와 CI 결과를 GitHub에서 읽어 기록한다(v0.2 §8, 소유자가 버튼을 눌렀을 때만).
// C(운영 배포) 승인은 최신 확인이 'CI 성공 + 병합됨'일 때만 된다(DB 0010_pr_checks.sql).
// 토큰(GITHUB_REPO_TOKEN)은 읽기에만 쓴다. 허용 저장소(CLAUDE_ALLOWED_REPOSITORY·AI Office가 만든 저장소)만, minho-nim/MinLab은 제외.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { parsePrUrl, summarizeChecks, type CheckRun } from './summary.ts';

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
  if (!token) return reply(503, { ok: false, error: 'GitHub 토큰(GITHUB_REPO_TOKEN)이 설정되지 않았습니다.' });

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });

  let body: { taskId?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  const { data: task } = await userClient.from('tasks').select('id, pr_url').eq('id', body.taskId ?? '').maybeSingle();
  if (!task) return reply(404, { ok: false, error: '업무를 찾을 수 없습니다.' });
  const pr = parsePrUrl(String(task.pr_url ?? ''));
  if (!pr) return reply(400, { ok: false, error: 'PR 주소(https://github.com/…/pull/번호)를 먼저 기록하세요.' });

  const full = `${pr.owner}/${pr.repo}`.toLowerCase();
  const { data: managed } = await userClient.from('managed_repos').select('full_name').eq('owner_id', user.id);
  const allowed =
    full !== 'minho-nim/minlab' &&
    (full === env('CLAUDE_ALLOWED_REPOSITORY').toLowerCase() || (managed ?? []).some((m) => String(m.full_name).toLowerCase() === full));
  if (!allowed) return reply(403, { ok: false, error: `허용된 저장소의 PR만 확인합니다(${full}).` });

  const gh = (path: string) =>
    fetch(`https://api.github.com${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'MinLabAIOffice' },
      signal: AbortSignal.timeout(10_000),
    });

  let prRes: Response;
  try {
    prRes = await gh(`/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`);
  } catch (e) {
    return reply(504, { ok: false, error: `GitHub가 응답하지 않았습니다(${(e as Error).name}).` });
  }
  if (!prRes.ok) {
    const hint = prRes.status === 403 || prRes.status === 404 ? ' 토큰에 Pull requests(Read) 권한이 있는지 확인하세요.' : '';
    return reply(502, { ok: false, error: `PR을 읽지 못했습니다(HTTP ${prRes.status}).${hint}` });
  }
  const prData = (await prRes.json()) as { state?: string; merged?: boolean; head?: { sha?: string } };
  const sha = prData.head?.sha ?? '';

  let runs: CheckRun[] = [];
  const runsRes = await gh(`/repos/${pr.owner}/${pr.repo}/commits/${sha}/check-runs?per_page=50`).catch(() => null);
  if (!runsRes || !runsRes.ok) {
    const hint = runsRes && (runsRes.status === 403 || runsRes.status === 404) ? ' 토큰에 Checks(Read) 권한이 있는지 확인하세요.' : '';
    return reply(502, { ok: false, error: `CI 결과를 읽지 못했습니다(HTTP ${runsRes?.status ?? '응답 없음'}).${hint}` });
  }
  const runsData = (await runsRes.json()) as { check_runs?: { name: string; status: string; conclusion: string | null }[] };
  runs = (runsData.check_runs ?? []).slice(0, 50).map((r) => ({ name: r.name, status: r.status, conclusion: r.conclusion }));

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: row, error } = await admin
    .from('pr_checks')
    .insert({
      owner_id: user.id,
      task_id: task.id,
      pr_url: String(task.pr_url).trim().replace(/\/$/, ''),
      pr_state: prData.state === 'closed' ? 'closed' : 'open',
      merged: Boolean(prData.merged),
      head_sha: sha,
      ci_state: summarizeChecks(runs),
      checks: runs,
    })
    .select('*')
    .single();
  if (error) return reply(500, { ok: false, error: `확인 결과를 기록하지 못했습니다: ${error.message}` });
  return reply(200, { ok: true, check: row });
});
