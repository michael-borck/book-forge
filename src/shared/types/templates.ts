/**
 * Built-in book templates. A template prefills generation settings and an
 * optional chapter skeleton that can be edited before writing.
 */

export interface BookTemplateChapter {
  title: string;
  synopsis: string;
}

export interface BookTemplateDefinition {
  id: string;
  name: string;
  description: string;
  settings: {
    style: string;
    length: string;
    artStylePreset?: string;
  };
  chapters: BookTemplateChapter[];
}

export const BOOK_TEMPLATES: BookTemplateDefinition[] = [
  {
    id: 'blank',
    name: 'Blank book',
    description: 'Start from a topic and let BookForge plan the outline.',
    settings: { style: 'educational', length: 'short', artStylePreset: 'storybook' },
    chapters: [],
  },
  {
    id: 'course',
    name: 'Course companion',
    description: 'A teaching book with outcomes, worked examples, and review questions.',
    settings: { style: 'educational', length: 'medium', artStylePreset: 'technical-diagram' },
    chapters: [
      { title: 'Why this matters', synopsis: 'Motivate the topic with a real scenario and learning outcomes.' },
      { title: 'Core concepts', synopsis: 'Define the essential terms and mental models.' },
      { title: 'Worked example', synopsis: 'Walk through a complete example step by step.' },
      { title: 'Common mistakes', synopsis: 'Show typical errors and how to recognise them.' },
      { title: 'Practice', synopsis: 'Exercises with hints and discussion prompts.' },
      { title: 'Review and next steps', synopsis: 'Summarise key points and suggest further reading.' },
    ],
  },
  {
    id: 'guide',
    name: 'Practical guide',
    description: 'A professional how-to book organised around decisions and checklists.',
    settings: { style: 'professional', length: 'medium', artStylePreset: 'isometric' },
    chapters: [
      { title: 'The problem', synopsis: 'Describe the situation and who it affects.' },
      { title: 'Options', synopsis: 'Compare the realistic approaches and trade-offs.' },
      { title: 'A workable method', synopsis: 'Present a step-by-step method with checklists.' },
      { title: 'Case studies', synopsis: 'Two contrasting examples with outcomes.' },
      { title: 'Measuring success', synopsis: 'Metrics, review cadence, and warning signs.' },
      { title: 'Templates and tools', synopsis: 'Reusable artefacts the reader can adopt.' },
    ],
  },
  {
    id: 'novel',
    name: 'Short novel',
    description: 'A character-led story with an inciting incident, turns, and resolution.',
    settings: { style: 'creative', length: 'medium', artStylePreset: 'watercolor' },
    chapters: [
      { title: 'Ordinary world', synopsis: 'Introduce the protagonist, setting, and what they want.' },
      { title: 'The disturbance', synopsis: 'An event forces a choice and breaks the routine.' },
      { title: 'First attempt', synopsis: 'The protagonist acts and meets an obstacle.' },
      { title: 'Complication', synopsis: 'A relationship or secret changes the stakes.' },
      { title: 'Turning point', synopsis: 'A truth is revealed and the plan changes.' },
      { title: 'Climax', synopsis: 'The decisive confrontation or choice.' },
      { title: 'Aftermath', synopsis: 'Consequences, changed relationships, and a new normal.' },
      { title: 'Resolution', synopsis: 'Close the emotional arc without over-explaining.' },
    ],
  },
];

export function getBookTemplate(id: string | undefined): BookTemplateDefinition | null {
  if (!id) return null;
  return BOOK_TEMPLATES.find((template) => template.id === id) ?? null;
}
