import { describe, expect, it } from 'vitest';
import { allowedEndpoint, b64url, encryptPayload, fromB64url, generateVapidKeys, vapidAuthorization } from './webpush';

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();

async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle.sign('HMAC', k, data));
}
const cat = (...p: Uint8Array[]) => {
  const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of p) (o.set(x, i), (i += x.length));
  return o;
};

/** 브라우저 쪽 복호화(RFC 8291)를 따로 구현해 왕복을 확인한다. */
async function decrypt(body: Uint8Array, ua: CryptoKeyPair, auth: Uint8Array) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const uaPublic = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
  const asKey = await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const prkKey = await hmac(auth, shared);
  const ikm = (await hmac(prkKey, cat(te.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])))).slice(0, 32);
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(te.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(te.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
  expect(plain[plain.length - 1]).toBe(2);
  expect(new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0)).toBe(4096);
  return new TextDecoder().decode(plain.slice(0, -1));
}

describe('웹 푸시(v0.4.12)', () => {
  it('aes128gcm으로 암호화한 내용을 브라우저 키로 풀 수 있다', async () => {
    const ua = (await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    const auth = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const p256dh = b64url(new Uint8Array(await subtle.exportKey('raw', ua.publicKey)));
    const body = await encryptPayload(te.encode('{"title":"기획서가 왔어요"}'), p256dh, b64url(auth));
    expect(await decrypt(body, ua, auth)).toBe('{"title":"기획서가 왔어요"}');
  });

  it('VAPID 서명은 공개키로 검증되고 aud는 푸시 서비스 주소', async () => {
    const keys = await generateVapidKeys();
    expect(fromB64url(keys.publicKey)).toHaveLength(65);
    const h = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, 'mailto:me@example.com', 0);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h)!;
    expect(m[4]).toBe(keys.publicKey);
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(m[2])));
    expect(claims).toEqual({ aud: 'https://fcm.googleapis.com', exp: 12 * 3600, sub: 'mailto:me@example.com' });
    const pub = await subtle.importKey('raw', fromB64url(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64url(m[3]), te.encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });

  it('알려진 푸시 서비스 주소만 구독으로 받는다', () => {
    expect(allowedEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
    expect(allowedEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(allowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(allowedEndpoint('https://evil.example.com/googleapis.com')).toBe(false);
    expect(allowedEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(allowedEndpoint('https://169.254.169.254/')).toBe(false);
  });
});
