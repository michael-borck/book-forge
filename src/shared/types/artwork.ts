/**
 * Artwork records attach an image to a manuscript node (or to the cover).
 */

export type ArtworkPlacement =
  | 'cover'
  | 'frontispiece'
  | 'chapter-opener'
  | 'inline'
  | 'full-page';

export type ArtworkStatus =
  | 'planned'
  | 'queued'
  | 'generating'
  | 'ready'
  | 'error'
  | 'disabled';

export type ArtworkSource = 'generated' | 'uploaded';

export interface ArtworkAsset {
  /** Project-relative path, e.g. assets/images/<id>.webp */
  relativePath: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
}

export interface Artwork {
  id: string;
  nodeId: string | null;
  placement: ArtworkPlacement;
  prompt: string;
  negativePrompt?: string;
  stylePreset: string;
  styleBibleSnapshot?: string;
  source: ArtworkSource;
  status: ArtworkStatus;
  asset?: ArtworkAsset;
  alt: string;
  caption?: string;
  attribution?: string;
  provider?: string;
  model?: string;
  costUsd?: number;
  error?: string;
  order?: number;
  createdAt: string;
  generatedAt?: string;
}

export interface ArtPlanMeta {
  stylePreset: string;
  styleBible: string;
  origin: { provider: string; model: string; at: string };
}

export interface ArtworkProgress {
  projectId: string;
  artworkId?: string;
  index?: number;
  total?: number;
  status: 'planning' | 'generating' | 'ready' | 'error' | 'done';
  message?: string;
}
