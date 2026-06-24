/**
 * BookExporter - turns a stored book into Markdown, HTML, or PDF and writes it
 * to a user-chosen location via the native save dialog.
 *
 * PDF is produced with Electron's built-in `webContents.printToPDF` rendering
 * an offscreen window, so no external headless-browser dependency is needed.
 * HTML rendering/sanitisation lives in ./bookHtml (pure, unit-tested).
 */

import { app, dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { StoredBook } from './bookStore';
import { toMarkdown, toHtml } from './bookHtml';

export type ExportFormat = 'markdown' | 'html' | 'pdf';

interface ExportOutcome {
  canceled: boolean;
  path?: string;
}

const EXT: Record<ExportFormat, string> = { markdown: 'md', html: 'html', pdf: 'pdf' };

export class BookExporter {
  async export(book: StoredBook, format: ExportFormat): Promise<ExportOutcome> {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `${sanitizeFilename(book.title)}.${EXT[format]}`,
      filters: [{ name: format.toUpperCase(), extensions: [EXT[format]] }],
    });
    if (canceled || !filePath) return { canceled: true };

    if (format === 'markdown') {
      await fs.writeFile(filePath, toMarkdown(book), 'utf-8');
    } else if (format === 'html') {
      await fs.writeFile(filePath, toHtml(book), 'utf-8');
    } else {
      await fs.writeFile(filePath, await this.toPdf(book));
    }
    return { canceled: false, path: filePath };
  }

  private async toPdf(book: StoredBook): Promise<Buffer> {
    // Render the HTML in an offscreen window, then print it to PDF. A temp file
    // is used rather than a data: URL so large books don't hit URL length limits.
    const tmpFile = path.join(app.getPath('temp'), `bookforge-${book.id}.html`);
    await fs.writeFile(tmpFile, toHtml(book), 'utf-8');

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

export const bookExporter = new BookExporter();
