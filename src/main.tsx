import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { registerServiceWorker } from './lib/push';

// 휴대폰 알림용 서비스 워커(운영 앱만, Artifact 데모는 제외)
if (import.meta.env.VITE_SUPABASE_URL) registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
