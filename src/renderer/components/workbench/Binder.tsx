'use client'

import { useState, type FormEvent } from 'react'
import { ChevronRight, FileText, FileUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/lib/projectStore'
import type { BookNode, NodeKind } from '@/lib/api'

interface FlatNode {
  node: BookNode
  depth: number
}

function flatten(
  nodes: BookNode[],
  collapsed: Set<string> = new Set(),
  parentId: string | null = null,
  depth = 0
): FlatNode[] {
  const result: FlatNode[] = []
  for (const node of nodes.filter((n) => n.parentId === parentId).sort((a, b) => a.order - b.order)) {
    result.push({ node, depth })
    if (!collapsed.has(node.id)) {
      result.push(...flatten(nodes, collapsed, node.id, depth + 1))
    }
  }
  return result
}

const STATUS_DOT: Record<BookNode['status'], string> = {
  pending: 'bg-muted-foreground/40',
  generating: 'bg-amber-500',
  completed: 'bg-green-500',
  error: 'bg-destructive',
}

const KIND_ICON: Record<NodeKind, string> = {
  part: 'Part',
  chapter: 'Ch',
  scene: 'Sc',
  'front-matter': 'FM',
  'back-matter': 'BM',
  research: 'Re',
}

export function Binder() {
  const {
    project,
    selectedNodeId,
    selectNode,
    addNode,
    deleteNode,
    moveNode,
    importResearch,
  } = useProjectStore()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [adding, setAdding] = useState<'chapter' | 'part' | null>(null)
  const [newTitle, setNewTitle] = useState('')

  if (!project) return null

  const rows = flatten(project.book.nodes, collapsed)

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function submitNewNode(event: FormEvent) {
    event.preventDefault()
    if (!adding || !newTitle.trim()) return
    void addNode(adding, newTitle.trim())
    setAdding(null)
    setNewTitle('')
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Binder
        </span>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Add part"
            aria-label="Add part"
            onClick={() => {
              setAdding('part')
              setNewTitle('')
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Add chapter"
            aria-label="Add chapter"
            onClick={() => {
              setAdding('chapter')
              setNewTitle('')
            }}
          >
            <FileText className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Import research (txt, md, pdf)"
            aria-label="Import research"
            onClick={() => void importResearch()}
          >
            <FileUp className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {adding && (
        <form onSubmit={submitNewNode} className="flex items-center gap-1 border-b p-2">
          <Input
            autoFocus
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setAdding(null)
                setNewTitle('')
              }
            }}
            placeholder={`New ${adding} title`}
            className="h-8 text-xs"
          />
          <Button size="sm" type="submit" disabled={!newTitle.trim()}>
            Add
          </Button>
          <Button
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => {
              setAdding(null)
              setNewTitle('')
            }}
          >
            Cancel
          </Button>
        </form>
      )}

      <div className="flex-1 overflow-auto p-2">
        {rows.length === 0 && (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            No chapters yet. Generate an outline or add one.
          </p>
        )}
        {rows.map(({ node, depth }) => {
          const isSelected = node.id === selectedNodeId
          const hasChildren = project.book.nodes.some((candidate) => candidate.parentId === node.id)
          return (
            <div
              key={node.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                setDraggedId(node.id);
              }}
              onDragEnd={() => {
                setDraggedId(null);
                setDragOverId(null);
              }}
              onDragOver={(event) => {
                if (draggedId && draggedId !== node.id) {
                  event.preventDefault();
                  setDragOverId(node.id);
                }
              }}
              onDragLeave={() => {
                if (dragOverId === node.id) setDragOverId(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedId && draggedId !== node.id) {
                  const dragged = project.book.nodes.find(
                    (candidate) => candidate.id === draggedId
                  );
                  const movingDown = (dragged?.order ?? 0) < node.order;
                  void moveNode(
                    draggedId,
                    node.parentId,
                    movingDown ? node.order + 1 : node.order
                  );
                }
                setDraggedId(null);
                setDragOverId(null);
              }}
              className={cn(
                'group flex items-center gap-1 rounded-md px-1 py-1 text-sm',
                isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
                dragOverId === node.id && 'border-t-2 border-primary',
                draggedId === node.id && 'opacity-50'
              )}
              style={{ paddingLeft: `${depth * 12 + 4}px` }}
            >
              <button
                type="button"
                className="flex h-5 w-5 items-center justify-center text-muted-foreground"
                onClick={() => hasChildren && toggle(node.id)}
                aria-label={hasChildren ? 'Toggle children' : 'Leaf node'}
              >
                {hasChildren ? (
                  <ChevronRight
                    className={cn('h-3.5 w-3.5 transition-transform', !collapsed.has(node.id) && 'rotate-90')}
                  />
                ) : (
                  <span className="w-3.5" />
                )}
              </button>

              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => selectNode(node.id)}
              >
                <span className="w-6 shrink-0 text-[10px] uppercase text-muted-foreground">
                  {KIND_ICON[node.kind]}
                </span>
                <span className="truncate">{node.title}</span>
                <span className={cn('ml-auto h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[node.status])} />
              </button>

              <button
                type="button"
                className="invisible text-muted-foreground hover:text-destructive group-hover:visible"
                title="Delete"
                onClick={() => {
                  if (window.confirm(`Delete "${node.title}"?`)) void deleteNode(node.id)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>

      <div className="border-t px-3 py-2 text-xs text-muted-foreground">
        {project.book.nodes.length} node{project.book.nodes.length === 1 ? '' : 's'}
      </div>
    </aside>
  )
}

export { flatten }
