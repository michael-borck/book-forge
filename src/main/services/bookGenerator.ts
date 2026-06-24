/**
 * BookGenerator - orchestrates book creation through the active provider:
 * generate an outline, then each chapter in sequence, persisting after every
 * step and reporting progress so the renderer can render live status.
 */

import { randomUUID } from 'crypto';
import type { ProviderManager } from './providers';
import type { GenerationParams } from '../../shared/types';
import { bookStore, type StoredBook, type StoredChapter } from './bookStore';
import { CHAPTERS_BY_LENGTH, parseOutline } from './outline';

export interface BookRequest {
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

export class BookGenerator {
  constructor(private manager: ProviderManager) {}

  async generate(
    req: BookRequest,
    onProgress: ProgressFn,
    shouldCancel?: (bookId: string) => boolean
  ): Promise<StoredBook> {
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

    const totalChapters = CHAPTERS_BY_LENGTH[req.length] ?? 5;
    const now = new Date().toISOString();
    const book: StoredBook = {
      id: randomUUID(),
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
      createdAt: now,
      modifiedAt: now,
    };
    bookStore.save(book);

    try {
      onProgress({
        bookId: book.id,
        status: 'generating',
        phase: 'outline',
        totalChapters,
        message: 'Generating outline…',
      });

      const titles = await this.generateOutline(req, totalChapters, model);
      book.chapters = titles.map((title, i) => ({
        id: randomUUID(),
        number: i + 1,
        title,
        content: '',
        status: 'pending',
        tokens: 0,
      }));
      this.touch(book);

      for (const chapter of book.chapters) {
        // Cancellation takes effect between chapters (an in-flight chapter
        // request finishes first).
        if (shouldCancel?.(book.id)) {
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

        try {
          const chunk = await this.generateChapter(req, book, chapter, model);
          chapter.content = chunk.content;
          chapter.tokens = chunk.usage?.totalTokens ?? chunk.tokens ?? 0;
          chapter.status = 'completed';
          book.totalTokens += chapter.tokens;
        } catch {
          chapter.status = 'error';
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
      book.status = 'error';
      book.error = error instanceof Error ? error.message : String(error);
      this.touch(book);
      onProgress({ bookId: book.id, status: 'error', phase: 'error', message: book.error });
      throw error;
    }
  }

  private touch(book: StoredBook): void {
    book.modifiedAt = new Date().toISOString();
    bookStore.save(book);
  }

  private async generateOutline(
    req: BookRequest,
    totalChapters: number,
    model: string
  ): Promise<string[]> {
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
    };
    const chunk = await this.manager.generate(params);
    const titles = parseOutline(chunk.content, totalChapters);
    if (titles.length === 0) {
      return Array.from({ length: totalChapters }, (_, i) => `Chapter ${i + 1}`);
    }
    return titles;
  }

  private async generateChapter(
    req: BookRequest,
    book: StoredBook,
    chapter: StoredChapter,
    model: string
  ) {
    const outline = book.chapters.map((c) => `${c.number}. ${c.title}`).join('\n');
    const params: GenerationParams = {
      model,
      messages: [
        {
          role: 'system',
          content: `You are writing a ${req.style} book about "${req.topic}". Write in Markdown. Do not repeat the book title or a chapter-number heading; start directly with the chapter body.`,
        },
        {
          role: 'user',
          content: `Full outline:\n${outline}\n\nWrite the complete content for Chapter ${chapter.number}: "${chapter.title}". Make it thorough and well-structured.`,
        },
      ],
      temperature: 0.7,
      maxTokens: 4000,
    };
    return this.manager.generate(params);
  }
}
