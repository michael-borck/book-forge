'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileCode, FileText, FileImage } from 'lucide-react'
import { useBookStore } from '@/lib/store'
import { api, ApiError, type ExportFormat } from '@/lib/api'

const FORMATS: { format: ExportFormat; label: string; icon: typeof FileText }[] = [
  { format: 'markdown', label: 'Markdown', icon: FileCode },
  { format: 'html', label: 'HTML', icon: FileText },
  { format: 'pdf', label: 'PDF', icon: FileImage },
]

export default function ExportPage() {
  const { books, loading, unavailable, refresh } = useBookStore()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleExport(bookId: string, format: ExportFormat) {
    setBusy(`${bookId}:${format}`)
    setMessage(null)
    try {
      const result = await api.exportBook(bookId, format)
      if (!result.canceled) {
        setMessage({ ok: true, text: `Exported to ${result.path}` })
      }
    } catch (error) {
      const text =
        error instanceof ApiError || error instanceof Error ? error.message : 'Export failed'
      setMessage({ ok: false, text })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Export</h1>
        <p className="text-muted-foreground mt-2">
          Export your books to Markdown, HTML, or PDF
        </p>
      </div>

      {unavailable && (
        <p className="text-sm text-muted-foreground">
          Export is only available in the BookForge desktop app.
        </p>
      )}

      {message && (
        <p className={`mb-4 text-sm ${message.ok ? 'text-green-600' : 'text-destructive'}`}>
          {message.text}
        </p>
      )}

      {loading && !books.length && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="space-y-4">
        {books.map((book) => (
          <Card key={book.id}>
            <CardHeader>
              <CardTitle className="text-lg">{book.title}</CardTitle>
              <CardDescription>
                {book.chapters.length} chapters · {book.status}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map(({ format, label, icon: Icon }) => (
                  <Button
                    key={format}
                    size="sm"
                    variant="outline"
                    disabled={busy !== null || book.status === 'error'}
                    onClick={() => handleExport(book.id, format)}
                  >
                    <Icon className="h-4 w-4" />
                    {busy === `${book.id}:${format}` ? 'Exporting…' : label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && !unavailable && books.length === 0 && (
        <Card className="py-12 text-center">
          <CardContent>
            <p className="text-muted-foreground">
              No books to export yet.{' '}
              <Link href="/generate" className="text-primary underline underline-offset-4">
                Generate one first
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
