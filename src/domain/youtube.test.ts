import { describe, expect, it } from 'vitest';
import { geminiAppPrompt, youtubeUrl } from './youtube';

describe('유튜브는 Gemini 앱에서(v0.8.4)', () => {
  it('여러 모양의 유튜브 주소 → 표준 주소', () => {
    const w = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    expect(youtubeUrl('이거 요약해줘 https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe(w);
    expect(youtubeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30s')).toBe(w);
    expect(youtubeUrl('https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ')).toBe(w);
    expect(youtubeUrl('youtube.com/shorts/dQw4w9WgXcQ')).toBe(w);
    expect(youtubeUrl('https://vimeo.com/123')).toBeNull();
    expect(youtubeUrl('https://www.youtube.com/@channel')).toBeNull();
  });
  it('링크만이면 요약 부탁, 물은 게 있으면 그 질문', () => {
    expect(geminiAppPrompt('https://youtu.be/dQw4w9WgXcQ?si=abc')).toMatch(/^이 유튜브 영상을 한국어로 요약해 줘/);
    expect(geminiAppPrompt('요약해줘 https://youtu.be/dQw4w9WgXcQ')).toMatch(/요약해 줘/);
    expect(geminiAppPrompt('3분쯤에 뭐라고 했어? https://youtu.be/dQw4w9WgXcQ')).toBe('이 유튜브 영상을 보고 답해 줘(한국어): 3분쯤에 뭐라고 했어?\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});
