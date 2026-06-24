/**
 * Tests for export HTML rendering — especially that LLM-generated content can't
 * inject executable markup into an exported file.
 */

import { renderMarkdown, toHtml, EXPORT_CSP } from './bookHtml';
import type { StoredBook } from './bookStore';

function makeBook(content: string): StoredBook {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    title: 'Test Book',
    description: '',
    topic: 'Testing',
    style: 'educational',
    length: 'short',
    provider: 'mock',
    model: 'mock-1',
    status: 'completed',
    chapters: [
      { id: 'c1', number: 1, title: 'Intro', content, status: 'completed', tokens: 0 },
    ],
    totalTokens: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('renderMarkdown', () => {
  it('renders normal Markdown to HTML', () => {
    const html = renderMarkdown('# Heading\n\nSome **bold** text.');
    expect(html).toContain('<h1>Heading</h1>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('drops raw HTML, including script tags', () => {
    const html = renderMarkdown('Hello\n\n<script>alert(1)</script>\n\nWorld');
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
  });

  it('drops inline raw HTML', () => {
    const html = renderMarkdown('text <img src=x onerror=alert(1)> more')
    expect(html).not.toContain('onerror')
  });
});

describe('toHtml', () => {
  it('embeds a strict CSP that blocks scripts', () => {
    const html = toHtml(makeBook('Body content'));
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain(EXPORT_CSP);
    expect(EXPORT_CSP).toContain("default-src 'none'");
  });

  it('escapes the book title and strips script content from chapters', () => {
    const html = toHtml(makeBook('<script>steal()</script>'));
    expect(html).not.toContain('<script>steal()')
  });
});
