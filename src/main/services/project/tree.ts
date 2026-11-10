/**
 * Pure tree operations for the binder. Nodes form an adjacency list keyed by
 * `parentId`, ordered among siblings by `order`.
 */

import type { BookNode, NodeKind } from '../../../shared/types';

export interface FlatNode {
  node: BookNode;
  depth: number;
}

export function childrenOf(nodes: BookNode[], parentId: string | null): BookNode[] {
  return nodes.filter((n) => n.parentId === parentId).sort((a, b) => a.order - b.order);
}

/** Depth-first order: parents followed by their children. */
export function flatten(nodes: BookNode[], parentId: string | null = null, depth = 0): FlatNode[] {
  const result: FlatNode[] = [];
  for (const node of childrenOf(nodes, parentId)) {
    result.push({ node, depth });
    result.push(...flatten(nodes, node.id, depth + 1));
  }
  return result;
}

/** Prose nodes in reading order (containers excluded). */
export function orderedProseNodes(
  nodes: BookNode[],
  includeKinds: NodeKind[] = ['front-matter', 'chapter', 'scene', 'back-matter']
): BookNode[] {
  return flatten(nodes)
    .filter(({ node }) => includeKinds.includes(node.kind) && node.content.trim().length > 0)
    .map(({ node }) => node);
}

export function nextOrder(nodes: BookNode[], parentId: string | null): number {
  const siblings = childrenOf(nodes, parentId);
  return siblings.length === 0 ? 0 : siblings[siblings.length - 1].order + 1;
}

export function insertNode(nodes: BookNode[], node: BookNode): BookNode[] {
  return [...nodes, { ...node, order: nextOrder(nodes, node.parentId) }];
}

/** Reassign contiguous order values among one parent's children. */
export function reindex(nodes: BookNode[], parentId: string | null): BookNode[] {
  const ordered = childrenOf(nodes, parentId);
  const orderById = new Map(ordered.map((n, i) => [n.id, i]));
  return nodes.map((n) => (orderById.has(n.id) ? { ...n, order: orderById.get(n.id)! } : n));
}

export function isDescendant(nodes: BookNode[], ancestorId: string, candidateId: string): boolean {
  let current = nodes.find((n) => n.id === candidateId);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = nodes.find((n) => n.id === current!.parentId);
  }
  return false;
}

export function moveNode(
  nodes: BookNode[],
  nodeId: string,
  newParentId: string | null,
  newOrder?: number
): BookNode[] {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return nodes;
  if (newParentId === nodeId || (newParentId && isDescendant(nodes, nodeId, newParentId))) {
    // Refuse to move a node into its own subtree.
    return nodes;
  }

  const oldParentId = node.parentId;
  let updated = nodes.map((n) => (n.id === nodeId ? { ...n, parentId: newParentId } : n));

  const siblings = childrenOf(updated, newParentId);
  const target = Math.max(0, Math.min(newOrder ?? siblings.length - 1, siblings.length - 1));
  const without = siblings.filter((n) => n.id !== nodeId);
  without.splice(target, 0, node);
  const orderById = new Map(without.map((n, i) => [n.id, i]));
  updated = updated.map((n) =>
    orderById.has(n.id) ? { ...n, parentId: newParentId, order: orderById.get(n.id)! } : n
  );

  return reindex(updated, oldParentId);
}

/** Remove a node and its whole subtree. */
export function deleteNode(nodes: BookNode[], nodeId: string): BookNode[] {
  const doomed = new Set<string>([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentId && doomed.has(node.parentId) && !doomed.has(node.id)) {
        doomed.add(node.id);
        changed = true;
      }
    }
  }
  const parentId = nodes.find((n) => n.id === nodeId)?.parentId ?? null;
  return reindex(
    nodes.filter((n) => !doomed.has(n.id)),
    parentId
  );
}

/** Number prose nodes sequentially in reading order (used by compile). */
export function numberedProseNodes(
  nodes: BookNode[],
  includeKinds: NodeKind[] = ['front-matter', 'chapter', 'scene', 'back-matter']
): Array<{ node: BookNode; number: number }> {
  return orderedProseNodes(nodes, includeKinds).map((node, i) => ({ node, number: i + 1 }));
}
