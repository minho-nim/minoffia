// Gemini 개발(v0.4.82, 소유자 2026-11-02 "다음 단계 ㄱ"): PM이 Gemini 개발(gemini_dev)에 배정한 쉬운 작업을, 실행 승인(E) 뒤
// 이 저장소의 GitHub Actions 워크플로(gemini-dev.yml, Gemini CLI·무료 키)로 시작한다. 워크플로는 작업 브랜치(ai/gemini/…)만 push하고
// 결과를 submit-result로 보낸다(1회용 제출표). 시작(HTTP 204)은 '시작 중'까지만 기록한다(완료 아님). PR·병합·배포는 승인 뒤.
// 비밀값: GITHUB_ACTIONS_TOKEN(이 저장소 Actions 실행 권한만)은 secrets에만. Gemini 키는 GitHub 저장소 secrets에 있다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { buildGeminiTask, geminiBranch } from './payload.ts';
import { loadRules } from './projectRules.ts';

const HARD_DAILY_CAP = 20;
const DEFAULT_DAILY_CAP = 10;
const TIMEOUT_MS = 15_000;

const env = (key: string) => (Deno.env.get(key) ?? '').trim();

const cors = {
  'Access-Control-Allow-Origin': env('OFFICE_ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST만 받습니다.' });

  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  const ghToken = env('GITHUB_ACTIONS_TOKEN');
  const officeRepo = env('OFFICE_REPO') || 'minho-nim/MinLab-AI-Office';
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });
  if (!ghToken) {
    return reply(503, { ok: false, error: 'Gemini 개발을 시작할 GitHub 토큰(GITHUB_ACTIONS_TOKEN)이 아직 없습니다. Supabase secrets에 넣어 주세요(이 저장소 Actions 읽기·쓰기 권한만).' });
  }

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 실행할 수 있습니다.' });

  let body: { assignmentId?: string; acknowledgeRetry?: boolean };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }

  // RLS를 거쳐 내 기록만 읽는다.
  const { data: a } = await userClient.from('agent_assignments').select('*').eq('id', body.assignmentId ?? '').maybeSingle();
  if (!a) return reply(404, { ok: false, error: '배정된 작업을 찾을 수 없습니다.' });
  if (a.assignee !== 'gemini' || a.execution_mode !== 'gemini_actions') return reply(400, { ok: false, error: 'Gemini 개발에 배정된 작업만 시작합니다.' });
  const { data: task } = await userClient.from('tasks').select('id, project_id, projects(name, repo)').eq('id', a.task_id).maybeSingle();
  const project = task?.projects as unknown as { name: string; repo: string | null } | null;
  const { data: spec } = await userClient
    .from('task_specs')
    .select('revision, final_prompt, change_scope, preserve_constraints, test_criteria')
    .eq('task_id', a.task_id)
    .order('revision', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: plan } = await userClient.from('pm_plans').select('plan').eq('task_id', a.task_id).eq('plan_revision', a.plan_revision).maybeSingle();
  if (!task || !spec || !plan) return reply(409, { ok: false, error: '기획서·계획을 찾을 수 없습니다.' });
  const item = ((plan.plan as { work_items?: Record<string, unknown>[] }).work_items ?? []).find((w) => w.id === a.work_item_id);
  if (!item) return reply(409, { ok: false, error: '계획에 이 작업이 없습니다.' });

  // 대상 저장소: AI Office가 만든 저장소(managed_repos)만. 이 저장소·minho-nim/MinLab은 제외(워크플로도 거절한다).
  const repo = (project?.repo ?? '').toLowerCase();
  const { data: managed } = await userClient.from('managed_repos').select('full_name').eq('owner_id', user.id);
  const allowed =
    !!repo && repo !== 'minho-nim/minlab' && repo !== officeRepo.toLowerCase() && (managed ?? []).some((m) => String(m.full_name).toLowerCase() === repo);
  if (!project?.repo || !allowed) return reply(403, { ok: false, error: 'Gemini 개발은 AI Office가 만든 저장소의 프로젝트에서만 합니다.' });

  // 휴가(v0.4.44): Studio A = 키 A, Studio B = 키 B. 둘 다 휴가면 시작하지 않는다.
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: awayRows } = await admin.from('agent_leave').select('agent').eq('owner_id', user.id);
  const away = new Set((awayRows ?? []).map((r: { agent: string }) => r.agent));
  if (away.has('studioA') && away.has('studioB')) return reply(503, { ok: false, leave: true, error: 'Studio A·B(Gemini)가 모두 휴가예요. 팀 관리에서 한 명을 근무로 돌려 주세요.' });
  const key = away.has('studioA') ? 'B' : 'A';

  const cap = Math.min(HARD_DAILY_CAP, Number(env('GEMINI_DEV_DAILY_CAP')) || DEFAULT_DAILY_CAP);
  const { data: claim, error: claimError } = await admin.rpc('claim_gemini_dev', {
    p_assignment: a.id,
    p_owner: user.id,
    p_allow_retry: Boolean(body.acknowledgeRetry),
    p_cap: cap,
    p_agent: key === 'A' ? 'studioA' : 'studioB',
  });
  if (claimError) {
    const m = claimError.message;
    if (m.includes('dependency not finished')) return reply(409, { ok: false, error: `앞 작업이 아직 끝나지 않았습니다(${m.split(':').pop()?.trim()}).` });
    if (m.includes('concurrent execution limit')) return reply(409, { ok: false, error: 'Gemini 동시 작업 상한에 걸렸습니다. 진행 중 작업을 끝내거나 상한을 올리세요.' });
    return reply(500, { ok: false, error: `예약 실패: ${m}` });
  }
  const row = Array.isArray(claim) ? claim[0] : claim;
  if (!row?.ok) {
    const why: Record<string, string> = {
      daily_cap: `오늘 Gemini 개발 ${cap}회를 모두 썼습니다.`,
      not_approved: '이 작업의 실행 승인(E)이 없습니다.',
      stale_plan: '최신 계획의 작업이 아닙니다.',
      not_claimable: '이미 시작했거나 시작할 수 없는 상태입니다. 실패한 경우 GitHub Actions 기록을 확인한 뒤 확인 체크 후 다시 시작하세요.',
      not_gemini_dev: 'Gemini 개발에 배정된 작업만 시작합니다.',
    };
    return reply(row?.reason === 'daily_cap' ? 429 : 409, { ok: false, error: why[row?.reason] ?? '시작할 수 없습니다.' });
  }

  const fail = async (message: string, status: number) => {
    await admin.from('agent_assignments').update({ dispatch_status: 'failed', actual_provider_status: message.slice(0, 300) }).eq('id', a.id);
    return reply(status, { ok: false, error: message });
  };

  // 결과 자동 저장: 이 작업 전용 1회용 제출표(해시만 저장, 24시간, 3번까지). Claude 보조 개발과 같은 submit-result를 쓴다.
  const ticket = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const ticketHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ticket)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const { error: ticketError } = await admin.from('plan_submit_tokens').insert({
    owner_id: user.id,
    task_id: a.task_id,
    spec_revision: spec.revision,
    token_hash: ticketHash,
    expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
    kind: 'result',
    assignment_id: a.id,
  });
  if (ticketError) return fail('결과 제출표를 만들지 못했습니다.', 500);

  const instructions = buildGeminiTask({
    title: String(item.title ?? a.title ?? ''),
    goal: String(item.goal ?? ''),
    finalPrompt: String(spec.final_prompt ?? ''),
    changeScope: String(spec.change_scope ?? ''),
    preserve: [String(spec.preserve_constraints ?? ''), ...strings(item.preserve_constraints)].filter(Boolean),
    acceptance: [...strings(item.acceptance_tests), String(spec.test_criteria ?? '')].filter(Boolean),
    projectRules: await loadRules(userClient, task.project_id),
  });
  const branch = geminiBranch(a.task_id, String(item.id));

  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${officeRepo}/actions/workflows/gemini-dev.yml/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'MinLabAIOffice',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { repo: project.repo, branch, instructions, key, task_id: a.task_id, submit_token: ticket },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return fail(`GitHub가 응답하지 않았습니다(${(e as Error).name}). Actions 기록에서 실제로 시작됐는지 먼저 확인하세요.`, 504);
  }
  if (res.status !== 204) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    const hint = res.status === 401 || res.status === 403 ? '토큰이 틀렸거나 Actions 쓰기 권한이 없습니다.' : res.status === 404 ? '워크플로(gemini-dev.yml)나 저장소를 찾지 못했습니다.' : res.status === 422 ? '워크플로 입력이 맞지 않습니다.' : '';
    return fail(`Gemini 개발 시작 실패 HTTP ${res.status}: ${hint} ${detail}`.trim(), 502);
  }
  const runUrl = `https://github.com/${officeRepo}/actions/workflows/gemini-dev.yml`;
  // 시작만 서버가 확인했다(완료 아님). 결과는 워크플로가 submit-result로 보낸다.
  await admin
    .from('agent_assignments')
    .update({
      dispatch_status: 'started',
      status_source: 'server_verified',
      provider_task_url: runUrl,
      actual_provider_status: `workflow_dispatched:${branch}`,
      last_verified_at: new Date().toISOString(),
    })
    .eq('id', a.id);

  return reply(200, { ok: true, runUrl, key, branch });
});
