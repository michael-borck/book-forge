'use client'

import { useEffect, useMemo, useState } from 'react'
import { Marked } from 'marked'
import { Save, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/lib/projectStore'
import type { BookNode, EditAction } from '@/lib/api'

const previewMarked = new Marked()
previewMarked.use({ renderer: { html: () => '' } })

const ACTIONS: Array<{ action: EditAction; label: string }> = [
  { action: 'refine', label: 'Refine' },
  { action: 'expand', label: 'Expand' },
  { action: 'shorten', label: 'Shorten' },
  { action: 'continue', label: 'Continue' },
  { action: 'regenerate', label: 'Regenerate' },
]

const PREVIEW_CLASSES =
  'w-1/2 overflow-auto border-l px-6 py-4 text-sm leading-relaxed ' +
  '[&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold ' +
  '[&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc ' +
  '[&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l ' +
  '[&_blockquote]:pl-4 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-muted ' +
  '[&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3'

interface EditorPaneProps {
  node: BookNode
}

export function EditorPane({ node }: EditorPaneProps) {
  const saveNode = useProjectStore((state) => state.saveNode)
  const editNode = useProjectStore((state) => state.editNode)
  const cancelEdit = useProjectStore((state) => state.cancelEdit)
  const editingNodeId = useProjectStore((state) => state.editingNodeId)
  const revision = useProjectStore((state) => state.revision)

  const [title, setTitle] = useState(node.title)
  const [synopsis, setSynopsis] = useState(node.synopsis)
  const [content, setContent] = useState(node.content)
  const [instruction, setInstruction] = useState('')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [mode, setMode] = useState<'write' | 'split'>('write')

  // Reset local state when switching nodes or after a wholesale replacement
  // (AI edit, snapshot restore, generation).
  useEffect(() => {
    setTitle(node.title)
    setSynopsis(node.synopsis)
    setContent(node.content)
    setSavedAt(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id, revision])

  const busy = editingNodeId !== null
  const isProse = node.kind !== 'part'
  const dirty =
    title !== node.title || synopsis !== node.synopsis || content !== node.content

  useEffect(() => {
    if (!dirty || busy) return
    const timer = setTimeout(() => {
      void saveNode(node.id, {
        title: title.trim() || node.title,
        synopsis,
        content,
      }).then(() => setSavedAt(new Date().toLocaleTimeString()))
    }, 600)
    return () => clearTimeout(timer)
  }, [dirty, busy, title, synopsis, content, node.id, node.title, saveNode])

  // Cmd/Ctrl+S forces a save even while the debounce timer is pending.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      void saveNode(node.id, {
        title: title.trim() || node.title,
        synopsis,
        content,
      }).then(() => setSavedAt(new Date().toLocaleTimeString()));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [title, synopsis, content, node.id, node.title, saveNode]);

  const words = content.trim() ? content.trim().split(/\s+/).length : 0
  const preview = useMemo(
    () => previewMarked.parse(content, { async: false }) as string,
    [content]
  )

  function runAction(action: EditAction) {
    void editNode(node.id, action, instruction.trim() || undefined)
    setInstruction('')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-6 py-3">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={busy}
          className="border-none px-0 text-2xl font-bold shadow-none focus-visible:ring-0"
          aria-label="Chapter title"
        />
        <div className="mt-2">
          <Label htmlFor="synopsis" className="text-xs text-muted-foreground">
            Brief / synopsis
          </Label>
          <Input
            id="synopsis"
            value={synopsis}
            onChange={(event) => setSynopsis(event.target.value)}
            disabled={busy}
            placeholder="What happens in this chapter? Used as the generation brief."
            className="mt-1 h-8 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b px-6 py-2">
        {ACTIONS.map(({ action, label }) => (
          <Button
            key={action}
            size="sm"
            variant="outline"
            disabled={busy || !isProse}
            onClick={() => runAction(action)}
          >
            {label}
          </Button>
        ))}
        <Input
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          disabled={busy}
          placeholder="Optional direction (e.g. simplify for beginners)"
          className="h-8 max-w-xs text-xs"
        />
        {busy && (
          <Button size="sm" variant="ghost" onClick={() => void cancelEdit()}>
            <Square className="h-3.5 w-3.5" /> Cancel
          </Button>
        )}
        <div className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant={mode === 'write' ? 'secondary' : 'ghost'}
            onClick={() => setMode('write')}
          >
            Write
          </Button>
          <Button
            size="sm"
            variant={mode === 'split' ? 'secondary' : 'ghost'}
            onClick={() => setMode('split')}
          >
            Split
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          disabled={busy || !isProse}
          placeholder={
            isProse
              ? 'Write here, or generate chapters from the outline…'
              : 'Parts are containers; write in their chapters.'
          }
          className={cn(
            'resize-none bg-background px-6 py-4 font-mono text-sm leading-relaxed outline-none',
            mode === 'split' ? 'w-1/2 border-r' : 'flex-1'
          )}
          spellCheck={false}
        />
        {mode === 'split' && (
          <div
            className={PREVIEW_CLASSES}
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        )}
      </div>

      <div className="flex items-center justify-between border-t px-6 py-2 text-xs text-muted-foreground">
        <span>{words.toLocaleString()} words</span>
        <span className="flex items-center gap-1">
          <Save className="h-3.5 w-3.5" />
          {busy ? 'AI is editing…' : savedAt ? `Saved ${savedAt}` : dirty ? 'Unsaved…' : 'All changes saved'}
        </span>
      </div>
    </div>
  )
}
