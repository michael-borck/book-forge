/**
 * Unit tests for the outline parser — the most failure-prone pure function in
 * the generation pipeline (LLM outline responses vary in formatting).
 */

import { parseOutline } from './outline';

describe('parseOutline', () => {
  it('parses a numbered list', () => {
    const text = '1. Introduction\n2. Getting Started\n3. Conclusion';
    expect(parseOutline(text, 5)).toEqual(['Introduction', 'Getting Started', 'Conclusion']);
  });

  it('parses a bulleted list', () => {
    expect(parseOutline('- First\n* Second', 5)).toEqual(['First', 'Second']);
  });

  it('handles ")" numbering and trims whitespace', () => {
    expect(parseOutline('1)   Alpha\n2)  Beta ', 5)).toEqual(['Alpha', 'Beta']);
  });

  it('truncates to the requested maximum', () => {
    const text = '1. A\n2. B\n3. C\n4. D';
    expect(parseOutline(text, 2)).toEqual(['A', 'B']);
  });

  it('ignores unrecognised preamble lines', () => {
    const text = 'Here is your outline:\n1. Real Chapter';
    expect(parseOutline(text, 5)).toEqual(['Real Chapter']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(parseOutline('no list here', 5)).toEqual([]);
  });
})
