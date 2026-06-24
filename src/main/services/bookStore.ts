/**
 * BookStore - persistence for generated books.
 *
 * Books are stored as plain JSON via electron-store. Dates are kept as ISO
 * strings so records round-trip cleanly through persistence and IPC.
 */

import Store from 'electron-store';

export type BookStatus = 'generating' | 'completed' | 'error' | 'cancelled';
export type ChapterStatus = 'pending' | 'generating' | 'completed' | 'error';

export interface StoredChapter {
  id: string;
  number: number;
  title: string;
  content: string;
  status: ChapterStatus;
  tokens: number; // total (in + out) for this chapter
  tokensIn: number;
  tokensOut: number;
}

export interface StoredBook {
  id: string;
  title: string;
  description: string;
  topic: string;
  style: string;
  length: string;
  provider: string;
  model: string;
  status: BookStatus;
  error?: string;
  chapters: StoredChapter[];
  totalTokens: number;
  tokensIn: number;
  tokensOut: number;
  createdAt: string;
  modifiedAt: string;
}

interface BookStoreSchema {
  books: Record<string, StoredBook>;
}

export class BookStore {
  private readonly store: Store<BookStoreSchema>;

  constructor() {
    this.store = new Store<BookStoreSchema>({
      name: 'bookforge-books',
      defaults: { books: {} },
    });
  }

  list(): StoredBook[] {
    return Object.values(this.store.get('books')).sort((a, b) =>
      b.modifiedAt.localeCompare(a.modifiedAt)
    );
  }

  get(id: string): StoredBook | null {
    return this.store.get('books')[id] ?? null;
  }

  save(book: StoredBook): void {
    const books = { ...this.store.get('books') };
    books[book.id] = book;
    this.store.set('books', books);
  }

  delete(id: string): void {
    const books = { ...this.store.get('books') };
    delete books[id];
    this.store.set('books', books);
  }
}

export const bookStore = new BookStore();
