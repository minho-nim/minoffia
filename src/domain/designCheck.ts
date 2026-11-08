// 디자인 자동 검사 결과(v0.5.56, 소유자 목록 26번): impeccable이 영어로 낸 규칙 이름을 쉬운 한국어로(규칙, 모델 호출 없음).
export type DesignFinding = { rule: string; name: string; severity: string; category: string; snippet: string; view: 'desktop' | 'mobile' | string };
export type DesignReport = { checkedAt: string; url: string; ok: boolean; designMd: boolean; findings: DesignFinding[] };

const KO: Record<string, string> = {
  'low-contrast': '글자와 배경 대비가 낮아요',
  'tiny-text': '글씨가 너무 작아요',
  'undersized-ui-text': '버튼·메뉴 글씨가 너무 작아요',
  'text-overflow': '글자가 칸 밖으로 넘쳐요',
  'nested-cards': '카드 안에 카드가 있어요',
  'ai-color-palette': "'AI 티 나는' 색 조합이에요",
  'gradient-text': '글자에 그라데이션을 썼어요',
  'cramped-padding': '안쪽 여백이 너무 좁아요',
  'skipped-heading': '제목 단계를 건너뛰었어요',
  'line-length': '한 줄이 너무 길어요',
  'broken-image': '깨진 이미지가 있어요',
  'script-error': '화면 스크립트 오류가 있어요',
  'design-system-color': '디자인 기준에 없는 색이에요',
  'design-system-font': '디자인 기준에 없는 글꼴이에요',
  'design-system-radius': '디자인 기준에 없는 둥글기예요',
};

export const koRule = (f: DesignFinding) => KO[f.rule] ?? f.name ?? f.rule;

export function parseDesignReport(raw: unknown): DesignReport | null {
  const r = raw as Partial<DesignReport> | null;
  if (!r || typeof r !== 'object' || typeof r.checkedAt !== 'string' || !Array.isArray(r.findings)) return null;
  return {
    checkedAt: r.checkedAt,
    url: String(r.url ?? ''),
    ok: r.ok !== false,
    designMd: Boolean(r.designMd),
    findings: r.findings
      .filter((f): f is DesignFinding => !!f && typeof f === 'object' && typeof (f as DesignFinding).rule === 'string')
      .map((f) => ({ rule: f.rule, name: String(f.name ?? ''), severity: String(f.severity ?? ''), category: String(f.category ?? ''), snippet: String(f.snippet ?? '').slice(0, 200), view: String(f.view ?? '') }))
      .slice(0, 120),
  };
}

/** 같은 규칙은 한 줄로 묶어 개수와 화면 폭을 보여 준다 */
export function groupFindings(findings: DesignFinding[]): { label: string; count: number; views: string; example: string }[] {
  const map = new Map<string, { label: string; count: number; views: Set<string>; example: string }>();
  for (const f of findings) {
    const g = map.get(f.rule) ?? { label: koRule(f), count: 0, views: new Set<string>(), example: f.snippet };
    g.count += 1;
    g.views.add(f.view === 'mobile' ? '휴대폰' : '데스크톱');
    map.set(f.rule, g);
  }
  return [...map.values()].sort((a, b) => b.count - a.count).map((g) => ({ label: g.label, count: g.count, views: [...g.views].join('·'), example: g.example }));
}
