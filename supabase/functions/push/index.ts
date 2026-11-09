// 휴대폰 알림(v0.4.12, 무료 웹 푸시). AI 호출 없음(토큰 0).
// - key / subscribe / unsubscribe / test: 소유자 로그인 확인 뒤
// - flush: 로그인 없이 부를 수 있지만 입력을 받지 않는다. DB 트리거(push_enqueue → pg_net)가 넣은 알림 줄만 보낸다.
// verify_jwt = false(pg_net이 로그인 없이 깨우므로). 사용자 동작은 함수 안에서 로그인·소유자를 확인한다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { allowedEndpoint, generateVapidKeys, sendPush, type VapidKeys } from './webpush.ts';

const env = (key: string) => (Deno.env.get(key) ?? '').trim();

const cors = {
  'Access-Control-Allow-Origin': env('OFFICE_ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

async function loadKeys(create: boolean): Promise<VapidKeys | null> {
  const db = admin();
  const { data } = await db.from('push_keys').select('public_key, private_jwk, flush_url').eq('id', 1).maybeSingle();
  const flushUrl = `${env('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/push`;
  if (data) {
    if (create && data.flush_url !== flushUrl) await db.from('push_keys').update({ flush_url: flushUrl }).eq('id', 1);
    return { publicKey: data.public_key, privateJwk: data.private_jwk };
  }
  if (!create) return null;
  const keys = await generateVapidKeys();
  // 동시에 두 번 만들면 먼저 들어간 것을 쓴다.
  await db.from('push_keys').upsert({ id: 1, public_key: keys.publicKey, private_jwk: keys.privateJwk, flush_url: flushUrl }, { onConflict: 'id', ignoreDuplicates: true });
  return loadKeys(false);
}

const TAG: Record<string, string> = { question: 'ask', spec: 'ask', plan: 'ask', prototype: 'ask', result: 'ask', blocked: 'alert', test: 'test', briefing: 'brief' };

/** 보낼 알림 줄을 가져가(보냄 표시를 먼저 해서 두 번 보내지 않음) 주인의 모든 기기에 보낸다. */
async function flush(): Promise<{ sent: number; removed: number }> {
  const db = admin();
  const keys = await loadKeys(false);
  if (!keys) return { sent: 0, removed: 0 };
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { data: pending } = await db.from('push_outbox').select('id').is('sent_at', null).gt('created_at', since).order('id').limit(20);
  if (!pending?.length) return { sent: 0, removed: 0 };
  const { data: rows } = await db
    .from('push_outbox')
    .update({ sent_at: new Date().toISOString() })
    .in('id', pending.map((r) => r.id))
    .is('sent_at', null)
    .select('id, owner_id, task_id, kind, title, body');
  const subject = `mailto:${env('OFFICE_OWNER_EMAIL') || 'owner@example.invalid'}`;
  let sent = 0;
  let removed = 0;
  for (const row of rows ?? []) {
    const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth, fail_count').eq('owner_id', row.owner_id);
    for (const s of subs ?? []) {
      const msg = { title: row.title, body: row.body || 'minoffia.', tag: `${TAG[row.kind] ?? 'ask'}-${row.task_id ?? 'all'}`, url: row.task_id ? `/?task=${row.task_id}` : '/' };
      let status = 0;
      try {
        status = (await sendPush(s, msg, keys, subject)).status;
      } catch {
        status = 0;
      }
      if (status === 404 || status === 410) {
        await db.from('push_subscriptions').delete().eq('id', s.id);
        removed++;
      } else if (status >= 200 && status < 300) {
        await db.from('push_subscriptions').update({ last_ok_at: new Date().toISOString(), fail_count: 0 }).eq('id', s.id);
        sent++;
      } else {
        // 계속 실패하는 구독(10번)은 지운다.
        if (s.fail_count + 1 >= 10) await db.from('push_subscriptions').delete().eq('id', s.id);
        else await db.from('push_subscriptions').update({ fail_count: s.fail_count + 1 }).eq('id', s.id);
      }
    }
  }
  return { sent, removed };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST만 받습니다.' });
  let body: { action?: string; endpoint?: string; p256dh?: string; auth?: string; device?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: '본문이 JSON이 아닙니다.' });
  }
  const action = String(body.action ?? '');
  if (action === 'flush') return reply(200, { ok: true, ...(await flush()) });

  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });
  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 쓸 수 있습니다.' });

  if (action === 'key') {
    const keys = await loadKeys(true);
    if (!keys) return reply(500, { ok: false, error: '알림 키를 만들지 못했습니다.' });
    return reply(200, { ok: true, publicKey: keys.publicKey });
  }
  if (action === 'subscribe') {
    const endpoint = String(body.endpoint ?? '');
    const p256dh = String(body.p256dh ?? '');
    const authKey = String(body.auth ?? '');
    if (!allowedEndpoint(endpoint) || endpoint.length > 1000) return reply(400, { ok: false, error: '이 브라우저의 알림 주소는 받을 수 없습니다.' });
    if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,40}$/.test(authKey)) return reply(400, { ok: false, error: '알림 키 형식이 틀렸습니다.' });
    const { error } = await admin()
      .from('push_subscriptions')
      .upsert({ owner_id: user.id, endpoint, p256dh, auth: authKey, device: String(body.device ?? '').slice(0, 120), fail_count: 0 }, { onConflict: 'endpoint' });
    if (error) return reply(500, { ok: false, error: '알림 구독을 저장하지 못했습니다.' });
    return reply(200, { ok: true });
  }
  if (action === 'unsubscribe') {
    await admin().from('push_subscriptions').delete().eq('owner_id', user.id).eq('endpoint', String(body.endpoint ?? ''));
    return reply(200, { ok: true });
  }
  if (action === 'test') {
    await admin().from('push_outbox').insert({ owner_id: user.id, kind: 'test', title: '알림 시험', body: '휴대폰 알림이 잘 와요.' });
    const r = await flush();
    if (!r.sent) return reply(200, { ok: false, error: '보낼 기기가 없거나 보내지 못했습니다. 알림을 다시 켜 주세요.' });
    return reply(200, { ok: true, ...r });
  }
  return reply(400, { ok: false, error: '모르는 동작입니다.' });
});
