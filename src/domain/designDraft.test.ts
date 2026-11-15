import { describe, expect, it } from 'vitest';
import { cleanFlow, cleanSvg, designHandoffSection, flowSteps, parseDesignReview, parseDraw, pickedDraft, type DesignDraft } from './designDraft';

const svg = '<svg viewBox="0 0 400 800"><rect x="0" y="0" width="400" height="60"/><text x="20" y="40" font-family="sans-serif">로그인</text></svg>';

describe('Gemini 시안', () => {
  it('SVG에서 실행·외부 불러오기를 지운다', () => {
    const bad = '<svg viewBox="0 0 10 10" onload="x()"><script>alert(1)</script><image href="https://e.com/a.png"/><foreignObject><div>x</div></foreignObject><a href="https://e.com"><text>t</text></a><rect style="fill:url(https://e.com/x)"/><rect fill="url(#g)"/></svg>';
    const s = cleanSvg(`설명 ${bad} 끝`)!;
    expect(s).not.toMatch(/script|onload|foreignObject|<image|<a\b|https:/i);
    expect(s).toContain('url(#g)');
    expect(s.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(cleanSvg('<div>no</div>')).toBeNull();
    expect(cleanSvg(`<svg>${'x'.repeat(70_000)}</svg>`)).toBeNull();
  });
  it('그리기 답을 읽는다(코드 블록·형식 틀림)', () => {
    const ok = parseDraw('```json\n' + JSON.stringify({ svg, flow: 'flowchart TD\nA[로그인] --> B[홈]', note: '버튼을 크게' }) + '\n```');
    expect(ok?.flow).toContain('A[로그인]');
    expect(ok?.note).toBe('버튼을 크게');
    expect(parseDraw(JSON.stringify({ svg, flow: '그냥 글', note: '' }))).toBeNull();
    expect(parseDraw('JSON 아님')).toBeNull();
  });
  it('흐름의 위험한 줄은 뺀다', () => {
    expect(cleanFlow('```mermaid\nflowchart TD\nA-->B\nclick A "https://e.com"\n```')).toBe('flowchart TD\nA-->B');
  });
  it('평가 점수는 항목 상한 안에서 합친다', () => {
    const r = parseDesignReview(JSON.stringify({ parts: { request: 99, ease: 20, mobile: 15, simple: -3 }, good: ['a'], fix: ['b', 'c'] }), 'B')!;
    expect(r.parts).toEqual({ request: 40, ease: 20, mobile: 15, simple: 0 });
    expect(r.total).toBe(75);
    expect(r.by).toBe('B');
    expect(parseDesignReview('{}', 'A')).toBeNull();
  });
  it('흐름을 단계 목록으로', () => {
    const s = flowSteps('flowchart TD\n  A[로그인 화면] --> B{비밀번호 맞음?}\n  B -->|예| C[홈]\n  B -->|아니오| A');
    expect(s).toEqual([
      { from: '로그인 화면', to: '비밀번호 맞음?', label: '' },
      { from: '비밀번호 맞음?', to: '홈', label: '예' },
      { from: '비밀번호 맞음?', to: '로그인 화면', label: '아니오' },
    ]);
  });
  it('마지막으로 고른 시안이 지시서에 붙는다', () => {
    const d = (id: string, who: 'A' | 'B'): DesignDraft => ({ id, taskId: 't', specRevision: 2, who, judge: '', svg, flow: 'flowchart TD\nA-->B', note: '설명', review: null, createdAt: '' });
    const drafts = [d('a', 'A'), d('b', 'B')];
    const picks = [
      { id: '1', taskId: 't', specRevision: 2, draftId: 'a', createdAt: '2026-11-15T01:00:00Z' },
      { id: '2', taskId: 't', specRevision: 2, draftId: 'b', createdAt: '2026-11-15T02:00:00Z' },
      { id: '3', taskId: 't', specRevision: 1, draftId: 'a', createdAt: '2026-11-15T03:00:00Z' },
    ];
    expect(pickedDraft(drafts, picks, 't', 2)?.id).toBe('b');
    expect(pickedDraft(drafts, picks, 't', 3)).toBeNull();
    expect(designHandoffSection(drafts[1])).toContain('고른 화면 시안(Gemini B)');
    expect(designHandoffSection(null)).toBe('');
  });
});
