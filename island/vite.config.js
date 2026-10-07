import { defineConfig } from 'vite';

/**
 * Besides the normal build, emit two self-contained copies of the game:
 *  - tidemark.html: one file with the CSS and JS inlined. It runs when opened
 *    straight from disk (no server needed) and can be hosted anywhere as-is.
 *  - tidemark.fragment.html: the same page without the document wrapper, for
 *    hosts that supply their own <html>/<head>/<body> skeleton.
 */
function singleFile() {
  return {
    name: 'tidemark-single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') return;
      let page = String(html.source);
      const scripts = [];
      const styles = [];
      for (const [file, out] of Object.entries(bundle)) {
        if (out.type === 'chunk' && out.isEntry) scripts.push({ file, code: out.code });
        else if (out.type === 'asset' && file.endsWith('.css')) styles.push({ file, code: String(out.source) });
      }
      for (const s of styles) {
        const tag = new RegExp(`<link[^>]+href="\\./${s.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`);
        page = page.replace(tag, () => `<style>\n${s.code}\n</style>`);
      }
      for (const s of scripts) {
        const tag = new RegExp(`<script[^>]+src="\\./${s.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*></script>`);
        // a literal "</script" inside the code would end the inline tag early
        const code = s.code.replace(/<\/script/gi, '<\\/script');
        // inline module scripts run after parsing, so move the code to the end of <body>
        page = page.replace(tag, '').replace('</body>', () => `<script type="module">\n${code}\n</script>\n</body>`);
      }
      this.emitFile({ type: 'asset', fileName: 'tidemark.html', source: page });

      const title = (page.match(/<title>[\s\S]*?<\/title>/) || [''])[0];
      const headStyles = (page.match(/<head>([\s\S]*?)<\/head>/) || ['', ''])[1].match(/<style>[\s\S]*?<\/style>/g) || [];
      const body = (page.match(/<body>([\s\S]*?)<\/body>/) || ['', ''])[1];
      this.emitFile({ type: 'asset', fileName: 'tidemark.fragment.html', source: `${title}\n${headStyles.join('\n')}\n${body.trim()}\n` });
    },
  };
}

export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  preview: { port: 4173 },
  plugins: [singleFile()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    sourcemap: false,
  },
});
