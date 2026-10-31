// 표준 웹 푸시(무료): VAPID 서명(RFC 8292) + 내용 암호화 aes128gcm(RFC 8188·8291). 외부 라이브러리 없이 WebCrypto만 쓴다.
// Deno(Edge Function)와 Node(시험) 모두에서 돈다. 키·구독 정보는 DB에만 두고 여기서는 계산만 한다.

const te = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

export const b64url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const fromB64url = (text: string): Uint8Array => {
  const s = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
};

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await subtle().importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', k, data));
}

export interface VapidKeys {
  /** 공개키(65바이트 비압축 점) base64url: 브라우저 구독(applicationServerKey)과 Authorization k= 에 쓴다 */
  publicKey: string;
  /** 개인키 JWK(서버 DB에만) */
  privateJwk: JsonWebKey;
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await subtle().exportKey('raw', pair.publicKey));
  return { publicKey: b64url(raw), privateJwk: await subtle().exportKey('jwk', pair.privateKey) };
}

/** VAPID Authorization 헤더 값(ES256 JWT, 12시간) */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64url(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(te.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const key = await subtle().importKey('jwk', { ...keys.privateJwk, key_ops: ['sign'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto ECDSA 서명은 r||s(64바이트) 그대로라 JWS ES256 형식과 같다.
  const sig = new Uint8Array(await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${keys.publicKey}`;
}

/**
 * RFC 8291 aes128gcm 암호화. p256dh·auth는 브라우저 구독의 키(base64url).
 * salt·보내는 쪽 키쌍은 시험에서만 넣는다(평소에는 매번 새로 만든다).
 */
export async function encryptPayload(
  plaintext: Uint8Array,
  p256dh: string,
  auth: string,
  opts: { salt?: Uint8Array; serverKeys?: CryptoKeyPair } = {},
): Promise<Uint8Array> {
  const uaPublic = fromB64url(p256dh);
  const authSecret = fromB64url(auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('bad subscription keys');
  const server = opts.serverKeys ?? ((await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await subtle().exportKey('raw', server.publicKey));
  const uaKey = await subtle().importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: uaKey }, server.privateKey, 256));

  const prkKey = await hmac(authSecret, shared);
  const ikm = (await hmac(prkKey, concat(te.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])))).slice(0, 32);
  const salt = opts.salt ?? globalThis.crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(te.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(te.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const aes = await subtle().importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

export interface PushMessage {
  title: string;
  body: string;
  /** 같은 tag 알림은 휴대폰에서 하나로 덮어쓴다 */
  tag: string;
  /** 누르면 열 주소(앱 안 경로) */
  url: string;
}

export interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** 한 구독에 보낸다. 결과 status 404·410이면 구독이 사라진 것(지워야 함). */
export async function sendPush(sub: Subscription, msg: PushMessage, keys: VapidKeys, subject: string): Promise<{ status: number }> {
  const endpoint = new URL(sub.endpoint);
  if (endpoint.protocol !== 'https:') return { status: 400 };
  const body = await encryptPayload(te.encode(JSON.stringify(msg)), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, keys, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  await res.body?.cancel();
  return { status: res.status };
}

/** 푸시 서비스 주소로 허용하는 곳(구독 저장 때 확인): 크롬·안드로이드, 파이어폭스, 애플, 엣지 */
export function allowedEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:') return false;
    return /(^|\.)(googleapis\.com|mozilla\.com|mozaws\.net|push\.apple\.com|notify\.windows\.com)$/.test(u.hostname);
  } catch {
    return false;
  }
}
