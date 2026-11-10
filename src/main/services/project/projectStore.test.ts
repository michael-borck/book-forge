import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ProjectStore } from './projectStore';
import type { StoredBook } from '../bookStore';

let root: string;
let store: ProjectStore;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'bookforge-projects-'));
  store = new ProjectStore({
    rootDir: root,
    trash: (target) => fs.rm(target, { recursive: true, force: true }),
  });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function legacyBook(): StoredBook {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: 'Legacy Book',
    description: '',
    topic: 'Legacy topic',
    style: 'casual',
    length: 'short',
    provider: 'mock',
    model: 'mock-small',
    status: 'completed',
    chapters: [
      {
        id: randomUUID(),
        number: 1,
        title: 'Only',
        content: 'Legacy content.',
        status: 'completed',
        tokens: 10,
        tokensIn: 4,
        tokensOut: 6,
      },
    ],
    totalTokens: 10,
    tokensIn: 4,
    tokensOut: 6,
    createdAt: now,
    modifiedAt: now,
  };
}

describe('ProjectStore', () => {
  it('creates, lists, reads, and updates projects', async () => {
    const project = await store.create({ title: 'My Book', topic: 'Testing' });
    expect(await store.get(project.id)).toMatchObject({ title: 'My Book' });

    const summaries = await store.list();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ id: project.id, title: 'My Book' });

    project.title = 'Renamed';
    await store.save(project);
    expect((await store.get(project.id))?.title).toBe('Renamed');
  });

  it('duplicates a project with fresh ids', async () => {
    const project = await store.create({ title: 'Original' });
    const copy = await store.duplicate(project.id);

    expect(copy.id).not.toBe(project.id);
    expect(copy.book.id).toBe(copy.id);
    expect(copy.title).toBe('Original (copy)');
    expect(await store.list()).toHaveLength(2);
  });

  it('exposes a synchronous repository the generator can write through', async () => {
    const project = await store.create({ title: 'Repo', topic: 'Repo topic' });
    const repo = store.bookRepository(project.id);

    const book = repo.get(project.id)!;
    book.status = 'completed';
    book.chapters = [
      {
        id: randomUUID(),
        number: 1,
        title: 'Generated',
        content: 'Written by the generator.',
        status: 'completed',
        tokens: 12,
        tokensIn: 5,
        tokensOut: 7,
      },
    ];
    book.tokensIn = 5;
    book.tokensOut = 7;
    repo.save(book);

    expect(repo.load().book.nodes[0].content).toBe('Written by the generator.');
    const onDisk = await store.get(project.id);
    expect(onDisk?.book.nodes[0].tokensOut).toBe(7);
  });

  it('migrates legacy books once', async () => {
    const legacy = legacyBook();
    expect(await store.migrateLegacy([legacy])).toBe(1);
    expect((await store.get(legacy.id))?.book.nodes[0].title).toBe('Only');
    expect(await store.migrateLegacy([legacy])).toBe(0);
    expect(await store.list()).toHaveLength(1);
  });

  it('rejects path traversal in project ids', () => {
    expect(() => store.directory('../../etc')).toThrow('Invalid project id');
    expect(() => store.directory('not-a-uuid')).toThrow('Invalid project id');
  });

  it('deletes project folders through the injected trash function', async () => {
    const project = await store.create({ title: 'Delete me' });
    await store.delete(project.id);
    expect(await store.get(project.id)).toBeNull();
    expect(await store.list()).toHaveLength(0);
  });
});
