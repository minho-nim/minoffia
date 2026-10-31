// 업무에 기록된 PR의 상태와 CI(GitHub Actions 실행 결과)를 GitHub에서 읽어 기록한다(v0.2 §8). 앱이 올리기 승인 뒤 자동으로 부른다(v0.4.5).
// 토큰 권한: Pull requests(Read), Actions(Read). Fine-grained 토큰에는 Checks 권한이 없다.
// C(운영 배포) 승인은 최신 확인이 'CI 성공'(열린 PR 또는 병합됨)일 때만 된다(DB 0022). 병합은 C 뒤 deploy-release가 한다.
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
  const { data: task } = await userClient.from('tasks').select('id, pr_url, projects(repo)').eq('id', body.taskId ?? '').maybeSingle();
  if (!task) return reply(404, { ok: false, error: '업무를 찾을 수 없습니다.' });
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

  // v0.4.5: 올리기 승인 뒤 Claude가 연 PR은 주소를 사람이 적지 않는다. 작업 브랜치로 GitHub에서 찾아 기록한다.
  if (!task.pr_url) {
    const { data: sent } = await userClient.from('pr_dispatches').select('branch').eq('task_id', task.id).neq('branch', '').order('created_at', { ascending: false }).limit(1).maybeSingle();
    const projectRepo = String((task.projects as unknown as { repo: string | null } | null)?.repo ?? '');
    if (!sent?.branch || !projectRepo.includes('/')) return reply(400, { ok: false, error: 'PR 주소(https://github.com/…/pull/번호)를 먼저 기록하세요.' });
    const [owner] = projectRepo.split('/');
    const found = await fetch(`https://api.github.com/repos/${projectRepo}/pulls?state=all&per_page=1&head=${encodeURIComponent(`${owner}:${sent.branch}`)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'MinLabAIOffice' },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    const list = found && found.ok ? ((await found.json()) as { html_url?: string }[]) : [];
    if (!list[0]?.html_url) return reply(409, { ok: false, waiting: true, error: `PR이 아직 열리지 않았습니다(Claude가 ${sent.branch} 브랜치로 여는 중).` });
    await admin.from('tasks').update({ pr_url: list[0].html_url }).eq('id', task.id);
    task.pr_url = list[0].html_url;
  }
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

  // CI는 GitHub Actions(verify)다. Fine-grained 토큰에는 Checks 권한이 없어서 Actions 실행 기록(Actions: Read)으로 읽는다.
  const runsRes = await gh(`/repos/${pr.owner}/${pr.repo}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=50`).catch(() => null);
  if (!runsRes || !runsRes.ok) {
    const hint = runsRes && (runsRes.status === 403 || runsRes.status === 404) ? ' 토큰에 Actions(Read-only) 권한이 있는지 확인하세요.' : '';
    return reply(502, { ok: false, error: `CI 결과를 읽지 못했습니다(HTTP ${runsRes?.status ?? '응답 없음'}).${hint}` });
  }
  const runsData = (await runsRes.json()) as { workflow_runs?: { name: string; status: string; conclusion: string | null; run_attempt?: number }[] };
  // 같은 워크플로를 다시 돌렸으면 최신 실행만 센다(목록은 최신순).
  const seen = new Set<string>();
  const runs: CheckRun[] = [];
  for (const r of runsData.workflow_runs ?? []) {
    if (seen.has(r.name)) continue;
    seen.add(r.name);
    runs.push({ name: r.name, status: r.status, conclusion: r.conclusion });
    if (runs.length >= 50) break;
  }

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
