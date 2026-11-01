import { describe, expect, it } from 'vitest';
import { matchRoutedProject, parseRouted } from './aiRoute';
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
