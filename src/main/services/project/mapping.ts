/**
 * Conversion between the generator's flat `StoredBook` view and the project's
 * node tree. The generator stays unchanged; the project repository adapts.
 */

import { randomUUID } from 'crypto';
import type {
  BookNode,
  CreateProjectInput,
  Project,
  ProjectBook,
} from '../../../shared/types';
import {
  createDefaultCompileProfiles,
  getBookTemplate,
  wordCount,
} from '../../../shared/types';
import type { StoredBook, StoredChapter } from '../bookStore';
import { flatten } from './tree';

function nowIso(): string {
  return new Date().toISOString();
}

export function createEmptyProject(input: CreateProjectInput): Project {
  const now = nowIso();
  const title = input.title.trim() || 'Untitled book';
  const author = input.author?.trim() ?? '';
  const language = input.language?.trim() || 'en';
  const bookId = randomUUID();

  const book: ProjectBook = {
    id: bookId,
    status: 'draft',
    provider: '',
    model: '',
    topic: input.topic?.trim() || title,
    style: input.style || 'educational',
    length: input.length || 'short',
    nodes: [],
    artworks: [],
    artPlan: null,
    totalTokens: 0,
    tokensIn: 0,
    tokensOut: 0,
    createdAt: now,
    modifiedAt: now,
  };

  const template = getBookTemplate(input.templateId);
  if (template) {
    book.style = template.settings.style || book.style;
    book.length = template.settings.length || book.length;
    book.nodes = template.chapters.map((chapter, index) => ({
      id: randomUUID(),
      kind: 'chapter',
      title: chapter.title,
      synopsis: chapter.synopsis,
      content: '',
      parentId: null,
      order: index,
      status: 'pending',
      wordCount: 0,
      tokensIn: 0,
      tokensOut: 0,
      keywords: [],
      createdAt: now,
      modifiedAt: now,
    }));
  }

  return {
    schemaVersion: 2,
    id: randomUUID(),
    title,
    author,
    language,
    genre: input.genre?.trim() ?? '',
    description: '',
    createdAt: now,
    modifiedAt: now,
    lastOpenedAt: now,
    settings: {
      topic: book.topic,
      style: book.style,
      length: book.length,
      artStylePreset: template?.settings.artStylePreset ?? 'storybook',
    },
    book,
    compileProfiles: createDefaultCompileProfiles(title, author, language),
  };
}

export function legacyBookToProject(book: StoredBook): Project {
  const nodes: BookNode[] = book.chapters.map((chapter, index) => ({
    id: chapter.id,
    kind: 'chapter',
    title: chapter.title,
    synopsis: chapter.synopsis ?? '',
    content: chapter.content,
    parentId: null,
    order: index,
    status: chapter.status,
    wordCount: wordCount(chapter.content),
    tokensIn: chapter.tokensIn,
    tokensOut: chapter.tokensOut,
    keywords: [],
    createdAt: book.createdAt,
    modifiedAt: book.modifiedAt,
  }));

  return {
    schemaVersion: 2,
    id: book.id,
    title: book.title,
    author: '',
    language: 'en',
    genre: '',
    description: book.description,
    createdAt: book.createdAt,
    modifiedAt: book.modifiedAt,
    lastOpenedAt: book.modifiedAt,
    settings: {
      topic: book.topic,
      style: book.style,
      length: book.length,
    },
    book: {
      id: book.id,
      status: book.status,
      provider: book.provider,
      model: book.model,
      error: book.error,
      topic: book.topic,
      style: book.style,
      length: book.length,
      nodes,
      artworks: [],
      artPlan: null,
      totalTokens: book.totalTokens,
      tokensIn: book.tokensIn,
      tokensOut: book.tokensOut,
      createdAt: book.createdAt,
      modifiedAt: book.modifiedAt,
    },
    compileProfiles: createDefaultCompileProfiles(book.title, '', 'en'),
  };
}

/** Project → the flat view the generator and legacy exporters understand. */
export function projectToBook(project: Project): StoredBook {
  const chapters: StoredChapter[] = flatten(project.book.nodes)
    .map(({ node }) => node)
    .filter((node) => node.kind === 'chapter')
    .map((node, index) => ({
      id: node.id,
      number: index + 1,
      title: node.title,
      synopsis: node.synopsis,
      content: node.content,
      status: node.status,
      tokens: node.tokensIn + node.tokensOut,
      tokensIn: node.tokensIn,
      tokensOut: node.tokensOut,
    }));

  const research = project.book.nodes
    .filter((node) => node.kind === 'research')
    .map((node) => ({ id: node.id, title: node.title, content: node.content }));

  return {
    id: project.id,
    title: project.title,
    description: project.description,
    topic: project.settings.topic,
    style: project.settings.style,
    length: project.settings.length,
    provider: project.book.provider,
    model: project.book.model,
    status: project.book.status,
    error: project.book.error,
    chapters,
    research,
    totalTokens: project.book.totalTokens,
    tokensIn: project.book.tokensIn,
    tokensOut: project.book.tokensOut,
    createdAt: project.book.createdAt,
    modifiedAt: project.book.modifiedAt,
  };
}

/** Write a generated/retried book back into its project, preserving non-chapter nodes. */
export function applyBookToProject(project: Project, book: StoredBook): void {
  const now = nowIso();
  const existing = new Map(project.book.nodes.map((node) => [node.id, node]));
  const kept = project.book.nodes.filter(
    (node) => node.kind !== 'chapter' && node.kind !== 'scene'
  );

  const chapterNodes: BookNode[] = book.chapters.map((chapter, index) => {
    const previous = existing.get(chapter.id);
    return {
      id: chapter.id,
      kind: 'chapter',
      title: chapter.title,
      synopsis: chapter.synopsis ?? previous?.synopsis ?? '',
      content: chapter.content,
      parentId: previous?.parentId ?? null,
      order: previous?.order ?? index,
      status: chapter.status,
      wordCount: wordCount(chapter.content),
      tokensIn: chapter.tokensIn,
      tokensOut: chapter.tokensOut,
      keywords: previous?.keywords ?? [],
      createdAt: previous?.createdAt ?? now,
      modifiedAt: now,
    };
  });

  project.book.nodes = [...kept, ...chapterNodes];
  project.book.status = book.status;
  project.book.error = book.error;
  project.book.provider = book.provider;
  project.book.model = book.model;
  project.book.topic = book.topic;
  project.book.style = book.style;
  project.book.length = book.length;
  project.book.totalTokens = book.totalTokens;
  project.book.tokensIn = book.tokensIn;
  project.book.tokensOut = book.tokensOut;
  project.book.modifiedAt = now;
  project.settings.topic = book.topic;
  project.settings.style = book.style;
  project.settings.length = book.length;
  project.modifiedAt = now;
}

/** Fill fields added after schemaVersion 2 shipped (older projects on disk). */
export function normalizeProject(project: Project): Project {
  if (!Array.isArray(project.book.artworks)) project.book.artworks = [];
  if (project.book.artPlan === undefined) project.book.artPlan = null;
  if (!project.settings.artStylePreset) project.settings.artStylePreset = 'storybook';
  if (!project.compileProfiles) project.compileProfiles = [];
  return project;
}

export function projectWordCount(project: Project): number {
  return project.book.nodes.reduce((total, node) => total + node.wordCount, 0);
}

export function chapterNodes(project: Project): BookNode[] {
  return flatten(project.book.nodes)
    .map(({ node }) => node)
    .filter((node) => node.kind === 'chapter');
}
