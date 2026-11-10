/**
 * ManuscriptEditor - targeted AI edits on a single node. The caller snapshots
 * the node first, then applies the returned content.
 */

import type {
  BookNode,
  GenerationChunk,
  GenerationParams,
  Project,
} from '../../../shared/types';
import type { ProviderManager } from '../providers';
import { selectResearch } from '../contextBuilder';
import { chapterNodes } from './mapping';

export type EditAction = 'refine' | 'expand' | 'shorten' | 'continue' | 'regenerate';

export interface EditResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
}

const ACTION_INSTRUCTIONS: Record<EditAction, string> = {
  refine: 'Improve clarity, flow, and grammar while preserving the meaning and approximate length.',
  expand: 'Expand with more detail, examples, and explanation. Aim for roughly 1.5x the current length.',
  shorten: 'Condense the content to roughly 60% of its length while keeping the key points.',
  continue: 'Continue the chapter naturally from where it ends.',
  regenerate: 'Rewrite this chapter from scratch following the brief and the surrounding outline.',
};

export function buildEditPrompt(
  project: Project,
  node: BookNode,
  action: EditAction,
  customInstruction?: string
): string {
  const chapters = chapterNodes(project);
  const outline = chapters
    .map((chapter) => `- ${chapter.title}${chapter.synopsis ? `: ${chapter.synopsis}` : ''}`)
    .join('\n');

  const index = chapters.findIndex((chapter) => chapter.id === node.id);
  const previous = index > 0 ? chapters[index - 1] : null;
  const previousTail = previous?.content.trim()
    ? `\n\nEnd of the previous chapter (${previous.title}):\n${previous.content.slice(-2500)}`
    : '';

  const instruction = [ACTION_INSTRUCTIONS[action], customInstruction?.trim()]
    .filter(Boolean)
    .join(' ');

  const current =
    action === 'regenerate'
      ? `Chapter brief: ${node.synopsis || '(no brief provided)'}`
      : `Current content:\n${node.content.slice(0, 12000)}`;

  const research = selectResearch(
    project.book.nodes
      .filter((candidate) => candidate.kind === 'research')
      .map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        content: candidate.content,
      })),
    node
  );

  return [
    `Book outline:\n${outline}${previousTail}`,
    research,
    current,
    `Instruction: ${instruction}`,
    action === 'continue'
      ? 'Output only the new prose. Do not repeat existing text.'
      : 'Output only the revised chapter body in Markdown. Do not add a title or commentary.',
  ].join('\n\n');
}

export class ManuscriptEditor {
  constructor(private readonly manager: ProviderManager) {}

  async edit(
    project: Project,
    nodeId: string,
    action: EditAction,
    customInstruction: string | undefined,
    signal: AbortSignal
  ): Promise<EditResult> {
    const node = project.book.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error(`No node with id ${nodeId}`);

    if (project.book.provider && project.book.provider !== this.manager.getCurrentProviderId()) {
      await this.manager.setCurrentProvider(project.book.provider);
    }
    const provider = this.manager.getCurrentProvider();
    if (!provider) throw new Error('No provider is configured. Add an API key in Settings first.');
    const model = project.book.model || (await provider.getAvailableModels())[0]?.id;
    if (!model) throw new Error('No model is available for the selected provider.');

    const params: GenerationParams = {
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert book editor. Preserve the author’s voice, facts, and continuity. Return only the requested Markdown prose.',
        },
        { role: 'user', content: buildEditPrompt(project, node, action, customInstruction) },
      ],
      temperature: 0.7,
      maxTokens: action === 'shorten' ? 2000 : 4000,
      signal,
    };

    const chunk: GenerationChunk = await this.manager.generate(params);
    const content =
      action === 'continue'
        ? `${node.content.trimEnd()}\n\n${chunk.content.trim()}`
        : chunk.content.trim();

    return {
      content,
      tokensIn: chunk.usage?.promptTokens ?? 0,
      tokensOut: chunk.usage?.completionTokens ?? chunk.tokens ?? 0,
    };
  }
}
