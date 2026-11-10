// PM 계획 자동 저장: Claude PM 세션이 계획 JSON을 이 함수로 보낸다(로그인 없이, 1회용 제출표로 확인).
// 제출표는 dispatch-claude가 PM 전송 때 만들고 해시만 저장한다(이 업무·이 기획서 버전 전용, 6시간, 3번까지).
// 받은 계획은 pm_plan_inbox에 원문으로만 넣는다. 검증·배정은 앱이 기존 규칙(parsePmPlan)으로 하고, 실행은 E 승인 전에는 없다.
// verify_jwt = false(세션에 Supabase 로그인이 없다). 대신 제출표가 맞아야만 한 줄을 넣을 수 있다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { saveRules } from './projectRules.ts';
import { importOnServer } from './importPlan.ts';
import { autoRun } from './autoRun.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const MAX_PLAN = 65_000;
const MAX_USES = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const env = (key: string) => (Deno.env.get(key) ?? '').trim();

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST only' });
  let body: { task_id?: string; token?: string; plan?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: 'body is not JSON' });
  }
  const taskId = String(body.task_id ?? '');
  const token = String(body.token ?? '');
  if (!UUID.test(taskId) || token.length < 32 || token.length > 200) return reply(400, { ok: false, error: 'task_id or token missing' });
  if (typeof body.plan !== 'object' || body.plan === null) return reply(400, { ok: false, error: 'plan must be a JSON object' });
  const planText = JSON.stringify(body.plan, null, 2);
  if (planText.length > MAX_PLAN) return reply(413, { ok: false, error: 'plan too large' });

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: ticket } = await admin
    .from('plan_submit_tokens')
    .select('id, owner_id, task_id, spec_revision, uses, expires_at')
    .eq('token_hash', await sha256Hex(token))
    .eq('task_id', taskId)
    .maybeSingle();
  // 틀린 제출표와 없는 업무를 구별하지 않는다.
  if (!ticket) return reply(403, { ok: false, error: 'invalid token' });
  if (new Date(ticket.expires_at).getTime() < Date.now()) return reply(403, { ok: false, error: 'token expired' });
  if (ticket.uses >= MAX_USES) return reply(429, { ok: false, error: 'token used up' });

  // 쓴 횟수를 먼저 올린다(같은 값일 때만: 동시에 두 번 보내도 상한을 넘지 않게).
  const { data: bumped } = await admin
    .from('plan_submit_tokens')
    .update({ uses: ticket.uses + 1 })
    .eq('id', ticket.id)
    .eq('uses', ticket.uses)
    .select('id');
  if (!bumped?.length) return reply(409, { ok: false, error: 'retry' });

  // v0.6.11: 서버가 먼저 계획·작업으로 저장해 본다(앱이 닫혀 있어도 진행). 저장했으면 받은 줄을 '받음'으로 넣어
  // 앱이 같은 계획을 또 저장하지 않게 하고, 못 했으면 예전처럼 '새 줄'로 넣어 앱이 이유와 함께 처리한다.
  const server = await importOnServer(admin, ticket.owner_id, ticket.task_id, ticket.spec_revision, planText).catch((e) => ({ saved: false as const, reason: String((e as Error).message) }));
  const { error } = await admin.from('pm_plan_inbox').insert({
    owner_id: ticket.owner_id,
    task_id: ticket.task_id,
    spec_revision: ticket.spec_revision,
    plan_text: planText,
    ...(server.saved ? { status: 'imported', note: `서버가 바로 저장(계획 v${server.planRevision})` } : {}),
  });
  if (error) return reply(500, { ok: false, error: 'could not save plan' });
  // v0.4.57: PM이 적어 보낸 "앞으로도 지켜야 할 것"은 프로젝트에 쌓는다(계획 검증과 별개, 실패해도 계획은 저장됨).
  await saveRules(admin, ticket.owner_id, ticket.task_id, 'plan', (body.plan as Record<string, unknown>).project_rules);
  // v0.6.28(소유자 "앱을 닫아 둬도 진행"): 서버가 저장했으면 실행 승인(기획 승인에 포함)을 기록하고 담당 AI를 바로 시작한다
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (server.saved && serviceKey) {
    const run = autoRun(admin, ticket.owner_id, ticket.task_id, env('SUPABASE_URL'), serviceKey).then((l) => console.log(JSON.stringify({ fn: 'submit-plan', autoRun: l })), () => undefined);
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(run);
    else await run;
  }
  return reply(200, { ok: true, message: 'AI Office에 계획을 보냈습니다. 기획 승인된 업무라 AI Office가 실행 승인을 기록하고 담당 AI를 시작합니다.' });
});
