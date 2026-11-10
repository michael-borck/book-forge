'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BookOpen, Clock, Copy, FileText, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/lib/projectStore'
import type { ProjectStatus } from '@/lib/api'

const STATUS_VARIANT: Record<ProjectStatus, BadgeProps['variant']> = {
  completed: 'default',
  planned: 'secondary',
  draft: 'outline',
  generating: 'secondary',
  error: 'destructive',
  cancelled: 'outline',
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString()
}

export default function LibraryPage() {
  const router = useRouter()
  const {
    projects,
    loading,
    error,
    refreshProjects,
    deleteProject,
    duplicateProject,
  } = useProjectStore()

  useEffect(() => {
    void refreshProjects()
  }, [refreshProjects])

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">My Library</h1>
          <p className="text-muted-foreground mt-2">Open a book to edit, illustrate, and compile it</p>
        </div>
        <Button asChild>
          <Link href="/generate">
            <Plus className="h-4 w-4" /> New book
          </Link>
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && !projects.length && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <Card key={project.id} className="flex flex-col transition-shadow hover:shadow-lg">
            <CardHeader>
              <div className="flex items-start justify-between">
                <BookOpen className="h-8 w-8 text-primary" />
                <Badge variant={STATUS_VARIANT[project.status]}>{project.status}</Badge>
              </div>
              <CardTitle className="mt-4">{project.title}</CardTitle>
              <CardDescription>{project.description || project.author || 'Untitled book'}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  {project.wordCount.toLocaleString()} words
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {formatDate(project.modifiedAt)}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => router.push(`/book?id=${project.id}`)}>
                  Open
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void duplicateProject(project.id)}>
                  <Copy className="h-4 w-4" /> Duplicate
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void deleteProject(project.id)}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && projects.length === 0 && (
        <Card className="py-12 text-center">
          <CardContent>
            <BookOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No books yet. Start your first one!</p>
            <Button asChild className="mt-4">
              <Link href="/generate">Generate a book</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
