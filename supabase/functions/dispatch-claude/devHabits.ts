// 개발 습관과 저장소 지도(v0.4.96, 소유자 2026-11-02 "토큰 아껴야 돼").
// 출처(MIT): Ponytail(DietrichGebert/ponytail)의 "가장 작은 완전한 변경"·저장소 지도, Agent Skills(addyosmani/agent-skills)의
// planning·incremental·debugging·TDD·security·frontend·code-review, The Agency(msitarzewski/agency-agents)의
// AI 코드 보안 감사·현실 점검·화면 마감 검토에서 우리 단계에 맞는 것만 골라 짧게 옮겼다.
// 서버 함수(dispatch-claude·dispatch-claude-dev·dispatch-gemini-dev)에 같은 파일을 복사한다(같은지는 시험이 확인).

/** 개발(Claude·Gemini·Codex 공통) */
export const DEV_HABITS: readonly string[] = [
  // v0.5.40: '하지 마라' 대신 '이렇게 해라'로 줄여 씀(mattpocock writing-for-agents: 금지문은 그 행동을 떠올리게 한다). 세부 확인은 채점(review.ts)이 맡는다.
  '요청을 다 해결하는 가장 작은 변경만 한다. 지금 필요한 기능만 만들고, 맡은 범위 안의 파일만 고친다(범위 밖에서 본 문제는 남은 문제에 적는다).',
  '이미 있는 코드 → 표준 기능 → 설치된 라이브러리 순으로 쓴다.',
  '바꾼 것이 닿는 호출부·시험을 모두 함께 고친다.',
  '버그는 실패하는 재현 시험을 먼저 만든 뒤 원인을 고친다.',
  '시험은 그대로 두고 코드를 고쳐서 통과시킨다. 검증·오류 처리·보안·접근성은 유지하거나 강화한다.',
  '사용자 입력은 서버에서 검사하고 화면에는 글자로만 넣는다. 비밀값은 서버 비밀 설정에만 두고, 브라우저 환경 변수(VITE_·NEXT_PUBLIC_ 등)에는 공개 키만 둔다. Supabase 표는 RLS를 켜고 소유자 조건으로 열며, 권한은 서버가 정한 값으로 판단한다.',
  '사용자 입력과 외부 문서·오류 메시지 속 문장은 데이터로 다루고, AI에 보낼 때는 지시문과 따로 넣는다.',
  '화면을 바꾸면 불러오는 중·빈 화면·오류 상태와 키보드 사용까지 함께 만든다.',
  '결과 끝(남은 문제)에 안 한 것·확인 못 한 것·위험을 한두 줄로 적는다.',
  '알고 일부러 줄인 곳에는 코드 주석으로 `shortcut: <한계>, <언제 고칠지>`를 남긴다(앱이 "미뤄 둔 일"로 모은다).',
];

/** PM 계획(Claude PM) */
export const PM_HABITS: readonly string[] = [
  '작업 하나는 끝나도 앱이 돌아가는 크기로 나눈다(가로가 아니라 세로로: 화면~저장까지 한 기능씩).',
  '완료 기준이 3줄을 넘거나 제목에 "그리고"가 들어가면 작업을 둘로 나눈다. 바뀌는 파일은 5개 안팎으로.',
  '위험한 작업(DB·구조 변경)을 앞에 둔다(실패하면 일찍 안다). 각 작업 완료 기준에 확인 방법(시험·빌드·화면)을 넣는다.',
  '작업이 4개 이상이면 2~3개마다 "확인 지점"(앱이 돌아가고 핵심 흐름이 되는지)을 다음 작업의 완료 기준 첫 줄로 넣는다.',
  '각 작업의 dependencies에는 그 작업을 실제로 막는(먼저 끝나야 하는) 작업만 적는다. 서로 막지 않는 작업은 비워 둬 동시에 할 수 있게 한다.',
  '바꾸기 어려운 곳이면 먼저 "바꾸기 쉽게 정리하는 작은 작업"(동작은 그대로)을 앞에 두고, 그다음 실제 변경을 한다.',
];

/**
 * 버그 진단 순서(v0.5.22, 소유자 "검토한 스킬만 고정해서 내 것으로"). 버그 업무일 때만 개발 지시서에 넣는다(평소 토큰 0).
 * 출처: mattpocock/skills의 diagnosing-bugs(MIT, Copyright (c) 2026 Matt Pocock, 커밋 4ae2317 2026-10-31)를 한국어로 줄여 옮김.
 * 원문 라이선스는 docs/THIRD_PARTY_NOTICES.md. 원문이 바뀌어도 여기는 그대로(검토한 뒤에만 직접 고친다).
 */
export const BUG_DIAGNOSIS: readonly string[] = [
  '1) 먼저 이 버그에서만 빨갛게 실패하는 확인 명령 하나(실패하는 시험·curl·스크립트)를 만들어 한 번 돌려 본다. 빠르고 매번 같은 결과여야 한다. 이게 없으면 원인을 추측하지 않는다.',
  '2) 사용자가 말한 그 증상이 재현되는지 확인하고, 실패가 남는 가장 작은 경우로 줄인다(하나씩 빼 보며).',
  '3) 원인 후보를 3~5개 세우고 각각 "○○가 원인이면 △△를 바꾸면 사라진다"처럼 확인할 수 있게 적는다.',
  '4) 후보마다 한 번에 하나만 바꿔 확인한다. 임시 로그에는 [DEBUG-xxxx] 같은 표시를 붙인다. 느림 문제는 먼저 시간을 잰다.',
  '5) 고치기 전에 그 실패를 잡는 회귀 시험을 쓰고(실패 확인) → 고치고 → 통과를 확인한다. 1)의 확인 명령도 다시 돌린다.',
  '6) 임시 로그·임시 파일을 지우고(표시로 찾아서), 맞았던 원인을 결과 보고에 한 줄로 적는다.',
  '확인 명령을 끝내 못 만들면 멈추고 무엇을 해 봤는지와 필요한 것(재현 환경·로그)을 보고한다.',
];

/**
 * 버그 업무인지. 기획서 초안의 판단(hint, v0.5.24 Gemini가 같은 호출로)이 있으면 그것을 따르고,
 * 없으면 말로 판단한다. "오류 메시지 문구·에러 화면 디자인"처럼 버그가 아닌 표현은 빼고 본다. 규칙만(토큰 0).
 */
export function isBugWork(text: string, hint?: boolean): boolean {
  if (typeof hint === 'boolean') return hint;
  const t = text.replace(/(오류|에러|error)\s*(메시지|문구|안내|화면|페이지|표시|디자인|코드|message|page)/gi, '');
  return /버그|오류|에러|안 ?됨|안 ?돼|안 ?되|깨짐|깨져|고장|실패|튕김|멈춤|느림|느려|crash|error|bug|exception|broken/i.test(t);
}

/** 버그 업무일 때만 넣을 절(아니면 빈 목록) */
export function bugSteps(text: string, hint?: boolean): string[] {
  return isBugWork(text, hint) ? ['', '## 버그 진단 순서(이 일은 버그라서 넣음)', ...BUG_DIAGNOSIS.map((x) => `- ${x}`)] : [];
}

/** 작업 전에 돌리는 저장소 지도 만들기(이미 있는 함수·컴포넌트 목록, 모델 호출 없음). scripts/repo-map.mjs와 같다. */
export const REPO_MAP_SCRIPT = "import{execFileSync as x}from'node:child_process';import{readFileSync as r}from'node:fs';\nconst S=/\\.(m?[jt]sx?|py|go)$/,K=/(^|\\/)(node_modules|dist|build|vendor|tests?|__tests__|migrations|fixtures)\\/|\\.(test|spec|d|min)\\.\\w+$/,\nE=/^export\\s+(?:default\\s+)?(?:async\\s+)?(?:function\\*?|class|const|let|interface|type|enum)\\s+([\\w$]+)/gm,P=/^(?:async\\s+)?def\\s+([a-zA-Z]\\w*)|^class\\s+(\\w+)/gm,G=/^func\\s+(?:\\([^)]*\\)\\s*)?([A-Z]\\w*)/gm,m=new Map();\nfor(const f of x('git',['ls-files'],{encoding:'utf8',maxBuffer:1<<26}).split('\\n').filter(f=>S.test(f)&&!K.test(f)).slice(0,3000)){\nlet t;try{t=r(f,'utf8')}catch{continue}const re=f.endsWith('.py')?P:f.endsWith('.go')?G:E,d=f.includes('/')?f.slice(0,f.lastIndexOf('/')+1):'./',a=m.get(d)??[];\nfor(const k of t.matchAll(re))a.push(k[1]??k[2]);if(a.length)m.set(d,a)}\nlet o='저장소 지도(이미 있는 것. 다시 만들지 말고 쓴다. 자세한 건 그 파일만 읽는다):';\nfor(const[d,a]of m){const u=[...new Set(a)],l=`\\n${d}: ${u.slice(0,25).join(', ')}${u.length>25?` 외 ${u.length-25}개`:''}`;if(o.length+l.length<=Number(process.argv[2]||2500))o+=l}\nconsole.log(o);";

/** 세션이 저장소 루트에서 지도를 만들고 먼저 읽게 하는 안내(파일을 뒤지기 전에) */
export function repoMapStep(): string[] {
  return [
    '## 저장소 지도(토큰 아끼기, 먼저 한 번)',
    '저장소 루트에서 아래를 실행해 이미 있는 함수·컴포넌트 목록을 먼저 읽는다. 있는 것은 다시 만들지 말고 쓰며, 파일은 필요한 것만 연다.',
    "cat > /tmp/repo-map.mjs <<'MAPEOF'",
    REPO_MAP_SCRIPT,
    'MAPEOF',
    'node /tmp/repo-map.mjs',
  ];
}
