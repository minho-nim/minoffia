// 서버에서 '다시 개발' 보내기(v0.6.12, 소유자 "앱이 닫혀 있어도 진행"): 채점이 redo면 서버가 바로 수정 요청을 기록하고
// Claude PM에 재계획을 보낸다(앱의 requestRevision과 같은 순서). 한 결과 버전에 한 번만. 실패해도 채점 저장은 그대로이고,
// PM 전송이 실패하면 앱이 열릴 때 기존 대체 경로(Gemini 분배 등)로 다시 보낸다.
// 복사본: review-result/redo.ts·submit-review/redo.ts·review-screen/redo.ts(같은지 시험이 확인)

// deno-lint-ignore no-explicit-any
type Admin = any;

export async function requestRedoOnServer(admin: Admin, ownerId: string, taskId: string, resultRevision: number, feedback: string): Promise<'sent' | 'recorded' | 'skipped'> {
  const text = feedback.trim().slice(0, 3900);
  if (!text) return 'skipped';
  const { data: already } = await admin.from('revision_requests').select('id').eq('task_id', taskId).eq('result_revision', resultRevision).limit(1);
  if (already?.length) return 'skipped';
  const { data: spec } = await admin.from('task_specs').select('revision').eq('task_id', taskId).order('revision', { ascending: false }).limit(1).maybeSingle();
  if (!spec) return 'skipped';
  // 문지기(revision_requests_guard)가 최신 기획서·최신 결과·B 전인지 다시 확인한다
  const { error } = await admin.from('revision_requests').insert({ owner_id: ownerId, task_id: taskId, spec_revision: spec.revision, result_revision: resultRevision, feedback: text });
  if (error) return 'skipped';
  const url = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const res = await fetch(`${url}/functions/v1/dispatch-claude`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, ownerId, acknowledgeRetry: true }),
    signal: AbortSignal.timeout(40_000),
  }).catch(() => null);
  return res?.ok ? 'sent' : 'recorded';
}
