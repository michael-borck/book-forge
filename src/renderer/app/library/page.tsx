'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BookOpen, Clock, FileText, Trash2, ArrowLeft } from 'lucide-react'
import { useBookStore } from '@/lib/store'
import type { Book, BookStatus } from '@/lib/api'

const STATUS_VARIANT: Record<BookStatus, BadgeProps['variant']> = {
  completed: 'default',
  generating: 'secondary',
  error: 'destructive',
  cancelled: 'outline',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString()
}

function BookReader({ book, onBack }: { book: Book; onBack: () => void }) {
  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Back to library
      </Button>
      <h2 className="text-2xl font-bold">{book.title}</h2>
      <p className="text-sm text-muted-foreground mt-1">
        {book.provider} · {book.model} · {book.chapters.length} chapters
      </p>
      <div className="mt-6 space-y-8">
        {book.chapters.map((chapter) => (
          <section key={chapter.id}>
            <h3 className="text-xl font-semibold">
              {chapter.number}. {chapter.title}
            </h3>
            {chapter.status === 'error' ? (
              <p className="mt-2 text-sm text-destructive">This chapter failed to generate.</p>
            ) : (
              <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                {chapter.content || '(empty)'}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

export default function LibraryPage() {
  const { books, loading, unavailable, error, refresh, remove } = useBookStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selected = books.find((b) => b.id === selectedId) ?? null

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">My Library</h1>
        <p className="text-muted-foreground mt-2">View and manage your generated books</p>
      </div>

      {unavailable && (
        <p className="text-sm text-muted-foreground">
          The library is only available in the BookForge desktop app.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {selected ? (
        <BookReader book={selected} onBack={() => setSelectedId(null)} />
      ) : (
        <>
          {loading && !books.length && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {books.map((book) => (
              <Card key={book.id} className="flex flex-col transition-shadow hover:shadow-lg">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <BookOpen className="h-8 w-8 text-primary" />
                    <Badge variant={STATUS_VARIANT[book.status]}>{book.status}</Badge>
                  </div>
                  <CardTitle className="mt-4">{book.title}</CardTitle>
                  <CardDescription>{book.description || book.topic}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileText className="h-4 w-4" />
                      {book.chapters.length} chapters
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {formatDate(book.createdAt)}
                    </span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" onClick={() => setSelectedId(book.id)}>
                      Read
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(book.id)}>
                      <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {!loading && !unavailable && books.length === 0 && (
            <Card className="py-12 text-center">
              <CardContent>
                <BookOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">No books yet. Generate your first book!</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
