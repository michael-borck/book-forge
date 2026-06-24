/**
 * Pure book -> Markdown/HTML rendering. No Electron/persistence imports (only a
 * type-only StoredBook import), so it is unit-testable under plain Node.
 *
 * Security: exported HTML carries a strict CSP and raw HTML emitted by the
 * model is dropped, so opening an exported file can't execute scripts.
 */

import { Marked } from 'marked';
import type { StoredBook } from './bookStore';

// No scripts (incl. javascript: URLs / inline handlers), no remote loads.
export const EXPORT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data:;";

const HTML_CSS = `
  body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.6; max-width: 760px;
         margin: 2rem auto; padding: 0 1.25rem; color: #1a1a1a; }
  h1 { font-size: 2rem; } h2 { font-size: 1.5rem; margin-top: 2.5rem; }
  h3 { font-size: 1.2rem; } code { background: #f3f3f3; padding: 0.1em 0.3em; border-radius: 3px; }
  pre { background: #f3f3f3; padding: 1rem; overflow-x: auto; border-radius: 6px; }
`;

export function toMarkdown(book: StoredBook): string {
  const parts = [`# ${book.title}`, ''];
  for (const ch of book.chapters) {
    parts.push(`## ${ch.number}. ${ch.title}`, '', ch.content || '_(empty)_', '');
  }
  return parts.join('\n');
}

export function toHtml(book: StoredBook): string {
  const body = renderMarkdown(toMarkdown(book));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}">
<title>${escapeHtml(book.title)}</title>
<style>${HTML_CSS}</style>
</head>
<body>${body}</body>
</html>`;
}

/** Render Markdown to HTML, dropping any raw HTML the model emitted. */
export function renderMarkdown(md: string): string {
  const renderer = new Marked();
  renderer.use({ renderer: { html: () => '' } });
  return renderer.parse(md, { async: false }) as string;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
