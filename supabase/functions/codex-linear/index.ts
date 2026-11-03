// Codex를 Linear로 맡기기(v0.5.2, 소유자 2026-11-03 "ㄱㄱ", 결정 docs/CODEX_LINEAR_DECISION_2026-10-30.md).
// action 'start': 실행 승인(E)된 Codex 작업을 Linear 이슈(지시서 = 앱이 만든 Codex 지시서)로 만들고 Codex에게 맡긴다.
//   기본은 위임(delegateId, Linear 공식 에이전트 방식). CODEX_LINEAR_TRIGGER=mention이면 대신 @codex 멘션 댓글로 시작한다.
// action 'status': 그 이슈의 Codex 댓글만 읽어 진행 소식·작업 주소·시작 실패(한도·환경 없음)를 배정 기록에 남긴다(완료 판정은 사람이).
// 비밀값: LINEAR_API_KEY(소유자 계정 개인 키)는 secrets에만. 이슈 생성은 소유자 이름으로 된다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { CREATE_COMMENT, CREATE_ISSUE, issueInput, LOOKUP_QUERY, readLookup, readNews, STATUS_QUERY } from './linear.ts';

const MAX_TEXT = 60_000;
const env = (key: string) => (Deno.env.get(key) ?? '').trim();
const cors = {
  'Access-Control-Allow-Origin': env('OFFICE_ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function linear(key: string, query: string, variables: Record<string, unknown> = {}) {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: key },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown>; errors?: { message?: string }[] };
  if (!res.ok || !body.data) throw new Error(`Linear 응답 오류(HTTP ${res.status}) ${body.errors?.[0]?.message ?? ''}`.trim());
  return body.data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST만 받습니다.' });
  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  const key = env('LINEAR_API_KEY');
  const allowedRepo = env('CLAUDE_ALLOWED_REPOSITORY').toLowerCase();
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });
  if (!key) return reply(503, { ok: false, error: 'LINEAR_API_KEY가 없어 Codex(Linear)를 쓸 수 없어요. 지시서 복사로 진행하세요.' });

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });

  let body: { action?: string; assignmentId?: string; acknowledgeRetry?: boolean; text?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  // RLS를 거쳐 내 기록만 읽는다.
  const { data: a } = await userClient.from('agent_assignments').select('*').eq('id', body.assignmentId ?? '').maybeSingle();
  if (!a) return reply(404, { ok: false, error: '배정된 작업을 찾을 수 없습니다.' });
  if (a.assignee !== 'codex') return reply(400, { ok: false, error: 'Codex에 배정된 작업만 맡깁니다.' });
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

  // 진행 소식 읽기(읽기만, Linear에 아무것도 쓰지 않음)
  if (body.action === 'status') {
    if (!a.provider_execution_id || !String(a.actual_provider_status ?? '').startsWith('linear')) return reply(409, { ok: false, error: 'Linear로 맡긴 작업이 아닙니다.' });
    try {
      const news = readNews((await linear(key, STATUS_QUERY, { id: a.provider_execution_id })) as Parameters<typeof readNews>[0]);
      const note = news.kind === 'none' ? 'linear: Codex 소식 아직 없음' : `linear: ${news.kind === 'error' ? '시작 못 함 — ' : ''}${news.last}`;
      const patch: Record<string, unknown> = { actual_provider_status: note.slice(0, 300), last_verified_at: new Date().toISOString() };
      if (news.kind === 'error' && a.dispatch_status === 'started') patch.dispatch_status = 'failed';
      await admin.from('agent_assignments').update(patch).eq('id', a.id);
      return reply(200, { ok: true, ...news });
    } catch (e) {
      return reply(502, { ok: false, error: (e as Error).message });
    }
  }

  // 맡기기
  const text = (body.text ?? '').trim();
  if (!text || text.length > MAX_TEXT) return reply(400, { ok: false, error: `Codex 지시서는 1~${MAX_TEXT}자여야 합니다.` });
  const { data: task } = await userClient.from('tasks').select('id, title, projects(name, repo)').eq('id', a.task_id).maybeSingle();
  const project = task?.projects as unknown as { name: string; repo: string | null } | null;
  const repo = (project?.repo ?? '').toLowerCase();
  const { data: managed } = await userClient.from('managed_repos').select('full_name').eq('owner_id', user.id);
  const allowed = !!repo && repo !== 'minho-nim/minlab' && (repo === allowedRepo || (managed ?? []).some((m) => String(m.full_name).toLowerCase() === repo));
  if (!task || !project?.repo || !allowed) return reply(403, { ok: false, error: '허용된 저장소의 프로젝트만 Codex에 맡깁니다.' });

  let look: ReturnType<typeof readLookup>;
  try {
    look = readLookup((await linear(key, LOOKUP_QUERY)) as Parameters<typeof readLookup>[0], env('LINEAR_TEAM_KEY'));
  } catch (e) {
    return reply(502, { ok: false, error: (e as Error).message });
  }
  if (!look.teamId) return reply(409, { ok: false, error: 'Linear 팀을 찾지 못했어요.' });
  if (!look.codexId) return reply(409, { ok: false, error: 'Linear에서 Codex를 찾지 못했어요. Codex for Linear 설치와 팀 추가를 확인하세요.' });

  const { data: claim, error: claimError } = await admin.rpc('claim_codex_linear', { p_assignment: a.id, p_owner: user.id, p_allow_retry: Boolean(body.acknowledgeRetry) });
  if (claimError) return reply(500, { ok: false, error: `예약 실패: ${claimError.message}` });
  const row = Array.isArray(claim) ? claim[0] : claim;
  if (!row?.ok) {
    const why: Record<string, string> = {
      not_approved: '이 작업의 실행 승인(E)이 없습니다.',
      stale_plan: '최신 계획의 작업이 아닙니다.',
      not_claimable: '이미 맡겼거나 맡길 수 없는 상태입니다. 실패했다면 Linear 이슈를 확인한 뒤 확인 체크 후 다시 맡기세요.',
      not_codex: 'Codex에 배정된 작업만 맡깁니다.',
    };
    return reply(409, { ok: false, error: why[row?.reason] ?? '맡길 수 없습니다.' });
  }
  const fail = async (message: string, status: number) => {
    await admin.from('agent_assignments').update({ dispatch_status: 'failed', actual_provider_status: message.slice(0, 300) }).eq('id', a.id);
    return reply(status, { ok: false, error: message });
  };

  const mention = env('CODEX_LINEAR_TRIGGER') === 'mention';
  const description = [`저장소: ${project.repo}`, `AI Office 업무 ${a.task_id} · 작업 ${a.work_item_id} · 계획 v${a.plan_revision}`, '', text].join('\n');
  let issue: { id: string; identifier: string; url: string };
  try {
    const created = (await linear(key, CREATE_ISSUE, {
      input: issueInput({ teamId: look.teamId, codexId: mention ? null : look.codexId, canDelegate: look.canDelegate, title: `[AI Office] ${task.title} · ${a.work_item_id}`, description }),
    })) as { issueCreate?: { success?: boolean; issue?: { id: string; identifier: string; url: string } } };
    if (!created.issueCreate?.success || !created.issueCreate.issue) throw new Error('Linear 이슈를 만들지 못했습니다.');
    issue = created.issueCreate.issue;
    if (mention) await linear(key, CREATE_COMMENT, { input: { issueId: issue.id, body: '@codex 이 이슈의 지시서대로 진행해 줘. PR은 만들지 말고 작업만 해 줘.' } });
  } catch (e) {
    return fail(`Codex(Linear)에 맡기지 못했습니다: ${(e as Error).message}`, 502);
  }
  await admin
    .from('agent_assignments')
    .update({
      dispatch_status: 'started',
      status_source: 'server_verified',
      provider_execution_id: issue.id,
      provider_task_url: issue.url,
      actual_provider_status: `linear: ${issue.identifier} 맡김(Codex 소식 기다리는 중)`,
      last_verified_at: new Date().toISOString(),
    })
    .eq('id', a.id);
  return reply(200, { ok: true, issueUrl: issue.url, identifier: issue.identifier });
});
