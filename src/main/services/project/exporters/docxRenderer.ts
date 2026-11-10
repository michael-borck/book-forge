/**
 * DOCX export from a CompiledDocument. Images are re-encoded to PNG because
 * docx only supports png/jpg/gif/bmp, while project assets are WebP.
 */

import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import sharp from 'sharp';
import type { CompiledArtwork, CompiledDocument } from '../compiledDocument';
import { readArtworkAsset } from '../../artwork/artworkAssets';

export async function renderDocx(
  document: CompiledDocument,
  projectDir: string
): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 300 },
      children: [new TextRun({ text: document.title, bold: true, size: 48 })],
    })
  );
  if (document.author) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `by ${document.author}`, italics: true, size: 26 })],
      })
    );
  }

  if (document.cover) {
    children.push(await imageParagraph(document.cover, projectDir, 560));
  }

  if (document.toc.length > 0) {
    children.push(
      new Paragraph({ text: 'Contents', heading: HeadingLevel.HEADING_1, pageBreakBefore: true })
    );
    for (const entry of document.toc) {
      const label = entry.number ? `${entry.number}. ${entry.title}` : entry.title;
      children.push(
        new Paragraph({
          indent: { left: Math.max(0, entry.level - 1) * 360 },
          children: [new TextRun({ text: label })],
        })
      );
    }
  }

  for (const entry of document.entries) {
    const heading =
      entry.level === 1
        ? HeadingLevel.HEADING_1
        : entry.level === 3
          ? HeadingLevel.HEADING_3
          : HeadingLevel.HEADING_2;
    children.push(
      new Paragraph({
        text: entry.number ? `${entry.number}. ${entry.title}` : entry.title,
        heading,
        pageBreakBefore: entry.kind === 'chapter',
      })
    );

    for (const artwork of entry.artworks) {
      children.push(await imageParagraph(artwork, projectDir, 520));
      if (artwork.caption) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: artwork.caption, italics: true, size: 20 })],
          })
        );
      }
    }

    children.push(...markdownToParagraphs(entry.markdown));
  }

  const doc = new Document({
    creator: document.author || 'BookForge',
    title: document.title,
    description: '',
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

async function imageParagraph(
  artwork: CompiledArtwork,
  projectDir: string,
  maxWidth: number
): Promise<Paragraph> {
  const source = await readArtworkAsset(projectDir, artwork.relativePath);
  const png = await sharp(source).png().toBuffer();
  const metadata = await sharp(png).metadata();
  const ratio = metadata.height && metadata.width ? metadata.height / metadata.width : 0.66;
  const width = Math.min(maxWidth, metadata.width ?? maxWidth);
  const height = Math.round(width * ratio);

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type: 'png',
        data: png,
        transformation: { width, height },
        altText: {
          title: artwork.alt,
          description: artwork.alt,
          name: artwork.alt,
        },
      }),
    ],
  });
}

/** Deliberately small Markdown subset: headings, bullets, code, paragraphs. */
function markdownToParagraphs(markdown: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = markdown.split('\n');
  let inCode = false;
  let code: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCode) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: code.join('\n'), font: 'Courier New', size: 20 })],
          })
        );
        code = [];
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      paragraphs.push(
        new Paragraph({
          text: stripInline(heading[2]),
          heading:
            level === 1
              ? HeadingLevel.HEADING_1
              : level === 2
                ? HeadingLevel.HEADING_2
                : HeadingLevel.HEADING_3,
        })
      );
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      paragraphs.push(
        new Paragraph({ text: stripInline(bullet[1]), bullet: { level: 0 } })
      );
      continue;
    }

    paragraphs.push(new Paragraph({ children: [new TextRun(stripInline(trimmed))] }));
  }

  if (code.length > 0) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: code.join('\n'), font: 'Courier New', size: 20 })],
      })
    );
  }
  return paragraphs;
}

function stripInline(text: string): string {
  return text
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
