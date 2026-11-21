// 비밀 열쇠 상태(v0.5.38, 소유자 "90일 걸어둔 것 화면에 보이게"): 들어 있는지와 GitHub 토큰 만료일만 보인다(값은 받지 않음).
// v0.7.67: Gemini A·B·Tavily·Firecrawl도 무료 확인 주소로 먹히는지 본다. 14일 이하 노랑, 3일 이하·거절 빨강. 바꾸는 곳은 Supabase 대시보드 → Edge Functions → Secrets.
import { useEffect, useState } from 'react';
import type { KeyStatus } from '../data/store';

const day = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
/** v0.7.97 소유자 "순서·모두 한 줄로": 사용량 목록과 같은 순서, 짧은 이름 한 줄(긴 설명은 누르면) */
const ORDER = ['CLAUDE_ROUTINE_TOKEN', 'LINEAR_API_KEY', 'GEMINI_API_KEY', 'GEMINI_API_KEY2', 'TAVILY_API_KEY', 'FIRECRAWL_API_KEY', 'GITHUB_REPO_TOKEN', 'GITHUB_ACTIONS_TOKEN'];
const SHORT: Record<string, string> = {
  CLAUDE_ROUTINE_TOKEN: 'Claude 루틴',
  LINEAR_API_KEY: 'Codex (Linear)',
  GEMINI_API_KEY: 'Studio A (Gemini)',
  GEMINI_API_KEY2: 'Studio B (Gemini)',
  TAVILY_API_KEY: 'Tavily',
  FIRECRAWL_API_KEY: 'Firecrawl',
  GITHUB_REPO_TOKEN: 'GitHub 저장소',
  GITHUB_ACTIONS_TOKEN: 'GitHub Actions',
};
export const sortKeys = <T extends { secret: string }>(keys: T[]) => [...keys].sort((a, b) => (ORDER.indexOf(a.secret) + 1 || 99) - (ORDER.indexOf(b.secret) + 1 || 99));
/** 오른쪽 짧은 상태 */
function shortState(k: KeyStatus, left: number | null): string {
  if (!k.set) return '없음';
  if (k.works === false) return '거절됨';
  if (left !== null) return left <= 0 ? '만료' : `D-${left}`;
  return k.works ? '정상' : '들어 있음';
}

export function KeyStatusList({ load }: { load: () => Promise<KeyStatus[]> }) {
  const [keys, setKeys] = useState<KeyStatus[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');
  const refresh = () => {
    setError('');
    load()
      .then(setKeys)
      .catch((e) => setError((e as Error).message || '확인하지 못했어요.'));
  };
  useEffect(refresh, []);

  return (
    <section className="team-keys" aria-label="비밀 열쇠">
      <h3>
        비밀 열쇠{' '}
        <button type="button" className="link-btn small" onClick={refresh}>
          다시 확인
        </button>
      </h3>
      {error && <p className="task-error">{error}</p>}
      {!keys && !error && <p className="muted small">확인하는 중…</p>}
      {keys && (
        <ul className="key-rows">
          {sortKeys(keys).map((k) => {
            const left = k.expiresAt ? day(k.expiresAt) : null;
            const level = !k.set || k.works === false || (left !== null && left <= 3) ? 'is-bad' : left !== null && left <= 14 ? 'is-warn' : 'is-ok';
            const full = !k.set
              ? '없음 — 이 기능이 멈춰요'
              : k.works === false
                ? k.secret.startsWith('GITHUB') ? 'GitHub가 거절함(만료·권한 확인)' : '거절됨(키 확인)'
                : left !== null
                  ? `${k.expiresAt!.slice(0, 10)} 만료 (${left <= 0 ? '지남' : `D-${left}`})`
                  : k.works
                    ? '정상 · 만료일 없음'
                    : '들어 있음(만료일은 알 수 없음)';
            const isOpen = open === k.secret;
            return (
              <li key={k.secret} className={level}>
                <button type="button" className="key-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : k.secret)}>
                  <span className="key-name">{SHORT[k.secret] ?? k.name}</span>
                  <b>{shortState(k, left)}</b>
                </button>
                {isOpen && (
                  <p className="key-more">
                    {k.name} · {full} · <code>{k.secret}</code>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted small">새로 만든 열쇠는 Supabase 대시보드 → Edge Functions → Secrets에서 같은 이름으로 바꿔 넣으면 됩니다.</p>
    </section>
  );
}
