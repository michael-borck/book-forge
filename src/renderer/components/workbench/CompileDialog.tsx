'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/lib/projectStore'
import type { CompileFormat } from '@/lib/api'
import { cn } from '@/lib/utils'

interface CompileDialogProps {
  open: boolean
  onClose: () => void
}

const FORMATS: Array<{ value: CompileFormat; label: string }> = [
  { value: 'markdown', label: 'Markdown (.md)' },
  { value: 'html', label: 'HTML (.html)' },
  { value: 'pdf', label: 'PDF (.pdf)' },
  { value: 'docx', label: 'Word (.docx)' },
  { value: 'epub', label: 'EPUB (.epub)' },
]

export function CompileDialog({ open, onClose }: CompileDialogProps) {
  const project = useProjectStore((state) => state.project)
  const compile = useProjectStore((state) => state.compile)

  const [format, setFormat] = useState<CompileFormat>('markdown')
  const [toc, setToc] = useState(true)
  const [frontMatter, setFrontMatter] = useState(true)
  const [backMatter, setBackMatter] = useState(true)
  const [numbering, setNumbering] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMessage(null)
    setBusy(false)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open || !project) return null

  function applyProfile(profileId: string) {
    const profile = project?.compileProfiles.find((candidate) => candidate.id === profileId)
    if (!profile) return
    setFormat(profile.format)
    setToc(profile.toc)
    setFrontMatter(profile.includeKinds.includes('front-matter'))
    setBackMatter(profile.includeKinds.includes('back-matter'))
  }

  async function handleCompile() {
    setBusy(true)
    setMessage(null)
    const result = await compile(format, {
      toc,
      frontMatter,
      backMatter,
      numbering,
    })
    setBusy(false)
    if (result.ok) {
      const warnings = result.warnings?.length
        ? ` (${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}: ${result.warnings.join('; ')})`
        : ''
      setMessage(`Exported to ${result.path}${warnings}`)
    } else if (result.message) {
      setMessage(result.message)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-lg border bg-card p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Compile book"
      >
        <h2 className="text-lg font-semibold">Compile book</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose a format and what to include in the manuscript.
        </p>

        <div className="mt-4 space-y-3 text-sm">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Preset</span>
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-2"
              defaultValue=""
              onChange={(event) => applyProfile(event.target.value)}
            >
              <option value="">Custom</option>
              {project.compileProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Format</span>
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-2"
              value={format}
              onChange={(event) => setFormat(event.target.value as CompileFormat)}
            >
              {FORMATS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <Check label="Table of contents" checked={toc} onChange={setToc} />
            <Check label="Chapter numbers" checked={numbering} onChange={setNumbering} />
            <Check label="Front matter" checked={frontMatter} onChange={setFrontMatter} />
            <Check label="Back matter" checked={backMatter} onChange={setBackMatter} />
          </div>
        </div>

        {message && (
          <p className={cn('mt-4 break-words text-xs', message.startsWith('Exported') ? 'text-green-600' : 'text-destructive')}>
            {message}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button onClick={() => void handleCompile()} disabled={busy}>
            {busy ? 'Exporting…' : 'Export'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-input"
      />
      {label}
    </label>
  )
}
