/**
 * Project → compiled manuscript. Handles reading order, front/back matter,
 * heading levels, chapter numbering, and the table of contents. Rendering to
 * Markdown/HTML lives here too so both compile and tests share one path.
 */

import type { Artwork, NodeKind, Project } from '../../../shared/types';
import { EXPORT_CSP, escapeHtml, renderMarkdown } from '../bookHtml';
import { flatten } from './tree';

export interface CompileOptions {
  toc?: boolean;
  frontMatter?: boolean;
  backMatter?: boolean;
  numbering?: boolean;
  includeEmpty?: boolean;
  title?: string;
  author?: string;
  language?: string;
}

export interface CompiledArtwork {
  artwork: Artwork;
  relativePath: string;
  alt: string;
  caption?: string;
}

export interface CompiledEntry {
  nodeId: string;
  kind: NodeKind;
  level: number;
  number?: number;
  title: string;
  markdown: string;
  artworks: CompiledArtwork[];
}

export interface CompiledTocEntry {
  level: number;
  title: string;
  number?: number;
}

export interface CompiledDocument {
  title: string;
  author: string;
  language: string;
  entries: CompiledEntry[];
  toc: CompiledTocEntry[];
  cover?: CompiledArtwork;
  warnings: string[];
}

const PROSE_KINDS: NodeKind[] = ['front-matter', 'chapter', 'scene', 'back-matter'];

export function buildCompiledDocument(
  project: Project,
  options: CompileOptions = {}
): CompiledDocument {
  const toc = options.toc ?? true;
  const includeFrontMatter = options.frontMatter ?? true;
  const includeBackMatter = options.backMatter ?? true;
  const numbering = options.numbering ?? true;
  const includeEmpty = options.includeEmpty ?? false;

  const entries: CompiledEntry[] = [];
  const warnings: string[] = [];
  const readyArtwork = project.book.artworks.filter(
    (artwork) => artwork.status === 'ready' && artwork.asset
  );
  let chapterNumber = 0;

  for (const { node } of flatten(project.book.nodes)) {
    if (node.kind === 'part') {
      entries.push({
        nodeId: node.id,
        kind: node.kind,
        level: 1,
        title: node.title,
        markdown: '',
        artworks: [],
      });
      continue;
    }

    if (!PROSE_KINDS.includes(node.kind)) continue;
    if (node.kind === 'front-matter' && !includeFrontMatter) continue;
    if (node.kind === 'back-matter' && !includeBackMatter) continue;
    if (!includeEmpty && !node.content.trim()) continue;

    const isChapter = node.kind === 'chapter';
    if (isChapter) chapterNumber++;
    const number = isChapter && numbering ? chapterNumber : undefined;

    const entryArtwork = readyArtwork
      .filter((artwork) => artwork.nodeId === node.id && artwork.placement !== 'cover')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((artwork) => toCompiledArtwork(artwork, warnings));

    entries.push({
      nodeId: node.id,
      kind: node.kind,
      level: node.kind === 'scene' ? 3 : 2,
      number,
      title: node.title,
      markdown: node.content,
      artworks: entryArtwork,
    });
  }

  const cover = readyArtwork.find((artwork) => artwork.placement === 'cover');

  return {
    title: options.title ?? project.title,
    author: options.author ?? project.author,
    language: options.language ?? project.language,
    entries,
    toc: toc
      ? entries.map((entry) => ({
          level: entry.level,
          title: entry.title,
          number: entry.number,
        }))
      : [],
    cover: cover ? toCompiledArtwork(cover, warnings) : undefined,
    warnings,
  };
}

function toCompiledArtwork(artwork: Artwork, warnings: string[]): CompiledArtwork {
  if (!artwork.alt.trim()) {
    warnings.push(`Artwork ${artwork.id} is missing alt text.`);
  }
  return {
    artwork,
    relativePath: artwork.asset!.relativePath,
    alt: artwork.alt.trim() || 'Book illustration',
    caption: artwork.caption,
  };
}

export function compiledMarkdown(
  document: CompiledDocument,
  assetUrl: (relativePath: string) => string = (relativePath) => relativePath
): string {
  const lines: string[] = [`# ${document.title}`, ''];
  if (document.author) lines.push(`_by ${document.author}_`, '');

  if (document.cover) {
    lines.push(`![${document.cover.alt}](${assetUrl(document.cover.relativePath)})`, '');
    if (document.cover.caption) lines.push(`_${document.cover.caption}_`, '');
  }

  if (document.toc.length > 0) {
    lines.push('## Contents', '');
    for (const entry of document.toc) {
      lines.push(`${'  '.repeat(Math.max(0, entry.level - 1))}- ${tocTitle(entry)}`);
    }
    lines.push('');
  }

  for (const entry of document.entries) {
    lines.push(`${'#'.repeat(entry.level)} ${tocTitle(entry)}`, '');
    for (const artwork of entry.artworks) {
      lines.push(`![${artwork.alt}](${assetUrl(artwork.relativePath)})`, '');
      if (artwork.caption) lines.push(`_${artwork.caption}_`, '');
    }
    if (entry.markdown.trim()) lines.push(entry.markdown.trim(), '');
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function compiledHtml(
  document: CompiledDocument,
  assetUrl?: (relativePath: string) => string
): string {
  const body = renderMarkdown(compiledMarkdown(document, assetUrl));
  return `<!DOCTYPE html>
<html lang="${escapeHtml(document.language || 'en')}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}">
<title>${escapeHtml(document.title)}</title>
<style>${COMPILED_CSS}</style>
</head>
<body>${body}</body>
</html>`;
}

function tocTitle(entry: { number?: number; title: string }): string {
  return entry.number ? `${entry.number}. ${entry.title}` : entry.title;
}

const COMPILED_CSS = `
  body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.6; max-width: 760px;
         margin: 2.5rem auto; padding: 0 1.25rem; color: #1a1a1a; }
  h1 { font-size: 2rem; margin-top: 3rem; }
  h2 { font-size: 1.5rem; margin-top: 2.5rem; }
  h3 { font-size: 1.2rem; margin-top: 2rem; }
  code { background: #f3f3f3; padding: 0.1em 0.3em; border-radius: 3px; }
  pre { background: #f3f3f3; padding: 1rem; overflow-x: auto; border-radius: 6px; }
  img { display: block; max-width: 100%; height: auto; margin: 1.5rem auto; border-radius: 4px; }
  @media print { h1, h2, h3 { break-after: avoid; } img { break-inside: avoid; } }
`;
