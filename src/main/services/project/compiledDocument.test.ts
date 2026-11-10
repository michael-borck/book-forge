import { randomUUID } from 'crypto';
import type { BookNode, NodeKind, Project } from '../../../shared/types';
import { createEmptyProject } from './mapping';
import {
  buildCompiledDocument,
  compiledHtml,
  compiledMarkdown,
} from './compiledDocument';

function node(
  kind: NodeKind,
  title: string,
  content: string,
  parentId: string | null,
  order: number
): BookNode {
  return {
    id: randomUUID(),
    kind,
    title,
    synopsis: '',
    content,
    parentId,
    order,
    status: 'completed',
    wordCount: content.trim() ? content.trim().split(/\s+/).length : 0,
    tokensIn: 0,
    tokensOut: 0,
    keywords: [],
    createdAt: '',
    modifiedAt: '',
  };
}

function projectWithStructure(): Project {
  const project = createEmptyProject({ title: 'Compiled Book', author: 'Ada' });
  const part = node('part', 'Part One', '', null, 0);
  const chapterOne = node('chapter', 'First', 'First body.', part.id, 0);
  const scene = node('scene', 'A Scene', 'Scene body.', chapterOne.id, 0);
  const chapterTwo = node('chapter', 'Second', 'Second body.', part.id, 1);
  const empty = node('chapter', 'Empty', '', part.id, 2);
  project.book.nodes = [
    node('front-matter', 'Preface', 'Front text.', null, 0),
    part,
    chapterOne,
    scene,
    chapterTwo,
    empty,
    node('back-matter', 'Afterword', 'Back text.', null, 1),
  ];
  return project;
}

describe('compiled document', () => {
  it('orders entries and numbers chapters', () => {
    const document = buildCompiledDocument(projectWithStructure());

    expect(document.entries.map((entry) => entry.title)).toEqual([
      'Preface',
      'Part One',
      'First',
      'A Scene',
      'Second',
      'Afterword',
    ]);
    expect(document.entries.find((entry) => entry.title === 'First')?.number).toBe(1);
    expect(document.entries.find((entry) => entry.title === 'Second')?.number).toBe(2);
    expect(document.entries.find((entry) => entry.title === 'A Scene')?.level).toBe(3);
  });

  it('skips empty chapters and respects matter toggles', () => {
    const document = buildCompiledDocument(projectWithStructure(), {
      frontMatter: false,
      backMatter: false,
    });
    expect(document.entries.some((entry) => entry.title === 'Preface')).toBe(false);
    expect(document.entries.some((entry) => entry.title === 'Afterword')).toBe(false);
    expect(document.entries.some((entry) => entry.title === 'Empty')).toBe(false);
  });

  it('can disable the table of contents and numbering', () => {
    const document = buildCompiledDocument(projectWithStructure(), {
      toc: false,
      numbering: false,
    });
    expect(document.toc).toHaveLength(0);
    expect(document.entries.every((entry) => entry.number === undefined)).toBe(true);
  });

  it('renders a title page, contents, and body to Markdown', () => {
    const markdown = compiledMarkdown(buildCompiledDocument(projectWithStructure()));
    expect(markdown).toContain('# Compiled Book');
    expect(markdown).toContain('_by Ada_');
    expect(markdown).toContain('## Contents');
    expect(markdown).toContain('## 1. First');
    expect(markdown).toContain('First body.');
  });

  it('includes ready artwork and warns about missing alt text', () => {
    const project = projectWithStructure();
    const chapter = project.book.nodes.find((node) => node.title === 'First')!;
    project.book.artworks = [
      {
        id: randomUUID(),
        nodeId: null,
        placement: 'cover',
        prompt: 'Cover',
        stylePreset: 'storybook',
        source: 'generated',
        status: 'ready',
        alt: 'Cover art',
        asset: {
          relativePath: 'assets/images/cover.webp',
          mime: 'image/webp',
          width: 100,
          height: 150,
          bytes: 10,
        },
        createdAt: '',
      },
      {
        id: randomUUID(),
        nodeId: chapter.id,
        placement: 'chapter-opener',
        prompt: 'Chapter art',
        stylePreset: 'storybook',
        source: 'generated',
        status: 'ready',
        alt: '',
        asset: {
          relativePath: 'assets/images/chapter.webp',
          mime: 'image/webp',
          width: 100,
          height: 60,
          bytes: 10,
        },
        createdAt: '',
      },
    ];

    const document = buildCompiledDocument(project);
    expect(document.cover?.relativePath).toBe('assets/images/cover.webp');
    expect(document.entries.find((entry) => entry.title === 'First')?.artworks).toHaveLength(1);
    expect(document.warnings).toHaveLength(1);
    expect(document.warnings[0]).toContain('alt text');

    const markdown = compiledMarkdown(document);
    expect(markdown).toContain('![Cover art](assets/images/cover.webp)');
    expect(markdown).toContain('![Book illustration](assets/images/chapter.webp)');
  });

  it('renders HTML with a CSP and drops raw model HTML', () => {
    const project = projectWithStructure();
    project.book.nodes.push(
      node('chapter', 'Unsafe', '<script>alert(1)</script>\n\nSafe.', null, 9)
    );
    const html = compiledHtml(buildCompiledDocument(project));
    expect(html).toContain('Content-Security-Policy');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('Safe.');
  });
});
