// C(운영 배포) 승인 뒤 release 브랜치를 main으로 앞당긴다(fast-forward만). Cloudflare Pages는 release만 배포한다.
// 소유자 결정(2026-10-30): PC 없이 모바일에서도 배포할 수 있게 C 승인 = 배포. release에 직접 커밋하지 않는다.
// v0.4.20: 병합 뒤 main에 다른 변경이 더 있으면 확인(allowExtra)을 받고, main 시험(CI)이 끝나 통과한 뒤에만 앞당긴다.
// 조건: C 승인 기록 + 최신 PR 확인이 'CI 성공'. 열린 PR이면 그 확인한 커밋 그대로 squash 병합(v0.4.5) → 병합 커밋이 main에 있음 + release가 main보다 뒤(갈라졌으면 거절).
// 토큰(GITHUB_REPO_TOKEN)에 해당 저장소 Contents(Read and write) 권한이 필요하다. 허용 저장소만, minho-nim/MinLab은 제외.
// 성공 = release 갱신(HTTP 200)이지 Cloudflare 빌드 완료가 아니다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { decideDeploy, parsePrUrl } from './decide.ts';
import { versionInputs } from './versionNote.ts';

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

  let body: { taskId?: string; allowExtra?: boolean };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  // RLS를 거쳐 내 업무인지 확인
  const { data: task } = await userClient.from('tasks').select('id, pr_url').eq('id', body.taskId ?? '').maybeSingle();
  if (!task) return reply(404, { ok: false, error: '업무를 찾을 수 없습니다.' });
  const pr = parsePrUrl(String(task.pr_url ?? ''));
  if (!pr) return reply(400, { ok: false, error: 'PR 주소가 기록되지 않았습니다.' });
  const repo = `${pr.owner}/${pr.repo}`;

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const record = async (ok: boolean, fromSha: string, toSha: string, error: string) => {
    await admin.from('deployments').insert({ owner_id: user.id, task_id: task.id, repo, from_sha: fromSha, to_sha: toSha, ok, error: error.slice(0, 500) });
  };
  const refuse = async (status: number, error: string, fromSha = '', toSha = '') => {
    await record(false, fromSha, toSha, error);
    return reply(status, { ok: false, error });
  };

  // 배포가 성공하면 옵시디언 버전 노트를 Actions에 맡긴다(v0.6.89). 실패해도 배포 결과는 바뀌지 않는다.
  const versionNote = async (sha: string) => {
    try {
      const ghToken = env('GITHUB_ACTIONS_TOKEN');
      if (!ghToken) return;
      const { data: t } = await userClient.from('tasks').select('title, projects(name)').eq('id', task.id).maybeSingle();
      const { data: b } = await userClient.from('approvals').select('approved_revision').eq('task_id', task.id).eq('gate', 'B').eq('decision', 'approved').order('created_at', { ascending: false }).limit(1).maybeSingle();
      const rq = userClient.from('result_packages').select('revision, source, summary, test_log').eq('task_id', task.id);
      const { data: r } = await (b?.approved_revision != null ? rq.eq('revision', b.approved_revision) : rq).order('revision', { ascending: false }).limit(1).maybeSingle();
      const { data: rv } = r ? await userClient.from('result_reviews').select('total').eq('task_id', task.id).eq('result_revision', r.revision).order('created_at', { ascending: false }).limit(1).maybeSingle() : { data: null };
      const project = (t?.projects as { name?: string } | null)?.name || repo;
      const inputs = versionInputs({ project, repo, sha, task: String(t?.title ?? ''), score: rv?.total ?? null, pr: String(task.pr_url ?? '').trim().replace(/\/$/, ''), source: String(r?.source ?? ''), summary: String(r?.summary ?? ''), testLog: String(r?.test_log ?? ''), at: new Date().toISOString() });
      await fetch(`https://api.github.com/repos/${env('OFFICE_REPO') || 'minho-nim/minoffia'}/actions/workflows/notes-version.yml/dispatches`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'minoffia', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main', inputs }),
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      // 노트는 덤이다
    }
  };

  const full = repo.toLowerCase();
  const { data: managed } = await userClient.from('managed_repos').select('full_name').eq('owner_id', user.id);
  const allowed =
    full !== 'minho-nim/minlab' &&
    (full === env('CLAUDE_ALLOWED_REPOSITORY').toLowerCase() || (managed ?? []).some((m) => String(m.full_name).toLowerCase() === full));
  if (!allowed) return refuse(403, `허용된 저장소만 배포합니다(${repo}).`);

  const { data: cApproval } = await userClient.from('approvals').select('id').eq('task_id', task.id).eq('gate', 'C').eq('decision', 'approved').limit(1);
  if (!cApproval?.length) return refuse(409, 'C(운영 배포) 승인이 먼저 필요합니다.');

  const { data: last } = await userClient
    .from('pr_checks')
    .select('pr_url, ci_state, merged, head_sha')
    .eq('task_id', task.id)
    .order('checked_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last || last.pr_url !== String(task.pr_url).trim().replace(/\/$/, '') || last.ci_state !== 'success') {
    return refuse(409, '최신 PR 확인이 "CI 성공"이 아닙니다. PR·CI 확인을 다시 누르세요.');
  }

  const gh = (path: string, init: RequestInit = {}) =>
    fetch(`https://api.github.com/repos/${pr.owner}/${pr.repo}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'MinLabAIOffice', 'content-type': 'application/json' },
      signal: init.signal ?? AbortSignal.timeout(10_000),
    });
  const json = async (path: string) => {
    const res = await gh(path);
    return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };

  try {
    let prRes = await json(`/pulls/${pr.number}`);
    if (prRes.status !== 200) return refuse(502, `PR을 읽지 못했습니다(HTTP ${prRes.status}).`);
    // v0.4.5: 배포 승인에 병합 포함. 서버가 CI 성공을 확인한 바로 그 커밋일 때만 병합한다(그 뒤 새 커밋이 올라왔으면 거절).
    if (!prRes.data.merged) {
      const headSha = String((prRes.data.head as { sha?: string })?.sha ?? '');
      if (prRes.data.state !== 'open') return refuse(409, 'PR이 병합되지 않은 채 닫혀 있습니다.');
      if (!headSha || headSha !== last.head_sha) return refuse(409, 'CI를 확인한 뒤 PR에 새 커밋이 올라왔습니다. PR·CI를 다시 확인한 뒤 배포하세요.');
      // v0.7.37(MinSnakey): 병합 응답이 10초를 넘거나 앞 요청의 병합이 진행 중(405 already in progress)이면 실패로 끝내지 않고 병합됐는지 다시 본다
      const merge = await gh(`/pulls/${pr.number}/merge`, { method: 'PUT', body: JSON.stringify({ merge_method: 'squash', sha: headSha }), signal: AbortSignal.timeout(30_000) }).catch(() => null);
      const detail = merge && merge.status !== 200 ? (((await merge.json().catch(() => ({}))) as { message?: string }).message ?? '') : '';
      const pending = !merge || (merge.status === 405 && /in progress/i.test(detail));
      if (merge && merge.status !== 200 && !pending) {
        const hint = merge.status === 403 || merge.status === 404 ? ' 토큰에 Contents·Pull requests(Read and write) 권한이 있는지 확인하세요.' : merge.status === 405 ? ' 병합할 수 없는 상태입니다(충돌·보호 규칙).' : '';
        return refuse(502, `PR을 병합하지 못했습니다(HTTP ${merge.status}). ${detail}${hint}`.trim());
      }
      prRes = await json(`/pulls/${pr.number}`);
      for (let i = 0; i < 6 && !prRes.data.merged; i++) {
        await new Promise((r) => setTimeout(r, 4_000));
        prRes = await json(`/pulls/${pr.number}`);
      }
      if (!prRes.data.merged) return refuse(502, '병합 요청은 받았지만 PR이 아직 병합으로 보이지 않습니다. 잠시 뒤 [운영 배포 다시 시도]를 누르세요.');
    }
    const mergeSha = String(prRes.data.merge_commit_sha ?? '');

    const main = await json('/git/ref/heads/main');
    const release = await json('/git/ref/heads/release');
    if (main.status !== 200) return refuse(502, `main 브랜치를 읽지 못했습니다(HTTP ${main.status}).`);
    // v0.6.40(WorthIt 시험): release 브랜치가 없는 저장소는 main 병합이 곧 배포다(호스팅이 main에서 빌드). 병합까지 됐으면 배포 완료로 기록한다.
    if (release.status === 404) {
      const mainHead = String((main.data.object as { sha?: string })?.sha ?? mergeSha);
      await record(true, '', mainHead, '');
      await versionNote(mainHead);
      return reply(200, { ok: true, updated: false, mainOnly: true, to: mainHead });
    }
    if (release.status !== 200) return refuse(502, `release 브랜치를 읽지 못했습니다(HTTP ${release.status}).`);
    const mainSha = String((main.data.object as { sha?: string })?.sha ?? '');
    const releaseSha = String((release.data.object as { sha?: string })?.sha ?? '');

    const relCmp = await json(`/compare/${releaseSha}...${mainSha}`);
    const mergeCmp = await json(`/compare/${mergeSha}...${mainSha}`);
    if (relCmp.status !== 200 || mergeCmp.status !== 200) return refuse(502, `커밋을 비교하지 못했습니다(HTTP ${relCmp.status}/${mergeCmp.status}).`, releaseSha, mainSha);

    // 합친 뒤 main의 시험(CI) 결과(GitHub Actions check-runs)
    const runs = await json(`/commits/${mainSha}/check-runs?per_page=100`);
    const list = (runs.data.check_runs as { status?: string; conclusion?: string | null }[] | undefined) ?? [];
    const mainCi: 'success' | 'failure' | 'pending' | 'none' =
      runs.status !== 200 || !list.length
        ? 'none'
        : list.some((r) => r.status !== 'completed')
          ? 'pending'
          : list.some((r) => ['failure', 'cancelled', 'timed_out', 'action_required'].includes(String(r.conclusion)))
            ? 'failure'
            : 'success';
    // 막 병합한 커밋은 GitHub가 시험을 등록하기 전이라 'none'으로 보일 수 있다. 3분 동안은 기다린다.
    const mergedAt = Date.parse(String(prRes.data.merged_at ?? ''));
    const ci = mainCi === 'none' && mainSha === mergeSha && Number.isFinite(mergedAt) && Date.now() - mergedAt < 3 * 60_000 ? 'pending' : mainCi;
    const decision = decideDeploy({
      releaseToMain: String(relCmp.data.status),
      mergeToMain: String(mergeCmp.data.status),
      extraCommits: Number(mergeCmp.data.ahead_by ?? 0),
      mainCi: ci,
      allowExtra: body.allowExtra === true,
    });
    if (decision.action === 'refuse') return refuse(409, decision.reason, releaseSha, mainSha);
    if (decision.action === 'confirm') {
      await record(false, releaseSha, mainSha, decision.reason);
      return reply(409, { ok: false, confirm: true, extra: decision.extra, error: decision.reason });
    }
    // 기다리는 중은 실패 기록을 남기지 않는다(앱이 1분마다 다시 부른다).
    if (decision.action === 'wait') return reply(202, { ok: false, wait: true, error: decision.reason });
    if (decision.action === 'noop') {
      await record(true, releaseSha, mainSha, '');
      await versionNote(mainSha);
      return reply(200, { ok: true, updated: false, from: releaseSha, to: mainSha });
    }

    const upd = await gh('/git/refs/heads/release', { method: 'PATCH', body: JSON.stringify({ sha: mainSha, force: false }) });
    if (upd.status !== 200) {
      const hint = upd.status === 403 || upd.status === 404 ? ' 토큰에 Contents(Read and write) 권한이 있는지 확인하세요.' : '';
      return refuse(502, `release를 갱신하지 못했습니다(HTTP ${upd.status}).${hint}`, releaseSha, mainSha);
    }
    await record(true, releaseSha, mainSha, '');
    await versionNote(mainSha);
    return reply(200, { ok: true, updated: true, from: releaseSha, to: mainSha });
  } catch (e) {
    return refuse(504, `GitHub가 응답하지 않았습니다(${(e as Error).name}).`);
  }
});
