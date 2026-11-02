import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { addIdea, removeIdeas, updateIdea } from '@/db/repo'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/overlays'
import { Scroll } from '@/components/layout/Screen'
import { useAi } from '@/features/ai/ai-context'
import { useStoryCtx } from './StoryShell'

/** Jot ideas without deciding where they go; weave them in with AI later. */
export function IdeasTab() {
  const { story } = useStoryCtx()
  const { openAi } = useAi()
  const toast = useToast()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const ideas = story.ideas ?? []

  const add = async () => {
    if (!draft.trim()) return
    await addIdea(story.id, draft)
    setDraft('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Scroll>
        <div className="mx-auto w-full max-w-xl px-4 py-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void add()
            }}
            className="flex gap-2"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void add()
                }
              }}
              rows={2}
              placeholder="An idea, a scene, a change…"
              className="min-w-0 flex-1 resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] outline-none focus:border-accent/60"
            />
            <Button type="submit" disabled={!draft.trim()} className="self-stretch">
              Add
            </Button>
          </form>

          <ul className="mt-4 divide-y divide-line">
            {ideas.map((i) => (
              <li key={i.id} className="flex items-start gap-2 py-3">
                <span className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', i.kind === 'change' ? 'bg-warn' : 'bg-accent')} aria-label={i.kind === 'change' ? 'Change' : 'Idea'} />
                {editing === i.id ? (
                  <textarea
                    autoFocus
                    defaultValue={i.text}
                    rows={3}
                    onBlur={async (e) => {
                      await updateIdea(story.id, i.id, e.target.value)
                      setEditing(null)
                    }}
                    className="min-w-0 flex-1 resize-y rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[15px] outline-none"
                  />
                ) : (
                  <button onClick={() => setEditing(i.id)} className="min-w-0 flex-1 text-left text-[15px] leading-relaxed">
                    {i.kind === 'change' && <span className="mr-1.5 text-[12px] font-semibold text-warn uppercase">Change</span>}
                    {i.text}
                  </button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove idea"
                  onClick={async () => {
                    const undo = await removeIdeas(story.id, [i.id])
                    toast('Idea removed', undefined, { action: { label: 'Undo', run: undo } })
                  }}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </Scroll>
      {ideas.length > 0 && (
        <div className="shrink-0 border-t border-line bg-surface px-3 py-3">
          <div className="mx-auto max-w-xl">
            <Button variant="primary" className="w-full justify-center" onClick={() => openAi({ kind: 'weave', storyId: story.id })}>
              <Sparkles /> Weave {ideas.length} into the outline
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
