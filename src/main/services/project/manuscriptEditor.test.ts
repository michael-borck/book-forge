import { randomUUID } from 'crypto';
import type { BookNode, Project } from '../../../shared/types';
import { createEmptyProject } from './mapping';
import { buildEditPrompt } from './manuscriptEditor';

function chapter(title: string, content: string, order: number): BookNode {
  return {
    id: randomUUID(),
    kind: 'chapter',
    title,
    synopsis: `${title} brief`,
    content,
    parentId: null,
    order,
    status: 'completed',
    wordCount: content ? 1 : 0,
    tokensIn: 0,
    tokensOut: 0,
    keywords: [],
    createdAt: '',
    modifiedAt: '',
  };
}

function project(): Project {
  const project = createEmptyProject({ title: 'Book' });
  project.book.nodes = [chapter('One', 'First chapter body.', 0), chapter('Two', 'Second chapter body.', 1)];
  return project;
}

describe('buildEditPrompt', () => {
  it('includes the outline, previous chapter tail, current content, and instruction', () => {
    const p = project();
    const target = p.book.nodes[1];

    const prompt = buildEditPrompt(p, target, 'refine', 'Use plainer language');

    expect(prompt).toContain('- One: One brief');
    expect(prompt).toContain('First chapter body.');
    expect(prompt).toContain('Second chapter body.');
    expect(prompt).toContain('Improve clarity');
    expect(prompt).toContain('Use plainer language');
  });

  it('uses the brief instead of current content when regenerating', () => {
    const p = project();
    const target = p.book.nodes[1];

    const prompt = buildEditPrompt(p, target, 'regenerate');

    expect(prompt).toContain('Chapter brief: Two brief');
    expect(prompt).not.toContain('Current content:');
  });

  it('asks for continuation without repeating text', () => {
    const p = project();
    const prompt = buildEditPrompt(p, p.book.nodes[0], 'continue');
    expect(prompt).toContain('Continue the chapter naturally');
    expect(prompt).toContain('Do not repeat existing text');
  });
});
