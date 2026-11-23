import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FALLBACK_MODEL, FALLBACK_MODELS, MAIN_MODEL, fallbackUrl, geminiFetch } from './gemini-fallback';

const U = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';
const F = `https://generativelanguage.googleapis.com/v1beta/models/${MAIN_MODEL}:generateContent`;
describe('Gemini 예비 모델(v0.7.56)', () => {
  it('주소의 모델만 바꾼다(이미 예비면 null)', () => {
    expect(fallbackUrl(U)).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${FALLBACK_MODEL}:generateContent`);
    expect(fallbackUrl(U.replace('generateContent', 'streamGenerateContent?alt=sse'))).toContain(`${FALLBACK_MODEL}:streamGenerateContent?alt=sse`);
    expect(fallbackUrl(`https://generativelanguage.googleapis.com/v1beta/models/${FALLBACK_MODEL}:generateContent`)).toBeNull();
    expect(fallbackUrl('https://example.com/x')).toBeNull();
  });
  it('429·503이면 예비 모델로 한 번 더, 아니면 그대로', async () => {
    const seen: string[] = [];
    const run = (async (u: string) => (seen.push(u), new Response('{}', { status: u.includes(FALLBACK_MODEL) ? 200 : 429 }))) as unknown as typeof fetch;
    const r = await geminiFetch(U, { method: 'POST' }, run);
    expect(r.status).toBe(200);
    expect(r.headers.get('x-gemini-model')).toBe(FALLBACK_MODEL);
    expect(seen).toHaveLength(2);
    const ok = await geminiFetch(U, {}, (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch);
    expect(ok.headers.get('x-gemini-model')).toBeNull();
    const bad = await geminiFetch(U, {}, (async () => new Response('{}', { status: 400 })) as unknown as typeof fetch);
    expect(bad.status).toBe(400);
  });
  it('Flash → 3.5 Lite → 3.1 Lite 차례로(v0.8.1, 404도 넘김)', async () => {
    expect(fallbackUrl(F)).toContain(`${FALLBACK_MODELS[0]}:`);
    const seen: string[] = [];
    const run = (async (u: string) => (seen.push(u), new Response('{}', { status: u.includes(FALLBACK_MODEL) ? 200 : u.includes(MAIN_MODEL + ':') ? 404 : 429 }))) as unknown as typeof fetch;
    const r = await geminiFetch(F, {}, run);
    expect(r.status).toBe(200);
    expect(seen).toHaveLength(3);
    expect(r.headers.get('x-gemini-model')).toBe(FALLBACK_MODEL);
    const all = await geminiFetch(F, {}, (async () => new Response('{}', { status: 429 })) as unknown as typeof fetch);
    expect(all.status).toBe(429);
  });
  it('Gemini를 부르는 함수마다 같은 복사본', () => {
    const base = readFileSync('supabase/functions/ask-gemini/gemini-fallback.ts', 'utf8');
    for (const f of ['draft-plan', 'analyze-image', 'design-standard', 'review-result', 'draw-design', 'draft-spec', 'draft-prototype', 'wiki-update', 'review-screen']) {
      expect(readFileSync(`supabase/functions/${f}/gemini-fallback.ts`, 'utf8'), f).toBe(base);
      expect(readFileSync(`supabase/functions/${f}/index.ts`, 'utf8'), f).toContain('geminiFetch(`https://generativelanguage.googleapis.com');
    }
  });
});
