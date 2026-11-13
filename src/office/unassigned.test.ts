import { describe, expect, it } from 'vitest';
import { unassignedCharacters } from './unassigned';

describe('미배정 캐릭터', () => {
  it('서 있는 그림이 있는 캐릭터만, 정한 순서대로', () => {
    const list = unassignedCharacters({
      '../assets/office/unassigned/nightdev-stand.png': 'l',
      '../assets/office/unassigned/clipboard-stand.png': 'p',
      '../assets/office/unassigned/clipboard-walk.png': 'pw',
      '../assets/office/unassigned/x-walk.png': 'x',
    });
    expect(list.map((c) => c.id)).toEqual(['clipboard', 'nightdev']);
    expect(list[0]).toMatchObject({ stand: 'p', walk: 'pw' });
    expect(list[1].walk).toBeNull();
  });
  it('저장소의 실제 그림 3명', () => {
    expect(unassignedCharacters().map((c) => c.id)).toEqual(['clipboard', 'hoodie', 'nightdev']);
  });
});
