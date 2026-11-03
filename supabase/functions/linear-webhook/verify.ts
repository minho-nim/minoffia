// Linear 웹훅 서명 확인(외부 의존 없음): 본문 원문을 서명 비밀값으로 HMAC-SHA256 한 16진수가 linear-signature 머리와 같아야 한다.
// 오래된 요청(1분 넘게 지난 webhookTimestamp)은 받지 않는다(다시 보내기 공격 방지).
export async function signatureOk(raw: string, signature: string, secret: string): Promise<boolean> {
  if (!secret || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (mac.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ signature.toLowerCase().charCodeAt(i);
  return diff === 0;
}

export function fresh(webhookTimestamp: unknown, now = Date.now(), maxMs = 60_000): boolean {
  const t = Number(webhookTimestamp);
  return Number.isFinite(t) && Math.abs(now - t) <= maxMs;
}

/** 우리가 볼 이벤트(댓글 생성)면 그 이슈 ID, 아니면 null */
export function commentIssueId(payload: { type?: unknown; action?: unknown; data?: { issueId?: unknown } | null }): string | null {
  if (payload.type !== 'Comment' || payload.action !== 'create') return null;
  const id = payload.data?.issueId;
  return typeof id === 'string' && id.length > 0 && id.length < 100 ? id : null;
}
