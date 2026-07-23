const { defineConfig } = require('vite');
const vue = require('@vitejs/plugin-vue');
const path = require('path');

module.exports = defineConfig({
  plugins: [vue()],
  root: path.resolve(__dirname, 'src'),
  base: './',
  publicDir: path.resolve(__dirname, 'public'),
  build: {
    outDir: path.resolve(__dirname, 'ui-dist'),
    emptyOutDir: true,
    assetsDir: 'assets'
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
