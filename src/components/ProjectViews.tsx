// 업무 카드에서 바로 보는 지도(v0.6.45 소유자 "업무에서 각 업무의 구조도·앱 지도를 바로 볼 수 있게").
// v0.6.85(소유자 "업무에서 앱 지도가 작아져서 안 보여"): 팝업 안에 팝업이 떠서 바깥 팝업 크기에 갇혔다. 프로젝트 칸과 똑같이
// '구조 보기'(간략·자세히·관계·구조도 탭, 팝업 한 겹)와 '점검'으로 바꿨다. 열 때만 불러온다.
// v0.7.38(소유자 "업무에서 구조 보기가 누르기 힘들게 보여"): 업무 카드 안에서 연 창이 카드에 갇혀 머리줄에 가리고 뒤 카드가 위로 비쳤다.
// 화면 맨 위 한 겹 팝업(FormPopup, body에 붙임)으로 열고, 간략 지도가 없을 때 바로 '점검'으로 갈 버튼을 둔다.
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Project } from '../domain/types';
import { FormPopup } from './FormPopup';

export function ProjectViews({ project, maps, check }: { project: Project; maps?: (p: Project) => ReactNode; check?: (p: Project) => ReactNode }) {
  const [open, setOpen] = useState<'maps' | 'check' | null>(null);
  if (!project.repo || project.sample || (!maps && !check)) return null;
  return (
    <div className="project-sections task-views">
      {maps && (
        <button type="button" className="task-view-btn" aria-haspopup="dialog" onClick={() => setOpen('maps')}>
          구조 보기
        </button>
      )}
      {check && (
        <button type="button" className="task-view-btn" aria-haspopup="dialog" onClick={() => setOpen('check')}>
          점검
        </button>
      )}
      {open &&
        createPortal(
          <FormPopup wide title={open === 'maps' ? `구조 보기 · ${project.name}` : `점검 · ${project.name}`} onClose={() => setOpen(null)}>
            {open === 'maps' ? maps?.(project) : check?.(project)}
            {open === 'maps' && check && (
              <p className="task-view-foot">
                <button type="button" className="link-btn small" onClick={() => setOpen('check')}>
                  지도가 없거나 오래됐으면 점검하러 가기 →
                </button>
              </p>
            )}
          </FormPopup>,
          document.body,
        )}
    </div>
  );
}
