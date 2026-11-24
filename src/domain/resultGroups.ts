// 결과물 탭 묶기(v0.8.16 소유자 "결과물 탭에 프로젝트별 묶는 거, 미니허브 안에 미니로그·미니어리"):
// 프로젝트별로 묶고, 한 저장소에 앱이 여럿이면(설명에 '이름(…, 폴더/)') 앱별로 한 번 더 나눈다. 규칙만(모델 0).

export interface ProjectApp {
  name: string;
  folder: string;
}

/** 프로젝트 설명에서 앱 목록: "미니로그(사진 블로그, minilog/)" → { name: 미니로그, folder: minilog } */
export function appsOf(description: string): ProjectApp[] {
  const out: ProjectApp[] = [];
  for (const m of description.matchAll(/([가-힣A-Za-z0-9]+)\s*\(([^()]*?)([A-Za-z0-9_-]+)\/\)/g)) {
    if (!out.some((a) => a.folder === m[3])) out.push({ name: m[1], folder: m[3] });
  }
  return out;
}

/** diff에서 바뀐 파일 맨 위 폴더들 */
export function topFolders(diff: string): string[] {
  const set = new Set<string>();
  for (const m of diff.matchAll(/^diff --git a\/([^/\s]+)\//gm)) set.add(m[1]);
  return [...set];
}

/**
 * 결과 하나가 어느 앱인지: 제목에 앱 이름·폴더가 있으면 그것, 아니면 바뀐 파일이 한 앱 폴더에만 있으면 그 앱.
 * 여러 앱을 건드렸거나 모르면 null('공통·기타').
 */
export function appOf(apps: ProjectApp[], title: string, diff: string): ProjectApp | null {
  if (!apps.length) return null;
  const low = title.toLowerCase();
  const named = apps.filter((a) => title.includes(a.name) || new RegExp(`\\b${a.folder}\\b`, 'i').test(low));
  if (named.length === 1) return named[0];
  const touched = apps.filter((a) => topFolders(diff).includes(a.folder));
  return touched.length === 1 ? touched[0] : null;
}

export interface Group<T> {
  key: string;
  label: string;
  items: T[];
}

/** 앱별로 나누기(앱 순서대로, 모르는 것은 맨 뒤 '공통·기타'). 앱이 없으면 한 묶음 */
export function byApp<T>(apps: ProjectApp[], items: T[], pick: (x: T) => { title: string; diff: string }): Group<T>[] {
  if (!apps.length) return [{ key: '', label: '', items }];
  const groups = new Map<string, Group<T>>();
  for (const x of items) {
    const { title, diff } = pick(x);
    const a = appOf(apps, title, diff);
    const key = a?.folder ?? '';
    if (!groups.has(key)) groups.set(key, { key, label: a?.name ?? '공통·기타', items: [] });
    groups.get(key)!.items.push(x);
  }
  const order = (k: string) => (k === '' ? apps.length : apps.findIndex((a) => a.folder === k));
  return [...groups.values()].sort((a, b) => order(a.key) - order(b.key));
}
