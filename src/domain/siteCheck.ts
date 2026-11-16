// 화면 확인(v0.6.9): 실제 사이트(미리보기·운영)를 찍은 결과. scripts/site-check.mjs가 만든 result.json을 읽는다.
export type SiteShot = { size: 'pc' | 'mobile'; width: number; errors: string[]; errorCount: number; overflow: boolean; file: string };
/** note: 빌드해서 찍기가 못 찍은 이유(변경 적용·빌드 실패 등) */
export type SiteTarget = { key: 'before' | 'after' | 'live'; url: string; status: number; shots: SiteShot[]; note?: string };
export type SiteResult = { checkedAt: string; targets: SiteTarget[] };
export type SiteCheck = { result: SiteResult; images: Record<string, string> };
/** preview = 미리보기 주소, production = 운영, build = 결과 변경을 Actions에서 빌드해 찍음(v0.7.25, 미리보기 주소가 없는 프로젝트) */
export type SiteKind = 'preview' | 'production' | 'build';
export type SiteChecks = { preview?: SiteCheck; production?: SiteCheck; build?: SiteCheck };

export const TARGET_LABEL: Record<SiteTarget['key'], string> = { before: '지금 운영', after: '바뀐 미리보기', live: '배포 뒤 운영' };

export function parseSiteCheck(raw: unknown): SiteCheck | null {
  const c = raw as { result?: Partial<SiteResult>; images?: Record<string, unknown> } | null;
  const r = c?.result;
  if (!r || typeof r.checkedAt !== 'string' || !Array.isArray(r.targets)) return null;
  const images: Record<string, string> = {};
  for (const [k, v] of Object.entries(c?.images ?? {})) if (typeof v === 'string' && v.startsWith('https://')) images[k] = v;
  const targets = r.targets
    .filter((t): t is SiteTarget => !!t && ['before', 'after', 'live'].includes((t as SiteTarget).key))
    .map((t) => ({
      key: t.key,
      url: String(t.url ?? ''),
      status: Number(t.status) || 0,
      ...(typeof t.note === 'string' && t.note ? { note: t.note.slice(0, 200) } : {}),
      shots: (Array.isArray(t.shots) ? t.shots : []).map((s) => ({
        size: s.size === 'mobile' ? ('mobile' as const) : ('pc' as const),
        width: Number(s.width) || 0,
        errors: (Array.isArray(s.errors) ? s.errors : []).map(String).slice(0, 5),
        errorCount: Number(s.errorCount) || 0,
        overflow: Boolean(s.overflow),
        file: String(s.file ?? ''),
      })),
    }));
  return { result: { checkedAt: r.checkedAt, targets }, images };
}

/** 한 줄 판정: 바뀐 미리보기(또는 배포 뒤 운영)에 문제가 있나 */
export function verdictLine(c: SiteCheck): { ok: boolean; text: string } {
  const main = c.result.targets.find((t) => t.key === 'after' || t.key === 'live');
  if (!main) return { ok: false, text: '확인할 화면이 없어요.' };
  if (!main.shots.length) return { ok: false, text: main.note || `${TARGET_LABEL[main.key]}을 열지 못했어요(HTTP ${main.status || '응답 없음'}).` };
  const errors = main.shots.reduce((n, s) => n + s.errorCount, 0);
  const overflow = main.shots.filter((s) => s.overflow).map((s) => (s.size === 'pc' ? 'PC' : '휴대폰'));
  const ok = errors === 0 && overflow.length === 0;
  return { ok, text: `${TARGET_LABEL[main.key]}: 콘솔 오류 ${errors}개 · 가로 넘침 ${overflow.length ? overflow.join('·') : '없음'}` };
}
