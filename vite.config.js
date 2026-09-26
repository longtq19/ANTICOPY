import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.dirname(fileURLToPath(import.meta.url));
const blockDir = (dir) => {
  const abs = path.join(root, dir).replace(/\\/g, '/');
  return [abs, `${abs}/**`];
};

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // Replaces Vite's default list, so the defaults are repeated here.
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem,key,p12,pfx,cer,der}',
        '.npmrc',
        '.yarnrc.yml',
        '**/.git/**',
        ...blockDir('data'),
        ...blockDir('server'),
        ...blockDir('scripts'),
      ],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
