// Claude 보조 개발: PM 계획에서 Claude에 배정한 작업을, E 승인 뒤 두 번째 루틴('MinLab AI Office 보조 개발')으로 시작한다.
// 세션 시작(HTTP 200)은 '시작됨'까지만 기록한다(완료 아님). Claude는 B 승인 전에는 세션 안에서만 작업하고 푸시·PR을 하지 않는다.
// 비밀값(CLAUDE_SUPPORT_FIRE_URL, CLAUDE_SUPPORT_TOKEN)은 이 함수의 secrets에만 둔다. 하루 상한은 PM 전송과 함께 센다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { buildDevPayload } from './payload.ts';

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

const ROLE: Record<string, string> = { current: '현재 화면', target: '목표·참고 디자인', error: '오류 화면', reference: '기타 참고', document: '문서·자료', prototype: '견본' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST만 받습니다.' });

  const fireUrl = env('CLAUDE_SUPPORT_FIRE_URL');
  const token = env('CLAUDE_SUPPORT_TOKEN');
  const allowedRepo = env('CLAUDE_ALLOWED_REPOSITORY');
  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  if (!ownerEmail || !allowedRepo) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL·CLAUDE_ALLOWED_REPOSITORY)이 빠졌습니다.' });
  if (!fireUrl || !token) {
    return reply(503, { ok: false, error: 'Claude 보조 개발 루틴이 아직 연결되지 않았습니다(CLAUDE_SUPPORT_FIRE_URL·CLAUDE_SUPPORT_TOKEN). 수동 인계로 진행하세요.' });
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
  if (a.assignee !== 'claude') return reply(400, { ok: false, error: 'Claude에 배정된 작업만 시작합니다.' });
  const { data: task } = await userClient.from('tasks').select('id, projects(name, repo)').eq('id', a.task_id).maybeSingle();
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

  // 허용 저장소만(PM과 같은 규칙), minho-nim/MinLab은 제외
  const repo = (project?.repo ?? '').toLowerCase();
  let allowed = !!repo && repo === allowedRepo.toLowerCase();
  if (repo && !allowed) {
    const { data: managed } = await userClient.from('managed_repos').select('full_name').eq('owner_id', user.id);
    allowed = (managed ?? []).some((m) => String(m.full_name).toLowerCase() === repo);
  }
  if (repo === 'minho-nim/minlab') allowed = false;
  if (!project?.repo || !allowed) return reply(403, { ok: false, error: '허용된 저장소의 프로젝트만 실행할 수 있습니다.' });

  const { data: files } = await userClient
    .from('attachments')
    .select('kind, role, note, file_name, plan_revision')
    .eq('task_id', a.task_id)
    .in('kind', ['request', 'prototype'])
    .order('position');
  const line = (f: Record<string, unknown>, i: number) => `${i + 1}. [${ROLE[String(f.role)] ?? f.role}] ${f.file_name}${f.note ? ` — ${f.note}` : ''}`;
  const { data: pApproval } = await userClient
    .from('approvals')
    .select('id')
    .eq('task_id', a.task_id)
    .eq('gate', 'P')
    .eq('decision', 'approved')
    .eq('approved_revision', a.plan_revision)
    .limit(1);

  // 원자적 예약(E 승인·시작 준비·하루 상한·동시 작업 상한·앞 작업)
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const cap = Math.min(HARD_DAILY_CAP, Number(env('CLAUDE_DAILY_CAP')) || HARD_DAILY_CAP);
  const { data: claim, error: claimError } = await admin.rpc('claim_claude_dev', {
    p_assignment: a.id,
    p_owner: user.id,
    p_allow_retry: Boolean(body.acknowledgeRetry),
    p_cap: cap,
  });
  if (claimError) {
    const m = claimError.message;
    if (m.includes('dependency not finished')) return reply(409, { ok: false, error: `앞 작업이 아직 끝나지 않았습니다(${m.split(':').pop()?.trim()}).` });
    if (m.includes('concurrent execution limit')) return reply(409, { ok: false, error: 'Claude 동시 작업 상한에 걸렸습니다. 진행 중 작업을 끝내거나 상한을 올리세요.' });
    return reply(500, { ok: false, error: `예약 실패: ${m}` });
  }
  const row = Array.isArray(claim) ? claim[0] : claim;
  if (!row?.ok) {
    const why: Record<string, string> = {
      daily_cap: `오늘 Claude Cloud 실행 ${cap}회(PM 포함)를 모두 썼습니다.`,
      not_approved: '이 작업의 E 승인이 없습니다.',
      stale_plan: '최신 계획의 작업이 아닙니다.',
      not_claimable: '이미 시작했거나 시작할 수 없는 상태입니다. 실패한 경우 세션을 확인한 뒤 확인 체크 후 다시 시작하세요.',
      not_claude: 'Claude에 배정된 작업만 시작합니다.',
    };
    return reply(row?.reason === 'daily_cap' ? 429 : 409, { ok: false, error: why[row?.reason] ?? '시작할 수 없습니다.' });
  }

  const text = buildDevPayload({
    taskId: a.task_id,
    repo: project.repo,
    projectName: project.name,
    specRevision: spec.revision,
    planRevision: a.plan_revision,
    finalPrompt: spec.final_prompt,
    changeScope: spec.change_scope ?? '',
    preserveConstraints: spec.preserve_constraints ?? '',
    testCriteria: spec.test_criteria ?? '',
    item: {
      id: String(item.id),
      title: String(item.title ?? a.title ?? ''),
      goal: String(item.goal ?? ''),
      acceptance_tests: Array.isArray(item.acceptance_tests) ? (item.acceptance_tests as string[]) : [],
      preserve_constraints: Array.isArray(item.preserve_constraints) ? (item.preserve_constraints as string[]) : [],
    },
    attachments: (files ?? []).filter((f) => f.kind === 'request').map(line),
    prototypes: pApproval?.length ? (files ?? []).filter((f) => f.kind === 'prototype' && f.plan_revision === a.plan_revision).map(line) : [],
  });

  const fail = async (message: string, status: number) => {
    await admin.from('agent_assignments').update({ dispatch_status: 'failed', actual_provider_status: message.slice(0, 300) }).eq('id', a.id);
    return reply(status, { ok: false, error: message });
  };

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
    return fail(`Claude 보조 개발 시작 실패 HTTP ${res.status}: ${hint} ${detail}`.trim(), 502);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const sessionUrl = (data.claude_code_session_url as string | undefined) ?? null;
  const sessionId = (data.claude_code_session_id as string | undefined) ?? null;

  // 세션 시작만 서버가 확인했다(완료 아님).
  await admin
    .from('agent_assignments')
    .update({
      dispatch_status: 'started',
      status_source: 'server_verified',
      provider_execution_id: sessionId,
      provider_task_url: sessionUrl,
      actual_provider_status: 'session_started',
      last_verified_at: new Date().toISOString(),
    })
    .eq('id', a.id);

  return reply(200, { ok: true, sessionUrl });
});
