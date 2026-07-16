import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'fs';

// Plugin to copy skills folder after build
function copySkillsPlugin() {
  return {
    name: 'copy-skills',
    closeBundle() {
      const srcDir = path.resolve(__dirname, 'public/skills');
      const destDir = path.resolve(__dirname, 'dist/skills');
      
      if (!existsSync(srcDir)) return;
      
      mkdirSync(destDir, { recursive: true });
      
      const files = readdirSync(srcDir);
      for (const file of files) {
        copyFileSync(
          path.join(srcDir, file),
          path.join(destDir, file)
        );
      }
      console.log('Copied skills folder to dist');
    },
  };
}

export default defineConfig({
  plugins: [react(), copySkillsPlugin()],
  root: 'client',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
