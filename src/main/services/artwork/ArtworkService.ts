/**
 * ArtworkService - turns a planned artwork record into a stored image:
 * provider call → sharp normalisation → project asset files.
 */

import type { Artwork, Project } from '../../../shared/types';
import type { ImageProviderRegistry } from './ImageProviderRegistry';
import { processImage } from './imageProcessing';
import { writeArtworkAssets } from './artworkAssets';
import { buildArtworkPrompt } from './stylePresets';

export class ArtworkService {
  constructor(
    private readonly registry: ImageProviderRegistry,
    private readonly projectDirectory: (projectId: string) => string
  ) {}

  async generate(
    project: Project,
    artworkId: string,
    signal?: AbortSignal
  ): Promise<Artwork> {
    const artwork = project.book.artworks.find((candidate) => candidate.id === artworkId);
    if (!artwork) throw new Error(`No artwork with id ${artworkId}`);
    if (artwork.status === 'disabled') throw new Error('Artwork is disabled');

    const provider = this.registry.getCurrent();
    if (!provider) {
      throw new Error('No image provider is configured. Add one in Settings first.');
    }

    const stylePreset =
      project.book.artPlan?.stylePreset ||
      artwork.stylePreset ||
      project.settings.artStylePreset ||
      'storybook';
    const styleBible = project.book.artPlan?.styleBible || artwork.styleBibleSnapshot;
    const prompt = buildArtworkPrompt(artwork.prompt, stylePreset, styleBible);

    const size =
      artwork.placement === 'cover'
        ? chooseCoverSize(provider.info.sizes, provider.info.defaultSize)
        : provider.info.defaultSize;

    const raw = await provider.generate(prompt, { size, signal });
    const processed = await processImage(raw, {
      maxWidth: artwork.placement === 'cover' ? 2000 : 1600,
    });
    const asset = await writeArtworkAssets(
      this.projectDirectory(project.id),
      artwork.id,
      processed
    );

    const cost = provider.estimateCost(1, size);
    artwork.asset = asset;
    artwork.status = 'ready';
    artwork.error = undefined;
    artwork.provider = provider.info.id;
    artwork.model = provider.getModelId();
    artwork.costUsd = cost.totalCost;
    artwork.generatedAt = new Date().toISOString();

    return artwork;
  }
}

/** Prefer a portrait size for covers; fall back to the provider default. */
function chooseCoverSize(sizes: string[], fallback: string): string {
  const preferences = ['1024x1536', '9:16', '832x1216', '2:3', '3:4'];
  return sizes.find((size) => preferences.includes(size)) ?? fallback;
}
