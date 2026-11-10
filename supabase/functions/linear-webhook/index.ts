// Linear 웹훅 받기(v0.5.3, 소유자 2026-11-03 "웹훅으로 바꿔줘"): Codex가 Linear 이슈에 댓글을 달면 Linear가 이 주소로 바로 알린다.
// 서명(LINEAR_WEBHOOK_SECRET)이 맞고 1분 안에 온 '댓글 생성'만 받는다. 우리가 Codex에 맡긴 이슈일 때만,
// 그 이슈의 Codex 댓글을 Linear API(LINEAR_API_KEY)로 다시 읽어(웹훅 본문의 글은 믿지 않음) 업무 카드 소식을 바꾸고 휴대폰 알림을 보낸다.
// verify_jwt = false(Linear는 Supabase 로그인이 없다). 대신 서명이 맞아야 한다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { readNews, STATUS_QUERY } from './linear.ts';
import { commentIssueId, fresh, signatureOk } from './verify.ts';

const env = (key: string) => (Deno.env.get(key) ?? '').trim();
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { ok: false });
  const secret = env('LINEAR_WEBHOOK_SECRET');
  const key = env('LINEAR_API_KEY');
  if (!secret || !key) return reply(503, { ok: false, error: 'not configured' });
  const raw = await req.text();
  if (raw.length > 200_000 || !(await signatureOk(raw, req.headers.get('linear-signature') ?? '', secret))) return reply(401, { ok: false });
  let payload: { type?: unknown; action?: unknown; data?: { issueId?: unknown } | null; webhookTimestamp?: unknown };
  try {
    payload = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false });
  }
  if (!fresh(payload.webhookTimestamp)) return reply(401, { ok: false });
  const issueId = commentIssueId(payload);
  if (!issueId) return reply(200, { ok: true, ignored: true });

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: a } = await admin
    .from('agent_assignments')
    .select('id, owner_id, task_id, dispatch_status, actual_provider_status, started_at')
    .eq('provider_execution_id', issueId)
    .eq('assignee', 'codex')
    .maybeSingle();
  if (!a || !String(a.actual_provider_status ?? '').startsWith('linear')) return reply(200, { ok: true, ignored: true });

  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: key },
    body: JSON.stringify({ query: STATUS_QUERY, variables: { id: issueId } }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const body = (await res?.json().catch(() => ({}))) as { data?: Parameters<typeof readNews>[0] } | undefined;
  if (!body?.data) return reply(502, { ok: false });
  const news = readNews(body.data, a.started_at);
  if (news.kind === 'none') return reply(200, { ok: true, ignored: true });

  const note = `linear: ${news.kind === 'error' ? '시작 못 함 — ' : ''}${news.last}`.slice(0, 300);
  if (note === a.actual_provider_status) return reply(200, { ok: true, same: true });
  const failed = news.kind === 'error' && (a.dispatch_status === 'starting' || a.dispatch_status === 'started');
  const { data: saved, error: saveError } = await admin
    .from('agent_assignments')
    .update({ actual_provider_status: note, last_verified_at: new Date().toISOString(), ...(failed ? { dispatch_status: 'failed' } : {}) })
    .eq('id', a.id).eq('provider_execution_id', issueId).eq('dispatch_status', a.dispatch_status).select('id').maybeSingle();
  if (saveError || !saved) return reply(502, { ok: false });
  await admin.rpc('push_enqueue', {
    p_owner: a.owner_id,
    p_task: a.task_id,
    p_kind: news.kind === 'error' ? 'blocked' : 'result',
    p_title: news.kind === 'error' ? 'Codex가 시작하지 못했어요' : 'Codex 소식이 왔어요',
  });
  return reply(200, { ok: true });
});
