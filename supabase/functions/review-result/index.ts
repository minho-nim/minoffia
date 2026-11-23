// 결과 점수 평가(v0.4.64, 소유자 2026-11-02): 결과 패키지 하나를 규칙 검사(토큰 0) → AI 채점(100점) → 판정한다.
// v0.7.8 3중 평가(소유자 2026-11-12): Gemini A(요청·사용자)·Gemini B(코드 품질·안전)를 함께 부르고, 동료 개발 AI(Codex 결과 → Claude)에 맡긴다.
// 항목은 같고 관점만 다르다. 평균이나 과반이 80점 미만이면 자동 다시 개발. 동료 점수는 submit-review가 같은 줄에 채운다.
// 같은 결과 버전은 한 줄만(result_reviews unique).
// 판정만 기록하고, 다시 개발 보내기는 앱이 기존 수정 요청 길(PM 재계획 → 실행 승인)로 한다. 올리기 승인(B)은 늘 소유자가 한다.
// 키는 secrets(GEMINI_API_KEY = Studio A, GEMINI_API_KEY2 = Studio B)에만. 휴가인 쪽 키는 쓰지 않는다. 글은 저장하지 않고 점수·이유만 남긴다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { requestRedoOnServer } from './redo.ts';
import { buildReviewPrompt, panelEntry, panelJudge, panelOutcome, parseScore, pendingEntry, PASS_SCORE, PEER_NOTE, PERSPECTIVE_NOTE, ranChecks, redoFeedback, requireRunEvidence, REVIEW_SYSTEM, ruleCheck, type Gate, type PanelEntry, type Score } from './rubric.ts';
import { loadRules } from './projectRules.ts';
import { buildClaudeReviewPayload, resultBranch } from './claude.ts';
import { tokensOf, type GeminiTokens } from './geminiTokens.ts';
import { NEED_FILES_ASK, parseNeedFiles, withFiles } from './needFiles.ts';
import { designReviewSection } from './designReview.ts';
import { geminiFetch } from './gemini-fallback.ts';

// v0.7.8: 결과 하나에 Gemini 두 번(A·B)이라 상한도 두 배
const DEFAULT_MODEL = 'gemini-3.5-flash';
const TIMEOUT_MS = 45_000;
/** v0.7.98 소유자 "하루 상한 삭제": 기본은 상한 없음. 서버 설정 CLAUDE_DAILY_CAP을 주면 그 값으로 다시 막는다 */
const NO_DAILY_CAP = 1_000_000;
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
  const res = await geminiFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
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
  return { status: res.status, text: parts.map((p) => p.text ?? '').join('').trim(), message: (data as { error?: { message?: string } }).error?.message ?? '', tokens: tokensOf(data) };
}

/** 채점 AI가 요청한 파일을 기본 브랜치에서 읽는다(읽기 전용 토큰, 너무 크면 null) */
async function readRepoFile(repo: string, path: string): Promise<string | null> {
  const token = env('GITHUB_REPO_TOKEN');
  if (!token || !repo.includes('/')) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw', 'User-Agent': 'minoffia' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 200_000 ? null : text;
  } catch {
    return null;
  }
}

// deno-lint-ignore no-explicit-any
type Admin = ReturnType<typeof createClient<any>>;

/** 모인 점수로 판정(지난 다시 개발 지적·자동 횟수·실행 기록 반영) */
async function settle(admin: Admin, taskId: string, revision: number, gates: Gate[], panel: PanelEntry[], testLog: string) {
  const { count: redos } = await admin.from('result_reviews').select('id', { count: 'exact', head: true }).eq('task_id', taskId).eq('verdict', 'redo');
  // v0.5.93: 지난 '다시 개발' 판정의 지적(같은 문제가 또 나오면 자동으로 돌리지 않음)과 시험·화면 확인 기록 유무
  const { data: lastRedo } = await admin.from('result_reviews').select('reasons').eq('task_id', taskId).eq('verdict', 'redo').lt('result_revision', revision).order('result_revision', { ascending: false }).limit(1).maybeSingle();
  const previousReasons = Array.isArray(lastRedo?.reasons) ? (lastRedo.reasons as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const out = panelOutcome(gates, panel, redos ?? 0, { executed: ranChecks(testLog), previousReasons });
  const feedback = out.verdict === 'pass' || out.waiting ? '' : redoFeedback(gates, out.score, out.reasons);
  return { ...out, feedback, redos: redos ?? 0 };
}

/** v0.6.12: '다시 개발'이면 서버가 바로 수정 요청·PM 재계획(앱이 닫혀 있어도). 응답은 기다리지 않는다 */
async function fireRedo(admin: Admin, ownerId: string, taskId: string, revision: number, feedback: string) {
  const redo = requestRedoOnServer(admin, ownerId, taskId, revision, feedback).catch(() => 'skipped');
  const er = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (er) er.waitUntil(redo);
  else await redo;
}

const asPanel = (v: unknown): PanelEntry[] => (Array.isArray(v) ? (v as PanelEntry[]) : []);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST만 받습니다.' });
  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });

  let body: { taskId?: string; resultRevision?: number; ownerId?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  const taskId = String(body.taskId ?? '');
  const revision = Number(body.resultRevision);

  // v0.5.90: submit-result가 결과를 서버에서 바로 받은 뒤 서버 키로 부른다(앱이 닫혀 있어도 채점). 이때는 업무 주인이 맞는지 직접 확인한다.
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const internal = Boolean(serviceKey) && req.headers.get('Authorization') === `Bearer ${serviceKey}`;
  const userClient = internal
    ? createClient(env('SUPABASE_URL'), serviceKey)
    : createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  let user: { id: string };
  if (internal) {
    const ownerId = String(body.ownerId ?? '');
    const { data: owned } = await userClient.from('tasks').select('id').eq('id', taskId).eq('owner_id', ownerId).maybeSingle();
    if (!owned) return reply(403, { ok: false, error: '업무 주인이 맞지 않습니다.' });
    user = { id: ownerId };
  } else {
    const { data: auth } = await userClient.auth.getUser();
    if (!auth?.user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
    if ((auth.user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });
    user = auth.user;
  }

  // RLS를 거쳐 내 업무만 읽는다.
  const { data: existing } = await userClient.from('result_reviews').select('*').eq('task_id', taskId).eq('result_revision', revision).maybeSingle();
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  if (existing) {
    // v0.7.8: 동료 평가를 기다리는 중이면, 소유자가 '기다리지 않고 판정'을 눌렀거나 제출표 기한이 지났을 때만 지금 점수로 판정한다.
    const panel = asPanel(existing.panel);
    if (!panel.some((p) => p.status === 'pending')) return reply(200, { ok: true, review: existing, cached: true });
    const { data: sent } = await admin.from('plan_submit_tokens').select('expires_at').eq('task_id', taskId).eq('kind', 'review').eq('result_revision', revision).maybeSingle();
    const expired = !sent || new Date(sent.expires_at).getTime() <= Date.now();
    if (body.action !== 'finalize' && !expired) return reply(200, { ok: true, review: existing, cached: true });
    const note = expired ? '기한 안에 점수가 오지 않음' : '사장님이 기다리지 않고 판정';
    const closed = panel.map((p) => (p.status === 'pending' ? { ...p, status: 'skipped' as const, note } : p));
    const { data: res } = await admin.from('result_packages').select('test_log').eq('task_id', taskId).eq('revision', revision).maybeSingle();
    const gatesNow = (existing.gates as Gate[]) ?? [];
    const out = await settle(admin, taskId, revision, gatesNow, closed, String(res?.test_log ?? ''));
    const { data: updated } = await admin
      .from('result_reviews')
      .update({ panel: closed, score: out.score, total: out.total, verdict: out.verdict, reasons: out.reasons, feedback: out.feedback, auto_redo: out.redos, judge: panelJudge(closed) })
      .eq('id', existing.id)
      .filter('panel', 'cs', JSON.stringify([{ status: 'pending' }]))
      .select('*');
    if (!updated?.length) {
      const { data: again } = await userClient.from('result_reviews').select('*').eq('id', existing.id).maybeSingle();
      return reply(200, { ok: true, review: again ?? existing, cached: true });
    }
    if (out.verdict === 'redo' && out.feedback) await fireRedo(admin, user.id, taskId, revision, out.feedback);
    return reply(200, { ok: true, review: updated[0] });
  }
  const { data: result } = await userClient.from('result_packages').select('revision, plan_revision, work_item_id, source, diff, test_log, remaining_issues').eq('task_id', taskId).eq('revision', revision).maybeSingle();
  if (!result) return reply(404, { ok: false, error: '결과 패키지를 찾을 수 없습니다.' });
  const { data: task } = await userClient.from('tasks').select('id, project_id, projects(repo, design_md)').eq('id', taskId).maybeSingle();
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
    const cap = Number(env('CLAUDE_DAILY_CAP')) || NO_DAILY_CAP;
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
      material: `${reviewMaterial()}\n\n${PEER_NOTE}`,
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
  const gates = ruleCheck({ diff: String(result.diff ?? ''), testLog: String(result.test_log ?? ''), changeScope: String(spec.change_scope ?? ''), rules: projectRules });
  const panel: PanelEntry[] = [];
  if (!gates.some((g) => g.blocking && !g.ok)) {
    // 2단계: Gemini A·B를 함께(무료). A는 Studio A 키 먼저, B는 Studio B 키 먼저. 한쪽이 휴가·없음이면 다른 키로 둘 다.
    const keys = [env('GEMINI_API_KEY'), env('GEMINI_API_KEY2')];
    const { data: awayRows } = await admin.from('agent_leave').select('agent').eq('owner_id', user.id);
    const away = new Set((awayRows ?? []).map((r: { agent: string }) => r.agent));
    if (away.has('studioA')) keys[0] = '';
    if (away.has('studioB')) keys[1] = '';
    // v0.7.99 소유자 "모두 상한은 없이": 기본 상한 없음. 서버 설정 GEMINI_REVIEW_DAILY_CAP을 주면 그 값
    const cap = Number(env('GEMINI_REVIEW_DAILY_CAP')) || NO_DAILY_CAP;
    const kstMidnight = new Date(Math.floor((Date.now() + 9 * 3600_000) / 86400_000) * 86400_000 - 9 * 3600_000).toISOString();
    // 하루 상한은 키마다 따로(v0.7.80 소유자 "제미나이 계산은 키마다 나눠": 키 A·B는 서로 다른 계정): A 채점은 A 키, B 채점은 B 키만 쓰므로 한쪽이 다 써도 다른 쪽은 채점한다
    const { data: usedRows } = await admin.from('ai_calls').select('key_slot').eq('owner_id', user.id).eq('purpose', 'review').eq('ok', true).gte('created_at', kstMidnight);
    const model = env('GEMINI_MODEL') || DEFAULT_MODEL;
    // 화면·디자인 업무면 디자인 채점 기준과 프로젝트 디자인 기준을 붙인다(v0.5.56, 호출 수 그대로)
    const prompt = `${reviewMaterial()}${designReviewSection(`${spec.final_prompt ?? ''}\n${spec.change_scope ?? ''}`, String((task.projects as unknown as { design_md?: string } | null)?.design_md ?? ''))}`;
    const used = [1, 2].map((slot) => (usedRows ?? []).filter((r: { key_slot: number | null }) => r.key_slot === slot).length);
    const repoName = String((task.projects as unknown as { repo: string | null } | null)?.repo ?? '');
    const canReadFiles = repoName.includes('/') && repoName.toLowerCase() !== 'minho-nim/minlab';
    // 파일 요청(v0.5.52): 첫 채점에서만 "이 파일이 필요해"를 허용하고, 서버가 GitHub에서 읽어 한 번만 다시 묻는다.
    const askGemini = async (who: 'A' | 'B', order: number[]): Promise<PanelEntry> => {
      let filesAsked = false;
      const run = async (text: string, allowFiles: boolean): Promise<{ score: Score; slot: number } | null> => {
        for (const i of order) {
          if (!keys[i] || used[i] >= cap) continue;
          let r: { status: number; text: string; message: string; tokens?: GeminiTokens };
          try {
            r = await callGemini(keys[i], model, allowFiles ? `${text}\n\n${NEED_FILES_ASK}` : text);
          } catch (e) {
            r = { status: 0, text: '', message: (e as Error).name };
          }
          // v0.7.44 실행 증거: 시험 기록에 화면 확인이 없으면 Gemini의 화면 기준 '충족'은 '일부'로
          const raw = r.status === 200 ? parseScore(r.text) : null;
          const parsed = raw ? requireRunEvidence(raw, String(result.test_log ?? '')) : null;
          const need = !parsed && allowFiles && r.status === 200 ? parseNeedFiles(r.text) : null;
          await admin.from('ai_calls').insert({ owner_id: user.id, provider: 'gemini', purpose: 'review', key_slot: i + 1, ok: Boolean(parsed || need), http_status: r.status || null, model, prompt_chars: text.length, answer_chars: r.text.length, ...(r.tokens ?? {}), ...(parsed || need ? {} : { error: (r.message || '점수 형식이 맞지 않음').slice(0, 300) }) });
          used[i] += parsed || need ? 1 : 0;
          if (parsed) return { score: parsed, slot: i };
          if (need && used[i] < cap) {
            filesAsked = true;
            const files = await Promise.all(need.map(async (path) => ({ path, text: await readRepoFile(repoName, path) })));
            return run(withFiles(text, files), false);
          }
          if (r.status === 400 || r.status === 404) break;
        }
        return null;
      };
      const got = await run(`${prompt}\n\n${PERSPECTIVE_NOTE[who]}`, canReadFiles);
      if (!got) return panelEntry(who, `Gemini ${who}`, null, used[who === 'A' ? 0 : 1] >= cap ? `오늘 Studio ${who} 채점 한도(${cap}회)에 닿음` : !keys[who === 'A' ? 0 : 1] ? `Studio ${who} 휴가·키 없음(다른 Studio가 대신 채점하지 않음)` : '점수를 받지 못함(키·응답 확인)');
      return panelEntry(who, `Gemini · Studio ${got.slot === 0 ? 'A' : 'B'}${filesAsked ? ' · 파일 확인' : ''}`, got.score);
    };
    // v0.7.57 소유자 "Gemini가 같은 일을 하거나 서로 교차하는 건 넘기지 않는 게 맞음": A 자리는 Studio A 키만, B 자리는 Studio B 키만(한쪽이 막히면 그 자리는 빠짐으로 남긴다. 같은 키 안의 예비 모델은 그대로)
    if (keys[0] || keys[1]) panel.push(...(await Promise.all([askGemini('A', [0]), askGemini('B', [1])])));
    else panel.push(panelEntry('A', 'Gemini A', null, '두 키 모두 휴가·없음'), panelEntry('B', 'Gemini B', null, '두 키 모두 휴가·없음'));

    // 3단계: 동료 개발 AI. 두 Gemini가 이미 둘 다 기준 미달이면(3개 중 2개 = 과반) 부르지 않는다(토큰 아끼기).
    const madeByClaude = assignee === 'claude' || ['claude_session_auto', 'claude_manual'].includes(String(result.source ?? ''));
    const lowAB = panel.filter((p) => p.status === 'done' && (p.total ?? 0) < PASS_SCORE).length;
    if (lowAB >= 2) panel.push(panelEntry('peer', madeByClaude ? 'Codex' : 'Claude', null, 'Gemini 둘 다 기준 미달이라 부르지 않음(토큰 아끼기)'));
    else if (madeByClaude) panel.push(panelEntry('peer', 'Codex', null, 'Claude 결과의 동료 평가(Codex)는 Codex Linear 연결 뒤에 켜져요'));
    else {
      const pending = await askClaude();
      panel.push(pending ? pendingEntry('peer', 'Claude', '브랜치를 직접 보고 채점하는 중(몇 분)') : panelEntry('peer', 'Claude', null, 'Claude가 지금 평가할 수 없음(휴가·하루 상한·연결)'));
    }
  }

  const testLog = String(result.test_log ?? '');
  const out = await settle(admin, taskId, revision, gates, panel, testLog);
  const { data: saved, error } = await admin
    .from('result_reviews')
    .insert({ owner_id: user.id, task_id: taskId, result_revision: revision, work_item_id: String(result.work_item_id ?? ''), assignee, gates, score: out.score, total: out.total, verdict: out.verdict, reasons: out.reasons, feedback: out.feedback, auto_redo: out.redos, judge: panelJudge(panel), panel })
    .select('*')
    .single();
  if (error) {
    // 동시에 두 번 불렸으면 먼저 저장된 것을 돌려준다.
    const { data: again } = await userClient.from('result_reviews').select('*').eq('task_id', taskId).eq('result_revision', revision).maybeSingle();
    if (again) return reply(200, { ok: true, review: again, cached: true });
    return reply(500, { ok: false, error: `평가를 저장하지 못했습니다: ${error.message}` });
  }
  if (out.verdict === 'redo' && out.feedback) await fireRedo(admin, user.id, taskId, revision, out.feedback);
  return reply(200, { ok: true, review: saved });
});
