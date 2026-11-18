// GitHub Actions 사용량(v0.7.93 소유자 "통계에 깃허브 액션도 포함"): 고른 기간의 실행 기록을 저장소마다 읽어 돌려준다.
// 소유자만. AI 호출 없음. 토큰은 서버 비밀값 GITHUB_REPO_TOKEN(값은 내려보내지 않음). 비공개 저장소는 작업(job) 시간을 읽어 청구 분을 센다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { jobMinutes, reposToRead, runMinutes, workflowLabel, type ActionRun, type GhJob, type GhRun } from './actionsUsage.ts';

const env = (key: string) => (Deno.env.get(key) ?? '').trim();
const cors = {
  'Access-Control-Allow-Origin': env('OFFICE_ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const MAX_RUNS_PER_REPO = 300;
const MAX_DAYS = 366;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST만 받습니다.' });
  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  const token = env('GITHUB_REPO_TOKEN');
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });
  if (!token) return reply(503, { ok: false, error: 'GitHub 토큰(GITHUB_REPO_TOKEN)이 없습니다.' });
  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 볼 수 있습니다.' });

  let body: { from?: string; to?: string } = {};
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 형식이 올바르지 않습니다.' });
  }
  const from = Date.parse(String(body.from ?? ''));
  const to = Date.parse(String(body.to ?? ''));
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > MAX_DAYS * 86400_000) return reply(400, { ok: false, error: '기간이 올바르지 않습니다.' });

  const { data: projects } = await userClient.from('projects').select('repo');
  const repos = reposToRead((projects ?? []).map((p: { repo: string | null }) => p.repo));
  const gh = (path: string) =>
    fetch(`https://api.github.com${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'minoffia' },
      signal: AbortSignal.timeout(15_000),
    });
  const range = `${new Date(from).toISOString()}..${new Date(to).toISOString()}`;
  const skipped: string[] = [];
  const out: ActionRun[] = [];
  await Promise.all(
    repos.map(async (repo) => {
      try {
        const info = await gh(`/repos/${repo}`);
        if (!info.ok) {
          skipped.push(repo);
          await info.body?.cancel();
          return;
        }
        const isPrivate = Boolean(((await info.json()) as { private?: boolean }).private);
        const runs: GhRun[] = [];
        for (let page = 1; runs.length < MAX_RUNS_PER_REPO && page <= 3; page++) {
          const res = await gh(`/repos/${repo}/actions/runs?per_page=100&page=${page}&created=${encodeURIComponent(range)}`);
          if (!res.ok) {
            await res.body?.cancel();
            break;
          }
          const list = ((await res.json()) as { workflow_runs?: GhRun[] }).workflow_runs ?? [];
          runs.push(...list);
          if (list.length < 100) break;
        }
        // 비공개 저장소만 작업 시간을 읽어 청구 분을 센다(공개는 무료라 실행 시간으로 충분)
        for (let i = 0; i < runs.length; i += 6) {
          await Promise.all(
            runs.slice(i, i + 6).map(async (r) => {
              let minutes = runMinutes(r);
              if (isPrivate && r.status === 'completed') {
                const jr = await gh(`/repos/${repo}/actions/runs/${r.id}/jobs?per_page=100`).catch(() => null);
                if (jr?.ok) minutes = jobMinutes((((await jr.json()) as { jobs?: GhJob[] }).jobs ?? []));
                else await jr?.body?.cancel();
              }
              out.push({ repo, private: isPrivate, workflow: workflowLabel(r.name), ok: r.conclusion === 'success', createdAt: r.created_at, minutes });
            }),
          );
        }
      } catch {
        skipped.push(repo);
      }
    }),
  );
  out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (skipped.length) console.log(JSON.stringify({ fn: 'actions-usage', skipped: skipped.length }));
  return reply(200, { ok: true, runs: out, repos: repos.length - skipped.length, skipped });
});
