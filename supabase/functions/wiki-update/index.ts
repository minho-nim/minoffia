// LLM 위키(v0.7.41 소유자 "컨텍스트 엔지니어링: 2 ㄱㄱ"): 프로젝트 한 장짜리 위키를 Gemini(무료)가 고쳐 쓴다.
// - action "task": 업무가 배포까지 끝나면 deploy-release가 서버 키로 부른다. 그 업무를 위키에 더한다(이미 넣은 업무는 건너뜀).
//   위키가 비어 있으면 그 프로젝트의 끝난 업무 전부로 처음 쓴다.
// - action "project": 소유자가 [다시 정리]를 누르면 끝난 업무 전부로 새로 쓴다.
// - action "all": 소유자가 [위키 채우기]를 누르면 위키가 빈 프로젝트를 차례로 채운다(뒤에서 돌고 바로 답한다).
// 원본(기획서·결과)은 그대로 두고 위키만 쓴다. AI를 못 쓰면 '지난 결정'에 한 줄씩만 더한다. minho-nim/MinLab은 건너뛴다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { appendDecisions, cleanWiki, diffFiles, wikiPrompt, WIKI_SYSTEM, type TaskFacts } from './wiki.ts';
import { geminiFetch } from './gemini-fallback.ts';
import { tokensOf } from './geminiTokens.ts';

const MODEL = 'gemini-3.5-flash-lite';
const DAILY_CAP = 40;
const MAX_TASKS = 40;
const env = (key: string) => (Deno.env.get(key) ?? '').trim();
const cors = {
  'Access-Control-Allow-Origin': env('OFFICE_ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const UUID = /^[0-9a-f-]{36}$/i;

// deno-lint-ignore no-explicit-any
type Admin = ReturnType<typeof createClient<any>>;

/** 업무 하나의 자료(기획서·결과·바뀐 파일·수정 요청) */
async function factsOf(admin: Admin, task: { id: string; title: string; updated_at: string }): Promise<TaskFacts> {
  const [{ data: spec }, { data: result }, { data: revs }, { data: c }] = await Promise.all([
    admin.from('task_specs').select('final_prompt').eq('task_id', task.id).order('revision', { ascending: false }).limit(1).maybeSingle(),
    admin.from('result_packages').select('summary, diff').eq('task_id', task.id).order('revision', { ascending: false }).limit(1).maybeSingle(),
    admin.from('revision_requests').select('feedback').eq('task_id', task.id).order('created_at').limit(5),
    admin.from('approvals').select('created_at').eq('task_id', task.id).eq('gate', 'C').eq('decision', 'approved').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const when = String(c?.created_at ?? task.updated_at ?? '');
  const kst = when ? new Date(Date.parse(when) + 9 * 3600_000).toISOString().slice(0, 10) : '';
  return {
    date: kst,
    title: String(task.title ?? ''),
    spec: String(spec?.final_prompt ?? ''),
    result: String(result?.summary ?? ''),
    files: diffFiles(String(result?.diff ?? '')),
    feedback: (revs ?? []).map((r: { feedback: string }) => String(r.feedback ?? '')).filter(Boolean),
  };
}

/** 배포까지 끝난 업무(배포 승인 있음) */
async function doneTasks(admin: Admin, ownerId: string, projectId: string) {
  const { data: tasks } = await admin.from('tasks').select('id, title, updated_at').eq('owner_id', ownerId).eq('project_id', projectId).order('updated_at', { ascending: true }).limit(200);
  const ids = (tasks ?? []).map((t: { id: string }) => t.id);
  if (!ids.length) return [];
  const { data: cs } = await admin.from('approvals').select('task_id').in('task_id', ids).eq('gate', 'C').eq('decision', 'approved');
  const done = new Set((cs ?? []).map((r: { task_id: string }) => r.task_id));
  return (tasks ?? []).filter((t: { id: string }) => done.has(t.id)).slice(-MAX_TASKS) as { id: string; title: string; updated_at: string }[];
}

async function callGemini(admin: Admin, ownerId: string, text: string): Promise<{ body: string; judge: string } | null> {
  const kstMidnight = new Date(Math.floor((Date.now() + 9 * 3600_000) / 86400_000) * 86400_000 - 9 * 3600_000).toISOString();
  const { count } = await admin.from('ai_calls').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId).eq('purpose', 'wiki').gte('created_at', kstMidnight);
  if ((count ?? 0) >= DAILY_CAP) return null;
  const { data: away } = await admin.from('agent_leave').select('agent').eq('owner_id', ownerId);
  const off = new Set((away ?? []).map((r: { agent: string }) => r.agent));
  const keys = [
    // v0.7.64: 업무 쪽은 Studio B 키 먼저(서로 다른 계정이라 한도가 따로), 막히면 A
    { slot: 2, key: env('GEMINI_API_KEY2'), judge: 'Gemini · Studio B', agent: 'studioB' },
    { slot: 1, key: env('GEMINI_API_KEY'), judge: 'Gemini · Studio A', agent: 'studioA' },
  ].filter((k) => k.key && !off.has(k.agent));
  for (const k of keys) {
    const res = await geminiFetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': k.key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: WIKI_SYSTEM }] }, contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { maxOutputTokens: 4096, temperature: 0.2 } }),
      signal: AbortSignal.timeout(60_000),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    const out = ((data as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    const body = cleanWiki(out);
    await admin.from('ai_calls').insert({ owner_id: ownerId, provider: 'gemini', purpose: 'wiki', key_slot: k.slot, ok: Boolean(body), http_status: res?.status ?? null, model: MODEL, prompt_chars: text.length, answer_chars: out.length, ...tokensOf(data), ...(body ? {} : { error: '위키 형식이 맞지 않음' }) });
    if (body) return { body, judge: k.judge };
  }
  return null;
}

/** 프로젝트 위키에 업무를 더하거나(fresh면 끝난 업무 전부로 새로) 쓴다 */
async function update(admin: Admin, ownerId: string, projectId: string, only: string | null, fresh: boolean): Promise<'updated' | 'skipped' | 'fallback'> {
  const { data: project } = await admin.from('projects').select('id, name, description, repo').eq('id', projectId).eq('owner_id', ownerId).maybeSingle();
  if (!project || String(project.repo ?? '').toLowerCase() === 'minho-nim/minlab') return 'skipped';
  const { data: wiki } = await admin.from('project_wiki').select('body, task_ids').eq('project_id', projectId).maybeSingle();
  const have = new Set<string>((wiki?.task_ids as string[] | null) ?? []);
  const current = fresh ? '' : String(wiki?.body ?? '');
  const all = await doneTasks(admin, ownerId, projectId);
  const pick = fresh || !current ? all : all.filter((t) => t.id === only && !have.has(t.id));
  if (!pick.length) return 'skipped';
  const facts = await Promise.all(pick.map((t) => factsOf(admin, t)));
  const ai = await callGemini(admin, ownerId, wikiPrompt({ name: String(project.name ?? ''), description: String(project.description ?? '') }, current, facts));
  const body = ai?.body ?? appendDecisions(current, facts);
  const ids = [...new Set([...(fresh ? [] : have), ...pick.map((t) => t.id)])];
  await admin.from('project_wiki').upsert({ project_id: projectId, owner_id: ownerId, body, task_ids: ids, judge: ai?.judge ?? '규칙(AI 못 씀)', updated_at: new Date().toISOString() }, { onConflict: 'project_id' });
  return ai ? 'updated' : 'fallback';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false });
  let body: { action?: string; taskId?: string; projectId?: string; ownerId?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const admin = createClient(env('SUPABASE_URL'), serviceKey);
  const internal = Boolean(serviceKey) && req.headers.get('Authorization') === `Bearer ${serviceKey}`;
  let ownerId = '';
  if (internal) ownerId = String(body.ownerId ?? '');
  else {
    const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: auth } = await userClient.auth.getUser();
    if (!auth?.user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
    if ((auth.user.email ?? '').toLowerCase() !== env('OFFICE_OWNER_EMAIL').toLowerCase()) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });
    ownerId = auth.user.id;
  }
  if (!UUID.test(ownerId)) return reply(400, { ok: false, error: 'ownerId가 필요합니다.' });

  if (body.action === 'task') {
    const taskId = String(body.taskId ?? '');
    if (!UUID.test(taskId)) return reply(400, { ok: false, error: 'taskId가 필요합니다.' });
    const { data: t } = await admin.from('tasks').select('project_id').eq('id', taskId).eq('owner_id', ownerId).maybeSingle();
    if (!t) return reply(404, { ok: false, error: '업무를 찾을 수 없습니다.' });
    return reply(200, { ok: true, result: await update(admin, ownerId, String(t.project_id), taskId, false) });
  }
  if (body.action === 'project') {
    const projectId = String(body.projectId ?? '');
    if (!UUID.test(projectId)) return reply(400, { ok: false, error: 'projectId가 필요합니다.' });
    return reply(200, { ok: true, result: await update(admin, ownerId, projectId, null, true) });
  }
  if (body.action === 'all') {
    const { data: projects } = await admin.from('projects').select('id, repo').eq('owner_id', ownerId);
    const { data: wikis } = await admin.from('project_wiki').select('project_id').eq('owner_id', ownerId);
    const has = new Set((wikis ?? []).map((w: { project_id: string }) => w.project_id));
    const todo = (projects ?? []).filter((p: { id: string; repo: string | null }) => p.repo && !has.has(p.id)).map((p: { id: string }) => p.id).slice(0, 20);
    const run = (async () => {
      for (const id of todo) await update(admin, ownerId, id, null, true).catch(() => 'skipped');
    })();
    // deno-lint-ignore no-explicit-any
    const er = (globalThis as any).EdgeRuntime;
    if (er) er.waitUntil(run);
    else await run;
    return reply(200, { ok: true, started: todo.length });
  }
  return reply(400, { ok: false, error: 'action은 task·project·all 중 하나입니다.' });
});
