import { describe, expect, it } from 'vitest';
import { matchRoutedProject, parseRouted, parseRoutedAll } from './aiRoute';
import type { Project } from './types';

const P = (name: string): Project => ({ id: name, name, repo: null, description: '', createdAt: '' });

describe('AI 판단 머리 읽기', () => {
  it('질문이면 둘째 줄부터 답', () => {
    expect(parseRouted('@@질문\nuseEffect는 …')).toEqual({ ready: true, kind: 'question', project: null, body: 'useEffect는 …' });
  });
  it('업무면 프로젝트 이름을 꺼낸다', () => {
    const r = parseRouted("@@업무 'MuscleMap'\n다크 모드 추가 요청");
    expect(r.kind).toBe('task');
    expect(r.project).toBe('MuscleMap');
    expect(r.body).toBe('다크 모드 추가 요청');
  });
  it('업무인데 프로젝트를 모르면 null', () => {
    expect(parseRouted('@@업무 없음\n새 앱').project).toBeNull();
  });
  it('애매하면 확인 질문을 본문으로', () => {
    expect(parseRouted('@@애매\n어느 쪽인가요?')).toMatchObject({ kind: 'ambiguous', body: '어느 쪽인가요?' });
  });
  it('머리 줄이 끝나기 전에는 기다린다', () => {
    expect(parseRouted('@@업').ready).toBe(false);
    expect(parseRouted('@').ready).toBe(false);
  });
  it('머리가 없으면 그냥 질문 답으로 본다', () => {
    expect(parseRouted('안녕하세요')).toMatchObject({ ready: true, kind: 'question', body: '안녕하세요' });
  });
});

describe('AI가 고른 프로젝트 맞추기', () => {
  const ps = [P('MuscleMap'), P('MinLab'), P('Crossroads')];
  it('대소문자·공백을 무시하고 맞춘다', () => {
    expect(matchRoutedProject('muscle map', ps)?.name).toBe('MuscleMap');
  });
  it('여럿이 걸리면 고르지 않는다', () => {
    expect(matchRoutedProject('M', ps)).toBeNull();
  });
});

describe('한 메시지에 여러 질문·요청(v0.4.58)', () => {
  const raw = "@@질문 | useEffect가 뭐야\nReact에서 부수 효과를 …\n둘째 줄\n@@업무 MuscleMap | 다크 모드 추가\n다크 모드를 추가해 달라는 요청\n@@업무 없음 | 새 메모 앱\n메모 앱을 새로 만들기";
  it('머리 줄마다 나누고 요약·프로젝트를 꺼낸다', () => {
    const r = parseRoutedAll(raw);
    expect(r.items).toEqual([
      { kind: 'question', project: null, label: 'useEffect가 뭐야', body: 'React에서 부수 효과를 …\n둘째 줄' },
      { kind: 'task', project: 'MuscleMap', label: '다크 모드 추가', body: '다크 모드를 추가해 달라는 요청' },
      { kind: 'task', project: null, label: '새 메모 앱', body: '메모 앱을 새로 만들기' },
    ]);
  });
  it('하나만 있으면 예전 모양 그대로(요약 없음)', () => {
    expect(parseRoutedAll("@@업무 'MuscleMap'\n다크 모드").items).toEqual([{ kind: 'task', project: 'MuscleMap', label: '', body: '다크 모드' }]);
    expect(parseRouted('@@업무 MuscleMap | 다크 모드\n요청').project).toBe('MuscleMap');
  });
  it('스트리밍 중 덜 온 다음 머리 줄은 본문에 넣지 않는다', () => {
    expect(parseRoutedAll('@@질문 | a\n답\n@@업').items).toEqual([{ kind: 'question', project: null, label: 'a', body: '답' }]);
    expect(parseRoutedAll('@@질').ready).toBe(false);
  });
  it('머리가 없으면 질문 하나', () => {
    expect(parseRoutedAll('안녕').items).toEqual([{ kind: 'question', project: null, label: '', body: '안녕' }]);
  });
  it('다섯 개를 넘으면 나머지는 다섯째에 붙인다', () => {
    const many = Array.from({ length: 7 }, (_, i) => `@@질문 | q${i}\na${i}`).join('\n');
    const r = parseRoutedAll(many);
    expect(r.items).toHaveLength(5);
    expect(r.items[4].body).toContain('a6');
  });
});
