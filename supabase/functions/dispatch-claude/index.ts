// Claude Code Cloud Routine을 HTTP 트리거로 실행한다.
// 비밀값(Fire URL, Bearer token)은 이 함수의 secrets에만 둔다. 브라우저로 내려보내지 않는다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

/** 코드 상한. CLAUDE_DAILY_CAP을 더 크게 줘도 이 값을 넘지 않는다. */
const HARD_DAILY_CAP = 2;
const FIRE_TIMEOUT_MS = 20_000;

const env = (key: string) => Deno.env.get(key) ?? '';

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

  const fireUrl = env('CLAUDE_ROUTINE_FIRE_URL');
  const token = env('CLAUDE_ROUTINE_TOKEN');
  const allowedRepo = env('CLAUDE_ALLOWED_REPOSITORY');
  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  if (!fireUrl || !token || !allowedRepo || !ownerEmail) {
    return reply(500, { ok: false, error: '서버 설정이 빠졌습니다. CLAUDE_ROUTINE_* / OFFICE_OWNER_EMAIL secrets를 확인하세요.' });
  }

  // 1. 로그인한 소유자인지 확인
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
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
  if (!body.taskId) return reply(400, { ok: false, error: 'taskId가 없습니다.' });

  // 2. RLS를 거쳐 내 업무만 읽는다.
  const { data: task } = await userClient
    .from('tasks')
    .select('id, title, description, type, priority, assignee, status, dispatch_state, project_id, projects(name, repo)')
    .eq('id', body.taskId)
    .maybeSingle();
  if (!task) return reply(404, { ok: false, error: '업무를 찾을 수 없습니다.' });
  if (task.assignee !== 'claude') return reply(400, { ok: false, error: 'Claude 담당 업무만 실행할 수 있습니다.' });

  // 3. 허용된 저장소 하나만
  const project = task.projects as unknown as { name: string; repo: string | null } | null;
  if (!project?.repo || project.repo.toLowerCase() !== allowedRepo.toLowerCase()) {
    return reply(403, { ok: false, error: `허용된 저장소(${allowedRepo})의 프로젝트만 실행할 수 있습니다.` });
  }

  // 4. 원자적 예약(일일 상한 + 중복 실행 방지)
  const cap = Math.min(HARD_DAILY_CAP, Number(env('CLAUDE_DAILY_CAP')) || HARD_DAILY_CAP);
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: claim, error: claimError } = await admin.rpc('claim_claude_dispatch', {
    p_task: task.id,
    p_owner: user.id,
    p_allow_retry: Boolean(body.acknowledgeRetry),
    p_cap: cap,
  });
  if (claimError) return reply(500, { ok: false, error: `예약 실패: ${claimError.message}` });
  const row = Array.isArray(claim) ? claim[0] : claim;
  if (!row?.ok) {
    if (row?.reason === 'daily_cap') return reply(429, { ok: false, error: `오늘 Claude Cloud 실행 ${cap}회를 모두 썼습니다.` });
    return reply(409, {
      ok: false,
      error: '이미 전송했거나 실패한 업무입니다. 실패한 경우 Routines History를 확인한 뒤 확인 체크 후 다시 실행하세요.',
    });
  }

  const fail = async (message: string, status: number) => {
    await admin
      .from('tasks')
      .update({ dispatch_state: 'failed', dispatch_error: message, status: 'blocked' })
      .eq('id', task.id);
    return reply(status, { ok: false, error: message });
  };

  // 5. 루틴 실행. 사용자가 보낸 내용은 <routine-fire-payload>로 전달된다.
  const text = [
    `MinLab AI Office 업무 (작업 ID ${task.id})`,
    `저장소: ${project.repo}`,
    `프로젝트: ${project.name}`,
    `유형: ${task.type} / 우선순위: ${task.priority}`,
    ``,
    `할 일: ${task.title}`,
    task.description ? `설명: ${task.description}` : '',
    ``,
    `규칙: 새 브랜치 ai/claude/${String(task.id).slice(0, 8)}에서 작업하고 PR만 연다. main 푸시·병합·배포 금지.`,
  ]
    .filter((l) => l !== '')
    .join('\n');

  let res: Response;
  try {
    res = await fetch(fireUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        ...(env('CLAUDE_ROUTINE_BETA') ? { 'anthropic-beta': env('CLAUDE_ROUTINE_BETA') } : {}),
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(FIRE_TIMEOUT_MS),
    });
  } catch (e) {
    return fail(
      `Claude가 응답하지 않았습니다(${(e as Error).name}). 실제로 실행됐을 수 있으니 Routines History를 먼저 확인하세요.`,
      504,
    );
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    const hint =
      res.status === 401 || res.status === 403
        ? '토큰이 틀렸거나 만료됐습니다.'
        : res.status === 429
          ? 'Claude 사용량 한도에 걸렸습니다.'
          : '루틴 설정을 확인하세요.';
    return fail(`Claude 실행 실패 HTTP ${res.status}: ${hint} ${detail}`.trim(), 502);
  }

  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  const sessionUrl =
    (data.claude_code_session_url as string | undefined) ?? (data.session_url as string | undefined) ?? (data.url as string | undefined) ?? null;

  // 시작만 기록한다. 완료는 사람이 PR을 확인하고 표시한다.
  await admin
    .from('tasks')
    .update({ dispatch_state: 'dispatched', dispatch_session_url: sessionUrl, dispatch_error: null, status: 'in_progress' })
    .eq('id', task.id);

  return reply(200, { ok: true, sessionUrl });
});
