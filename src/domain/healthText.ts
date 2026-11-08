// 앱 건강 검진(floorplan 1단계, v0.5.53): 검사기가 영어로 낸 결과를 종류별로 쉬운 한국어로 바꾼다(규칙, 모델 호출 없음).
export type HealthIssue = { kind: string; severity: 'high' | 'medium' | 'low' | string; title: string; detail: string; items: string[] };
export type HealthReport = { checkedAt: string; head: string; files: number | null; summary: { high: number; medium: number; low: number }; issues: HealthIssue[] };

const KO: Record<string, [string, string]> = {
  secret: ['코드에 비밀 열쇠가 적혀 있어요', '열쇠가 GitHub에 남아 있어 누구든 볼 수 있어요. 열쇠를 새로 바꾸고 서버 비밀값으로 옮겨야 해요.'],
  'public-env-secret': ['화면 코드에 숨겨야 할 열쇠가 있어요', '브라우저로 가는 설정(VITE_ 등)에 비밀 열쇠가 있어요. 방문자 누구나 볼 수 있어요.'],
  'env-file': ['.env 파일이 저장소에 올라가 있어요', '비밀값을 담는 파일이라 저장소에서 빼고 열쇠를 바꾸는 게 안전해요.'],
  'unprotected-endpoint': ['아무나 부를 수 있는 서버 주소가 있어요', '로그인 확인 없이 쓰기·지우기가 되는 주소예요. 일부러 연 것이 아니면 확인이 필요해요.'],
  'database-rules': ['DB 보안 규칙이 느슨해요', '로그인 안 한 사람도 읽거나 쓸 수 있는 표가 있을 수 있어요.'],
  cors: ['아무 사이트에서나 서버를 부를 수 있어요(CORS)', '다른 사이트가 로그인한 사용자 대신 요청을 보낼 수 있어요. 허용 주소를 정해 두는 게 좋아요.'],
  'stripe-webhook': ['결제 알림의 서명 확인이 없어요', '가짜 결제 완료 알림을 받아들일 수 있어요.'],
  'hardcoded-url': ['주소가 코드에 박혀 있어요', '서버 주소가 바뀌면 코드를 고쳐야 해요. 설정값으로 빼면 편해요.'],
  'large-file': ['너무 큰 파일이 있어요', '1,000줄이 넘는 파일은 AI가 고칠 때 다른 곳을 망가뜨리기 쉬워요. 하는 일별로 나누면 안전해요.'],
  'unused-file': ['안 쓰는 파일이 있어요', '어디에서도 불러 쓰지 않는 파일이에요. 정말 안 쓰면 지워도 돼요.'],
};

export const SEVERITY_KO: Record<string, string> = { high: '중요', medium: '고칠 만함', low: '사소' };

export function koIssue(i: HealthIssue): { title: string; detail: string; severity: string } {
  const [title, detail] = KO[i.kind] ?? [i.title, i.detail];
  return { title, detail, severity: SEVERITY_KO[i.severity] ?? '참고' };
}

/** 받은 JSON이 검진 결과 모양인지 확인(이상하면 null) */
export function parseHealth(raw: unknown): HealthReport | null {
  const r = raw as Partial<HealthReport> | null;
  if (!r || typeof r !== 'object' || typeof r.checkedAt !== 'string' || !r.summary || !Array.isArray(r.issues)) return null;
  const n = (v: unknown) => (typeof v === 'number' && v >= 0 ? v : 0);
  return {
    checkedAt: r.checkedAt,
    head: typeof r.head === 'string' ? r.head : '',
    files: typeof r.files === 'number' ? r.files : null,
    summary: { high: n(r.summary.high), medium: n(r.summary.medium), low: n(r.summary.low) },
    issues: r.issues
      .filter((i): i is HealthIssue => !!i && typeof i === 'object' && typeof (i as HealthIssue).kind === 'string')
      .map((i) => ({ kind: i.kind, severity: String(i.severity), title: String(i.title ?? ''), detail: String(i.detail ?? ''), items: (Array.isArray(i.items) ? i.items : []).map(String).slice(0, 20) })),
  };
}
