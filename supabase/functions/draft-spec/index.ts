// Gemini 기획서 초안(무료): 업무의 "기획 요청" 문서를 Gemini에 한 번 보내고, 답을 기획서 새 버전(planner gemini_draft)으로 저장한다.
// 소유자 결정(2026-10-30): 기본은 Gemini 초안, 어렵거나 중요한 업무만 ChatGPT(수동)로 넘긴다. 사용자는 초안을 보고 A 승인·수정 요청만 한다.
// 키는 secrets(GEMINI_API_KEY = A·Studio A, GEMINI_API_KEY2 = B·Studio B)에만 있다. 글은 저장하지 않고 횟수·길이만 ai_calls(purpose plan)에 남긴다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { autoTitle, DRAFT_SYSTEM, parseDraft } from './draft.ts';
import { loadRules, rulesSection, saveRules } from './projectRules.ts';
import { tokensOf, type GeminiTokens } from './geminiTokens.ts';
import { codePaths, NEED_FILES_ASK, parseNeedFiles, withFiles } from './needFiles.ts';
import { appMapSection } from './appMap.ts';
import { geminiFetch } from './gemini-fallback.ts';

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
  const res = await geminiFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
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
  return { status: res.status, text: parts.map((p) => p.text ?? '').join('').trim(), message: (data as { error?: { message?: string } }).error?.message ?? '', tokens: tokensOf(data) };
}

const GH = (token: string, accept: string) => ({ Authorization: `Bearer ${token}`, Accept: accept, 'User-Agent': 'minoffia', 'X-GitHub-Api-Version': '2022-11-28' });

/** 저장소 코드 파일 이름 목록(실패하면 빈 목록) */
async function repoFiles(repo: string): Promise<string[]> {
  const token = env('GITHUB_REPO_TOKEN');
  if (!token) return [];
  const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`, { headers: GH(token, 'application/vnd.github+json'), signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res?.ok) return [];
  const data = (await res.json().catch(() => ({}))) as { tree?: { path?: string; type?: string }[] };
  return codePaths((data.tree ?? []).filter((t) => t.type === 'blob' && t.path).map((t) => t.path!));
}

/** 요청한 파일을 기본 브랜치에서 읽는다(너무 크면 null) */
async function readRepoFile(repo: string, path: string): Promise<string | null> {
  const token = env('GITHUB_REPO_TOKEN');
  if (!token) return null;
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, { headers: GH(token, 'application/vnd.github.raw'), signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res?.ok) return null;
  const text = await res.text();
  return text.length > 200_000 ? null : text;
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
  const { data: task } = await userClient.from('tasks').select('id, project_id, title, description, user_original_text, projects(repo)').eq('id', body.taskId ?? '').maybeSingle();
  if (!task) return reply(404, { ok: false, error: '업무를 찾을 수 없습니다.' });

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const cap = Math.min(HARD_DAILY_CAP, Number(env('GEMINI_PLAN_DAILY_CAP')) || DEFAULT_DAILY_CAP);
  const kstMidnight = new Date(Math.floor((Date.now() + 9 * 3600_000) / 86400_000) * 86400_000 - 9 * 3600_000).toISOString();
  const { count } = await admin.from('ai_calls').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).eq('purpose', 'plan').eq('ok', true).gte('created_at', kstMidnight);
  if ((count ?? 0) >= cap) return reply(429, { ok: false, error: `오늘 Gemini 기획서 초안 ${cap}회를 모두 썼습니다. ChatGPT로 기획하세요.` });

  // v0.4.57: 앞선 업무에서 AI가 적어 둔 이 프로젝트의 지켜야 할 것을 기획 요청 끝에 붙인다.
  const rules = rulesSection(await loadRules(userClient, task.project_id), '## 이 프로젝트에서 지켜야 할 것 (어기지 않는다)');
  const prompt = rules.length ? `${text}\n\n${rules.join('\n')}` : text;
  // 파일 요청(v0.5.67): 저장소가 있으면 코드 파일 이름 목록을 함께 주고, 초안 대신 필요한 파일(최대 3개)을 요청할 수 있게 한다.
  // 요청하면 서버가 GitHub에서 읽어 딱 한 번만 다시 묻는다. MinLab 저장소는 읽지 않는다.
  const repo = String((task.projects as unknown as { repo: string | null } | null)?.repo ?? '');
  const canRead = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) && repo.toLowerCase() !== 'minho-nim/minlab';
  const files = canRead ? await repoFiles(repo) : [];
  // 앱 지도(v0.6.4): 어느 화면이 어느 폴더에 있는지. 점검을 안 했으면 빈칸
  let appMap = '';
  try {
    const { data: mapFile } = await admin.storage.from('attachments').download(`${user.id}/projects/${task.project_id}/health.json`);
    appMap = mapFile ? appMapSection(JSON.parse(await mapFile.text()).appMap) : '';
  } catch {
    appMap = '';
  }
  const firstAsk = files.length ? `${prompt}\n\n[저장소 코드 파일 목록(이름만)]\n${files.join('\n')}${appMap ? `\n\n${appMap}` : ''}\n\n${NEED_FILES_ASK}` : prompt;
  const model = env('GEMINI_MODEL') || DEFAULT_MODEL;
  let last = { status: 0, message: '' };
  // 팀 관리 휴가(v0.4.44): 키 A = Studio A, 키 B = Studio B. 휴가인 쪽 키는 쓰지 않는다(표가 없거나 못 읽으면 모두 근무).
  const { data: awayRows } = await admin.from('agent_leave').select('agent').eq('owner_id', user.id);
  const away = new Set((awayRows ?? []).map((r: { agent: string }) => r.agent));
  if (away.has('studioA')) keys[0] = '';
  if (away.has('studioB')) keys[1] = '';
  if (!keys[0] && !keys[1]) return reply(503, { ok: false, leave: true, error: 'Studio A·B(Gemini)가 모두 휴가예요. 팀 관리에서 한 명을 근무로 돌려 주세요.' });
  // v0.7.64 소유자 "API 두 개(서로 다른 계정)니까 나눠서": 업무 쪽은 Studio B 키 먼저, 막히면 A(대화 쪽은 A 먼저)
  for (const [i, key] of ([1, 0] as const).map((j) => [j, keys[j]] as const)) {
    if (!key) continue;
    let r: { status: number; text: string; message: string; tokens?: GeminiTokens };
    try {
      r = await callGemini(key, model, firstAsk);
      const need = files.length && r.status === 200 && !parseDraft(r.text) ? parseNeedFiles(r.text) : null;
      if (need) {
        await admin.from('ai_calls').insert({ owner_id: user.id, provider: 'gemini', purpose: 'plan', key_slot: i + 1, ok: true, http_status: 200, model, prompt_chars: firstAsk.length, answer_chars: r.text.length, ...(r.tokens ?? {}) });
        const got = await Promise.all(need.filter((p) => files.includes(p)).map(async (path) => ({ path, text: await readRepoFile(repo, path) })));
        r = await callGemini(key, model, withFiles(prompt, got.length ? got : need.map((path) => ({ path, text: null }))));
      }
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
      await admin.from('ai_calls').insert({ owner_id: user.id, provider: 'gemini', purpose: 'plan', key_slot: slot, ok: true, http_status: 200, model, prompt_chars: text.length, answer_chars: r.text.length, ...(r.tokens ?? {}) });
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
        size_hint: draft.sizeHint,
      });
      if (error) return reply(409, { ok: false, error: `초안을 저장하지 못했습니다: ${error.message}` });
      if (draft.intent === 'change_request' || draft.intent === 'asset_request') await saveRules(admin, user.id, task.id, 'spec', draft.projectRules);
      // v0.4.78(소유자 "제목은 내용에 따라 자동 생성"): 같은 호출로 받은 짧은 제목으로 바꾼다. 사람이 고친 제목(자동 제목과 다름)은 건드리지 않는다.
      const original = task.user_original_text ?? '';
      if (draft.title && original && task.title === autoTitle(original) && draft.title !== task.title) {
        await userClient.from('tasks').update({ title: draft.title }).eq('id', task.id).eq('title', task.title);
      }
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
