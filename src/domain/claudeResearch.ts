// Claude 웹 조사(v0.7.11, 소유자 "Exa 검색이 안 되면 클로드로"): Exa가 안 됐을 때 누르면 Claude가 웹 검색해 답을 보낸다.
// 답은 서버 표(claude_research)에 오고, 대화창은 아직 띄우지 않은 답만 한 번씩 띄운다(규칙, 모델 호출 없음).
import type { Source } from './research';

export interface ClaudeResearch {
  id: string;
  question: string;
  status: 'pending' | 'done' | 'failed';
  answer: string;
  sources: Source[];
  sessionUrl: string | null;
  expiresAt: string;
  createdAt: string;
}

/** 대화창에 아직 안 띄운 끝난 조사(최근 2일, 오래된 것부터) */
export function unannounced(rows: ClaudeResearch[], announced: Set<string>, now = Date.now()): ClaudeResearch[] {
  return rows
    .filter((r) => r.status !== 'pending' || Date.parse(r.expiresAt) < now)
    .filter((r) => !announced.has(r.id) && now - Date.parse(r.createdAt) < 2 * 86400_000)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** 대화창에 띄울 글 */
export function researchMessage(r: ClaudeResearch): string {
  const q = r.question.length > 40 ? `${r.question.slice(0, 39)}…` : r.question;
  if (r.status === 'done') return `[웹 조사: ${q}]\n${r.answer}`;
  if (r.status === 'failed') return `Claude 웹 조사를 하지 못했어요(${q}): ${r.answer || '이유 모름'}`;
  return `Claude가 시간 안에 답을 보내지 않았어요(${q}). 다시 눌러 보거나 업무로 만들어 주세요.`;
}
