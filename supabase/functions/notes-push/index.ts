// 옵시디언 세컨드 브레인 올리기(v0.8.5 소유자 "대화·업무를 모아 옵시디언으로"): 앱이 만든 노트를 노트 보관함(minoffia-notes)에 커밋 한 번으로 올린다.
// 소유자만. AI 호출 없음. Actions도 쓰지 않는다(분량 아끼기). 토큰은 서버 비밀값 NOTES_REPO_TOKEN(없으면 GITHUB_REPO_TOKEN)이고 값은 내려보내지 않는다.
// 자동 노트 자리(업무·채팅·위키·데일리)만 쓰고 '내 메모/'와 다른 파일은 건드리지 않는다(notePaths.ts). 같은 내용이면 커밋하지 않는다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { checkFiles } from './notePaths.ts';

const env = (key: string) => (Deno.env.get(key) ?? '').trim();
const cors = {
  'Access-Control-Allow-Origin': env('OFFICE_ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST만 받습니다.' });
  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  const token = env('NOTES_REPO_TOKEN') || env('GITHUB_REPO_TOKEN');
  const repo = env('NOTES_REPO') || 'minho-nim/minoffia-notes';
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });
  if (!token) return reply(503, { ok: false, error: '노트 보관함 토큰(NOTES_REPO_TOKEN)이 없습니다.' });
  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });

  let body: { files?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 형식이 올바르지 않습니다.' });
  }
  const files = checkFiles(body.files);
  if (typeof files === 'string') return reply(400, { ok: false, error: files });

  const gh = (path: string, init: RequestInit = {}) =>
    fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'minoffia', 'content-type': 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
  const fail = async (step: string, res: Response) => {
    const why = res.status === 403 || res.status === 404 ? `토큰에 ${repo} 쓰기 권한이 없어요(NOTES_REPO_TOKEN: 이 저장소 Contents 읽기·쓰기)` : `GitHub 오류 ${res.status}`;
    console.log(JSON.stringify({ fn: 'notes-push', step, status: res.status }));
    await res.body?.cancel();
    return reply(502, { ok: false, error: `노트를 올리지 못했어요: ${why}.` });
  };
  // 기본 브랜치 끝 → 새 트리(바뀐 파일만) → 커밋 → 브랜치 옮기기
  const repoRes = await gh('');
  if (!repoRes.ok) return fail('repo', repoRes);
  const branch = String(((await repoRes.json()) as { default_branch?: string }).default_branch ?? 'main');
  const refRes = await gh(`/git/ref/heads/${encodeURIComponent(branch)}`);
  if (!refRes.ok) return fail('ref', refRes);
  const head = String(((await refRes.json()) as { object?: { sha?: string } }).object?.sha ?? '');
  const commitRes = await gh(`/git/commits/${head}`);
  if (!commitRes.ok) return fail('commit', commitRes);
  const baseTree = String(((await commitRes.json()) as { tree?: { sha?: string } }).tree?.sha ?? '');
  const treeRes = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })) }) });
  if (!treeRes.ok) return fail('tree', treeRes);
  const tree = String(((await treeRes.json()) as { sha?: string }).sha ?? '');
  if (tree === baseTree) return reply(200, { ok: true, changed: 0, files: files.length });
  const newRes = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: `세컨드 브레인: 노트 ${files.length}개`, tree, parents: [head] }) });
  if (!newRes.ok) return fail('new-commit', newRes);
  const sha = String(((await newRes.json()) as { sha?: string }).sha ?? '');
  const moveRes = await gh(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: JSON.stringify({ sha, force: false }) });
  // 그사이 옵시디언이 먼저 올렸으면(빨리 감기 아님) 다음에 다시
  if (moveRes.status === 422) {
    await moveRes.body?.cancel();
    return reply(409, { ok: false, error: '그사이 보관함이 바뀌었어요. 잠시 뒤 다시 보내 주세요.' });
  }
  if (!moveRes.ok) return fail('move', moveRes);
  return reply(200, { ok: true, changed: files.length, commit: sha.slice(0, 7) });
});
