/**
 * Compile a project to a manuscript file, including artwork.
 *
 * Markdown copies images next to the output; HTML and PDF embed them as data
 * URLs so the result is self-contained; DOCX and EPUB are built by dedicated
 * renderers.
 */

import { dialog } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { CompileFormat, Project } from '../../../shared/types';
import { renderHtmlToPdf } from '../pdfRenderer';
import {
  buildCompiledDocument,
  compiledHtml,
  compiledMarkdown,
  type CompileOptions,
  type CompiledArtwork,
  type CompiledDocument,
} from './compiledDocument';
import { readArtworkAsset } from '../artwork/artworkAssets';
import { renderDocx } from './exporters/docxRenderer';
import { renderEpub } from './exporters/epubRenderer';

const EXT: Record<CompileFormat, string> = {
  markdown: 'md',
  html: 'html',
  pdf: 'pdf',
  docx: 'docx',
  epub: 'epub',
};

export interface CompileResult {
  canceled: boolean;
  path?: string;
  warnings?: string[];
}

export function compileExtension(format: CompileFormat): string {
  return EXT[format];
}

export async function compileProject(
  project: Project,
  format: CompileFormat,
  options: CompileOptions,
  projectDir: string,
  explicitPath?: string
): Promise<CompileResult> {
  let filePath = explicitPath;
  if (!filePath) {
    const choice = await dialog.showSaveDialog({
      defaultPath: `${sanitizeFilename(project.title)}.${EXT[format]}`,
      filters: [{ name: format.toUpperCase(), extensions: [EXT[format]] }],
    });
    if (choice.canceled || !choice.filePath) return { canceled: true };
    filePath = choice.filePath;
  }

  const document = buildCompiledDocument(project, options);

  if (format === 'markdown') {
    await writeMarkdown(document, filePath, projectDir);
  } else if (format === 'html') {
    const dataUrls = await collectDataUrls(document, projectDir);
    await fs.writeFile(
      filePath,
      compiledHtml(document, (relativePath) => dataUrls.get(relativePath) ?? relativePath),
      'utf-8'
    );
  } else if (format === 'pdf') {
    const dataUrls = await collectDataUrls(document, projectDir);
    const html = compiledHtml(
      document,
      (relativePath) => dataUrls.get(relativePath) ?? relativePath
    );
    await fs.writeFile(filePath, await renderHtmlToPdf(html, project.id));
  } else if (format === 'docx') {
    await fs.writeFile(filePath, await renderDocx(document, projectDir));
  } else {
    await fs.writeFile(filePath, await renderEpub(document, projectDir));
  }

  return {
    canceled: false,
    path: filePath,
    warnings: document.warnings.length ? document.warnings : undefined,
  };
}

async function writeMarkdown(
  document: CompiledDocument,
  filePath: string,
  projectDir: string
): Promise<void> {
  const base = path.basename(filePath, path.extname(filePath));
  const assetFolder = `${base}-assets`;
  const imageDir = path.join(path.dirname(filePath), assetFolder, 'images');
  const used = collectArtwork(document);
  const copied = new Set<string>();

  if (used.length > 0) await fs.mkdir(imageDir, { recursive: true });
  for (const artwork of used) {
    if (copied.has(artwork.relativePath)) continue;
    copied.add(artwork.relativePath);
    const source = await readArtworkAsset(projectDir, artwork.relativePath);
    await fs.writeFile(path.join(imageDir, path.basename(artwork.relativePath)), source);
  }

  const markdown = compiledMarkdown(
    document,
    (relativePath) => `${assetFolder}/images/${path.basename(relativePath)}`
  );
  await fs.writeFile(filePath, markdown, 'utf-8');
}

async function collectDataUrls(
  document: CompiledDocument,
  projectDir: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const artwork of collectArtwork(document)) {
    if (map.has(artwork.relativePath)) continue;
    const buffer = await readArtworkAsset(projectDir, artwork.relativePath);
    const mime = artwork.artwork.asset?.mime || 'image/webp';
    map.set(
      artwork.relativePath,
      `data:${mime};base64,${buffer.toString('base64')}`
    );
  }
  return map;
}

function collectArtwork(document: CompiledDocument): CompiledArtwork[] {
  return [
    ...(document.cover ? [document.cover] : []),
    ...document.entries.flatMap((entry) => entry.artworks),
  ];
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\d\-. ]+/g, '_').trim().slice(0, 120) || 'book';
}
