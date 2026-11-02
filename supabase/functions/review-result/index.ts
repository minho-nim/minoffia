// 결과 점수 평가(v0.4.64, 소유자 2026-11-02): 결과 패키지 하나를 규칙 검사(토큰 0) → Gemini 무료 채점(100점) → 판정한다.
// 같은 결과 버전은 한 번만 채점한다(result_reviews unique). 경계 점수(70~85)면 한 번 더 채점해 평균 낸다.
// 판정만 기록하고, 다시 개발 보내기는 앱이 기존 수정 요청 길(PM 재계획 → 실행 승인)로 한다. 올리기 승인(B)은 늘 소유자가 한다.
// 키는 secrets(GEMINI_API_KEY = Studio A, GEMINI_API_KEY2 = Studio B)에만. 휴가인 쪽 키는 쓰지 않는다. 글은 저장하지 않고 점수·이유만 남긴다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { averageScores, buildReviewPrompt, needsSecondOpinion, parseScore, redoFeedback, REVIEW_SYSTEM, ruleCheck, total, verdictOf, type Score } from './rubric.ts';
import { loadRules } from './projectRules.ts';
import { buildClaudeReviewPayload, resultBranch } from './claude.ts';

const HARD_DAILY_CAP = 50;
const DEFAULT_DAILY_CAP = 20;
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const TIMEOUT_MS = 45_000;
const CLAUDE_HARD_DAILY_CAP = 20;
const FIRE_TIMEOUT_MS = 20_000;
const ANTHROPIC_VERSION = '2026-10-21';
const REVIEW_TICKET_HOURS = 6;

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
      systemInstruction: { parts: [{ text: REVIEW_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { maxOutputTokens: 2048, temperature: 0.2, responseMimeType: 'application/json' },
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
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });

  let body: { taskId?: string; resultRevision?: number };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  const taskId = String(body.taskId ?? '');
  const revision = Number(body.resultRevision);

  // RLS를 거쳐 내 업무만 읽는다.
  const { data: existing } = await userClient.from('result_reviews').select('*').eq('task_id', taskId).eq('result_revision', revision).maybeSingle();
  if (existing) return reply(200, { ok: true, review: existing, cached: true });
  const { data: result } = await userClient.from('result_packages').select('revision, plan_revision, work_item_id, source, diff, test_log, remaining_issues').eq('task_id', taskId).eq('revision', revision).maybeSingle();
  if (!result) return reply(404, { ok: false, error: '결과 패키지를 찾을 수 없습니다.' });
  const { data: task } = await userClient.from('tasks').select('id, project_id, projects(repo)').eq('id', taskId).maybeSingle();
  const { data: spec } = await userClient.from('task_specs').select('final_prompt, change_scope, preserve_constraints, test_criteria').eq('task_id', taskId).order('revision', { ascending: false }).limit(1).maybeSingle();
  if (!task || !spec) return reply(409, { ok: false, error: '기획서를 찾을 수 없습니다.' });
  let item: { title: string; goal: string; acceptance_tests: string[]; preserve_constraints: string[] } | null = null;
  let assignee = '';
  if (result.plan_revision) {
    const { data: plan } = await userClient.from('pm_plans').select('plan').eq('task_id', taskId).eq('plan_revision', result.plan_revision).maybeSingle();
    const w = ((plan?.plan as { work_items?: Record<string, unknown>[] } | undefined)?.work_items ?? []).find((x) => x.id === result.work_item_id);
    if (w) item = { title: String(w.title ?? ''), goal: String(w.goal ?? ''), acceptance_tests: Array.isArray(w.acceptance_tests) ? (w.acceptance_tests as string[]) : [], preserve_constraints: Array.isArray(w.preserve_constraints) ? (w.preserve_constraints as string[]) : [] };
    const { data: a } = await userClient.from('agent_assignments').select('assignee').eq('task_id', taskId).eq('plan_revision', result.plan_revision).eq('work_item_id', result.work_item_id).maybeSingle();
    assignee = String(a?.assignee ?? '');
  }
  const projectRules = await loadRules(userClient, task.project_id);
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { count: redos } = await admin.from('result_reviews').select('id', { count: 'exact', head: true }).eq('task_id', taskId).eq('verdict', 'redo');

  const reviewMaterial = () =>
    buildReviewPrompt({
      finalPrompt: String(spec.final_prompt ?? ''),
      changeScope: String(spec.change_scope ?? ''),
      preserveConstraints: String(spec.preserve_constraints ?? ''),
      testCriteria: String(spec.test_criteria ?? ''),
      item,
      projectRules,
      gates,
      diff: String(result.diff ?? ''),
      testLog: String(result.test_log ?? ''),
      remainingIssues: String(result.remaining_issues ?? ''),
    });
  const askClaude = async (): Promise<{ sessionUrl: string | null } | null> => {
    const fireUrl = env('CLAUDE_SUPPORT_FIRE_URL');
    const fireToken = env('CLAUDE_SUPPORT_TOKEN');
    if (!fireUrl || !fireToken) return null;
    const repo = String((task.projects as unknown as { repo: string | null } | null)?.repo ?? '');
    if (repo.toLowerCase() === 'minho-nim/minlab') return null;
    const { data: leave } = await admin.from('agent_leave').select('agent').eq('owner_id', user.id).eq('agent', 'claude');
    if (leave?.length) return null;
    // 이미 보낸 채점이 아직 살아 있으면 다시 보내지 않고 기다린다. 기한이 지났으면 Gemini로 넘어간다.
    const { data: sent } = await admin.from('plan_submit_tokens').select('expires_at').eq('task_id', taskId).eq('kind', 'review').eq('result_revision', revision).maybeSingle();
    if (sent) return new Date(sent.expires_at).getTime() > Date.now() ? { sessionUrl: null } : null;
    const cap = Math.min(CLAUDE_HARD_DAILY_CAP, Number(env('CLAUDE_DAILY_CAP')) || CLAUDE_HARD_DAILY_CAP);
    const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const { count: used } = await admin.from('usage_runs').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).eq('agent', 'claude').eq('kind', 'cloud').eq('day', day);
    if ((used ?? 0) >= cap) return null;
    const ticket = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    const ticketHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ticket)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const { data: specRow } = await admin.from('task_specs').select('revision').eq('task_id', taskId).order('revision', { ascending: false }).limit(1).maybeSingle();
    const { data: made, error: ticketError } = await admin
      .from('plan_submit_tokens')
      .insert({ owner_id: user.id, task_id: taskId, spec_revision: specRow?.revision ?? 1, token_hash: ticketHash, expires_at: new Date(Date.now() + REVIEW_TICKET_HOURS * 3600_000).toISOString(), kind: 'review', result_revision: revision })
      .select('id')
      .single();
    // 동시에 두 번 불렸으면(같은 결과 버전 표가 이미 있음) 먼저 보낸 쪽을 기다린다.
    if (ticketError || !made) return ticketError?.code === '23505' ? { sessionUrl: null } : null;
    const text = buildClaudeReviewPayload({
      taskId,
      resultRevision: revision,
      repo,
      branch: resultBranch(String(result.source ?? ''), taskId, String(result.work_item_id ?? '')),
      material: reviewMaterial(),
      submit: { url: `${env('SUPABASE_URL')}/functions/v1/submit-review`, token: ticket },
    });
    try {
      const res = await fetch(fireUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${fireToken}`, 'Content-Type': 'application/json', 'anthropic-version': ANTHROPIC_VERSION },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(FIRE_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      await admin.from('usage_runs').insert({ owner_id: user.id, agent: 'claude', task_id: taskId, kind: 'cloud' });
      return { sessionUrl: (data.claude_code_session_url as string | undefined) ?? null };
    } catch {
      // 시작 못 했으면 표를 지우고 Gemini가 바로 채점한다(같은 일을 두 번 시키지 않음: Claude 세션은 없음).
      await admin.from('plan_submit_tokens').delete().eq('id', made.id);
      return null;
    }
  };

  // 1단계: 규칙 검사(토큰 0). 막히면 AI를 부르지 않는다.
  const gates = ruleCheck({ diff: String(result.diff ?? ''), testLog: String(result.test_log ?? ''), changeScope: String(spec.change_scope ?? '') });
  let score: Score | null = null;
  let judge = '규칙';
  if (!gates.some((g) => g.blocking && !g.ok)) {
    // 2단계(v0.4.94 소유자 "코딩 작업은 클로드가 보고 채점"): Claude 보조 개발 루틴에 채점만 맡긴다(구독 안, 하루 상한 함께 셈).
    // 점수는 세션이 submit-review로 보낸다. Claude가 휴가·상한·미연결이거나 6시간 안에 점수가 안 오면 아래 Gemini 무료 채점.
    // 서로 바꿔 채점(v0.4.95 소유자): Claude가 만든 결과는 Claude가 채점하지 않는다(자기 채점 방지) → Gemini.
    // (나중에 Codex for Linear가 확인되면 Claude 결과는 GPT가 먼저, 안 되면 Gemini)
    const byClaude = assignee === 'claude' || ['claude_session_auto', 'claude_manual'].includes(String(result.source ?? ''));
    const pending = byClaude ? null : await askClaude();
    if (pending) return reply(200, { ok: true, pending: true, judge: 'Claude', sessionUrl: pending.sessionUrl });
    // 2단계(대신): Gemini 무료 채점
    const keys = [env('GEMINI_API_KEY'), env('GEMINI_API_KEY2')];
    const { data: awayRows } = await admin.from('agent_leave').select('agent').eq('owner_id', user.id);
    const away = new Set((awayRows ?? []).map((r: { agent: string }) => r.agent));
    if (away.has('studioA')) keys[0] = '';
    if (away.has('studioB')) keys[1] = '';
    const cap = Math.min(HARD_DAILY_CAP, Number(env('GEMINI_REVIEW_DAILY_CAP')) || DEFAULT_DAILY_CAP);
    const kstMidnight = new Date(Math.floor((Date.now() + 9 * 3600_000) / 86400_000) * 86400_000 - 9 * 3600_000).toISOString();
    const { count } = await admin.from('ai_calls').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).eq('purpose', 'review').eq('ok', true).gte('created_at', kstMidnight);
    const model = env('GEMINI_MODEL') || DEFAULT_MODEL;
    const prompt = reviewMaterial();
    const ask = async (): Promise<Score | null> => {
      for (const [i, key] of keys.entries()) {
        if (!key) continue;
        let r: { status: number; text: string; message: string };
        try {
          r = await callGemini(key, model, prompt);
        } catch (e) {
          r = { status: 0, text: '', message: (e as Error).name };
        }
        const parsed = r.status === 200 ? parseScore(r.text) : null;
        await admin.from('ai_calls').insert({ owner_id: user.id, provider: 'gemini', purpose: 'review', key_slot: i + 1, ok: Boolean(parsed), http_status: r.status || null, model, prompt_chars: prompt.length, answer_chars: r.text.length, ...(parsed ? {} : { error: (r.message || '점수 형식이 맞지 않음').slice(0, 300) }) });
        if (parsed) {
          judge = `Gemini · Studio ${i === 0 ? 'A' : 'B'}`;
          return parsed;
        }
        if (r.status === 400 || r.status === 404) break;
      }
      return null;
    };
    if ((count ?? 0) < cap && (keys[0] || keys[1])) {
      score = await ask();
      // 경계 점수면 한 번 더 채점해 평균(무료 호출 1번 더)
      if (score && needsSecondOpinion(score) && (count ?? 0) + 1 < cap) {
        const again = await ask();
        if (again) {
          score = averageScores(score, again);
          judge += ' ×2';
        }
      }
    }
  }

  const { verdict, reasons } = verdictOf(gates, score, redos ?? 0);
  const feedback = verdict === 'pass' ? '' : redoFeedback(gates, score, reasons);
  const { data: saved, error } = await admin
    .from('result_reviews')
    .insert({ owner_id: user.id, task_id: taskId, result_revision: revision, work_item_id: String(result.work_item_id ?? ''), assignee, gates, score, total: score ? total(score) : null, verdict, reasons, feedback, auto_redo: redos ?? 0, judge })
    .select('*')
    .single();
  if (error) {
    // 동시에 두 번 불렸으면 먼저 저장된 것을 돌려준다.
    const { data: again } = await userClient.from('result_reviews').select('*').eq('task_id', taskId).eq('result_revision', revision).maybeSingle();
    if (again) return reply(200, { ok: true, review: again, cached: true });
    return reply(500, { ok: false, error: `평가를 저장하지 못했습니다: ${error.message}` });
  }
  return reply(200, { ok: true, review: saved });
});
