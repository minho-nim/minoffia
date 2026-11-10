// 서버에서 결과 바로 받기(v0.5.90, 소유자 "결과 받기·채점을 서버로"): 전에는 앱이 열려 있어야 dev_result_inbox의 결과가
// 결과 패키지로 옮겨지고 채점이 시작됐다. 이제 submit-result가 받은 즉시 같은 확인을 하고 옮긴 뒤 채점을 부른다.
// 확인이 애매하면(skip) 받은 줄을 그대로 두고, 예전처럼 앱이 열릴 때 src/workflow/receiveInbox.ts가 이유와 함께 처리한다.
// 판단 규칙은 receiveInbox.ts·src/domain/workflow.ts(bApproved·superseded)와 같게 유지한다.

export type ImportFacts = {
  assignment: { assignee: string; execution_mode: string; dispatch_status: string; plan_revision: number } | null;
  latestPlanRevision: number | null;
  latestResult: { revision: number; plan_revision: number | null } | null;
  /** 최신 결과에 올리기 승인(B)이 있는지 */
  latestResultBApproved: boolean;
  diff: string;
};

/** import = 결과 패키지로 옮김, failed = 바뀐 것이 없어 작업을 중단으로, skip = 앱에 맡김 */
export function importDecision(f: ImportFacts): 'import' | 'failed' | 'skip' {
  const a = f.assignment;
  if (!a) return 'skip';
  // v0.6.19: Codex(Linear)도 결과 제출표로 직접 보낸다(receiveInbox.ts와 같게)
  const auto = a.assignee === 'claude' || a.assignee === 'codex' || (a.assignee === 'gemini' && a.execution_mode === 'gemini_actions');
  if (!auto) return 'skip';
  if (f.latestPlanRevision == null || a.plan_revision !== f.latestPlanRevision) return 'skip';
  if (a.dispatch_status !== 'started' && a.dispatch_status !== 'starting') return 'skip';
  const r = f.latestResult;
  const superseded = !!r && r.plan_revision != null && r.plan_revision < f.latestPlanRevision;
  if (r && !superseded && f.latestResultBApproved) return 'skip';
  return f.diff.trim() ? 'import' : 'failed';
}

/** 결과 요약(receiveInbox.ts와 같은 모양) */
export function resultSummary(item: { summary: string; changed_files: string; branch: string; preview_url: string }, fromGemini: boolean): string {
  return [
    item.summary,
    item.changed_files ? `\n바뀐 파일:\n${item.changed_files}` : '\n바뀐 파일: 없음',
    item.branch ? `\n작업 브랜치: ${item.branch} (${item.preview_url ? '미리보기용으로 올림, PR은 올리기 승인 뒤' : fromGemini ? 'Gemini가 올림, PR은 올리기 승인 뒤' : 'PR은 올리기 승인 뒤'})` : '',
  ].join('\n').slice(0, 4000);
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Shot = { path: string; sha256: string; size: number; mime: string; name: string };
export type InboxRow = {
  id: string; owner_id: string; task_id: string; assignment_id: string; summary: string; changed_files: string; diff: string;
  test_log: string; remaining_issues: string; branch: string; preview_url: string; screenshots: Shot[];
};
// deno-lint-ignore no-explicit-any
type Admin = any;

/** 받은 결과 한 줄을 서버에서 처리한다. 옮겼으면 새 결과 버전, 아니면 null(앱이 나중에 처리) */
export async function importOnServer(admin: Admin, item: InboxRow): Promise<{ revision: number } | null> {
  const { data: a } = await admin.from('agent_assignments').select('id, assignee, execution_mode, dispatch_status, plan_revision, work_item_id').eq('id', item.assignment_id).eq('task_id', item.task_id).maybeSingle();
  const { data: plan } = await admin.from('pm_plans').select('plan_revision').eq('task_id', item.task_id).order('plan_revision', { ascending: false }).limit(1).maybeSingle();
  const { data: results } = await admin.from('result_packages').select('revision, plan_revision, sha256').eq('task_id', item.task_id);
  const rows = (results ?? []) as { revision: number; plan_revision: number | null; sha256: string }[];
  const sha = await sha256Hex(`${item.diff}\n---\n${item.test_log}`);
  const mark = (status: 'imported' | 'invalid', note: string) =>
    admin.from('dev_result_inbox').update({ status, note: note.slice(0, 2000) }).eq('id', item.id).eq('status', 'new');
  // 같은 결과가 이미 있으면 받음으로만 표시한다
  if (rows.some((r) => r.sha256 === sha)) {
    await mark('imported', '');
    return null;
  }
  const latest = rows.reduce<(typeof rows)[number] | null>((m, r) => (!m || r.revision > m.revision ? r : m), null);
  let bApproved = false;
  if (latest) {
    const { data: b } = await admin.from('approvals').select('id').eq('task_id', item.task_id).eq('gate', 'B').eq('decision', 'approved').eq('approved_revision', latest.revision).limit(1);
    bApproved = Boolean(b?.length);
  }
  const decision = importDecision({ assignment: a ?? null, latestPlanRevision: plan?.plan_revision ?? null, latestResult: latest, latestResultBApproved: bApproved, diff: item.diff });
  if (decision === 'skip') return null;
  const now = new Date().toISOString();
  if (decision === 'failed') {
    const note = (item.remaining_issues || item.summary || '바뀐 것이 없음').slice(0, 200);
    await admin.from('agent_assignments').update({ dispatch_status: 'failed', actual_provider_status: note, last_verified_at: now }).eq('id', a.id);
    await mark('invalid', '바뀐 것이 없는 결과(개발 실패)');
    return null;
  }
  const fromGemini = a.assignee === 'gemini';
  const revision = (latest?.revision ?? 0) + 1;
  const { error } = await admin.from('result_packages').insert({
    owner_id: item.owner_id,
    task_id: item.task_id,
    revision,
    plan_revision: a.plan_revision,
    work_item_id: a.work_item_id,
    source: fromGemini ? 'gemini_actions_auto' : a.assignee === 'codex' ? 'codex_linear_auto' : 'claude_session_auto',
    summary: resultSummary(item, fromGemini),
    diff: item.diff,
    test_log: item.test_log,
    remaining_issues: item.remaining_issues,
    sha256: sha,
    preview_url: item.preview_url,
  });
  // 동시에 앱이 먼저 저장했으면(버전 충돌) 앱 쪽 처리에 맡긴다
  if (error) return null;
  for (const [i, s] of (item.screenshots ?? []).entries()) {
    if (!s.path.startsWith(`${item.owner_id}/${item.task_id}/`)) continue;
    await admin.from('attachments').insert({
      owner_id: item.owner_id, task_id: item.task_id, kind: 'result', result_revision: revision, position: i, role: 'after',
      note: s.name.includes('mobile') || s.name.includes('휴대폰') ? '자동 화면 확인(휴대폰 400px)' : '자동 화면 확인(데스크톱 1400px)',
      file_name: s.name.slice(0, 200), mime: s.mime, size_bytes: s.size, sha256: s.sha256, storage_path: s.path,
    });
  }
  await admin.from('agent_assignments').update({ dispatch_status: 'completed', actual_provider_status: 'session_reported_result', last_verified_at: now }).eq('id', a.id);
  await mark('imported', '서버가 바로 받음');
  return { revision };
}
