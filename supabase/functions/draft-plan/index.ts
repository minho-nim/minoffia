// Gemini 대신 분배(v0.5.20, 소유자 2026-11-03): Claude PM이 한도·휴가·실패·무응답이면 Gemini 무료가 작업 분배 계획을 쓴다.
// 계획 글만 돌려주고 저장은 앱이 parsePmPlan으로 검증한 뒤 한다(출처 gemini_fallback). 실행 승인(E)은 그대로 소유자가 한다.
// 키는 secrets에만. 계획은 서버 전용 gemini_pm_drafts에 보관하고 사용량은 ai_calls(purpose pm)에 예약한다.
// 저장소 파일 목록(경로만)은 GITHUB_REPO_TOKEN으로 읽는다(없거나 실패하면 목록 없이).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { cleanPlanJson, codePaths, buildPlanText, PLAN_SYSTEM } from './planPrompt.ts';
import { loadRules } from './projectRules.ts';
import { tokensOf, type GeminiTokens } from './geminiTokens.ts';
import { geminiFetch } from './gemini-fallback.ts';

/** 상한 없음을 뜻하는 큰 수(DB 함수에 정수로 넘길 수 있게) */
const NO_DAILY_CAP = 1_000_000;
const DEFAULT_MODEL = 'gemini-3.5-flash';
const TIMEOUT_MS = 90_000;
// 이 저장소의 옛 이름과 새 이름(미노피아로 바꾸는 동안 둘 다, v0.5.44)
const OFFICE_REPOS = ['minho-nim/minlab-ai-office', 'minho-nim/minoffia'];

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
      systemInstruction: { parts: [{ text: PLAN_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.2, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  const parts = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content?.parts ?? [];
  return { status: res.status, text: parts.map((p) => p.text ?? '').join('').trim(), message: (data as { error?: { message?: string } }).error?.message ?? '', tokens: tokensOf(data) };
}

/** 저장소 파일 목록(경로만). 실패하면 빈 목록 */
async function repoFiles(repo: string): Promise<string[]> {
  const token = env('GITHUB_REPO_TOKEN');
  if (!token) return [];
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'minlab-ai-office' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { tree?: { path?: string; type?: string }[] };
    return codePaths((data.tree ?? []).filter((t) => t.type === 'blob' && t.path).map((t) => t.path!));
  } catch {
    return [];
  }
}

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

  let body: { taskId?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }

  // RLS를 거쳐 내 업무만. A 승인된 최신 기획서만.
  const { data: task } = await userClient.from('tasks').select('id, project_id, dispatch_at, projects(name, repo)').eq('id', body.taskId ?? '').maybeSingle();
  if (!task) return reply(404, { ok: false, error: '업무를 찾을 수 없습니다.' });
  const project = task.projects as unknown as { name: string; repo: string | null } | null;
  if (!project?.repo) return reply(409, { ok: false, error: '프로젝트에 저장소가 없습니다.' });
  const { data: spec } = await userClient
    .from('task_specs')
    .select('revision, user_original_text, final_prompt, change_scope, preserve_constraints, test_criteria')
    .eq('task_id', task.id)
    .order('revision', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!spec) return reply(409, { ok: false, error: '기획서가 없습니다.' });
  const { data: aApproval } = await userClient.from('approvals').select('id').eq('task_id', task.id).eq('gate', 'A').eq('decision', 'approved').eq('approved_revision', spec.revision).maybeSingle();
  if (!aApproval) return reply(409, { ok: false, error: `기획서 v${spec.revision}의 기획 승인이 없습니다.` });

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  // v0.7.99 소유자 "모두 상한은 없이": 기본 상한 없음. 서버 설정 GEMINI_PM_DAILY_CAP을 주면 그 값
  const cap = Number(env('GEMINI_PM_DAILY_CAP')) || NO_DAILY_CAP;
  const { data: awayRows } = await admin.from('agent_leave').select('agent').eq('owner_id', user.id);
  const away = new Set((awayRows ?? []).map((r: { agent: string }) => r.agent));
  if (away.has('studioA')) keys[0] = '';
  if (away.has('studioB')) keys[1] = '';
  if (!keys[0] && !keys[1]) return reply(503, { ok: false, leave: true, error: 'Studio A·B(Gemini)가 모두 휴가예요.' });

  const model = env('GEMINI_MODEL') || DEFAULT_MODEL;
  // v0.7.80 소유자 "제미나이 계산은 키마다 나눠": 예약 함수(claim_gemini_pm)는 키를 정하기 전에 합계로 세므로 근무 중인 키 수만큼 상한을 곱한다.
  // shortcut: 합계 상한(키마다 정확히는 아님, 예약 함수 안 상한 20도 그대로), 키마다 정확히 세야 하면 예약 함수에 키 번호를 받는 마이그레이션
  const { data: claim, error: claimError } = await admin.rpc('claim_gemini_pm', {
    p_task: task.id, p_owner: user.id, p_spec: spec.revision, p_cap: cap * keys.filter(Boolean).length, p_model: model,
  });
  if (claimError) return reply(500, { ok: false, error: `계획 예약 실패: ${claimError.message}` });
  const reservation = Array.isArray(claim) ? claim[0] : claim;
  if (reservation?.state === 'cached') return reply(200, { ok: true, plan: reservation.plan_text, specRevision: spec.revision, cached: true });
  if (reservation?.state === 'busy') return reply(409, { ok: false, error: '다른 기기에서 같은 계획을 작성 중입니다. 잠시 뒤 다시 확인하세요.' });
  if (reservation?.state !== 'claimed') return reply(reservation?.reason === 'daily_cap' ? 429 : 409, {
    ok: false, error: reservation?.reason === 'daily_cap' ? `오늘 Gemini 대신 분배 ${cap}회를 모두 썼습니다(실패·작성 중 포함).` : '기획서 또는 승인이 바뀌었습니다. 새로고침 후 다시 시도하세요.',
  });

  try {
    const { data: qa } = await userClient.from('clarifications').select('question, answer').eq('task_id', task.id).order('created_at');
    const { data: revision } = await userClient
      .from('revision_requests')
      .select('feedback, result_revision')
      .eq('task_id', task.id)
      .eq('spec_revision', spec.revision)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    // 인계 요약(v0.5.21): 수정 요청이 가리키는 결과에서 한 일·남은 문제만(diff·로그는 넣지 않음)
    const { data: prev } = revision
      ? await userClient.from('result_packages').select('summary, remaining_issues').eq('task_id', task.id).eq('revision', revision.result_revision).maybeSingle()
      : { data: null };
    const previous = prev ? [prev.summary && `한 일: ${String(prev.summary).slice(0, 1500)}`, prev.remaining_issues && `남은 문제: ${String(prev.remaining_issues).slice(0, 1500)}`].filter(Boolean).join('\n') : '';
    const repo = project.repo;
    const text = buildPlanText({
      taskId: task.id,
      repo,
      projectName: project.name,
      spec,
      qa: (qa ?? []) as { question: string; answer: string }[],
      revisionFeedback: revision?.feedback ?? '',
      previous,
      away: { codex: away.has('codex'), claude: away.has('claude'), gemini: away.has('studioA') && away.has('studioB') },
      geminiDevOk: !OFFICE_REPOS.includes(repo.toLowerCase()),
      rules: await loadRules(userClient, task.project_id),
      files: await repoFiles(repo),
    });

    let last = { status: 0, message: '' };
    // v0.7.64 소유자 "API 두 개(서로 다른 계정)니까 나눠서": 업무 쪽은 Studio B 키 먼저, 막히면 A(대화 쪽은 A 먼저)
    for (const [i, key] of ([1, 0] as const).map((j) => [j, keys[j]] as const)) {
      if (!key) continue;
      let r: { status: number; text: string; message: string; tokens?: GeminiTokens };
      try {
        r = await callGemini(key, model, text);
      } catch (e) {
        last = { status: 0, message: (e as Error).name === 'TimeoutError' ? '응답이 늦어 멈췄습니다.' : (e as Error).message };
        continue;
      }
      const cleaned = r.status === 200 ? cleanPlanJson(r.text, task.id, repo) : null;
      if (cleaned) {
        const plan = JSON.stringify({ ...JSON.parse(cleaned), generation_id: reservation.draft_id });
        // 같은 예약의 응답만 저장한다. 만료 뒤 새 작업자가 예약했다면 이전 응답은 버린다.
        const { data: saved, error: saveError } = await admin.from('gemini_pm_drafts')
          .update({ state: 'completed', plan_text: plan }).eq('id', reservation.draft_id).eq('call_id', reservation.call_id).eq('state', 'running').select('id').maybeSingle();
        if (saveError || !saved) return reply(503, { ok: false, error: '계획 보관을 확인하지 못했습니다. 잠시 뒤 다시 확인하세요.' });
        await admin.from('ai_calls').update({ key_slot: i + 1, ok: true, http_status: 200, model, prompt_chars: text.length, answer_chars: plan.length, ...(r.tokens ?? {}) }).eq('id', reservation.call_id);
        return reply(200, { ok: true, plan, specRevision: spec.revision, keySlot: i + 1, model });
      }
      last = { status: r.status, message: r.status === 200 ? '계획 형식이 아닙니다.' : r.message };
      if (r.status === 400 || r.status === 404) break;
    }
    await admin.from('ai_calls').update({ key_slot: null, ok: false, http_status: last.status || null, model, prompt_chars: text.length, error: last.message.slice(0, 300) }).eq('id', reservation.call_id);
    await admin.from('gemini_pm_drafts').update({ state: 'failed' }).eq('id', reservation.draft_id).eq('call_id', reservation.call_id).eq('state', 'running');
    return reply(502, { ok: false, error: last.status === 429 ? 'Gemini 무료 한도에 걸렸습니다.' : `Gemini가 계획을 쓰지 못했습니다(${last.message || last.status}).` });
  } catch (e) {
    await admin.from('gemini_pm_drafts').update({ state: 'failed' }).eq('id', reservation.draft_id).eq('call_id', reservation.call_id).eq('state', 'running');
    return reply(502, { ok: false, error: `계획 작성 중 오류: ${(e as Error).message}` });
  }
});
