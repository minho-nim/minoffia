// 개발 스킬 고르기(v0.7.0, 소유자 "개발할 때 스킬을 쓸까요? 물어보고, 대화에서 고르면 그걸 참고해서 시작"):
// 업무 글에서 규칙으로 알맞은 스킬을 추천하고(AI 호출 없음), 소유자가 고른 스킬은 지시서 규칙에 한 줄로 넣는다.
// skillPickRule은 서버 함수(codex-linear·dispatch-claude-dev)의 skillPick.ts에 그대로 복사돼 있다(같은지는 시험이 확인).

/** 글에 이런 말이 있으면 이 스킬을 추천(앞쪽이 먼저) */
export const SKILL_HINTS: [RegExp, string[]][] = [
  // 게임(v0.7.46 소유자 "게임 관련으로 묶어서"): 게임 업무면 게임 스킬을 먼저(그 저장소에 들어 있을 때만 추천됨)
  [/(게임|플레이).*(느려|끊겨|프레임|fps|빈\s?화면)|(느려|끊겨|프레임|fps).*(게임|플레이)/i, ['game-debug']],
  [/게임|레벨|스테이지|난이도|밸런스|플레이어|보스|아이템|조작감|손맛|hud|점수판|three\.?js/i, ['game-design', 'game-gameplay', 'game-ui', 'game-qa']],
  [/버그|오류|에러|안\s?돼|안\s?됨|깨[져지졌]|실패|고쳐|문제/i, ['debugging-and-error-recovery']],
  [/화면|버튼|디자인|레이아웃|색|글꼴|모바일|휴대폰|페이지|ui|css|스타일|팝업|탭/i, ['ui-check', 'frontend-ui-engineering']],
  [/디자인|예쁘|다듬|개성|ai\s?티|뻔한/i, ['impeccable', 'unslop']],
  [/db|테이블|마이그레이션|supabase|rls|로그인|권한|토큰|결제|비밀/i, ['db-security-check', 'security-and-hardening']],
  [/여러\s?파일|구조|리팩|전체|정리|옮기/i, ['code-graph']],
  [/지도|floorplan|설계도/i, ['floorplan']],
  [/브라우저|스크린샷|자동\s?조작|크롤/i, ['agent-browser']],
  [/스킬.*(찾|있어)/, ['find-skills']],
  [/스킬.*(만들|고쳐|시험)/, ['skill-creator']],
];

/** 업무 글로 추천 스킬(저장소에 들어 있는 것만, 4개까지) */
export function suggestSkills(text: string, installed: string[]): string[] {
  const out: string[] = [];
  for (const [re, names] of SKILL_HINTS) if (re.test(text)) for (const n of names) if (!out.includes(n) && (!installed.length || installed.includes(n))) out.push(n);
  return out.slice(0, 4);
}

/** 소유자가 고른 스킬 → 지시서 규칙 한 줄(없으면 빈 목록) */
export function skillPickRule(skills: string[] | null | undefined): string[] {
  const list = [...new Set((skills ?? []).filter((n) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(n)))].slice(0, 12);
  return list.length ? [`소유자가 이 업무에 고른 스킬: ${list.join(', ')} — 시작할 때 이 스킬의 SKILL.md 절차를 먼저 따르고, 결과의 "쓴 스킬:" 줄에 적는다.`] : [];
}
