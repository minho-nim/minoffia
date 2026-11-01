import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { registerServiceWorker } from './lib/push';
import { applyTheme, loadTheme } from './lib/theme';

// 고른 화면 밝기를 그리기 전에 먼저 적용한다(깜빡임 없게)
applyTheme(loadTheme());

// 휴대폰 알림용 서비스 워커(운영 앱만, Artifact 데모는 제외)
if (import.meta.env.VITE_SUPABASE_URL) registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
