// Linear 연결 확인(v0.4.11, 읽기만): 소유자가 버튼을 누르면 Linear 공식 GraphQL로 연결 상태만 읽는다.
// 이슈·댓글·위임을 만들지 않고, 키(LINEAR_API_KEY)는 secrets에만 둔다. 결정 문서 docs/CODEX_LINEAR_DECISION_2026-10-30.md 4-1단계.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { PROBE_QUERY, readProbe } from './probe.ts';

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

  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });
  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });

  const key = env('LINEAR_API_KEY');
  if (!key) return reply(200, { ok: true, connected: false, reason: 'LINEAR_API_KEY가 아직 없습니다. PC에서 Linear 설정 뒤 Supabase secrets에 넣어 주세요.' });

  let res: Response;
  try {
    res = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: key },
      body: JSON.stringify({ query: PROBE_QUERY }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    return reply(200, { ok: true, connected: false, reason: `Linear가 응답하지 않았습니다(${(e as Error).name}).` });
  }
  const body = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown>; errors?: { message?: string }[] };
  if (res.status === 401 || res.status === 403) return reply(200, { ok: true, connected: false, reason: 'Linear API 키가 틀렸거나 권한이 없습니다.' });
  if (!res.ok || !body.data) return reply(200, { ok: true, connected: false, reason: `Linear 응답 오류(HTTP ${res.status}) ${body.errors?.[0]?.message ?? ''}`.trim() });
  return reply(200, { ok: true, connected: true, ...readProbe(body.data) });
});
