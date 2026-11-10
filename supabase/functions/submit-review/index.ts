// v0.4.94 Claude 채점 받기: review-result가 보조 개발 루틴에 맡긴 채점 결과를 세션이 이 함수로 보낸다(로그인 없이, 1회용 제출표로 확인).
// 제출표는 review-result가 만들고 해시만 저장한다(결과 버전 하나 전용, 6시간, 3번까지).
// 판정은 서버가 Gemini 채점과 같은 규칙(rubric.ts = src/domain/review.ts 복사)으로 다시 계산해 result_reviews에 한 번만 넣는다.
// verify_jwt = false(세션에 Supabase 로그인이 없다). 대신 제출표가 맞아야만 한 줄을 넣을 수 있다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { requestRedoOnServer } from './redo.ts';
import { parseScore, ranChecks, redoFeedback, ruleCheck, total, verdictOf } from './rubric.ts';

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
  let body: { task_id?: string; token?: string; result_revision?: number; review?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: 'body is not JSON' });
  }
  const taskId = String(body.task_id ?? '');
  const token = String(body.token ?? '');
  if (!UUID.test(taskId) || token.length < 32 || token.length > 200) return reply(400, { ok: false, error: 'task_id or token missing' });
  const score = parseScore(typeof body.review === 'string' ? body.review : JSON.stringify(body.review ?? null));
  if (!score) return reply(400, { ok: false, error: 'review must be the score JSON ({"parts":{...},"criteria":[...],...})' });

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: ticket } = await admin
    .from('plan_submit_tokens')
    .select('id, owner_id, task_id, result_revision, uses, expires_at')
    .eq('token_hash', await sha256Hex(token))
    .eq('task_id', taskId)
    .eq('kind', 'review')
    .maybeSingle();
  if (!ticket || !ticket.result_revision) return reply(403, { ok: false, error: 'invalid token' });
  if (new Date(ticket.expires_at).getTime() < Date.now()) return reply(403, { ok: false, error: 'token expired' });
  if (ticket.uses >= MAX_USES) return reply(429, { ok: false, error: 'token used up' });
  const { data: bumped } = await admin.from('plan_submit_tokens').update({ uses: ticket.uses + 1 }).eq('id', ticket.id).eq('uses', ticket.uses).select('id');
  if (!bumped?.length) return reply(409, { ok: false, error: 'retry' });

  const { data: existing } = await admin.from('result_reviews').select('id, cross_total').eq('task_id', taskId).eq('result_revision', ticket.result_revision).maybeSingle();
  // v0.6.26: 기본 채점(Gemini)이 이미 있으면 이것은 소유자가 누른 '교차 채점'이다. 점수만 붙이고 판정은 그대로 둔다.
  if (existing) {
    if (existing.cross_total != null) return reply(200, { ok: true, message: '이미 교차 채점된 결과입니다.' });
    const reasonsOf = score.criteria.filter((c) => c.status !== 'met').map((c) => `${c.status === 'partial' ? '일부' : '미충족'}: ${c.text}`.slice(0, 160)).slice(0, 8);
    const { error: crossError } = await admin.from('result_reviews').update({ cross_total: total(score), cross_judge: 'Claude', cross_reasons: reasonsOf }).eq('id', existing.id).is('cross_total', null);
    if (crossError) return reply(500, { ok: false, error: 'could not save cross review' });
    return reply(200, { ok: true, total: total(score), message: 'AI Office에 교차 채점 점수를 보냈습니다.' });
  }

  const { data: result } = await admin.from('result_packages').select('plan_revision, work_item_id, diff, test_log').eq('task_id', taskId).eq('revision', ticket.result_revision).maybeSingle();
  const { data: spec } = await admin.from('task_specs').select('change_scope').eq('task_id', taskId).order('revision', { ascending: false }).limit(1).maybeSingle();
  if (!result) return reply(404, { ok: false, error: 'result not found' });
  let assignee = '';
  if (result.plan_revision) {
    const { data: a } = await admin.from('agent_assignments').select('assignee').eq('task_id', taskId).eq('plan_revision', result.plan_revision).eq('work_item_id', result.work_item_id).maybeSingle();
    assignee = String(a?.assignee ?? '');
  }
  const gates = ruleCheck({ diff: String(result.diff ?? ''), testLog: String(result.test_log ?? ''), changeScope: String(spec?.change_scope ?? '') });
  const { count: redos } = await admin.from('result_reviews').select('id', { count: 'exact', head: true }).eq('task_id', taskId).eq('verdict', 'redo');
  // v0.5.93: 지난 '다시 개발' 판정의 지적(같은 문제가 또 나오면 자동으로 돌리지 않음)과 시험·화면 확인 기록 유무
  const { data: lastRedo } = await admin.from('result_reviews').select('reasons').eq('task_id', taskId).eq('verdict', 'redo').lt('result_revision', ticket.result_revision).order('result_revision', { ascending: false }).limit(1).maybeSingle();
  const previousReasons = Array.isArray(lastRedo?.reasons) ? (lastRedo.reasons as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const { verdict, reasons } = verdictOf(gates, score, redos ?? 0, { executed: ranChecks(String(result.test_log ?? '')), previousReasons });
  const feedback = verdict === 'pass' ? '' : redoFeedback(gates, score, reasons);
  const { error } = await admin.from('result_reviews').insert({
    owner_id: ticket.owner_id,
    task_id: taskId,
    result_revision: ticket.result_revision,
    work_item_id: String(result.work_item_id ?? ''),
    assignee,
    gates,
    score,
    total: total(score),
    verdict,
    reasons,
    feedback,
    auto_redo: redos ?? 0,
    judge: 'Claude',
  });
  if (error && error.code !== '23505') return reply(500, { ok: false, error: 'could not save review' });
  // v0.6.12: '다시 개발'이면 서버가 바로 수정 요청·PM 재계획(앱이 닫혀 있어도)
  if (!error && verdict === 'redo' && feedback) {
    const redo = requestRedoOnServer(admin, ticket.owner_id, taskId, ticket.result_revision, feedback).catch(() => 'skipped');
    const er = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
    if (er) er.waitUntil(redo);
    else await redo;
  }
  return reply(200, { ok: true, total: total(score), verdict, message: 'AI Office에 점수를 보냈습니다.' });
});
