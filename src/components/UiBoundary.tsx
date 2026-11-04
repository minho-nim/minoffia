// New Office 화면에서 오류가 나도 앱 전체가 멈추지 않게 막고, 기존 화면(Classic)으로 돌아가는 버튼을 보인다(v0.6.0).
import { Component, type ReactNode } from 'react';

interface Props {
  onFallback: () => void;
  children: ReactNode;
}

export class UiBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('New Office 화면 오류, 기존 화면으로 돌아갈 수 있습니다.', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="office office-new no-failed" role="alert">
        <p>새 화면을 그리지 못했어요. 업무 데이터는 그대로입니다.</p>
        <button type="button" className="btn" onClick={this.props.onFallback}>
          기존 화면으로 돌아가기
        </button>
      </div>
    );
  }
}
