/**
 * Import source material for grounding. Plain text/Markdown is read directly;
 * PDFs are extracted with unpdf (bundled PDF.js), imported dynamically because
 * unpdf is ESM-only while the main process is CommonJS.
 */

import { promises as fs } from 'fs';
import * as path from 'path';

const MAX_CHARS = 2_000_000;

interface UnpdfModule {
  extractText: (
    data: Uint8Array,
    options?: { mergePages?: boolean }
  ) => Promise<{ text: string | string[] }>;
}

// TypeScript's CommonJS build rewrites `import()` to require(), which cannot
// load an ESM-only package. Function keeps the native dynamic import.
// eslint-disable-next-line no-new-func
const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<UnpdfModule>;

export async function extractDocumentText(filePath: string): Promise<string> {
  const extension = path.extname(filePath).toLowerCase();
  let text: string;

  if (extension === '.txt' || extension === '.md' || extension === '.markdown') {
    text = await fs.readFile(filePath, 'utf8');
  } else if (extension === '.pdf') {
    const data = await fs.readFile(filePath);
    const { extractText } = await importEsm('unpdf');
    const result = await extractText(new Uint8Array(data), { mergePages: true });
    text = Array.isArray(result.text) ? result.text.join('\n\n') : result.text;
  } else {
    throw new Error(`Unsupported document type: ${extension || 'unknown'}`);
  }

  const cleaned = text.split('\u0000').join('').trim();
  if (!cleaned) throw new Error('The document contains no extractable text');
  return cleaned.slice(0, MAX_CHARS);
}
