import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Claude Artifact용 단일 HTML 빌드. Supabase 환경변수를 비워 항상 로컬 데모 모드로 동작한다.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': 'undefined',
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': 'undefined',
  },
  build: { outDir: 'dist-artifact' },
});
