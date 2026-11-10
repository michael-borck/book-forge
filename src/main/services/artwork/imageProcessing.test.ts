import sharp from 'sharp';
import { processImage } from './imageProcessing';
import { MockImageProvider } from './providers/MockImageProvider';

describe('image processing', () => {
  it('normalises a generated image to WebP and builds a thumbnail', async () => {
    const provider = new MockImageProvider();
    await provider.initialize({});
    const raw = await provider.generate('a blue lighthouse', { size: '640x400' });

    const processed = await processImage(raw, { maxWidth: 400 });

    expect(processed.mime).toBe('image/webp');
    expect(processed.width).toBeLessThanOrEqual(400);
    expect(processed.width).toBeGreaterThan(0);
    expect(processed.bytes).toBe(processed.full.byteLength);
    expect(processed.thumbnail.byteLength).toBeGreaterThan(0);

    const fullMeta = await sharp(processed.full).metadata();
    expect(fullMeta.format).toBe('webp');
    const thumbMeta = await sharp(processed.thumbnail).metadata();
    expect(thumbMeta.width).toBeLessThanOrEqual(processed.width);
  });

  it('rejects data that is not an image', async () => {
    await expect(processImage(Buffer.from('not an image'))).rejects.toThrow(
      'Unsupported or corrupt image file'
    );
  });
});
