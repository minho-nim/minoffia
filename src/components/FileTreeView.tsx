// 구조도 보기(v0.5.24): 폴더 나무. 바뀐 파일은 강조하고 +/− 줄 수. 폴더는 처음에 모두 닫아 둔다(v0.5.94 소유자 "처음에 다 열려 있음").
import { useEffect, useState } from 'react';
import { buildTree, type FileChange, type TreeNode } from '../domain/fileTree';

function Node({ n, depth, onlyChanged }: { n: TreeNode; depth: number; onlyChanged: boolean }) {
  if (onlyChanged && !n.changed && !n.change) return null;
  if (!n.children.length) {
    return (
      <li className={`ft-file${n.change ? ' is-changed' : ''}`} title={n.change?.tasks.join(', ')}>
        <span>{n.name}</span>
        {n.change && (
          <span className="ft-diff">
            <span className="ft-add">+{n.change.add}</span> <span className="ft-del">−{n.change.del}</span>
          </span>
        )}
      </li>
    );
  }
  return (
    <li className="ft-dir">
      {/* '바뀐 곳만'을 켜면 남은 폴더를 펼쳐 바로 보이게 */}
      <details open={onlyChanged || undefined}>
        <summary>
          {n.name}/{n.changed > 0 && <span className="num num-turn">{n.changed}</span>}
        </summary>
        <ul>
          {n.children.map((c) => (
            <Node key={c.path} n={c} depth={depth + 1} onlyChanged={onlyChanged} />
          ))}
        </ul>
      </details>
    </li>
  );
}

/** paths가 없으면(저장소 목록을 못 읽음) 바뀐 파일만으로 그린다 */
export function FileTreeView({ paths, changes, emptyText = '보여 줄 파일이 없어요.' }: { paths: string[]; changes: Map<string, FileChange>; emptyText?: string }) {
  const [onlyChanged, setOnlyChanged] = useState(false);
  const root = buildTree(paths, changes);
  if (!root.children.length) return <p className="muted small">{emptyText}</p>;
  return (
    <div className="file-tree">
      {changes.size > 0 && paths.length > 0 && (
        <label className="check small">
          <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> 바뀐 곳만 ({changes.size}개 파일)
        </label>
      )}
      <ul>
        {root.children.map((c) => (
          <Node key={c.path} n={c} depth={0} onlyChanged={onlyChanged} />
        ))}
      </ul>
    </div>
  );
}

/** 프로젝트 구조도: 펼칠 때 저장소 파일 목록을 한 번 읽고, 열린 업무가 바꾼 파일을 강조 */
export function RepoStructure({ load, changes }: { load: () => Promise<string[]>; changes: Map<string, FileChange> }) {
  const [paths, setPaths] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    load()
      .then((p) => alive && setPaths(p))
      .catch((e) => {
        if (!alive) return;
        setPaths([]);
        setError((e as Error).message);
      });
    return () => {
      alive = false;
    };
  }, []);
  if (paths === null) return <p className="muted small">저장소 구조를 읽는 중…</p>;
  return (
    <>
      {error && <p className="muted small">저장소 전체 구조는 못 읽었어요({error}). 개발 중에 바뀐 파일만 보여요.</p>}
      <FileTreeView paths={paths} changes={changes} emptyText="아직 저장소가 없거나 비어 있어요." />
      {changes.size > 0 && <p className="muted small">강조된 파일 = 지금 개발 중인 업무가 바꾼 곳(최신 결과 기준). 눌러 두면 업무 이름이 보여요.</p>}
    </>
  );
}
