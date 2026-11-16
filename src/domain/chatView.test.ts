import { describe, expect, it } from 'vitest';
import { clockLabel, continues, dayLabel, isGuideLine, noticeCard, shortSpecLine, speakerOf, timeOf, toneOf } from './chatView';

describe('디스코드식 대화창', () => {
  it('말한 쪽을 실제 AI로', () => {
    expect(speakerOf({ id: '1', from: 'me', text: '' }).name).toBe('나');
    expect(speakerOf({ id: '1', from: 'gemini', text: '', via: 'Gemini · Studio B가 답함' }).name).toBe('Gemini B');
    expect(speakerOf({ id: '1', from: 'gemini', text: '', via: 'Exa 검색 + Gemini · Studio A가 답함' }).id).toBe('exa');
    expect(speakerOf({ id: '1', from: 'gemini', text: '', via: 'Claude가 웹에서 찾아 답함' }).id).toBe('claude');
    expect(speakerOf({ id: 'stage-t-1', from: 'office', text: "'x' → 개발 중\nClaude(W1)가 개발 중이에요.", stage: 'executing' }).name).toBe('Claude');
    expect(speakerOf({ id: 'stage-t-1', from: 'office', text: "'x' → 완료", stage: 'completed' }).name).toBe('미노');
    expect(speakerOf({ id: 'stage-t-1', from: 'office', text: "'x' → 결과 승인 대기\n평가 평균 94점 → 검토 통과", stage: 'result_review' }).role).toBe('평가');
    expect(speakerOf({ id: 'act-1', from: 'office', text: '' }).name).toBe('미니엉');
  });
  it('업무 알림을 카드로: 평가 점수 칸', () => {
    const c = noticeCard("[MinLab] '[체험] 로그인 버튼 색 바꾸기' → 결과 승인 대기\n평가 평균 94점(Gemini A 96점 · Gemini B 91점 · Claude 기다리는 중) → 점수 모으는 중\n결과를 보고 결과 승인하세요.")!;
    expect(c.project).toBe('MinLab');
    expect(c.title).toBe('[체험] 로그인 버튼 색 바꾸기');
    expect(c.label).toBe('결과 승인 대기');
    expect(c.headline).toBe('평균 94점 · 점수 모으는 중');
    expect(c.fields).toEqual([{ label: 'Gemini A', value: '96점' }, { label: 'Gemini B', value: '91점' }, { label: 'Claude', value: '기다리는 중' }]);
    expect(c.lines).toEqual(['결과를 보고 결과 승인하세요.']);
  });
  it('시안 점수 칸과 사장님이 누른 기록', () => {
    const c = noticeCard("'로그인' → 기획 승인 대기\n시안 2장: A(요청을 빠짐없이) 90점 · B(단계를 줄여 단순하게) 91점 — 업무 카드에서 하나를 고를 수 있어요.")!;
    expect(c.fields).toEqual([{ label: '시안 A · 요청을 빠짐없이', value: '90점' }, { label: '시안 B · 단계를 줄여 단순하게', value: '91점' }]);
    expect(c.lines).toEqual(['업무 카드에서 하나를 고를 수 있어요.']);
    const d = noticeCard("[MinLab] '로그인' — ✓ 배포 승인을 눌렀어요(결과 v1). → 완료\n배포까지 끝났어요.")!;
    expect(d.did).toBe('✓ 배포 승인을 눌렀어요(결과 v1).');
    expect(d.label).toBe('완료');
    expect(noticeCard('그냥 답이에요')).toBeNull();
  });
  it('카드 색', () => {
    expect(toneOf('result_review')).toBe('turn');
    expect(toneOf('deployment_approval_pending', "'x' → 배포 승인 대기\nPR을 열고 검사(CI)하는 중이에요.")).toBe('info');
    expect(toneOf('completed')).toBe('ok');
    expect(toneOf('failed')).toBe('bad');
    expect(toneOf('executing')).toBe('info');
  });
  it('시각·묶기·날짜', () => {
    const t = Date.parse('2026-11-16T05:03:00Z');
    expect(timeOf({ id: `${t}-abcde` })).toBe(t);
    expect(timeOf({ id: 'stage-x', at: '2026-11-16T05:03:00Z' })).toBe(t);
    expect(timeOf({ id: 'stage-x' })).toBeNull();
    const a = { id: `${t}-a`, from: 'office' as const, text: '' };
    expect(continues(a, { id: `${t + 60_000}-b`, from: 'office', text: '' })).toBe(true);
    expect(continues(a, { id: `${t + 6 * 60_000}-b`, from: 'office', text: '' })).toBe(false);
    expect(continues(a, { id: `${t + 60_000}-b`, from: 'me', text: '' })).toBe(false);
    expect(clockLabel(t)).toBe('오후 2:03');
    expect(dayLabel(t, t + 3600_000)).toBe('오늘');
    expect(dayLabel(t, t + 86400_000)).toBe('어제');
    expect(dayLabel(t, t + 5 * 86400_000)).toBe('11월 16일');
  });
  it('버튼과 같은 안내 줄은 숨기고 기획서 줄은 짧게', () => {
    expect(isGuideLine('기획서를 보고 기획 승인하거나 수정 요청하세요.')).toBe(true);
    expect(isGuideLine('결과를 보고 결과 승인하세요(승인하면 PR이 열려요).')).toBe(true);
    expect(isGuideLine('업무 카드에서 하나를 고를 수 있어요.')).toBe(true);
    expect(isGuideLine('PR 검사(CI)를 통과했어요. 배포 승인하세요(병합은 서버가 해요).')).toBe(false);
    expect(shortSpecLine('기획서 v1: 로그인 버튼을 주황색으로')).toBe('로그인 버튼을 주황색으로');
    expect(shortSpecLine(`기획서 v2: ${'가'.repeat(100)}`).length).toBe(90);
  });
});
