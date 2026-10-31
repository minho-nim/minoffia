// 올리기 승인(B) 뒤 Claude 보조 개발 루틴으로 PR을 연다(v0.4.5, 소유자 승인 2026-10-31).
// 승인된 최신 Claude 결과의 diff만 그대로 적용한다. 같은 결과 버전으로 두 번 열지 않는다(claim_claude_pr, 0022).
// 세션 시작(HTTP 200)은 '시작됨'까지만 기록한다. PR 주소는 pr-status가 작업 브랜치로 GitHub에서 찾아 기록한다.
// 비밀값(CLAUDE_SUPPORT_FIRE_URL, CLAUDE_SUPPORT_TOKEN)은 이 함수의 secrets에만 둔다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { buildPrPayload, claudeBranch, MAX_PR_DIFF } from './prPayload.ts';

const HARD_DAILY_CAP = 20;
const FIRE_TIMEOUT_MS = 20_000;
const ANTHROPIC_VERSION = '2026-10-21';

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

  const fireUrl = env('CLAUDE_SUPPORT_FIRE_URL');
  const token = env('CLAUDE_SUPPORT_TOKEN');
  const allowedRepo = env('CLAUDE_ALLOWED_REPOSITORY');
  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  if (!ownerEmail || !allowedRepo) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL·CLAUDE_ALLOWED_REPOSITORY)이 빠졌습니다.' });
  if (!fireUrl || !token) return reply(503, { ok: false, error: 'Claude 보조 개발 루틴이 연결되지 않았습니다. "Claude PR 요청 복사"로 진행하세요.' });

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 실행할 수 있습니다.' });

  let body: { taskId?: string; acknowledgeRetry?: boolean };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }

  // RLS를 거쳐 내 업무만. 허용 저장소만(PM과 같은 규칙), minho-nim/MinLab은 제외
  const { data: task } = await userClient.from('tasks').select('id, pr_url, projects(repo)').eq('id', body.taskId ?? '').maybeSingle();
  if (!task) return reply(404, { ok: false, error: '업무를 찾을 수 없습니다.' });
  if (task.pr_url) return reply(409, { ok: false, error: '이미 PR 주소가 기록된 업무입니다.' });
  const repo = String((task.projects as unknown as { repo: string | null } | null)?.repo ?? '');
  let allowed = !!repo && repo.toLowerCase() === allowedRepo.toLowerCase();
  if (repo && !allowed) {
    const { data: managed } = await userClient.from('managed_repos').select('full_name').eq('owner_id', user.id);
    allowed = (managed ?? []).some((m) => String(m.full_name).toLowerCase() === repo.toLowerCase());
  }
  if (repo.toLowerCase() === 'minho-nim/minlab') allowed = false;
  if (!allowed) return reply(403, { ok: false, error: '허용된 저장소의 프로젝트만 PR을 엽니다.' });

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const cap = Math.min(HARD_DAILY_CAP, Number(env('CLAUDE_DAILY_CAP')) || HARD_DAILY_CAP);
  const { data: claim, error: claimError } = await admin.rpc('claim_claude_pr', {
    p_task: task.id,
    p_owner: user.id,
    p_allow_retry: Boolean(body.acknowledgeRetry),
    p_cap: cap,
  });
  if (claimError) return reply(500, { ok: false, error: `예약 실패: ${claimError.message}` });
  const row = Array.isArray(claim) ? claim[0] : claim;
  if (!row?.ok) {
    const why: Record<string, string> = {
      no_result: '결과 패키지가 없습니다.',
      not_claude: 'Claude가 낸 결과만 자동으로 PR을 엽니다. "PR 요청 복사"로 진행하세요.',
      not_approved: '최신 결과의 올리기 승인(B)이 없습니다.',
      already: '이 결과로 이미 PR을 요청했습니다. 실패했다면 세션을 확인한 뒤 확인 체크 후 다시 요청하세요.',
      daily_cap: `오늘 Claude Cloud 실행 ${cap}회를 모두 썼습니다.`,
    };
    return reply(row?.reason === 'daily_cap' ? 429 : 409, { ok: false, error: why[row?.reason] ?? 'PR을 요청할 수 없습니다.' });
  }

  const revision = Number(row.result_revision);
  const workItemId = String(row.work_item_id ?? '');
  const branch = claudeBranch(task.id, workItemId);
  const fail = async (message: string, status: number) => {
    await admin.from('pr_dispatches').update({ status: 'failed', error: message.slice(0, 500), branch }).eq('task_id', task.id).eq('result_revision', revision);
    return reply(status, { ok: false, error: message });
  };

  const { data: result } = await admin.from('result_packages').select('summary, diff').eq('task_id', task.id).eq('revision', revision).maybeSingle();
  const diff = String(result?.diff ?? '');
  if (!diff.trim()) return fail('결과에 변경 내용(diff)이 없어 PR을 열 수 없습니다.', 409);
  if (diff.length > MAX_PR_DIFF) return fail(`변경 내용이 너무 큽니다(${diff.length.toLocaleString()}자 > ${MAX_PR_DIFF.toLocaleString()}자). "Claude PR 요청 복사"로 원래 세션에 요청하세요.`, 413);

  const text = buildPrPayload({ taskId: task.id, repo, workItemId, resultRevision: revision, summary: String(result?.summary ?? ''), diff });

  let res: Response;
  try {
    res = await fetch(fireUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'anthropic-version': ANTHROPIC_VERSION },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(FIRE_TIMEOUT_MS),
    });
  } catch (e) {
    return fail(`Claude가 응답하지 않았습니다(${(e as Error).name}). 실제로 시작됐을 수 있으니 Routines 기록을 먼저 확인하세요.`, 504);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    const hint = res.status === 401 || res.status === 403 ? '토큰이 틀렸거나 만료됐습니다.' : res.status === 429 ? '루틴 시간당 실행 한도에 걸렸습니다.' : '루틴 설정을 확인하세요.';
    return fail(`PR 세션 시작 실패 HTTP ${res.status}: ${hint} ${detail}`.trim(), 502);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const sessionUrl = (data.claude_code_session_url as string | undefined) ?? null;
  await admin.from('pr_dispatches').update({ status: 'started', session_url: sessionUrl, branch, error: '' }).eq('task_id', task.id).eq('result_revision', revision);
  return reply(200, { ok: true, sessionUrl, branch });
});
