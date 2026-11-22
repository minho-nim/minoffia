// Claude 보조 개발: PM 계획에서 Claude에 배정한 작업을, E 승인 뒤 두 번째 루틴('MinLab AI Office 보조 개발')으로 시작한다.
// 세션 시작(HTTP 200)은 '시작됨'까지만 기록한다(완료 아님). Claude는 B 승인 전에는 세션 안에서만 작업하고 푸시·PR을 하지 않는다.
// 비밀값(CLAUDE_SUPPORT_FIRE_URL, CLAUDE_SUPPORT_TOKEN)은 이 함수의 secrets에만 둔다. 하루 상한은 PM 전송과 함께 센다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { buildDevPayload, claudeBranch } from './payload.ts';
import { loadPickedDesignSection } from './designDraft.ts';
import { skillPickRule } from './skillPick.ts';
import { loadRules, previewUrl } from './projectRules.ts';
import { SLIM_MARKER_SKILL } from './devHabits.ts';
import { appMapSection } from './appMap.ts';

/** v0.7.98 소유자 "하루 상한 삭제": 기본은 상한 없음. 서버 설정 CLAUDE_DAILY_CAP을 주면 그 값으로 다시 막는다 */
const NO_DAILY_CAP = 1_000_000;
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

/** 점검 때 만든 앱 지도(v0.5.95). 없거나 못 읽으면 빈칸 */
// deno-lint-ignore no-explicit-any
async function loadAppMap(admin: any, ownerId: string, projectId: string): Promise<string> {
  try {
    const { data } = await admin.storage.from('attachments').download(`${ownerId}/projects/${projectId}/health.json`);
    return data ? appMapSection(JSON.parse(await data.text()).appMap) : '';
  } catch {
    return '';
  }
}

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

  let body: { assignmentId?: string; acknowledgeRetry?: boolean; ownerId?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  // v0.6.28(소유자 "앱을 닫아 둬도 진행"): 서버(submit-plan·submit-result)가 서버 키로 부를 수 있다. 이때는 업무 주인을 직접 확인한다.
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const internal = Boolean(serviceKey) && req.headers.get('Authorization') === `Bearer ${serviceKey}`;
  const userClient = internal
    ? createClient(env('SUPABASE_URL'), serviceKey)
    : createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  let user: { id: string };
  if (internal) {
    if (!/^[0-9a-f-]{36}$/i.test(String(body.ownerId ?? ''))) return reply(400, { ok: false, error: 'ownerId가 필요합니다.' });
    user = { id: String(body.ownerId) };
  } else {
    const { data: auth } = await userClient.auth.getUser();
    if (!auth?.user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
    if ((auth.user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 실행할 수 있습니다.' });
    user = auth.user;
  }

  // RLS를 거쳐 내 기록만 읽는다(서버 호출이면 주인 조건을 직접 건다).
  const { data: a } = await userClient.from('agent_assignments').select('*').eq('id', body.assignmentId ?? '').eq('owner_id', user.id).maybeSingle();
  if (!a) return reply(404, { ok: false, error: '배정된 작업을 찾을 수 없습니다.' });
  if (a.assignee !== 'claude') return reply(400, { ok: false, error: 'Claude에 배정된 작업만 시작합니다.' });
  const { data: task } = await userClient.from('tasks').select('id, project_id, skills, projects(name, repo, preview_host)').eq('id', a.task_id).maybeSingle();
  const project = task?.projects as unknown as { name: string; repo: string | null; preview_host: string | null } | null;
  const { data: spec } = await userClient
    .from('task_specs')
    .select('revision, user_original_text, final_prompt, change_scope, preserve_constraints, test_criteria, size_hint')
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
  const cap = Number(env('CLAUDE_DAILY_CAP')) || NO_DAILY_CAP;
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

  // 결과 자동 저장(v0.4.3): 이 작업 전용 1회용 제출표. 해시만 저장한다(24시간, 3번까지). 로그인 정보가 아니고 결과 한 개를 넣는 데만 쓰인다.
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

  const appMap = await loadAppMap(admin, user.id, String(task.project_id));
  // v0.7.13: 소유자가 고른 Gemini 시안이 있으면 기획서 뒤에 붙인다
  const design = await loadPickedDesignSection(admin, a.task_id, spec.revision);
  const textBase = buildDevPayload({
    bug: (spec.size_hint as { bug?: boolean } | null)?.bug,
    taskId: a.task_id,
    repo: project.repo,
    projectName: project.name,
    specRevision: spec.revision,
    planRevision: a.plan_revision,
    finalPrompt: `${spec.final_prompt}${design}`,
    original: String(spec.user_original_text ?? ''),
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
    submit: ticketError ? undefined : { url: `${env('SUPABASE_URL')}/functions/v1/submit-result`, token: ticket },
    // v0.4.57: 앞선 업무에서 AI가 적어 둔 이 프로젝트의 지켜야 할 것, 브랜치 미리보기 주소
    projectRules: [...(await loadRules(userClient, task.project_id)), ...skillPickRule((task as { skills?: string[] | null }).skills)],
    // v0.6.82: 규칙 칸·개발 스킬이 들어 있는 저장소면 지시서를 짧게(스킬 상태는 skill_cache, 없으면 예전처럼 전부)
    slim: await userClient.from('skill_cache').select('map').maybeSingle().then(({ data }) => !!(data?.map as Record<string, Record<string, string>> | null)?.[String(task.project_id)]?.[SLIM_MARKER_SKILL], () => false),
    previewUrl: previewUrl(project.preview_host, claudeBranch(a.task_id, String(item.id))),
  });
  // v0.7.41 LLM 위키: 이 프로젝트의 지난 업무를 AI가 정리한 한 장(참고 자료)
  const { data: wikiRow } = await userClient.from('project_wiki').select('body').eq('project_id', task.project_id).maybeSingle();
  const wikiBody = String(wikiRow?.body ?? '').trim();
  const wiki = wikiBody ? `\n\n## 프로젝트 위키(참고 자료, 지난 업무를 AI가 정리한 것 — 저장소를 뒤지기 전에 먼저 본다)\n${wikiBody.slice(0, 4000)}` : '';
  const text = `${appMap ? `${textBase}\n\n${appMap}` : textBase}${wiki}`;

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
