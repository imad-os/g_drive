import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The store version lives in the manifest; every own file index.html loads gets ?v=<version> (guide section 10).
const VERSION = JSON.parse(readFileSync(resolve(__dirname, 'public/mypc-app.json'), 'utf8')).version;

function versionQuery() {
    return {
        name: 'mypc-version-query',
        apply: 'build',
        transformIndexHtml: {
            order: 'post',
            handler(html) {
                return html.replace(/((?:src|href)=")(\.?\/?assets\/[^"?]+)(")/g, `$1$2?v=${VERSION}$3`);
            }
        }
    };
}

export default defineConfig({
    base: './',
    define: { __APP_VERSION__: JSON.stringify(VERSION) },
    plugins: [versionQuery()],
    build: {
        // GitHub Pages: Settings > Pages > Deploy from a branch > main / docs
        outDir: 'docs',
        emptyOutDir: true,
        target: 'chrome108',
        cssTarget: 'chrome108',
        modulePreload: false,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                picker: resolve(__dirname, 'picker.html')
            }
        }
    },
    server: { port: 5173 }
});
