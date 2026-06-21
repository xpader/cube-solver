import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/cube-solver/' : '/',
  server: {
    open: true,
  },
}));
