// 디자인 기준 문서 초안(v0.5.56, 소유자 목록 30번): 프로젝트 저장소의 스타일 파일(최대 8개)을 GitHub에서 읽어
// Gemini(무료)에 한 번 보내고, 답을 projects.design_draft에 저장한다. 소유자가 앱에서 승인하면 design_md로 확정된다.
// 키는 secrets(GEMINI_API_KEY·GEMINI_API_KEY2·GITHUB_REPO_TOKEN)에만. 사용 기록은 ai_calls(purpose design).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { cleanStandard, STANDARD_SYSTEM, styleFiles } from './standard.ts';
import { tokensOf, type GeminiTokens } from './geminiTokens.ts';

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const TIMEOUT_MS = 40_000;
const MAX_FILE = 12_000;
const MAX_TOTAL = 40_000;
const DAILY_CAP = 10;

const env = (key: string) => (Deno.env.get(key) ?? '').trim();
const cors = {
  'Access-Control-Allow-Origin': env('OFFICE_ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const gh = (token: string) => ({ Authorization: `Bearer ${token}`, 'User-Agent': 'minoffia', 'X-GitHub-Api-Version': '2022-11-28' });

async function callGemini(key: string, model: string, text: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: STANDARD_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { maxOutputTokens: 3000, temperature: 0.2 },
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
  const token = env('GITHUB_REPO_TOKEN');
  const keys = [env('GEMINI_API_KEY'), env('GEMINI_API_KEY2')];
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });
  if (!token) return reply(503, { ok: false, error: '저장소를 읽을 토큰(GITHUB_REPO_TOKEN)이 없습니다.' });
  if (!keys[0] && !keys[1]) return reply(503, { ok: false, error: 'Gemini 키가 설정되지 않았습니다.' });

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });

  let body: { projectId?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  if (!body.projectId || !/^[0-9a-f-]{36}$/i.test(body.projectId)) return reply(400, { ok: false, error: 'projectId가 필요합니다.' });
  const { data: project } = await userClient.from('projects').select('id, name, repo').eq('id', body.projectId).maybeSingle();
  if (!project) return reply(404, { ok: false, error: '프로젝트를 찾을 수 없습니다.' });
  const repo = String(project.repo ?? '');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return reply(409, { ok: false, error: '연결된 GitHub 저장소가 없는 프로젝트예요.' });
  if (repo.toLowerCase() === 'minho-nim/minlab') return reply(403, { ok: false, error: '이 저장소는 읽지 않습니다.' });

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const kstMidnight = new Date(Math.floor((Date.now() + 9 * 3600_000) / 86400_000) * 86400_000 - 9 * 3600_000).toISOString();
  const { count } = await admin.from('ai_calls').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).eq('purpose', 'design').gte('created_at', kstMidnight);
  if ((count ?? 0) >= DAILY_CAP) return reply(429, { ok: false, error: `오늘 디자인 기준 초안을 ${DAILY_CAP}번 썼어요. 내일 다시 해 주세요.` });

  const tree = await fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`, { headers: { ...gh(token), Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!tree?.ok) return reply(502, { ok: false, error: `저장소 파일 목록을 읽지 못했습니다(GitHub ${tree?.status ?? '응답 없음'}).` });
  const paths = (((await tree.json()) as { tree?: { path?: string; type?: string }[] }).tree ?? []).filter((t) => t.type === 'blob' && t.path).map((t) => t.path!);
  const picked = styleFiles(paths);
  if (!picked.length) return reply(409, { ok: false, error: '스타일 파일(css·tailwind 설정 등)을 찾지 못했어요.' });
  let material = '';
  for (const p of picked) {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${p.split('/').map(encodeURIComponent).join('/')}`, { headers: { ...gh(token), Accept: 'application/vnd.github.raw' }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!res?.ok) continue;
    const text = (await res.text()).slice(0, MAX_FILE);
    if (material.length + text.length > MAX_TOTAL) break;
    material += `\n--- ${p} ---\n${text}\n`;
  }
  if (!material) return reply(502, { ok: false, error: '스타일 파일 내용을 읽지 못했습니다.' });

  const model = env('GEMINI_MODEL') || DEFAULT_MODEL;
  const prompt = `프로젝트: ${String(project.name ?? '').slice(0, 80)} (${repo})\n아래 스타일 파일을 보고 DESIGN.md를 써라.\n${material}`;
  let last = { status: 0, message: '' };
  for (const [i, key] of keys.entries()) {
    if (!key) continue;
    let r: { status: number; text: string; message: string; tokens?: GeminiTokens };
    try {
      r = await callGemini(key, model, prompt);
    } catch (e) {
      last = { status: 0, message: (e as Error).name === 'TimeoutError' ? '응답이 늦어 멈췄습니다.' : (e as Error).message };
      continue;
    }
    const doc = r.status === 200 ? cleanStandard(r.text) : null;
    await admin.from('ai_calls').insert({ owner_id: user.id, provider: 'gemini', purpose: 'design', key_slot: i + 1, ok: Boolean(doc), http_status: r.status || null, model, prompt_chars: prompt.length, answer_chars: r.text.length, ...(r.tokens ?? {}), ...(doc ? {} : { error: (r.message || '문서 형식이 아님').slice(0, 300) }) });
    if (doc) {
      const { error } = await admin.from('projects').update({ design_draft: doc }).eq('id', project.id).eq('owner_id', user.id);
      if (error) return reply(500, { ok: false, error: '초안을 저장하지 못했습니다.' });
      return reply(200, { ok: true, draft: doc, files: picked });
    }
    last = { status: r.status, message: r.status === 200 ? '문서 형식이 아닙니다.' : r.message };
    if (r.status === 400 || r.status === 404) break;
  }
  return reply(502, { ok: false, error: last.status === 429 ? 'Gemini 무료 한도에 걸렸습니다.' : `Gemini가 기준 문서를 쓰지 못했습니다(${last.message || last.status}).` });
});
