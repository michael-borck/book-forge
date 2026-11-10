import { randomUUID } from 'crypto';
import type { BookNode, GenerationChunk, Project } from '../../../shared/types';
import { createEmptyProject } from '../project/mapping';
import type { ProviderManager } from '../providers';
import { ArtPlanner } from './ArtPlanner';

function chapter(title: string, order: number): BookNode {
  return {
    id: randomUUID(),
    kind: 'chapter',
    title,
    synopsis: `${title} brief`,
    content: '',
    parentId: null,
    order,
    status: 'pending',
    wordCount: 0,
    tokensIn: 0,
    tokensOut: 0,
    keywords: [],
    createdAt: '',
    modifiedAt: '',
  };
}

function project(): Project {
  const project = createEmptyProject({ title: 'Harbour Lights' });
  project.book.nodes = [chapter('Arrival', 0), chapter('The Storm', 1)];
  return project;
}

function chunk(content: string): GenerationChunk {
  return {
    id: 'chunk',
    content,
    tokens: 100,
    model: 'mock-large',
    timestamp: new Date(),
    usage: { promptTokens: 30, completionTokens: 70, totalTokens: 100 },
  };
}

function managerWith(content: string): ProviderManager {
  return {
    getCurrentProvider: () => ({
      info: { id: 'mock' },
      getAvailableModels: async () => [{ id: 'mock-large' }],
    }),
    getCurrentProviderId: () => 'mock',
    generate: jest.fn(async () => chunk(content)),
  } as unknown as ProviderManager;
}

describe('ArtPlanner', () => {
  it('creates a cover and one artwork per chapter', async () => {
    const plan = {
      styleBible: 'A weathered harbour town, cool blues, same lighthouse in every shot.',
      cover: { prompt: 'Lighthouse at dusk', alt: 'A lighthouse at dusk', caption: 'Harbour Lights' },
      chapters: [
        { index: 1, prompt: 'Arriving by boat', alt: 'A boat approaching the harbour' },
        { index: 2, prompt: 'Storm over the pier', alt: 'Waves crashing over a pier' },
      ],
    };
    const planner = new ArtPlanner(managerWith(`\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``));
    const result = await planner.plan(project());

    expect(result.artworks).toHaveLength(3);
    expect(result.artworks[0].placement).toBe('cover');
    expect(result.artworks.filter((a) => a.placement === 'chapter-opener')).toHaveLength(2);
    expect(result.meta.styleBible).toContain('lighthouse');
    expect(result.artworks.every((a) => a.status === 'planned')).toBe(true);
    expect(result.tokensIn).toBe(30);
  });

  it('falls back to chapter titles when the model returns invalid JSON', async () => {
    const planner = new ArtPlanner(managerWith('not json at all'));
    const result = await planner.plan(project());

    expect(result.artworks).toHaveLength(3);
    expect(result.artworks[1].prompt).toContain('Arrival');
    expect(result.meta.styleBible).toContain('Harbour Lights');
  });

  it('preserves generated artwork on replanning', async () => {
    const existingProject = project();
    const coverId = randomUUID();
    existingProject.book.artworks = [
      {
        id: coverId,
        nodeId: null,
        placement: 'cover',
        prompt: 'Old prompt',
        stylePreset: 'storybook',
        source: 'generated',
        status: 'ready',
        alt: 'Old cover',
        asset: {
          relativePath: `assets/images/${coverId}.webp`,
          mime: 'image/webp',
          width: 100,
          height: 100,
          bytes: 100,
        },
        createdAt: '',
      },
    ];

    const plan = {
      styleBible: 'Consistent style.',
      cover: { prompt: 'New cover prompt', alt: 'New cover' },
      chapters: [
        { index: 1, prompt: 'One', alt: 'One' },
        { index: 2, prompt: 'Two', alt: 'Two' },
      ],
    };
    const planner = new ArtPlanner(managerWith(JSON.stringify(plan)));
    const result = await planner.plan(existingProject);

    const cover = result.artworks.find((artwork) => artwork.placement === 'cover');
    expect(cover?.id).toBe(coverId);
    expect(cover?.status).toBe('ready');
    expect(cover?.prompt).toBe('New cover prompt');
  });
});
