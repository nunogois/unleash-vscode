import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import { appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Exercise the minimum supported VS Code minor, including its real grammars.
const executable = await downloadAndUnzipVSCode('1.99.3');
const grammars = path.join(path.dirname(executable), 'resources', 'app', 'extensions');
if (!existsSync(path.join(grammars, 'typescript-basics', 'package.json'))) {
  throw new Error('VS Code grammars were not found; do not silently skip recognition tests.');
}
appendFileSync(process.env.GITHUB_ENV, `VSCODE_EXECUTABLE_PATH=${executable}\nVSCODE_EXTENSIONS_PATH=${grammars}\n`);
