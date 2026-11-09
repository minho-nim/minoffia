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

import { applyToArch } from './app-map.mjs';
describe('자세한 지도에도 설명(v0.5.97)', () => {
  it('폴더가 같은 칸에 쉬운 이름·설명, 모르는 칸은 그대로', () => {
    const arch = { project: { name: 'P', summary: '기본' }, nodes: [{ id: 'a', label: 'src/components', summary: 'src/components 폴더' }, { id: 'b', label: 'etc', summary: 'etc 폴더' }, { id: 'root', label: '맨 위 파일', summary: '' }] };
    const map = { summary: '운동 앱', parts: [{ name: '화면 부품', what: '화면을 그려요', folder: 'src/components' }, { name: '설정', what: '앱 설정', folder: '' }], by: 'ai' };
    const out = applyToArch(arch, map);
    expect(out.project.summary).toBe('운동 앱');
    expect(out.nodes[0]).toMatchObject({ id: 'a', label: '화면 부품', summary: '화면을 그려요 (src/components)' });
    expect(out.nodes[1].label).toBe('etc');
    expect(out.nodes[2]).toMatchObject({ label: '설정', summary: '앱 설정 (맨 위)' });
  });
});
