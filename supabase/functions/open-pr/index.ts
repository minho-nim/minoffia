// Gemini 개발 결과의 PR 자동 열기(v0.5.85): 올리기 승인(B)된 최신 결과의 작업 브랜치(ai/gemini/…)에서 main으로 PR을 여는
// GitHub Actions(open-pr.yml)를 시작만 한다. AI 없음. 비밀값: GITHUB_ACTIONS_TOKEN(이 저장소 Actions 실행만). 쓰기는 Actions secret만.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

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
  const ghToken = env('GITHUB_ACTIONS_TOKEN');
  const officeRepo = env('OFFICE_REPO') || 'minho-nim/minoffia';
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });
  if (!ghToken) return reply(503, { ok: false, error: 'GitHub 토큰(GITHUB_ACTIONS_TOKEN)이 없습니다.' });
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
  if (!body.taskId || !/^[0-9a-f-]{36}$/i.test(body.taskId)) return reply(400, { ok: false, error: 'taskId가 필요합니다.' });
  // RLS를 거쳐 내 업무·최신 결과·B 승인만
  const { data: task } = await userClient.from('tasks').select('id, title, projects(repo)').eq('id', body.taskId).maybeSingle();
  if (!task) return reply(404, { ok: false, error: '업무를 찾을 수 없습니다.' });
  const repo = String((task.projects as unknown as { repo: string | null } | null)?.repo ?? '');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || repo.toLowerCase() === 'minho-nim/minlab') return reply(409, { ok: false, error: '이 업무의 저장소로는 PR을 열 수 없어요.' });
  const { data: result } = await userClient.from('result_packages').select('revision, source, summary, diff, work_item_id').eq('task_id', task.id).order('revision', { ascending: false }).limit(1).maybeSingle();
  // v0.6.29(소유자 "PC 전에 더 해둘 것"): Claude·Codex 결과도 여기서 연다. 세션이 브랜치를 못 올려도(권한 거부) 승인된 diff를
  // Actions가 기본 브랜치 위에 그대로 적용해 작업 브랜치로 올리고 PR을 연다. Gemini는 예전처럼 이미 올라간 브랜치에서.
  const fromDiff = !!result && ['claude_session_auto', 'claude_manual', 'codex_linear_auto'].includes(String(result.source));
  if (!result || (!fromDiff && result.source !== 'gemini_actions_auto')) return reply(409, { ok: false, error: '자동으로 PR을 열 수 있는 결과가 아닙니다(Gemini·Claude·Codex 자동 결과만).' });
  const tool = String(result.source).startsWith('codex') ? 'codex' : 'claude';
  const short = String(task.id).replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  const item = String(result.work_item_id ?? '').replace(/[^a-z0-9-]/gi, '').toLowerCase();
  const branch = fromDiff ? `ai/${tool}/${short}${item ? `-${item}` : ''}` : /작업 브랜치:\s*(ai\/gemini\/[a-z0-9-]+)/.exec(String(result.summary ?? ''))?.[1];
  if (!branch) return reply(409, { ok: false, error: '작업 브랜치가 올라가지 않은 결과예요.' });
  if (fromDiff && !String(result.diff ?? '').trim()) return reply(409, { ok: false, error: '바뀐 내용(diff)이 없는 결과예요.' });
  const { data: b } = await userClient.from('approvals').select('id').eq('task_id', task.id).eq('gate', 'B').eq('decision', 'approved').eq('approved_revision', result.revision).limit(1).maybeSingle();
  if (!b) return reply(409, { ok: false, error: '이 결과는 아직 올리기 승인(B) 전이에요.' });
  // 승인한 커밋과 지금 브랜치 끝이 같은지(v0.5.93, vicem "검토 뒤 바뀐 것은 내보내지 않음"). 커밋 줄이 없는 옛 결과·읽기 실패는 그대로 진행.
  const approvedSha = /커밋:\s*([0-9a-f]{40})/.exec(String(result.summary ?? ''))?.[1];
  const readToken = env('GITHUB_REPO_TOKEN');
  if (!fromDiff && approvedSha && readToken) {
    const head = await fetch(`https://api.github.com/repos/${repo}/branches/${branch}`, {
      headers: { Authorization: `Bearer ${readToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'minoffia' },
      signal: AbortSignal.timeout(10_000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { commit?: { sha?: string } } | null;
    const now = head?.commit?.sha;
    if (now && now !== approvedSha) return reply(409, { ok: false, error: `올리기 승인한 뒤 작업 브랜치가 바뀌었어요(승인 ${approvedSha.slice(0, 7)}, 지금 ${now.slice(0, 7)}). 결과를 다시 받아 확인하세요.` });
  }
  const title = `${String(task.title ?? '').slice(0, 80)} (minoffia 결과 v${result.revision})`;
  const prBody = `minoffia에서 올리기 승인(B)한 ${fromDiff ? (tool === 'codex' ? 'Codex' : 'Claude') : 'Gemini'} 개발 결과입니다. 병합은 배포 승인(C) 뒤에 합니다.\n\n${String(result.summary ?? '').slice(0, 3000)}`;
  // 승인된 diff는 비공개 버킷에 두고 1시간짜리 받기 주소만 Actions에 준다(로그에서는 가린다)
  let diffUrl = '';
  if (fromDiff) {
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    const path = `${user.id}/tasks/${task.id}/pr/v${result.revision}.diff`;
    const raw = String(result.diff);
    const up = await admin.storage.from('attachments').upload(path, new Blob([raw.endsWith('\n') ? raw : `${raw}\n`], { type: 'text/plain' }), { upsert: true, contentType: 'text/plain' });
    if (up.error) return reply(500, { ok: false, error: '승인된 변경을 준비하지 못했어요.' });
    const { data: signed } = await admin.storage.from('attachments').createSignedUrl(path, 3600);
    if (!signed?.signedUrl) return reply(500, { ok: false, error: '승인된 변경 주소를 만들지 못했어요.' });
    diffUrl = signed.signedUrl;
  }
  const res = await fetch(`https://api.github.com/repos/${officeRepo}/actions/workflows/open-pr.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'minoffia', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { repo, head: branch, title, body: prBody, ...(diffUrl ? { diff_url: diffUrl } : {}) } }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res?.ok) return reply(502, { ok: false, error: `PR 열기를 시작하지 못했습니다(GitHub ${res?.status ?? '응답 없음'}).` });
  return reply(200, { ok: true, started: true, branch });
});
