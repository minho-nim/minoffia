// 화면 확인(v0.6.9, 소유자 "승인 전 중간에서 보는 건?"): 업무의 실제 사이트를 GitHub Actions(site-check.yml)로 찍는다.
// - kind "preview": 결과의 미리보기 주소(after)와 지금 운영 주소(before)를 나란히. 올리기·배포 승인 전에 본다.
// - kind "production": 배포 뒤 운영 주소(live).
// 소유자만(또는 submit-result가 서버 키로 부름). 결과는 비공개 버킷 attachments/<소유자>/tasks/<업무>/site/<kind>/ 에.
// - kind "build"(v0.7.25, 소유자 "결과 화면 자동 캡처"): 미리보기 주소가 없는 결과도 찍는다. 최신 결과의 변경(diff)을 1회용 주소로 넘기고
//   result-shot.yml이 프로젝트 저장소에 적용·빌드해 이 러너 안에서 열어 찍는다(바뀐 결과 + 지금 운영).
// action "load"는 kind별 결과 JSON과 사진의 1시간짜리 보기 주소를 돌려준다. AI 호출 없음.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { signNotify } from './notifySig.ts';

const env = (key: string) => (Deno.env.get(key) ?? '').trim();
const cors = {
  'Access-Control-Allow-Origin': env('OFFICE_ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const KINDS = ['preview', 'production', 'build'] as const;
type Kind = (typeof KINDS)[number];
const FILES: Record<string, string[]> = {
  before: ['before-pc.jpg', 'before-mobile.jpg'],
  after: ['after-pc.jpg', 'after-mobile.jpg'],
  live: ['live-pc.jpg', 'live-mobile.jpg'],
};

/** 바뀐 화면 경로(/stats, /#/stats, #/stats). 이상하면 '' (러너 안 주소 뒤에 붙인다) */
export function screenPath(raw: unknown): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  const p = t.startsWith('#') ? `/${t}` : t;
  return /^\/[A-Za-z0-9/_\-#?=&.~%]{0,150}$/.test(p) && !p.includes('..') && !p.startsWith('//') ? p : '';
}

/** 프로젝트의 운영 주소: Cloudflare 주소가 있으면 그것, 없으면 데모 주소 */
export function productionUrl(p: { preview_host?: string | null; demo_url?: string | null } | null): string {
  const host = (p?.preview_host ?? '').trim().toLowerCase();
  if (host && HOST.test(host)) return `https://${host}/`;
  const demo = (p?.demo_url ?? '').trim();
  return /^https:\/\//.test(demo) ? demo : '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST만 받습니다.' });
  let body: { action?: string; taskId?: string; kind?: string; ownerId?: string; screen?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  const taskId = String(body.taskId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) return reply(400, { ok: false, error: 'taskId가 필요합니다.' });

  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const admin = createClient(env('SUPABASE_URL'), serviceKey);
  const internal = Boolean(serviceKey) && req.headers.get('Authorization') === `Bearer ${serviceKey}`;
  let ownerId = '';
  if (internal) ownerId = String(body.ownerId ?? '');
  else {
    const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: auth } = await userClient.auth.getUser();
    if (!auth?.user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
    if ((auth.user.email ?? '').toLowerCase() !== env('OFFICE_OWNER_EMAIL').toLowerCase()) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });
    ownerId = auth.user.id;
  }
  const { data: task } = await admin.from('tasks').select('id, owner_id, projects(repo, preview_host, demo_url)').eq('id', taskId).eq('owner_id', ownerId).maybeSingle();
  if (!task) return reply(404, { ok: false, error: '업무를 찾을 수 없습니다.' });
  const base = `${ownerId}/tasks/${taskId}/site`;
  const bucket = admin.storage.from('attachments');

  if (body.action === 'load') {
    const out: Record<string, unknown> = {};
    for (const kind of KINDS) {
      const { data } = await bucket.download(`${base}/${kind}/result.json`);
      if (!data) continue;
      let result: { targets?: { key: string; shots?: { file: string }[] }[] } = {};
      try {
        result = JSON.parse(await data.text());
      } catch {
        continue;
      }
      const images: Record<string, string> = {};
      for (const t of result.targets ?? []) {
        for (const s of t.shots ?? []) {
          if (!/^[a-z]+-[a-z]+\.jpg$/.test(s.file)) continue;
          const { data: signed } = await bucket.createSignedUrl(`${base}/${kind}/${s.file}`, 3600);
          if (signed?.signedUrl) images[s.file] = signed.signedUrl;
        }
      }
      out[kind] = { result, images };
    }
    return reply(200, { ok: true, ...out });
  }

  const kind = (KINDS as readonly string[]).includes(String(body.kind)) ? (body.kind as Kind) : 'preview';
  const project = task.projects as unknown as { repo: string | null; preview_host: string | null; demo_url: string | null } | null;
  if ((project?.repo ?? '').toLowerCase() === 'minho-nim/minlab') return reply(403, { ok: false, error: '이 저장소는 확인하지 않습니다.' });
  const live = productionUrl(project);
  const targets: { key: string; url: string }[] = [];
  let diffUrl = '';
  let resultRevision = 0;
  if (kind === 'build') {
    const repo = String(project?.repo ?? '');
    if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) return reply(409, { ok: false, error: '프로젝트에 저장소가 없어요.' });
    const { data: result } = await admin.from('result_packages').select('revision, diff').eq('task_id', taskId).order('revision', { ascending: false }).limit(1).maybeSingle();
    const diff = String(result?.diff ?? '');
    resultRevision = Number(result?.revision ?? 0);
    if (!/^diff --git /m.test(diff)) return reply(409, { ok: false, error: '찍을 결과 변경(diff)이 없어요.' });
    const path = `${base}/build/change.diff`;
    const up = await bucket.upload(path, new Blob([diff], { type: 'text/plain' }), { upsert: true, contentType: 'text/plain' });
    if (up.error) return reply(500, { ok: false, error: '결과 변경을 넘기지 못했습니다.' });
    const { data: signed } = await bucket.createSignedUrl(path, 3600);
    if (!signed?.signedUrl) return reply(500, { ok: false, error: '결과 변경 주소를 만들지 못했습니다.' });
    diffUrl = signed.signedUrl;
    // 러너 안에서 연 결과 화면(바깥에서는 열리지 않는 주소, 적어 두기만). v0.7.34: 개발 AI가 알려 준 바뀐 화면 경로(screen)를 연다.
    // 다시 찍기(앱 버튼)처럼 경로가 안 오면 지난번 찍은 경로를 그대로 쓴다
    let screen = screenPath(body.screen);
    if (!screen && body.screen === undefined) {
      const { data: prev } = await bucket.download(`${base}/build/result.json`);
      const last = prev ? await prev.text().then((t) => JSON.parse(t) as { targets?: { key: string; url: string }[] }).catch(() => null) : null;
      screen = screenPath(String(last?.targets?.find((t) => t.key === 'after')?.url ?? '').replace(/^http:\/\/127\.0\.0\.1:4173/, ''));
    }
    targets.push({ key: 'after', url: `http://127.0.0.1:4173${screen || '/'}` });
    if (live) targets.push({ key: 'before', url: live });
  } else if (kind === 'preview') {
    const { data: result } = await admin.from('result_packages').select('revision, preview_url').eq('task_id', taskId).order('revision', { ascending: false }).limit(1).maybeSingle();
    resultRevision = Number(result?.revision ?? 0);
    const after = String(result?.preview_url ?? '');
    if (!/^https:\/\//.test(after)) return reply(409, { ok: false, error: '이 결과에는 미리보기 주소가 없어요(Cloudflare 주소가 있는 프로젝트만 돼요).' });
    targets.push({ key: 'after', url: after });
    if (live) targets.push({ key: 'before', url: live });
  } else {
    if (!live) return reply(409, { ok: false, error: '프로젝트에 운영 주소가 없어요. 프로젝트 수정에서 적어 주세요.' });
    targets.push({ key: 'live', url: live });
  }

  const ghToken = env('GITHUB_ACTIONS_TOKEN');
  const officeRepo = env('OFFICE_REPO') || 'minho-nim/minoffia';
  if (!ghToken) return reply(503, { ok: false, error: '화면 확인을 시작할 GitHub 토큰(GITHUB_ACTIONS_TOKEN)이 없습니다.' });
  const dir = `${base}/${kind}`;
  const files = [...targets.flatMap((t) => FILES[t.key]), 'result.json'];
  // 예전 결과를 지워야 앱이 새 결과가 왔는지 안다
  await bucket.remove(files.map((f) => `${dir}/${f}`));
  const uploads: Record<string, string> = {};
  for (const f of files) {
    const { data, error } = await bucket.createSignedUploadUrl(`${dir}/${f}`, { upsert: true });
    if (error || !data?.signedUrl) return reply(500, { ok: false, error: '업로드 주소를 만들지 못했습니다.' });
    uploads[f] = data.signedUrl;
  }
  const workflow = kind === 'build' ? 'result-shot.yml' : 'site-check.yml';
  const inputs: Record<string, string> = { targets: JSON.stringify(targets), uploads: JSON.stringify(uploads) };
  if (kind === 'build') Object.assign(inputs, { repo: String(project?.repo), diff_url: diffUrl });
  // v0.7.40: 찍은 뒤 화면 평가(review-screen)를 부를 6시간짜리 서명 표. 승인 전 결과 화면(build·preview)만
  if ((kind === 'build' || kind === 'preview') && resultRevision > 0) {
    const n = { taskId, revision: resultRevision, kind, exp: Date.now() + 6 * 3600_000 };
    const sig = await signNotify(serviceKey, n);
    inputs.notify = JSON.stringify({ url: `${env('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/review-screen`, ...n, sig });
  }
  const res = await fetch(`https://api.github.com/repos/${officeRepo}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'minoffia', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res?.ok) return reply(502, { ok: false, error: `화면 확인을 시작하지 못했습니다(GitHub ${res?.status ?? '응답 없음'}).` });
  return reply(200, { ok: true, started: true, kind, targets: targets.map((t) => t.key) });
});
