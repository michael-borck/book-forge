/**
 * Normalise generated/uploaded artwork with sharp: validate, auto-orient,
 * downscale, strip metadata, convert to WebP, and build a thumbnail.
 */

import sharp from 'sharp';

const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_DIMENSION = 8000;

export interface ProcessedImage {
  full: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
  bytes: number;
  mime: 'image/webp';
}

export interface ProcessOptions {
  maxWidth?: number;
  thumbnailWidth?: number;
  quality?: number;
}

export async function processImage(
  input: Buffer,
  options: ProcessOptions = {}
): Promise<ProcessedImage> {
  if (input.byteLength > MAX_INPUT_BYTES) {
    throw new Error('Image is larger than 25 MB');
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input, { failOn: 'error' }).metadata();
  } catch {
    throw new Error('Unsupported or corrupt image file');
  }
  if (!metadata.width || !metadata.height) throw new Error('Image has no readable dimensions');
  if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
    throw new Error('Image dimensions exceed 8000 px');
  }

  const maxWidth = options.maxWidth ?? 1600;
  const quality = options.quality ?? 82;
  const normalized = sharp(input, { failOn: 'error' }).rotate();

  const { data: full, info } = await normalized
    .clone()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });

  const thumbnail = await normalized
    .clone()
    .resize({ width: options.thumbnailWidth ?? 400, withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();

  return {
    full,
    thumbnail,
    width: info.width,
    height: info.height,
    bytes: info.size,
    mime: 'image/webp',
  };
}
