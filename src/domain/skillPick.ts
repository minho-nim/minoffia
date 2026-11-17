// 개발 스킬 고르기(v0.7.0, 소유자 "개발할 때 스킬을 쓸까요? 물어보고, 대화에서 고르면 그걸 참고해서 시작"):
// 업무 글에서 규칙으로 알맞은 스킬을 추천하고(AI 호출 없음), 소유자가 고른 스킬은 지시서 규칙에 한 줄로 넣는다.
// skillPickRule은 서버 함수(codex-linear·dispatch-claude-dev)의 skillPick.ts에 그대로 복사돼 있다(같은지는 시험이 확인).

/** 글에 이런 말이 있으면 이 스킬을 추천(앞쪽이 먼저) */
export const SKILL_HINTS: [RegExp, string[]][] = [
  // 게임(v0.7.46 소유자 "게임 관련으로 묶어서"): 게임 업무면 게임 스킬을 먼저(그 저장소에 들어 있을 때만 추천됨)
  [/(게임|플레이).*(느려|끊겨|프레임|fps|빈\s?화면)|(느려|끊겨|프레임|fps).*(게임|플레이)/i, ['game-debug']],
  // v0.7.48 게임 밸런스·플레이 기록: 숫자·난이도 이야기면 밸런스, 해 본 소감·플레이 테스트면 기록 정리를 먼저
  [/밸런스|난이도|너무\s?(쉬|어려)|점수.*(불어|너무|안\s?올라)/i, ['game-balance']],
  [/플레이\s?테스트|(게임|플레이).*(해\s?보니|해\s?봤|소감|후기)/i, ['game-playtest']],
  [/게임|레벨|스테이지|난이도|밸런스|플레이어|보스|아이템|조작감|손맛|hud|점수판|three\.?js/i, ['game-design', 'game-gameplay', 'game-ui', 'game-qa']],
  [/버그|오류|에러|안\s?돼|안\s?됨|깨[져지졌]|실패|고쳐|문제/i, ['debugging-and-error-recovery']],
  // v0.7.48 소유자 "AI 느낌 나는 UI는 싫어": 새 화면은 hallmark, 움직임은 emil-design-eng, 규칙 점검은 web-design-guidelines
  [/새\s?(화면|페이지)|랜딩|처음부터.*(화면|디자인)|홈\s?화면.*(만들|새로)/i, ['hallmark']],
  [/애니메이션|움직임|전환|모션|눌림|손맛/i, ['emil-design-eng']],
  [/접근성|키보드|라벨|화면\s?(검토|점검)|ui\s?(검토|리뷰)/i, ['web-design-guidelines']],
  [/화면|버튼|디자인|레이아웃|색|글꼴|모바일|휴대폰|페이지|ui|css|스타일|팝업|탭/i, ['ui-check', 'frontend-ui-engineering']],
  [/디자인|예쁘|다듬|개성|ai\s?티|뻔한/i, ['impeccable', 'unslop']],
  // 깊은 보안 감사는 소유자가 요청할 때만(토큰을 많이 씀)
  [/보안\s?감사|취약점\s?(전체|전부|점검)|침투\s?(시험|테스트)/i, ['security-audit']],
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
