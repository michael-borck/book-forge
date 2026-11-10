'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Image, ListTree, PenLine, Play, Sparkles, Square } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Binder } from '@/components/workbench/Binder'
import { EditorPane } from '@/components/workbench/EditorPane'
import { Inspector } from '@/components/workbench/Inspector'
import { OutlineBoard } from '@/components/workbench/OutlineBoard'
import { ArtworkPanel } from '@/components/workbench/ArtworkPanel'
import { useProjectStore } from '@/lib/projectStore'
import { cn } from '@/lib/utils'

export default function WorkbenchPage() {
  const {
    project,
    loading,
    busy,
    progress,
    error,
    openProject,
    closeProject,
    plan,
    generate,
    cancel,
    selectedNodeId,
  } = useProjectStore()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [view, setView] = useState<'outline' | 'write' | 'artwork'>('write')
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id')
    setProjectId(id)
    if (id) void openProject(id)
    return () => closeProject()
  }, [openProject, closeProject])

  useEffect(() => {
    if (selectedNodeId) setView('write')
  }, [selectedNodeId])

  if (!projectId) {
    return (
      <div className="container mx-auto p-6 text-sm">
        No project selected. <Link href="/library" className="underline">Back to library</Link>
      </div>
    )
  }

  if (loading && !project) {
    return <div className="container mx-auto p-6 text-sm text-muted-foreground">Opening…</div>
  }

  if (!project) {
    return (
      <div className="container mx-auto p-6 text-sm">
        Project not found. <Link href="/library" className="underline">Back to library</Link>
      </div>
    )
  }

  const selected = project.book.nodes.find((node) => node.id === selectedNodeId) ?? null
  const hasChapters = project.book.nodes.some((node) => node.kind === 'chapter')
  const incomplete = project.book.nodes.some(
    (node) => node.kind === 'chapter' && node.status !== 'completed'
  )

  async function handlePlan() {
    if (hasChapters && !window.confirm('Regenerate the outline? Existing chapters will be replaced.')) {
      return
    }
    setNotice(null)
    const result = await plan()
    setNotice(result.ok ? 'Outline ready. Review the cards, then generate chapters.' : result.message ?? null)
    setView('outline')
  }

  async function handleGenerate() {
    setNotice(null)
    const result = await generate()
    setNotice(result.ok ? 'Chapters written.' : result.message ?? null)
    setView('write')
  }

  const percent =
    progress?.phase === 'chapter' && progress.totalChapters
      ? Math.round(((progress.currentChapter ?? 0) / progress.totalChapters) * 100)
      : progress?.phase === 'done'
        ? 100
        : 0

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild size="icon" variant="ghost">
            <Link href="/library" aria-label="Back to library">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{project.title}</h1>
            <p className="text-xs text-muted-foreground">
              {project.book.status} · {project.book.nodes.length} nodes ·{' '}
              {project.book.tokensIn.toLocaleString()} in / {project.book.tokensOut.toLocaleString()} out
            </p>
          </div>
          <Badge variant="secondary">{project.book.status}</Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void handlePlan()}>
            <Sparkles className="h-4 w-4" /> Plan outline
          </Button>
          <Button
            size="sm"
            disabled={busy || !hasChapters || !incomplete}
            onClick={() => void handleGenerate()}
          >
            <Play className="h-4 w-4" /> {project.book.status === 'planned' ? 'Write chapters' : 'Generate pending'}
          </Button>
          {busy && (
            <Button variant="ghost" size="sm" onClick={() => void cancel()}>
              <Square className="h-4 w-4" /> Cancel
            </Button>
          )}
        </div>
      </header>

      {busy && (
        <div className="border-b px-4 py-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {progress?.message ??
              (progress?.phase === 'chapter'
                ? `Writing chapter ${progress.currentChapter}/${progress.totalChapters}`
                : 'Working…')}
          </p>
        </div>
      )}

      {(error || notice) && (
        <p className={cn('border-b px-4 py-2 text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
          {error ?? notice}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <Binder />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex gap-1 border-b px-4 py-1.5">
            <Button
              size="sm"
              variant={view === 'outline' ? 'secondary' : 'ghost'}
              onClick={() => setView('outline')}
            >
              <ListTree className="h-4 w-4" /> Outline
            </Button>
            <Button
              size="sm"
              variant={view === 'write' ? 'secondary' : 'ghost'}
              onClick={() => setView('write')}
            >
              <PenLine className="h-4 w-4" /> Write
            </Button>
            <Button
              size="sm"
              variant={view === 'artwork' ? 'secondary' : 'ghost'}
              onClick={() => setView('artwork')}
            >
              <Image className="h-4 w-4" /> Artwork
            </Button>
          </div>

          {view === 'outline' ? (
            <OutlineBoard />
          ) : view === 'artwork' ? (
            <ArtworkPanel />
          ) : selected ? (
            <EditorPane node={selected} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
              Select a chapter in the binder, or plan an outline.
            </div>
          )}
        </div>

        <Inspector />
      </div>
    </div>
  )
}
