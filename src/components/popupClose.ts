// 프로젝트 칸 팝업(구조도·앱 지도 등) 바깥 누르기(v0.6.47 소유자 "x 혹은 바깥을 누르면 팝업 내려가게, 다른 게 눌리지 않게").
// 팝업은 <details open>을 가운데 띄운 것이라 뒤 어두운 부분은 그림자일 뿐 눌림이 뒤로 새어 나갔다.
// 열린 팝업이 있으면 그 바깥 누르기는 뒤 화면에 전하지 않고 팝업만 닫는다.
// v0.6.48(소유자 "팝업 상태로 스크롤이 되네, 뒤에 클릭되는 효과도 막자"): 열린 동안 html에 popup-open을 붙여
// 뒤 화면 스크롤을 막고(overflow·touchmove), 뒤 요소는 pointer-events를 꺼 눌림 효과도 안 보이게 한다(styles.css).
const OPEN = '.project-sections > details[open]';
const CLS = 'popup-open';

export function installPopupClose(doc: Document = document): () => void {
  const root = doc.documentElement;
  const sync = () => {
    const on = !!doc.querySelector(OPEN);
    if (root.classList.contains(CLS) !== on) root.classList.toggle(CLS, on);
  };
  const outside = (e: Event): HTMLDetailsElement | null => {
    const open = doc.querySelector<HTMLDetailsElement>(OPEN);
    if (!open) return null;
    const t = e.target as Node | null;
    return t && open.contains(t) ? null : open;
  };
  const block = (e: Event) => {
    sync();
    if (!outside(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  const close = (e: Event) => {
    const open = outside(e);
    if (!open) return sync();
    e.preventDefault();
    e.stopPropagation();
    open.open = false;
    sync();
  };
  // 팝업 밖에서 끄는 손가락은 화면을 움직이지 않는다(아이폰은 overflow만으로 안 막힐 때가 있다)
  const noScroll = (e: Event) => {
    if (outside(e)) e.preventDefault();
  };
  // touchend는 막지 않는다(막으면 아이폰에서 click이 안 생겨 닫히지 않음)
  const types = ['pointerdown', 'pointerup', 'mousedown', 'mouseup'] as const;
  for (const t of types) doc.addEventListener(t, block, true);
  doc.addEventListener('click', close, true);
  doc.addEventListener('touchmove', noScroll, { capture: true, passive: false });
  doc.addEventListener('wheel', noScroll, { capture: true, passive: false });
  // toggle은 거품이 없지만 잡기 단계로는 들어온다: 열고 닫을 때마다 잠금 표시를 맞춘다
  doc.addEventListener('toggle', sync, true);
  const esc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    const open = doc.querySelector<HTMLDetailsElement>(OPEN);
    if (open) open.open = false;
    sync();
  };
  doc.addEventListener('keydown', esc);
  return () => {
    for (const t of types) doc.removeEventListener(t, block, true);
    doc.removeEventListener('click', close, true);
    doc.removeEventListener('touchmove', noScroll, true);
    doc.removeEventListener('wheel', noScroll, true);
    doc.removeEventListener('toggle', sync, true);
    doc.removeEventListener('keydown', esc);
    root.classList.remove(CLS);
  };
}
