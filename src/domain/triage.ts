/**
 * 입력창(묻기·요청) 1차 분류. **규칙만** 쓴다(LLM 호출 없음).
 * - 앱 상태 질문 → 업무 기록으로 바로 답한다.
 * - 작업 요청 → 프로젝트를 추정해 "이 프로젝트 맞아요?"로 확인받은 뒤에만 업무로 접수한다.
 * - 일반 질문 → 사용자가 고르면 Gemini(무료)에게 묻거나 ChatGPT로 복사한다.
 * 개발 요청의 최종 의도 판단과 기획서는 지금처럼 ChatGPT가 한다(이 분류는 접수 전 1차 분류일 뿐).
 */
import { AGENT_BY_ID, AGENTS } from './agents';
import type { AgentId, Project, Snapshot, Task } from './types';
import { STATUS_LABEL } from './types';
import { remainingToday, runsToday } from './usage';
import { deriveWorkflow } from './workflow';
import { STAGE_LABEL, type Stage } from './workflow-types';

export type Triage =
  | { kind: 'status'; answer: string }
  | { kind: 'request'; candidates: Project[]; reason: string }
  /** "새 프로젝트 만들어줘": 업무가 아니라 프로젝트 만들기. 이름이 따옴표로 있으면 함께 */
  | { kind: 'new_project'; name: string | null }
  | { kind: 'question' }
  | { kind: 'unclear' };

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-./·]+/g, '');

/**
 * 흔한 낱말과 같은 프로젝트 이름은 문장에서 자동으로 짐작하지 않는다
 * ("새 프로젝트 만들어줘"를 '프로젝트' 프로젝트로 착각하지 않게). 목록에서 고르면 된다.
 */
const GENERIC_NAMES = new Set(
  ['프로젝트', 'project', '테스트', 'test', '시험', '앱', 'app', '웹', 'web', '사이트', 'site', '기능', '화면', '데모', 'demo', '업무', '작업', '새', 'new'].map(norm),
);

const NEW_PROJECT = /((새|신규|새로운)\s*프로젝트|프로젝트\s*(를|을)?\s*(새로|하나)?\s*(만들|생성|추가|시작))/;

/** 문장에 나온 프로젝트. 이름·저장소 이름이 들어 있으면 후보, 긴 이름이 먼저. */
export function matchProjects(text: string, projects: Project[]): Project[] {
  const t = norm(text);
  return projects
    .map((p) => {
      const keys = [p.name, p.repo?.split('/')[1] ?? ''].map(norm).filter((k) => k.length >= 2 && !GENERIC_NAMES.has(k));
      const hit = keys.filter((k) => t.includes(k)).sort((a, b) => b.length - a.length)[0];
      return hit ? { p, len: hit.length } : null;
    })
    .filter((x): x is { p: Project; len: number } => x !== null)
    .sort((a, b) => b.len - a.len)
    .map((x) => x.p);
}

const REQUEST = /(해\s?줘|해\s?주세요|해\s?줄래|만들어|추가|수정|고쳐|바꿔|변경|구현|개발|삭제|지워|넣어|빼\s?줘|적용|업데이트|올려|붙여|연결해|정리해|그려|설계해|작성해|테스트해|fix|add|implement|build|create|update|change|remove)/i;
const QUESTION = /(\?|뭐야|뭔가요|무엇|뭐가|뭘까|왜|어떻게|어때|어떤|알려\s?줘|설명|차이|추천|인가요|인가|일까|할까|나요|까요|가능해|되나|되요|돼\?|맞아|what|why|how|which|explain)/i;
const STATUS_WORDS = /(남은|남았|몇\s?번|사용량|한도|진행\s?중|하고\s?있|막힌|차단|승인\s?대기|기다리|대기\s?중|어디까지|상태|진행\s?상황|할\s?일|업무\s?몇|열린\s?업무)/;

const listTasks = (tasks: Task[], max = 5) =>
  tasks
    .slice(0, max)
    .map((t) => `· ${t.title} (${STATUS_LABEL[t.status]})`)
    .join('\n') + (tasks.length > max ? `\n· 외 ${tasks.length - max}건` : '');

function agentInText(text: string): AgentId | null {
  const lower = text.toLowerCase();
  const hit = AGENTS.find((a) => a.dailyCap !== null && (lower.includes(a.name.toLowerCase()) || lower.includes(a.id.toLowerCase())));
  return hit?.id ?? null;
}

/** 업무 기록으로 답할 수 있는 질문이면 답, 아니면 null */
export function answerStatus(text: string, snap: Snapshot, now: Date = new Date()): string | null {
  if (!STATUS_WORDS.test(text)) return null;
  const open = snap.tasks.filter((t) => t.status !== 'done');

  if (/(남은|남았|몇\s?번|사용량|한도)/.test(text)) {
    const one = agentInText(text);
    const agents = one ? [AGENT_BY_ID[one]] : AGENTS.filter((a) => a.dailyCap !== null);
    return (
      '오늘 실행 기록(KST) 기준입니다. 공급자의 실제 잔여 토큰은 알 수 없습니다.\n' +
      agents.map((a) => `· ${a.name}: ${runsToday(snap.usage, a.id, now)}/${a.dailyCap}회 사용, ${remainingToday(snap.usage, a.id, now)}회 남음`).join('\n')
    );
  }

  const projects = matchProjects(text, snap.projects);
  if (projects.length && /(어디까지|상태|진행\s?상황)/.test(text)) {
    const p = projects[0];
    const mine = snap.tasks.filter((t) => t.projectId === p.id);
    if (mine.length === 0) return `${p.name} 프로젝트에는 아직 업무가 없습니다.`;
    return `${p.name} 업무 ${mine.length}건:\n` + mine.slice(0, 6).map((t) => `· ${t.title} — ${STAGE_LABEL[deriveWorkflow(t, snap.workflow).stage]}`).join('\n');
  }

  if (/(승인\s?대기|기다리)/.test(text)) {
    const waiting: Stage[] = ['development_approval_pending', 'agent_handoff_pending', 'github_approval_pending', 'deployment_approval_pending'];
    const hits = open.filter((t) => waiting.includes(deriveWorkflow(t, snap.workflow).stage));
    return hits.length
      ? `승인을 기다리는 업무 ${hits.length}건:\n` + hits.map((t) => `· ${t.title} — ${STAGE_LABEL[deriveWorkflow(t, snap.workflow).stage]}`).join('\n')
      : '지금 승인을 기다리는 업무는 없습니다.';
  }
  if (/(막힌|차단)/.test(text)) {
    const hits = open.filter((t) => t.status === 'blocked');
    return hits.length ? `차단된 업무 ${hits.length}건:\n${listTasks(hits)}` : '차단된 업무는 없습니다.';
  }
  if (/(진행\s?중|하고\s?있)/.test(text)) {
    const hits = open.filter((t) => t.status === 'in_progress');
    return hits.length ? `진행 중인 업무 ${hits.length}건:\n${listTasks(hits)}` : '지금 진행 중인 업무는 없습니다.';
  }
  if (/(할\s?일|업무\s?몇|열린\s?업무|대기\s?중)/.test(text)) {
    return open.length ? `열린 업무 ${open.length}건:\n${listTasks(open)}` : '열린 업무가 없습니다.';
  }
  return null;
}

export function triage(text: string, snap: Snapshot, now: Date = new Date()): Triage {
  const s = text.trim();
  const status = answerStatus(s, snap, now);
  if (status) return { kind: 'status', answer: status };
  const isRequest = REQUEST.test(s);
  const isQuestion = QUESTION.test(s);
  // "알려줘·설명해줘"처럼 묻는 말이면서 '해줘'가 붙은 경우는 질문으로 본다.
  const explainOnly = /(알려|설명해|추천해|비교해)\s?(줘|주세요|줄래)/.test(s) && !/(만들어|추가|수정|고쳐|바꿔|구현|삭제|넣어|적용)/.test(s);
  if (isRequest && !explainOnly && NEW_PROJECT.test(s)) {
    const quoted = s.match(/["'“‘「]([^"'”’」]{1,60})["'”’」]/)?.[1]?.trim() ?? null;
    return { kind: 'new_project', name: quoted || null };
  }
  if (isRequest && !explainOnly) {
    const candidates = matchProjects(s, snap.projects);
    const reason = candidates.length ? `문장에 '${candidates[0].name}'이(가) 들어 있음` : '문장에 프로젝트 이름이 없음';
    return { kind: 'request', candidates, reason };
  }
  if (isQuestion || explainOnly) return { kind: 'question' };
  return { kind: 'unclear' };
}

/** 확인 질문에 글로 답한 경우: 'yes' | 'no' | null(판단 못 함) */
export function replyIntent(text: string): 'yes' | 'no' | null {
  const t = text.trim().toLowerCase().replace(/[.!~?\s]+$/g, '');
  if (/^(아니|아뇨|아니요|ㄴㄴ|ㄴ|no|nope|나중|나중에|괜찮아|됐어|취소|안\s?해|하지\s?마|싫어)/.test(t)) return 'no';
  if (/^(응|어|네|넵|예|ㅇㅇ|ㅇ|yes|y|ok|okay|오케이|좋아|그래|맞아|맞아요|만들어|만들기|만들어\s?줘|해\s?줘|해줘|진행|고고|ㄱㄱ|접수)/.test(t) || /(저장소\s?만들기|만들어\s?주세요)$/.test(t)) return 'yes';
  return null;
}

/** 업무 제목: 첫 줄을 60자로 */
export function titleFrom(text: string): string {
  const first = text.trim().split('\n')[0].replace(/\s+/g, ' ');
  return first.length > 60 ? `${first.slice(0, 59)}…` : first;
}

/** ChatGPT에 붙여넣을 질문(규칙·Gemini가 못 답할 때) */
export function chatGptQuestion(text: string): string {
  return ['아래 질문에 한국어로 답해 주세요. 개발 작업이 필요하면 어떤 작업인지만 정리해 주세요.', '', text.trim()].join('\n');
}
