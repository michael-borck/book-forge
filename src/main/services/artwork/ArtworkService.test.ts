import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { Artwork } from '../../../shared/types';
import { createEmptyProject } from '../project/mapping';
import { ImageProviderRegistry } from './ImageProviderRegistry';
import { ArtworkService } from './ArtworkService';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'bookforge-art-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function plannedArtwork(): Artwork {
  return {
    id: randomUUID(),
    nodeId: null,
    placement: 'cover',
    prompt: 'A lighthouse at dawn',
    stylePreset: 'watercolor',
    source: 'generated',
    status: 'planned',
    alt: 'A lighthouse at dawn',
    createdAt: new Date().toISOString(),
  };
}

describe('ArtworkService', () => {
  it('generates, normalises, and stores a cover image', async () => {
    const project = createEmptyProject({ title: 'Art Book' });
    const artwork = plannedArtwork();
    project.book.artworks = [artwork];

    const registry = new ImageProviderRegistry();
    await registry.initialize('mock', {});
    const service = new ArtworkService(registry, () => root);

    const result = await service.generate(project, artwork.id);

    expect(result.status).toBe('ready');
    expect(result.provider).toBe('mock');
    expect(result.asset?.relativePath).toBe(`assets/images/${artwork.id}.webp`);
    expect(result.asset?.width).toBeGreaterThan(0);

    const full = await fs.stat(path.join(root, 'assets', 'images', `${artwork.id}.webp`));
    const thumb = await fs.stat(path.join(root, 'assets', 'thumbnails', `${artwork.id}.webp`));
    expect(full.size).toBeGreaterThan(0);
    expect(thumb.size).toBeGreaterThan(0);
  });

  it('refuses to generate a disabled artwork', async () => {
    const project = createEmptyProject({ title: 'Art Book' });
    const artwork = { ...plannedArtwork(), status: 'disabled' as const };
    project.book.artworks = [artwork];

    const registry = new ImageProviderRegistry();
    await registry.initialize('mock', {});
    const service = new ArtworkService(registry, () => root);

    await expect(service.generate(project, artwork.id)).rejects.toThrow('disabled');
  });
});
