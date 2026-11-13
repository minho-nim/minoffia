import type { AgentId } from '../domain/types';

/**
 * 직접 만든 이미지로 바꾸려면 아래 위치에 PNG를 넣는다. 없으면 코드로 그린 도트를 쓴다.
 *   src/assets/office/background.png        (가로:세로 = 300:224, 예: 1200×896)
 *   src/assets/office/characters/<id>-stand.png
 *   src/assets/office/characters/<id>-walk.png   (없으면 stand를 쓴다)
 * <id>: mina, claude, codex, exa, studioA, studioB, ci
 */
const backgrounds = import.meta.glob('../assets/office/background.{png,jpg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const characters = import.meta.glob('../assets/office/characters/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const BACKGROUND_URL: string | null = Object.values(backgrounds)[0] ?? null;

export function characterUrl(id: AgentId, frame: 'stand' | 'walk'): string | null {
  const find = (f: string) => characters[`../assets/office/characters/${id}-${f}.png`] ?? null;
  return find(frame) ?? find('stand');
}
