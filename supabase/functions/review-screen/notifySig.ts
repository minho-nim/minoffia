// 결과 화면 찍기가 끝났다고 알리는 표(v0.7.40): site-check가 서명해 Actions에 넘기고, review-screen이 확인한다.
// 서명 = HMAC-SHA256(서버 비밀 열쇠, "업무.결과버전.종류.만료"). 6시간짜리, 한 결과에 한 번만 쓰인다(review-screen이 확인).
// 복사본: site-check/notifySig.ts·review-screen/notifySig.ts(같은지 시험이 확인)

export interface Notify {
  taskId: string;
  revision: number;
  kind: string;
  exp: number;
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const line = (n: Notify) => `${n.taskId}.${n.revision}.${n.kind}.${n.exp}`;

async function hmac(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}

export async function signNotify(secret: string, n: Notify): Promise<string> {
  return hmac(secret, line(n));
}

/** 서명이 맞고 만료 전인지(같은 길이 비교) */
export async function verifyNotify(secret: string, n: Notify, sig: string, now = Date.now()): Promise<boolean> {
  if (!secret || !/^[0-9a-f]{64}$/.test(sig) || !Number.isFinite(n.exp) || n.exp < now) return false;
  if (!/^[0-9a-f-]{36}$/i.test(n.taskId) || !Number.isInteger(n.revision) || n.revision < 1 || !/^(build|preview)$/.test(n.kind)) return false;
  const want = await hmac(secret, line(n));
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
