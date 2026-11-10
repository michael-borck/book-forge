'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Image, Loader2, Sparkles, Trash2, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useImageSettingsStore } from '@/lib/imageSettingsStore'
import { useProjectStore } from '@/lib/projectStore'
import { api, type Artwork } from '@/lib/api'
import { cn } from '@/lib/utils'

export function ArtworkPanel() {
  const {
    project,
    artworkBusy,
    artworkBusyId,
    artworkProgress,
    planArtwork,
    generateArtwork,
    generateAllArtwork,
    updateArtwork,
    deleteArtwork,
    uploadArtwork,
  } = useProjectStore()
  const { current: currentProvider, refresh: refreshImageProviders } = useImageSettingsStore()

  const [styles, setStyles] = useState<Array<{ id: string; label: string }>>([])
  const [style, setStyle] = useState('storybook')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void refreshImageProviders()
    void api.listImageStyles().then(setStyles).catch(() => setStyles([]))
  }, [refreshImageProviders])

  useEffect(() => {
    if (project?.settings.artStylePreset) setStyle(project.settings.artStylePreset)
  }, [project?.settings.artStylePreset])

  if (!project) return null

  const chapters = project.book.nodes
    .filter((node) => node.kind === 'chapter' && node.parentId === null)
    .sort((a, b) => a.order - b.order)
  const cover = project.book.artworks.find((artwork) => artwork.placement === 'cover')
  const artworksByNode = (nodeId: string) =>
    project.book.artworks.filter((artwork) => artwork.nodeId === nodeId)
  const planned = project.book.artworks.filter(
    (artwork) => artwork.status === 'planned' || artwork.status === 'error'
  )

  async function handlePlan() {
    setMessage(null)
    const result = await planArtwork(style)
    setMessage(result.ok ? 'Art prompts ready. Review them, then generate images.' : result.message ?? null)
  }

  async function handleGenerateAll() {
    setMessage(null)
    const result = await generateAllArtwork({ maxImages: 12, maxCostUsd: 2 })
    setMessage(result.ok ? 'Image generation finished.' : result.message ?? null)
  }

  async function handleUpload(nodeId: string | null) {
    const result = await uploadArtwork({
      nodeId,
      placement: nodeId ? 'chapter-opener' : 'cover',
    })
    if (result.canceled) setMessage('Upload cancelled.')
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
          <div className="min-w-40 flex-1">
            <Label htmlFor="art-style" className="text-xs text-muted-foreground">
              Art style
            </Label>
            <select
              id="art-style"
              value={style}
              onChange={(event) => setStyle(event.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {(styles.length ? styles : [{ id: 'storybook', label: 'Storybook' }]).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" disabled={artworkBusy} onClick={() => void handlePlan()}>
            <Sparkles className="h-4 w-4" /> Plan artwork
          </Button>
          <Button
            disabled={artworkBusy || !currentProvider || planned.length === 0}
            onClick={() => void handleGenerateAll()}
          >
            <Image className="h-4 w-4" /> Generate all ({planned.length})
          </Button>
          <Button
            variant="outline"
            disabled={artworkBusy}
            onClick={() => void handleUpload(null)}
          >
            <Upload className="h-4 w-4" /> Upload cover
          </Button>
        </div>

        {!currentProvider && (
          <p className="text-xs text-muted-foreground">
            No image provider is configured.{' '}
            <Link href="/settings" className="underline">
              Add one in Settings
            </Link>{' '}
            to generate artwork.
          </p>
        )}

        {artworkBusy && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {artworkProgress?.message ??
              (artworkProgress?.index
                ? `Generating ${artworkProgress.index}/${artworkProgress.total}…`
                : 'Working…')}
          </p>
        )}
        {message && <p className="text-xs text-muted-foreground">{message}</p>}

        {!project.book.artPlan && (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No art plan yet. Plan artwork to generate prompts for a cover and each chapter.
          </div>
        )}

        {cover && (
          <ArtworkCard
            artwork={cover}
            heading="Cover"
            projectId={project.id}
            busy={artworkBusy}
            busyId={artworkBusyId}
            onGenerate={generateArtwork}
            onUpdate={updateArtwork}
            onDelete={deleteArtwork}
            onUpload={() => void handleUpload(null)}
          />
        )}

        {chapters.map((chapter, index) => {
          const artworks = artworksByNode(chapter.id)
          return (
            <div key={chapter.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  {index + 1}. {chapter.title}
                </h3>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={artworkBusy}
                  onClick={() => void handleUpload(chapter.id)}
                >
                  <Upload className="h-3.5 w-3.5" /> Upload
                </Button>
              </div>
              {artworks.length === 0 && (
                <p className="text-xs text-muted-foreground">No artwork planned for this chapter.</p>
              )}
              {artworks.map((artwork) => (
                <ArtworkCard
                  key={artwork.id}
                  artwork={artwork}
                  heading={artwork.placement}
                  projectId={project.id}
                  busy={artworkBusy}
                  busyId={artworkBusyId}
                  onGenerate={generateArtwork}
                  onUpdate={updateArtwork}
                  onDelete={deleteArtwork}
                  onUpload={() => void handleUpload(chapter.id)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface ArtworkCardProps {
  artwork: Artwork
  heading: string
  projectId: string
  busy: boolean
  busyId: string | null
  onGenerate: (id: string) => Promise<{ ok: boolean; message?: string }>
  onUpdate: (
    id: string,
    patch: { prompt?: string; alt?: string; caption?: string; status?: 'planned' | 'disabled' }
  ) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onUpload: () => void
}

function ArtworkCard({
  artwork,
  heading,
  projectId,
  busy,
  busyId,
  onGenerate,
  onUpdate,
  onDelete,
  onUpload,
}: ArtworkCardProps) {
  const [prompt, setPrompt] = useState(artwork.prompt)
  const [alt, setAlt] = useState(artwork.alt)
  const [caption, setCaption] = useState(artwork.caption ?? '')

  useEffect(() => {
    setPrompt(artwork.prompt)
    setAlt(artwork.alt)
    setCaption(artwork.caption ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artwork.id])

  const generating = busyId === artwork.id

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium capitalize">{heading}</h4>
          <Badge
            variant={
              artwork.status === 'ready'
                ? 'default'
                : artwork.status === 'error'
                  ? 'destructive'
                  : 'secondary'
            }
          >
            {artwork.status}
          </Badge>
          {artwork.source === 'uploaded' && <Badge variant="outline">uploaded</Badge>}
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || artwork.status === 'disabled'}
            onClick={() => void onGenerate(artwork.id)}
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {artwork.status === 'ready' ? 'Regenerate' : 'Generate'}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onUpload}>
            <Upload className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Delete artwork"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Delete this artwork?')) void onDelete(artwork.id)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr]">
        <ArtworkThumb projectId={projectId} artwork={artwork} />
        <div className="space-y-2">
          <div>
            <Label htmlFor={`prompt-${artwork.id}`} className="text-xs text-muted-foreground">
              Prompt
            </Label>
            <textarea
              id={`prompt-${artwork.id}`}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onBlur={() => {
                if (prompt !== artwork.prompt) void onUpdate(artwork.id, { prompt })
              }}
              rows={3}
              className="mt-1 w-full resize-y rounded-md border bg-background px-3 py-2 text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`alt-${artwork.id}`} className="text-xs text-muted-foreground">
                Alt text
              </Label>
              <Input
                id={`alt-${artwork.id}`}
                value={alt}
                onChange={(event) => setAlt(event.target.value)}
                onBlur={() => {
                  if (alt !== artwork.alt) void onUpdate(artwork.id, { alt })
                }}
                className="mt-1 h-8 text-xs"
              />
            </div>
            <div>
              <Label htmlFor={`caption-${artwork.id}`} className="text-xs text-muted-foreground">
                Caption
              </Label>
              <Input
                id={`caption-${artwork.id}`}
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                onBlur={() => {
                  if (caption !== (artwork.caption ?? '')) void onUpdate(artwork.id, { caption })
                }}
                className="mt-1 h-8 text-xs"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void onUpdate(artwork.id, {
                  status: artwork.status === 'disabled' ? 'planned' : 'disabled',
                })
              }
            >
              {artwork.status === 'disabled' ? 'Enable' : 'Disable'}
            </Button>
            {artwork.error && <span className="text-xs text-destructive">{artwork.error}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function ArtworkThumb({ projectId, artwork }: { projectId: string; artwork: Artwork }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!artwork.asset) {
      setSrc(null)
      return
    }
    let active = true
    void api
      .artworkAsset(projectId, artwork.id, 'thumb')
      .then((value) => {
        if (active) setSrc(value)
      })
      .catch(() => {
        if (active) setSrc(null)
      })
    return () => {
      active = false
    }
  }, [projectId, artwork.id, artwork.asset, artwork.generatedAt])

  if (!artwork.asset) {
    return (
      <div className="flex h-28 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
        No image yet
      </div>
    )
  }

  return src ? (
    <img
      src={src}
      alt={artwork.alt}
      className={cn('h-28 w-full rounded-md border object-cover')}
    />
  ) : (
    <div className="flex h-28 items-center justify-center rounded-md border text-xs text-muted-foreground">
      Loading…
    </div>
  )
}
