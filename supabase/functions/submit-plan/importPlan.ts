// 서버에서 계획 바로 받기(v0.6.11, 소유자 "앱이 닫혀 있어도 진행"): 전에는 앱이 열려 있어야 pm_plan_inbox의 계획이
// 계획·작업으로 옮겨졌다. 이제 submit-plan이 받은 즉시 앱(src/workflow/planImport.ts)과 같은 규칙으로 검사하고 저장한다.
// 애매하면(검사 실패·버전 다름·저장 실패) 받은 줄을 그대로 두고 예전처럼 앱이 열릴 때 이유와 함께 처리한다.
import { parsePmPlan, PREF_AGENT } from './pmPlan.ts';
import { applyMention, mentionAllowed, mentionedAssignee } from './mention.ts';
import type { AssigneePreference } from './planTypes.ts';

/** src/domain/reassign.ts와 같은 표시(소유자가 담당을 직접 바꾼 계획에는 @이름을 다시 적용하지 않는다) */
export const REASSIGN_MARK = '담당 바꿈';

// deno-lint-ignore no-explicit-any
type Admin = any;

export type ServerImport = { saved: true; planRevision: number } | { saved: false; reason: string };

/** 받은 계획 한 개를 서버에서 저장한다. 실패하면 이유만 돌려주고 받은 줄은 그대로 둔다(앱이 처리) */
export async function importOnServer(admin: Admin, ownerId: string, taskId: string, specRevision: number, planText: string): Promise<ServerImport> {
  const parsed = parsePmPlan(planText, taskId);
  if (!parsed.ok) return { saved: false, reason: parsed.errors.join(' / ') };
  const { data: task } = await admin.from('tasks').select('id, owner_id, description, user_original_text, projects(repo)').eq('id', taskId).eq('owner_id', ownerId).maybeSingle();
  if (!task) return { saved: false, reason: '업무 없음' };
  const { data: spec } = await admin.from('task_specs').select('revision').eq('task_id', taskId).order('revision', { ascending: false }).limit(1).maybeSingle();
  if (!spec || spec.revision !== specRevision) return { saved: false, reason: `기획서 v${specRevision}로 만든 계획인데 지금은 v${spec?.revision ?? '?'}` };
  const { data: a } = await admin.from('approvals').select('id').eq('task_id', taskId).eq('gate', 'A').eq('decision', 'approved').eq('approved_revision', spec.revision).limit(1);
  if (!a?.length) return { saved: false, reason: '기획 승인 전' };
  const { data: plans } = await admin.from('pm_plans').select('plan_revision').eq('task_id', taskId);
  const planRevision = Math.max(0, ...((plans ?? []) as { plan_revision: number }[]).map((p) => p.plan_revision)) + 1;

  const body = parsed.plan;
  const repo = (task.projects as { repo: string | null } | null)?.repo ?? null;
  const mention = mentionedAssignee(task.user_original_text ?? task.description);
  const reassigned = (body.mode_reason ?? '').includes(REASSIGN_MARK);
  if (mention && !reassigned && mentionAllowed(mention, repo) && body.work_items.some((w) => w.assignee_preference !== mention.preference)) {
    body.work_items = applyMention(body.work_items, mention);
    body.mode_reason = `${body.mode_reason ? `${body.mode_reason} · ` : ''}소유자가 @${mention.label} 지정`.slice(0, 300);
  }
  const plan = {
    id: crypto.randomUUID(),
    task_id: taskId,
    plan_revision: planRevision,
    approved_spec_revision: spec.revision,
    target_base_revision: body.target_base_revision,
    source: 'routine_session_auto',
    plan: { ...body, plan_revision: planRevision },
  };
  const assignments = body.work_items.map((w) => ({
    id: crypto.randomUUID(),
    work_item_id: w.id,
    title: w.title,
    assignee: PREF_AGENT[w.assignee_preference as AssigneePreference],
    execution_mode: w.assignee_preference === 'gemini_dev' ? 'gemini_actions' : 'manual_handoff',
  }));
  const { error } = await admin.rpc('save_pm_plan_as', { p_owner: ownerId, p_plan: plan, p_assignments: assignments });
  if (error) return { saved: false, reason: `저장 실패: ${error.message}`.slice(0, 300) };
  return { saved: true, planRevision };
}
