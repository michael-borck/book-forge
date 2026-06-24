'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useBookStore, useSettingsStore } from '@/lib/store'

const STYLES = ['educational', 'casual', 'professional', 'creative']
const LENGTHS = [
  { value: 'short', label: 'Short (5 chapters)' },
  { value: 'medium', label: 'Medium (10 chapters)' },
  { value: 'long', label: 'Long (20 chapters)' },
]

export default function GeneratePage() {
  const { generating, progress, generate, cancel } = useBookStore()
  const { providers, statuses, refresh: refreshSettings, unavailable } = useSettingsStore()

  const [topic, setTopic] = useState('')
  const [style, setStyle] = useState('educational')
  const [length, setLength] = useState('short')
  const [canceling, setCanceling] = useState(false)
  const [result, setResult] = useState<
    { kind: 'success' | 'cancelled' | 'error'; bookId?: string; message?: string } | null
  >(null)

  useEffect(() => {
    void refreshSettings()
  }, [refreshSettings])

  const hasReadyProvider = providers.some((p) => statuses[p.id] === 'ready')

  async function handleGenerate(e: FormEvent) {
    e.preventDefault()
    setResult(null)
    setCanceling(false)
    const res = await generate({ topic: topic.trim(), style, length })
    if (!res.ok) {
      setResult({ kind: 'error', message: res.message })
    } else if (res.book?.status === 'cancelled') {
      setResult({ kind: 'cancelled', bookId: res.book.id })
    } else {
      setResult({ kind: 'success', bookId: res.book?.id })
    }
    setCanceling(false)
  }

  async function handleCancel() {
    setCanceling(true)
    await cancel()
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
          Use AI to create your next book from a simple prompt
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
                  disabled={generating}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="style">Style</Label>
                  <select
                    id="style"
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    disabled={generating}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm capitalize"
                  >
                    {STYLES.map((s) => (
                      <option key={s} value={s} className="capitalize">
                        {s}
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
                    disabled={generating}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    {LENGTHS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={generating || !topic.trim() || unavailable}
              >
                {generating ? 'Generating…' : 'Generate Book'}
              </Button>
            </form>

            {generating && progress && (
              <div className="mt-6 space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    {progress.phase === 'outline' && 'Generating outline…'}
                    {progress.phase === 'chapter' &&
                      `Writing chapter ${progress.currentChapter}/${progress.totalChapters}: ${progress.chapterTitle ?? ''}`}
                    {progress.phase === 'done' && 'Finishing up…'}
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
                {canceling && (
                  <p className="text-xs text-muted-foreground">
                    Stopping after the current chapter finishes…
                  </p>
                )}
              </div>
            )}

            {result && (
              <div className="mt-6 text-sm">
                {result.kind === 'success' && (
                  <p className="text-green-600">
                    Book generated.{' '}
                    <Link href="/library" className="underline underline-offset-4">
                      View in Library
                    </Link>
                  </p>
                )}
                {result.kind === 'cancelled' && (
                  <p className="text-amber-600">
                    Generation cancelled — partial book saved.{' '}
                    <Link href="/library" className="underline underline-offset-4">
                      View in Library
                    </Link>
                  </p>
                )}
                {result.kind === 'error' && (
                  <p className="text-destructive">{result.message ?? 'Generation failed.'}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
