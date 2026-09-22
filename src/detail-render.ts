import { renderHover } from './hover';
import type { Assessment, Flag } from './model';

const MarkdownIt = require('markdown-it') as new (options: { html: boolean; linkify: boolean }) => { render(markdown: string): string };
const markdown = new MarkdownIt({ html: false, linkify: false });
export function detailHtml(flag: Flag, result: Assessment, options: Parameters<typeof renderHover>[2]) {
  return markdown.render(renderHover(flag, result, { ...options, url: undefined }));
}
