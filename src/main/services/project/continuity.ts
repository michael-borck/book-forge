/**
 * ContinuityChecker - advisory review of a finished (or partial) manuscript.
 * It looks for contradictions, dropped threads, and factual drift across
 * chapters. It never edits the book.
 */

import type { GenerationChunk, GenerationParams, Project } from '../../../shared/types';
import type { ProviderManager } from '../providers';
import { chapterNodes } from './mapping';

export interface ContinuityIssue {
  chapters: number[];
  issue: string;
  suggestion?: string;
}

export interface ContinuityResult {
  summary: string;
  issues: ContinuityIssue[];
  tokensIn: number;
  tokensOut: number;
}

export function parseContinuity(text: string): { summary: string; issues: ContinuityIssue[] } {
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('No JSON');
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
      summary?: unknown;
      issues?: unknown;
    };
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues
          .slice(0, 20)
          .map((item) => item as Record<string, unknown>)
          .filter((item) => typeof item.issue === 'string')
          .map((item) => ({
            chapters: Array.isArray(item.chapters)
              ? item.chapters
                  .map((chapter) => Number(chapter))
                  .filter((chapter) => Number.isInteger(chapter) && chapter > 0)
              : [],
            issue: String(item.issue),
            suggestion:
              typeof item.suggestion === 'string' ? item.suggestion : undefined,
          }))
      : [];
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      issues,
    };
  } catch {
    return { summary: text.trim().slice(0, 2000), issues: [] };
  }
}

export class ContinuityChecker {
  constructor(private readonly manager: ProviderManager) {}

  async check(project: Project): Promise<ContinuityResult> {
    const chapters = chapterNodes(project).filter((chapter) => chapter.content.trim());
    if (chapters.length < 2) {
      throw new Error('Write at least two chapters before running a continuity check.');
    }

    if (project.book.provider && project.book.provider !== this.manager.getCurrentProviderId()) {
      await this.manager.setCurrentProvider(project.book.provider);
    }
    const provider = this.manager.getCurrentProvider();
    if (!provider) throw new Error('No provider is configured.');
    const model = project.book.model || (await provider.getAvailableModels())[0]?.id;
    if (!model) throw new Error('No model is available for the selected provider.');

    const manuscript = chapters
      .map(
        (chapter, index) =>
          `Chapter ${index + 1}: ${chapter.title}\n${chapter.content.slice(0, 3000)}`
      )
      .join('\n\n');

    const params: GenerationParams = {
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a meticulous continuity editor. Report only genuine contradictions, dropped threads, or factual drift. Return only JSON.',
        },
        {
          role: 'user',
          content: `Review this manuscript for continuity issues.\n\n${manuscript}\n\nReturn:\n{"summary":"one-paragraph overall assessment","issues":[{"chapters":[1,3],"issue":"what conflicts","suggestion":"how to fix"}]}\nReturn an empty issues array if the manuscript is consistent.`,
        },
      ],
      temperature: 0.2,
      maxTokens: 1500,
    };

    const chunk: GenerationChunk = await this.manager.generate(params);
    const parsed = parseContinuity(chunk.content);
    return {
      ...parsed,
      tokensIn: chunk.usage?.promptTokens ?? 0,
      tokensOut: chunk.usage?.completionTokens ?? chunk.tokens ?? 0,
    };
  }
}
