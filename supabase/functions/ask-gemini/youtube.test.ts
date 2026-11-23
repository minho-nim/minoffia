import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { youtubeUrl } from './youtube';

describe('유튜브 링크 요약(v0.8.3)', () => {
  it('여러 모양의 유튜브 주소 → 표준 주소', () => {
    const w = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    expect(youtubeUrl('이거 요약해줘 https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe(w);
    expect(youtubeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30s')).toBe(w);
    expect(youtubeUrl('https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ')).toBe(w);
    expect(youtubeUrl('youtube.com/shorts/dQw4w9WgXcQ')).toBe(w);
    expect(youtubeUrl('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe(w);
  });
  it('유튜브가 아니면 null', () => {
    expect(youtubeUrl('https://vimeo.com/123')).toBeNull();
    expect(youtubeUrl('https://www.youtube.com/@channel')).toBeNull();
    expect(youtubeUrl('유튜브 영상 추천해줘')).toBeNull();
  });
  it('앱과 서버가 같은 규칙', () => {
    expect(readFileSync('src/domain/youtube.ts', 'utf8')).toBe(readFileSync('supabase/functions/ask-gemini/youtube.ts', 'utf8'));
  });
});
