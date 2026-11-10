/**
 * BookGenerator tests: end-to-end pipeline with a fake provider, true
 * cancellation mid-chapter, and retrying only failed chapters.
 *
 * The persistence layer is mocked so these run under plain Node without
 * Electron.
 */

jest.mock('./bookStore', () => {
  const books = new Map<string, unknown>();
  return {
    __mockBooks: books,
    bookStore: {
      save: (book: { id: string }) => books.set(book.id, JSON.parse(JSON.stringify(book))),
      get: (id: string) => books.get(id) ?? null,
      list: () => Array.from(books.values()),
      delete: (id: string) => {
        books.delete(id);
      },
    },
  };
});

import { randomUUID } from 'crypto';
import { BookGenerator, type BookProgress } from './bookGenerator';
import type { ProviderManager } from './providers';
import type { StoredBook } from './bookStore';
import type { GenerationChunk, GenerationParams } from '../../shared/types';

const mockBooks = (
  jest.requireMock('./bookStore') as { __mockBooks: Map<string, StoredBook> }
).__mockBooks;

function chunk(content: string): GenerationChunk {
  return {
    id: 'chunk',
    content,
    tokens: 20,
    model: 'mock-large',
    timestamp: new Date(),
    usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
  };
}

function managerWith(
  generate: (params: GenerationParams) => Promise<GenerationChunk>
): ProviderManager {
  return {
    setCurrentProvider: jest.fn(async () => undefined),
    getCurrentProvider: () => ({
      info: { id: 'mock' },
      getAvailableModels: async () => [{ id: 'mock-large' }],
    }),
    getCurrentProviderId: () => 'mock',
    generate: jest.fn(generate),
  } as unknown as ProviderManager;
}

function stubGenerate(): (params: GenerationParams) => Promise<GenerationChunk> {
  return async (params) => {
    const system = params.messages[0]?.content ?? '';
    const user = params.messages[params.messages.length - 1]?.content ?? '';
    if (user.includes('Create a chapter outline')) {
      return chunk('1. Alpha\n2. Beta\n3. Gamma');
    }
    if (system.includes('continuity summary')) {
      return chunk('Story so far.');
    }
    return chunk('Chapter body.');
  };
}

beforeEach(() => {
  mockBooks.clear();
});

describe('BookGenerator.generate', () => {
  it('writes every chapter and threads an abort signal through each request', async () => {
    const manager = managerWith(stubGenerate());
    const onProgress = jest.fn();
    const generator = new BookGenerator(manager);

    const book = await generator.generate(
      { topic: 'Testing', style: 'educational', length: 'short' },
      onProgress
    );

    expect(book.status).toBe('completed');
    expect(book.chapters).toHaveLength(3);
    expect(book.chapters.every((c) => c.status === 'completed')).toBe(true);
    expect(book.chapters[0].content).toBe('Chapter body.');
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'outline' })
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'done', status: 'completed' })
    );

    const calls = (manager.generate as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(4); // outline + 3 chapters
    for (const [params] of calls) {
      expect(params.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('aborts the in-flight chapter and saves a resumable book', async () => {
    const manager = managerWith(async (params) => {
      const user = params.messages[params.messages.length - 1]?.content ?? '';
      if (user.includes('Create a chapter outline')) {
        return chunk('1. Alpha\n2. Beta');
      }
      return new Promise<GenerationChunk>((_resolve, reject) => {
        const signal = params.signal!;
        const abort = () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        };
        if (signal.aborted) {
          abort();
          return;
        }
        signal.addEventListener('abort', abort, { once: true });
      });
    });

    let openChapter!: (progress: BookProgress) => void;
    const chapterStarted = new Promise<BookProgress>((resolve) => {
      openChapter = resolve;
    });
    const progress = (p: BookProgress) => {
      if (p.phase === 'chapter') openChapter(p);
    };

    const generator = new BookGenerator(manager);
    const pending = generator.generate(
      { topic: 'Testing', style: 'educational', length: 'short' },
      progress
    );

    const started = await chapterStarted;
    generator.cancel(started.bookId);
    const book = await pending;

    expect(book.status).toBe('cancelled');
    expect(book.chapters[0].status).toBe('pending');
    expect(book.chapters[1].status).toBe('pending');
  });
});

describe('BookGenerator.plan', () => {
  it('creates an outline with pending chapters that can then be written', async () => {
    const manager = managerWith(stubGenerate());
    const generator = new BookGenerator(manager);
    const id = randomUUID();

    const planned = await generator.plan({
      id,
      topic: 'Testing',
      style: 'educational',
      length: 'short',
    });

    expect(planned.id).toBe(id);
    expect(planned.status).toBe('planned');
    expect(planned.chapters).toHaveLength(3);
    expect(planned.chapters.every((c) => c.status === 'pending')).toBe(true);
    expect(mockBooks.get(id)?.status).toBe('planned');

    const written = await generator.retryFailed(id, jest.fn());

    expect(written.status).toBe('completed');
    expect(written.chapters.every((c) => c.status === 'completed')).toBe(true);
    expect(written.chapters[0].content).toBe('Chapter body.');
  });
});

describe('BookGenerator.retryFailed', () => {
  it('regenerates only chapters marked as failed', async () => {
    const seeded: StoredBook = {
      id: 'book-retry',
      title: 'Retry Book',
      description: '',
      topic: 'Testing',
      style: 'educational',
      length: 'short',
      provider: 'mock',
      model: 'mock-large',
      status: 'error',
      chapters: [
        {
          id: 'c1',
          number: 1,
          title: 'One',
          content: 'Already done.',
          status: 'completed',
          tokens: 30,
          tokensIn: 10,
          tokensOut: 20,
        },
        {
          id: 'c2',
          number: 2,
          title: 'Two',
          content: '',
          status: 'error',
          tokens: 0,
          tokensIn: 0,
          tokensOut: 0,
        },
      ],
      totalTokens: 30,
      tokensIn: 10,
      tokensOut: 20,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    };
    mockBooks.set(seeded.id, JSON.parse(JSON.stringify(seeded)));

    const manager = managerWith(async () => chunk('Regenerated chapter.'));
    const generator = new BookGenerator(manager);

    const book = await generator.retryFailed(seeded.id, jest.fn());

    expect(book.status).toBe('completed');
    expect(book.chapters[0].content).toBe('Already done.');
    expect(book.chapters[1].status).toBe('completed');
    expect(book.chapters[1].content).toBe('Regenerated chapter.');
    expect(book.tokensIn).toBe(22); // 10 kept + 12 regenerated
    expect(book.tokensOut).toBe(28); // 20 kept + 8 regenerated
    expect((manager.generate as jest.Mock).mock.calls[0][0].signal).toBeInstanceOf(
      AbortSignal
    );
  });

  it('does nothing when no chapter has failed', async () => {
    const healthy: StoredBook = {
      id: 'book-healthy',
      title: 'Healthy',
      description: '',
      topic: 'Testing',
      style: 'educational',
      length: 'short',
      provider: 'mock',
      model: 'mock-large',
      status: 'completed',
      chapters: [
        {
          id: 'c1',
          number: 1,
          title: 'One',
          content: 'Done.',
          status: 'completed',
          tokens: 0,
          tokensIn: 0,
          tokensOut: 0,
        },
      ],
      totalTokens: 0,
      tokensIn: 0,
      tokensOut: 0,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    };
    mockBooks.set(healthy.id, JSON.parse(JSON.stringify(healthy)));

    const manager = managerWith(async () => chunk('unused'));
    const book = await new BookGenerator(manager).retryFailed(healthy.id, jest.fn());

    expect(manager.generate).not.toHaveBeenCalled();
    expect(book.status).toBe('completed');
  });
});
