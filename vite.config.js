import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  base: './',
  plugins: [viteStaticCopy({
    targets: [...['cmaps', 'standard_fonts', 'wasm', 'iccs'].map(directory => ({
      src: 'node_modules/pdfjs-dist/' + directory + '/*',
      dest: 'pdfjs/' + directory,
      rename: { stripBase: true },
    })), { src: 'assets/OFL*.txt', dest: 'licenses', rename: { stripBase: true } }],
  })],
});
