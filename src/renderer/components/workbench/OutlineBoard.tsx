'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useProjectStore } from '@/lib/projectStore'
import type { BookNode } from '@/lib/api'

function OutlineCard({ node, number }: { node: BookNode; number: number }) {
  const saveNode = useProjectStore((state) => state.saveNode)
  const [title, setTitle] = useState(node.title)
  const [synopsis, setSynopsis] = useState(node.synopsis)

  useEffect(() => {
    setTitle(node.title)
    setSynopsis(node.synopsis)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id])

  const dirty = title !== node.title || synopsis !== node.synopsis

  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => {
      void saveNode(node.id, { title: title.trim() || node.title, synopsis })
    }, 600)
    return () => clearTimeout(timer)
  }, [dirty, title, synopsis, node.id, node.title, saveNode])

  return (
    <Card>
      <CardHeader className="pb-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Chapter {number}
        </span>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="border-none px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
          aria-label={`Chapter ${number} title`}
        />
      </CardHeader>
      <CardContent>
        <Label htmlFor={`synopsis-${node.id}`} className="text-xs text-muted-foreground">
          Brief
        </Label>
        <Input
          id={`synopsis-${node.id}`}
          value={synopsis}
          onChange={(event) => setSynopsis(event.target.value)}
          placeholder="One or two sentences on what this chapter covers."
          className="mt-1"
        />
      </CardContent>
    </Card>
  )
}

export function OutlineBoard() {
  const project = useProjectStore((state) => state.project)
  if (!project) return null

  const chapters = project.book.nodes
    .filter((node) => node.kind === 'chapter' && node.parentId === null)
    .sort((a, b) => a.order - b.order)

  if (chapters.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Plan an outline to see chapter cards here.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mx-auto grid max-w-4xl gap-3">
        {chapters.map((node, index) => (
          <OutlineCard key={node.id} node={node} number={index + 1} />
        ))}
      </div>
    </div>
  )
}
