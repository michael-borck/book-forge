'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettingsStore } from '@/lib/store'
import { useProjectStore } from '@/lib/projectStore'
import { api, type BookEstimate, type BookTemplateDefinition } from '@/lib/api'

const STYLES = ['educational', 'casual', 'professional', 'creative']
const LENGTHS = [
  { value: 'short', label: 'Short (5 chapters)' },
  { value: 'medium', label: 'Medium (10 chapters)' },
  { value: 'long', label: 'Long (20 chapters)' },
]

export default function GeneratePage() {
  const router = useRouter()
  const { providers, statuses, refresh: refreshSettings, unavailable } = useSettingsStore()
  const { busy, progress, createProject, plan, generate, cancel } = useProjectStore()

  const [topic, setTopic] = useState('')
  const [style, setStyle] = useState('educational')
  const [length, setLength] = useState('short')
  const [templateId, setTemplateId] = useState('blank')
  const [templates, setTemplates] = useState<BookTemplateDefinition[]>([])
  const [canceling, setCanceling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<BookEstimate | null>(null)

  useEffect(() => {
    void refreshSettings()
    void api
      .listTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]))
  }, [refreshSettings])

  const hasReadyProvider = providers.some((p) => statuses[p.id] === 'ready')
  const template = templates.find((candidate) => candidate.id === templateId)

  function applyTemplate(id: string) {
    setTemplateId(id)
    const selected = templates.find((candidate) => candidate.id === id)
    if (selected) {
      setStyle(selected.settings.style)
      setLength(selected.settings.length)
    }
  }

  useEffect(() => {
    if (!hasReadyProvider) {
      setEstimate(null)
      return
    }
    let active = true
    void api
      .estimateBook({ topic: 'Untitled', style, length })
      .then((value) => {
        if (active) setEstimate(value)
      })
      .catch(() => {
        if (active) setEstimate(null)
      })
    return () => {
      active = false
    }
  }, [style, length, hasReadyProvider])

  async function handleGenerate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setCanceling(false)

    const project = await createProject({
      title: topic.trim(),
      topic: topic.trim(),
      style,
      length,
      templateId: templateId === 'blank' ? undefined : templateId,
    })
    if (!project) {
      setError('Could not create the project.')
      return
    }

    // A template ships a chapter skeleton, so skip outline planning.
    if (project.book.nodes.length === 0) {
      const planned = await plan()
      if (!planned.ok) {
        setError(planned.message ?? 'Outline generation failed.')
        return
      }
    }

    const written = await generate()
    if (!written.ok) {
      setError(written.message ?? 'Chapter generation failed.')
      return
    }

    router.push(`/book?id=${project.id}`)
  }

  async function handleCancel() {
    setCanceling(true)
    await cancel()
    setCanceling(false)
  }

  const percent =
    progress?.phase === 'chapter' && progress.totalChapters
      ? Math.round(((progress.currentChapter ?? 0) / progress.totalChapters) * 100)
      : progress?.phase === 'done'
        ? 100
        : 0

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Generate New Book</h1>
        <p className="text-muted-foreground mt-2">
          BookForge plans the outline, writes each chapter, and saves everything as an editable project.
        </p>
      </div>

      <div className="grid gap-6">
        {!unavailable && !hasReadyProvider && (
          <Card>
            <CardContent className="py-4 text-sm">
              No provider is ready.{' '}
              <Link href="/settings" className="text-primary underline underline-offset-4">
                Configure one in Settings
              </Link>{' '}
              before generating.
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Book Details</CardTitle>
            <CardDescription>Provide information about the book you want to generate</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleGenerate}>
              <div className="space-y-1.5">
                <Label htmlFor="topic">Book Topic</Label>
                <Input
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., Introduction to Machine Learning"
                  disabled={busy}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="template">Template</Label>
                <select
                  id="template"
                  value={templateId}
                  onChange={(event) => applyTemplate(event.target.value)}
                  disabled={busy}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="blank">Blank book — plan the outline</option>
                  {templates
                    .filter((candidate) => candidate.id !== 'blank')
                    .map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                </select>
                {template && (
                  <p className="text-xs text-muted-foreground">
                    {template.description}
                    {template.chapters.length > 0
                      ? ` · ${template.chapters.length} chapters pre-planned`
                      : ''}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="style">Style</Label>
                  <select
                    id="style"
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    disabled={busy}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm capitalize"
                  >
                    {STYLES.map((value) => (
                      <option key={value} value={value} className="capitalize">
                        {value}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="length">Length</Label>
                  <select
                    id="length"
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                    disabled={busy}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    {LENGTHS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {estimate && (
                <p className="text-xs text-muted-foreground">
                  Estimated: {estimate.chapters} chapters ·{' '}
                  {(estimate.tokensIn + estimate.tokensOut).toLocaleString()} tokens ·{' '}
                  {estimate.cost.totalCost > 0
                    ? `${estimate.cost.currency} ${estimate.cost.totalCost.toFixed(2)}`
                    : 'cost unavailable for this model'}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={busy || !topic.trim() || unavailable}
              >
                {busy ? 'Working…' : 'Generate Book'}
              </Button>
            </form>

            {busy && (
              <div className="mt-6 space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    {progress?.phase === 'outline' && 'Planning the outline…'}
                    {progress?.phase === 'chapter' &&
                      `Writing chapter ${progress.currentChapter}/${progress.totalChapters}: ${progress.chapterTitle ?? ''}`}
                    {progress?.phase === 'done' && 'Finishing up…'}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={canceling}
                    onClick={handleCancel}
                  >
                    {canceling ? 'Cancelling…' : 'Cancel'}
                  </Button>
                </div>
              </div>
            )}

            {error && <p className="mt-6 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
