import { diffLines } from './diff';

describe('diffLines', () => {
  it('marks identical text as unchanged', () => {
    expect(diffLines('one\ntwo', 'one\ntwo')).toEqual([
      { type: 'same', text: 'one' },
      { type: 'same', text: 'two' },
    ]);
  });

  it('detects an added line', () => {
    expect(diffLines('one\ntwo', 'one\nmiddle\ntwo')).toEqual([
      { type: 'same', text: 'one' },
      { type: 'add', text: 'middle' },
      { type: 'same', text: 'two' },
    ]);
  });

  it('detects a removed line', () => {
    expect(diffLines('one\nremove\ntwo', 'one\ntwo')).toEqual([
      { type: 'same', text: 'one' },
      { type: 'remove', text: 'remove' },
      { type: 'same', text: 'two' },
    ]);
  });

  it('handles a full replacement', () => {
    expect(diffLines('old', 'new')).toEqual([
      { type: 'remove', text: 'old' },
      { type: 'add', text: 'new' },
    ]);
  });

  it('keeps common prefix and suffix intact', () => {
    const before = 'a\nb\nold\nc\nd';
    const after = 'a\nb\nnew\nc\nd';
    const result = diffLines(before, after);
    expect(result.filter((line) => line.type === 'same')).toHaveLength(4);
    expect(result).toContainEqual({ type: 'remove', text: 'old' });
    expect(result).toContainEqual({ type: 'add', text: 'new' });
  });
});
