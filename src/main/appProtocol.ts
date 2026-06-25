/**
 * Custom `app://` protocol for serving the packaged static export.
 *
 * In production the renderer is a Next.js static export whose assets are
 * referenced with absolute paths (`/_next/...`). Those don't resolve over
 * `file://`, so we serve the bundle from a standard custom scheme instead, where
 * absolute paths resolve against the app origin. Source can stay on any volume.
 */

import { protocol } from 'electron';
import { promises as fs, existsSync, statSync } from 'fs';
import * as path from 'path';

export const APP_SCHEME = 'app';
export const APP_INDEX_URL = `${APP_SCHEME}://bundle/index.html`;

// The static export lives next to the compiled main process: dist/renderer/out.
const OUT_DIR = path.normalize(path.join(__dirname, '../renderer/out'));

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
};

// Must be called before app `ready`.
export function registerAppProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
}

// Must be called after app `ready`. `csp` is attached to served HTML documents.
export function registerAppProtocol(csp: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const filePath = resolveAppPath(request.url);
    if (!filePath) return new Response('Not Found', { status: 404 });

    try {
      const data = await fs.readFile(filePath);
      const type = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
      const headers: Record<string, string> = { 'Content-Type': type };
      if (type === 'text/html') headers['Content-Security-Policy'] = csp;
      return new Response(new Uint8Array(data), { headers });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  });
}

// Map an app:// URL to a file inside the export, guarding against traversal and
// falling back to a route's .html (or index.html) for client-side routes.
function resolveAppPath(requestUrl: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(new URL(requestUrl).pathname);
  } catch {
    return null;
  }
  if (rel === '/' || rel === '') rel = '/index.html';

  const candidate = path.normalize(path.join(OUT_DIR, rel));
  // Reject anything that escapes the export directory.
  if (candidate !== OUT_DIR && !candidate.startsWith(OUT_DIR + path.sep)) return null;

  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;

  if (!path.extname(candidate)) {
    if (existsSync(`${candidate}.html`)) return `${candidate}.html`;
    const indexHtml = path.join(candidate, 'index.html');
    if (existsSync(indexHtml)) return indexHtml;
    // SPA fallback for client-side routes.
    return path.join(OUT_DIR, 'index.html');
  }
  return null;
}
