// Claude Code Cloud Routine(PM)을 HTTP 트리거로 시작한다.
// v0.2.1: A 승인된 최신 기획서 버전만 보낸다. Claude는 계획만 만들고 저장소에 쓰지 않는다.
// 비밀값(Fire URL, Bearer token)은 이 함수의 secrets에만 둔다. 브라우저로 내려보내지 않는다.
// 요청 형식 근거: https://platform.claude.com/docs/en/api/claude-code/routines-fire (2026-10-29 확인)
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

/** 코드 상한. CLAUDE_DAILY_CAP을 더 크게 줘도 이 값을 넘지 않는다. */
const HARD_DAILY_CAP = 20;
const FIRE_TIMEOUT_MS = 20_000;
/** 공식 문서 예시 버전. 2023-06-01 이후 모든 버전을 같은 동작으로 받는다. */
const ANTHROPIC_VERSION = '2026-10-21';

// 대시보드에 붙여넣을 때 섞인 앞뒤 공백·줄바꿈은 지운다.
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
    .select('id, title, description, type, priority, assignee, status, dispatch_state, dispatch_at, project_id, projects(name, repo)')
    .eq('id', body.taskId)
    .maybeSingle();
  if (!task) return reply(404, { ok: false, error: '업무를 찾을 수 없습니다.' });
  if (task.assignee !== 'claude') return reply(400, { ok: false, error: 'Claude 담당 업무만 실행할 수 있습니다.' });

  // 3. A 승인된 최신 기획서만 (RLS를 거쳐 내 기록만 읽는다)
  const { data: spec } = await userClient
    .from('task_specs')
    .select('revision, intent, user_original_text, final_prompt, change_scope, preserve_constraints, test_criteria')
    .eq('task_id', task.id)
    .order('revision', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!spec) return reply(409, { ok: false, error: '기획서가 없습니다. GPT 기획 결과를 먼저 저장하세요.' });
  const { data: aApproval } = await userClient
    .from('approvals')
    .select('id')
    .eq('task_id', task.id)
    .eq('gate', 'A')
    .eq('decision', 'approved')
    .eq('approved_revision', spec.revision)
    .maybeSingle();
  if (!aApproval) return reply(409, { ok: false, error: `기획서 v${spec.revision}의 A 승인이 없습니다.` });

  // 결과 검토에서 보낸 수정 요청(마지막 전송 뒤의 것)이 있으면 함께 보낸다.
  let revisionQuery = userClient
    .from('revision_requests')
    .select('result_revision, feedback, created_at')
    .eq('task_id', task.id)
    .eq('spec_revision', spec.revision)
    .order('created_at', { ascending: false })
    .limit(1);
  if (task.dispatch_at) revisionQuery = revisionQuery.gt('created_at', task.dispatch_at);
  const { data: revision } = await revisionQuery.maybeSingle();
  const { data: previousResult } = revision
    ? await userClient
        .from('result_packages')
        .select('summary, remaining_issues')
        .eq('task_id', task.id)
        .eq('revision', revision.result_revision)
        .maybeSingle()
    : { data: null };

  // 요청 자료 이미지 목록(파일 이름·역할·설명만). PM은 이미지를 볼 수 없으므로 내용을 추측하지 않게 알린다.
  const { data: images } = await userClient
    .from('attachments')
    .select('id, role, note, file_name')
    .eq('task_id', task.id)
    .eq('kind', 'request')
    .order('position');
  const ROLE: Record<string, string> = { current: '현재 화면', target: '목표·참고 디자인', error: '오류 화면', reference: '기타 참고' };
  const imageLines = (images ?? []).map(
    (a, i) => `${i + 1}. [${ROLE[a.role] ?? a.role}] ${a.file_name}${a.note ? ` — ${a.note}` : ''} (첨부 ${String(a.id).slice(0, 8)})`,
  );

  // 4. 허용된 저장소 하나만
  const project = task.projects as unknown as { name: string; repo: string | null } | null;
  if (!project?.repo || project.repo.toLowerCase() !== allowedRepo.toLowerCase()) {
    return reply(403, { ok: false, error: `허용된 저장소(${allowedRepo})의 프로젝트만 실행할 수 있습니다.` });
  }

  // 5. 원자적 예약(A 승인 버전 확인 + 일일 상한 + 같은 버전 중복 전송 방지)
  const cap = Math.min(HARD_DAILY_CAP, Number(env('CLAUDE_DAILY_CAP')) || HARD_DAILY_CAP);
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: claim, error: claimError } = await admin.rpc('claim_claude_dispatch', {
    p_task: task.id,
    p_owner: user.id,
    p_allow_retry: Boolean(body.acknowledgeRetry),
    p_cap: cap,
    p_spec_revision: spec.revision,
  });
  if (claimError) return reply(500, { ok: false, error: `예약 실패: ${claimError.message}` });
  const row = Array.isArray(claim) ? claim[0] : claim;
  if (!row?.ok) {
    if (row?.reason === 'daily_cap') return reply(429, { ok: false, error: `오늘 Claude Cloud 실행 ${cap}회를 모두 썼습니다.` });
    if (row?.reason === 'not_approved') return reply(409, { ok: false, error: '최신 기획서의 A 승인이 확인되지 않았습니다.' });
    return reply(409, {
      ok: false,
      error: '이 기획서 버전은 이미 PM에 보냈습니다. 결과를 고치려면 결과 검토에서 수정 요청을 먼저 기록하세요. 실패한 경우 Routines History를 확인한 뒤 확인 체크 후 다시 실행하세요.',
    });
  }

  const fail = async (message: string, status: number) => {
    await admin
      .from('tasks')
      .update({ dispatch_state: 'failed', dispatch_error: message, status: 'blocked', stage: 'integration_blocked' })
      .eq('id', task.id);
    return reply(status, { ok: false, error: message });
  };

  // 6. 루틴(PM) 실행. 사용자가 보낸 내용은 <routine-fire-payload>로 전달된다. 최대 65,536자.
  const text = [
    `MinLab AI Office 업무 (작업 ID ${task.id})`,
    `저장소: ${project.repo}`,
    `프로젝트: ${project.name}`,
    `승인된 기획서: v${spec.revision} (A 승인됨, 수정 금지)`,
    ``,
    `## 사용자 요청 원문`,
    spec.user_original_text,
    ``,
    `## 최종 개발 프롬프트`,
    spec.final_prompt,
    spec.change_scope ? `\n변경 범위: ${spec.change_scope}` : '',
    spec.preserve_constraints ? `유지 조건: ${spec.preserve_constraints}` : '',
    spec.test_criteria ? `테스트 기준: ${spec.test_criteria}` : '',
    ``,
    imageLines.length ? `## 요청 자료 이미지 ${imageLines.length}장 (이 세션에서는 볼 수 없음. 내용을 추측하지 말고 작업의 attachment_refs에 첨부 ID를 적는다)` : '',
    ...imageLines,
    ``,
    revision ? `## 결과 v${revision.result_revision} 검토 후 사용자 수정 요청 (새 계획 필요)` : '',
    revision ? revision.feedback : '',
    revision && previousResult?.summary ? `이전 결과 요약: ${previousResult.summary}` : '',
    revision && previousResult?.remaining_issues ? `이전 결과의 남은 문제: ${previousResult.remaining_issues}` : '',
    ``,
    `규칙: 작업 분해·배정 계획(JSON)만 작성한다. 저장소 쓰기·커밋·브랜치·푸시·PR·병합·배포 금지(B 승인 전 GitHub 업로드 금지).`,
  ]
    .filter((l) => l !== '')
    .join('\n')
    .slice(0, 65_000);

  let res: Response;
  try {
    res = await fetch(fireUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'anthropic-version': ANTHROPIC_VERSION,
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
          ? `루틴 시간당 실행 한도(루틴 30회·계정 100회)에 걸렸습니다.${res.headers.get('retry-after') ? ` ${res.headers.get('retry-after')}초 뒤 다시 시도하세요.` : ''}`
          : res.status === 400
            ? '요청 형식 오류이거나 루틴이 일시정지 상태입니다.'
            : '루틴 설정을 확인하세요.';
    return fail(`Claude 실행 실패 HTTP ${res.status}: ${hint} ${detail}`.trim(), 502);
  }

  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  // 공식 응답: { type: 'routine_fire', claude_code_session_id, claude_code_session_url }
  const sessionUrl = (data.claude_code_session_url as string | undefined) ?? null;

  // 세션 시작만 기록한다(HTTP 200 ≠ 계획 완료). 계획은 사용자가 세션에서 가져와 저장한다.
  await admin
    .from('tasks')
    .update({ dispatch_state: 'dispatched', dispatch_session_url: sessionUrl, dispatch_error: null, status: 'in_progress', stage: 'dispatching' })
    .eq('id', task.id);

  return reply(200, { ok: true, sessionUrl });
});
