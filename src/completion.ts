import type { IGrammar } from 'vscode-textmate';
import { findFlags } from './recognition';

// Verify the candidate literal with the same grammar used for highlighting.
// Replacing its content with a sentinel also supports unfinished strings.
export function completionRange(text: string, offset: number, grammar: IGrammar) {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const before = text.slice(lineStart, offset);
  const match = /(["'`])([^"'`\\\r\n]*)$/.exec(before);
  if (!match) return;
  const quote = match[1];
  const start = offset - match[2].length;
  const lineEnd = text.indexOf('\n', offset);
  const tail = text.slice(offset, lineEnd < 0 ? text.length : lineEnd);
  const close = tail.indexOf(quote);
  if (close < 0 && tail.trim()) return;
  const remainder = close < 0 ? '' : tail.slice(0, close);
  if (/[\\"'`]/.test(remainder)) return;
  const end = offset + remainder.length;
  if (close >= 0 && !findFlags(text, grammar, new Set([text.slice(start, end)])).some(m => m.start === start)) return;
  if (/[${}]/.test(text.slice(start, end))) return;
  const sentinel = '__unleash_completion__';
  const candidate = text.slice(0, start) + sentinel + (close < 0 ? quote : '') + text.slice(end);
  if (!findFlags(candidate, grammar, new Set([sentinel])).some(m => m.start === start)) return;
  return { start, end, quote };
}
export function safeCompletionName(name: string, quote: string) {
  return !/[\\\r\n${}]/.test(name) && !name.includes(quote) && !name.includes('${') && !name.includes('#{');
}
