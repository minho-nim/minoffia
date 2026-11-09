import { describe, expect, it } from 'vitest';
import { cleanMap, mapPrompt, ruleMap } from './app-map.mjs';

const groups = new Map([
  ['src/components', ['src/components/Workout.tsx', 'src/components/Login.tsx']],
  ['supabase', ['supabase/migrations/1.sql']],
]);

describe('쉬운 앱 지도(v0.5.94)', () => {
  it('AI 답에서 없는 폴더·파일은 버리고 종류는 정해진 것만', () => {
    const m = cleanMap({ summary: '운동 앱', parts: [
      { name: '운동 화면', kind: '화면', what: '운동을 기록해요', folder: 'src/components', files: ['src/components/Workout.tsx', '../etc/passwd'] },
      { name: '이상한', kind: '해킹', what: '없는 폴더', folder: 'nope', files: [] },
      { name: '데이터', kind: 'DB', what: '저장', folder: 'supabase', files: [] },
    ] }, groups);
    expect(m.parts).toHaveLength(2);
    expect(m.parts[0].files).toEqual(['src/components/Workout.tsx']);
    expect(m.parts[1].kind).toBe('기능');
    expect(cleanMap({ parts: [] }, groups)).toBeNull();
  });
  it('AI가 없으면 폴더 규칙으로 기본 지도', () => {
    const m = ruleMap(groups, 'P');
    expect(m.by).toBe('rule');
    expect(m.parts.map((p) => p.kind)).toEqual(['화면', '데이터']);
  });
  it('보내는 글에는 파일 이름만', () => {
    const p = mapPrompt('P', groups, '');
    expect(p).toContain('src/components: Workout.tsx, Login.tsx');
  });
});
