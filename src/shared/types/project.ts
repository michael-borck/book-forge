/**
 * Project model — the on-disk representation of a book in the workbench.
 *
 * A project is a folder containing project.json plus assets and snapshots.
 * `book.nodes` is an adjacency list (parentId + sibling order) so the binder can
 * grow parts and scenes without reshaping storage.
 */

import type { Artwork, ArtPlanMeta } from './artwork';

export type ProjectStatus =
  | 'draft'
  | 'planned'
  | 'generating'
  | 'completed'
  | 'error'
  | 'cancelled';

export type NodeKind =
  | 'part'
  | 'chapter'
  | 'scene'
  | 'front-matter'
  | 'back-matter'
  | 'research';

export type NodeStatus = 'pending' | 'generating' | 'completed' | 'error';

export interface ProjectSettings {
  topic: string;
  style: string;
  length: string;
  audience?: string;
  customInstructions?: string;
  artStylePreset?: string;
}

export interface BookNode {
  id: string;
  kind: NodeKind;
  title: string;
  /** One-line card text shown on the outline board. */
  synopsis: string;
  /** Markdown prose. Container nodes (parts) keep this empty. */
  content: string;
  parentId: string | null;
  /** Position among siblings. */
  order: number;
  status: NodeStatus;
  wordCount: number;
  tokensIn: number;
  tokensOut: number;
  keywords: string[];
  createdAt: string;
  modifiedAt: string;
}

export interface ProjectBook {
  id: string;
  status: ProjectStatus;
  provider: string;
  model: string;
  error?: string;
  topic: string;
  style: string;
  length: string;
  nodes: BookNode[];
  artworks: Artwork[];
  artPlan: ArtPlanMeta | null;
  totalTokens: number;
  tokensIn: number;
  tokensOut: number;
  createdAt: string;
  modifiedAt: string;
}

export type CompileFormat = 'markdown' | 'html' | 'pdf' | 'docx' | 'epub';

export interface CompileProfile {
  id: string;
  name: string;
  format: CompileFormat;
  includeKinds: NodeKind[];
  toc: boolean;
  metadata: {
    title: string;
    author: string;
    language: string;
  };
}

export interface Project {
  schemaVersion: 2;
  id: string;
  title: string;
  author: string;
  language: string;
  genre: string;
  description: string;
  createdAt: string;
  modifiedAt: string;
  lastOpenedAt: string;
  settings: ProjectSettings;
  book: ProjectBook;
  compileProfiles: CompileProfile[];
}

export interface ProjectSummary {
  id: string;
  title: string;
  author: string;
  description: string;
  status: ProjectStatus;
  wordCount: number;
  nodeCount: number;
  modifiedAt: string;
}

export type SnapshotReason = 'manual' | 'pre-ai-edit' | 'pre-regenerate' | 'pre-restore';

export interface Snapshot {
  id: string;
  projectId: string;
  nodeId: string;
  createdAt: string;
  reason: SnapshotReason;
  label?: string;
  title: string;
  content: string;
  wordCount: number;
}

export interface CreateProjectInput {
  title: string;
  author?: string;
  language?: string;
  genre?: string;
  topic?: string;
  style?: string;
  length?: string;
  templateId?: string;
}

export function createDefaultCompileProfiles(
  title: string,
  author: string,
  language = 'en'
): CompileProfile[] {
  const base = {
    includeKinds: ['front-matter', 'chapter', 'scene', 'back-matter'] as NodeKind[],
    toc: true,
    metadata: { title, author, language },
  };
  return [
    { id: 'compile-markdown', name: 'Markdown manuscript', format: 'markdown', ...base },
    { id: 'compile-html', name: 'HTML book', format: 'html', ...base },
    { id: 'compile-pdf', name: 'PDF book', format: 'pdf', ...base },
  ];
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
