import { randomUUID } from 'crypto';
import type { BookNode, NodeKind } from '../../../shared/types';
import {
  childrenOf,
  deleteNode,
  flatten,
  insertNode,
  isDescendant,
  moveNode,
  numberedProseNodes,
  orderedProseNodes,
  reindex,
} from './tree';

function node(
  id: string,
  parentId: string | null,
  order: number,
  kind: NodeKind = 'chapter',
  content = 'text'
): BookNode {
  return {
    id,
    kind,
    title: id,
    synopsis: '',
    content,
    parentId,
    order,
    status: 'completed',
    wordCount: content ? 1 : 0,
    tokensIn: 0,
    tokensOut: 0,
    keywords: [],
    createdAt: '',
    modifiedAt: '',
  };
}

describe('tree', () => {
  const a = randomUUID();
  const b = randomUUID();
  const c = randomUUID();
  const d = randomUUID();

  function sample(): BookNode[] {
    return [node(a, null, 0, 'part', ''), node(b, a, 0), node(c, a, 1), node(d, null, 1)];
  }

  it('flattens in reading order with depth', () => {
    const rows = flatten(sample());
    expect(rows.map((row) => [row.node.id, row.depth])).toEqual([
      [a, 0],
      [b, 1],
      [c, 1],
      [d, 0],
    ]);
  });

  it('returns only prose nodes and numbers them', () => {
    const nodes = sample();
    expect(orderedProseNodes(nodes).map((n) => n.id)).toEqual([b, c, d]);
    expect(numberedProseNodes(nodes).map((entry) => entry.number)).toEqual([1, 2, 3]);
  });

  it('inserts at the end of the sibling list', () => {
    const inserted = insertNode(sample(), node(randomUUID(), a, 99));
    expect(childrenOf(inserted, a)).toHaveLength(3);
    expect(childrenOf(inserted, a)[2].order).toBe(2);
  });

  it('moves a node to a new parent at a given order', () => {
    const moved = moveNode(sample(), d, a, 0);
    const siblings = childrenOf(moved, a);
    expect(siblings.map((n) => n.id)).toEqual([d, b, c]);
    expect(siblings.map((n) => n.order)).toEqual([0, 1, 2]);
  });

  it('refuses to move a node into its own subtree', () => {
    const nodes = sample();
    expect(moveNode(nodes, a, b)).toEqual(nodes);
    expect(isDescendant(nodes, a, b)).toBe(true);
  });

  it('deletes a subtree and reindexes remaining siblings', () => {
    const nodes = sample();
    const deleted = deleteNode(nodes, a);
    expect(deleted.map((n) => n.id)).toEqual([d]);
    expect(deleted[0].order).toBe(0);
  });

  it('reindexes a parent’s children', () => {
    const nodes = [node(a, null, 5), node(b, null, 9)];
    expect(reindex(nodes, null).map((n) => n.order)).toEqual([0, 1]);
  });
});
