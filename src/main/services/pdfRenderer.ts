/**
 * Render a self-contained HTML document to PDF using Electron's offscreen
 * BrowserWindow. Shared by the legacy exporter and the project compiler.
 */

import { app, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';

export async function renderHtmlToPdf(html: string, key: string): Promise<Buffer> {
  const tmpFile = path.join(
    app.getPath('temp'),
    `bookforge-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.html`
  );
  await fs.writeFile(tmpFile, html, 'utf-8');

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
