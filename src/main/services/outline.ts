/**
 * Pure helpers for the generation pipeline. Kept free of Electron/persistence
 * imports so they can be unit-tested under a plain Node test environment.
 */

export const CHAPTERS_BY_LENGTH: Record<string, number> = {
  short: 5,
  medium: 10,
  long: 20,
};

/** Parse an LLM outline response into a list of chapter titles. */
export function parseOutline(text: string, max: number): string[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const titles: string[] = [];
  for (const line of lines) {
    const numbered = line.match(/^\d+[.)]\s*(.+)$/);
    const bulleted = line.match(/^[-*]\s*(.+)$/);
    if (numbered) titles.push(numbered[1].trim());
    else if (bulleted) titles.push(bulleted[1].trim());
  }
  return titles.slice(0, max);
}
