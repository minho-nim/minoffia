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

/** 화면에 보일 이름 → 서버 비밀값 이름. check가 있으면 무료 확인 주소로 열쇠가 먹히는지 본다(github은 만료일까지) */
type Check = 'github' | 'gemini' | 'tavily' | 'firecrawl';
const KEYS: { name: string; secret: string; check?: Check }[] = [
  { name: 'GitHub 저장소 토큰(저장소·구조도·PR 확인)', secret: 'GITHUB_REPO_TOKEN', check: 'github' },
  { name: 'GitHub Actions 토큰(Gemini 개발 시작)', secret: 'GITHUB_ACTIONS_TOKEN', check: 'github' },
  { name: 'Claude 루틴 토큰(PM·보조 개발·채점)', secret: 'CLAUDE_ROUTINE_TOKEN' },
  { name: 'Linear 키(Codex 맡기기)', secret: 'LINEAR_API_KEY' },
  { name: 'Gemini 키 A(Studio A · 대화·조사 정리)', secret: 'GEMINI_API_KEY', check: 'gemini' },
  { name: 'Gemini 키 B(Studio B · 기획서·평가·위키)', secret: 'GEMINI_API_KEY2', check: 'gemini' },
  { name: 'Tavily 키(웹 검색)', secret: 'TAVILY_API_KEY', check: 'tavily' },
  { name: 'Firecrawl 키(본문 읽기·예비 검색)', secret: 'FIRECRAWL_API_KEY', check: 'firecrawl' },
];

/** 한도를 쓰지 않는 확인 주소(v0.7.67): Gemini는 모델 목록, Tavily·Firecrawl은 사용량 조회 */
const PROBE: Record<Exclude<Check, 'github'>, (v: string) => [string, Record<string, string>]> = {
  gemini: (v) => ['https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { 'x-goog-api-key': v }],
  tavily: (v) => ['https://api.tavily.com/usage', { Authorization: `Bearer ${v}` }],
  firecrawl: (v) => ['https://api.firecrawl.dev/v2/team/credit-usage', { Authorization: `Bearer ${v}` }],
};

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
      if (!k.check) return { name: k.name, secret: k.secret, set: true, works: null, expiresAt: null };
      if (k.check !== 'github') {
        try {
          const [url, headers] = PROBE[k.check](value);
          const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
          await res.body?.cancel();
          // 401·403만 '거절'(열쇠 문제). 그 밖의 오류는 알 수 없음으로 둔다
          return { name: k.name, secret: k.secret, set: true, works: res.ok ? true : res.status === 401 || res.status === 403 ? false : null, expiresAt: null };
        } catch {
          return { name: k.name, secret: k.secret, set: true, works: null, expiresAt: null };
        }
      }
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
