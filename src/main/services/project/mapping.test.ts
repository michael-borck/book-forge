import { randomUUID } from 'crypto';
import type { StoredBook } from '../bookStore';
import {
  applyBookToProject,
  createEmptyProject,
  legacyBookToProject,
  projectToBook,
  projectWordCount,
} from './mapping';

function storedBook(): StoredBook {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: 'A Book',
    description: 'desc',
    topic: 'A topic',
    style: 'educational',
    length: 'short',
    provider: 'mock',
    model: 'mock-large',
    status: 'planned',
    chapters: [
      {
        id: randomUUID(),
        number: 1,
        title: 'One',
        synopsis: 'First brief',
        content: 'First chapter.',
        status: 'completed',
        tokens: 30,
        tokensIn: 10,
        tokensOut: 20,
      },
      {
        id: randomUUID(),
        number: 2,
        title: 'Two',
        content: '',
        status: 'pending',
        tokens: 0,
        tokensIn: 0,
        tokensOut: 0,
      },
    ],
    totalTokens: 30,
    tokensIn: 10,
    tokensOut: 20,
    createdAt: now,
    modifiedAt: now,
  };
}

describe('project mapping', () => {
  it('creates an empty project with compile profiles', () => {
    const project = createEmptyProject({ title: 'New', author: 'Ada' });
    expect(project.schemaVersion).toBe(2);
    expect(project.book.nodes).toHaveLength(0);
    expect(project.compileProfiles.map((p) => p.format)).toEqual(['markdown', 'html', 'pdf']);
    expect(project.author).toBe('Ada');
  });

  it('applies a template skeleton and settings', () => {
    const project = createEmptyProject({ title: 'Course', templateId: 'course' });
    expect(project.book.nodes).toHaveLength(6);
    expect(project.book.nodes[0]).toMatchObject({
      kind: 'chapter',
      status: 'pending',
      title: 'Why this matters',
    });
    expect(project.settings.style).toBe('educational');
    expect(project.settings.artStylePreset).toBe('technical-diagram');
  });

  it('round-trips a generated book through the node tree', () => {
    const project = createEmptyProject({ title: 'Book', topic: 'Topic' });
    const book = storedBook();

    applyBookToProject(project, book);

    expect(project.book.nodes.map((n) => n.title)).toEqual(['One', 'Two']);
    expect(project.book.nodes[0].synopsis).toBe('First brief');
    expect(project.book.status).toBe('planned');
    expect(projectWordCount(project)).toBe(2);

    const back = projectToBook(project);
    expect(back.chapters.map((c) => c.title)).toEqual(['One', 'Two']);
    expect(back.chapters[0].content).toBe('First chapter.');
    expect(back.chapters[1].status).toBe('pending');
  });

  it('preserves non-chapter nodes when applying a book', () => {
    const project = createEmptyProject({ title: 'Book' });
    project.book.nodes.push({
      id: randomUUID(),
      kind: 'front-matter',
      title: 'Preface',
      synopsis: '',
      content: 'Hello',
      parentId: null,
      order: 0,
      status: 'completed',
      wordCount: 1,
      tokensIn: 0,
      tokensOut: 0,
      keywords: [],
      createdAt: '',
      modifiedAt: '',
    });

    applyBookToProject(project, storedBook());

    expect(project.book.nodes.some((n) => n.kind === 'front-matter')).toBe(true);
    expect(project.book.nodes.filter((n) => n.kind === 'chapter')).toHaveLength(2);
  });

  it('converts a legacy book into a project', () => {
    const legacy = storedBook();
    const project = legacyBookToProject(legacy);

    expect(project.id).toBe(legacy.id);
    expect(project.book.nodes).toHaveLength(2);
    expect(project.book.nodes[0].tokensIn).toBe(10);
    expect(projectToBook(project).chapters[1].number).toBe(2);
  });
});
