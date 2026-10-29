import { describe, expect, it } from 'vitest';
import { sampleSnapshot } from '../data/sample';
import { answerStatus, matchProjects, titleFrom, triage } from './triage';

const snap = sampleSnapshot();
const now = new Date('2026-10-29T03:00:00Z');

describe('matchProjects', () => {
  it('이름·저장소 이름을 띄어쓰기·대소문자 무시하고 찾는다', () => {
    expect(matchProjects('musclemap 로그인 고쳐줘', snap.projects).map((p) => p.name)).toEqual(['MuscleMap']);
    expect(matchProjects('Muscle Map 화면', snap.projects).map((p) => p.name)).toEqual(['MuscleMap']);
    expect(matchProjects('아무 이름 없음', snap.projects)).toEqual([]);
  });
});

describe('triage', () => {
  it('작업 요청이면 프로젝트 후보와 함께', () => {
    const r = triage('MuscleMap에 다크 모드 추가해줘', snap, now);
    expect(r.kind).toBe('request');
    if (r.kind === 'request') expect(r.candidates[0].name).toBe('MuscleMap');
    const none = triage('로그인 버튼 고쳐줘', snap, now);
    expect(none.kind === 'request' && none.candidates.length).toBe(0);
  });

  it('설명·추천해 달라는 말은 질문', () => {
    expect(triage('리액트 상태 관리 추천해줘', snap, now).kind).toBe('question');
    expect(triage('useEffect가 뭐야?', snap, now).kind).toBe('question');
  });

  it('앱 상태 질문은 기록으로 바로 답한다', () => {
    const r = triage('Claude 오늘 몇 번 남았어?', snap, now);
    expect(r.kind).toBe('status');
    if (r.kind === 'status') expect(r.answer).toContain('Claude:');
    expect(answerStatus('진행 중인 업무 뭐야', snap, now)).toContain('진행 중인 업무');
    expect(answerStatus('막힌 거 있어?', snap, now)).toContain('차단된 업무');
    expect(answerStatus('MuscleMap 어디까지 했어?', snap, now)).toContain('MuscleMap 업무');
  });

  it('질문도 요청도 아니면 되묻는다', () => {
    expect(triage('음', snap, now).kind).toBe('unclear');
  });
});

describe('titleFrom', () => {
  it('첫 줄 60자', () => {
    expect(titleFrom('  첫 줄\n둘째 줄')).toBe('첫 줄');
    expect(titleFrom('가'.repeat(80))).toHaveLength(60);
  });
});
