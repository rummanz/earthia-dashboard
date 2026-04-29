'use client'
import { useState } from 'react'
import { useTemplateStore } from '@/lib/store'
import type { PromptTemplate, ContentType } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, MoreVertical } from 'lucide-react'
import { TemplateEditor } from './template-editor'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatDate, parseVariables } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown'
import { toast } from 'sonner'

export function PromptsGrid() {
  const templates = useTemplateStore((s) => s.templates)
  const remove = useTemplateStore((s) => s.remove)
  const [editing, setEditing] = useState<PromptTemplate | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const deleteTarget = templates.find((t) => t.id === deleteId)

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-mono text-xl uppercase tracking-wider">Prompt Templates</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            {templates.length} template{templates.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          New Template
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {templates.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            tpl={tpl}
            onEdit={() => setEditing(tpl)}
            onDelete={() => setDeleteId(tpl.id)}
          />
        ))}
      </div>

      {(creating || editing) && (
        <TemplateEditor
          template={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      )}

      <Dialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Delete Template</DialogTitle>
          <p className="text-sm text-[var(--muted)] mt-2">
            This template is used by{' '}
            <span className="text-[var(--foreground)]">{deleteTarget?.usageCount ?? 0}</span>{' '}
            content items. Deleting will not affect already-generated content.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (deleteId) {
                  remove(deleteId)
                  toast.success('Template deleted')
                  setDeleteId(null)
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TemplateCard({
  tpl,
  onEdit,
  onDelete,
}: {
  tpl: PromptTemplate
  onEdit: () => void
  onDelete: () => void
}) {
  const vars = parseVariables(tpl.body)
  return (
    <Card
      onClick={onEdit}
      className="cursor-pointer hover:border-[var(--muted)] transition-colors"
    >
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {tpl.contentTypes.map((ct: ContentType) => (
              <Badge key={ct} variant="outline">
                {ct}
              </Badge>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              onClick={(e) => e.stopPropagation()}
              className="text-[var(--muted)] hover:text-[var(--foreground)] p-1"
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="text-[var(--danger)]"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <h3 className="font-semibold text-base">{tpl.name}</h3>

        <p className="text-xs text-[var(--muted)] font-mono line-clamp-3">{tpl.body}</p>

        {vars.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {vars.map((v) => (
              <span
                key={v}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30"
              >
                {`{${v}}`}
              </span>
            ))}
          </div>
        )}

        <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider text-[var(--muted)] pt-2 border-t border-[var(--border)]">
          <span>Used in {tpl.usageCount} items</span>
          <span>Last used {tpl.lastUsedAt ? formatDate(tpl.lastUsedAt) : '—'}</span>
        </div>
      </CardContent>
    </Card>
  )
}
