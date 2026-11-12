// 지도 휴대폰 저장(v0.6.78 소유자 "처음에 저장해 두고 안 읽게"): 점검 결과(간략 지도·구조도 목록)와 자세한 지도(floorplan, 약 2MB)를
// 이 기기의 IndexedDB에 저장한다. 자세한 지도는 '점검한 시각'이 같으면 다시 받지 않는다. 저장 공간을 못 쓰면 그냥 매번 받는다.
// 저장하는 것은 저장소 구조·지도뿐이고 비밀값은 없다.
import type { HealthReport } from '../domain/healthText';

const DB = 'minoffia-maps';
const STORE = 'maps';
let dbp: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}
async function get<T>(key: string): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result as T | undefined);
      r.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}
async function put(key: string, value: unknown): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

type Api = { load: () => Promise<HealthReport | null>; map: () => Promise<string | null> };
// 앱이 켜 있는 동안은 메모리에서(10분), 그 뒤에는 저장한 것을 먼저 보이고 새 점검 결과(작은 파일)만 확인한다
const TTL = 600_000;
const mem = new Map<string, { at: number; report: HealthReport | null }>();
const htmlMem = new Map<string, { checkedAt: string; html: string }>();

/** 저장해 둔 점검 결과(바로, 네트워크 없음) */
export async function savedReport(id: string): Promise<HealthReport | null> {
  return mem.get(id)?.report ?? (await get<HealthReport>(`${id}:report`)) ?? null;
}
/** 최신 점검 결과(10분 안에 읽었으면 그대로, 아니면 서버에서 작은 파일 하나) */
export async function freshReport(id: string, api: Pick<Api, 'load'>): Promise<HealthReport | null> {
  const m = mem.get(id);
  if (m && Date.now() - m.at < TTL) return m.report;
  const r = await api.load();
  mem.set(id, { at: Date.now(), report: r });
  if (r) void put(`${id}:report`, r);
  return r;
}
/** 자세한 지도: 같은 점검 것이 저장돼 있으면 그대로, 아니면 받아서 저장(프로젝트마다 마지막 하나만) */
export async function mapHtml(id: string, checkedAt: string, api: Pick<Api, 'map'>): Promise<string | null> {
  const m = htmlMem.get(id);
  if (m && m.checkedAt === checkedAt) return m.html;
  const saved = await get<{ checkedAt: string; html: string }>(`${id}:html`);
  if (saved && saved.checkedAt === checkedAt) {
    htmlMem.set(id, saved);
    return saved.html;
  }
  const html = await api.map();
  if (html) {
    htmlMem.set(id, { checkedAt, html });
    void put(`${id}:html`, { checkedAt, html });
  }
  return html;
}
/** 다시 점검하면 메모리만 비운다(저장한 것은 점검 시각이 바뀌면 저절로 새로 받는다) */
export function forgetMaps(id: string) {
  mem.delete(id);
}
