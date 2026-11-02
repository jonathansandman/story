import { useState } from 'react'
import { Lightbulb, Plus, Wand2, X } from 'lucide-react'
import { addIdea, removeIdeas, updateIdea } from '@/db/repo'
import type { Story } from '@/db/types'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/primitives'
import { useAi } from '@/features/ai/ai-context'

/**
 * The ideas inbox. Jot an idea (or a change) the moment you have it — no
 * deciding where it goes. "Weave in" asks the AI to place everything in the
 * right chapters and beats, for you to approve.
 */
export function IdeasBar({ story }: { story: Story }) {
  const { openAi } = useAi()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const ideas = story.ideas ?? []

  const add = async () => {
    if (!draft.trim()) return
    await addIdea(story.id, draft)
    setDraft('')
  }

  return (
    <div className={cn('rounded-2xl border bg-surface shadow-soft transition-colors', ideas.length ? 'border-accent/30' : 'border-line')}>
      <form
        className="flex items-center gap-2 px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <Lightbulb size={16} className={cn('ml-1 shrink-0', ideas.length ? 'text-accent' : 'text-faint')} />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add an idea or a change — Grok will find where it belongs"
          className="h-9 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint max-sm:text-[16px]"
        />
        {draft.trim() && (
          <Button type="submit" size="sm" variant="subtle">
            <Plus /> Add
          </Button>
        )}
      </form>

      {ideas.length > 0 && (
        <div className="border-t border-line px-3 pt-2 pb-3">
          <ul className="space-y-1">
            {ideas.map((i) => (
              <li key={i.id} className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2/60">
                <span className={cn('mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full', i.kind === 'change' ? 'bg-warn' : 'bg-accent')} />
                {editing === i.id ? (
                  <textarea
                    autoFocus
                    defaultValue={i.text}
                    rows={2}
                    onBlur={async (e) => {
                      await updateIdea(story.id, i.id, e.target.value)
                      setEditing(null)
                    }}
                    className="min-w-0 flex-1 resize-y rounded-md border border-line bg-surface px-2 py-1 text-[13.5px] outline-none max-sm:text-[16px]"
                  />
                ) : (
                  <button onClick={() => setEditing(i.id)} className="min-w-0 flex-1 text-left text-[13.5px] leading-snug text-ink">
                    {i.kind === 'change' && <span className="mr-1.5 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn uppercase">Change</span>}
                    <span className={i.kind === 'change' ? 'line-clamp-2' : ''}>{i.text}</span>
                  </button>
                )}
                <button
                  onClick={() => removeIdeas(story.id, [i.id])}
                  className="rounded p-0.5 text-faint opacity-60 hover:text-ink lg:opacity-0 lg:group-hover:opacity-100"
                  aria-label="Remove idea"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between gap-2 pl-2">
            <span className="text-[12px] text-faint">
              {ideas.length} waiting{ideas.some((i) => i.kind === 'change') ? ' · includes changes to apply through the outline' : ''}
            </span>
            <Button size="sm" variant="primary" onClick={() => openAi({ kind: 'weave', storyId: story.id })}>
              <Wand2 /> Weave in with AI
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
