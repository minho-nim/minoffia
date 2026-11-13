// Codex가 시작하지 못하면 Claude로 넘기기(v0.6.30, 소유자 결정 "Codex 주, Claude 대신"):
// Linear에 Codex가 '시작 못 함'(환경 없음·한도 등)을 남기면 서버가 그 작업만 담당을 Claude로 바꾼 새 계획 버전을 만들고
// (계획은 추가만 하는 기록, 앱의 '담당 바꾸기'와 같은 모양) autoRun으로 실행 승인(기획 승인에 포함)·시작까지 한다.
import { autoRun } from './autoRun.ts';

// deno-lint-ignore no-explicit-any
type Admin = any;
type Item = { id: string; title?: string; goal?: string; assignee_preference?: string; execution_mode?: string };

export const HANDOFF_MARK = '담당 바꿈';
const AGENT: Record<string, string> = { codex_primary: 'codex', claude_support: 'claude', gemini_optional: 'gemini', gemini_dev: 'gemini' };

/** 한 작업만 Claude로 바꾼 계획 본문(나머지는 그대로) */
export function toClaude(body: { mode_reason?: string; work_items?: Item[] }, workItemId: string, why: string, nextRevision: number) {
  const items = (body.work_items ?? []).map((w) =>
    w.id !== workItemId
      ? w
      : { ...w, assignee_preference: 'claude_support', execution_mode: 'manual_handoff', goal: `${w.goal ?? ''}\n\n[이어받기] Codex가 시작하지 못해 넘겨받은 작업이다(${why}).`.slice(0, 8000) },
  );
  return {
    ...body,
    plan_revision: nextRevision,
    mode_reason: `${body.mode_reason ? `${body.mode_reason} · ` : ''}${HANDOFF_MARK}: ${workItemId} → Claude(${why})`.slice(0, 300),
    work_items: items,
  };
}

export async function handOffToClaude(admin: Admin, ownerId: string, taskId: string, a: { plan_revision: number; work_item_id: string }, why: string, base: string, serviceKey: string): Promise<string> {
  const { data: plan } = await admin.from('pm_plans').select('plan_revision, approved_spec_revision, target_base_revision, plan').eq('task_id', taskId).order('plan_revision', { ascending: false }).limit(1).maybeSingle();
  if (!plan || plan.plan_revision !== a.plan_revision) return 'skip: 계획이 바뀜';
  const { data: leave } = await admin.from('agent_leave').select('agent').eq('owner_id', ownerId).eq('agent', 'claude');
  if (leave?.length) return 'skip: Claude 휴가';
  const { data: t } = await admin.from('tasks').select('stage, projects(repo)').eq('id', taskId).maybeSingle();
  if (!t || t.stage === 'cancelled') return 'skip: 취소한 업무';
  if (String((t?.projects as { repo?: string } | null)?.repo ?? '').toLowerCase() === 'minho-nim/minlab') return 'skip: MinLab';
  const next = plan.plan_revision + 1;
  const body = toClaude(plan.plan, a.work_item_id, why, next);
  const assignments = (body.work_items ?? []).map((w: Item) => ({
    id: crypto.randomUUID(),
    work_item_id: w.id,
    title: String(w.title ?? ''),
    assignee: AGENT[String(w.assignee_preference)] ?? 'codex',
    execution_mode: w.assignee_preference === 'gemini_dev' ? 'gemini_actions' : 'manual_handoff',
  }));
  const { error } = await admin.rpc('save_pm_plan_as', {
    p_owner: ownerId,
    p_plan: { id: crypto.randomUUID(), task_id: taskId, plan_revision: next, approved_spec_revision: plan.approved_spec_revision, target_base_revision: plan.target_base_revision ?? '', source: 'manual', plan: body },
    p_assignments: assignments,
  });
  if (error) return `fail: ${error.message}`;
  const log = await autoRun(admin, ownerId, taskId, base, serviceKey).catch(() => []);
  return `ok: 계획 v${next} ${log.join(' / ')}`;
}
