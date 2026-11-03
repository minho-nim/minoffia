// Gemini 대신 분배(v0.5.20, 소유자 2026-11-03): Claude PM이 한도·휴가·실패·무응답이면 Gemini 무료가 작업 분배 계획을 쓴다.
// 계획 글만 돌려주고 저장은 앱이 parsePmPlan으로 검증한 뒤 한다(출처 gemini_fallback). 실행 승인(E)은 그대로 소유자가 한다.
// 키는 secrets(GEMINI_API_KEY = A·Studio A, GEMINI_API_KEY2 = B·Studio B)에만. 글은 저장하지 않고 횟수만 ai_calls(purpose pm).
// 저장소 파일 목록(경로만)은 GITHUB_REPO_TOKEN으로 읽는다(없거나 실패하면 목록 없이).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { cleanPlanJson, codePaths, buildPlanText, PLAN_SYSTEM } from './planPrompt.ts';
import { loadRules } from './projectRules.ts';

const HARD_DAILY_CAP = 20;
const DEFAULT_DAILY_CAP = 10;
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const TIMEOUT_MS = 90_000;
const OFFICE_REPO = 'minho-nim/minlab-ai-office';

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
      systemInstruction: { parts: [{ text: PLAN_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.2, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  const parts = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content?.parts ?? [];
  return { status: res.status, text: parts.map((p) => p.text ?? '').join('').trim(), message: (data as { error?: { message?: string } }).error?.message ?? '' };
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
  const cap = Math.min(HARD_DAILY_CAP, Number(env('GEMINI_PM_DAILY_CAP')) || DEFAULT_DAILY_CAP);
  const kstMidnight = new Date(Math.floor((Date.now() + 9 * 3600_000) / 86400_000) * 86400_000 - 9 * 3600_000).toISOString();
  const { count } = await admin.from('ai_calls').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).eq('purpose', 'pm').eq('ok', true).gte('created_at', kstMidnight);
  if ((count ?? 0) >= cap) return reply(429, { ok: false, error: `오늘 Gemini 대신 분배 ${cap}회를 모두 썼습니다.` });

  const { data: awayRows } = await admin.from('agent_leave').select('agent').eq('owner_id', user.id);
  const away = new Set((awayRows ?? []).map((r: { agent: string }) => r.agent));
  if (away.has('studioA')) keys[0] = '';
  if (away.has('studioB')) keys[1] = '';
  if (!keys[0] && !keys[1]) return reply(503, { ok: false, leave: true, error: 'Studio A·B(Gemini)가 모두 휴가예요.' });

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
    geminiDevOk: repo.toLowerCase() !== OFFICE_REPO,
    rules: await loadRules(userClient, task.project_id),
    files: await repoFiles(repo),
  });

  const model = env('GEMINI_MODEL') || DEFAULT_MODEL;
  let last = { status: 0, message: '' };
  for (const [i, key] of keys.entries()) {
    if (!key) continue;
    let r: { status: number; text: string; message: string };
    try {
      r = await callGemini(key, model, text);
    } catch (e) {
      last = { status: 0, message: (e as Error).name === 'TimeoutError' ? '응답이 늦어 멈췄습니다.' : (e as Error).message };
      continue;
    }
    const plan = r.status === 200 ? cleanPlanJson(r.text, task.id, repo) : null;
    if (plan) {
      await admin.from('ai_calls').insert({ owner_id: user.id, provider: 'gemini', purpose: 'pm', key_slot: i + 1, ok: true, http_status: 200, model, prompt_chars: text.length, answer_chars: plan.length });
      return reply(200, { ok: true, plan, specRevision: spec.revision, keySlot: i + 1, model });
    }
    last = { status: r.status, message: r.status === 200 ? '계획 형식이 아닙니다.' : r.message };
    if (r.status === 400 || r.status === 404) break;
  }
  await admin.from('ai_calls').insert({ owner_id: user.id, provider: 'gemini', purpose: 'pm', key_slot: null, ok: false, http_status: last.status || null, model, prompt_chars: text.length, error: last.message.slice(0, 300) });
  return reply(502, { ok: false, error: last.status === 429 ? 'Gemini 무료 한도에 걸렸습니다.' : `Gemini가 계획을 쓰지 못했습니다(${last.message || last.status}).` });
});
