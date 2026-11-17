// 화면 평가(v0.7.40 소유자 "루프: 결과 사진을 평가에 넣기"): 미노가 찍은 결과 화면(휴대폰·PC)을 기획서와 견줘 본다.
// 코드 채점(review-result)은 diff만 봐서 '버튼이 안 보임' 같은 화면 문제를 놓쳤다. 규칙(파싱·판정)만 여기, 호출은 index.ts.

export const SCREEN_SYSTEM = `너는 웹 화면 검수자다. 기획서(요구)와 결과 화면 사진(휴대폰 400px·PC 1400px)을 보고, 요구가 화면에 실제로 보이는지와 눈에 띄게 깨진 곳만 판단한다.
- 깨짐의 예: 빈 화면, 글자·버튼 겹침, 화면 밖으로 넘침, 읽을 수 없는 대비, 요구한 요소가 아예 없음.
- 취향(색·여백 미세 조정)은 문제로 보지 않는다. 사진에 안 보이는 것을 추측하지 않는다.
- 답은 JSON 하나만: {"score": 0~100 정수, "problems": ["쉬운 한국어 한 줄", ... 최대 4개]}. 문제가 없으면 problems는 빈 배열.`;

export interface ScreenReview {
  score: number;
  problems: string[];
  /** 찍은 화면 종류(build = 미노가 빌드해 찍음, preview = 미리보기 주소) */
  kind: string;
  /** 사진에서 자동으로 센 것(콘솔 오류 수·가로 넘침) */
  errors: number;
  overflow: boolean;
  judge: string;
  checkedAt: string;
}

/** 이 점수 아래거나 빈 화면이면 자동으로 다시 개발(평균 판정과 따로, 화면이 확실히 깨졌을 때만) */
export const SCREEN_REDO_SCORE = 60;
/** v0.7.44: 이 점수 아래면(60~79) 코드 채점이 통과여도 사장님 확인으로 둔다(화면이 애매하면 사람이 본다) */
export const SCREEN_PASS_SCORE = 80;

export function screenPrompt(spec: string, stats: { errors: number; overflow: boolean }): string {
  return [
    '## 기획서(요구)',
    spec.slice(0, 6000),
    '',
    '## 자동으로 센 것',
    `콘솔 오류 ${stats.errors}개 · 가로 넘침 ${stats.overflow ? '있음' : '없음'}`,
    '',
    '첨부 사진: 1) 휴대폰 400px 2) PC 1400px. 위 형식의 JSON 하나만 답한다.',
  ].join('\n');
}

export function parseScreen(text: string): { score: number; problems: string[] } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { score?: unknown; problems?: unknown };
    const score = Number(j.score);
    if (!Number.isFinite(score)) return null;
    const problems = (Array.isArray(j.problems) ? j.problems : [])
      .map((p) => String(p).replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 4)
      .map((p) => p.slice(0, 160));
    return { score: Math.max(0, Math.min(100, Math.round(score))), problems };
  } catch {
    return null;
  }
}

/** 화면 평가로 판정을 바꿀지: 이미 결과 승인했거나, 이미 다시 개발이거나, 자동 다시 개발 횟수를 다 썼으면 기록만 */
export function screenDecision(s: { score: number; problems: string[] }, o: { verdict: string; bApproved: boolean; redos: number; maxRedo: number }): 'redo' | 'owner' | 'note' {
  if (o.bApproved || o.verdict === 'redo') return 'note';
  if (s.score >= SCREEN_PASS_SCORE) return 'note';
  if (s.score >= SCREEN_REDO_SCORE) return o.verdict === 'pass' ? 'owner' : 'note';
  return o.redos < o.maxRedo ? 'redo' : 'owner';
}

export function screenFeedback(s: { score: number; problems: string[] }): string {
  return [`결과 화면 검사 ${s.score}점 — 화면에서 고칠 것:`, ...s.problems.map((p, i) => `${i + 1}) ${p}`)].join('\n');
}
