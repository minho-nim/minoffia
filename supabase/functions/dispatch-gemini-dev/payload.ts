// Gemini 개발 워크플로에 넘길 할 일(v0.4.82). 외부 의존 없음(Deno 함수와 vitest가 같이 쓴다).
// 워크플로(gemini-dev.yml)가 앞머리 규칙(범위·비밀값·시험·커밋 금지)을 붙이므로 여기서는 이 작업의 내용만 담는다.
import { rulesSection } from './projectRules.ts';
import { bugSteps, DEV_HABITS } from './devHabits.ts';

/** 워크플로 입력 하나에 넣을 수 있는 길이(GitHub workflow_dispatch 입력 전체 한도 안) */
export const MAX_INSTRUCTIONS = 20_000;

/** CLAUDE.md를 알아서 만들거나 맞춘다(앱 src/domain/handoffV2.ts의 CLAUDE_MD_SYNC와 같은 문장, 시험이 확인) */
export const CLAUDE_MD_SYNC =
  '- 저장소 루트에 CLAUDE.md가 없으면 만들고(위 "이 프로젝트에서 지켜야 할 것" 목록을 같은 제목의 절로), 있으면 그 절만 위 목록과 이번에 새로 적는 것에 맞춘다(절이 없으면 파일 끝에 추가). CLAUDE.md의 다른 부분은 바꾸지 않고, 이 변경도 같은 작업 브랜치에 함께 넣는다.';

export interface GeminiTaskInput {
  title: string;
  goal: string;
  finalPrompt: string;
  changeScope: string;
  preserve: string[];
  acceptance: string[];
  projectRules: string[];
}

/** ai/gemini/<업무 앞 8자>-<작업> (앱 codexBranch(task, item, 'gemini')·pr-status와 같은 규칙) */
export function geminiBranch(taskId: string, workItemId: string): string {
  const short = taskId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  const item = workItemId.replace(/[^a-z0-9-]/gi, '').toLowerCase();
  return `ai/gemini/${short}${item ? `-${item}` : ''}`;
}

export function buildGeminiTask(p: GeminiTaskInput): string {
  const lines = [
    `### ${p.title}`,
    p.goal || '',
    '',
    '### 승인된 기획서(수정 금지)',
    p.finalPrompt,
    p.changeScope ? `변경 범위: ${p.changeScope}` : '',
    '',
    p.preserve.length ? '### 유지 조건' : '',
    ...p.preserve.map((x) => `- ${x}`),
    '',
    p.acceptance.length ? '### 완료 기준' : '',
    ...p.acceptance.map((x) => `- ${x}`),
    '',
    ...rulesSection(p.projectRules),
    p.projectRules.length ? CLAUDE_MD_SYNC : '',
    '',
    // 저장소 지도는 워크플로가 만들어 앞에 붙인다(v0.4.96)
    '### 개발 습관(토큰·범위 아끼기)',
    ...DEV_HABITS.map((x) => `- ${x}`),
    ...bugSteps([p.title, p.goal, p.finalPrompt].join('\n')).map((l) => l.replace(/^## /, '### ')),
  ];
  const text = lines.filter((l, i, all) => !(l === '' && (i === 0 || all[i - 1] === ''))).join('\n').trim();
  return text.length > MAX_INSTRUCTIONS ? `${text.slice(0, MAX_INSTRUCTIONS - 20)}\n…(길어서 잘림)` : text;
}
