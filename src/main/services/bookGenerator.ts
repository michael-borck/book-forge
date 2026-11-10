/**
 * BookGenerator - orchestrates book creation through the active provider:
 * generate an outline, then each chapter in sequence, persisting after every
 * step and reporting progress so the renderer can render live status.
 *
 * Chapters are written with rolling context (outline + summary of earlier
 * chapters + the tail of the previous chapter) rather than the outline alone, so
 * long books stay coherent. Generation is cancellable mid-request via
 * AbortController, and failed chapters can be retried without regenerating the
 * whole book.
 */

import { randomUUID } from 'crypto';
import type { ProviderManager } from './providers';
import type {
  CostEstimate,
  GenerationParams,
  GenerationChunk,
  IProvider,
} from '../../shared/types';
import { bookStore, type StoredBook, type StoredChapter } from './bookStore';
import type { BookRepository } from './project/projectStore';
import { CHAPTERS_BY_LENGTH, parseOutline } from './outline';
import { ContextBuilder } from './contextBuilder';

export interface BookRequest {
  /** Optional stable id (projects use their own id so progress events match). */
  id?: string;
  topic: string;
  style: string;
  length: string; // 'short' | 'medium' | 'long'
  providerId?: string;
  model?: string;
}

export interface BookProgress {
  bookId: string;
  status: StoredBook['status'];
  phase: 'outline' | 'chapter' | 'done' | 'error';
  currentChapter?: number;
  totalChapters?: number;
  chapterTitle?: string;
  message?: string;
}

export type ProgressFn = (p: BookProgress) => void;

export interface BookEstimate {
  providerId: string;
  model: string;
  chapters: number;
  tokensIn: number;
  tokensOut: number;
  cost: CostEstimate;
}

const MAX_CHAPTER_ATTEMPTS = 2;
const RETRY_DELAY_MS = 750;

/** Extract input/output token counts from a generation chunk's usage. */
function usageOf(chunk: GenerationChunk): { tokensIn: number; tokensOut: number } {
  return {
    tokensIn: chunk.usage?.promptTokens ?? 0,
    tokensOut: chunk.usage?.completionTokens ?? chunk.tokens ?? 0,
  };
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(): Error {
  const error = new Error('Generation cancelled');
  error.name = 'AbortError';
  return error;
}

export class BookGenerator {
  private readonly contextBuilder: ContextBuilder;
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private manager: ProviderManager,
    private readonly store: BookRepository = bookStore
  ) {
    this.contextBuilder = new ContextBuilder((params) => this.manager.generate(params));
  }

  /**
   * Abort an in-flight generation. Returns false when the book is not
   * currently generating (nothing to abort).
   */
  cancel(bookId: string): boolean {
    const controller = this.controllers.get(bookId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  private async resolveTarget(
    req: BookRequest
  ): Promise<{ provider: IProvider; model: string }> {
    if (req.providerId) {
      await this.manager.setCurrentProvider(req.providerId);
    }
    const provider = this.manager.getCurrentProvider();
    if (!provider) {
      throw new Error('No provider is configured. Add an API key in Settings first.');
    }

    let model = req.model;
    if (!model) {
      const models = await provider.getAvailableModels();
      model = models[0]?.id;
    }
    if (!model) {
      throw new Error('No model is available for the selected provider.');
    }

    return { provider, model };
  }

  /**
   * Rough, up-front cost estimate for a book request. Uses the provider's own
   * pricing table; providers without pricing return zero.
   */
  async estimate(req: BookRequest): Promise<BookEstimate> {
    const { provider, model } = await this.resolveTarget(req);
    const chapters = CHAPTERS_BY_LENGTH[req.length] ?? 5;

    // Outline, then per-chapter prompt + output. From chapter 3 onward, a
    // rolling summary call is also made (context + short output).
    let tokensIn = 250;
    let tokensOut = 800;
    for (let i = 1; i <= chapters; i++) {
      tokensIn += 2200 + (i >= 2 ? 700 : 0);
      tokensOut += 3000;
      if (i >= 3) {
        tokensIn += 1800;
        tokensOut += 250;
      }
    }

    return {
      providerId: provider.info.id,
      model,
      chapters,
      tokensIn,
      tokensOut,
      cost: provider.estimateCost(
        { promptTokens: tokensIn, completionTokens: tokensOut, totalTokens: tokensIn + tokensOut },
        model
      ),
    };
  }

  /**
   * Generate only the outline: creates a book with pending chapters and no
   * prose, so the user can review/edit the outline before spending on content.
   * `retryFailed` (or `generateFromPlan`) writes the pending chapters later.
   */
  async plan(req: BookRequest, onProgress?: ProgressFn): Promise<StoredBook> {
    const { provider, model } = await this.resolveTarget(req);
    const totalChapters = CHAPTERS_BY_LENGTH[req.length] ?? 5;
    const now = new Date().toISOString();

    const book: StoredBook = {
      id: req.id ?? randomUUID(),
      title: req.topic,
      description: '',
      topic: req.topic,
      style: req.style,
      length: req.length,
      provider: provider.info.id,
      model,
      status: 'planned',
      chapters: [],
      totalTokens: 0,
      tokensIn: 0,
      tokensOut: 0,
      createdAt: now,
      modifiedAt: now,
    };
    this.store.save(book);

    const controller = new AbortController();
    const { signal } = controller;
    this.controllers.set(book.id, controller);
    this.contextBuilder.reset(book.id);

    try {
      onProgress?.({
        bookId: book.id,
        status: 'planned',
        phase: 'outline',
        totalChapters,
        message: 'Generating outline…',
      });

      const outline = await this.generateOutline(req, totalChapters, model, signal);
      book.tokensIn = outline.tokensIn;
      book.tokensOut = outline.tokensOut;
      book.totalTokens = outline.tokensIn + outline.tokensOut;
      book.chapters = outline.titles.map((title, index) => ({
        id: randomUUID(),
        number: index + 1,
        title,
        synopsis: '',
        content: '',
        status: 'pending',
        tokens: 0,
        tokensIn: 0,
        tokensOut: 0,
      }));
      book.status = 'planned';
      this.touch(book);

      onProgress?.({
        bookId: book.id,
        status: 'planned',
        phase: 'done',
        totalChapters: book.chapters.length,
        message: 'Outline ready',
      });
      return book;
    } catch (error) {
      book.status = 'error';
      book.error = error instanceof Error ? error.message : String(error);
      this.touch(book);
      onProgress?.({
        bookId: book.id,
        status: 'error',
        phase: 'error',
        message: book.error,
      });
      throw error;
    } finally {
      this.controllers.delete(book.id);
    }
  }

  async generate(
    req: BookRequest,
    onProgress: ProgressFn,
    shouldCancel?: (bookId: string) => boolean
  ): Promise<StoredBook> {
    const { provider, model } = await this.resolveTarget(req);
    const totalChapters = CHAPTERS_BY_LENGTH[req.length] ?? 5;
    const now = new Date().toISOString();
    const book: StoredBook = {
      id: req.id ?? randomUUID(),
      title: req.topic,
      description: '',
      topic: req.topic,
      style: req.style,
      length: req.length,
      provider: provider.info.id,
      model,
      status: 'generating',
      chapters: [],
      totalTokens: 0,
      tokensIn: 0,
      tokensOut: 0,
      createdAt: now,
      modifiedAt: now,
    };
    this.store.save(book);

    const controller = new AbortController();
    const { signal } = controller;
    this.controllers.set(book.id, controller);
    this.contextBuilder.reset(book.id);

    try {
      onProgress({
        bookId: book.id,
        status: 'generating',
        phase: 'outline',
        totalChapters,
        message: 'Generating outline…',
      });

      let outline: { titles: string[]; tokensIn: number; tokensOut: number };
      try {
        outline = await this.generateOutline(req, totalChapters, model, signal);
      } catch (error) {
        if (this.wasCancelled(book.id, signal, shouldCancel)) {
          return this.markCancelled(book, onProgress);
        }
        throw error;
      }

      book.tokensIn += outline.tokensIn;
      book.tokensOut += outline.tokensOut;
      book.totalTokens = book.tokensIn + book.tokensOut;
      book.chapters = outline.titles.map((title, i) => ({
        id: randomUUID(),
        number: i + 1,
        title,
        content: '',
        status: 'pending',
        tokens: 0,
        tokensIn: 0,
        tokensOut: 0,
      }));
      this.touch(book);

      for (const chapter of book.chapters) {
        if (this.wasCancelled(book.id, signal, shouldCancel)) {
          return this.markCancelled(book, onProgress);
        }

        chapter.status = 'generating';
        this.touch(book);
        onProgress({
          bookId: book.id,
          status: 'generating',
          phase: 'chapter',
          currentChapter: chapter.number,
          totalChapters: book.chapters.length,
          chapterTitle: chapter.title,
        });

        const outcome = await this.writeChapter(
          req,
          book,
          chapter,
          model,
          signal,
          shouldCancel
        );
        if (outcome === 'cancelled') {
          chapter.status = 'pending';
          return this.markCancelled(book, onProgress);
        }

        this.touch(book);
      }

      const anyError = book.chapters.some((c) => c.status === 'error');
      book.status = anyError ? 'error' : 'completed';
      if (anyError) book.error = 'Some chapters failed to generate.';
      this.touch(book);

      onProgress({
        bookId: book.id,
        status: book.status,
        phase: 'done',
        totalChapters: book.chapters.length,
        message: anyError ? 'Completed with errors' : 'Done',
      });
      return book;
    } catch (error) {
      if (this.wasCancelled(book.id, signal, shouldCancel)) {
        return this.markCancelled(book, onProgress);
      }
      book.status = 'error';
      book.error = error instanceof Error ? error.message : String(error);
      this.touch(book);
      onProgress({ bookId: book.id, status: 'error', phase: 'error', message: book.error });
      throw error;
    } finally {
      this.controllers.delete(book.id);
    }
  }

  /**
   * Regenerate every chapter that is not complete (failed, pending, or left
   * over from a cancelled run). Successfully written chapters are untouched, so
   * this also serves as "resume". Returns the updated book.
   */
  async retryFailed(
    bookId: string,
    onProgress: ProgressFn,
    shouldCancel?: (bookId: string) => boolean
  ): Promise<StoredBook> {
    const book = this.store.get(bookId);
    if (!book) throw new Error(`No book with id ${bookId}`);

    const failed = book.chapters.filter((c) => c.status !== 'completed');
    if (failed.length === 0) return book;

    if (book.provider && book.provider !== this.manager.getCurrentProviderId()) {
      await this.manager.setCurrentProvider(book.provider);
    }
    const provider = this.manager.getCurrentProvider();
    if (!provider) {
      throw new Error('No provider is configured. Add an API key in Settings first.');
    }
    const model = book.model || (await provider.getAvailableModels())[0]?.id;
    if (!model) throw new Error('No model is available for the selected provider.');

    const req: BookRequest = {
      topic: book.topic,
      style: book.style,
      length: book.length,
      providerId: book.provider,
      model,
    };

    const controller = new AbortController();
    const { signal } = controller;
    this.controllers.set(bookId, controller);
    book.status = 'generating';
    book.error = undefined;
    this.touch(book);

    try {
      for (const chapter of failed) {
        if (this.wasCancelled(bookId, signal, shouldCancel)) {
          return this.markCancelled(book, onProgress);
        }

        // Discard any partial accounting from the failed attempt.
        book.tokensIn = Math.max(0, book.tokensIn - chapter.tokensIn);
        book.tokensOut = Math.max(0, book.tokensOut - chapter.tokensOut);
        book.totalTokens = book.tokensIn + book.tokensOut;
        chapter.tokensIn = 0;
        chapter.tokensOut = 0;
        chapter.tokens = 0;
        chapter.content = '';
        chapter.status = 'generating';
        this.touch(book);

        onProgress({
          bookId: book.id,
          status: 'generating',
          phase: 'chapter',
          currentChapter: chapter.number,
          totalChapters: book.chapters.length,
          chapterTitle: chapter.title,
          message: 'Retrying chapter…',
        });

        const outcome = await this.writeChapter(
          req,
          book,
          chapter,
          model,
          signal,
          shouldCancel
        );
        if (outcome === 'cancelled') {
          chapter.status = 'pending';
          return this.markCancelled(book, onProgress);
        }
        this.touch(book);
      }

      const anyError = book.chapters.some((c) => c.status === 'error');
      book.status = anyError ? 'error' : 'completed';
      book.error = anyError ? 'Some chapters failed to generate.' : undefined;
      this.touch(book);

      onProgress({
        bookId: book.id,
        status: book.status,
        phase: 'done',
        totalChapters: book.chapters.length,
        message: anyError ? 'Completed with errors' : 'Done',
      });
      return book;
    } catch (error) {
      if (this.wasCancelled(bookId, signal, shouldCancel)) {
        return this.markCancelled(book, onProgress);
      }
      book.status = 'error';
      book.error = error instanceof Error ? error.message : String(error);
      this.touch(book);
      onProgress({ bookId: book.id, status: 'error', phase: 'error', message: book.error });
      throw error;
    } finally {
      this.controllers.delete(bookId);
    }
  }

  private async writeChapter(
    req: BookRequest,
    book: StoredBook,
    chapter: StoredChapter,
    model: string,
    signal: AbortSignal,
    shouldCancel?: (bookId: string) => boolean
  ): Promise<'completed' | 'failed' | 'cancelled'> {
    for (let attempt = 1; attempt <= MAX_CHAPTER_ATTEMPTS; attempt++) {
      try {
        const result = await this.generateChapter(req, book, chapter, model, signal);
        const { tokensIn, tokensOut } = usageOf(result.chunk);
        chapter.content = result.chunk.content;
        chapter.tokensIn = tokensIn + result.contextTokensIn;
        chapter.tokensOut = tokensOut + result.contextTokensOut;
        chapter.tokens = chapter.tokensIn + chapter.tokensOut;
        chapter.status = 'completed';
        book.tokensIn += chapter.tokensIn;
        book.tokensOut += chapter.tokensOut;
        book.totalTokens = book.tokensIn + book.tokensOut;
        return 'completed';
      } catch (error) {
        if (this.wasCancelled(book.id, signal, shouldCancel)) {
          chapter.status = 'pending';
          return 'cancelled';
        }
        if (attempt >= MAX_CHAPTER_ATTEMPTS) {
          chapter.status = 'error';
          return 'failed';
        }
        try {
          await delay(RETRY_DELAY_MS * attempt, signal);
        } catch {
          chapter.status = 'pending';
          return 'cancelled';
        }
      }
    }
    chapter.status = 'error';
    return 'failed';
  }

  private touch(book: StoredBook): void {
    book.modifiedAt = new Date().toISOString();
    this.store.save(book);
  }

  private wasCancelled(
    bookId: string,
    signal: AbortSignal,
    shouldCancel?: (bookId: string) => boolean
  ): boolean {
    return signal.aborted || shouldCancel?.(bookId) === true;
  }

  private markCancelled(book: StoredBook, onProgress: ProgressFn): StoredBook {
    book.status = 'cancelled';
    this.touch(book);
    onProgress({
      bookId: book.id,
      status: 'cancelled',
      phase: 'done',
      totalChapters: book.chapters.length,
      message: 'Cancelled',
    });
    return book;
  }

  private async generateOutline(
    req: BookRequest,
    totalChapters: number,
    model: string,
    signal: AbortSignal
  ): Promise<{ titles: string[]; tokensIn: number; tokensOut: number }> {
    const params: GenerationParams = {
      model,
      messages: [
        { role: 'system', content: 'You are a professional book author and editor.' },
        {
          role: 'user',
          content: `Create a chapter outline for a ${req.style} book about "${req.topic}". Respond with EXACTLY ${totalChapters} chapter titles, one per line, numbered like "1. Title". Output only the list, no preamble.`,
        },
      ],
      temperature: 0.7,
      maxTokens: 1000,
      signal,
    };
    const chunk = await this.manager.generate(params);
    const { tokensIn, tokensOut } = usageOf(chunk);
    let titles = parseOutline(chunk.content, totalChapters);
    if (titles.length === 0) {
      titles = Array.from({ length: totalChapters }, (_, i) => `Chapter ${i + 1}`);
    }
    return { titles, tokensIn, tokensOut };
  }

  private async generateChapter(
    req: BookRequest,
    book: StoredBook,
    chapter: StoredChapter,
    model: string,
    signal: AbortSignal
  ): Promise<{
    chunk: GenerationChunk;
    contextTokensIn: number;
    contextTokensOut: number;
  }> {
    const context = await this.contextBuilder.build(book, chapter.number, { model, signal });
    const brief = chapter.synopsis?.trim();

    const params: GenerationParams = {
      model,
      messages: [
        {
          role: 'system',
          content: `You are writing a ${req.style} book about "${req.topic}". Write in Markdown. Continue naturally from the supplied continuity context. Do not repeat the book title or a chapter-number heading; start directly with the chapter body.`,
        },
        {
          role: 'user',
          content: `${context.text}\n\n${
            brief ? `Chapter brief: ${brief}\n\n` : ''
          }Write the complete content for Chapter ${chapter.number}: "${chapter.title}". Follow the outline, maintain continuity with the summary and the previous chapter, and make it thorough and well-structured.`,
        },
      ],
      temperature: 0.7,
      maxTokens: 4000,
      signal,
    };

    const chunk = await this.manager.generate(params);
    return {
      chunk,
      contextTokensIn: context.tokensIn,
      contextTokensOut: context.tokensOut,
    };
  }
}
