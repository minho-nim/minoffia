/**
 * 휴대폰 알림(무료 웹 푸시, v0.4.12). 서비스 워커(public/sw.js) 등록, 알림 허락, 구독을 서버(push 함수)에 저장.
 * iPhone은 Safari에서 "홈 화면에 추가"한 앱 안에서만 웹 푸시가 된다(iOS 16.4+).
 */
import type { OfficeStore } from '../data/store';

export type PushState = 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on';

const standalone = () =>
  (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) ||
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // 등록이 막힌 환경(미리보기 등): 알림만 못 쓴다.
  });
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration('/')) ?? null;
}

export async function pushState(): Promise<PushState> {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) return isIos() && !standalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

const toBytes = (b64url: string) => {
  const s = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const deviceName = () => {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac/.test(ua)) return 'Mac';
  return '기기';
};

export async function enablePush(store: OfficeStore): Promise<PushState> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  let reg = await registration();
  if (!reg) {
    await navigator.serviceWorker.register('/sw.js');
    reg = await navigator.serviceWorker.ready;
  }
  const { publicKey } = (await store.push('key')) as { publicKey: string };
  let sub = await reg.pushManager.getSubscription();
  // 서버 키가 바뀌었으면 다시 구독한다.
  const current = sub?.options.applicationServerKey;
  if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))) !== btoa(String.fromCharCode(...toBytes(publicKey)))) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) });
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await store.push('subscribe', { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, device: deviceName() });
  return 'on';
}

export async function disablePush(store: OfficeStore): Promise<PushState> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) {
    await store.push('unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe();
  }
  return 'off';
}
