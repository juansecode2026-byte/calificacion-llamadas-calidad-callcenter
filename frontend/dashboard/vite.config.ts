import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// envDir apunta a la raíz del proyecto, no a frontend/dashboard/: el
// .env/.env.example vive ahí porque lo comparten frontend, backend/worker y
// backend/agent (ver CLAUDE.md, "Variables de entorno"). Sin esto, Vite
// buscaría un .env propio adentro de frontend/dashboard/ y no lo encontraría.
export default defineConfig({
  plugins: [react()],
  envDir: fileURLToPath(new URL('../../', import.meta.url)),
});
