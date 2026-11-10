/**
 * Small line diff for snapshot comparison. Common prefix/suffix are trimmed
 * first, then an LCS table covers the changed middle. Bounded input keeps the
 * DP table small enough for chapter-sized text.
 */

export type DiffLineType = 'same' | 'add' | 'remove';

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

const MAX_LINES = 1500;

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const prefix = a.slice(0, start).map((text) => ({ type: 'same' as const, text }));
  const suffix = a.slice(endA + 1).map((text) => ({ type: 'same' as const, text }));
  const midA = a.slice(start, endA + 1).slice(0, MAX_LINES);
  const midB = b.slice(start, endB + 1).slice(0, MAX_LINES);

  return [...prefix, ...lcsDiff(midA, midB), ...suffix];
}

function lcsDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  if (n === 0) return b.map((text) => ({ type: 'add' as const, text }));
  if (m === 0) return a.map((text) => ({ type: 'remove' as const, text }));

  // table[i][j] = LCS length of a[i:] and b[j:]
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: 'same', text: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      result.push({ type: 'remove', text: a[i] });
      i++;
    } else {
      result.push({ type: 'add', text: b[j] });
      j++;
    }
  }
  while (i < n) result.push({ type: 'remove', text: a[i++] });
  while (j < m) result.push({ type: 'add', text: b[j++] });
  return result;
}
