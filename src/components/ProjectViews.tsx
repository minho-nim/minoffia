// 업무 카드에서 바로 보는 구조도·앱 지도(v0.6.45 소유자 "업무에서 각 업무의 구조도·앱 지도를 바로 볼 수 있게").
// 프로젝트 탭과 같은 화면을 같은 가운데 팝업으로 연다. 열 때만 불러온다(토큰·요청 아끼기).
import { useState, type ReactNode } from 'react';
import type { Project } from '../domain/types';

export function ProjectViews({ project, structure, appMap }: { project: Project; structure?: (p: Project) => ReactNode; appMap?: (p: Project) => ReactNode }) {
  const [open, setOpen] = useState<'structure' | 'map' | null>(null);
  if (!project.repo || project.sample || (!structure && !appMap)) return null;
  const box = (key: 'structure' | 'map', label: string, render?: (p: Project) => ReactNode) =>
    render && (
      <details key={key} open={open === key} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open ? key : open === key ? null : open)}>
        <summary>{label}</summary>
        {open === key && render(project)}
      </details>
    );
  return (
    <div className="project-sections task-views">
      {box('structure', '구조도', structure)}
      {box('map', '앱 지도·점검', appMap)}
    </div>
  );
}
