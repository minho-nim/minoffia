// Gemini 기획서 초안(무료): 업무의 "기획 요청" 문서를 Gemini에 한 번 보내고, 답을 기획서 새 버전(planner gemini_draft)으로 저장한다.
// 소유자 결정(2026-10-30): 기본은 Gemini 초안, 어렵거나 중요한 업무만 ChatGPT(수동)로 넘긴다. 사용자는 초안을 보고 A 승인·수정 요청만 한다.
// 키는 secrets(GEMINI_API_KEY = A, GEMINI_API_KEY2 = B 예비)에만 있다. 글은 저장하지 않고 횟수·길이만 ai_calls(purpose plan)에 남긴다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { DRAFT_SYSTEM, parseDraft } from './draft.ts';

const HARD_DAILY_CAP = 50;
const DEFAULT_DAILY_CAP = 20;
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const MAX_TEXT = 40_000;
const TIMEOUT_MS = 40_000;

const env = (key: string) => (Deno.env.get(key) ?? '').trim();

const cors = {
  'Access-Control-Allow-Origin': env('OFFICE_ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function callGemini(key: string, model: string, text: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: DRAFT_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { maxOutputTokens: 4096, temperature: 0.3, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  const parts = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content?.parts ?? [];
  return { status: res.status, text: parts.map((p) => p.text ?? '').join('').trim(), message: (data as { error?: { message?: string } }).error?.message ?? '' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST만 받습니다.' });

  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  const keys = [env('GEMINI_API_KEY'), env('GEMINI_API_KEY2')];
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });
  if (!keys[0] && !keys[1]) return reply(503, { ok: false, error: 'Gemini 키가 설정되지 않았습니다(GEMINI_API_KEY). ChatGPT로 기획하세요.' });

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
  if (!text || text.length > MAX_TEXT) return reply(400, { ok: false, error: `기획 요청은 1~${MAX_TEXT}자여야 합니다.` });

  // RLS를 거쳐 내 업무만. 원문은 DB의 것을 쓴다.
  const { data: task } = await userClient.from('tasks').select('id, title, description, user_original_text').eq('id', body.taskId ?? '').maybeSingle();
  if (!task) return reply(404, { ok: false, error: '업무를 찾을 수 없습니다.' });

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const cap = Math.min(HARD_DAILY_CAP, Number(env('GEMINI_PLAN_DAILY_CAP')) || DEFAULT_DAILY_CAP);
  const kstMidnight = new Date(Math.floor((Date.now() + 9 * 3600_000) / 86400_000) * 86400_000 - 9 * 3600_000).toISOString();
  const { count } = await admin.from('ai_calls').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).eq('purpose', 'plan').eq('ok', true).gte('created_at', kstMidnight);
  if ((count ?? 0) >= cap) return reply(429, { ok: false, error: `오늘 Gemini 기획서 초안 ${cap}회를 모두 썼습니다. ChatGPT로 기획하세요.` });

  const model = env('GEMINI_MODEL') || DEFAULT_MODEL;
  let last = { status: 0, message: '' };
  for (const [i, key] of keys.entries()) {
    if (!key) continue;
    let r: { status: number; text: string; message: string };
    try {
      r = await callGemini(key, model, text);
    } catch (e) {
      r = { status: 0, text: '', message: (e as Error).name === 'TimeoutError' ? '응답이 늦어 멈췄습니다.' : (e as Error).message };
    }
    const slot = i + 1;
    if (r.status === 200 && r.text) {
      const draft = parseDraft(r.text);
      if (!draft) {
        last = { status: 200, message: '초안 형식이 맞지 않습니다.' };
        break;
      }
      await admin.from('ai_calls').insert({ owner_id: user.id, provider: 'gemini', purpose: 'plan', key_slot: slot, ok: true, http_status: 200, model, prompt_chars: text.length, answer_chars: r.text.length });
      const { data: latest } = await userClient.from('task_specs').select('revision').eq('task_id', task.id).order('revision', { ascending: false }).limit(1).maybeSingle();
      const revision = (latest?.revision ?? 0) + 1;
      const { error } = await userClient.from('task_specs').insert({
        task_id: task.id,
        revision,
        intent: draft.intent,
        planner: 'gemini_draft',
        user_original_text: task.user_original_text ?? [task.title, task.description].filter(Boolean).join('\n\n'),
        final_prompt: draft.finalPrompt,
        change_scope: draft.changeScope,
        preserve_constraints: draft.preserveConstraints,
        test_criteria: draft.testCriteria,
        answer: draft.answer,
      });
      if (error) return reply(409, { ok: false, error: `초안을 저장하지 못했습니다: ${error.message}` });
      return reply(200, { ok: true, revision, intent: draft.intent, model });
    }
    last = { status: r.status, message: r.message };
    if (r.status === 400 || r.status === 404) break;
  }
  await admin.from('ai_calls').insert({ owner_id: user.id, provider: 'gemini', purpose: 'plan', key_slot: null, ok: false, http_status: last.status || null, model, prompt_chars: text.length, error: last.message.slice(0, 300) });
  const hint =
    last.status === 429
      ? 'Gemini 무료 한도에 걸렸습니다.'
      : last.status === 401 || last.status === 403
        ? 'Gemini 키가 틀렸거나 권한이 없습니다.'
        : last.status === 200
          ? 'Gemini 초안 형식이 맞지 않았습니다.'
          : 'Gemini가 답하지 못했습니다.';
  return reply(502, { ok: false, error: `${hint} 다시 누르거나 ChatGPT로 기획하세요.` });
});
