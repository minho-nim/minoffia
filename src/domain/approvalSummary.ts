// 승인 카드 요약(v0.7.23, 소유자 "뭐가 바뀌었나, 뭘 승인하나 보였으면 해. 사진? 그래프?"):
// 대화창 카드와 업무 카드에 같은 모양으로 넣는 칩·막대·"승인하면" 한 줄. 모두 규칙(모델 호출 없음), 있는 기록만 쓴다.
import { diffStats } from './fileTree';
import { mergeDanger } from './mergeDanger';
import type { PrCheck, ResultPackage, ResultReview } from './workflow-types';

export type ChipTone = 'ok' | 'warn' | 'bad' | 'plain';
export interface Chip {
  label: string;
  tone: ChipTone;
}

/** 승인 버튼을 누르면 일어나는 일(한 줄) */
export function afterApprove(gate: 'A' | 'B' | 'C', o: { repo?: boolean; picked?: string | null } = {}): string {
  if (gate === 'A') {
    const design = o.picked ? `, 고른 시안 ${o.picked}도 같이` : '';
    return o.repo === false ? `승인하면: 기획서를 확정해요(저장소가 없어 개발은 저장소를 연결한 뒤${design})` : `승인하면: 개발 AI에게 바로 맡겨요(실행 승인도 같이 기록${design})`;
  }
  if (gate === 'B') return '승인하면: 이 변경으로 PR을 열고 자동검사를 돌려요(운영 반영은 배포 승인 때)';
  return '승인하면: PR을 합치고 운영에 반영해요(되돌리려면 새 업무가 필요해요)';
}

/** 시험 로그에서 통과/전체 수(vitest·jest·mocha·pytest 모양). 못 찾으면 null */
export function testCount(log: string): { passed: number; total: number } | null {
  const vitest = log.match(/Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed(?:\s*\|\s*\d+\s+\w+)*\s*\((\d+)\)/);
  if (vitest) return { passed: Number(vitest[2]), total: Number(vitest[3]) };
  const jest = log.match(/Tests:\s+(?:(\d+)\s+failed,\s+)?(?:\d+\s+\w+,\s+)*(\d+)\s+passed,\s+(\d+)\s+total/);
  if (jest) return { passed: Number(jest[2]), total: Number(jest[3]) };
  const mocha = log.match(/(\d+)\s+passing/);
  if (mocha) {
    const failing = Number(log.match(/(\d+)\s+failing/)?.[1] ?? 0);
    return { passed: Number(mocha[1]), total: Number(mocha[1]) + failing };
  }
  const py = log.match(/=+\s*(?:(\d+)\s+failed,\s+)?(\d+)\s+passed/);
  if (py) return { passed: Number(py[2]), total: Number(py[2]) + Number(py[1] ?? 0) };
  return null;
}

/** 빌드 결과: 성공 흔적 true, 실패 흔적 false, 없으면 null */
export function buildOk(log: string): boolean | null {
  if (/build failed|error during build|빌드 실패|Build error/i.test(log)) return false;
  if (/✓ built in|built in \d|Compiled successfully|build (?:succeeded|passed|완료)|빌드 (?:통과|성공)/i.test(log)) return true;
  return null;
}

/** 바뀐 곳 표시: 화면만 / DB·서버 등(되돌리기 어려운 것) */
export function riskChip(diff: string): Chip | null {
  const files = diffStats(diff);
  if (!files.length) return null;
  const danger = mergeDanger(diff);
  if (danger.oneWay) return { label: `${danger.reasons.join('·')} 변경 있음`, tone: 'warn' };
  const screen = files.every((f) => /\.(tsx|jsx|vue|svelte|css|scss|html|svg|png|jpe?g|webp)$/i.test(f.path) || /(^|\/)(components|pages|app|views|styles|public)\//.test(f.path));
  return screen ? { label: '화면만 바뀜', tone: 'plain' } : { label: 'DB·서버 변경 없음', tone: 'plain' };
}

/** 결과 승인 칩: 시험·빌드·평가 평균·바뀐 곳 */
export function resultChips(r: ResultPackage, review?: ResultReview | null): Chip[] {
  const chips: Chip[] = [];
  const tc = testCount(r.testLog);
  if (tc) chips.push({ label: `시험 ${tc.passed}/${tc.total}${tc.passed === tc.total ? ' ✓' : ''}`, tone: tc.passed === tc.total && tc.total > 0 ? 'ok' : 'bad' });
  else if (!r.testLog.trim()) chips.push({ label: '시험 기록 없음', tone: 'warn' });
  const b = buildOk(r.testLog);
  if (b !== null) chips.push({ label: b ? '빌드 ✓' : '빌드 실패', tone: b ? 'ok' : 'bad' });
  const score = review?.total ?? null;
  if (score !== null) chips.push({ label: `평가 ${review?.panel && review.panel.length > 1 ? '평균 ' : ''}${score}점`, tone: score >= 80 ? 'ok' : 'warn' });
  // 화면 평가(v0.7.40): 미노가 찍은 결과 화면을 기획서와 견준 점수
  const sc = review?.screen;
  if (sc) chips.push({ label: sc.problems.length ? `화면 ${sc.score}점 · 고칠 곳 ${sc.problems.length}` : `화면 ${sc.score}점 ✓`, tone: sc.score >= 80 && !sc.problems.length ? 'ok' : sc.score >= 60 ? 'warn' : 'bad' });
  const risk = riskChip(r.diff);
  if (risk) chips.push(risk);
  return chips;
}

export interface FileBar {
  path: string;
  add: number;
  del: number;
  /** 가장 많이 바뀐 파일 대비 막대 길이(0~100) */
  addPct: number;
  delPct: number;
}

/** 바뀐 파일 막대(많이 바뀐 순, 최대 max개)와 합계 */
export function fileBars(diff: string, max = 6): { bars: FileBar[]; files: number; add: number; del: number; more: number } {
  const stats = diffStats(diff).sort((a, b) => b.add + b.del - (a.add + a.del));
  const top = stats.slice(0, max);
  const peak = Math.max(1, ...top.map((f) => f.add + f.del));
  return {
    bars: top.map((f) => ({ ...f, addPct: Math.round((100 * f.add) / peak), delPct: Math.round((100 * f.del) / peak) })),
    files: stats.length,
    add: stats.reduce((s, f) => s + f.add, 0),
    del: stats.reduce((s, f) => s + f.del, 0),
    more: Math.max(0, stats.length - max),
  };
}

const UI_CHECK = /ui-check/i;
/** 배포 승인 칩: PR 검사(verify 등)·UI 코드 검사 */
export function prChips(check: PrCheck | null): Chip[] {
  if (!check) return [{ label: 'PR 검사 확인 전', tone: 'warn' }];
  const chips: Chip[] = [];
  const state = check.ciState;
  chips.push({
    label: state === 'success' ? 'PR 검사 ✓' : state === 'failure' ? 'PR 검사 실패' : state === 'pending' ? 'PR 검사 중' : 'PR 검사 없음',
    tone: state === 'success' ? 'ok' : state === 'failure' ? 'bad' : 'warn',
  });
  const ui = check.checks.find((c) => UI_CHECK.test(c.name));
  if (ui) {
    const c = ui.conclusion;
    chips.push({ label: c === 'success' ? 'UI 검사 ✓' : c === 'neutral' || c === 'failure' ? 'UI 검사 알림 있음' : 'UI 검사 중', tone: c === 'success' ? 'ok' : 'warn' });
  }
  if (check.merged) chips.push({ label: '병합됨', tone: 'plain' });
  return chips;
}
