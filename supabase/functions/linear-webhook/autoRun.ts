// 앱을 닫아 둬도 진행(v0.6.28, 소유자 "1 ㄱㄱ"): 계획이 저장되거나 결과가 들어오면 서버가 바로 이어서 한다.
//  1) 실행 승인(E) 자동 기록: 기획 승인한 업무의 최신 계획 작업을 '기획 승인에 포함'으로 기록(소유자 결정 2026-11-10 '승인 3개').
//  2) 시작: 실행 승인됐고 앞 작업이 끝난 '준비' 작업을 담당 AI(Claude 루틴·Codex Linear)에 맡긴다.
// 앱(App.tsx chainTick)도 같은 일을 하지만 1분 늦게 해서 서버가 먼저 한다. 시작 함수의 원자적 예약이 두 번 시작을 막는다.
// submit-plan/autoRun.ts = submit-result/autoRun.ts(같은지는 시험이 확인).

// deno-lint-ignore no-explicit-any
type Admin = any;

export const AUTO_E_NOTE = '기획 승인에 포함(소유자 결정 2026-11-10)';

type Item = { id: string; dependencies?: string[] };
type Assignment = { id: string; work_item_id: string; assignee: string; execution_mode: string; dispatch_status: string };

/** 시작할 작업: 실행 승인됐고, 준비 상태이고, 앞 작업이 모두 끝난 것(Gemini 개발은 앱에서만) */
export function startable(items: Item[], assignments: Assignment[], approved: Set<string>): Assignment[] {
  const done = new Set(assignments.filter((a) => a.dispatch_status === 'completed').map((a) => a.work_item_id));
  return assignments.filter((a) => {
    if (a.dispatch_status !== 'ready' || !approved.has(a.work_item_id)) return false;
    if (a.assignee !== 'claude' && a.assignee !== 'codex') return false;
    const deps = items.find((w) => w.id === a.work_item_id)?.dependencies ?? [];
    return deps.every((d) => done.has(d));
  });
}

export async function autoRun(admin: Admin, ownerId: string, taskId: string, base: string, serviceKey: string): Promise<string[]> {
  const log: string[] = [];
  const { data: plan } = await admin.from('pm_plans').select('plan_revision, approved_spec_revision, plan').eq('task_id', taskId).order('plan_revision', { ascending: false }).limit(1).maybeSingle();
  if (!plan) return log;
  const body = plan.plan as { status?: string; development_mode?: string; work_items?: Item[] };
  if (body.status !== 'planned' || body.development_mode === 'prototype_first') return log;
  const { data: spec } = await admin.from('task_specs').select('revision').eq('task_id', taskId).order('revision', { ascending: false }).limit(1).maybeSingle();
  if (!spec || spec.revision !== plan.approved_spec_revision) return log;
  const { data: a } = await admin.from('approvals').select('id').eq('task_id', taskId).eq('gate', 'A').eq('decision', 'approved').eq('approved_revision', spec.revision).limit(1);
  if (!a?.length) return log;
  const { data: rows } = await admin.from('agent_assignments').select('id, work_item_id, assignee, execution_mode, dispatch_status').eq('task_id', taskId).eq('plan_revision', plan.plan_revision);
  const assignments = (rows ?? []) as Assignment[];
  const { data: es } = await admin.from('approvals').select('work_item_id').eq('task_id', taskId).eq('gate', 'E').eq('decision', 'approved').eq('approved_revision', plan.plan_revision);
  const approved = new Set(((es ?? []) as { work_item_id: string }[]).map((e) => e.work_item_id));

  for (const x of assignments) {
    if (x.dispatch_status !== 'awaiting_user_execution_approval' || approved.has(x.work_item_id)) continue;
    const { error } = await admin.from('approvals').insert({
      owner_id: ownerId, task_id: taskId, gate: 'E', decision: 'approved', approved_revision: plan.plan_revision, previous_revision: null,
      work_item_id: x.work_item_id, scope: { auto: true, note: AUTO_E_NOTE, assignee: x.assignee, plan_revision: plan.plan_revision, spec_revision: spec.revision, by: 'server' },
      actor: '서버(기획 승인에 포함)',
    });
    // 이미 있음(앱이 먼저 기록)도 승인된 것으로 본다
    if (error && error.code !== '23505') {
      log.push(`${x.work_item_id} 실행 승인 기록 실패: ${error.message}`);
      continue;
    }
    approved.add(x.work_item_id);
    await admin.from('agent_assignments').update({ dispatch_status: 'ready' }).eq('id', x.id).eq('dispatch_status', 'awaiting_user_execution_approval');
    x.dispatch_status = 'ready';
    log.push(`${x.work_item_id} 실행 승인 자동 기록`);
  }

  for (const x of startable(body.work_items ?? [], assignments, approved)) {
    const fn = x.assignee === 'claude' ? 'dispatch-claude-dev' : 'codex-linear';
    const res = await fetch(`${base.replace(/\/$/, '')}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId: x.id, ownerId, acknowledgeRetry: false, ...(fn === 'codex-linear' ? { action: 'start' } : {}) }),
      signal: AbortSignal.timeout(40_000),
    }).catch(() => null);
    log.push(`${x.work_item_id} 시작(${x.assignee}): ${res ? res.status : '응답 없음'}`);
  }
  return log;
}
