import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Registry, parseRawGrammar } from 'vscode-textmate';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';
import { findFlags } from '../src/recognition';

const root = process.env.VSCODE_EXTENSIONS_PATH ?? '/Applications/Visual Studio Code.app/Contents/Resources/app/extensions';
const scopes = new Map<string, string>();
const languages = new Map<string, string>();
if (fs.existsSync(root)) for (const dir of fs.readdirSync(root)) {
  const manifest = path.join(root, dir, 'package.json');
  if (!fs.existsSync(manifest)) continue;
  const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  for (const grammar of pkg.contributes?.grammars ?? []) {
    scopes.set(grammar.scopeName, path.join(root, dir, grammar.path));
    if (grammar.language) languages.set(grammar.language, grammar.scopeName);
  }
}
const wasm = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
const registry = new Registry({
  onigLib: loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength)).then(() => ({ createOnigScanner: patterns => new OnigScanner(patterns), createOnigString: value => new OnigString(value) })),
  loadGrammar: async scope => { const file = scopes.get(scope); return file ? parseRawGrammar(fs.readFileSync(file, 'utf8'), file) : null; }
});
const cases = [
  ['typescript', 'const x = "new-checkout"; // "new-checkout"\nconst y = "prefix-new-checkout";'],
  ['javascript', 'const x = `new-checkout`; /* "new-checkout" */'],
  ['typescriptreact', 'const x = <Flag name="new-checkout" />;'],
  ['python', 'x = "new-checkout" # "new-checkout"\ny = "prefix-new-checkout"'],
  ['go', 'package main\nvar x = `new-checkout` // "new-checkout"'],
  ['rust', 'let x = "new-checkout"; // "new-checkout"'],
  ['java', 'class X { String x = "new-checkout"; } // "new-checkout"'],
  ['csharp', 'var x = "new-checkout"; // "new-checkout"'],
  ['ruby', 'x = "new-checkout" # "new-checkout"'],
  ['php', '<?php $x = "new-checkout"; // "new-checkout"'],
  ['shellscript', 'flag="new-checkout" # "new-checkout"'],
  ['json', '{"flag": "new-checkout", "other": "prefix-new-checkout"}'],
  ['yaml', 'flag: "new-checkout" # "new-checkout"'],
  ['sql', "SELECT 'new-checkout'; -- 'new-checkout'"],
  ['cpp', 'const auto x = "new-checkout"; // "new-checkout"'],
  ['swift', 'let flag = "new-checkout" // "new-checkout"'],
  ['lua', 'local flag = "new-checkout" -- "new-checkout"']
];
if (process.env.CI) for (const [language] of cases) assert(languages.has(language), `Missing CI grammar: ${language}`);
for (const [language, source] of cases) test(`${language}: matches a complete string, excluding comments and substrings`, { skip: !languages.has(language) }, async () => {
  const grammar = await registry.loadGrammar(languages.get(language)!);
  assert(grammar);
  const matches = findFlags(source, grammar, new Set(['new-checkout']), 1000);
  assert.equal(matches.length, 1, JSON.stringify(matches));
  assert.equal(source.slice(matches[0].start, matches[0].end), 'new-checkout');
});
test('no partial matches in interpolation, regex, escapes, multiline comments or unterminated strings', { skip: !languages.has('typescript') }, async () => {
  const grammar = (await registry.loadGrammar(languages.get('typescript')!))!;
  const source = ['const a = `new-checkout${suffix}`;', 'const b = /"new-checkout"/;', 'const c = "new-checkout\\n";', '/*', '"new-checkout"', '*/', 'const d = "new-checkout'].join('\n');
  assert.deepEqual(findFlags(source, grammar, new Set(['new-checkout']), 1000), []);
});
test('adjacent strings, Unicode offsets and multiple occurrences', { skip: !languages.has('typescript') }, async () => {
  const grammar = (await registry.loadGrammar(languages.get('typescript')!))!;
  const source = 'const emoji = "🚀"; f("new-checkout", "new-checkout");';
  const matches = findFlags(source, grammar, new Set(['new-checkout']), 1000);
  assert.equal(matches.length, 2);
  for (const m of matches) assert.equal(source.slice(m.start, m.end), m.name);
});
test('quotes inside a multiline literal are not complete strings', { skip: !languages.has('python') }, async () => {
  const grammar = (await registry.loadGrammar(languages.get('python')!))!;
  const source = "description = '''\n\"new-checkout\"\n'''\nflag = \"new-checkout\"";
  const matches = findFlags(source, grammar, new Set(['new-checkout']), 1000);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].start, source.lastIndexOf('new-checkout'));
});

test('completion replaces whole string contents and rejects comments, regex and interpolation', async () => {
  const { completionRange } = await import('../src/completion');
  const grammar = (await registry.loadGrammar(languages.get('typescript')!))!;
  for (const source of ['f("new-|");', 'f("new-|checkout");', 'f("|new-checkout");', 'f("|");', 'f("new-|']) {
    const offset = source.indexOf('|'); const text = source.replace('|', '');
    const range = completionRange(text, offset, grammar);
    assert(range, source);
    assert.equal(range.start, text.indexOf('"') + 1);
  }
  for (const source of ['// "new-|"', 'const x = /"new-|"/;', 'const x = `new-|${suffix}`;', '/*\n"new-|"\n*/', 'const name = new|']) {
    const offset = source.indexOf('|');
    assert.equal(completionRange(source.replace('|', ''), offset, grammar), undefined, source);
  }
});

test('completion recognizes strings across the installed language grammars', async () => {
  const { completionRange, safeCompletionName } = await import('../src/completion');
  for (const [language, source] of cases) {
    if (!languages.has(language)) continue;
    const grammar = (await registry.loadGrammar(languages.get(language)!))!;
    const start = source.indexOf('new-checkout');
    const range = completionRange(source, start + 4, grammar);
    assert(range, language);
    assert.equal(source.slice(range.start, range.end), 'new-checkout', language);
  }
  assert(safeCompletionName('new-checkout', '"'));
  for (const name of ['a"b', 'a\\b', 'a\nb', '${value}', '{value}']) assert(!safeCompletionName(name, '"'));
});
