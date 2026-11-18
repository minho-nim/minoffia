// 요청 자료 이미지 하나를 Gemini 무료 API로 분석한다(소유자가 버튼을 눌렀을 때만, v0.2 §4).
// v0.3.2~0.3.3: PDF·TXT·MD·CSV·JSON·HTML(10MB 이하)은 요약한다. DOCX·XLSX·PPTX는 글만 뽑아 보낸다. SVG·ZIP은 받지 않는다.
// 같은 이미지(sha256)를 전에 분석했으면 Gemini를 부르지 않고 그 결과를 다시 쓴다.
// 키 A가 한도·인증·서버 오류로 실패할 때만 B(예비)를 쓴다. 하루 상한을 넘으면 묻지 않는다.
import { keyBlock, keyWhy, type KeyWhy } from './keyBlock.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import JSZip from 'npm:jszip@3.10.1';
import { buildDocPrompt, buildPrompt, geminiMime, parseAnalysis, toBase64 } from './analysis.ts';
import { extractOffice, OFFICE_KIND, officeToText } from './office.ts';
import { NO_TOKENS, tokensOf, type GeminiTokens } from './geminiTokens.ts';
import { geminiFetch } from './gemini-fallback.ts';

const HARD_DAILY_CAP = 50;
const DEFAULT_DAILY_CAP = 20;
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const TIMEOUT_MS = 40_000;

const env = (key: string) => (Deno.env.get(key) ?? '').trim();

const cors = {
  'Access-Control-Allow-Origin': env('OFFICE_ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const toRow = (r: Record<string, unknown>) => ({
  id: r.id,
  attachmentId: r.attachment_id,
  taskId: r.task_id,
  model: r.model,
  keySlot: r.key_slot,
  analysis: r.analysis,
  createdAt: r.created_at,
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST만 받습니다.' });

  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  const keys = [env('GEMINI_API_KEY'), env('GEMINI_API_KEY2')];
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });
  if (!keys[0] && !keys[1]) return reply(503, { ok: false, error: 'Gemini 키가 설정되지 않았습니다(GEMINI_API_KEY).' });

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });

  let body: { attachmentId?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  if (!body.attachmentId) return reply(400, { ok: false, error: '첨부가 필요합니다.' });

  // RLS를 거쳐 내 요청 자료인지 확인
  const { data: att } = await userClient
    .from('attachments')
    .select('id, task_id, kind, role, note, mime, size_bytes, sha256, storage_path')
    .eq('id', body.attachmentId)
    .maybeSingle();
  if (!att) return reply(404, { ok: false, error: '첨부를 찾을 수 없습니다.' });
  if (att.kind !== 'request') return reply(400, { ok: false, error: '요청 자료만 분석합니다.' });
  const sendMime = geminiMime(String(att.mime), Number(att.size_bytes));
  if (!sendMime) return reply(400, { ok: false, error: 'Gemini로 요약할 수 없는 파일입니다(10MB 이하 문서·그림만, SVG·ZIP 제외). 앱의 미리보기로 보세요.' });
  const isDoc = !String(att.mime).startsWith('image/');

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: existing } = await admin.from('image_analyses').select('*').eq('attachment_id', att.id).maybeSingle();
  if (existing) return reply(200, { ok: true, cached: true, analysis: toRow(existing) });

  const save = async (analysis: unknown, model: string, keySlot: number | null) => {
    const { data, error } = await admin
      .from('image_analyses')
      .insert({ owner_id: user.id, attachment_id: att.id, task_id: att.task_id, sha256: att.sha256, model, key_slot: keySlot, analysis })
      .select('*')
      .single();
    if (error) {
      const locked = error.message.includes('locked after A approval');
      return reply(locked ? 409 : 500, {
        ok: false,
        error: locked ? 'A 승인 뒤에는 요청 자료 분석을 붙이지 않습니다. 바꾸려면 기획서를 새 버전으로 저장하세요.' : `분석을 기록하지 못했습니다: ${error.message}`,
      });
    }
    return reply(200, { ok: true, cached: keySlot === null, analysis: toRow(data) });
  };

  // 같은 이미지를 전에 분석했으면 다시 쓴다(Gemini 호출 없음).
  const { data: same } = await admin
    .from('image_analyses')
    .select('analysis, model')
    .eq('owner_id', user.id)
    .eq('sha256', att.sha256)
    .limit(1)
    .maybeSingle();
  if (same) return save(same.analysis, String(same.model), null);

  const cap = Math.min(HARD_DAILY_CAP, Number(env('GEMINI_IMAGE_DAILY_CAP')) || DEFAULT_DAILY_CAP);
  const kstMidnight = new Date(Math.floor((Date.now() + 9 * 3600_000) / 86400_000) * 86400_000 - 9 * 3600_000).toISOString();
  // 하루 상한은 키마다 따로 센다(v0.7.80 소유자 "제미나이 계산은 키마다 나눠": 키 A·B는 서로 다른 계정). 다 쓴 키는 건너뛴다.
  const { data: usedRows } = await admin
    .from('ai_calls')
    .select('key_slot')
    .eq('owner_id', user.id)
    .eq('purpose', 'image')
    .eq('ok', true)
    .gte('created_at', kstMidnight);
  const full = [1, 2].filter((slot) => (usedRows ?? []).filter((r: { key_slot: number | null }) => r.key_slot === slot).length >= cap);

  const file = await admin.storage.from('attachments').download(att.storage_path);
  if (file.error || !file.data) return reply(500, { ok: false, error: '저장된 파일을 읽지 못했습니다.' });
  let bytes = new Uint8Array(await file.data.arrayBuffer());
  const office = OFFICE_KIND[String(att.mime)];
  if (office) {
    // DOCX·XLSX·PPTX는 Gemini가 바로 읽지 못하므로 글·표·슬라이드 글만 뽑아 보낸다(20만 자 상한).
    try {
      bytes = new TextEncoder().encode(officeToText(await extractOffice((await JSZip.loadAsync(bytes)) as never, office)));
    } catch (e) {
      return reply(422, { ok: false, error: `문서에서 글을 뽑지 못했습니다: ${(e as Error).message}` });
    }
  }
  const data = toBase64(bytes);

  const model = env('GEMINI_MODEL') || DEFAULT_MODEL;
  const prompt = isDoc ? buildDocPrompt(String(att.note ?? '')) : buildPrompt(String(att.role), String(att.note ?? ''));
  let last = { status: 0, message: '' };
  // 팀 관리 휴가(v0.4.44): 키 A = Studio A, 키 B = Studio B. 휴가인 쪽 키는 쓰지 않는다(표가 없거나 못 읽으면 모두 근무).
  const { data: awayRows } = await admin.from('agent_leave').select('agent').eq('owner_id', user.id);
  const away = new Set((awayRows ?? []).map((r: { agent: string }) => r.agent));
  // 키마다 이유(v0.7.87): 키 없음·휴가·오늘 상한 다 씀. 둘 다 못 쓰면 이유를 그대로 알린다
  const why = [0, 1].map((i) => keyWhy(keys[i], full.includes(i + 1), away.has(i ? 'studioB' : 'studioA'))) as [KeyWhy, KeyWhy];
  why.forEach((w, i) => {
    if (w !== 'ok') keys[i] = '';
  });
  const blocked = keyBlock(why, `이미지·문서 분석 ${cap}회`, '내일 다시 분석해 주세요.');
  if (blocked) return reply(blocked.status, { ok: false, ...(blocked.leave ? { leave: true } : {}), error: blocked.error });
  // v0.7.64 소유자 "API 두 개(서로 다른 계정)니까 나눠서": 업무 쪽은 Studio B 키 먼저, 막히면 A(대화 쪽은 A 먼저)
  for (const [i, key] of ([1, 0] as const).map((j) => [j, keys[j]] as const)) {
    if (!key) continue;
    let status = 0;
    let text = '';
    let message = '';
    let tokens: GeminiTokens = NO_TOKENS;
    try {
      const res = await geminiFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ inline_data: { mime_type: sendMime, data } }, { text: prompt }] }],
          generationConfig: { maxOutputTokens: 1500, temperature: 0.2, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
      const json = (await res.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } };
      text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
      message = json.error?.message ?? '';
      tokens = tokensOf(json);
    } catch (e) {
      message = (e as Error).name === 'TimeoutError' ? '응답이 늦어 멈췄습니다.' : (e as Error).message;
    }
    const slot = i + 1;
    if (status === 200 && text) {
      await admin.from('ai_calls').insert({ owner_id: user.id, provider: 'gemini', purpose: 'image', key_slot: slot, ok: true, http_status: 200, model, prompt_chars: prompt.length, answer_chars: text.length, ...tokens });
      return save(parseAnalysis(text), model, slot);
    }
    last = { status, message };
    if (status === 400 || status === 404) break;
  }
  await admin.from('ai_calls').insert({ owner_id: user.id, provider: 'gemini', purpose: 'image', key_slot: null, ok: false, http_status: last.status || null, model, prompt_chars: prompt.length, error: last.message.slice(0, 300) });
  const hint =
    last.status === 429
      ? 'Gemini 무료 한도에 걸렸습니다.'
      : last.status === 401 || last.status === 403
        ? 'Gemini 키가 틀렸거나 권한이 없습니다.'
        : last.status === 404
          ? `모델(${model})을 찾지 못했습니다. GEMINI_MODEL secret을 확인하세요.`
          : 'Gemini가 분석하지 못했습니다.';
  return reply(502, { ok: false, error: hint, status: last.status });
});
