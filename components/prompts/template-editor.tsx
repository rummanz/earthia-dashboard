'use client'
import { useEffect, useState } from 'react'
import type { PromptTemplate, ContentType } from '@/lib/types'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CONTENT_TYPES } from '@/lib/constants'
import { useTemplateStore } from '@/lib/store'
import { parseVariables } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function TemplateEditor({
  template,
  onClose,
}: {
  template: PromptTemplate | null
  onClose: () => void
}) {
  const add = useTemplateStore((s) => s.add)
  const update = useTemplateStore((s) => s.update)

  const [name, setName] = useState(template?.name ?? '')
  const [body, setBody] = useState(template?.body ?? '')
  const [contentTypes, setContentTypes] = useState<ContentType[]>(template?.contentTypes ?? ['image'])
  const [toneHints, setToneHints] = useState(template?.toneHints ?? '')
  const [negativePrompt, setNegativePrompt] = useState(template?.negativePrompt ?? '')
  const [varDescriptions, setVarDescriptions] = useState<Record<string, string>>(
    Object.fromEntries((template?.variables ?? []).map((v) => [v.name, v.description ?? '']))
  )

  const detected = parseVariables(body)

  useEffect(() => {
    setVarDescriptions((cur) => {
      const next: Record<string, string> = {}
      for (const v of detected) next[v] = cur[v] ?? ''
      return next
    })
  }, [body])  // eslint-disable-line react-hooks/exhaustive-deps

  function save() {
    if (!name.trim() || !body.trim()) {
      toast.error('Name and body are required')
      return
    }
    const variables = detected.map((n) => ({ name: n, description: varDescriptions[n] || undefined }))
    if (template) {
      update(template.id, {
        name,
        body,
        contentTypes,
        toneHints: toneHints || undefined,
        negativePrompt: negativePrompt || undefined,
        variables,
      })
      toast.success('Template updated')
    } else {
      add({
        name,
        body,
        contentTypes,
        toneHints: toneHints || undefined,
        negativePrompt: negativePrompt || undefined,
        variables,
      })
      toast.success('Template created')
    }
    onClose()
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>{template ? 'Edit Template' : 'New Template'}</DialogTitle>

        <div className="space-y-4 mt-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cinematic Landscape" />
          </Field>

          <Field label="Content Type (multi-select)">
            <div className="flex flex-wrap gap-2">
              {CONTENT_TYPES.map((t) => {
                const active = contentTypes.includes(t.id)
                return (
                  <button
                    key={t.id}
                    onClick={() =>
                      setContentTypes((cur) =>
                        cur.includes(t.id) ? cur.filter((x) => x !== t.id) : [...cur, t.id]
                      )
                    }
                    className={cn(
                      'px-3 py-1.5 rounded-md border text-xs font-mono uppercase',
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                        : 'border-[var(--border)] hover:border-[var(--muted)]'
                    )}
                  >
                    {t.icon} {t.label}
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label="Template Body">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="A cinematic shot of {topic}, in a {mood} atmosphere..."
              rows={6}
            />
            {detected.length > 0 && (
              <div className="space-y-2 mt-3">
                <div className="section-label">Detected Variables</div>
                {detected.map((v) => (
                  <div key={v} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[var(--accent)] w-32">{`{${v}}`}</span>
                    <Input
                      placeholder="Description (optional hint for the agent)"
                      value={varDescriptions[v] ?? ''}
                      onChange={(e) =>
                        setVarDescriptions((c) => ({ ...c, [v]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </Field>

          <Field label="Tone / Style Hints">
            <Input
              value={toneHints}
              onChange={(e) => setToneHints(e.target.value)}
              placeholder="cinematic, dark, high contrast"
            />
          </Field>

          <Field label="Negative Prompt (optional)">
            <Input
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="low quality, blurry, oversaturated"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="section-label block mb-2">{label}</label>
      {children}
    </div>
  )
}
