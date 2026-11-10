// 프로젝트 칸 팝업(구조도·앱 지도 등) 바깥 누르기(v0.6.47 소유자 "x 혹은 바깥을 누르면 팝업 내려가게, 다른 게 눌리지 않게").
// 팝업은 <details open>을 가운데 띄운 것이라 뒤 어두운 부분은 그림자일 뿐 눌림이 뒤로 새어 나갔다.
// 열린 팝업이 있으면 그 바깥 누르기는 뒤 화면에 전하지 않고 팝업만 닫는다.
const OPEN = '.project-sections > details[open]';

export function installPopupClose(doc: Document = document): () => void {
  const outside = (e: Event): HTMLDetailsElement | null => {
    const open = doc.querySelector<HTMLDetailsElement>(OPEN);
    if (!open) return null;
    const t = e.target as Node | null;
    return t && open.contains(t) ? null : open;
  };
  const block = (e: Event) => {
    if (!outside(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  const close = (e: Event) => {
    const open = outside(e);
    if (!open) return;
    e.preventDefault();
    e.stopPropagation();
    open.open = false;
  };
  // touchend는 막지 않는다(막으면 아이폰에서 click이 안 생겨 닫히지 않음)
  const types = ['pointerdown', 'pointerup', 'mousedown', 'mouseup'] as const;
  for (const t of types) doc.addEventListener(t, block, true);
  doc.addEventListener('click', close, true);
  const esc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    const open = doc.querySelector<HTMLDetailsElement>(OPEN);
    if (open) open.open = false;
  };
  doc.addEventListener('keydown', esc);
  return () => {
    for (const t of types) doc.removeEventListener(t, block, true);
    doc.removeEventListener('click', close, true);
    doc.removeEventListener('keydown', esc);
  };
}
