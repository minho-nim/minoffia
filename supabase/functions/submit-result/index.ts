// Claude 보조 개발 결과 자동 저장: Claude 세션이 개발·시험을 끝내면 결과를 이 함수로 보낸다(로그인 없이, 1회용 제출표로 확인).
// 제출표는 dispatch-claude-dev가 세션을 시작할 때 만들고 해시만 저장한다(작업 하나 전용, 24시간, 3번까지).
// 받은 결과는 dev_result_inbox에 넣고, 앱이 작업·계획 버전을 확인해 결과 패키지로 옮긴다. GitHub에는 아무것도 올리지 않는다.
// verify_jwt = false(세션에 Supabase 로그인이 없다). 대신 제출표가 맞아야만 한 줄을 넣을 수 있다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { previewUrl, saveRules } from './projectRules.ts';
import { maskSecrets } from './maskSecrets.ts';

const MAX_USES = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMITS = { summary: 4000, diff: 500_000, test_log: 100_000, remaining_issues: 4000, branch: 200, changed_files: 20_000 };
// 결과 화면 증거(v0.4.97): 데스크톱·휴대폰 스크린샷 최대 2장, 장마다 1.5MB(JPEG·PNG만)
// 화면 2장(데스크톱·휴대폰) + 바뀐 곳 구조도 1장(v0.5.21)
const MAX_SHOTS = 3;
const MAX_SHOT_BYTES = 1_500_000;
const SHOT_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };
type Shot = { path: string; sha256: string; size: number; mime: string; name: string };

const env = (key: string) => (Deno.env.get(key) ?? '').trim();

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST only' });
  let body: { task_id?: string; token?: string; result?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: 'body is not JSON' });
  }
  const taskId = String(body.task_id ?? '');
  const token = String(body.token ?? '');
  if (!UUID.test(taskId) || token.length < 32 || token.length > 200) return reply(400, { ok: false, error: 'task_id or token missing' });
  const r = body.result;
  if (typeof r !== 'object' || r === null) return reply(400, { ok: false, error: 'result must be a JSON object' });
  const summary = text(r.summary, LIMITS.summary).trim();
  if (!summary) return reply(400, { ok: false, error: 'result.summary is required' });
  const files = Array.isArray(r.changed_files) ? r.changed_files.filter((f) => typeof f === 'string').join('\n') : text(r.changed_files, LIMITS.changed_files);

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: ticket } = await admin
    .from('plan_submit_tokens')
    .select('id, owner_id, task_id, assignment_id, uses, expires_at')
    .eq('token_hash', await sha256Hex(token))
    .eq('task_id', taskId)
    .eq('kind', 'result')
    .maybeSingle();
  if (!ticket || !ticket.assignment_id) return reply(403, { ok: false, error: 'invalid token' });
  if (new Date(ticket.expires_at).getTime() < Date.now()) return reply(403, { ok: false, error: 'token expired' });
  if (ticket.uses >= MAX_USES) return reply(429, { ok: false, error: 'token used up' });

  const { data: bumped } = await admin.from('plan_submit_tokens').update({ uses: ticket.uses + 1 }).eq('id', ticket.id).eq('uses', ticket.uses).select('id');
  if (!bumped?.length) return reply(409, { ok: false, error: 'retry' });

  // v0.4.57: 세션이 작업 브랜치를 미리보기용으로 push했으면, 프로젝트의 미리보기 주소로 링크를 계산해 붙인다.
  const branch = text(r.branch, LIMITS.branch);
  let preview = '';
  if (r.preview_pushed === true && branch.startsWith('ai/claude/')) {
    const { data: t } = await admin.from('tasks').select('projects(preview_host)').eq('id', ticket.task_id).maybeSingle();
    preview = previewUrl((t?.projects as unknown as { preview_host: string | null } | null)?.preview_host, branch);
  }
  // 화면 증거: 비공개 버킷 attachments의 <소유자>/<업무>/<sha>.<확장자>에 올린다(앱이 결과 스크린샷으로 붙임). 실패해도 결과 저장은 막지 않는다.
  const shots: Shot[] = [];
  for (const s of (Array.isArray(r.screenshots) ? r.screenshots : []).slice(0, MAX_SHOTS) as Record<string, unknown>[]) {
    const mime = String(s?.mime ?? '');
    if (!SHOT_EXT[mime] || typeof s?.data !== 'string' || s.data.length > MAX_SHOT_BYTES * 1.4) continue;
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = Uint8Array.from(atob(s.data), (c) => c.charCodeAt(0));
    } catch {
      continue;
    }
    const pngOk = mime === 'image/png' && bytes[0] === 0x89 && bytes[1] === 0x50;
    const jpgOk = mime === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8;
    if (!bytes.length || bytes.length > MAX_SHOT_BYTES || !(pngOk || jpgOk)) continue;
    const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const path = `${ticket.owner_id}/${ticket.task_id}/${sha}.${SHOT_EXT[mime]}`;
    const up = await admin.storage.from('attachments').upload(path, bytes, { contentType: mime, upsert: true });
    if (!up.error) shots.push({ path, sha256: sha, size: bytes.length, mime, name: text(s.name, 80) || `화면-${shots.length + 1}.${SHOT_EXT[mime]}` });
  }

  // 앞으로도 지켜야 할 것(AI가 적어 보냄)은 프로젝트에 쌓는다. 실패해도 결과 저장은 막지 않는다.
  await saveRules(admin, ticket.owner_id, ticket.task_id, 'result', r.project_rules);

  const { error } = await admin.from('dev_result_inbox').insert({
    owner_id: ticket.owner_id,
    task_id: ticket.task_id,
    assignment_id: ticket.assignment_id,
    summary: maskSecrets(summary),
    changed_files: files.slice(0, LIMITS.changed_files),
    diff: text(r.diff, LIMITS.diff),
    // 시험 기록·요약의 토큰·키처럼 생긴 글자는 저장 전에 가린다(v0.5.49). diff는 그대로(PR이 깨지지 않게).
    test_log: maskSecrets(text(r.test_log, LIMITS.test_log)),
    remaining_issues: maskSecrets(text(r.remaining_issues, LIMITS.remaining_issues)),
    branch,
    preview_url: preview,
    screenshots: shots,
  });
  if (error) return reply(500, { ok: false, error: 'could not save result' });
  return reply(200, { ok: true, message: 'AI Office에 결과를 보냈습니다. 사용자가 올리기 승인(B)을 할 때까지 GitHub에 올리지 않습니다.' });
});
