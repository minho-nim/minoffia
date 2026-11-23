import type { ChatTurn } from './store';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '../lib/supabase';
import { MIME_EXT, storageContentType, type Attachment, type ImageAnalysis } from '../domain/attachments';
import type { Clarification, LinkRef } from '../domain/requestContext';
import type { AgentId, Project, ProjectRule, Task, UsageRun } from '../domain/types';
import type { DesignDraft } from '../domain/designDraft';
import type { AgentAssignment, Approval, Deployment, PmPlan, PrCheck, ResultPackage, ResultReview, RevisionRequest, TaskSpec } from '../domain/workflow-types';
import type { ChatEntry } from '../domain/devlog';
import { cleanSources, type Source } from '../domain/research';
import { cleanWeather } from '../domain/weather';
import { searchCreditsOf, searchTodayOf } from '../domain/searchCredits';
import type { OfficeStore, ResultInboxItem } from './store';
import { parseHealth } from '../domain/healthText';
import { parseSiteCheck } from '../domain/siteCheck';
import { parseDesignReport } from '../domain/designCheck';

/** ai_calls의 토큰 세 칸 합(하나도 없으면 null, v0.5.50) */
const callTokens = (r: Record<string, unknown>): number | null => {
  const v = [r.prompt_tokens, r.answer_tokens, r.thinking_tokens].filter((x): x is number => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

type Row = Record<string, unknown>;

const toProject = (r: Row): Project => ({
  id: r.id as string,
  name: r.name as string,
  repo: (r.repo as string | null) ?? null,
  description: (r.description as string) ?? '',
  // 마이그레이션 전 DB에는 칸이 없다(undefined면 저장할 때도 보내지 않음)
  previewHost: r.preview_host === undefined ? undefined : ((r.preview_host as string | null) ?? null),
  demoUrl: r.demo_url === undefined ? undefined : ((r.demo_url as string | null) ?? null),
  designMd: r.design_md === undefined ? undefined : String(r.design_md ?? ''),
  designDraft: r.design_draft === undefined ? undefined : String(r.design_draft ?? ''),
  position: r.position === undefined ? undefined : Number(r.position ?? 0),
  createdAt: r.created_at as string,
});

const toTask = (r: Row): Task => ({
  id: r.id as string,
  projectId: r.project_id as string,
  title: r.title as string,
  description: (r.description as string) ?? '',
  type: r.type as Task['type'],
  requestedType: r.requested_type as Task['requestedType'],
  priority: r.priority as Task['priority'],
  assignee: r.assignee as Task['assignee'],
  routeReason: (r.route_reason as string) ?? '',
  status: r.status as Task['status'],
  dispatch: {
    state: r.dispatch_state as Task['dispatch']['state'],
    sessionUrl: (r.dispatch_session_url as string | null) ?? null,
    error: (r.dispatch_error as string | null) ?? null,
    at: (r.dispatch_at as string | null) ?? null,
  },
  stage: (r.stage as Task['stage']) ?? 'received',
  userOriginalText: (r.user_original_text as string | null) ?? undefined,
  prUrl: (r.pr_url as string | null) ?? null,
  dispatchSpecRevision: (r.dispatch_spec_revision as number | null) ?? null,
  skills: (r.skills as string[] | null) ?? [],
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

const toSpec = (r: Row): TaskSpec => ({
  id: r.id as string,
  taskId: r.task_id as string,
  revision: r.revision as number,
  intent: r.intent as TaskSpec['intent'],
  planner: r.planner === 'gemini_draft' ? 'gemini_draft' : 'chatgpt_manual',
  userOriginalText: r.user_original_text as string,
  finalPrompt: r.final_prompt as string,
  changeScope: r.change_scope as string,
  preserveConstraints: r.preserve_constraints as string,
  testCriteria: r.test_criteria as string,
  answer: r.answer as string,
  sizeHint: (r.size_hint as TaskSpec['sizeHint']) ?? null,
  createdAt: r.created_at as string,
});

const toApproval = (r: Row): Approval => ({
  id: r.id as string,
  taskId: r.task_id as string,
  gate: r.gate as Approval['gate'],
  decision: r.decision as Approval['decision'],
  approvedRevision: r.approved_revision as number,
  previousRevision: (r.previous_revision as number | null) ?? null,
  workItemId: (r.work_item_id as string) ?? '',
  scope: (r.scope as Record<string, unknown>) ?? {},
  actor: (r.actor as string) ?? '',
  createdAt: r.created_at as string,
});

const toPlan = (r: Row): PmPlan => ({
  id: r.id as string,
  taskId: r.task_id as string,
  planRevision: r.plan_revision as number,
  approvedSpecRevision: r.approved_spec_revision as number,
  targetBaseRevision: (r.target_base_revision as string) ?? '',
  source: r.source as PmPlan['source'],
  plan: r.plan as PmPlan['plan'],
  createdAt: r.created_at as string,
});

const toAssignment = (r: Row): AgentAssignment => ({
  id: r.id as string,
  taskId: r.task_id as string,
  planRevision: r.plan_revision as number,
  workItemId: r.work_item_id as string,
  title: (r.title as string) ?? '',
  assignee: r.assignee as AgentAssignment['assignee'],
  executionMode: r.execution_mode as AgentAssignment['executionMode'],
  dispatchStatus: r.dispatch_status as AgentAssignment['dispatchStatus'],
  statusSource: r.status_source as AgentAssignment['statusSource'],
  providerExecutionId: (r.provider_execution_id as string | null) ?? null,
  providerTaskUrl: (r.provider_task_url as string | null) ?? null,
  actualProviderStatus: (r.actual_provider_status as string) ?? 'unknown',
  startedAt: (r.started_at as string | null) ?? null,
  lastVerifiedAt: (r.last_verified_at as string | null) ?? null,
  updatedAt: r.updated_at as string,
});

const toResult = (r: Row): ResultPackage => ({
  id: r.id as string,
  taskId: r.task_id as string,
  revision: r.revision as number,
  planRevision: (r.plan_revision as number | null) ?? null,
  workItemId: (r.work_item_id as string) ?? '',
  source: r.source as ResultPackage['source'],
  summary: r.summary as string,
  diff: r.diff as string,
  testLog: r.test_log as string,
  remainingIssues: r.remaining_issues as string,
  sha256: r.sha256 as string,
  previewUrl: (r.preview_url as string | undefined) ?? '',
  createdAt: r.created_at as string,
});

const toRun = (r: Row): UsageRun => ({
  id: r.id as string,
  agent: r.agent as UsageRun['agent'],
  taskId: (r.task_id as string | null) ?? null,
  kind: r.kind as UsageRun['kind'],
  day: r.day as string,
  createdAt: r.created_at as string,
});

const toRevisionRequest = (r: Row): RevisionRequest => ({
  id: r.id as string,
  taskId: r.task_id as string,
  specRevision: r.spec_revision as number,
  resultRevision: r.result_revision as number,
  feedback: r.feedback as string,
  createdAt: r.created_at as string,
});

const toAttachment = (r: Row): Attachment => ({
  id: r.id as string,
  taskId: r.task_id as string,
  kind: r.kind as Attachment['kind'],
  resultRevision: (r.result_revision as number | null) ?? null,
  planRevision: (r.plan_revision as number | null) ?? null,
  position: r.position as number,
  role: r.role as Attachment['role'],
  note: (r.note as string) ?? '',
  fileName: r.file_name as string,
  mime: r.mime as string,
  sizeBytes: r.size_bytes as number,
  sha256: r.sha256 as string,
  storagePath: r.storage_path as string,
  createdAt: r.created_at as string,
});

const toAnalysis = (r: Row): ImageAnalysis => ({
  id: r.id as string,
  attachmentId: (r.attachment_id ?? r.attachmentId) as string,
  taskId: (r.task_id ?? r.taskId) as string,
  model: (r.model as string) ?? '',
  keySlot: ((r.key_slot ?? r.keySlot) as 1 | 2 | null) ?? null,
  analysis: r.analysis as ImageAnalysis['analysis'],
  createdAt: (r.created_at ?? r.createdAt) as string,
});

const toPrCheck = (r: Row): PrCheck => ({
  id: r.id as string,
  taskId: r.task_id as string,
  prUrl: r.pr_url as string,
  prState: r.pr_state as PrCheck['prState'],
  merged: Boolean(r.merged),
  headSha: (r.head_sha as string) ?? '',
  ciState: r.ci_state as PrCheck['ciState'],
  checks: (r.checks as PrCheck['checks']) ?? [],
  checkedAt: r.checked_at as string,
});

/** 실시간으로 지켜보는 표(0015_realtime.sql과 같아야 함) */
const REALTIME_TABLES = [
  'projects', 'tasks', 'usage_runs', 'task_specs', 'approvals', 'pm_plans', 'agent_assignments',
  'result_packages', 'revision_requests', 'attachments', 'link_refs', 'clarifications',
  'image_analyses', 'pr_checks', 'deployments', 'inbox_state', 'agent_limits', 'pm_plan_inbox', 'dev_result_inbox', 'pr_dispatches', 'agent_leave', 'project_rules', 'result_reviews', 'task_followups', 'claude_research', 'design_drafts', 'design_picks',
  // v0.7.97(0066): 사용량 바로 반영. 앱은 이 표가 바뀌면 사용량만 다시 읽는다
  'ai_calls',
];

const toReview = (r: Row): ResultReview => ({
  id: r.id as string,
  taskId: r.task_id as string,
  resultRevision: r.result_revision as number,
  workItemId: (r.work_item_id as string) ?? '',
  assignee: (r.assignee as string) ?? '',
  gates: (r.gates as ResultReview['gates']) ?? [],
  score: (r.score as ResultReview['score']) ?? null,
  total: (r.total as number | null) ?? null,
  verdict: r.verdict as ResultReview['verdict'],
  reasons: (r.reasons as string[]) ?? [],
  feedback: (r.feedback as string) ?? '',
  autoRedo: (r.auto_redo as number) ?? 0,
  judge: (r.judge as string) ?? '',
  crossTotal: (r.cross_total as number | null) ?? null,
  crossJudge: (r.cross_judge as string | null) ?? null,
  crossReasons: (r.cross_reasons as string[] | null) ?? [],
  panel: Array.isArray(r.panel) ? (r.panel as ResultReview['panel']) : [],
  screen: r.screen && typeof r.screen === 'object' && Number.isFinite((r.screen as { score?: number }).score) ? (r.screen as ResultReview['screen']) : null,
  createdAt: r.created_at as string,
});

const toDraft = (r: Row): DesignDraft => ({
  id: r.id as string,
  taskId: r.task_id as string,
  specRevision: r.spec_revision as number,
  who: r.who as DesignDraft['who'],
  judge: (r.judge as string) ?? '',
  svg: r.svg as string,
  flow: (r.flow as string) ?? '',
  note: (r.note as string) ?? '',
  review: (r.review as DesignDraft['review']) ?? null,
  createdAt: r.created_at as string,
});

const toDeployment = (r: Row): Deployment => ({
  id: r.id as string,
  taskId: r.task_id as string,
  repo: r.repo as string,
  fromSha: (r.from_sha as string) ?? '',
  toSha: (r.to_sha as string) ?? '',
  ok: Boolean(r.ok),
  error: (r.error as string) ?? '',
  createdAt: r.created_at as string,
});

const toLink = (r: Row): LinkRef => ({
  id: r.id as string,
  taskId: r.task_id as string,
  url: r.url as string,
  kind: r.kind as LinkRef['kind'],
  status: r.status as LinkRef['status'],
  httpStatus: (r.http_status as number | null) ?? null,
  contentType: (r.content_type as string) ?? '',
  title: (r.title as string) ?? '',
  excerpt: (r.excerpt as string) ?? '',
  error: (r.error as string) ?? '',
  sha256: (r.sha256 as string) ?? '',
  createdAt: r.created_at as string,
});

const toClarification = (r: Row): Clarification => ({
  id: r.id as string,
  taskId: r.task_id as string,
  specRevision: r.spec_revision as number,
  question: r.question as string,
  answer: r.answer as string,
  createdAt: r.created_at as string,
});

/** 비공개 버킷. 정책은 supabase/migrations/0004_attachments.sql */
const BUCKET = 'attachments';
/** 화면용 주소 유효 시간(초) */
const SIGNED_URL_SECONDS = 3600;

/** 같은 일을 두 번 보내면(단추 두 번·다른 기기·서버가 먼저) DB의 '하나만' 규칙(23505)에 걸린다. 이미 된 것이니 성공으로 본다(v0.6.16) */
function checkOnce(res: { error: { message: string; code?: string } | null }): void {
  if (res.error && res.error.code !== '23505') throw new Error(res.error.message);
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** 서버가 돌려준(또는 저장해 둔) 스킬 목록을 앱 모양으로 */
function parseSkillFiles(raw: unknown): import('../domain/skills').SkillFile[] {
  const list = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  return list.map((x) => ({
    name: String(x.name ?? ''),
    skillMd: String(x.skillMd ?? ''),
    files: Array.isArray(x.files) ? (x.files as unknown[]).filter((f): f is string => typeof f === 'string') : [],
    license: String(x.license ?? ''),
    dir: typeof x.dir === 'string' ? x.dir : undefined,
    meta: x.meta === true,
  }));
}
function parseMcpMap(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [id, v] of Object.entries((raw ?? {}) as Record<string, unknown>)) out[id] = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
  return out;
}
function parseSkillMap(raw: unknown): import('../domain/skills').SkillMapData {
  const out: Record<string, Record<string, 'same' | 'old' | 'extra'>> = {};
  for (const [id, m] of Object.entries((raw ?? {}) as Record<string, Record<string, unknown>>)) {
    out[id] = {};
    for (const [n, v] of Object.entries(m ?? {})) if (v === 'same' || v === 'old' || v === 'extra') out[id][n] = v;
  }
  return out;
}

export function createSupabaseStore(client: SupabaseClient): OfficeStore {
  let lastGeminiWarm = 0;
  const userId = async () => {
    const { data } = await client.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new Error('로그인이 필요합니다.');
    return id;
  };
  // 다른 기록이 같은 파일을 쓰지 않을 때만 파일을 지운다(같은 이미지는 한 번만 저장하므로).
  const removeIfUnused = async (path: string) => {
    const { count } = await client.from('attachments').select('id', { count: 'exact', head: true }).eq('storage_path', path);
    if (!count) await client.storage.from(BUCKET).remove([path]);
  };
  const urlCache = new Map<string, { url: string; until: number }>();
  /** Edge Function을 부르고, 실패하면 서버가 준 한국어 오류를 그대로 던진다. */
  const invoke = async (name: string, body: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const { data, error } = await client.functions.invoke(name, { body });
    if (error) {
      let message = error.message;
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const b = await ctx.json();
          if (b?.error) message = b.error;
        } catch {
          // 본문이 JSON이 아니면 기본 메시지
        }
      }
      throw new Error(message);
    }
    if (!data?.ok) throw new Error(data?.error ?? `${name} 호출에 실패했습니다.`);
    return data as Record<string, unknown>;
  };
  return {
    mode: 'supabase',
    async load() {
      const since = new Date(Date.now() - 7 * 86400_000).toISOString();
      const [projects, tasks, usage, specs, approvals, plans, assignments, results, revisionRequests, attachments, links, clarifications, aiCalls, imageAnalyses, agentLimits, prChecks, deployments, leave, projectRules, reviews, followups, research, designDrafts, designPicks] = await Promise.all([
        client.from('projects').select('*').order('created_at'),
        client.from('tasks').select('*').order('created_at', { ascending: false }),
        client.from('usage_runs').select('*').gte('created_at', since),
        client.from('task_specs').select('*').order('revision'),
        client.from('approvals').select('*').order('created_at'),
        client.from('pm_plans').select('*').order('plan_revision'),
        client.from('agent_assignments').select('*').order('work_item_id'),
        // 결과 목록에는 큰 diff·로그를 빼고, 필요할 때만 읽는 대신 v0.2.1은 크기 상한(500KB)으로 제한한다.
        client.from('result_packages').select('*').order('revision'),
        client.from('revision_requests').select('*').order('created_at'),
        client.from('attachments').select('*').order('position'),
        client.from('link_refs').select('*').order('created_at'),
        client.from('clarifications').select('*').order('created_at'),
        client.from('ai_calls').select('*').gte('created_at', since).order('created_at'),
        client.from('image_analyses').select('*').order('created_at'),
        client.from('agent_limits').select('assignee, max_running'),
        client.from('pr_checks').select('*').order('checked_at'),
        client.from('deployments').select('*').order('created_at'),
        client.from('agent_leave').select('agent'),
        client.from('project_rules').select('*').order('created_at'),
        client.from('result_reviews').select('*').order('created_at'),
        client.from('task_followups').select('*').order('created_at'),
        client.from('claude_research').select('id, question, status, answer, sources, session_url, expires_at, created_at').gte('created_at', since).order('created_at'),
        client.from('design_drafts').select('*').order('created_at'),
        client.from('design_picks').select('*').order('created_at'),
      ]);
      // 이번 달(KST) 웹 검색 크레딧 추정(v0.7.53): 공급자 tavily·firecrawl 기록만 읽는다(가벼움)
      const kstNow = new Date(Date.now() + 9 * 3600_000);
      const monthStart = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), 1) - 9 * 3600_000).toISOString();
      // v0.7.88: 실패해도 서비스에 도착한 요청은 크레딧이 빠진다(billable) → 성공만이 아니라 모두 읽고 거른다
      const searchRows = await client.from('ai_calls').select('provider, model, ok, http_status, created_at').in('provider', ['tavily', 'firecrawl']).gte('created_at', monthStart);
      const searchCredits = searchCreditsOf((searchRows.data ?? []) as { provider: string; model: string; ok: boolean; http_status: number | null }[]);
      const searchToday = searchTodayOf((searchRows.data ?? []) as { provider: string; model: string; created_at: string; ok: boolean; http_status: number | null }[]);
      return {
        projects: (check(projects) ?? []).map(toProject),
        tasks: (check(tasks) ?? []).map(toTask),
        usage: (check(usage) ?? []).map(toRun),
        workflow: {
          specs: (check(specs) ?? []).map(toSpec),
          approvals: (check(approvals) ?? []).map(toApproval),
          plans: (check(plans) ?? []).map(toPlan),
          assignments: (check(assignments) ?? []).map(toAssignment),
          results: (check(results) ?? []).map(toResult),
          revisionRequests: (check(revisionRequests) ?? []).map(toRevisionRequest),
          attachments: (check(attachments) ?? []).map(toAttachment),
          links: (check(links) ?? []).map(toLink),
          clarifications: (check(clarifications) ?? []).map(toClarification),
          // 표가 아직 없는 운영 DB(마이그레이션 전)에서도 화면은 열리게 한다.
          imageAnalyses: imageAnalyses.error ? [] : (imageAnalyses.data ?? []).map(toAnalysis),
          prChecks: prChecks.error ? [] : (prChecks.data ?? []).map(toPrCheck),
          deployments: deployments.error ? [] : (deployments.data ?? []).map(toDeployment),
          reviews: reviews.error ? [] : (reviews.data ?? []).map(toReview),
          designDrafts: designDrafts.error ? [] : (designDrafts.data ?? []).map(toDraft),
          designPicks: designPicks.error ? [] : (designPicks.data ?? []).map((r: Row) => ({ id: r.id as string, taskId: r.task_id as string, specRevision: r.spec_revision as number, draftId: r.draft_id as string, createdAt: r.created_at as string })),
          followups: followups.error ? [] : (followups.data ?? []).map((r: Row) => ({ id: r.id as string, taskId: r.task_id as string, text: r.text as string, usedAt: (r.used_at as string | null) ?? null, createdAt: r.created_at as string })),
        },
        leave: leave.error ? [] : (leave.data ?? []).map((r: Row) => r.agent as AgentId),
        // 표가 아직 없는 운영 DB(마이그레이션 전)에서도 화면은 열리게 한다.
        research: research.error
          ? []
          : (research.data ?? []).map((r: Row) => ({
              id: r.id as string,
              question: r.question as string,
              status: r.status as 'pending' | 'done' | 'failed',
              answer: (r.answer as string) ?? '',
              sources: Array.isArray(r.sources) ? (r.sources as { uri: string; title: string }[]) : [],
              sessionUrl: (r.session_url as string | null) ?? null,
              expiresAt: r.expires_at as string,
              createdAt: r.created_at as string,
            })),
        projectRules: projectRules.error
          ? []
          : (projectRules.data ?? []).map((r: Row) => ({
              id: r.id as string,
              projectId: r.project_id as string,
              rule: r.rule as string,
              source: r.source as ProjectRule['source'],
              taskId: (r.task_id as string | null) ?? null,
              createdAt: r.created_at as string,
            })),
        agentLimits: agentLimits.error ? {} : Object.fromEntries((agentLimits.data ?? []).map((r: Row) => [r.assignee as string, r.max_running as number])),
        // 표가 아직 없는 운영 DB(마이그레이션 전)에서도 화면은 열리게 한다.
        searchCredits,
        searchToday,
        aiCalls: aiCalls.error ? [] : (aiCalls.data ?? []).filter((r: Row) => !r.provider || r.provider === 'gemini').map((r: Row) => ({ id: r.id as string, ok: r.ok as boolean, keySlot: (r.key_slot as 1 | 2 | null) ?? null, purpose: ((r.purpose as string) === 'image' ? 'image' : (r.purpose as string) === 'research' ? 'research' : 'question') as 'question' | 'image' | 'research', httpStatus: (r.http_status as number | null) ?? null, tokens: callTokens(r), createdAt: r.created_at as string })),
      };
    },
    async saveProject(p) {
      check(await client.from('projects').upsert({ id: p.id, name: p.name, repo: p.repo, description: p.description, ...(p.previewHost !== undefined ? { preview_host: p.previewHost } : {}), ...(p.demoUrl !== undefined ? { demo_url: p.demoUrl } : {}), ...(p.position !== undefined ? { position: p.position } : {}) }));
    },
    async deleteProject(id) {
      check(await client.from('projects').delete().eq('id', id));
    },
    async reorderProjects(ids) {
      // 순서 칸(position)만 바꾼다(v0.6.42)
      for (const [i, id] of ids.entries()) check(await client.from('projects').update({ position: i }).eq('id', id));
    },
    async saveTask(t) {
      // dispatch_* 열은 서버(Edge Function)만 바꾼다. DB 트리거도 클라이언트 변경을 무시한다.
      check(
        await client.from('tasks').upsert({
          id: t.id,
          project_id: t.projectId,
          title: t.title,
          description: t.description,
          type: t.type,
          requested_type: t.requestedType,
          priority: t.priority,
          assignee: t.assignee,
          route_reason: t.routeReason,
          status: t.status,
          stage: t.stage ?? 'received',
          user_original_text: t.userOriginalText ?? null,
          pr_url: t.prUrl ?? null,
          skills: t.skills ?? [],
        }),
      );
    },
    async deleteTask(id) {
      check(await client.from('tasks').delete().eq('id', id));
      // 기록은 함께 지워졌다(on delete cascade). 남은 파일도 정리한다. 실패해도 업무 삭제는 끝난 것이다.
      try {
        const folder = `${await userId()}/${id}`;
        const { data } = await client.storage.from(BUCKET).list(folder, { limit: 100 });
        if (data?.length) await client.storage.from(BUCKET).remove(data.map((f) => `${folder}/${f.name}`));
      } catch {
        // 무시
      }
    },
    async addManualRun(r) {
      check(await client.from('usage_runs').insert({ id: r.id, agent: r.agent, task_id: r.taskId, kind: 'manual' }));
    },
    async addSpec(x) {
      check(
        await client.from('task_specs').insert({
          id: x.id,
          task_id: x.taskId,
          revision: x.revision,
          intent: x.intent,
          planner: x.planner,
          user_original_text: x.userOriginalText,
          final_prompt: x.finalPrompt,
          change_scope: x.changeScope,
          preserve_constraints: x.preserveConstraints,
          test_criteria: x.testCriteria,
          answer: x.answer,
        }),
      );
    },
    async addApproval(x) {
      // 승인자(actor)는 서버가 로그인 정보로 채운다.
      checkOnce(
        await client.from('approvals').insert({
          id: x.id,
          task_id: x.taskId,
          gate: x.gate,
          decision: x.decision,
          approved_revision: x.approvedRevision,
          previous_revision: x.previousRevision,
          work_item_id: x.workItemId,
          scope: x.scope,
        }),
      );
    },
    async addPlan(p, assignments) {
      check(await client.rpc('save_pm_plan', {
        p_plan: {
          id: p.id, task_id: p.taskId, plan_revision: p.planRevision,
          approved_spec_revision: p.approvedSpecRevision, target_base_revision: p.targetBaseRevision,
          source: p.source, plan: p.plan,
        },
        p_assignments: assignments.map((a) => ({
          id: a.id, work_item_id: a.workItemId, title: a.title,
          assignee: a.assignee, execution_mode: a.executionMode,
        })),
      }));
    },
    async updateAssignment(a) {
      check(
        await client
          .from('agent_assignments')
          .update({
            dispatch_status: a.dispatchStatus,
            // 앱에서 바꾸는 상태는 사용자 기록이다. 서버 확인 표시(server_verified)를 그대로 보내면 DB 보호 규칙이 막아
            // 서버가 시작한 작업(Gemini 개발·Codex Linear)의 완료·중단 기록이 저장되지 않았다(v0.5.33).
            status_source: a.statusSource === 'server_verified' ? 'user_reported' : a.statusSource,
            provider_task_url: a.providerTaskUrl,
            actual_provider_status: a.actualProviderStatus,
            started_at: a.startedAt,
          })
          .eq('id', a.id),
      );
    },
    async addFollowup(taskId, text) {
      check(await client.from('task_followups').insert({ task_id: taskId, text: text.trim().slice(0, 2000) }));
    },
    async addRevisionRequest(x) {
      checkOnce(
        await client.from('revision_requests').insert({
          id: x.id,
          task_id: x.taskId,
          spec_revision: x.specRevision,
          result_revision: x.resultRevision,
          feedback: x.feedback,
        }),
      );
    },
    async addAttachment(x, file) {
      const path = `${await userId()}/${x.taskId}/${x.sha256}.${MIME_EXT[x.mime] ?? 'bin'}`;
      // 같은 업무에 같은 파일이 이미 있으면 그대로 쓴다(덮어쓰기 없음).
      // HTML·SVG는 글(text/plain)로 올려 비공개 주소를 직접 열어도 실행되지 않게 한다.
      const up = await client.storage.from(BUCKET).upload(path, file, { contentType: storageContentType(x.mime), upsert: false });
      const duplicate = up.error && /exist|duplicate/i.test(up.error.message);
      if (up.error && !duplicate) throw new Error(`파일 올리기 실패: ${up.error.message}`);
      const res = await client.from('attachments').insert({
        id: x.id,
        task_id: x.taskId,
        kind: x.kind,
        result_revision: x.resultRevision,
        // 견본일 때만 보낸다(0014 적용 전 DB에서도 다른 첨부는 올라가게)
        ...(x.kind === 'prototype' ? { plan_revision: x.planRevision ?? null } : {}),
        position: x.position,
        role: x.role,
        note: x.note,
        file_name: x.fileName,
        mime: x.mime,
        size_bytes: x.sizeBytes,
        sha256: x.sha256,
        storage_path: path,
      });
      if (res.error) {
        if (!duplicate) await removeIfUnused(path).catch(() => undefined);
        throw new Error(res.error.message);
      }
    },
    async updateAttachment(x) {
      check(await client.from('attachments').update({ position: x.position, role: x.role, note: x.note }).eq('id', x.id));
    },
    async deleteAttachment(x) {
      const res = await client.from('attachments').delete().eq('id', x.id).select('id');
      if (res.error) throw new Error(res.error.message);
      if (!res.data?.length) throw new Error('지울 수 없는 첨부입니다(결과 스크린샷은 검토 기록이라 남습니다).');
      await removeIfUnused(x.storagePath).catch(() => undefined);
    },
    async attachmentUrl(x) {
      const hit = urlCache.get(x.storagePath);
      if (hit && hit.until > Date.now()) return hit.url;
      const { data, error } = await client.storage.from(BUCKET).createSignedUrl(x.storagePath, SIGNED_URL_SECONDS);
      if (error || !data) throw new Error(`파일 주소를 만들지 못했습니다: ${error?.message ?? ''}`);
      // 만료 5분 전까지만 다시 쓴다.
      urlCache.set(x.storagePath, { url: data.signedUrl, until: Date.now() + (SIGNED_URL_SECONDS - 300) * 1000 });
      return data.signedUrl;
    },
    async checkPr(taskId) {
      const { data, error } = await client.functions.invoke('pr-status', { body: { taskId } });
      if (error) {
        let message = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json();
            if (body?.error) message = body.error;
          } catch {
            // 본문이 JSON이 아니면 기본 메시지
          }
        }
        throw new Error(message);
      }
      if (!data?.ok || !data.check) throw new Error(data?.error ?? 'PR을 확인하지 못했습니다.');
      return toPrCheck(data.check as Row);
    },
    subscribe(onChange) {
      // 0015_realtime.sql의 표들. RLS를 따르므로 내 행의 변경만 온다.
      const channel = client.channel('office-changes');
      for (const table of REALTIME_TABLES) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange(table));
      }
      channel.subscribe();
      return () => {
        void client.removeChannel(channel);
      };
    },
    async loadPlanInbox() {
      const { data, error } = await client.from('pm_plan_inbox').select('id, task_id, spec_revision, plan_text').eq('status', 'new').order('created_at');
      if (error) return [];
      return (data ?? []).map((r) => ({ id: r.id as string, taskId: r.task_id as string, specRevision: r.spec_revision as number, planText: r.plan_text as string }));
    },
    async markPlanInbox(id, status, note) {
      const { data, error } = await client.from('pm_plan_inbox').update({ status, note: note.slice(0, 2000) }).eq('id', id).eq('status', 'new').select('id');
      return !error && Boolean(data?.length);
    },
    async loadResultInbox() {
      const { data, error } = await client
        .from('dev_result_inbox')
        .select('*')
        .eq('status', 'new')
        .order('created_at');
      if (error) return [];
      return (data ?? []).map((r) => ({
        id: r.id as string,
        taskId: r.task_id as string,
        assignmentId: r.assignment_id as string,
        summary: r.summary as string,
        changedFiles: r.changed_files as string,
        diff: r.diff as string,
        testLog: r.test_log as string,
        remainingIssues: r.remaining_issues as string,
        branch: r.branch as string,
        previewUrl: (r.preview_url as string | undefined) ?? '',
        screenshots: Array.isArray(r.screenshots) ? (r.screenshots as ResultInboxItem['screenshots']) : [],
      }));
    },
    async linkResultShots(taskId, resultRevision, shots) {
      const owner = await userId();
      for (const [i, s] of shots.entries()) {
        if (!s.path.startsWith(`${owner}/${taskId}/`) || !['image/jpeg', 'image/png'].includes(s.mime)) continue;
        const res = await client.from('attachments').insert({
          task_id: taskId,
          kind: 'result',
          result_revision: resultRevision,
          position: i,
          role: 'after',
          note: s.name.includes('mobile') || s.name.includes('휴대폰') ? '자동 화면 확인(휴대폰 400px)' : '자동 화면 확인(데스크톱 1400px)',
          file_name: s.name.slice(0, 200),
          mime: s.mime,
          size_bytes: s.size,
          sha256: s.sha256,
          storage_path: s.path,
        });
        if (res.error && !/duplicate/i.test(res.error.message)) throw new Error(res.error.message);
      }
    },
    async markResultInbox(id, status, note) {
      const { data, error } = await client.from('dev_result_inbox').update({ status, note: note.slice(0, 2000) }).eq('id', id).eq('status', 'new').select('id');
      return !error && Boolean(data?.length);
    },
    async push(action, body) {
      return invoke('push', { ...(body ?? {}), action });
    },
    async linearProbe() {
      const data = await invoke('linear-probe', {});
      return data as unknown as import('./store').LinearProbe;
    },
    async archify(taskId, revision) {
      const uid = await userId();
      const { data } = await client.storage.from('attachments').download(`${uid}/${taskId}/archify-r${revision}.html`);
      if (data) return { html: await data.text() };
      const res = await invoke('archify-result', { taskId, revision });
      return { started: Boolean(res.started || res.ready) };
    },
    async areaName(spot) {
      const data = await invoke('ask-gemini', { areaOf: spot });
      return typeof data.name === 'string' ? (data.name as string) : '';
    },
    chatThreads: {
      async list() {
        const rows = check(await client.from('chat_threads').select('id, title, updated_at, project_id').order('updated_at', { ascending: false }).limit(300)) ?? [];
        return (rows as Row[]).map((r) => ({ id: String(r.id), title: String(r.title), updatedAt: String(r.updated_at), projectId: r.project_id ? String(r.project_id) : null }));
      },
      async get(id) {
        const { data, error } = await client.from('chat_threads').select('*').eq('id', id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return null;
        return { id: String(data.id), title: String(data.title), messages: Array.isArray(data.messages) ? (data.messages as ChatTurn[]) : [], updatedAt: String(data.updated_at), projectId: data.project_id ? String(data.project_id) : null };
      },
      async save(t) {
        check(await client.from('chat_threads').upsert({ id: t.id, title: t.title.slice(0, 200) || '새 대화', messages: t.messages, project_id: t.projectId ?? null, updated_at: new Date().toISOString() }));
      },
      async remove(id) {
        check(await client.from('chat_threads').delete().eq('id', id));
      },
    },
    async pushNotes(files) {
      const data = await invoke('notes-push', { files });
      return { changed: Number(data.changed) || 0 };
    },
    weatherPlace: {
      async get() {
        const { data, error } = await client.from('owner_settings').select('weather_place').maybeSingle();
        if (error) throw new Error(error.message);
        return (data?.weather_place as string | null | undefined) ?? null;
      },
      async set(place) {
        check(await client.from('owner_settings').upsert({ weather_place: place, updated_at: new Date().toISOString() }));
      },
    },
    async keyStatus() {
      const data = await invoke('key-status', {});
      return Array.isArray(data.keys) ? (data.keys as import('./store').KeyStatus[]) : [];
    },
    async openPr(taskId) {
      await invoke('open-pr', { taskId });
    },
    notes: {
      async graph(projectId) {
        await invoke('notes', { action: 'graph', projectId });
      },
      async remove(project, task) {
        await invoke('notes', { action: 'remove', project, task: task ?? '' });
      },
    },
    // 사용량 기간 읽기(v0.7.84): 고른 일·주·월의 기록만(모델 호출 0). 글·토큰 외 내용은 읽지 않는다
    async usageRange(fromIso, toIso) {
      const [calls, runs] = await Promise.all([
        client.from('ai_calls').select('provider, key_slot, purpose, model, ok, http_status, prompt_tokens, answer_tokens, thinking_tokens, created_at').gte('created_at', fromIso).lt('created_at', toIso).order('created_at').limit(5000),
        client.from('usage_runs').select('agent, task_id, created_at').gte('created_at', fromIso).lt('created_at', toIso).order('created_at').limit(5000),
      ]);
      check(calls);
      check(runs);
      return {
        calls: (calls.data ?? []).map((r: Row) => ({ provider: String(r.provider ?? 'gemini'), keySlot: (r.key_slot as 1 | 2 | null) ?? null, purpose: String(r.purpose ?? ''), model: String(r.model ?? ''), ok: Boolean(r.ok), status: (r.http_status as number | null) ?? null, tokens: callTokens(r), createdAt: String(r.created_at) })),
        runs: (runs.data ?? []).map((r: Row) => ({ agent: String(r.agent), taskId: (r.task_id as string | null) ?? null, createdAt: String(r.created_at) })),
      };
    },
    // GitHub Actions 실행 기록(v0.7.93): 서버가 GitHub에서 읽는다(토큰은 서버에만)
    async actionsUsage(fromIso, toIso) {
      const data = await invoke('actions-usage', { from: fromIso, to: toIso });
      const runs = Array.isArray(data.runs) ? (data.runs as Record<string, unknown>[]) : [];
      const skipped = Array.isArray(data.skipped) ? (data.skipped as Record<string, unknown>[]) : [];
      return {
        runs: runs.map((r) => ({ repo: String(r.repo ?? ''), private: Boolean(r.private), workflow: String(r.workflow ?? ''), ok: Boolean(r.ok), createdAt: String(r.createdAt ?? ''), minutes: Math.max(0, Number(r.minutes) || 0) })),
        skipped: skipped.map((x) => ({ repo: String(x.repo ?? ''), why: String(x.why ?? '') })).filter((x) => x.repo),
      };
    },
    async searchCredits() {
      const data = await invoke('ask-gemini', { usage: true });
      const c = (data.credits ?? {}) as Record<string, unknown>;
      const one = (v: unknown) => {
        const x = v as { used?: unknown; limit?: unknown; remaining?: unknown } | null;
        if (!x || !Number.isFinite(Number(x.used)) || !(Number(x.limit) > 0)) return null;
        const remaining = x.remaining === undefined || x.remaining === null ? NaN : Number(x.remaining);
        return { used: Number(x.used), limit: Number(x.limit), ...(Number.isFinite(remaining) ? { remaining } : {}) };
      };
      return { tavily: one(c.tavily), firecrawl: one(c.firecrawl) };
    },
    designStandard: {
      async draft(projectId, refs = []) {
        const data = await invoke('design-standard', { projectId, ...(refs.length ? { refs } : {}) });
        return String(data.draft ?? '');
      },
      async approve(projectId, md) {
        check(await client.from('projects').update({ design_md: md, design_draft: '' }).eq('id', projectId));
      },
    },
    designCheck: {
      async load(taskId, revision) {
        const uid = await userId();
        const { data } = await client.storage.from('attachments').download(`${uid}/${taskId}/design-r${revision}.json`);
        if (!data) return null;
        return parseDesignReport(JSON.parse(await data.text()));
      },
      async start(taskId, revision) {
        await invoke('design-check', { taskId, revision });
      },
    },
    wiki: {
      async get(projectId) {
        const { data } = await client.from('project_wiki').select('body, updated_at, judge, task_ids').eq('project_id', projectId).maybeSingle();
        return data ? { body: String(data.body ?? ''), updatedAt: String(data.updated_at ?? ''), judge: String(data.judge ?? ''), tasks: Array.isArray(data.task_ids) ? data.task_ids.length : 0 } : null;
      },
      async rebuild(projectId) {
        const data = await invoke('wiki-update', { action: 'project', projectId });
        return String(data.result ?? '');
      },
      async fillAll() {
        const data = await invoke('wiki-update', { action: 'all' });
        return Number(data.started ?? 0);
      },
    },
    siteCheck: {
      async load(taskId) {
        const data = await invoke('site-check', { action: 'load', taskId });
        const out: import('../domain/siteCheck').SiteChecks = {};
        for (const k of ['preview', 'production', 'build'] as const) {
          const c = parseSiteCheck(data[k]);
          if (c) out[k] = c;
        }
        return out;
      },
      async start(taskId, kind) {
        await invoke('site-check', { taskId, kind });
      },
    },
    healthCheck: {
      async load(projectId) {
        const uid = await userId();
        const { data } = await client.storage.from('attachments').download(`${uid}/projects/${projectId}/health.json`);
        if (!data) return null;
        return parseHealth(JSON.parse(await data.text()));
      },
      async start(projectId, force) {
        const data = await invoke('health-check', { projectId, ...(force ? { force: true } : {}) });
        return { unchanged: data.unchanged === true };
      },
      async map(projectId) {
        const uid = await userId();
        const { data } = await client.storage.from('attachments').download(`${uid}/projects/${projectId}/floorplan.html`);
        return data ? await data.text() : null;
      },
    },
    async repoTree(projectId) {
      const data = await invoke('repo-tree', { projectId });
      return Array.isArray(data.paths) ? (data.paths as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    },
    async skills() {
      const data = await invoke('repo-tree', { action: 'skills' });
      return parseSkillFiles(data.skills);
    },
    // 서버에 저장해 둔 스킬 목록·프로젝트 상태(v0.6.70): GitHub를 거치지 않고 표 한 행만 읽는다
    async skillCache() {
      const { data, error } = await client.from('skill_cache').select('files, map, mcp, updated_at').maybeSingle();
      if (error || !data || !Array.isArray(data.files)) return null;
      return { files: parseSkillFiles(data.files), map: parseSkillMap(data.map), mcp: parseMcpMap(data.mcp), updatedAt: String(data.updated_at ?? '') };
    },
    async mcpMap() {
      const data = await invoke('repo-tree', { action: 'mcpMap' });
      return parseMcpMap(data.mcp);
    },
    async refreshSkills() {
      const data = await invoke('repo-tree', { action: 'skillRefresh' });
      return { repos: (data.repos as string[]) ?? [] };
    },
    async uiCheckStatus() {
      const data = await invoke('repo-tree', { action: 'uiCheckStatus' });
      return (data.has as Record<string, boolean>) ?? {};
    },
    async installUiCheck(projectIds) {
      const data = await invoke('repo-tree', { action: 'uiCheckInstall', projectIds });
      return { repos: (data.repos as string[]) ?? [] };
    },
    async skillStatus(skill) {
      const data = await invoke('repo-tree', { action: 'skillStatus', skill });
      const out: Record<string, 'same' | 'old' | 'none'> = {};
      for (const [id, v] of Object.entries((data.status ?? {}) as Record<string, unknown>)) if (v === 'same' || v === 'old' || v === 'none') out[id] = v;
      return out;
    },
    async skillMap() {
      const data = await invoke('repo-tree', { action: 'skillMap' });
      return parseSkillMap(data.map);
    },
    async installSkill(skill, projectIds, mode = 'add') {
      const data = await invoke('repo-tree', { action: 'skillInstall', skill, projectIds, mode });
      const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
      return { started: list(data.started), failed: list(data.failed) };
    },
    async pagesUrls(projectIds) {
      const data = await invoke('repo-tree', { action: 'pages', projectIds });
      const out: Record<string, string> = {};
      for (const [id, url] of Object.entries((data.pages ?? {}) as Record<string, unknown>)) if (typeof url === 'string' && url.startsWith('https://')) out[id] = url;
      return out;
    },
    async draftPlan(taskId) {
      const data = await invoke('draft-plan', { taskId });
      return { plan: String(data.plan ?? ''), specRevision: Number(data.specRevision) };
    },
    async draftPrototype(taskId, text) {
      const data = await invoke('draft-prototype', { taskId, text });
      const drafts = Array.isArray(data.drafts)
        ? (data.drafts as { slot?: string; html?: string }[]).filter((d) => d.html).map((d) => ({ slot: (d.slot === 'B' ? 'B' : 'A') as 'A' | 'B', html: String(d.html) }))
        : [{ slot: 'A' as const, html: String(data.html ?? '') }];
      return { drafts, planRevision: Number(data.planRevision) };
    },
    async draftSpec(taskId, text) {
      const data = await invoke('draft-spec', { taskId, text });
      return { revision: Number(data.revision), intent: String(data.intent ?? '') };
    },
    async dispatchClaudePr(taskId, acknowledgeRetry) {
      const data = await invoke('dispatch-claude-pr', { taskId, acknowledgeRetry });
      return { sessionUrl: (data.sessionUrl as string | null) ?? null, branch: String(data.branch ?? '') };
    },
    async startClaudeDev(assignmentId, acknowledgeRetry) {
      const data = await invoke('dispatch-claude-dev', { assignmentId, acknowledgeRetry });
      return { sessionUrl: (data.sessionUrl as string | null) ?? null };
    },
    async startCodexLinear(assignmentId, acknowledgeRetry, text) {
      const data = await invoke('codex-linear', { action: 'start', assignmentId, acknowledgeRetry, text });
      return { issueUrl: String(data.issueUrl ?? ''), identifier: String(data.identifier ?? '') };
    },
    async codexManualSection(assignmentId) {
      const data = await invoke('codex-linear', { action: 'manual', assignmentId });
      return String(data.section ?? '');
    },
    async codexLinearStatus(assignmentId) {
      const data = await invoke('codex-linear', { action: 'status', assignmentId });
      return { kind: (data.kind as 'error' | 'working' | 'none') ?? 'none', last: String(data.last ?? ''), taskUrl: (data.taskUrl as string | null) ?? null };
    },
    async deployRelease(taskId, allowExtra = false) {
      const { data, error } = await client.functions.invoke('deploy-release', { body: { taskId, allowExtra } });
      // 202 = main 시험이 끝나기를 기다리는 중(실패 아님)
      if (!error && data?.wait) return { updated: false, to: '', wait: true, message: String(data.error ?? '') };
      if (error || !data?.ok) {
        let message = error?.message ?? String(data?.error ?? '배포하지 못했습니다.');
        const ctx = (error as { context?: Response } | null)?.context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const b = await ctx.json();
            if (b?.error) message = b.error;
          } catch {
            // 본문이 JSON이 아니면 기본 메시지
          }
        }
        throw new Error(message);
      }
      return { updated: Boolean(data.updated), to: String(data.to ?? '') };
    },
    async loadInbox() {
      const { data, error } = await client.from('inbox_state').select('messages, pending, updated_at').maybeSingle();
      // 표가 아직 없는 운영 DB(마이그레이션 전)면 이 기기 저장만 쓴다.
      if (error || !data) return null;
      return { messages: (data.messages as unknown[]) ?? [], pending: data.pending ?? null, updatedAt: data.updated_at as string };
    },
    async saveInbox(state) {
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) return;
      check(await client.from('inbox_state').upsert({ owner_id: auth.user.id, messages: state.messages, pending: state.pending, updated_at: state.updatedAt }));
    },
    async appendChat(entries) {
      if (!entries.length) return;
      check(await client.from('chat_messages').insert(entries.map((e) => ({ role: e.role, text: e.text.slice(0, 20000), project_id: e.projectId, task_id: e.taskId }))));
    },
    async deleteChat(fromIso, toIso, projectId) {
      let q = client.from('chat_messages').delete().gte('created_at', fromIso).lt('created_at', toIso);
      if (projectId) q = q.eq('project_id', projectId);
      return (check(await q.select('id')) ?? []).length;
    },
    async loadChat(fromIso, toIso) {
      const rows: Row[] = [];
      // 한 번에 1000행씩(Supabase 기본 상한) 끝까지 읽는다.
      for (let start = 0; ; start += 1000) {
        const page = check(await client.from('chat_messages').select('*').gte('created_at', fromIso).lt('created_at', toIso).order('created_at').range(start, start + 999)) ?? [];
        rows.push(...page);
        if (page.length < 1000) break;
      }
      return rows.map((r) => ({ id: r.id as string, role: r.role as ChatEntry['role'], text: r.text as string, projectId: (r.project_id as string | null) ?? null, taskId: (r.task_id as string | null) ?? null, createdAt: r.created_at as string }));
    },
    async setLeave(agent, onLeave) {
      if (onLeave) check(await client.from('agent_leave').upsert({ agent }));
      else check(await client.from('agent_leave').delete().eq('agent', agent));
    },
    async drawDesign(taskId) {
      const data = await invoke('draw-design', { taskId });
      return ((data.drafts as Row[]) ?? []).map(toDraft);
    },
    async pickDesign(taskId, specRevision, draftId) {
      check(await client.from('design_picks').insert({ task_id: taskId, spec_revision: specRevision, draft_id: draftId }));
    },
    async askClaudeResearch(question) {
      const data = await invoke('ask-claude-research', { question });
      return { id: data.id as string, sessionUrl: (data.sessionUrl as string | null) ?? null, already: Boolean(data.already) };
    },
    async finishReview(taskId, resultRevision) {
      const data = await invoke('review-result', { taskId, resultRevision, action: 'finalize' });
      return toReview(data.review as Row);
    },
    async reviewResult(taskId, resultRevision) {
      const data = await invoke('review-result', { taskId, resultRevision });
      if (data.pending) return data.sessionUrl ? 'started' : 'waiting';
      return toReview(data.review as Row);
    },
    async addProjectRule(projectId, rule) {
      check(await client.from('project_rules').insert({ project_id: projectId, rule: rule.replace(/\s+/g, ' ').trim().slice(0, 200), source: 'owner' }));
    },
    async removeProjectRule(id) {
      check(await client.from('project_rules').delete().eq('id', id));
    },
    async setAgentLimit(assignee, maxRunning) {
      check(await client.from('agent_limits').upsert({ assignee, max_running: maxRunning, updated_at: new Date().toISOString() }));
    },
    async analyzeImage(attachmentId) {
      const { data, error } = await client.functions.invoke('analyze-image', { body: { attachmentId } });
      if (error) {
        let message = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json();
            if (body?.error) message = body.error;
          } catch {
            // 본문이 JSON이 아니면 기본 메시지
          }
        }
        throw new Error(message);
      }
      if (!data?.ok || !data.analysis) throw new Error(data?.error ?? '이미지를 분석하지 못했습니다.');
      return toAnalysis(data.analysis as Row);
    },
    async createRepo(projectId, name) {
      const { data, error } = await client.functions.invoke('create-repo', { body: { projectId, name } });
      if (error) {
        let message = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json();
            if (body?.error) message = body.error;
          } catch {
            // 본문이 JSON이 아니면 기본 메시지
          }
        }
        throw new Error(message);
      }
      if (!data?.ok || !data.repo) throw new Error(data?.error ?? '저장소를 만들지 못했습니다.');
      return { repo: data.repo as string, url: (data.url as string) ?? '', warning: data.warning as string | undefined };
    },
    async addRepoRules(projectId) {
      const { data, error } = await client.functions.invoke('create-repo', { body: { projectId, rulesOnly: true } });
      if (error) {
        let message = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json();
            if (body?.error) message = body.error;
          } catch {
            // 본문이 JSON이 아니면 기본 메시지
          }
        }
        throw new Error(message);
      }
      if (!data?.ok || !data.repo) throw new Error(data?.error ?? '규칙 파일을 넣지 못했습니다.');
      return { repo: data.repo as string, created: Boolean(data.created), updated: Boolean(data.updated) };
    },
    warmGemini() {
      // 서버가 잠들어 있으면 깨어나는 데 약 2초 걸린다. 입력창을 누를 때 미리 깨우고, 1분 안에는 다시 보내지 않는다.
      const key = SUPABASE_KEY;
      if (!SUPABASE_URL || !key || Date.now() - lastGeminiWarm < 60_000) return;
      lastGeminiWarm = Date.now();
      void client.auth.getSession().then(({ data: sess }) =>
        fetch(`${SUPABASE_URL}/functions/v1/ask-gemini`, {
          method: 'POST',
          headers: { 'x-warm': '1', apikey: key, Authorization: `Bearer ${sess.session?.access_token ?? key}` },
        }).catch(() => undefined),
      );
    },
    async askGemini(question, history, images = [], onDelta, opts) {
      if (onDelta && SUPABASE_URL && SUPABASE_KEY) {
        // 답을 조각조각 바로 보여 준다(한 줄에 JSON 하나: {"d":"글"} … {"done":true} 또는 {"error":"…"}).
        const { data: sess } = await client.auth.getSession();
        const res = await fetch(`${SUPABASE_URL}/functions/v1/ask-gemini`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${sess.session?.access_token ?? SUPABASE_KEY}` },
          body: JSON.stringify({ question, history, images, stream: true, ...opts }),
        });
        if (!res.ok || !res.body || !(res.headers.get('content-type') ?? '').includes('ndjson')) {
          const b = await res.json().catch(() => ({}));
          if (res.ok && b?.ok && b.answer) {
            onDelta(b.answer);
            return { answer: b.answer as string, keySlot: b.keySlot as number, model: typeof b.model === 'string' ? (b.model as string) : undefined, video: b.video === true, sources: cleanSources(b.sources), engine: typeof b.engine === 'string' ? (b.engine as string) : undefined, pages: Number(b.pages) || 0, weather: cleanWeather(b.weather) ?? undefined };
          }
          throw new Error(b?.error ?? `Gemini가 답하지 못했습니다(HTTP ${res.status}).`);
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = '';
        let answer = '';
        let keySlot = 0;
        let model: string | undefined;
        let video = false;
        let engine: string | undefined;
        let pages = 0;
        let sources: Source[] = [];
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const m = JSON.parse(line) as { d?: string; done?: boolean; keySlot?: number; model?: unknown; video?: unknown; error?: string; sources?: unknown; engine?: unknown; pages?: unknown };
            if (m.error) throw new Error(answer ? `${m.error} (받은 데까지 보여 드렸어요)` : m.error);
            if (m.d) {
              answer += m.d;
              onDelta(answer);
            }
            if (m.done) {
              keySlot = m.keySlot ?? 0;
              if (typeof m.model === 'string') model = m.model;
              video = m.video === true;
              sources = cleanSources(m.sources);
              if (typeof m.engine === 'string') engine = m.engine;
              pages = Number(m.pages) || 0;
            }
          }
        }
        if (!answer.trim()) throw new Error('Gemini가 답하지 못했습니다.');
        return { answer: answer.trim(), keySlot, model, video, sources, engine, pages };
      }
      const { data, error } = await client.functions.invoke('ask-gemini', { body: { question, history, images, ...opts } });
      if (error) {
        let message = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json();
            if (body?.error) message = body.error;
          } catch {
            // 본문이 JSON이 아니면 기본 메시지
          }
        }
        throw new Error(message);
      }
      if (!data?.ok || !data.answer) throw new Error(data?.error ?? 'Gemini가 답하지 못했습니다.');
      return { answer: data.answer as string, keySlot: data.keySlot as number, sources: cleanSources(data.sources), engine: typeof data.engine === 'string' ? (data.engine as string) : undefined, pages: Number(data.pages) || 0, weather: cleanWeather(data.weather) ?? undefined };
    },
    async readLink(taskId, url) {
      const { data, error } = await client.functions.invoke('fetch-link', { body: { taskId, url } });
      if (error) {
        let message = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json();
            if (body?.error) message = body.error;
          } catch {
            // 본문이 JSON이 아니면 기본 메시지
          }
        }
        throw new Error(message);
      }
      if (!data?.ok || !data.link) throw new Error(data?.error ?? '링크를 읽지 못했습니다.');
      return toLink(data.link as Row);
    },
    async deleteLink(x) {
      const res = await client.from('link_refs').delete().eq('id', x.id).select('id');
      if (res.error) throw new Error(res.error.message);
      if (!res.data?.length) throw new Error('지울 수 없는 링크입니다.');
    },
    async addClarification(x) {
      check(
        await client.from('clarifications').insert({
          id: x.id,
          task_id: x.taskId,
          spec_revision: x.specRevision,
          question: x.question,
          answer: x.answer,
        }),
      );
    },
    async addResult(x) {
      check(
        await client.from('result_packages').insert({
          id: x.id,
          task_id: x.taskId,
          revision: x.revision,
          plan_revision: x.planRevision,
          work_item_id: x.workItemId,
          source: x.source,
          summary: x.summary,
          diff: x.diff,
          test_log: x.testLog,
          remaining_issues: x.remainingIssues,
          sha256: x.sha256,
          ...(x.previewUrl ? { preview_url: x.previewUrl } : {}),
        }),
      );
    },
  };
}
