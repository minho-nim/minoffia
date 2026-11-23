// Gemini 견본(무료, v0.4.7): "견본 먼저" 계획이면 견본 지시서로 HTML 견본 한 장을 만든다(소유자 승인 2026-10-31).
// 만든 HTML은 앱이 견본(kind prototype)으로 올리고, 사용자는 미리보기를 보고 견본 승인(P)만 한다. AI Studio Build 수동 견본도 그대로 쓸 수 있다.
// v0.4.94부터 근무 중인 Studio A·B가 하나씩(최대 두 장) 만들고 소유자가 하나를 고른다. 이 계획 버전에 견본이 이미 있으면 만들지 않는다. 키는 secrets(GEMINI_API_KEY = A·Studio A, GEMINI_API_KEY2 = B·Studio B)에만, 글은 저장하지 않고 횟수만 ai_calls(purpose prototype).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { extractHtml, PROTOTYPE_SYSTEM, stripActive } from './prototype.ts';
import { tokensOf, type GeminiTokens } from './geminiTokens.ts';
import { homepageStart } from './homepage.ts';
import { geminiFetch } from './gemini-fallback.ts';

/** 상한 없음을 뜻하는 큰 수(DB 함수에 정수로 넘길 수 있게) */
const NO_DAILY_CAP = 1_000_000;
const DEFAULT_MODEL = 'gemini-3.5-flash';
const MAX_TEXT = 40_000;
const TIMEOUT_MS = 90_000;

const env = (key: string) => (Deno.env.get(key) ?? '').trim();

const cors = {
  'Access-Control-Allow-Origin': env('OFFICE_ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function callGemini(key: string, model: string, text: string) {
  const res = await geminiFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: PROTOTYPE_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { maxOutputTokens: 16384, temperature: 0.5 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  const parts = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content?.parts ?? [];
  return { status: res.status, text: parts.map((p) => p.text ?? '').join('').trim(), message: (data as { error?: { message?: string } }).error?.message ?? '', tokens: tokensOf(data) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST만 받습니다.' });

  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  const keys = [env('GEMINI_API_KEY'), env('GEMINI_API_KEY2')];
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });
  if (!keys[0] && !keys[1]) return reply(503, { ok: false, error: 'Gemini 키가 설정되지 않았습니다(GEMINI_API_KEY). AI Studio 견본 지시서로 진행하세요.' });

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });

  let body: { taskId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  const text = (body.text ?? '').trim();
  if (!text || text.length > MAX_TEXT) return reply(400, { ok: false, error: `견본 지시서는 1~${MAX_TEXT}자여야 합니다.` });

  // RLS를 거쳐 내 업무만. 최신 계획이 견본 먼저이고, 이 계획 버전에 견본이 아직 없을 때만.
  const { data: task } = await userClient.from('tasks').select('id').eq('id', body.taskId ?? '').maybeSingle();
  if (!task) return reply(404, { ok: false, error: '업무를 찾을 수 없습니다.' });
  const { data: plan } = await userClient.from('pm_plans').select('plan_revision, plan').eq('task_id', task.id).order('plan_revision', { ascending: false }).limit(1).maybeSingle();
  if (!plan || (plan.plan as { development_mode?: string })?.development_mode !== 'prototype_first') return reply(409, { ok: false, error: '견본 먼저 계획이 아닙니다.' });
  const { count: existing } = await userClient.from('attachments').select('id', { count: 'exact', head: true }).eq('task_id', task.id).eq('kind', 'prototype').eq('plan_revision', plan.plan_revision);
  if ((existing ?? 0) > 0) return reply(409, { ok: false, error: '이 계획에는 이미 견본이 있습니다.' });

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  // v0.7.99 소유자 "모두 상한은 없이": 기본 상한 없음. 서버 설정 GEMINI_PROTOTYPE_DAILY_CAP을 주면 그 값
  const cap = Number(env('GEMINI_PROTOTYPE_DAILY_CAP')) || NO_DAILY_CAP;
  const kstMidnight = new Date(Math.floor((Date.now() + 9 * 3600_000) / 86400_000) * 86400_000 - 9 * 3600_000).toISOString();
  const { count } = await admin.from('ai_calls').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).eq('purpose', 'prototype').eq('ok', true).gte('created_at', kstMidnight);
  if ((count ?? 0) >= cap) return reply(429, { ok: false, error: `오늘 Gemini 견본 ${cap}회를 모두 썼습니다. AI Studio 견본 지시서로 진행하세요.` });

  const model = env('GEMINI_MODEL') || DEFAULT_MODEL;
  let last = { status: 0, message: '' };
  // 팀 관리 휴가(v0.4.44): 키 A = Studio A, 키 B = Studio B. 휴가인 쪽 키는 쓰지 않는다(표가 없거나 못 읽으면 모두 근무).
  const { data: awayRows } = await admin.from('agent_leave').select('agent').eq('owner_id', user.id);
  const away = new Set((awayRows ?? []).map((r: { agent: string }) => r.agent));
  if (away.has('studioA')) keys[0] = '';
  if (away.has('studioB')) keys[1] = '';
  if (!keys[0] && !keys[1]) return reply(503, { ok: false, leave: true, error: 'Studio A·B(Gemini)가 모두 휴가예요. 팀 관리에서 한 명을 근무로 돌려 주세요.' });
  // v0.4.94(소유자 "그림은 두 Gemini가 해 온 걸 내가 보고 고르기"): 근무 중인 Studio A·B가 같은 지시서로 하나씩 동시에 만든다.
  // 한쪽만 되면 그 하나만 올린다. 오늘 남은 횟수가 하나뿐이면 A(없으면 B) 하나만.
  const slots = keys.map((key, i) => ({ key, i })).filter((x) => x.key).slice(0, Math.max(1, cap - (count ?? 0)));
  const runs = await Promise.all(
    slots.map(async ({ key, i }) => {
      let r: { status: number; text: string; message: string; tokens?: GeminiTokens };
      try {
        r = await callGemini(key, model, `${text}${homepageStart(text, task.id, i)}`);
      } catch (e) {
        r = { status: 0, text: '', message: (e as Error).name === 'TimeoutError' ? '응답이 늦어 멈췄습니다.' : (e as Error).message };
      }
      const html = r.status === 200 && r.text ? extractHtml(r.text) : '';
      if (html) {
        const clean = stripActive(html);
        await admin.from('ai_calls').insert({ owner_id: user.id, provider: 'gemini', purpose: 'prototype', key_slot: i + 1, ok: true, http_status: 200, model, prompt_chars: text.length, answer_chars: clean.length, ...(r.tokens ?? {}) });
        return { slot: i === 0 ? 'A' : 'B', html: clean, status: 200, message: '' };
      }
      return { slot: i === 0 ? 'A' : 'B', html: '', status: r.status, message: r.status === 200 ? 'HTML 견본 형식이 아닙니다.' : r.message };
    }),
  );
  const drafts = runs.filter((r) => r.html).map(({ slot, html }) => ({ slot, html }));
  if (drafts.length) return reply(200, { ok: true, html: drafts[0].html, drafts, planRevision: plan.plan_revision, model });
  last = runs.find((r) => r.status !== 200) ?? runs[0] ?? last;
  await admin.from('ai_calls').insert({ owner_id: user.id, provider: 'gemini', purpose: 'prototype', key_slot: null, ok: false, http_status: last.status || null, model, prompt_chars: text.length, error: last.message.slice(0, 300) });
  const hint = last.status === 429 ? 'Gemini 무료 한도에 걸렸습니다.' : last.status === 200 ? 'Gemini가 HTML 견본을 만들지 못했습니다.' : 'Gemini가 답하지 못했습니다.';
  return reply(502, { ok: false, error: `${hint} 다시 누르거나 AI Studio 견본 지시서로 진행하세요.` });
});
