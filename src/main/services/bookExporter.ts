/**
 * BookExporter - turns a stored book into Markdown, HTML, or PDF and writes it
 * to a user-chosen location via the native save dialog.
 *
 * PDF is produced with Electron's built-in `webContents.printToPDF` rendering
 * an offscreen window, so no external headless-browser dependency is needed.
 */

import { app, dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import { marked } from 'marked';
import type { StoredBook } from './bookStore';

export type ExportFormat = 'markdown' | 'html' | 'pdf';

interface ExportOutcome {
  canceled: boolean;
  path?: string;
}

const EXT: Record<ExportFormat, string> = { markdown: 'md', html: 'html', pdf: 'pdf' };

const HTML_CSS = `
  body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.6; max-width: 760px;
         margin: 2rem auto; padding: 0 1.25rem; color: #1a1a1a; }
  h1 { font-size: 2rem; } h2 { font-size: 1.5rem; margin-top: 2.5rem; }
  h3 { font-size: 1.2rem; } code { background: #f3f3f3; padding: 0.1em 0.3em; border-radius: 3px; }
  pre { background: #f3f3f3; padding: 1rem; overflow-x: auto; border-radius: 6px; }
`;

export class BookExporter {
  async export(book: StoredBook, format: ExportFormat): Promise<ExportOutcome> {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `${sanitizeFilename(book.title)}.${EXT[format]}`,
      filters: [{ name: format.toUpperCase(), extensions: [EXT[format]] }],
    });
    if (canceled || !filePath) return { canceled: true };

    if (format === 'markdown') {
      await fs.writeFile(filePath, this.toMarkdown(book), 'utf-8');
    } else if (format === 'html') {
      await fs.writeFile(filePath, this.toHtml(book), 'utf-8');
    } else {
      await fs.writeFile(filePath, await this.toPdf(book));
    }
    return { canceled: false, path: filePath };
  }

  toMarkdown(book: StoredBook): string {
    const parts = [`# ${book.title}`, ''];
    for (const ch of book.chapters) {
      parts.push(`## ${ch.number}. ${ch.title}`, '', ch.content || '_(empty)_', '');
    }
    return parts.join('\n');
  }

  toHtml(book: StoredBook): string {
    const body = marked.parse(this.toMarkdown(book), { async: false }) as string;
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(book.title)}</title><style>${HTML_CSS}</style></head>
<body>${body}</body>
</html>`;
  }

  private async toPdf(book: StoredBook): Promise<Buffer> {
    // Render the HTML in an offscreen window, then print it to PDF. A temp file
    // is used rather than a data: URL so large books don't hit URL length limits.
    const tmpFile = path.join(app.getPath('temp'), `bookforge-${book.id}.html`);
    await fs.writeFile(tmpFile, this.toHtml(book), 'utf-8');

    const win = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, javascript: false, contextIsolation: true },
    });
    try {
      await win.loadFile(tmpFile);
      return await win.webContents.printToPDF({ printBackground: true });
    } finally {
      win.destroy();
      await fs.unlink(tmpFile).catch(() => undefined);
    }
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\d\-. ]+/g, '_').trim().slice(0, 120) || 'book';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const bookExporter = new BookExporter();
