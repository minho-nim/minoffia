// Claude 웹 조사(v0.7.11, 소유자 2026-11-14 "Exa 검색이 안 되면 클로드로"): 대화에서 Exa 웹 검색이 안 됐을 때 소유자가
// 'Claude에게 찾아보기'를 누르면 Claude 보조 루틴(Claude Pro 사용량, 추가 결제 없음)에 질문을 맡긴다.
// Claude는 웹 검색 뒤 1회용 제출표로 submit-research에 답을 보내고, 앱은 claude_research 표에서 읽어 대화창에 띄운다.
// 자동으로 넘기지 않는다(누를 때만). Claude 휴가·하루 상한(dispatch와 같은 usage_runs 'claude' 'cloud')을 지킨다.
// 비밀값(Fire URL·토큰)은 이 함수의 secrets에만. 브라우저로 내려보내지 않는다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { buildResearchPayload, RESEARCH_TICKET_HOURS } from './payload.ts';

const CLAUDE_HARD_DAILY_CAP = 20;
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

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST만 받습니다.' });
  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });
  const fireUrl = env('CLAUDE_SUPPORT_FIRE_URL');
  const fireToken = env('CLAUDE_SUPPORT_TOKEN');
  if (!fireUrl || !fireToken) return reply(503, { ok: false, error: 'Claude 루틴 연결(CLAUDE_SUPPORT_*)이 없습니다.' });

  let body: { question?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  const question = String(body.question ?? '').trim();
  if (!question || question.length > 4000) return reply(400, { ok: false, error: '질문은 1~4000자여야 합니다.' });

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((auth.user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });
  const user = auth.user;
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

  const { data: leave } = await admin.from('agent_leave').select('agent').eq('owner_id', user.id).eq('agent', 'claude');
  if (leave?.length) return reply(409, { ok: false, leave: true, error: 'Claude가 휴가예요. 팀 관리에서 근무로 돌리면 찾아볼 수 있어요.' });
  // 같은 질문이 아직 기다리는 중이면 다시 보내지 않는다(중복 호출 막기)
  const { data: waiting } = await admin.from('claude_research').select('id, session_url').eq('owner_id', user.id).eq('question', question).eq('status', 'pending').gt('expires_at', new Date().toISOString()).limit(1);
  if (waiting?.length) return reply(200, { ok: true, id: waiting[0].id, sessionUrl: waiting[0].session_url ?? null, already: true });
  const cap = Math.min(CLAUDE_HARD_DAILY_CAP, Number(env('CLAUDE_DAILY_CAP')) || CLAUDE_HARD_DAILY_CAP);
  const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const { count: used } = await admin.from('usage_runs').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).eq('agent', 'claude').eq('kind', 'cloud').eq('day', day);
  if ((used ?? 0) >= cap) return reply(429, { ok: false, error: `오늘 Claude 사용 ${cap}회를 모두 썼어요. 내일 다시 찾아볼 수 있어요.` });

  const ticket = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const { data: made, error } = await admin
    .from('claude_research')
    .insert({ owner_id: user.id, question, token_hash: await sha256Hex(ticket), expires_at: new Date(Date.now() + RESEARCH_TICKET_HOURS * 3600_000).toISOString() })
    .select('id')
    .single();
  if (error || !made) return reply(500, { ok: false, error: '조사 기록을 만들지 못했습니다.' });

  const text = buildResearchPayload({ id: made.id, question, submit: { url: `${env('SUPABASE_URL')}/functions/v1/submit-research`, token: ticket } });
  try {
    const res = await fetch(fireUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${fireToken}`, 'Content-Type': 'application/json', 'anthropic-version': ANTHROPIC_VERSION },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(FIRE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const sessionUrl = (data.claude_code_session_url as string | undefined) ?? null;
    await admin.from('usage_runs').insert({ owner_id: user.id, agent: 'claude', kind: 'cloud' });
    if (sessionUrl) await admin.from('claude_research').update({ session_url: sessionUrl }).eq('id', made.id);
    return reply(200, { ok: true, id: made.id, sessionUrl });
  } catch (e) {
    await admin.from('claude_research').update({ status: 'failed', answer: `Claude를 시작하지 못했어요(${(e as Error).message})` }).eq('id', made.id);
    return reply(502, { ok: false, error: `Claude를 시작하지 못했어요(${(e as Error).message}).` });
  }
});
