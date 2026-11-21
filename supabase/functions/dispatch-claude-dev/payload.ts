// Claude 보조 개발 루틴에 보낼 지시문(외부 의존 없음: Deno 함수와 vitest가 같이 쓴다).
// v0.4.57(소유자 2026-11-01): 시험 뒤 작업 브랜치를 미리보기용으로 push한다(소유자가 데모를 눈으로 보고 승인). PR·병합·배포는 올리기 승인 뒤.
// 앞선 업무에서 AI가 적어 둔 "이 프로젝트에서 지켜야 할 것"을 함께 넣고, 새로 알게 된 것은 결과와 함께 적어 보내게 한다.
import { BASE_RULES, rulesAsk, rulesSection } from './projectRules.ts';
import { devGuide } from './devHabits.ts';

/** CLAUDE.md를 알아서 만들거나 맞춘다(v0.4.75). 앱 src/domain/handoffV2.ts의 CLAUDE_MD_SYNC와 같은 문장(시험이 확인) */
/** 쓴 토큰 세기(v0.7.84, v0.7.87 하위 작업 기록까지): 클라우드 루틴은 업무마다 새 컴퓨터라 ~/.claude/projects 아래 기록(*.jsonl, 하위 작업 파일 포함)이 모두 이 업무 것이다. 모두 더하고, 같은 메시지는 한 번만, 캐시 읽기는 뺀다 */
const TOKEN_COUNT_JS = [
  'const fs=require(\'fs\'),p=require(\'path\'),os=require(\'os\');const fl=[];const walk=(d)=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const q=p.join(d,e.name);if(e.isDirect',
  'ory())walk(q);else if(q.endsWith(\'.jsonl\'))fl.push(q)}};try{walk(p.join(os.homedir(),\'.claude\',\'projects\'))}catch{}const seen=new Map();for(const f of fl)for(const l of fs.readFile',
  'Sync(f,\'utf8\').split(\'\\n\')){try{const m=JSON.parse(l).message;if(m&&m.usage)seen.set(m.id||(f+seen.size),(m.usage.input_tokens||0)+(m.usage.output_tokens||0)+(m.usage.cache_creatio',
  'n_input_tokens||0))}catch{}}let t=0;for(const v of seen.values())t+=v;console.log(t||\'\')',
].join('');

export const CLAUDE_MD_SYNC =
  '- 저장소 루트에 CLAUDE.md가 없으면 만들고(위 "이 프로젝트에서 지켜야 할 것" 목록을 같은 제목의 절로), 있으면 그 절만 위 목록과 이번에 새로 적는 것에 맞춘다(절이 없으면 파일 끝에 추가). CLAUDE.md의 다른 부분은 바꾸지 않고, 이 변경도 같은 작업 브랜치에 함께 넣는다.';

/** 소유자 원문(v0.7.97 소유자 "개발 AI에 원문도 붙이기, 전화 게임 틈 막기"): 승인된 기획서가 기준이고 원문은 뜻 확인용. 기획서와 같거나 비면 넣지 않는다 */
export function originalSection(original: string | undefined | null, finalPrompt = ''): string[] {
  const t = (original ?? '').trim();
  if (!t || finalPrompt.includes(t)) return [];
  return ['', '## 소유자 원문 (참고용 — 승인된 기획서와 다르면 기획서를 따른다)', t.length > 2000 ? `${t.slice(0, 2000)}…` : t];
}

export interface DevPayloadInput {
  taskId: string;
  repo: string;
  projectName: string;
  specRevision: number;
  planRevision: number;
  finalPrompt: string;
  /** 소유자 원문(v0.7.97) */
  original?: string;
  changeScope: string;
  preserveConstraints: string;
  testCriteria: string;
  item: { id: string; title: string; goal: string; acceptance_tests: string[]; preserve_constraints: string[] };
  /** 기획서 초안의 버그 판단(v0.5.24, 없으면 말로) */
  bug?: boolean;
  /** 요청 자료(이름·역할·설명만) */
  attachments: string[];
  /** 승인된 견본(P) 목록 */
  prototypes: string[];
  /** 결과 자동 저장(v0.4.3): 이 작업 전용 1회용 제출표와 받는 주소. 없으면 결과는 마지막 메시지로만 */
  submit?: { url: string; token: string };
  /** 앞선 업무에서 AI가 적어 둔 이 프로젝트의 지켜야 할 것(v0.4.57) */
  projectRules?: string[];
  /** 저장소에 미노피아 작업 규칙 칸·개발 스킬이 있으면(v0.6.82) 고정 내용은 빼고 할 일만 */
  slim?: boolean;
  /** 브랜치 미리보기 주소(프로젝트에 미리보기 주소가 있을 때만) */
  previewUrl?: string;
}

/** ai/claude/<업무 앞 8자>-<작업> (Codex 브랜치와 같은 규칙) */
export function claudeBranch(taskId: string, workItemId: string): string {
  const short = taskId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  const item = workItemId.replace(/[^a-z0-9-]/gi, '').toLowerCase();
  return `ai/claude/${short}${item ? `-${item}` : ''}`;
}

export function buildDevPayload(p: DevPayloadInput): string {
  const tests = [...p.item.acceptance_tests, p.testCriteria].filter(Boolean);
  const keep = [p.preserveConstraints, ...p.item.preserve_constraints].filter(Boolean);
  const branch = claudeBranch(p.taskId, p.item.id);
  const rules = (p.projectRules ?? []).filter((r) => !p.slim || !BASE_RULES.includes(r));
  return [
    `MinLab AI Office 보조 개발 (업무 ID ${p.taskId} / 작업 ${p.item.id})`,
    `저장소: ${p.repo}`,
    `프로젝트: ${p.projectName}`,
    `기획서 v${p.specRevision}(A 승인) · 계획 v${p.planRevision}(이 작업 E 승인)`,
    `작업 브랜치: ${branch}`,
    '',
    `## 할 일: ${p.item.title}`,
    p.item.goal || p.item.title,
    '',
    '## 승인된 기획서 (수정 금지)',
    p.finalPrompt,
    p.changeScope ? `변경 범위: ${p.changeScope}` : '',
    ...originalSection(p.original, p.finalPrompt),
    '',
    keep.length ? '## 유지 조건' : '',
    ...keep.map((x) => `- ${x}`),
    '',
    tests.length ? '## 완료 기준' : '',
    ...tests.map((x) => `- ${x}`),
    '',
    p.attachments.length ? `## 요청 자료 ${p.attachments.length}개 (이 세션에서는 볼 수 없음. 내용을 추측하지 않는다)` : '',
    ...p.attachments,
    '',
    p.prototypes.length ? '## 승인된 견본 (P 승인 · 화면 구성·흐름을 보존하며 통합)' : '',
    ...p.prototypes,
    '',
    ...rulesSection(rules),
    '',
    ...devGuide([p.item.title, p.item.goal, p.finalPrompt].join('\n'), p.bug, p.slim === true),
    '',
    '## 규칙',
    '- 최신 main에서 위 작업 브랜치를 만들어 그 안에서만 작업한다. 지시 범위 밖 파일은 바꾸지 않는다.',
    '- 저장소가 정한 시험(typecheck·test·build 등)을 돌리고 결과를 줄이지 말고 그대로 보고한다.',
    `- **미리보기 push(소유자 승인 2026-11-01)**: 시험을 돌린 뒤 커밋하고 이 작업 브랜치만 \`git push --force-with-lease -u origin ${branch}\`로 올린다. 소유자가 미리보기로 화면을 직접 보고 올리기 승인(B)을 한다.${p.previewUrl ? ` 미리보기 주소: ${p.previewUrl}` : ''}`,
    '- **PR·병합·배포는 하지 않는다.** main이나 다른 브랜치에 push하지 않는다. PR은 올리기 승인 뒤 서버가 따로 시킨다.',
    ...(rules.length ? [CLAUDE_MD_SYNC] : []),
    '- 비밀키·토큰·.env 내용을 출력하거나 커밋하지 않는다. 유료 API를 쓰지 않는다. Codex CLI·Grok CLI를 설치하지 않는다.',
    '- 할 일이 불분명하면 코드를 바꾸지 말고 확인 질문만 남긴다.',
    '',
    '## 마지막 메시지(결과 보고, AI Office 결과 패키지로 옮긴다)',
    '1. 요약(한두 줄) 2. 바뀐 파일 목록 3. `git diff main...HEAD` 전체 4. 시험 명령과 결과 그대로 5. 남은 문제',
    '',
    '## 쓴 토큰(요약 맨 끝 한 줄)',
    '결과를 보내기 직전에 아래를 한 번 실행해 이 세션이 쓴 토큰(입력·출력·캐시 쓰기, 캐시 읽기 제외)을 센다. 숫자가 나오면 요약 맨 끝에 "쓴 토큰: <숫자>" 한 줄을 적고, 빈 줄이면 적지 않는다(지어내지 않는다).',
    `node -e "${TOKEN_COUNT_JS}"`,
    ...(p.submit
      ? [
          '',
          '## 결과 보내기(자동 저장, 필수)',
          `시험과 미리보기 push까지 끝나면 저장소 밖 /tmp/result-submit.json 에 {"task_id":"${p.taskId}","token":"${p.submit.token}","result":{"summary":"<요약>","changed_files":["<경로>"],"diff":"<git diff main...HEAD 전체>","test_log":"<시험 명령과 결과 그대로>","remaining_issues":"<남은 문제, 없으면 빈 문자열>","branch":"${branch}","preview_pushed":<push가 성공했으면 true, 아니면 false>,"screen":"<바뀐 화면을 여는 주소 경로(예: /stats, #/stats). 첫 화면이면 /, 화면 변경이 없으면 빈 문자열>","project_rules":[]}} 를 JSON으로 저장하고(문자열은 JSON 이스케이프) 아래를 한 번 실행한다.`,
          rulesAsk('project_rules'),
          `curl -sS -X POST '${p.submit.url}' -H 'content-type: application/json' --data-binary @/tmp/result-submit.json`,
          '- 이 token은 이 작업의 결과 제출 전용(24시간, 3번까지)이다. 다른 곳에 쓰거나 파일·커밋에 남기지 않는다.',
          '- 응답이 {"ok":true,...}가 아니거나 접속이 막히면 응답(또는 오류)을 한 줄로 보고한다. 결과를 고쳐 다시 보낼 때만 재시도한다.',
          '- 보낸 뒤에도 위 형식의 마지막 메시지는 그대로 남긴다(사용자가 직접 옮길 수 있게).',
        ]
      : []),
  ]
    .filter((l, i, all) => !(l === '' && (i === 0 || all[i - 1] === '')))
    .join('\n')
    .slice(0, 65_000);
}
