import { build } from 'esbuild';
import { runTests } from '@vscode/test-electron';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
await build({ entryPoints: ['test/integration.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['vscode'], outfile: '.test-build/integration.js' });
const profile = await mkdtemp(path.join(tmpdir(), 'ul-'));
try { await runTests({
  vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH ?? (existsSync('/Applications/Visual Studio Code.app/Contents/MacOS/Code') ? '/Applications/Visual Studio Code.app/Contents/MacOS/Code' : '/Applications/Visual Studio Code.app/Contents/MacOS/Electron'),
  extensionDevelopmentPath: process.cwd(),
  extensionTestsPath: path.resolve('.test-build/integration.js'),
  launchArgs: ['--user-data-dir', profile, '--extensions-dir', path.join(profile, 'extensions'), '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-updates', path.resolve('samples')]
}); } finally { await rm(profile, { recursive: true, force: true }); }
