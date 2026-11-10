/**
 * Art style presets. A preset is a short directive prepended to every artwork
 * prompt; the project's style bible follows it so recurring characters and
 * settings stay consistent across the book.
 */

export interface StylePreset {
  id: string;
  label: string;
  directive: string;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'storybook',
    label: 'Storybook',
    directive:
      'Warm storybook illustration with clean shapes, expressive characters, soft lighting, and a cohesive palette.',
  },
  {
    id: 'watercolor',
    label: 'Watercolour',
    directive:
      'Delicate watercolour illustration with visible paper texture, soft washes, and restrained detail.',
  },
  {
    id: 'line-art',
    label: 'Line art',
    directive:
      'Crisp black ink line art with selective flat colour, high contrast, and confident linework.',
  },
  {
    id: 'engraving',
    label: 'Engraving',
    directive:
      'Detailed vintage engraving style with fine cross-hatching, sepia tones, and antique bookplate character.',
  },
  {
    id: 'photorealistic',
    label: 'Photorealistic',
    directive:
      'Photorealistic image with natural lighting, realistic textures, and shallow depth of field.',
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    directive:
      'Cinematic wide-frame composition with dramatic lighting, atmospheric depth, and film-like colour grading.',
  },
  {
    id: 'technical-diagram',
    label: 'Technical diagram',
    directive:
      'Clear explanatory diagram with labelled components, consistent iconography, and a muted technical palette.',
  },
  {
    id: 'isometric',
    label: 'Isometric',
    directive:
      'Isometric 3D illustration with clean geometry, soft shadows, and a bright, modern palette.',
  },
  {
    id: 'childrens-book',
    label: "Children's book",
    directive:
      'Bright children’s picture-book illustration with friendly rounded characters, bold outlines, and playful colour.',
  },
];

export function getStylePreset(id: string | undefined): StylePreset {
  return STYLE_PRESETS.find((preset) => preset.id === id) ?? STYLE_PRESETS[0];
}

export function buildArtworkPrompt(
  prompt: string,
  stylePreset: string | undefined,
  styleBible: string | undefined
): string {
  const preset = getStylePreset(stylePreset);
  const parts = [preset.directive];
  if (styleBible?.trim()) parts.push(`Consistency notes: ${styleBible.trim()}`);
  parts.push('No text, lettering, captions, or watermarks in the image.');
  parts.push(`Scene: ${prompt.trim()}`);
  return parts.join(' ');
}
