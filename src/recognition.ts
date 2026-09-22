import { INITIAL, type IGrammar, type StateStack } from 'vscode-textmate';

export interface Match { name: string; start: number; end: number }

// Strip delimiters only around a complete, grammar-confirmed string. Escaped,
// interpolated and unfamiliar literals are skipped instead of partially matched.
function literalContent(raw: string, scopes: string[]): { value: string; offset: number } | undefined {
  raw = raw.trimEnd();
  for (const quote of ['"""', "'''", '"', "'", '`']) {
    const start = raw.indexOf(quote);
    if (start < 0 || start > 6 || !/^[rRuUbBfF@$]*$/.test(raw.slice(0, start))) continue;
    if (raw.length < start + quote.length * 2 || !raw.endsWith(quote)) continue;
    const value = raw.slice(start + quote.length, -quote.length);
    if (value.includes('\\') || value.includes('\n') || value.includes(quote)) return;
    return { value, offset: start + quote.length };
  }
  const rust = /^(?:b|c)?r(#+)"([^"\n]*)"\1$/.exec(raw);
  if (rust) return { value: rust[2], offset: raw.indexOf('"') + 1 };
  if (scopes.some(s => /^string\.unquoted(?:\.|$)/.test(s))) {
    return { value: raw.trim(), offset: raw.length - raw.trimStart().length };
  }
  return undefined;
}

export function findFlags(text: string, grammar: IGrammar, names: ReadonlySet<string>, budgetMs = 100): Match[] {
  const matches: Match[] = [];
  let state: StateStack = INITIAL;
  let offset = 0;
  const started = Date.now();
  for (const line of text.split('\n')) {
    if (Date.now() - started > budgetMs) break;
    // A quote-looking substring inside a multiline literal is not a new string.
    const continuingScope = grammar.tokenizeLine('', state, 5).tokens[0]?.scopes.find(s => /^string\./.test(s));
    const result = grammar.tokenizeLine(line, state, Math.max(1, budgetMs - (Date.now() - started)));
    if (result.stoppedEarly) break;
    state = result.ruleStack;
    let group: { start: number; end: number; scope: string; scopes: string[]; invalid: boolean } | undefined;
    const finish = () => {
      if (!group || group.invalid) return;
      const content = literalContent(line.slice(group.start, group.end), group.scopes);
      if (content && names.has(content.value)) matches.push({ name: content.value, start: offset + group.start + content.offset, end: offset + group.start + content.offset + content.value.length });
    };
    for (const token of result.tokens) {
      const index = token.scopes.findIndex(s => /^string\./.test(s));
      const scope = index < 0 ? undefined : token.scopes[index];
      const invalid = token.scopes.some(s => /^(?:comment|invalid)(?:\.|$)/.test(s) || /^string\.regexp/.test(s)) ||
        token.scopes.slice(index + 1).some(s => /(?:interpol|embedded)/.test(s) || /^variable\./.test(s));
      if (!scope) { finish(); group = undefined; continue; }
      if (group && group.scope === scope && group.end === token.startIndex) {
        group.end = Math.min(token.endIndex, line.length);
        group.invalid ||= invalid;
      } else {
        finish();
        group = { start: token.startIndex, end: Math.min(token.endIndex, line.length), scope, scopes: token.scopes, invalid: invalid || (token.startIndex === 0 && continuingScope === scope) };
      }
    }
    finish();
    offset += line.length + 1;
  }
  return matches;
}
