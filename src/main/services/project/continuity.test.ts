import { parseContinuity } from './continuity';

describe('parseContinuity', () => {
  it('parses JSON wrapped in a code fence', () => {
    const text = `\`\`\`json
{
  "summary": "Mostly consistent.",
  "issues": [
    { "chapters": [1, 3], "issue": "The harbour is east in chapter 1 and west in chapter 3.", "suggestion": "Pick one direction." }
  ]
}
\`\`\``;
    const result = parseContinuity(text);
    expect(result.summary).toBe('Mostly consistent.');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].chapters).toEqual([1, 3]);
    expect(result.issues[0].suggestion).toBe('Pick one direction.');
  });

  it('drops malformed issues and coerces chapter numbers', () => {
    const result = parseContinuity(
      JSON.stringify({
        summary: 'Some concerns.',
        issues: [
          { chapters: ['2', 'x'], issue: 'Name changes spelling.' },
          { chapters: [1], suggestion: 'missing issue text' },
        ],
      })
    );
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].chapters).toEqual([2]);
  });

  it('falls back to plain text when JSON is invalid', () => {
    const result = parseContinuity('The timeline is confusing in chapters two and four.');
    expect(result.issues).toEqual([]);
    expect(result.summary).toContain('timeline');
  });
});
