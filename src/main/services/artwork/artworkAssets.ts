/**
 * Artwork file storage inside a project folder:
 *   assets/images/<artworkId>.webp
 *   assets/thumbnails/<artworkId>.webp
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import type { ArtworkAsset } from '../../../shared/types';
import type { ProcessedImage } from './imageProcessing';

export function artworkRelativePath(artworkId: string): string {
  return `assets/images/${safeSegment(artworkId)}.webp`;
}

export function thumbnailRelativePath(artworkId: string): string {
  return `assets/thumbnails/${safeSegment(artworkId)}.webp`;
}

export async function writeArtworkAssets(
  projectDir: string,
  artworkId: string,
  processed: ProcessedImage
): Promise<ArtworkAsset> {
  const imagePath = resolveProjectPath(projectDir, artworkRelativePath(artworkId));
  const thumbPath = resolveProjectPath(projectDir, thumbnailRelativePath(artworkId));

  await fs.mkdir(path.dirname(imagePath), { recursive: true });
  await fs.mkdir(path.dirname(thumbPath), { recursive: true });

  await atomicWrite(imagePath, processed.full);
  await atomicWrite(thumbPath, processed.thumbnail);

  return {
    relativePath: artworkRelativePath(artworkId),
    mime: processed.mime,
    width: processed.width,
    height: processed.height,
    bytes: processed.bytes,
  };
}

export async function removeArtworkAssets(projectDir: string, artworkId: string): Promise<void> {
  await fs.rm(resolveProjectPath(projectDir, artworkRelativePath(artworkId)), { force: true });
  await fs.rm(resolveProjectPath(projectDir, thumbnailRelativePath(artworkId)), { force: true });
}

export async function readArtworkAsset(
  projectDir: string,
  relativePath: string
): Promise<Buffer> {
  return fs.readFile(resolveProjectPath(projectDir, relativePath));
}

export async function readArtworkAssetAsDataUrl(
  projectDir: string,
  relativePath: string,
  mime = 'image/webp'
): Promise<string> {
  const buffer = await readArtworkAsset(projectDir, relativePath);
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export function resolveProjectPath(projectDir: string, relativePath: string): string {
  const normalizedProject = path.resolve(projectDir);
  const target = path.resolve(projectDir, relativePath);
  const relative = path.relative(normalizedProject, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Artwork path escapes the project folder');
  }
  return target;
}

async function atomicWrite(filePath: string, data: Buffer): Promise<void> {
  const temp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temp, data);
  await fs.rename(temp, filePath);
}

function safeSegment(value: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(value)) throw new Error('Invalid artwork id');
  return value;
}
