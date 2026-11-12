// 업무 카드에서 바로 보는 지도(v0.6.45 소유자 "업무에서 각 업무의 구조도·앱 지도를 바로 볼 수 있게").
// v0.6.85(소유자 "업무에서 앱 지도가 작아져서 안 보여"): 팝업 안에 팝업이 떠서 바깥 팝업 크기에 갇혔다. 프로젝트 칸과 똑같이
// '구조 보기'(간략·자세히·관계·구조도 탭, 팝업 한 겹)와 '점검'으로 바꿨다. 열 때만 불러온다.
import { useState, type ReactNode } from 'react';
import type { Project } from '../domain/types';

export function ProjectViews({ project, maps, check }: { project: Project; maps?: (p: Project) => ReactNode; check?: (p: Project) => ReactNode }) {
  const [open, setOpen] = useState<'maps' | 'check' | null>(null);
  if (!project.repo || project.sample || (!maps && !check)) return null;
  const box = (key: 'maps' | 'check', label: string, className: string, render?: (p: Project) => ReactNode) =>
    render && (
      <details key={key} className={`project-rules ${className}`} open={open === key} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open ? key : open === key ? null : open)}>
        <summary>{label}</summary>
        {open === key && render(project)}
      </details>
    );
  return (
    <div className="project-sections task-views">
      {box('maps', '구조 보기', 'project-maps', maps)}
      {box('check', '점검', 'project-health', check)}
    </div>
  );
}
