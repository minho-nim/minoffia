// Codex를 Linear로 맡기기(v0.5.2, 소유자 2026-11-03 "ㄱㄱ", 결정 docs/archive/CODEX_LINEAR_DECISION_2026-10-30.md).
// action 'start': 실행 승인(E)된 Codex 작업을 Linear 이슈(지시서 = 앱이 만든 Codex 지시서)로 만들고 Codex에게 맡긴다.
//   기본은 위임(delegateId, Linear 공식 에이전트 방식). CODEX_LINEAR_TRIGGER=mention이면 대신 @codex 멘션 댓글로 시작한다.
// action 'status': 그 이슈의 Codex 댓글만 읽어 진행 소식·작업 주소·시작 실패(한도·환경 없음)를 배정 기록에 남긴다(완료 판정은 사람이).
// 비밀값: LINEAR_API_KEY(소유자 계정 개인 키)는 secrets에만. 이슈 생성은 소유자 이름으로 된다.
import { loadPickedDesignSection } from './designDraft.ts';
import { skillPickRule } from './skillPick.ts';
import { BASE_RULES } from './projectRules.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { dispatchTrackedIssue, type LinearIssue } from './trackedDispatch.ts';
import { buildServerHandoff } from './serverHandoff.ts';
import { CREATE_COMMENT, CREATE_ISSUE, issueInput, LOOKUP_QUERY, readLookup, readNews, STATUS_QUERY, envMismatch, envWarning } from './linear.ts';

const MAX_TEXT = 60_000;
const env = (key: string) => (Deno.env.get(key) ?? '').trim();
const cors = {
  'Access-Control-Allow-Origin': env('OFFICE_ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function linear(key: string, query: string, variables: Record<string, unknown> = {}) {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: key },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown>; errors?: { message?: string }[] };
  if (!res.ok || !body.data || body.errors?.length) throw new Error(`Linear 응답 오류(HTTP ${res.status}) ${body.errors?.[0]?.message ?? ''}`.trim());
  return body.data;
}

/** 이 작업 전용 1회용 결과 제출표(dispatch-claude-dev와 같은 방식). 실패하면 null */
// deno-lint-ignore no-explicit-any
async function resultTicket(admin: any, ownerId: string, a: { id: string; task_id: string }): Promise<string | null> {
  const { data: spec } = await admin.from('task_specs').select('revision').eq('task_id', a.task_id).order('revision', { ascending: false }).limit(1).maybeSingle();
  if (!spec) return null;
  const ticket = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ticket)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const { error } = await admin.from('plan_submit_tokens').insert({
    owner_id: ownerId, task_id: a.task_id, spec_revision: spec.revision, token_hash: hash,
    expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(), kind: 'result', assignment_id: a.id,
  });
  return error ? null : ticket;
}

/** Codex 지시서 끝에 붙는 "결과 보내기" 절 */
export function submitSection(taskId: string, token: string, url = `${env('SUPABASE_URL')}/functions/v1/submit-result`): string {
  return [
    '',
    '## 결과 보내기(자동 저장, 필수)',
    `시험까지 끝나면 저장소 밖 /tmp/result-submit.json 에 {"task_id":"${taskId}","token":"${token}","result":{"summary":"<요약>","changed_files":["<경로>"],"diff":"<git diff 전체(기본 브랜치 대비)>","test_log":"<시험 명령과 결과 그대로>","remaining_issues":"<남은 문제, 없으면 빈 문자열>","screen":"<바뀐 화면을 여는 주소 경로(예: /stats, #/stats). 첫 화면이면 /, 화면 변경이 없으면 빈 문자열>"}} 를 JSON으로 저장하고(문자열은 JSON 이스케이프) 아래를 한 번 실행한다.`,
    `curl -sS -X POST '${url}' -H 'content-type: application/json' --data-binary @/tmp/result-submit.json`,
    '- 이 token은 이 작업의 결과 제출 전용(24시간, 3번까지)이다. 다른 곳에 쓰거나 파일·커밋에 남기지 않는다.',
    // v0.7.43 하네스: Codex는 Claude 훅을 못 쓰므로 저장소의 git 훅(.githooks/pre-commit)을 켜게 한다(.env·비밀값·삭제 SQL 커밋 막기)
    '- 작업을 시작하면 저장소에 .githooks 폴더가 있을 때 `git config core.hooksPath .githooks`를 한 번 실행한다. 커밋이 훅에 막히면 이유를 고친다(훅을 끄거나 --no-verify를 쓰지 않는다).',
    // v0.7.35 소유자 "미노가 대신 찍으면 굳이": Codex 클라우드에는 브라우저가 없고 내려받기도 막혀 있다
    '- 브라우저 화면 확인·스크린샷은 하지 않는다(브라우저·Playwright를 설치하려고 하지 않는다). 결과를 받으면 미노피아가 빌드해 휴대폰·PC 화면을 찍는다. 대신 "screen"에 바뀐 화면 경로를 꼭 적는다.',
    '- 응답이 {"ok":true,...}가 아니거나 접속이 막히면 응답(또는 오류)을 한 줄로 보고하고, 위 JSON의 result 부분을 마지막 메시지에 그대로 남긴다(사용자가 직접 옮길 수 있게).',
  ].join('\n');
}

/** 서버가 부를 때의 지시서(앱 지시서와 같은 뼈대, 첨부 설명 제외) */
// deno-lint-ignore no-explicit-any
async function serverText(admin: any, a: { task_id: string; plan_revision: number; work_item_id: string }): Promise<string> {
  const { data: t } = await admin.from('tasks').select('project_id, owner_id, skills, projects(repo)').eq('id', a.task_id).maybeSingle();
  const { data: spec } = await admin.from('task_specs').select('revision, final_prompt, change_scope, preserve_constraints, test_criteria').eq('task_id', a.task_id).order('revision', { ascending: false }).limit(1).maybeSingle();
  const { data: plan } = await admin.from('pm_plans').select('target_base_revision, plan').eq('task_id', a.task_id).eq('plan_revision', a.plan_revision).maybeSingle();
  const item = ((plan?.plan as { work_items?: Record<string, unknown>[] } | undefined)?.work_items ?? []).find((w) => w.id === a.work_item_id);
  if (!t || !spec || !item) return '';
  const { data: rules } = await admin.from('project_rules').select('rule').eq('project_id', t.project_id).order('created_at').limit(30);
  const { count } = await admin.from('attachments').select('id', { count: 'exact', head: true }).eq('task_id', a.task_id).eq('kind', 'request');
  // v0.6.82: 규칙 칸·개발 스킬(repo-map)이 들어 있는 저장소면 기본 규칙은 저장소 AGENTS.md에 있으므로 빼고 가리키기만
  const { data: sc } = await admin.from('skill_cache').select('map').eq('owner_id', t.owner_id).maybeSingle();
  const slim = !!(sc?.map as Record<string, Record<string, string>> | null)?.[String(t.project_id)]?.['repo-map'];
  // v0.7.13: 소유자가 고른 Gemini 시안이 있으면 기획서 뒤에 붙인다
  const design = await loadPickedDesignSection(admin, a.task_id, spec.revision);
  // v0.7.41 LLM 위키: 이 프로젝트의 지난 업무를 AI가 정리한 한 장(참고 자료)
  const { data: wikiRow } = await admin.from('project_wiki').select('body').eq('project_id', t.project_id).maybeSingle();
  const wikiBody = String(wikiRow?.body ?? '').trim();
  const wiki = wikiBody ? `\n\n## 프로젝트 위키(참고 자료, 지난 업무를 AI가 정리한 것 — 저장소를 뒤지기 전에 먼저 본다)\n${wikiBody.slice(0, 4000)}` : '';
  return buildServerHandoff({
    taskId: a.task_id,
    repo: String((t.projects as { repo?: string } | null)?.repo ?? ''),
    spec: { revision: spec.revision, final_prompt: `${spec.final_prompt ?? ''}${design}${wiki}`, change_scope: spec.change_scope ?? '', preserve_constraints: spec.preserve_constraints ?? '', test_criteria: spec.test_criteria ?? '' },
    item: { id: String(item.id), title: String(item.title ?? ''), goal: String(item.goal ?? ''), acceptance_tests: item.acceptance_tests as string[] | undefined, preserve_constraints: item.preserve_constraints as string[] | undefined },
    baseRevision: String(plan?.target_base_revision ?? ''),
    // 기본 규칙(모든 프로젝트)도 함께(v0.6.59: 서버가 시작한 Codex에는 프로젝트 규칙만 가고 기본 규칙이 빠져 있었다)
    // 소유자가 고른 개발 스킬(v0.7.0)은 맨 끝에 한 줄
    rules: [...(slim ? (rules ?? []).map((r: { rule: string }) => r.rule) : [...new Set([...BASE_RULES, ...(rules ?? []).map((r: { rule: string }) => r.rule)])]), ...skillPickRule(t.skills as string[] | null)],
    attachmentCount: count ?? 0,
    slim,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST만 받습니다.' });
  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  const key = env('LINEAR_API_KEY');
  const allowedRepo = env('CLAUDE_ALLOWED_REPOSITORY').toLowerCase();
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });

  let body: { action?: string; assignmentId?: string; acknowledgeRetry?: boolean; text?: string; ownerId?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  // v0.6.28(소유자 "앱을 닫아 둬도 진행"): 서버(submit-plan·submit-result)가 서버 키로 부르면 지시서를 서버가 만든다.
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const internal = Boolean(serviceKey) && req.headers.get('Authorization') === `Bearer ${serviceKey}`;
  const userClient = internal
    ? createClient(env('SUPABASE_URL'), serviceKey)
    : createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  let user: { id: string };
  if (internal) {
    if (!/^[0-9a-f-]{36}$/i.test(String(body.ownerId ?? ''))) return reply(400, { ok: false, error: 'ownerId가 필요합니다.' });
    user = { id: String(body.ownerId) };
  } else {
    const { data: auth } = await userClient.auth.getUser();
    if (!auth?.user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
    if ((auth.user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });
    user = auth.user;
  }
  // RLS를 거쳐 내 기록만 읽는다(서버 호출이면 주인 조건을 직접 건다).
  const { data: a } = await userClient.from('agent_assignments').select('*').eq('id', body.assignmentId ?? '').eq('owner_id', user.id).maybeSingle();
  if (!a) return reply(404, { ok: false, error: '배정된 작업을 찾을 수 없습니다.' });
  if (a.assignee !== 'codex') return reply(400, { ok: false, error: 'Codex에 배정된 작업만 맡깁니다.' });
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

  // 지시서 복사(v0.6.21, 소유자 "Codex는 어떻게"): Linear가 막혀도 Codex 앱에 붙여 넣으면 결과가 자동으로 오게.
  // 실행 승인(E)된 작업에 1회용 결과 제출표를 만들고 '시작함(사용자 기록)'으로 둔다. Linear에는 아무것도 보내지 않는다.
  if (body.action === 'manual') {
    const { data: e } = await admin.from('approvals').select('id').eq('task_id', a.task_id).eq('gate', 'E').eq('decision', 'approved')
      .eq('approved_revision', a.plan_revision).eq('work_item_id', a.work_item_id).limit(1);
    if (!e?.length) return reply(409, { ok: false, error: '이 작업의 실행 승인(E)이 없습니다.' });
    if (!['ready', 'failed', 'started'].includes(String(a.dispatch_status))) return reply(409, { ok: false, error: '지금은 지시서를 다시 만들 수 없는 상태입니다.' });
    const ticket = await resultTicket(admin, user.id, a);
    if (!ticket) return reply(503, { ok: false, error: '결과 제출표를 만들지 못했어요. 결과는 직접 붙여 넣어 주세요.' });
    const { error: upError } = await admin.from('agent_assignments').update({
      dispatch_status: 'started', status_source: 'user_reported', started_at: new Date().toISOString(),
      provider_execution_id: null, provider_task_url: null,
      actual_provider_status: 'codex: 지시서 복사함(Codex 앱에서 직접 시작, 결과는 자동 제출)',
    }).eq('id', a.id);
    if (upError) return reply(500, { ok: false, error: `상태 저장 실패: ${upError.message}` });
    return reply(200, { ok: true, section: submitSection(a.task_id, ticket) });
  }

  if (!key) return reply(503, { ok: false, error: 'LINEAR_API_KEY가 없어 Codex(Linear)를 쓸 수 없어요. 지시서 복사로 진행하세요.' });

  // 진행 소식 읽기(읽기만, Linear에 아무것도 쓰지 않음)
  if (body.action === 'status') {
    if (!a.provider_execution_id || !String(a.actual_provider_status ?? '').startsWith('linear')) return reply(409, { ok: false, error: 'Linear로 맡긴 작업이 아닙니다.' });
    try {
      const data = await linear(key, STATUS_QUERY, { id: a.provider_execution_id });
      if (!data.issue) return reply(409, { ok: false, error: '아직 Linear 이슈 생성을 확인하지 못했습니다. 새 이슈를 만들지 않고 기존 식별자를 유지합니다.' });
      const remoteIssue = data.issue as Partial<LinearIssue>;
      if (remoteIssue.id !== a.provider_execution_id || !remoteIssue.url) throw new Error('예약한 이슈의 주소를 확인하지 못했습니다.');
      const news = readNews(data as Parameters<typeof readNews>[0], a.started_at);
      const { data: tk } = await admin.from('tasks').select('projects(repo)').eq('id', a.task_id).maybeSingle();
      const repo = String((tk?.projects as { repo?: string } | null)?.repo ?? '');
      const warn = envMismatch(news.environment, repo) ? envWarning(news.environment!, repo) : '';
      const note = news.kind === 'none' ? 'linear: Codex 소식 아직 없음' : `linear: ${warn}${news.kind === 'error' ? '시작 못 함 — ' : news.kind === 'failed' ? '끝내지 못함 — ' : ''}${news.last}`;
      const patch: Record<string, unknown> = { actual_provider_status: note.slice(0, 300), provider_task_url: remoteIssue.url, status_source: 'server_verified', last_verified_at: new Date().toISOString() };
      if (a.dispatch_status === 'starting' || a.dispatch_status === 'started') patch.dispatch_status = news.kind === 'error' || news.kind === 'failed' ? 'failed' : 'started';
      const { data: saved, error: saveError } = await admin.from('agent_assignments').update(patch).eq('id', a.id).eq('provider_execution_id', a.provider_execution_id).eq('dispatch_status', a.dispatch_status).select('id').maybeSingle();
      if (saveError || !saved) return reply(503, { ok: false, error: 'Linear 소식은 읽었지만 저장하지 못했습니다. 다시 확인하세요.' });
      return reply(200, { ok: true, ...news });
    } catch (e) {
      return reply(502, { ok: false, error: (e as Error).message });
    }
  }

  // 맡기기
  const text = internal ? await serverText(admin, a) : (body.text ?? '').trim();
  if (!text || text.length > MAX_TEXT) return reply(400, { ok: false, error: `Codex 지시서는 1~${MAX_TEXT}자여야 합니다.` });
  const { data: task } = await userClient.from('tasks').select('id, title, projects(name, repo)').eq('id', a.task_id).maybeSingle();
  const project = task?.projects as unknown as { name: string; repo: string | null } | null;
  const repo = (project?.repo ?? '').toLowerCase();
  const { data: managed } = await userClient.from('managed_repos').select('full_name').eq('owner_id', user.id);
  const allowed = !!repo && repo !== 'minho-nim/minlab' && (repo === allowedRepo || (managed ?? []).some((m) => String(m.full_name).toLowerCase() === repo));
  if (!task || !project?.repo || !allowed) return reply(403, { ok: false, error: '허용된 저장소의 프로젝트만 Codex에 맡깁니다.' });

  let look: ReturnType<typeof readLookup>;
  try {
    look = readLookup((await linear(key, LOOKUP_QUERY)) as Parameters<typeof readLookup>[0], env('LINEAR_TEAM_KEY'), env('LINEAR_LABEL') || 'ai office');
  } catch (e) {
    return reply(502, { ok: false, error: (e as Error).message });
  }
  if (!look.teamId) return reply(409, { ok: false, error: 'Linear 팀을 찾지 못했어요.' });
  if (!look.canSetId) return reply(409, { ok: false, error: 'Linear가 이슈 식별자 예약을 지원하지 않아 추적 정보를 보존할 수 없습니다. 전송하지 않았습니다.' });
  if (!look.codexId) return reply(409, { ok: false, error: 'Linear에서 Codex를 찾지 못했어요. Codex for Linear 설치와 팀 추가를 확인하세요.' });

  // 실패 뒤 다시 맡기기(v0.6.20): 같은 이슈에 위임을 다시 걸어도 Codex가 반응하지 않았다(2026-11-10 WorthIt).
  // 실패가 확인된 작업이면 추적 식별자를 비워 새 이슈로 맡긴다(예전 이슈는 그대로 둔다).
  if (body.acknowledgeRetry && a.dispatch_status === 'failed') {
    await admin.from('agent_assignments').update({ provider_execution_id: null, provider_task_url: null }).eq('id', a.id).eq('dispatch_status', 'failed');
  }
  const { data: claim, error: claimError } = await admin.rpc('claim_codex_linear', { p_assignment: a.id, p_owner: user.id, p_allow_retry: Boolean(body.acknowledgeRetry) });
  if (claimError) return reply(500, { ok: false, error: `예약 실패: ${claimError.message}` });
  const row = Array.isArray(claim) ? claim[0] : claim;
  if (!row?.ok) {
    const why: Record<string, string> = {
      not_approved: '이 작업의 실행 승인(E)이 없습니다.',
      stale_plan: '최신 계획의 작업이 아닙니다.',
      not_claimable: '이미 맡겼거나 맡길 수 없는 상태입니다. 실패했다면 Linear 이슈를 확인한 뒤 확인 체크 후 다시 맡기세요.',
      not_codex: 'Codex에 배정된 작업만 맡깁니다.',
    };
    return reply(409, { ok: false, error: why[row?.reason] ?? '맡길 수 없습니다.' });
  }
  // 외부 요청 전에 식별자가 DB에 예약됐는지 확인한다.
  const { data: reserved, error: reservedError } = await admin.from('agent_assignments')
    .select('provider_execution_id').eq('id', a.id).eq('dispatch_status', 'starting').maybeSingle();
  if (reservedError || !reserved?.provider_execution_id) return reply(503, { ok: false, error: '추적 정보 예약을 확인하지 못해 Linear에 전송하지 않았습니다.' });
  const issueId = String(reserved.provider_execution_id);
  const mention = env('CODEX_LINEAR_TRIGGER') === 'mention';
  // 결과 자동 저장(v0.6.19, 소유자 "Codex 주, Claude 보조"): Claude 보조 개발과 같은 1회용 제출표(해시만 저장, 24시간, 3번까지).
  // Codex가 끝나면 submit-result로 diff를 보내고, 서버가 결과로 옮겨 Claude가 채점한다. 올리기 승인 뒤 PR은 Claude가 연다.
  // 제출표를 못 만들면 예전처럼 사람이 결과를 붙여 넣는다(지시서는 그대로 보낸다).
  const submit = await resultTicket(admin, user.id, a);
  const description = [`저장소: ${project.repo}`, `AI Office 업무 ${a.task_id} · 작업 ${a.work_item_id} · 계획 v${a.plan_revision}`, '', text, submit ? submitSection(a.task_id, submit) : ''].join('\n');
  try {
    const issue = await dispatchTrackedIssue({
      issueId,
      create: async (id) => {
        const data = await linear(key, CREATE_ISSUE, {
          input: issueInput({ issueId: id, teamId: look.teamId!, labelId: look.labelId, codexId: mention ? null : look.codexId, canDelegate: look.canDelegate, title: `[AI Office] ${task.title} · ${a.work_item_id}`, description }),
        }) as { issueCreate?: { success?: boolean; issue?: LinearIssue } };
        if (!data.issueCreate?.success || !data.issueCreate.issue) throw new Error('Linear 이슈 생성을 확인하지 못했습니다.');
        return data.issueCreate.issue;
      },
      read: async (id) => {
        const data = await linear(key, STATUS_QUERY, { id }) as { issue?: LinearIssue | null };
        return data.issue ?? null;
      },
      mention: mention ? async (id) => {
        const data = await linear(key, CREATE_COMMENT, { input: { issueId: id, body: '@codex 이 이슈의 지시서대로 진행해 줘. PR은 만들지 말고 작업만 해 줘.' } }) as { commentCreate?: { success?: boolean } };
        if (!data.commentCreate?.success) throw new Error('Codex 멘션 전송을 확인하지 못했습니다.');
      } : undefined,
      save: async (issue) => {
        const { data: saved, error: saveError } = await admin.from('agent_assignments').update({
          dispatch_status: 'started', status_source: 'server_verified',
          provider_task_url: issue.url,
          actual_provider_status: `linear: ${issue.identifier} 맡김(Codex 소식 기다리는 중)`,
          last_verified_at: new Date().toISOString(),
        }).eq('id', a.id).eq('provider_execution_id', issueId).eq('dispatch_status', 'starting').select('id').maybeSingle();
        if (saveError || !saved) throw new Error(saveError?.message ?? '배정 상태가 바뀌었습니다.');
      },
    });
    return reply(200, { ok: true, issueUrl: issue.url, identifier: issue.identifier });
  } catch (e) {
    // 응답 유실일 때 실패로 확정하거나 새 이슈를 만들지 않는다. 예약 ID로 상태를 다시 확인한다.
    return reply(502, { ok: false, issueId, error: `${(e as Error).message} (예약 식별자 ${issueId}). 소식을 다시 읽거나 Linear에서 확인 후 중단·재시도하세요.` });
  }
});
