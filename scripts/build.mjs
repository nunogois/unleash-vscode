import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/extension.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'], sourcemap: true, outfile: 'dist/extension.js' });
await copyFile('node_modules/vscode-oniguruma/release/onig.wasm', 'dist/onig.wasm');
