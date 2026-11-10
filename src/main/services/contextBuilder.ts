/**
 * ContextBuilder - assembles the rolling context sent to the model when writing
 * a chapter.
 *
 * A chapter needs three things beyond its own brief: the full outline, a compact
 * summary of everything written before the previous chapter, and the tail of the
 * previous chapter for voice continuity. The summary is generated incrementally
 * and cached per book so long books do not re-summarise their whole history for
 * every chapter.
 *
 * Kept free of Electron/persistence imports so it is unit-testable under plain
 * Node.
 */

import type { GenerationChunk, GenerationParams } from '../../shared/types';
import type { StoredBook, StoredChapter, StoredResearch } from './bookStore';

export interface ContextOptions {
  model: string;
  signal?: AbortSignal;
  /** Maximum tokens for the rolling summary call. */
  maxSummaryTokens?: number;
  /** Approximate tokens of the previous chapter to include verbatim. */
  tailTokens?: number;
}

export interface ContextResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

type GenerateFn = (params: GenerationParams) => Promise<GenerationChunk>;

interface CachedSummary {
  throughChapter: number;
  hash: string;
  summary: string;
}

// Roughly 4 characters per token for English prose. Good enough for budgeting;
// provider-reported usage is used for accounting.
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function tailText(text: string, tokens: number): string {
  const chars = Math.max(0, tokens * CHARS_PER_TOKEN);
  if (text.length <= chars) return text;
  return `…${text.slice(text.length - chars)}`;
}

/** Stable, non-cryptographic hash used only for cache invalidation. */
export function contentHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

export class ContextBuilder {
  private readonly summaries = new Map<string, CachedSummary>();

  constructor(private readonly generate: GenerateFn) {}

  /** Drop cached summaries for a book (or all books) after an edit. */
  reset(bookId?: string): void {
    if (bookId) this.summaries.delete(bookId);
    else this.summaries.clear();
  }

  async build(
    book: StoredBook,
    targetChapterNumber: number,
    options: ContextOptions
  ): Promise<ContextResult> {
    const outline = book.chapters
      .map((c) => `${c.number}. ${c.title}${c.content ? ' [written]' : ''}`)
      .join('\n');

    const prior = book.chapters.filter(
      (c) => c.number < targetChapterNumber && c.content.trim().length > 0
    );
    const target = book.chapters.find((c) => c.number === targetChapterNumber);
    const research = selectResearch(book.research, target);

    if (prior.length === 0) {
      return {
        text: [ `Book outline:\n${outline}`, research ]
          .filter(Boolean)
          .join('\n\n'),
        tokensIn: 0,
        tokensOut: 0,
      };
    }

    const latest = prior[prior.length - 1];
    const older = prior.slice(0, -1);

    let summary = '';
    let tokensIn = 0;
    let tokensOut = 0;

    if (older.length > 0) {
      const result = await this.summariseOlder(book, older, options);
      summary = result.summary;
      tokensIn += result.tokensIn;
      tokensOut += result.tokensOut;
    }

    const parts = [
      `Book outline:\n${outline}`,
      research,
      summary ? `Summary of earlier chapters:\n${summary}` : '',
      `End of Chapter ${latest.number} ("${latest.title}"):\n${tailText(
        latest.content,
        options.tailTokens ?? 800
      )}`,
    ].filter(Boolean);

    return { text: parts.join('\n\n'), tokensIn, tokensOut };
  }

  private async summariseOlder(
    book: StoredBook,
    older: StoredChapter[],
    options: ContextOptions
  ): Promise<{ summary: string; tokensIn: number; tokensOut: number }> {
    const last = older[older.length - 1];
    const hash = contentHash(older.map((c) => `${c.number}:${c.title}:${c.content}`).join('\n'));
    const cached = this.summaries.get(book.id);

    if (cached && cached.throughChapter === last.number && cached.hash === hash) {
      return { summary: cached.summary, tokensIn: 0, tokensOut: 0 };
    }

    const canExtend = cached && cached.throughChapter === last.number - 1;
    const source = canExtend
      ? `Existing summary of earlier chapters:\n${cached.summary}\n\nNew chapter:\nChapter ${last.number} — ${last.title}\n${truncate(last.content, 3000)}`
      : `Completed chapters:\n${older
          .map((c) => `Chapter ${c.number} — ${c.title}\n${truncate(c.content, 1200)}`)
          .join('\n\n')}`;

    const params: GenerationParams = {
      model: options.model,
      messages: [
        {
          role: 'system',
          content:
            'You maintain a continuity summary for a book in progress. Keep names, facts, decisions, settings, and unresolved threads. Write plain prose under 200 words. Do not add commentary or a heading.',
        },
        {
          role: 'user',
          content: `${source}\n\nUpdate the continuity summary so the next chapter can be written consistently.`,
        },
      ],
      temperature: 0.2,
      maxTokens: options.maxSummaryTokens ?? 400,
      signal: options.signal,
    };

    try {
      const chunk = await this.generate(params);
      const summary = chunk.content.trim();
      this.summaries.set(book.id, { throughChapter: last.number, hash, summary });
      return {
        summary,
        tokensIn: chunk.usage?.promptTokens ?? 0,
        tokensOut: chunk.usage?.completionTokens ?? chunk.tokens ?? 0,
      };
    } catch {
      // Summaries are an optimisation; a failure should not block the chapter.
      const fallback = older
        .map((c) => `Chapter ${c.number} — ${c.title}: ${truncate(c.content, 280)}`)
        .join('\n');
      this.summaries.set(book.id, { throughChapter: last.number, hash, summary: fallback });
      return { summary: fallback, tokensIn: 0, tokensOut: 0 };
    }
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

/**
 * Pick the most relevant research notes for a chapter by keyword overlap.
 * Returns a prompt block, or an empty string when there is nothing to add.
 */
export function selectResearch(
  research: StoredResearch[] | undefined,
  chapter: { title?: string; synopsis?: string } | undefined
): string {
  if (!research?.length) return '';

  const words = new Set(
    `${chapter?.title ?? ''} ${chapter?.synopsis ?? ''}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4)
  );

  const scored = research
    .map((note) => {
      const haystack = `${note.title} ${note.content}`.toLowerCase();
      let score = 0;
      for (const word of words) if (haystack.includes(word)) score++;
      return { note, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  const chosen = scored.length > 0 ? scored : research.slice(0, 1).map((note) => ({ note, score: 0 }));

  const blocks: string[] = [];
  let total = 0;
  for (const { note } of chosen) {
    const snippet = truncate(note.content.trim(), 2200);
    if (!snippet) continue;
    if (total + snippet.length > 4000) break;
    blocks.push(`Source: ${note.title}\n${snippet}`);
    total += snippet.length;
  }

  return blocks.length ? `Source material:\n${blocks.join('\n\n')}` : '';
}
