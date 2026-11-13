import type { SupabaseClient } from '@supabase/supabase-js';
import { useState } from 'react';
import { ALLOW_SIGNUP } from '../lib/supabase';

export function Login({ client, onTry }: { client: SupabaseClient; /** 로그인 없이 체험하기(v0.7.6) */ onTry?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (kind: 'in' | 'up') => {
    setBusy(true);
    setError(null);
    const res =
      kind === 'in'
        ? await client.auth.signInWithPassword({ email, password })
        : await client.auth.signUp({ email, password });
    if (res.error) setError(res.error.message === 'Invalid login credentials' ? '이메일 또는 비밀번호가 맞지 않습니다.' : res.error.message);
    setBusy(false);
  };

  return (
    <main className="login">
      <h1 className="brand">minoffia.</h1>
      <p className="muted">소유자 계정으로 로그인하세요. 업무는 Supabase에 저장되어 다른 기기와 공유됩니다.</p>
      <form
        className="task-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run('in');
        }}
      >
        <label className="field">
          <span>이메일</span>
          <input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>비밀번호</span>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="task-error">{error}</p>}
        <div className="form-foot">
          {ALLOW_SIGNUP && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run('up')}>
              계정 만들기
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            로그인
          </button>
        </div>
      </form>
      {onTry && (
        <div className="login-try">
          <button type="button" className="btn btn-ghost" onClick={onTry}>
            로그인 없이 체험하기
          </button>
          <p className="muted small">예시 데이터로 이 기기 안에서만 돌아가요. 실제 업무·서버와는 연결되지 않아요.</p>
        </div>
      )}
    </main>
  );
}
