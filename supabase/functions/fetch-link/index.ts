// 요청 자료 링크를 서버에서 한 번 읽어 제목·본문을 기록한다(v0.2 §4).
// 내부망·메타데이터 주소는 DNS 결과까지 확인해 막는다. 읽은 내용은 신뢰할 수 없는 참고자료로만 쓴다.
// 이미지 링크는 Gemini가 연결되기 전까지 내용을 분석하지 않는다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { checkUrl, classify, contentKind, extractHtml, isBlockedIp, MAX_BYTES, MAX_EXCERPT, MAX_REDIRECTS, TIMEOUT_MS, type LinkKind } from './safety.ts';

/** 한 사람이 하루(KST)에 읽을 수 있는 링크 수 */
const DAILY_LINK_CAP = 30;
const USER_AGENT = 'MinLabAIOffice/0.2 (link reader; owner-initiated)';

const env = (key: string) => (Deno.env.get(key) ?? '').trim();

const cors = {
  'Access-Control-Allow-Origin': env('OFFICE_ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

class Blocked extends Error {}

/** 이름의 A·AAAA 주소. Deno DNS가 없으면 DNS-over-HTTPS(Cloudflare)로 확인한다. */
async function resolve(host: string): Promise<string[]> {
  const out: string[] = [];
  const resolveDns = (Deno as unknown as { resolveDns?: (h: string, t: string) => Promise<string[]> }).resolveDns;
  if (resolveDns) {
    for (const type of ['A', 'AAAA']) {
      try {
        out.push(...(await resolveDns(host, type)));
      } catch {
        // 해당 기록이 없을 수 있다.
      }
    }
    if (out.length) return out;
  }
  for (const type of ['A', 'AAAA']) {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) continue;
    const data = (await res.json()) as { Answer?: { type: number; data: string }[] };
    for (const a of data.Answer ?? []) if (a.type === 1 || a.type === 28) out.push(a.data);
  }
  return out;
}

async function assertPublic(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    if (isBlockedIp(host)) throw new Blocked('사설·내부 IP 주소는 읽지 않습니다.');
    return;
  }
  const ips = await resolve(host);
  if (ips.length === 0) throw new Error('주소(DNS)를 찾지 못했습니다.');
  if (ips.some(isBlockedIp)) throw new Blocked('이 주소는 내부망 IP로 연결돼 읽지 않습니다.');
}

async function readLimited(res: Response): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { bytes: new Uint8Array(), truncated: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.length > MAX_BYTES) {
      chunks.push(value.slice(0, MAX_BYTES - size));
      size = MAX_BYTES;
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    size += value.length;
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return { bytes, truncated };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface Outcome {
  kind: LinkKind;
  status: 'ok' | 'partial' | 'failed' | 'blocked';
  http_status: number | null;
  content_type: string;
  title: string;
  excerpt: string;
  error: string;
  sha256: string;
}

async function readLink(raw: string): Promise<Outcome> {
  const base: Outcome = { kind: 'other', status: 'failed', http_status: null, content_type: '', title: '', excerpt: '', error: '', sha256: '' };
  const first = checkUrl(raw);
  if (!first.ok) return { ...base, status: 'blocked', error: first.reason };
  const { kind, fetchUrl } = classify(first.url);
  let target = new URL(fetchUrl);
  const deadline = AbortSignal.timeout(TIMEOUT_MS);
  try {
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublic(target);
      res = await fetch(target, { redirect: 'manual', signal: deadline, headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/plain,image/*;q=0.5,*/*;q=0.1' } });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        await res.body?.cancel();
        const next = checkUrl(new URL(res.headers.get('location')!, target).toString());
        if (!next.ok) return { ...base, kind, status: 'blocked', http_status: res.status, error: `다른 주소로 넘겨짐 → ${next.reason}` };
        target = next.url;
        res = null;
        continue;
      }
      break;
    }
    if (!res) return { ...base, kind, error: `다른 주소로 ${MAX_REDIRECTS}번 넘게 넘겨져 멈췄습니다.` };
    const contentType = (res.headers.get('content-type') ?? '').slice(0, 200);
    if (!res.ok) {
      await res.body?.cancel();
      const hint = kind === 'github' && (res.status === 404 || res.status === 403) ? ' 비공개 저장소는 권한이 필요해 읽지 않았습니다.' : '';
      return { ...base, kind, http_status: res.status, content_type: contentType, error: `HTTP ${res.status}로 읽지 못했습니다.${hint}` };
    }
    const handling = contentKind(contentType);
    if (handling === 'image') {
      await res.body?.cancel();
      return { ...base, kind: 'image', status: 'partial', http_status: res.status, content_type: contentType, error: '이미지 링크입니다. Gemini 이미지 분석이 연결되지 않아 내용은 읽지 않았습니다.' };
    }
    if (handling === 'unsupported') {
      await res.body?.cancel();
      return { ...base, kind, http_status: res.status, content_type: contentType, error: '읽을 수 없는 형식입니다(HTML·텍스트만 읽습니다).' };
    }
    const { bytes, truncated } = await readLimited(res);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const page = handling === 'html' ? extractHtml(text) : { title: '', description: '', text: text.slice(0, MAX_EXCERPT) };
    const excerpt = [page.description, page.text].filter(Boolean).join('\n\n').slice(0, MAX_EXCERPT);
    const thin = excerpt.trim().length < 40;
    return {
      kind,
      status: thin || truncated ? 'partial' : 'ok',
      http_status: res.status,
      content_type: contentType,
      title: page.title,
      excerpt,
      error: thin ? '본문 글자가 거의 없습니다(화면을 스크립트로 그리는 페이지일 수 있습니다). 필요하면 스크린샷을 첨부하세요.' : truncated ? '1MB까지만 읽었습니다.' : '',
      sha256: await sha256(bytes),
    };
  } catch (e) {
    if (e instanceof Blocked) return { ...base, kind, status: 'blocked', error: e.message };
    const name = (e as Error).name;
    return { ...base, kind, error: name === 'TimeoutError' || name === 'AbortError' ? '응답이 늦어 8초에서 멈췄습니다.' : `읽지 못했습니다: ${(e as Error).message}`.slice(0, 500) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST만 받습니다.' });

  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });

  let body: { taskId?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '요청 본문이 JSON이 아닙니다.' });
  }
  if (!body.taskId || !body.url || body.url.length > 2000) return reply(400, { ok: false, error: '업무와 주소(2000자 이하)가 필요합니다.' });

  // RLS를 거쳐 내 업무인지 확인
  const { data: task } = await userClient.from('tasks').select('id').eq('id', body.taskId).maybeSingle();
  if (!task) return reply(404, { ok: false, error: '업무를 찾을 수 없습니다.' });

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const kstMidnight = new Date(Math.floor((Date.now() + 9 * 3600_000) / 86400_000) * 86400_000 - 9 * 3600_000).toISOString();
  const { count } = await admin.from('link_refs').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).gte('created_at', kstMidnight);
  if ((count ?? 0) >= DAILY_LINK_CAP) return reply(429, { ok: false, error: `오늘 링크 읽기 ${DAILY_LINK_CAP}회를 모두 썼습니다.` });

  const outcome = await readLink(body.url);
  const { data: row, error } = await admin
    .from('link_refs')
    .insert({ owner_id: user.id, task_id: task.id, url: body.url.trim(), ...outcome })
    .select('*')
    .single();
  if (error) {
    const locked = error.message.includes('locked after A approval');
    return reply(locked ? 409 : 500, {
      ok: false,
      error: locked ? 'A 승인 뒤에는 요청 자료(링크)를 바꿀 수 없습니다. 바꾸려면 기획서를 새 버전으로 저장하세요.' : error.message.includes('too many links') ? '링크는 업무당 20개까지입니다.' : `기록하지 못했습니다: ${error.message}`,
    });
  }
  return reply(200, { ok: true, link: row });
});
