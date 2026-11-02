import { useOutletContext } from 'react-router'
import { Wand2 } from 'lucide-react'
import { useAi } from '@/features/ai/ai-context'
import { Button } from '@/components/ui/primitives'
import { updateStory } from '@/db/repo'
import type { Story } from '@/db/types'
import { Field, Segmented, TagInput, TextArea, TextInput } from '@/components/ui/primitives'
import type { StoryOutletContext } from './StoryLayout'

/** Story-wide context: exported at the top of every prompt for this story. */
export function StoryBible() {
  const { story } = useOutletContext<StoryOutletContext>()
  const set = (patch: Partial<Story>) => updateStory(story.id, patch)
  const { openAi } = useAi()

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8 lg:py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-[13.5px] text-muted">
          Everything here is shared context for every prompt in this story. Fill in what you know; the rest can wait. Shorter and specific beats long and vague.
        </p>
        <Button size="sm" onClick={() => openAi({ kind: 'story', storyId: story.id })}>
          <Wand2 /> Fill in with AI
        </Button>
      </div>

      <div className="space-y-6">
        <Field label="Logline" hint="One sentence: who wants what, and what's in the way.">
          <TextArea minRows={1} value={story.logline} onCommit={(logline) => set({ logline })} placeholder="When a… must… or else…" className="font-serif text-[16px]" />
        </Field>
        <Field label="Premise" hint="The shape of the whole story in a paragraph. Exported at standard and full detail.">
          <TextArea minRows={3} value={story.premise} onCommit={(premise) => set({ premise })} placeholder="Set-up, the turn, what's at stake." />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Genre">
            <TextInput value={story.genre} onCommit={(genre) => set({ genre })} placeholder="Contemporary romance, adult" />
          </Field>
          <Field label="Heat level" hint="Tell the writing AI how explicit to be.">
            <TextInput value={story.heat} onCommit={(heat) => set({ heat })} placeholder="Slow burn → explicit" />
          </Field>
          <Field label="Point of view">
            <TextInput value={story.pov} onCommit={(pov) => set({ pov })} placeholder="Close third, alternating" />
          </Field>
          <Field label="Tense">
            <div>
              <Segmented
                value={story.tense || 'none'}
                onChange={(v) => set({ tense: v === 'none' ? '' : v })}
                options={[
                  { value: 'past', label: 'Past' },
                  { value: 'present', label: 'Present' },
                  { value: 'none', label: 'Unspecified' },
                ]}
              />
            </div>
          </Field>
        </div>

        <Field label="Style guide" hint="Voice, rhythm, spelling, what to emulate, what to avoid. This shapes the prose more than anything else.">
          <TextArea
            minRows={4}
            value={story.style}
            onCommit={(style) => set({ style })}
            placeholder="Restrained, sensory, interior. Short paragraphs. Avoid clichés like… British spelling."
          />
        </Field>
        <Field label="Content rules" hint="Story-wide always / never.">
          <TextArea minRows={2} value={story.contentRules} onCommit={(contentRules) => set({ contentRules })} placeholder="Always: … Never: …" />
        </Field>
        <Field label="Setting and world">
          <TextArea minRows={3} value={story.world} onCommit={(world) => set({ world })} placeholder="Places, season, texture, rules of the world." />
        </Field>
        <Field label="Tags">
          <TagInput value={story.tags} onChange={(tags) => set({ tags })} />
        </Field>
      </div>
    </div>
  )
}
