// 비밀 열쇠 상태(v0.5.38): 서버 비밀값이 들어 있는지와 GitHub 토큰의 만료일만 돌려준다. 열쇠 값은 절대 내려보내지 않는다.
// 소유자만. AI 호출 없음. GitHub 확인은 사용량 한도에 안 잡히는 /rate_limit 한 번씩.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { parseGithubExpiry } from './expiry.ts';

const env = (key: string) => (Deno.env.get(key) ?? '').trim();
const cors = {
  'Access-Control-Allow-Origin': env('OFFICE_ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** 화면에 보일 이름 → 서버 비밀값 이름. github이면 만료일까지 확인한다 */
const KEYS: { name: string; secret: string; github?: boolean }[] = [
  { name: 'GitHub 저장소 토큰(저장소·구조도·PR 확인)', secret: 'GITHUB_REPO_TOKEN', github: true },
  { name: 'GitHub Actions 토큰(Gemini 개발 시작)', secret: 'GITHUB_ACTIONS_TOKEN', github: true },
  { name: 'Claude 루틴 토큰(PM·보조 개발·채점)', secret: 'CLAUDE_ROUTINE_TOKEN' },
  { name: 'Linear 키(Codex 맡기기)', secret: 'LINEAR_API_KEY' },
  { name: 'Gemini 키 A', secret: 'GEMINI_API_KEY' },
  { name: 'Gemini 키 B', secret: 'GEMINI_API_KEY2' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST만 받습니다.' });
  const ownerEmail = env('OFFICE_OWNER_EMAIL').toLowerCase();
  if (!ownerEmail) return reply(500, { ok: false, error: '서버 설정(OFFICE_OWNER_EMAIL)이 빠졌습니다.' });
  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return reply(401, { ok: false, error: '로그인이 필요합니다.' });
  if ((user.email ?? '').toLowerCase() !== ownerEmail) return reply(403, { ok: false, error: '소유자 계정만 볼 수 있습니다.' });

  const keys = await Promise.all(
    KEYS.map(async (k) => {
      const value = env(k.secret);
      if (!value) return { name: k.name, secret: k.secret, set: false, works: null, expiresAt: null };
      if (!k.github) return { name: k.name, secret: k.secret, set: true, works: null, expiresAt: null };
      try {
        const res = await fetch('https://api.github.com/rate_limit', {
          headers: { Authorization: `Bearer ${value}`, Accept: 'application/vnd.github+json', 'User-Agent': 'minoffia' },
          signal: AbortSignal.timeout(10_000),
        });
        await res.body?.cancel();
        return { name: k.name, secret: k.secret, set: true, works: res.ok, expiresAt: parseGithubExpiry(res.headers.get('github-authentication-token-expiration')) };
      } catch {
        return { name: k.name, secret: k.secret, set: true, works: null, expiresAt: null };
      }
    }),
  );
  return reply(200, { ok: true, keys, checkedAt: new Date().toISOString() });
});
