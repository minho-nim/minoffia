// 작은 일은 PM 없이 바로 배정(v0.5.20, 소유자 2026-11-03 "Claude 한도가 차도 업무가 안 멈추게").
// Gemini 기획서 초안이 같은 호출로 매긴 크기 힌트 + 규칙 검사(토큰 0)를 모두 지나야 작은 일이다. 하나라도 걸리면 PM이 나눈다.
// 바로 배정해도 실행 승인(E)은 그대로 소유자가 하고, 업무 카드의 'PM에게 나눠 맡기기'로 되돌릴 수 있다.
import { requirementLines } from './requirements';
import type { AssigneePreference, TaskSpec } from './workflow-types';

/** 이 저장소(AI Office 자신)에는 Gemini 개발을 쓰지 않는다(dispatch-claude와 같은 규칙) */
export const OFFICE_REPO = 'minho-nim/minoffia';
/** 이 저장소의 옛 이름과 새 이름(미노피아로 바꾸는 동안 둘 다, v0.5.44) */
export const OFFICE_REPOS = ['minho-nim/minlab-ai-office', 'minho-nim/minoffia'];

/** 실수하면 되돌리기 어려운 일: 이런 말이 기획서에 있으면 PM이 나눈다 */
const RISKY: [RegExp, string][] = [
  [/DB|데이터베이스|마이그레이션|스키마|테이블|supabase|sql/i, 'DB'],
  [/로그인|인증|권한|auth|RLS|비밀번호/i, '로그인·권한'],
  [/결제|payment|구독/i, '결제'],
  [/배포|deploy|CI|워크플로|workflow|github actions/i, '배포·CI'],
  [/비밀값|비밀 키|API ?키|secret|token|토큰/i, '비밀값'],
  [/데이터 ?삭제|기록 ?삭제|전부 ?삭제|delete all|drop/i, '데이터 삭제'],
  [/외부 API|API 연동|연동|webhook|웹훅/i, '외부 연동'],
  [/리팩터|리팩토|구조 ?변경|구조를 바꾸|아키텍처|refactor/i, '구조 변경'],
  [/전체 화면|모든 화면|모든 페이지|앱 전체|전부 바꾸/i, '전체 화면'],
];

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean).length;

export type SmallCheck = { ok: true; preference: AssigneePreference; difficulty: number } | { ok: false; why: string[] };

/**
 * 작은 일인지 본다. 이유를 모두 모아 알려 준다(업무 카드에 'PM에게 보낸 이유'로 쓸 수 있게).
 * away: 휴가 중(codex = Codex, gemini = Studio A·B 둘 다). repo: 프로젝트 저장소(owner/repo).
 */
export function checkSmallTask(
  spec: TaskSpec,
  repo: string | null | undefined,
  away: { codex?: boolean; gemini?: boolean; claude?: boolean } = {},
  /** @이름으로 지정한 AI(v0.5.46). 휴가가 아니고 이 저장소에 쓸 수 있으면 먼저 쓴다 */
  want?: AssigneePreference | null,
): SmallCheck {
  const why: string[] = [];
  const h = spec.sizeHint;
  if (spec.intent !== 'change_request') why.push('개발·수정 요청이 아님');
  if (!h) why.push('크기 힌트 없음');
  else {
    if (h.difficulty > 5) why.push(`난이도 ${h.difficulty}`);
    if (!h.single_task) why.push('작업 여러 개');
    if (h.needs_design) why.push('새 디자인 필요');
  }
  if (lines(spec.changeScope) > 3) why.push('바꿀 범위가 김');
  // v0.6.18(소유자 "복잡하네"): 기준 5~6줄(필수·권장·선택 태그로 늘어난 것)도 작업 하나로. 7줄부터 PM이 나눈다
  if (lines(spec.testCriteria) > 6) why.push('확인할 것이 많음');
  const text = [spec.finalPrompt, spec.changeScope].join('\n');
  for (const [re, label] of RISKY) if (re.test(text)) why.push(label);
  if (!repo || !repo.includes('/')) why.push('저장소 없음');
  const geminiOk = !away.gemini && !OFFICE_REPOS.includes(repo?.toLowerCase() ?? '');
  const wantOk =
    want === 'gemini_dev' ? geminiOk : want === 'codex_primary' ? !away.codex : want === 'claude_support' ? !away.claude : false;
  // v0.6.19(소유자 "Codex 주, Claude 보조"): 개발은 Codex, Codex가 휴가면 Claude, 둘 다면 쉬운 일만 Gemini
  const preference: AssigneePreference | null = wantOk && want
    ? want
    : !away.codex ? 'codex_primary' : !away.claude ? 'claude_support' : null; // v0.6.23: Gemini 개발은 @Gemini로 정할 때만
  if (!preference) why.push('맡을 AI가 휴가');
  if (why.length || !h || !preference) return { ok: false, why: [...new Set(why)] };
  return { ok: true, preference, difficulty: h.difficulty };
}

/** 작은 일 계획(작업 하나). PM 계획과 같은 형식이라 parsePmPlan·실행 승인(E) 흐름을 그대로 탄다. */
export function smallPlanText(taskId: string, repo: string, spec: TaskSpec, check: Extract<SmallCheck, { ok: true }>): string {
  const split = (s: string) => s.split('\n').map((l) => l.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean);
  return JSON.stringify({
    task_id: taskId,
    repository: repo,
    target_base_revision: '',
    plan_revision: 1,
    status: 'planned',
    development_mode: 'direct',
    mode_reason: `작은 일(난이도 ${check.difficulty}, 작업 하나)이라 규칙이 바로 배정`,
    questions: [],
    work_items: [
      {
        id: 'W1',
        title: spec.finalPrompt.split('\n')[0].slice(0, 80) || '작은 수정',
        goal: spec.finalPrompt.slice(0, 4000),
        dependencies: [],
        assignee_preference: check.preference,
        execution_mode: 'manual_handoff',
        acceptance_tests: split(spec.testCriteria),
        preserve_constraints: split(spec.preserveConstraints),
        attachment_refs: [],
        requires_execution_approval: true,
        difficulty: check.difficulty,
        difficulty_reason: '기획서 초안의 크기 힌트',
        // 작업 하나가 모든 요구사항을 맡는다(v0.5.39)
        covers: requirementLines(spec.testCriteria).map((_, i) => `R${i + 1}`),
      },
    ],
  });
}
