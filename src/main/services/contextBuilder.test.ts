/**
 * Unit tests for the rolling-context builder: budget shaping, summary caching,
 * cache invalidation, cancellation passthrough, and graceful fallback.
 */

import { ContextBuilder, contentHash, estimateTokens, tailText } from './contextBuilder';
import type { StoredBook, StoredChapter } from './bookStore';
import type { GenerationChunk, GenerationParams } from '../../shared/types';

function chapter(number: number, title: string, content: string): StoredChapter {
  return {
    id: `chapter-${number}`,
    number,
    title,
    content,
    status: 'completed',
    tokens: 0,
    tokensIn: 0,
    tokensOut: 0,
  };
}

function bookWith(chapters: StoredChapter[]): StoredBook {
  return {
    id: 'book-1',
    title: 'Test Book',
    description: '',
    topic: 'Testing',
    style: 'educational',
    length: 'long',
    provider: 'mock',
    model: 'mock-large',
    status: 'generating',
    chapters,
    totalTokens: 0,
    tokensIn: 0,
    tokensOut: 0,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
  };
}

function chunk(content: string): GenerationChunk {
  return {
    id: 'chunk',
    content,
    tokens: 10,
    model: 'mock-large',
    timestamp: new Date(),
    usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
  };
}

describe('context helpers', () => {
  it('estimates tokens from character length', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(401))).toBe(101);
  });

  it('returns the whole string when it fits and a tail otherwise', () => {
    expect(tailText('short', 100)).toBe('short');
    const long = 'x'.repeat(100);
    const tail = tailText(long, 5);
    expect(tail.endsWith('x'.repeat(20))).toBe(true);
    expect(tail.startsWith('…')).toBe(true);
  });

  it('produces stable content hashes', () => {
    expect(contentHash('hello')).toBe(contentHash('hello'));
    expect(contentHash('hello')).not.toBe(contentHash('hello!'));
  });
});

describe('ContextBuilder', () => {
  it('returns only the outline when there is no prior prose', async () => {
    const generate = jest.fn();
    const builder = new ContextBuilder(generate);
    const book = bookWith([chapter(1, 'Intro', ''), chapter(2, 'Body', '')]);

    const result = await builder.build(book, 1, { model: 'mock-large' });

    expect(generate).not.toHaveBeenCalled();
    expect(result.text).toContain('Book outline:');
    expect(result.text).toContain('1. Intro');
    expect(result.tokensIn).toBe(0);
  });

  it('includes the previous chapter tail without summarising a single chapter', async () => {
    const generate = jest.fn();
    const builder = new ContextBuilder(generate);
    const book = bookWith([chapter(1, 'Intro', 'Once upon a time.'), chapter(2, 'Body', '')]);

    const result = await builder.build(book, 2, { model: 'mock-large' });

    expect(generate).not.toHaveBeenCalled();
    expect(result.text).toContain('End of Chapter 1 ("Intro")');
    expect(result.text).toContain('Once upon a time.');
  });

  it('summarises older chapters and caches the result', async () => {
    const generate = jest.fn(async () => chunk('A compact summary.'));
    const builder = new ContextBuilder(generate);
    const book = bookWith([
      chapter(1, 'One', 'First chapter content.'),
      chapter(2, 'Two', 'Second chapter content.'),
      chapter(3, 'Three', 'Third chapter content.'),
      chapter(4, 'Four', ''),
    ]);

    const first = await builder.build(book, 4, { model: 'mock-large' });
    const second = await builder.build(book, 4, { model: 'mock-large' });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(first.text).toContain('A compact summary.');
    expect(second.tokensIn).toBe(0);
    expect(first.tokensIn).toBe(12);
    expect(first.tokensOut).toBe(8);
  });

  it('invalidates the summary when an earlier chapter changes', async () => {
    const generate = jest.fn(async () => chunk('A compact summary.'));
    const builder = new ContextBuilder(generate);
    const book = bookWith([
      chapter(1, 'One', 'First chapter content.'),
      chapter(2, 'Two', 'Second chapter content.'),
      chapter(3, 'Three', 'Third chapter content.'),
      chapter(4, 'Four', ''),
    ]);

    await builder.build(book, 4, { model: 'mock-large' });
    book.chapters[0].content = 'Rewritten first chapter.';
    await builder.build(book, 4, { model: 'mock-large' });

    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('passes the abort signal to the summary request', async () => {
    const generate = jest.fn(async (_params: GenerationParams) => chunk('Summary.'));
    const builder = new ContextBuilder(generate);
    const controller = new AbortController();
    const book = bookWith([
      chapter(1, 'One', 'First chapter content.'),
      chapter(2, 'Two', 'Second chapter content.'),
      chapter(3, 'Three', ''),
    ]);

    await builder.build(book, 3, { model: 'mock-large', signal: controller.signal });

    expect(generate.mock.calls[0][0].signal).toBe(controller.signal);
  });

  it('includes the most relevant research note for the chapter', async () => {
    const builder = new ContextBuilder(jest.fn());
    const book = bookWith([
      chapter(1, 'Lighthouse Arrival', ''),
      chapter(2, 'Harbour History', ''),
    ]);
    book.research = [
      { id: 'r1', title: 'Harbour notes', content: 'The lighthouse was built in 1898.' },
      { id: 'r2', title: 'Unrelated', content: 'A note about mountain trails.' },
    ];

    const result = await builder.build(book, 1, { model: 'mock-large' });

    expect(result.text).toContain('Source material:');
    expect(result.text).toContain('The lighthouse was built in 1898.');
    expect(result.text).not.toContain('mountain trails');
  });

  it('falls back to an extractive summary when summarisation fails', async () => {
    const generate = jest.fn(async () => {
      throw new Error('summary failed');
    });
    const builder = new ContextBuilder(generate);
    const book = bookWith([
      chapter(1, 'One', 'First chapter content.'),
      chapter(2, 'Two', 'Second chapter content.'),
      chapter(3, 'Three', ''),
    ]);

    const result = await builder.build(book, 3, { model: 'mock-large' });

    expect(result.text).toContain('Chapter 1 — One');
    expect(result.text).toContain('Second chapter content.');
  });
});
