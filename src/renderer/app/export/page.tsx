'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BookOpen, FileCode, FileImage, FileText } from 'lucide-react'
import { api, ApiError, type CompileFormat } from '@/lib/api'
import { useProjectStore } from '@/lib/projectStore'

const FORMATS: { format: CompileFormat; label: string; icon: typeof FileText }[] = [
  { format: 'markdown', label: 'Markdown', icon: FileCode },
  { format: 'html', label: 'HTML', icon: FileText },
  { format: 'pdf', label: 'PDF', icon: FileImage },
  { format: 'docx', label: 'Word', icon: FileText },
  { format: 'epub', label: 'EPUB', icon: BookOpen },
]

export default function ExportPage() {
  const { projects, loading, refreshProjects } = useProjectStore()
  const [busy, setBusy] = useState<string | null>(null)
  const [batchBusy, setBatchBusy] = useState<CompileFormat | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    void refreshProjects()
  }, [refreshProjects])

  async function handleCompile(projectId: string, format: CompileFormat) {
    setBusy(`${projectId}:${format}`)
    setMessage(null)
    try {
      const result = await api.compileProject(projectId, format)
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

  async function handleBatch(format: CompileFormat) {
    if (projects.length === 0) return
    setBatchBusy(format)
    setMessage(null)
    try {
      const result = await api.batchCompile(
        projects.map((project) => project.id),
        format
      )
      if (result.canceled) return
      const ok = result.results.filter((entry) => !entry.error).length
      const failed = result.results.filter((entry) => entry.error).length
      setMessage({
        ok: failed === 0,
        text: `Exported ${ok} project(s)${failed ? `, ${failed} failed` : ''}.`,
      })
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : 'Batch export failed',
      })
    } finally {
      setBatchBusy(null)
    }
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Compile &amp; Export</h1>
        <p className="text-muted-foreground mt-2">
          Export any book project to Markdown, HTML, PDF, Word, or EPUB
        </p>
      </div>

      {projects.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Compile all projects</CardTitle>
            <CardDescription>
              Choose a folder once, then export every project into it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map(({ format, label, icon: Icon }) => (
                <Button
                  key={format}
                  size="sm"
                  variant="outline"
                  disabled={batchBusy !== null}
                  onClick={() => void handleBatch(format)}
                >
                  <Icon className="h-4 w-4" />
                  {batchBusy === format ? 'Exporting…' : `All as ${label}`}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {message && (
        <p className={`mb-4 text-sm ${message.ok ? 'text-green-600' : 'text-destructive'}`}>
          {message.text}
        </p>
      )}

      {loading && !projects.length && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="space-y-4">
        {projects.map((project) => (
          <Card key={project.id}>
            <CardHeader>
              <CardTitle className="text-lg">{project.title}</CardTitle>
              <CardDescription>
                {project.wordCount.toLocaleString()} words · {project.status}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map(({ format, label, icon: Icon }) => (
                  <Button
                    key={format}
                    size="sm"
                    variant="outline"
                    disabled={busy !== null || project.status === 'draft'}
                    onClick={() => handleCompile(project.id, format)}
                  >
                    <Icon className="h-4 w-4" />
                    {busy === `${project.id}:${format}` ? 'Exporting…' : label}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" asChild>
                  <Link href={`/book?id=${project.id}`}>Open workbench</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && projects.length === 0 && (
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
