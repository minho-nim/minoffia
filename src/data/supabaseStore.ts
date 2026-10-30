import type { SupabaseClient } from '@supabase/supabase-js';
import { MIME_EXT, storageContentType, type Attachment, type ImageAnalysis } from '../domain/attachments';
import type { Clarification, LinkRef } from '../domain/requestContext';
import type { Project, Task, UsageRun } from '../domain/types';
import type { AgentAssignment, Approval, Deployment, PmPlan, PrCheck, ResultPackage, RevisionRequest, TaskSpec } from '../domain/workflow-types';
import type { ChatEntry } from '../domain/devlog';
import type { OfficeStore } from './store';

type Row = Record<string, unknown>;

const toProject = (r: Row): Project => ({
  id: r.id as string,
  name: r.name as string,
  repo: (r.repo as string | null) ?? null,
  description: (r.description as string) ?? '',
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
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

const toSpec = (r: Row): TaskSpec => ({
  id: r.id as string,
  taskId: r.task_id as string,
  revision: r.revision as number,
  intent: r.intent as TaskSpec['intent'],
  planner: 'chatgpt_manual',
  userOriginalText: r.user_original_text as string,
  finalPrompt: r.final_prompt as string,
  changeScope: r.change_scope as string,
  preserveConstraints: r.preserve_constraints as string,
  testCriteria: r.test_criteria as string,
  answer: r.answer as string,
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

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function createSupabaseStore(client: SupabaseClient): OfficeStore {
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
      const [projects, tasks, usage, specs, approvals, plans, assignments, results, revisionRequests, attachments, links, clarifications, aiCalls, imageAnalyses, agentLimits, prChecks, deployments] = await Promise.all([
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
      ]);
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
        },
        agentLimits: agentLimits.error ? {} : Object.fromEntries((agentLimits.data ?? []).map((r: Row) => [r.assignee as string, r.max_running as number])),
        // 표가 아직 없는 운영 DB(마이그레이션 전)에서도 화면은 열리게 한다.
        aiCalls: aiCalls.error ? [] : (aiCalls.data ?? []).map((r: Row) => ({ id: r.id as string, ok: r.ok as boolean, keySlot: (r.key_slot as 1 | 2 | null) ?? null, purpose: ((r.purpose as string) === 'image' ? 'image' : 'question') as 'question' | 'image', httpStatus: (r.http_status as number | null) ?? null, createdAt: r.created_at as string })),
      };
    },
    async saveProject(p) {
      check(await client.from('projects').upsert({ id: p.id, name: p.name, repo: p.repo, description: p.description }));
    },
    async deleteProject(id) {
      check(await client.from('projects').delete().eq('id', id));
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
      check(
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
      check(
        await client.from('pm_plans').insert({
          id: p.id,
          task_id: p.taskId,
          plan_revision: p.planRevision,
          approved_spec_revision: p.approvedSpecRevision,
          target_base_revision: p.targetBaseRevision,
          source: p.source,
          plan: p.plan,
        }),
      );
      if (assignments.length) {
        check(
          await client.from('agent_assignments').insert(
            assignments.map((a) => ({
              id: a.id,
              task_id: a.taskId,
              plan_revision: a.planRevision,
              work_item_id: a.workItemId,
              title: a.title,
              assignee: a.assignee,
              execution_mode: a.executionMode,
              dispatch_status: a.dispatchStatus,
            })),
          ),
        );
      }
    },
    async updateAssignment(a) {
      check(
        await client
          .from('agent_assignments')
          .update({
            dispatch_status: a.dispatchStatus,
            status_source: a.statusSource,
            provider_task_url: a.providerTaskUrl,
            actual_provider_status: a.actualProviderStatus,
            started_at: a.startedAt,
          })
          .eq('id', a.id),
      );
    },
    async addRevisionRequest(x) {
      check(
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
    async deployRelease(taskId) {
      const data = await invoke('deploy-release', { taskId });
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
    async askGemini(question, history, images = []) {
      const { data, error } = await client.functions.invoke('ask-gemini', { body: { question, history, images } });
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
      return { answer: data.answer as string, keySlot: data.keySlot as number };
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
        }),
      );
    },
  };
}
