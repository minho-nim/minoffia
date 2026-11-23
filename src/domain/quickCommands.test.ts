import { describe, expect, it } from 'vitest';
import { findProject, parseCommand, suggest } from './quickCommands';
import type { Project } from './types';

const P = [{ id: 'a', name: '미노피아' }, { id: 'b', name: 'MuscleMap' }, { id: 'c', name: '미니어리 (Minially)' }] as unknown as Project[];

describe('빠른 명령(v0.8.5)', () => {
  it('명령 읽기', () => {
    expect(parseCommand('/새채팅', P)?.cmd.id).toBe('new');
    expect(parseCommand('/new', P)?.cmd.id).toBe('new');
    expect(parseCommand('/업무 미노피아', P)?.project?.id).toBe('a');
    expect(parseCommand('/업무 muscle', P)?.project?.id).toBe('b');
    expect(parseCommand('/검색 아이폰 17 가격', P)).toMatchObject({ arg: '아이폰 17 가격' });
    expect(parseCommand('/없는명령', P)).toBeNull();
    expect(parseCommand('그냥 말', P)).toBeNull();
  });
  it('프로젝트 찾기: 같은 이름 → 앞부분 → 들어 있음', () => {
    expect(findProject('미니', P)?.id).toBe('c');
    expect(findProject('minially', P)?.id).toBe('c');
  });
  it('목록', () => {
    expect(suggest('/', P).length).toBeGreaterThan(5);
    expect(suggest('/업', P).map((s) => s.label)).toEqual(['/업무 프로젝트', '/업무탭']);
    expect(suggest('/업무 ', P)).toHaveLength(3);
    expect(suggest('/업무 미노', P).map((s) => s.text)).toEqual(['/업무 미노피아']);
    expect(suggest('안녕', P)).toEqual([]);
  });
});
