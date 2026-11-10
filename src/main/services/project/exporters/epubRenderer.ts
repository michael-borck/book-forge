/**
 * EPUB 3 export from a CompiledDocument. Images are converted to PNG because
 * project assets are WebP and not every reading system accepts it.
 */

import { randomUUID } from 'crypto';
import JSZip from 'jszip';
import sharp from 'sharp';
import type { CompiledArtwork, CompiledDocument } from '../compiledDocument';
import { escapeHtml, renderMarkdown } from '../../bookHtml';
import { readArtworkAsset } from '../../artwork/artworkAssets';

interface ImageEntry {
  href: string;
  mediaType: string;
  data: Buffer;
}

export async function renderEpub(
  document: CompiledDocument,
  projectDir: string
): Promise<Buffer> {
  const zip = new JSZip();
  const images = new Map<string, ImageEntry>();
  let imageIndex = 0;

  const addImage = async (artwork: CompiledArtwork): Promise<string> => {
    const existing = images.get(artwork.relativePath);
    if (existing) return existing.href;
    const source = await readArtworkAsset(projectDir, artwork.relativePath);
    const png = await sharp(source).png().toBuffer();
    const href = `images/img-${imageIndex++}.png`;
    images.set(artwork.relativePath, { href, mediaType: 'image/png', data: png });
    return href;
  };

  const coverArtwork = document.cover;
  const coverHref = coverArtwork ? await addImage(coverArtwork) : null;

  const chapters: Array<{ href: string; title: string; xhtml: string }> = [];
  for (let index = 0; index < document.entries.length; index++) {
    const entry = document.entries[index];
    const href = `chapter-${index + 1}.xhtml`;
    const imagesHtml: string[] = [];
    for (const artwork of entry.artworks) {
      const imageHref = await addImage(artwork);
      imagesHtml.push(
        `<figure><img src="${imageHref}" alt="${escapeHtml(artwork.alt)}"/>${
          artwork.caption ? `<figcaption>${escapeHtml(artwork.caption)}</figcaption>` : ''
        }</figure>`
      );
    }
    const body = [
      `<h${entry.level} id="ch${index + 1}">${escapeHtml(
        entry.number ? `${entry.number}. ${entry.title}` : entry.title
      )}</h${entry.level}>`,
      ...imagesHtml,
      xhtmlMarkdown(entry.markdown),
    ].join('\n');
    chapters.push({
      href,
      title: entry.title,
      xhtml: xhtmlPage(document.language, entry.title, body),
    });
  }

  const navItems = chapters
    .map((chapter) => `<li><a href="${chapter.href}">${escapeHtml(chapter.title)}</a></li>`)
    .join('\n');
  const nav = xhtmlPage(
    document.language,
    'Contents',
    `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navItems}</ol></nav>`
  );

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
  );
  zip.file('OEBPS/nav.xhtml', nav);
  zip.file('OEBPS/style.css', EPUB_CSS);
  for (const chapter of chapters) zip.file(`OEBPS/${chapter.href}`, chapter.xhtml);

  if (coverArtwork && coverHref) {
    zip.file(
      'OEBPS/cover.xhtml',
      xhtmlPage(
        document.language,
        'Cover',
        `<div class="cover"><img src="${coverHref}" alt="${escapeHtml(coverArtwork.alt)}"/></div>`
      )
    );
  }

  for (const image of images.values()) {
    zip.file(`OEBPS/${image.href}`, image.data);
  }

  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
    ...chapters.map(
      (chapter, index) =>
        `<item id="ch${index + 1}" href="${chapter.href}" media-type="application/xhtml+xml"/>`
    ),
    ...Array.from(images.entries()).map(
      ([, image], index) =>
        `<item id="img${index}" href="${image.href}" media-type="${image.mediaType}"/>`
    ),
  ];
  if (coverArtwork && coverHref) {
    manifest.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
    manifest.push(
      `<item id="cover-image" href="${coverHref}" media-type="image/png" properties="cover-image"/>`
    );
  }

  const spine = [
    ...(coverArtwork ? ['<itemref idref="cover"/>'] : []),
    '<itemref idref="nav"/>',
    ...chapters.map((_, index) => `<itemref idref="ch${index + 1}"/>`),
  ].join('\n    ');

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${randomUUID()}</dc:identifier>
    <dc:title>${escapeHtml(document.title)}</dc:title>
    <dc:creator>${escapeHtml(document.author || 'Unknown')}</dc:creator>
    <dc:language>${escapeHtml(document.language || 'en')}</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    ${manifest.join('\n    ')}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`
  );

  return zip.generateAsync({
    type: 'nodebuffer',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

function xhtmlPage(language: string, title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeHtml(language || 'en')}">
<head><meta charset="utf-8"/><title>${escapeHtml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${body}</body>
</html>`;
}

function xhtmlMarkdown(markdown: string): string {
  return renderMarkdown(markdown)
    .replace(/<img([^>]*?)(?<!\/)>/g, '<img$1/>')
    .replace(/<br>/g, '<br/>')
    .replace(/<hr>/g, '<hr/>');
}

const EPUB_CSS = `
  body { font-family: Georgia, serif; line-height: 1.6; margin: 1.5rem; }
  h1, h2, h3 { line-height: 1.25; }
  figure { margin: 1.5rem 0; text-align: center; }
  img { max-width: 100%; height: auto; }
  figcaption { font-size: 0.85em; color: #555; font-style: italic; margin-top: 0.4rem; }
  .cover { text-align: center; margin: 0; padding: 0; }
  .cover img { max-height: 100vh; }
  pre { background: #f3f3f3; padding: 0.75rem; overflow-x: auto; }
`;
