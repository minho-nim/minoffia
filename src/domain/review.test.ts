import { describe, expect, it } from 'vitest';
import { averageScores, buildReviewPrompt, changedFiles, needsSecondOpinion, parseScore, redoFeedback, ruleCheck, total, verdictOf, type Score } from './review';

const diff = ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@', '-old', '+new'].join('\n');
const passLog = ' Test Files  3 passed (3)\n      Tests  20 passed (20)\n✓ built in 1.2s';
const score = (p: Partial<Score['parts']> = {}, extra: Partial<Score> = {}): Score => ({
  parts: { acceptance: 36, spec: 22, constraints: 15, scope: 9, quality: 8, ...p },
  criteria: [{ text: '버튼이 초록', status: 'met', evidence: 'src/a.ts' }],
  violations: [],
  fixes: [],
  summary: '',
  ...extra,
});

describe('결과 평가 1단계: 규칙 검사', () => {
  it('정상 결과는 막히는 것이 없다', () => {
    const g = ruleCheck({ diff, testLog: passLog, changeScope: 'src/a.ts' });
    expect(g.filter((x) => !x.ok)).toEqual([]);
    expect(changedFiles(diff)).toEqual(['src/a.ts']);
  });
  it('시험 실패·로그 없음·빈 diff·비밀값은 막는다', () => {
    expect(ruleCheck({ diff, testLog: ' FAIL  src/a.test.ts\nTests  1 failed | 3 passed', changeScope: '' }).find((x) => x.id === 'tests')?.ok).toBe(false);
    expect(ruleCheck({ diff, testLog: '', changeScope: '' }).find((x) => x.id === 'tests')?.ok).toBe(false);
    expect(ruleCheck({ diff: '', testLog: passLog, changeScope: '' }).find((x) => x.id === 'diff')?.ok).toBe(false);
    const leak = diff + '\n+const KEY = "sk-abcdefghijklmnopqrstuvwxyz123456"';
    const s = ruleCheck({ diff: leak, testLog: passLog, changeScope: '' }).find((x) => x.id === 'secrets')!;
    expect(s.ok).toBe(false);
    expect(s.detail).not.toContain('abcdefghijklmnop');
  });
  it('"0 failed"는 실패가 아니다', () => {
    expect(ruleCheck({ diff, testLog: 'Tests 5 passed, 0 failed', changeScope: '' }).find((x) => x.id === 'tests')?.ok).toBe(true);
  });
  it('범위 밖 파일·지운 시험은 경고(막지는 않음)', () => {
    const d = diff + '\ndiff --git a/README.md b/README.md\n+x\ndiff --git a/src/b.test.ts b/src/b.test.ts\ndeleted file mode 100644\n-x';
    const g = ruleCheck({ diff: d, testLog: passLog, changeScope: 'src/a.ts만' });
    expect(g.find((x) => x.id === 'scope')).toMatchObject({ ok: false, blocking: false });
    expect(g.find((x) => x.id === 'risky')?.detail).toContain('src/b.test.ts');
  });
});

describe('결과 평가 2단계: 점수와 판정', () => {
  it('JSON 점수를 읽고 배점을 넘지 않게 자른다', () => {
    const s = parseScore('```json\n{"parts":{"acceptance":99,"spec":20,"constraints":15,"scope":10,"quality":-3},"criteria":[{"text":"a","status":"partial","evidence":"x"}],"violations":[],"fixes":["b"]}\n```')!;
    expect(s.parts).toEqual({ acceptance: 40, spec: 20, constraints: 15, scope: 10, quality: 0 });
    expect(total(s)).toBe(85);
    expect(parseScore('아무 말')).toBeNull();
  });
  it('80점 이상·위반 없음이면 통과, 아니면 다시 개발(2번까지), 그다음은 사장님', () => {
    const gates = ruleCheck({ diff, testLog: passLog, changeScope: '' });
    expect(verdictOf(gates, score(), 0).verdict).toBe('pass');
    expect(verdictOf(gates, score({ acceptance: 10 }), 0).verdict).toBe('redo');
    expect(verdictOf(gates, score({}, { violations: ['결제 기능 추가'] }), 1).verdict).toBe('redo');
    expect(verdictOf(gates, score({ acceptance: 10 }), 2).verdict).toBe('owner');
    expect(verdictOf(gates, null, 0).verdict).toBe('owner');
    const blocked = ruleCheck({ diff: '', testLog: passLog, changeScope: '' });
    expect(verdictOf(blocked, null, 0).verdict).toBe('redo');
  });
  it('경계 점수면 한 번 더, 평균 낸다', () => {
    expect(needsSecondOpinion(score())).toBe(false);
    expect(needsSecondOpinion(score({ acceptance: 25 }))).toBe(true);
    expect(total(averageScores(score({ acceptance: 20 }), score({ acceptance: 30 })))).toBe(79);
  });
  it('다시 개발 요청 글에는 고칠 것만', () => {
    const s = score({ acceptance: 10 }, { criteria: [{ text: '모바일 넘침 없음', status: 'unmet', evidence: '' }], fixes: ['400px에서 표 줄이기'] });
    const t = redoFeedback(ruleCheck({ diff, testLog: passLog, changeScope: '' }), s, ['점수 64점(통과 80점)']);
    expect(t).toContain('[자동 평가]');
    expect(t).toContain('미충족: 모바일 넘침 없음');
    expect(t).toContain('400px에서 표 줄이기');
    expect(t).not.toContain('버튼이 초록');
  });
  it('평가 자료는 길면 자르고 지켜야 할 것을 넣는다', () => {
    const p = buildReviewPrompt({ finalPrompt: 'x', changeScope: '', preserveConstraints: '', testCriteria: '', item: null, projectRules: ['결제 없음'], gates: [], diff: 'd'.repeat(70000), testLog: '', remainingIssues: '' });
    expect(p).toContain('- 결제 없음');
    expect(p).toContain('…(뒤는 길어서 잘림)');
    expect(p.length).toBeLessThan(62000);
  });
});

describe('지켜야 할 것 자동 검사(v0.5.76)', () => {
  it('금지는 다시 개발, 주의는 경고만, 파일 규칙은 바뀐 파일로', async () => {
    const { parseRuleChecks, ruleCheck } = await import('./review');
    expect(parseRuleChecks(['금지: console.log', '주의 파일: CLAUDE.md', '버튼은 크게'])).toHaveLength(2);
    const diff = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n+console.log(1)\ndiff --git a/CLAUDE.md b/CLAUDE.md\n--- /dev/null\n+++ b/CLAUDE.md\n+규칙';
    const g = ruleCheck({ diff, testLog: 'ok', changeScope: '', rules: ['금지: console.log', '주의 파일: CLAUDE.md', '금지: debugger'] }).find((x) => x.id === 'rules')!;
    expect(g.ok).toBe(false);
    expect(g.blocking).toBe(true);
    expect(g.detail).toContain('금지: console.log');
    expect(g.detail).toContain('주의 파일: CLAUDE.md');
    const warnOnly = ruleCheck({ diff, testLog: 'ok', changeScope: '', rules: ['주의: console.log'] }).find((x) => x.id === 'rules')!;
    expect(warnOnly.blocking).toBe(false);
    expect(ruleCheck({ diff, testLog: 'ok', changeScope: '', rules: ['버튼은 크게'] }).some((x) => x.id === 'rules')).toBe(false);
  });
});

describe('근거 없는 지적·꼭 완료 기준(v0.5.80)', () => {
  it('근거 없는 충족은 일부만, 근거 없는 위반은 고칠 점으로', async () => {
    const { parseScore } = await import('./review');
    const s = parseScore(JSON.stringify({ parts: { acceptance: 30, spec: 20, constraints: 15, scope: 10, quality: 10 },
      criteria: [{ text: '(꼭) 버튼 16px', status: 'met', evidence: '' }, { text: '(좋음) 그림자', status: 'met', evidence: 'src/a.tsx:12' }],
      violations: ['범위 밖 파일 수정', '`CLAUDE.md` 추가'], fixes: [] }))!;
    expect(s.criteria.map((c) => c.status)).toEqual(['partial', 'met']);
    expect(s.violations).toEqual(['`CLAUDE.md` 추가']);
    expect(s.fixes).toContain('(근거 없음) 범위 밖 파일 수정');
  });
  it('(꼭) 기준이 미충족이면 점수와 상관없이 다시 개발', async () => {
    const { mustCriterion, verdictOf } = await import('./review');
    expect(mustCriterion('R1. (꼭) 버튼 16px')).toBe(true);
    expect(mustCriterion('- (필수) 버튼 16px')).toBe(true);
    expect(mustCriterion('(권장) 그림자')).toBe(false);
    expect(mustCriterion('● 버튼 16px')).toBe(true);
    expect(mustCriterion('◐ 그림자')).toBe(false);
    expect(mustCriterion('(좋음) 그림자')).toBe(false);
    const score = { parts: { acceptance: 40, spec: 25, constraints: 15, scope: 10, quality: 10 }, criteria: [{ text: 'R1 (꼭) 버튼 16px', status: 'unmet' as const, evidence: '' }], violations: [], fixes: [], summary: '' };
    const v = verdictOf([], score, 0);
    expect(v.verdict).toBe('redo');
    expect(v.reasons[0]).toContain('필수 완료 기준 미충족');
  });
});

import { ranChecks, repeatedIssues, slimLog } from './review';
describe('채점 보강(v0.5.93)', () => {
  const ok = { acceptance: 40, spec: 25, constraints: 15, scope: 10, quality: 10 };
  const s = { parts: ok, criteria: [], violations: [], fixes: [], summary: '' } as unknown as Parameters<typeof verdictOf>[1];
  it('시험·화면 확인 기록이 없으면 통과로 단정하지 않는다', () => {
    expect(ranChecks('(시험 로그 없음)')).toBe(false);
    expect(ranChecks('## npm run test\n3 passed')).toBe(true);
    expect(verdictOf([], s, 0, { executed: false }).verdict).toBe('owner');
    expect(verdictOf([], s, 0, { executed: true }).verdict).toBe('pass');
  });
  it('지난번과 같은 지적이 또 나오면 자동 다시 개발 대신 사장님께', () => {
    const bad = { ...s, violations: ['CLAUDE.md를 만들었음'] } as typeof s;
    expect(verdictOf([], bad, 0).verdict).toBe('redo');
    expect(verdictOf([], bad, 0, { previousReasons: ['위반: CLAUDE.md를 만들었음'] }).verdict).toBe('owner');
    expect(repeatedIssues(['점수 60점(통과 80점)'], ['점수 60점(통과 80점)'])).toEqual([]);
  });
  it('시험 로그는 색 코드·통과 줄·반복 줄을 빼고 줄인다', () => {
    const log = '\x1b[32m✓ a\x1b[0m\n✓ b\nFAIL x\nFAIL x\nError: boom';
    expect(slimLog(log)).toBe('FAIL x\nError: boom');
    expect(slimLog('x'.repeat(10000) + '\nend', 300).length).toBeLessThan(400);
  });
  it('CLAUDE.md(지켜야 할 것 절)는 범위 밖으로 보지 않는다(v0.6.34)', () => {
    const diff = ['diff --git a/CLAUDE.md b/CLAUDE.md', '+++ b/CLAUDE.md', '+- 규칙', 'diff --git a/README.md b/README.md', '+++ b/README.md', '+한 줄'].join('\n');
    const g = ruleCheck({ diff, testLog: 'npm test 통과', changeScope: 'README.md' }).find((x) => x.id === 'scope');
    expect(g?.ok).toBe(true);
  });
});
