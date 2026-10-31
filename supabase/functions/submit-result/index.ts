// Claude 보조 개발 결과 자동 저장: Claude 세션이 개발·시험을 끝내면 결과를 이 함수로 보낸다(로그인 없이, 1회용 제출표로 확인).
// 제출표는 dispatch-claude-dev가 세션을 시작할 때 만들고 해시만 저장한다(작업 하나 전용, 24시간, 3번까지).
// 받은 결과는 dev_result_inbox에 넣고, 앱이 작업·계획 버전을 확인해 결과 패키지로 옮긴다. GitHub에는 아무것도 올리지 않는다.
// verify_jwt = false(세션에 Supabase 로그인이 없다). 대신 제출표가 맞아야만 한 줄을 넣을 수 있다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const MAX_USES = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMITS = { summary: 4000, diff: 500_000, test_log: 100_000, remaining_issues: 4000, branch: 200, changed_files: 20_000 };

const env = (key: string) => (Deno.env.get(key) ?? '').trim();

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST only' });
  let body: { task_id?: string; token?: string; result?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: 'body is not JSON' });
  }
  const taskId = String(body.task_id ?? '');
  const token = String(body.token ?? '');
  if (!UUID.test(taskId) || token.length < 32 || token.length > 200) return reply(400, { ok: false, error: 'task_id or token missing' });
  const r = body.result;
  if (typeof r !== 'object' || r === null) return reply(400, { ok: false, error: 'result must be a JSON object' });
  const summary = text(r.summary, LIMITS.summary).trim();
  if (!summary) return reply(400, { ok: false, error: 'result.summary is required' });
  const files = Array.isArray(r.changed_files) ? r.changed_files.filter((f) => typeof f === 'string').join('\n') : text(r.changed_files, LIMITS.changed_files);

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: ticket } = await admin
    .from('plan_submit_tokens')
    .select('id, owner_id, task_id, assignment_id, uses, expires_at')
    .eq('token_hash', await sha256Hex(token))
    .eq('task_id', taskId)
    .eq('kind', 'result')
    .maybeSingle();
  if (!ticket || !ticket.assignment_id) return reply(403, { ok: false, error: 'invalid token' });
  if (new Date(ticket.expires_at).getTime() < Date.now()) return reply(403, { ok: false, error: 'token expired' });
  if (ticket.uses >= MAX_USES) return reply(429, { ok: false, error: 'token used up' });

  const { data: bumped } = await admin.from('plan_submit_tokens').update({ uses: ticket.uses + 1 }).eq('id', ticket.id).eq('uses', ticket.uses).select('id');
  if (!bumped?.length) return reply(409, { ok: false, error: 'retry' });

  const { error } = await admin.from('dev_result_inbox').insert({
    owner_id: ticket.owner_id,
    task_id: ticket.task_id,
    assignment_id: ticket.assignment_id,
    summary,
    changed_files: files.slice(0, LIMITS.changed_files),
    diff: text(r.diff, LIMITS.diff),
    test_log: text(r.test_log, LIMITS.test_log),
    remaining_issues: text(r.remaining_issues, LIMITS.remaining_issues),
    branch: text(r.branch, LIMITS.branch),
  });
  if (error) return reply(500, { ok: false, error: 'could not save result' });
  return reply(200, { ok: true, message: 'AI Office에 결과를 보냈습니다. 사용자가 올리기 승인(B)을 할 때까지 GitHub에 올리지 않습니다.' });
});
