'use client'

import { useState } from 'react'
import { Camera, Download, ListChecks, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { CompileDialog } from '@/components/workbench/CompileDialog'
import { useProjectStore } from '@/lib/projectStore'
import type { DiffLine } from '@/lib/api'
import { cn } from '@/lib/utils'

export function Inspector() {
  const {
    project,
    selectedNodeId,
    snapshots,
    createSnapshot,
    restoreSnapshot,
    refreshSnapshots,
    deleteNode,
    snapshotDiff,
    diffSnapshot,
    clearSnapshotDiff,
    continuity,
    continuityBusy,
    runContinuity,
  } = useProjectStore()
  const [compileOpen, setCompileOpen] = useState(false)

  if (!project) return null
  const node = project.book.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-auto border-l bg-card">
      <section className="p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Project
        </h2>
        <p className="mt-2 text-sm font-medium">{project.title}</p>
        <p className="text-xs text-muted-foreground">
          {project.book.status} · {project.book.tokensIn.toLocaleString()} in /{' '}
          {project.book.tokensOut.toLocaleString()} out tokens
        </p>
        <p className="text-xs text-muted-foreground">
          {project.book.provider || 'no provider'} · {project.book.model || 'no model'}
        </p>
      </section>

      <Separator />

      <section className="p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Continuity
          </h2>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Run continuity check"
            aria-label="Run continuity check"
            disabled={continuityBusy}
            onClick={() => void runContinuity()}
          >
            <ListChecks className="h-3.5 w-3.5" />
          </Button>
        </div>
        {continuityBusy && (
          <p className="mt-2 text-xs text-muted-foreground">Checking the manuscript…</p>
        )}
        {continuity && (
          <div className="mt-2 space-y-2 text-xs">
            {continuity.summary && (
              <p className="text-muted-foreground">{continuity.summary}</p>
            )}
            {continuity.issues.length === 0 ? (
              <p className="text-green-600">No contradictions found.</p>
            ) : (
              <ul className="space-y-2">
                {continuity.issues.map((issue, index) => (
                  <li key={index} className="rounded-md border p-2">
                    {issue.chapters.length > 0 && (
                      <p className="font-medium">
                        Chapter{issue.chapters.length > 1 ? 's' : ''} {issue.chapters.join(', ')}
                      </p>
                    )}
                    <p>{issue.issue}</p>
                    {issue.suggestion && (
                      <p className="mt-1 text-muted-foreground">{issue.suggestion}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <Separator />

      {node && (
        <section className="p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Selected node
          </h2>
          <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <dt>Kind</dt>
              <dd>{node.kind}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Status</dt>
              <dd>{node.status}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Words</dt>
              <dd>{node.wordCount.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Tokens</dt>
              <dd>{(node.tokensIn + node.tokensOut).toLocaleString()}</dd>
            </div>
          </dl>
          <Button
            size="sm"
            variant="ghost"
            className="mt-3 text-destructive"
            onClick={() => {
              if (window.confirm(`Delete "${node.title}"?`)) void deleteNode(node.id)
            }}
          >
            Delete node
          </Button>
        </section>
      )}

      <Separator />

      <section className="p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Snapshots
          </h2>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              title="Refresh snapshots"
              onClick={() => void refreshSnapshots(selectedNodeId ?? undefined)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              title="Snapshot now"
              disabled={!selectedNodeId}
              onClick={() => {
                if (selectedNodeId) void createSnapshot(selectedNodeId, 'manual')
              }}
            >
              <Camera className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {snapshotDiff && (
          <div className="mt-2 rounded-md border">
            <div className="flex items-center justify-between border-b px-2 py-1">
              <span className="text-xs font-medium">Snapshot vs current</span>
              <button type="button" onClick={clearSnapshotDiff} aria-label="Close diff">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
            <pre className="max-h-48 overflow-auto p-2 text-[11px] leading-5">
              {snapshotDiff.lines.map((line, index) => (
                <DiffRow key={index} line={line} />
              ))}
            </pre>
          </div>
        )}

        <div className="mt-2 space-y-2">
          {snapshots.length === 0 && (
            <p className="text-xs text-muted-foreground">No snapshots for this node.</p>
          )}
          {snapshots.map((snapshot) => (
            <div key={snapshot.id} className="rounded-md border p-2 text-xs">
              <p className="font-medium">{new Date(snapshot.createdAt).toLocaleString()}</p>
              <p className="text-muted-foreground">
                {snapshot.reason} · {snapshot.wordCount.toLocaleString()} words
              </p>
              <div className="mt-1 flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => void diffSnapshot(snapshot.id)}
                >
                  Diff
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => void restoreSnapshot(snapshot.id)}
                >
                  Restore
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      <section className="p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Compile
        </h2>
        <Button className="mt-2 w-full" variant="outline" onClick={() => setCompileOpen(true)}>
          <Download className="h-4 w-4" /> Compile…
        </Button>
      </section>

      <CompileDialog open={compileOpen} onClose={() => setCompileOpen(false)} />
    </aside>
  )
}

function DiffRow({ line }: { line: DiffLine }) {
  return (
    <div
      className={cn(
        'whitespace-pre-wrap',
        line.type === 'add' && 'bg-green-100 text-green-900',
        line.type === 'remove' && 'bg-red-100 text-red-900',
        line.type === 'same' && 'text-muted-foreground'
      )}
    >
      {line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  '}
      {line.text}
    </div>
  )
}
