import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import JSZip from 'jszip';
import sharp from 'sharp';
import type { Artwork, BookNode, Project } from '../../../../shared/types';
import { createEmptyProject } from '../mapping';
import { buildCompiledDocument } from '../compiledDocument';
import { renderDocx } from './docxRenderer';
import { renderEpub } from './epubRenderer';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'bookforge-export-'));
  await fs.mkdir(path.join(root, 'assets', 'images'), { recursive: true });
  await sharp({
    create: { width: 120, height: 80, channels: 3, background: { r: 40, g: 80, b: 120 } },
  })
    .webp()
    .toFile(path.join(root, 'assets', 'images', 'art.webp'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function chapter(): BookNode {
  return {
    id: randomUUID(),
    kind: 'chapter',
    title: 'Arrival',
    synopsis: '',
    content: '# A heading\n\nSome **bold** prose.\n\n- one\n- two',
    parentId: null,
    order: 0,
    status: 'completed',
    wordCount: 8,
    tokensIn: 0,
    tokensOut: 0,
    keywords: [],
    createdAt: '',
    modifiedAt: '',
  };
}

function artwork(nodeId: string | null, placement: Artwork['placement']): Artwork {
  return {
    id: randomUUID(),
    nodeId,
    placement,
    prompt: 'Art',
    stylePreset: 'storybook',
    source: 'generated',
    status: 'ready',
    alt: 'An illustration',
    asset: {
      relativePath: 'assets/images/art.webp',
      mime: 'image/webp',
      width: 120,
      height: 80,
      bytes: 100,
    },
    createdAt: '',
  };
}

function project(): Project {
  const project = createEmptyProject({ title: 'Export Book', author: 'Ada' });
  const node = chapter();
  project.book.nodes = [node];
  project.book.artworks = [artwork(null, 'cover'), artwork(node.id, 'chapter-opener')];
  return project;
}

describe('DOCX export', () => {
  it('produces a valid archive containing the manuscript and an image', async () => {
    const buffer = await renderDocx(buildCompiledDocument(project()), root);
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files);

    expect(names).toContain('word/document.xml');
    expect(names.some((name) => name.startsWith('word/media/'))).toBe(true);
  });
});

describe('EPUB export', () => {
  it('produces an EPUB with nav, chapter, and image entries', async () => {
    const buffer = await renderEpub(buildCompiledDocument(project()), root);
    const zip = await JSZip.loadAsync(buffer);

    expect(await zip.file('mimetype')?.async('string')).toBe('application/epub+zip');
    expect(zip.file('OEBPS/content.opf')).toBeTruthy();
    expect(zip.file('OEBPS/nav.xhtml')).toBeTruthy();
    expect(zip.file('OEBPS/chapter-1.xhtml')).toBeTruthy();
    expect(zip.file('OEBPS/images/img-0.png')).toBeTruthy();

    const chapter = await zip.file('OEBPS/chapter-1.xhtml')?.async('string');
    expect(chapter).toContain('<h2 id="ch1">1. Arrival</h2>');
    expect(chapter).toContain('<img src="images/img-');
  });
});
