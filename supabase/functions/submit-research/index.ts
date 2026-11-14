// Claude 웹 조사 답 받기(v0.7.11): ask-claude-research가 맡긴 조사의 답을 Claude 세션이 이 함수로 보낸다(로그인 없이, 1회용 제출표로 확인).
// 표는 해시만 저장(조사 하나 전용, 2시간, 3번까지). 기다리는 중인 조사에만 답을 한 번 넣는다.
// verify_jwt = false(세션에 Supabase 로그인이 없다). 대신 제출표가 맞아야만 그 조사 한 줄을 채운다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { cleanSources } from './payload.ts';

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
  let body: { id?: string; token?: string; answer?: unknown; sources?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: 'body is not JSON' });
  }
  const id = String(body.id ?? '');
  const token = String(body.token ?? '');
  if (!UUID.test(id) || token.length < 32 || token.length > 200) return reply(400, { ok: false, error: 'id or token missing' });
  const answer = typeof body.answer === 'string' ? body.answer.trim().slice(0, 6000) : '';
  if (!answer) return reply(400, { ok: false, error: 'answer must be a non-empty string' });

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: row } = await admin.from('claude_research').select('id, status, uses, expires_at').eq('id', id).eq('token_hash', await sha256Hex(token)).maybeSingle();
  if (!row) return reply(403, { ok: false, error: 'invalid token' });
  if (new Date(row.expires_at).getTime() < Date.now()) return reply(403, { ok: false, error: 'token expired' });
  if (row.uses >= MAX_USES) return reply(429, { ok: false, error: 'token used up' });
  if (row.status !== 'pending') return reply(200, { ok: true, message: '이미 답이 들어간 조사입니다.' });
  const { data: saved, error } = await admin
    .from('claude_research')
    .update({ status: 'done', answer, sources: cleanSources(body.sources), uses: row.uses + 1, answered_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .eq('uses', row.uses)
    .select('id');
  if (error) return reply(500, { ok: false, error: 'could not save answer' });
  if (!saved?.length) return reply(409, { ok: false, error: 'retry' });
  return reply(200, { ok: true, message: 'AI Office에 조사 답을 보냈습니다.' });
});
