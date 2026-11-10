/**
 * ProjectStore - one folder per project under `<userData>/projects`.
 *
 * Layout:
 *   <root>/<projectId>/project.json
 *   <root>/<projectId>/snapshots/<id>.json
 *   <root>/<projectId>/assets/...
 *
 * Writes are atomic (temp file + rename) and serialised per project. The
 * generator is adapted through a synchronous BookRepository view so it can keep
 * its existing "save after every chapter" behaviour.
 */

import { promises as fs, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import * as path from 'path';
import type { CreateProjectInput, Project, ProjectSummary } from '../../../shared/types';
import type { StoredBook } from '../bookStore';
import {
  applyBookToProject,
  createEmptyProject,
  legacyBookToProject,
  normalizeProject,
  projectToBook,
  projectWordCount,
} from './mapping';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT_FILE = 'project.json';

export interface BookRepository {
  save(book: StoredBook): void;
  get(id: string): StoredBook | null;
}

export interface ProjectBookRepository extends BookRepository {
  load(): Project;
}

export interface ProjectStoreOptions {
  rootDir?: string;
  /** Injected in tests; defaults to the OS trash. */
  trash?: (target: string) => Promise<void>;
}

export class ProjectStore {
  private readonly rootDir: string;
  private readonly trashFn?: (target: string) => Promise<void>;
  private readonly writeQueues = new Map<string, Promise<void>>();

  constructor(options: ProjectStoreOptions = {}) {
    this.rootDir = options.rootDir ?? path.join(process.cwd(), '.bookforge-projects');
    this.trashFn = options.trash;
  }

  get root(): string {
    return this.rootDir;
  }

  /** Absolute folder for a project; validated like every other id->path use. */
  directory(id: string): string {
    return this.projectPath(id);
  }

  async list(): Promise<ProjectSummary[]> {
    await fs.mkdir(this.rootDir, { recursive: true });
    let entries: string[] = [];
    try {
      entries = await fs.readdir(this.rootDir);
    } catch {
      return [];
    }

    const summaries = await Promise.all(
      entries
        .filter((name) => UUID_RE.test(name))
        .map(async (id) => {
          try {
            const project = await this.get(id);
            return project ? toSummary(project) : null;
          } catch {
            return null;
          }
        })
    );

    return summaries
      .filter((summary): summary is ProjectSummary => summary !== null)
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  async get(id: string): Promise<Project | null> {
    const file = path.join(this.projectPath(id), PROJECT_FILE);
    try {
      const raw = await fs.readFile(file, 'utf8');
      return normalizeProject(JSON.parse(raw) as Project);
    } catch {
      return null;
    }
  }

  async create(input: CreateProjectInput): Promise<Project> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const project = createEmptyProject(input);
    await this.save(project);
    return project;
  }

  save(project: Project): Promise<void> {
    const previous = this.writeQueues.get(project.id) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => this.write(project));
    this.writeQueues.set(project.id, next);
    return next;
  }

  async delete(id: string): Promise<void> {
    const target = this.projectPath(id);
    if (!existsSync(target)) return;
    if (this.trashFn) {
      await this.trashFn(target);
      return;
    }
    await fs.rm(target, { recursive: true, force: true });
  }

  async duplicate(id: string): Promise<Project> {
    const source = await this.get(id);
    if (!source) throw new Error(`No project with id ${id}`);
    const copy: Project = JSON.parse(JSON.stringify(source));
    copy.id = randomUUID();
    copy.book.id = copy.id;
    copy.title = `${source.title} (copy)`;
    copy.createdAt = new Date().toISOString();
    copy.modifiedAt = copy.createdAt;
    copy.lastOpenedAt = copy.createdAt;
    copy.compileProfiles = copy.compileProfiles.map((profile) => ({
      ...profile,
      id: `${profile.id}-${copy.id.slice(0, 8)}`,
    }));
    await this.save(copy);
    return copy;
  }

  /** Synchronous repository view used by the generator for one project. */
  bookRepository(id: string): ProjectBookRepository {
    const project = this.getSync(id);
    return {
      get: () => projectToBook(project),
      save: (book) => {
        applyBookToProject(project, book);
        this.saveSync(project);
      },
      load: () => project,
    };
  }

  /**
   * Import books from the legacy electron-store. Idempotent; leaves the legacy
   * store untouched and writes a marker when the pass completes.
   */
  async migrateLegacy(books: StoredBook[]): Promise<number> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const marker = path.join(this.rootDir, '.migrated-from-books-v1');
    if (existsSync(marker)) return 0;

    let migrated = 0;
    let failures = 0;
    for (const book of books) {
      try {
        if (!UUID_RE.test(book.id)) continue;
        if (await this.get(book.id)) continue;
        await this.save(legacyBookToProject(book));
        migrated++;
      } catch (error) {
        failures++;
        console.warn(`Could not migrate legacy book ${book.id}:`, error);
      }
    }

    // Leave the marker off on failure so the next launch retries.
    if (failures === 0) {
      await fs.writeFile(marker, new Date().toISOString(), 'utf8');
    }
    return migrated;
  }

  private async write(project: Project): Promise<void> {
    const dir = this.projectPath(project.id);
    await fs.mkdir(dir, { recursive: true });
    project.modifiedAt = new Date().toISOString();
    project.book.modifiedAt = project.modifiedAt;
    const file = path.join(dir, PROJECT_FILE);
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(project, null, 2), 'utf8');
    await fs.rename(tmp, file);
  }

  private getSync(id: string): Project {
    const file = path.join(this.projectPath(id), PROJECT_FILE);
    const raw = readFileSync(file, 'utf8');
    return normalizeProject(JSON.parse(raw) as Project);
  }

  private saveSync(project: Project): void {
    const dir = this.projectPath(project.id);
    mkdirSync(dir, { recursive: true });
    project.modifiedAt = new Date().toISOString();
    project.book.modifiedAt = project.modifiedAt;
    const file = path.join(dir, PROJECT_FILE);
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(project, null, 2), 'utf8');
    renameSync(tmp, file);
  }

  private projectPath(id: string): string {
    if (!UUID_RE.test(id)) throw new Error('Invalid project id');
    const target = path.join(this.rootDir, id);
    const relative = path.relative(this.rootDir, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Invalid project path');
    }
    return target;
  }
}

function toSummary(project: Project): ProjectSummary {
  return {
    id: project.id,
    title: project.title,
    author: project.author,
    description: project.description,
    status: project.book.status,
    wordCount: projectWordCount(project),
    nodeCount: project.book.nodes.length,
    modifiedAt: project.modifiedAt,
  };
}


