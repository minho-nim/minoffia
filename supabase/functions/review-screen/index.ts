// 화면 평가(v0.7.40 소유자 "루프: 결과 사진을 평가에 넣기"). 결과 화면 찍기(Actions)가 사진을 올린 뒤 이 함수를 부른다.
// 로그인 없이 불리므로(verify_jwt 끔) site-check가 서명한 표(notifySig, 6시간·업무·결과 버전·종류)만 받는다. 입력 글은 쓰지 않는다.
// 사진(휴대폰·PC)과 기획서를 Gemini(무료, Studio A → B)에 보여 점수·문제를 받아 result_reviews.screen에 적는다.
// 화면이 확실히 깨졌으면(60점 미만) 결과 승인 전·자동 다시 개발 횟수 안에서 서버가 다시 개발을 보낸다(review-result와 같은 길).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { verifyNotify } from './notifySig.ts';
import { requestRedoOnServer } from './redo.ts';
import { parseScreen, screenDecision, screenFeedback, screenPrompt, SCREEN_SYSTEM, type ScreenReview } from './screen.ts';
import { geminiFetch } from './gemini-fallback.ts';

const MODEL = 'gemini-3.5-flash-lite';
const MAX_AUTO_REDO = 2; // review-result/rubric.ts와 같게
const env = (key: string) => (Deno.env.get(key) ?? '').trim();
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const b64 = (buf: ArrayBuffer) => {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { ok: false });
  let body: { taskId?: string; revision?: number; kind?: string; exp?: number; sig?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false });
  }
  const n = { taskId: String(body.taskId ?? ''), revision: Number(body.revision), kind: String(body.kind ?? ''), exp: Number(body.exp) };
  const secret = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!(await verifyNotify(secret, n, String(body.sig ?? '')))) return reply(403, { ok: false, error: '표가 맞지 않습니다.' });

  const admin = createClient(env('SUPABASE_URL'), secret);
  const { data: task } = await admin.from('tasks').select('id, owner_id').eq('id', n.taskId).maybeSingle();
  if (!task) return reply(404, { ok: false });
  const ownerId = String(task.owner_id);
  const { data: review } = await admin.from('result_reviews').select('id, verdict, screen, reasons, feedback').eq('task_id', n.taskId).eq('result_revision', n.revision).maybeSingle();
  if (!review) return reply(200, { ok: true, skipped: '채점 전' });
  if (review.screen) return reply(200, { ok: true, skipped: '이미 봄' });
  const { data: result } = await admin.from('result_packages').select('created_at').eq('task_id', n.taskId).eq('revision', n.revision).maybeSingle();
  if (!result) return reply(200, { ok: true, skipped: '결과 없음' });

  // 사진·자동 확인 결과(이 결과 뒤에 찍은 것만)
  const bucket = admin.storage.from('attachments');
  const dir = `${ownerId}/tasks/${n.taskId}/site/${n.kind}`;
  const rj = await bucket.download(`${dir}/result.json`);
  if (!rj.data) return reply(200, { ok: true, skipped: '사진 없음' });
  const site = JSON.parse(await rj.data.text()) as { checkedAt?: string; targets?: { key: string; shots?: { file: string; size: string; errorCount?: number; overflow?: boolean }[] }[] };
  if (!site.checkedAt || site.checkedAt < String(result.created_at)) return reply(200, { ok: true, skipped: '지난 사진' });
  const after = site.targets?.find((t) => t.key === 'after');
  const shots = (after?.shots ?? []).filter((s) => /^after-(mobile|pc)\.jpg$/.test(s.file)).sort((a) => (a.size === 'mobile' ? -1 : 1));
  if (!shots.length) return reply(200, { ok: true, skipped: '사진 없음' });
  const images: { inline_data: { mime_type: string; data: string } }[] = [];
  for (const s of shots) {
    const f = await bucket.download(`${dir}/${s.file}`);
    if (f.data) images.push({ inline_data: { mime_type: 'image/jpeg', data: b64(await f.data.arrayBuffer()) } });
  }
  if (!images.length) return reply(200, { ok: true, skipped: '사진 없음' });
  const stats = { errors: shots.reduce((x, s) => x + (s.errorCount ?? 0), 0), overflow: shots.some((s) => s.overflow) };

  const { data: spec } = await admin.from('task_specs').select('final_prompt, change_scope, test_criteria').eq('task_id', n.taskId).order('revision', { ascending: false }).limit(1).maybeSingle();
  const specText = [spec?.final_prompt, spec?.change_scope && `변경 범위: ${spec.change_scope}`, spec?.test_criteria && `완료 기준: ${spec.test_criteria}`].filter(Boolean).join('\n');
  const text = screenPrompt(specText, stats);

  // Gemini Studio A → 안 되면 B(무료). 휴가인 쪽은 건너뛴다.
  const { data: away } = await admin.from('agent_leave').select('agent').eq('owner_id', ownerId);
  const off = new Set((away ?? []).map((r: { agent: string }) => r.agent));
  const keys = [
    { slot: 1, key: env('GEMINI_API_KEY'), judge: 'Gemini · Studio A', agent: 'studioA' },
    { slot: 2, key: env('GEMINI_API_KEY2'), judge: 'Gemini · Studio B', agent: 'studioB' },
  ].filter((k) => k.key && !off.has(k.agent));
  let parsed: { score: number; problems: string[] } | null = null;
  let judge = '';
  for (const k of keys) {
    const res = await geminiFetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': k.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SCREEN_SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text }, ...images] }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.1, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(45_000),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    const out = ((data as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    parsed = parseScreen(out);
    await admin.from('ai_calls').insert({ owner_id: ownerId, provider: 'gemini', purpose: 'review', key_slot: k.slot, ok: Boolean(parsed), http_status: res?.status ?? null, model: MODEL, prompt_chars: text.length, answer_chars: out.length, ...(parsed ? {} : { error: '화면 평가 형식이 맞지 않음' }) });
    if (parsed) {
      judge = k.judge;
      break;
    }
  }
  if (!parsed) return reply(200, { ok: false, error: '화면 평가를 받지 못했습니다.' });

  const screen: ScreenReview = { ...parsed, kind: n.kind, errors: stats.errors, overflow: stats.overflow, judge, checkedAt: new Date().toISOString() };
  const { data: bRows } = await admin.from('approvals').select('id').eq('task_id', n.taskId).eq('gate', 'B').eq('decision', 'approved').eq('approved_revision', n.revision).limit(1);
  const { count: redos } = await admin.from('result_reviews').select('id', { count: 'exact', head: true }).eq('task_id', n.taskId).eq('verdict', 'redo');
  const decision = screenDecision(parsed, { verdict: String(review.verdict), bApproved: Boolean(bRows?.length), redos: redos ?? 0, maxRedo: MAX_AUTO_REDO });
  const reasons = [...((review.reasons as string[]) ?? []), ...(decision === 'note' ? [] : [`화면 검사 ${parsed.score}점: ${parsed.problems.join(' / ') || '화면이 요구와 달라요'}`])];
  const feedback = decision === 'redo' ? screenFeedback(parsed) : String(review.feedback ?? '');
  const patch = decision === 'note' ? { screen } : { screen, verdict: decision, reasons, feedback };
  // 동시에 두 번 오면 먼저 쓴 쪽만(screen이 비어 있을 때만)
  const { data: saved } = await admin.from('result_reviews').update(patch).eq('id', review.id).is('screen', null).select('id');
  if (!saved?.length) return reply(200, { ok: true, skipped: '이미 봄' });
  if (decision === 'redo') {
    const redo = requestRedoOnServer(admin, ownerId, n.taskId, n.revision, feedback).catch(() => 'skipped');
    // deno-lint-ignore no-explicit-any
    const er = (globalThis as any).EdgeRuntime;
    if (er) er.waitUntil(redo);
    else await redo;
  }
  return reply(200, { ok: true, score: parsed.score, decision });
});
