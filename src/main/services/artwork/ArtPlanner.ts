/**
 * ArtPlanner - asks the text model for a cover and one illustration per
 * chapter, plus a style bible that keeps recurring characters and settings
 * consistent. The user reviews the prompts before any image is generated.
 */

import { randomUUID } from 'crypto';
import { z } from 'zod';
import type {
  ArtPlanMeta,
  Artwork,
  GenerationParams,
  Project,
} from '../../../shared/types';
import type { ProviderManager } from '../providers';
import { chapterNodes } from '../project/mapping';
import { getStylePreset } from './stylePresets';

const planSchema = z.object({
  styleBible: z.string().min(1).max(4000),
  cover: z
    .object({
      prompt: z.string().min(1).max(2000),
      alt: z.string().min(1).max(500),
      caption: z.string().max(500).optional(),
    })
    .optional(),
  chapters: z
    .array(
      z.object({
        index: z.number().int().min(1),
        prompt: z.string().min(1).max(2000),
        alt: z.string().min(1).max(500),
        caption: z.string().max(500).optional(),
      })
    )
    .min(1),
});

type PlanInput = z.infer<typeof planSchema>;

export interface ArtPlanResult {
  artworks: Artwork[];
  meta: ArtPlanMeta;
  tokensIn: number;
  tokensOut: number;
}

export class ArtPlanner {
  constructor(private readonly manager: ProviderManager) {}

  async plan(project: Project, stylePresetId?: string): Promise<ArtPlanResult> {
    if (project.book.provider && project.book.provider !== this.manager.getCurrentProviderId()) {
      await this.manager.setCurrentProvider(project.book.provider);
    }
    const provider = this.manager.getCurrentProvider();
    if (!provider) throw new Error('No text provider is configured for art planning.');
    const model = project.book.model || (await provider.getAvailableModels())[0]?.id;
    if (!model) throw new Error('No text model is available for art planning.');

    const chapters = chapterNodes(project);
    if (chapters.length === 0) throw new Error('Plan the outline before planning artwork.');

    const stylePreset = stylePresetId || project.settings.artStylePreset || 'storybook';
    const preset = getStylePreset(stylePreset);

    const params: GenerationParams = {
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are an art director planning illustrations for a book. Return only JSON matching the requested shape. Prompts must describe a single scene, not a sequence. Never request text, lettering, or watermarks in an image.',
        },
        {
          role: 'user',
          content: `Book: "${project.title}" (${project.settings.style}).
Art style preset: ${preset.label} — ${preset.directive}

Chapters:
${chapters.map((chapter, index) => `${index + 1}. ${chapter.title}${chapter.synopsis ? ` — ${chapter.synopsis}` : ''}`).join('\n')}

Return JSON:
{
  "styleBible": "recurring characters, setting, palette, and visual rules",
  "cover": { "prompt": "...", "alt": "...", "caption": "..." },
  "chapters": [ { "index": 1, "prompt": "...", "alt": "...", "caption": "..." } ]
}
Include exactly one chapter item per chapter. Alt text must describe the image for a screen reader.`,
        },
      ],
      temperature: 0.7,
      maxTokens: 2500,
    };

    const chunk = await this.manager.generate(params);
    let input: PlanInput;
    try {
      input = planSchema.parse(parseJson(chunk.content));
    } catch {
      input = fallbackPlan(project, chapters);
    }

    return {
      artworks: mergeArtworks(project, input, stylePreset),
      meta: {
        stylePreset,
        styleBible: input.styleBible,
        origin: { provider: provider.info.id, model, at: new Date().toISOString() },
      },
      tokensIn: chunk.usage?.promptTokens ?? 0,
      tokensOut: chunk.usage?.completionTokens ?? chunk.tokens ?? 0,
    };
  }
}

function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object in art plan');
  return JSON.parse(candidate.slice(start, end + 1));
}

function fallbackPlan(project: Project, chapters: ReturnType<typeof chapterNodes>): PlanInput {
  return {
    styleBible: `Consistent characters and settings for "${project.title}". Match the selected art style across every illustration.`,
    cover: {
      prompt: `Cover illustration for the book "${project.title}"`,
      alt: `Cover illustration for ${project.title}`,
    },
    chapters: chapters.map((chapter, index) => ({
      index: index + 1,
      prompt: `Illustration for the chapter "${chapter.title}"${
        chapter.synopsis ? `: ${chapter.synopsis}` : ''
      }`,
      alt: `Illustration for the chapter ${chapter.title}`,
    })),
  };
}

function mergeArtworks(
  project: Project,
  input: PlanInput,
  stylePreset: string
): Artwork[] {
  const chapters = chapterNodes(project);
  const existing = new Map(
    project.book.artworks.map((artwork) => [`${artwork.nodeId ?? 'cover'}:${artwork.placement}`, artwork])
  );
  const now = new Date().toISOString();
  const result: Artwork[] = [];

  const build = (
    nodeId: string | null,
    placement: Artwork['placement'],
    item: { prompt: string; alt: string; caption?: string },
    order: number
  ): Artwork => {
    const previous = existing.get(`${nodeId ?? 'cover'}:${placement}`);
    return {
      id: previous?.id ?? randomUUID(),
      nodeId,
      placement,
      prompt: item.prompt,
      stylePreset,
      styleBibleSnapshot: input.styleBible,
      source: previous?.source ?? 'generated',
      status: previous?.status === 'ready' ? 'ready' : 'planned',
      asset: previous?.asset,
      alt: item.alt,
      caption: item.caption,
      attribution: previous?.attribution,
      provider: previous?.provider,
      model: previous?.model,
      costUsd: previous?.costUsd,
      order,
      createdAt: previous?.createdAt ?? now,
      generatedAt: previous?.generatedAt,
    };
  };

  if (input.cover) {
    result.push(build(null, 'cover', input.cover, 0));
  }

  for (const item of input.chapters) {
    const chapter = chapters[item.index - 1];
    if (!chapter) continue;
    result.push(build(chapter.id, 'chapter-opener', item, item.index));
  }

  // Keep user uploads that the planner does not manage (inline/full-page art).
  const managed = new Set(['cover', 'chapter-opener']);
  for (const artwork of project.book.artworks) {
    if (artwork.source === 'uploaded' && !managed.has(artwork.placement)) {
      result.push(artwork);
    }
  }

  return result;
}
