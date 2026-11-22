// Gemini 시안(v0.7.13, 소유자 2026-11-12 "그리기는 둘이 그린 뒤 서로 평가, 내가 선택"): 최신 기획서로 Gemini A·B가 시안을 하나씩 그리고
// (A = 요청을 빠짐없이, B = 단계를 줄여 단순하게), 서로 상대 시안을 같은 항목(요청 반영·쓰기 쉬움·휴대폰 화면·단순함)으로 평가한다.
// 결과는 design_drafts에 기획서 버전마다 한 번만 넣는다(이미 있으면 그대로 돌려줌). 고르기는 앱이 design_picks에 넣는다.
// 키는 secrets(GEMINI_API_KEY = Studio A, GEMINI_API_KEY2 = Studio B)에만. 휴가인 쪽 키는 쓰지 않고, 한쪽만 되면 그 키로 둘 다 한다.
import { keyBlock, keyWhy, type KeyWhy } from './keyBlock.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { buildDesignReviewPrompt, buildDrawPrompt, DESIGN_REVIEW_SYSTEM, DRAW_STYLE, DRAW_SYSTEM, parseDesignReview, parseDraw, type DesignReview, type DrawWho } from './designDraft.ts';
import { tokensOf, type GeminiTokens } from './geminiTokens.ts';
import { geminiFetch } from './gemini-fallback.ts';

/** 상한 없음을 뜻하는 큰 수(DB 함수에 정수로 넘길 수 있게) */
const NO_DAILY_CAP = 1_000_000;
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const DRAW_TIMEOUT_MS = 80_000;
const REVIEW_TIMEOUT_MS = 40_000;

const env = (key: string) => (Deno.env.get(key) ?? '').trim();
const cors = {
  'Access-Control-Allow-Origin': env('OFFICE_ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function callGemini(key: string, model: string, system: string, text: string, maxTokens: number, timeoutMs: number) {
  const res = await geminiFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.5, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(timeoutMs),
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
  if (!keys[0] && !keys[1]) return reply(503, { ok: false, error: 'Gemini 키가 설정되지 않았습니다(GEMINI_API_KEY).' });

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });

  let body: { taskId?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  // RLS를 거쳐 내 업무만. 최신 기획서 버전으로 그린다.
  const { data: task } = await userClient.from('tasks').select('id, projects(name, design_md)').eq('id', String(body.taskId ?? '')).maybeSingle();
  if (!task) return reply(404, { ok: false, error: '업무를 찾을 수 없습니다.' });
  const { data: spec } = await userClient.from('task_specs').select('revision, final_prompt, change_scope, test_criteria').eq('task_id', task.id).order('revision', { ascending: false }).limit(1).maybeSingle();
  if (!spec) return reply(409, { ok: false, error: '기획서가 아직 없습니다.' });
  const { data: existing } = await userClient.from('design_drafts').select('*').eq('task_id', task.id).eq('spec_revision', spec.revision);
  if (existing?.length) return reply(200, { ok: true, drafts: existing, cached: true });

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  // v0.7.99 소유자 "모두 상한은 없이": 기본 상한 없음. 서버 설정 GEMINI_DRAWING_DAILY_CAP을 주면 그 값
  const cap = Number(env('GEMINI_DRAWING_DAILY_CAP')) || NO_DAILY_CAP;
  const kstMidnight = new Date(Math.floor((Date.now() + 9 * 3600_000) / 86400_000) * 86400_000 - 9 * 3600_000).toISOString();
  // 하루 상한은 키마다 따로(v0.7.80 소유자 "제미나이 계산은 키마다 나눠": 키 A·B는 서로 다른 계정). 한 번에 키마다 2회(A 키는 시안 A만)라 2회가 남지 않은 키는 이번에 쉬고, 그 시안은 다른 키가 대신 그리지 않는다
  const { data: usedRows } = await admin.from('ai_calls').select('key_slot').eq('owner_id', user.id).eq('purpose', 'drawing').eq('ok', true).gte('created_at', kstMidnight);
  const usedBy = [1, 2].map((slot) => (usedRows ?? []).filter((r: { key_slot: number | null }) => r.key_slot === slot).length);
  const { data: awayRows } = await admin.from('agent_leave').select('agent').eq('owner_id', user.id);
  const away = new Set((awayRows ?? []).map((r: { agent: string }) => r.agent));
  // 키마다 이유(v0.7.87): 키 없음·휴가·오늘 상한 다 씀. 둘 다 못 쓰면 이유를 그대로 알린다
  const why = [0, 1].map((i) => keyWhy(keys[i], usedBy[i] + 2 > cap, away.has(i ? 'studioB' : 'studioA'))) as [KeyWhy, KeyWhy];
  why.forEach((w, i) => {
    if (w !== 'ok') keys[i] = '';
  });
  const blocked = keyBlock(why, `시안 그리기 Gemini ${cap}회`, '내일 다시 그릴 수 있어요.');
  if (blocked) return reply(blocked.status, { ok: false, ...(blocked.leave ? { leave: true } : {}), error: blocked.error });

  const model = env('GEMINI_DRAW_MODEL') || env('GEMINI_MODEL') || DEFAULT_MODEL;
  const project = task.projects as unknown as { name?: string; design_md?: string } | null;
  const material = buildDrawPrompt({ projectName: String(project?.name ?? ''), finalPrompt: String(spec.final_prompt ?? ''), changeScope: String(spec.change_scope ?? ''), testCriteria: String(spec.test_criteria ?? ''), designMd: String(project?.design_md ?? '') });
  // A는 Studio A 키만, B는 Studio B 키만(v0.7.57 소유자 "같은 일·서로 교차하는 건 넘기지 않음": 서로 평가하는 시안이라 한쪽이 대신 그리지 않는다)
  const order = (who: DrawWho) => (who === 'A' ? [0] : [1]).filter((i) => keys[i]);
  const ask = async (who: DrawWho, system: string, text: string, maxTokens: number, timeoutMs: number) => {
    for (const i of order(who)) {
      let r: { status: number; text: string; message: string; tokens?: GeminiTokens };
      try {
        r = await callGemini(keys[i], model, system, text, maxTokens, timeoutMs);
      } catch (e) {
        r = { status: 0, text: '', message: (e as Error).name === 'TimeoutError' ? '응답이 늦어 멈췄습니다.' : (e as Error).message };
      }
      await admin.from('ai_calls').insert({ owner_id: user.id, provider: 'gemini', purpose: 'drawing', key_slot: i + 1, ok: r.status === 200 && Boolean(r.text), http_status: r.status || null, model, prompt_chars: text.length, answer_chars: r.text.length, ...(r.tokens ?? {}), ...(r.status === 200 ? {} : { error: r.message.slice(0, 300) }) });
      if (r.status === 200 && r.text) return { text: r.text, slot: i };
      if (r.status === 400 || r.status === 404) break;
    }
    return null;
  };

  const drawn = await Promise.all(
    (['A', 'B'] as DrawWho[]).map(async (who) => {
      const r = await ask(who, DRAW_SYSTEM, `${material}\n\n${DRAW_STYLE[who]}`, 16384, DRAW_TIMEOUT_MS);
      const d = r ? parseDraw(r.text) : null;
      return d ? { who, judge: `Gemini · Studio ${r!.slot === 0 ? 'A' : 'B'}`, ...d } : null;
    }),
  );
  const ok = drawn.filter((d): d is NonNullable<typeof d> => Boolean(d));
  if (!ok.length) return reply(502, { ok: false, error: 'Gemini가 시안을 그리지 못했어요(한도·형식). 잠시 뒤 다시 눌러 주세요.' });
  // 서로 평가: A가 그린 것은 B 키로, B가 그린 것은 A 키로(항목은 같음)
  const reviews = await Promise.all(
    ok.map(async (d) => {
      const by: DrawWho = d.who === 'A' ? 'B' : 'A';
      const r = await ask(by, DESIGN_REVIEW_SYSTEM, buildDesignReviewPrompt(material, d), 2048, REVIEW_TIMEOUT_MS);
      return r ? parseDesignReview(r.text, by) : null;
    }),
  );
  const rows = ok.map((d, i) => ({ owner_id: user.id, task_id: task.id, spec_revision: spec.revision, who: d.who, judge: d.judge, svg: d.svg, flow: d.flow, note: d.note, review: reviews[i] as DesignReview | null }));
  const { data: saved, error } = await admin.from('design_drafts').insert(rows).select('*');
  if (error) {
    // 동시에 두 번 눌렸으면 먼저 저장된 것을 돌려준다
    const { data: again } = await userClient.from('design_drafts').select('*').eq('task_id', task.id).eq('spec_revision', spec.revision);
    if (again?.length) return reply(200, { ok: true, drafts: again, cached: true });
    return reply(500, { ok: false, error: `시안을 저장하지 못했습니다: ${error.message}` });
  }
  return reply(200, { ok: true, drafts: saved, model });
});
