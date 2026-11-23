// 빠른 명령 목록(v0.8.5): 입력창이 '/'로 시작하면 입력창 위에 뜬다. 누르면 바로 실행하거나(프로젝트까지 고른 것) 입력창에 채운다.
import type { Project } from '../domain/types';
import { suggest, type Suggestion } from '../domain/quickCommands';

export function CommandMenu({ input, projects, onPick }: { input: string; projects: Project[]; onPick: (s: Suggestion) => void }) {
  const list = suggest(input, projects);
  if (!list.length) return null;
  return (
    <ul className="cmd-menu" role="listbox" aria-label="빠른 명령">
      {list.map((s) => (
        <li key={s.text}>
          <button
            type="button"
            role="option"
            aria-selected={false}
            // 입력창 포커스를 잃지 않게(휴대폰 키보드가 내려가지 않게)
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(s)}
          >
            <b>{s.label}</b>
            <span>{s.desc}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
