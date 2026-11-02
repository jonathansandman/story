import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { db } from '@/db/db'
import { deleteRelationship, updateRelationship } from '@/db/repo'
import type { Character } from '@/db/types'
import { Avatar, Button, Field, TextArea, TextInput } from '@/components/ui/primitives'
import { Dialog, useConfirm } from '@/components/ui/overlays'

export function RelationshipDialog({
  relationshipId,
  characters,
  onClose,
}: {
  relationshipId: string | null
  characters: Map<string, Character>
  onClose: () => void
}) {
  const r = useLiveQuery(async () => (relationshipId ? ((await db.relationships.get(relationshipId)) ?? null) : null), [relationshipId])
  const { confirm, element } = useConfirm()
  const [a, b] = r ? r.characterIds.map((id) => characters.get(id)) : []

  return (
    <Dialog
      open={!!relationshipId}
      onOpenChange={(o) => !o && onClose()}
      title={
        <span className="flex items-center gap-3">
          <span className="flex -space-x-2">
            {a && <Avatar name={a.name} color={a.color} size={28} />}
            {b && <Avatar name={b.name} color={b.color} size={28} />}
          </span>
          {a?.name ?? '…'} & {b?.name ?? '…'}
        </span>
      }
      description="Exported whenever both characters are on the page."
      className="max-w-2xl"
    >
      {r && (
        <div className="space-y-5 overflow-y-auto px-6 py-5">
          <Field label="In a few words">
            <TextInput value={r.label} onCommit={(v) => updateRelationship(r.id, { label: v })} placeholder="Married nine years, drifting" />
          </Field>
          <Field label="Dynamic" hint="Power balance, rhythm, how affection and friction show up.">
            <TextArea value={r.dynamic} onCommit={(v) => updateRelationship(r.id, { dynamic: v })} placeholder="How are they together, when no one is watching?" />
          </Field>
          <Field label="Shared history">
            <TextArea value={r.history} onCommit={(v) => updateRelationship(r.id, { history: v })} placeholder="What do they both remember differently?" />
          </Field>
          <Field label="Current tension" hint="The live wire. What's unresolved right now?">
            <TextArea value={r.tension} onCommit={(v) => updateRelationship(r.id, { tension: v })} placeholder="What does each want from the other that they won't ask for?" />
          </Field>
          <Field label="Consent and check-ins" hint="How they negotiate intimacy, signal, and stop.">
            <TextArea value={r.consent} onCommit={(v) => updateRelationship(r.id, { consent: v })} placeholder="How does each ask? How does each say no?" />
          </Field>
          <div className="flex justify-between border-t border-line pt-4">
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                if (await confirm('Delete this relationship?', { body: 'The characters themselves are not affected.' })) {
                  await deleteRelationship(r.id)
                  onClose()
                }
              }}
            >
              <Trash2 /> Delete
            </Button>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}
      {element}
    </Dialog>
  )
}
