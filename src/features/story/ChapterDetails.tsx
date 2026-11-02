import { updateChapter } from '@/db/repo'
import type { Chapter, Character } from '@/db/types'
import { Field, TextArea, TextInput } from '@/components/ui/primitives'
import { CharacterChips, CharacterPicker } from '@/features/characters/CharacterPicker'

/** All editable chapter fields. Shown in a sheet on phones, the inspector on desktop. */
export function ChapterDetails({ chapter, characters, castIds }: { chapter: Chapter; characters: Map<string, Character>; castIds: string[] }) {
  const set = (patch: Partial<Chapter>) => updateChapter(chapter.id, patch)
  const pov = chapter.povCharacterId ? characters.get(chapter.povCharacterId) : undefined
  return (
    <div className="space-y-5">
      <Field label="Title">
        <TextInput value={chapter.title} onCommit={(title) => set({ title })} placeholder="Chapter title" />
      </Field>
      <Field label="Purpose">
        <TextArea minRows={2} value={chapter.purpose} onCommit={(purpose) => set({ purpose })} placeholder="What must be different by the end?" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Point of view">
          <CharacterPicker
            single
            selected={chapter.povCharacterId ? [chapter.povCharacterId] : []}
            onChange={([id]) => set({ povCharacterId: id ?? null })}
            pool={castIds}
            trigger={
              <button className="flex h-11 w-full items-center rounded-lg border border-line bg-surface px-3 text-left text-[14px] hover:border-line-strong lg:h-9">
                {pov?.name ?? <span className="text-faint">Choose…</span>}
              </button>
            }
          />
        </Field>
        <Field label="Setting">
          <TextInput value={chapter.setting} onCommit={(setting) => set({ setting })} placeholder="Where and when" />
        </Field>
      </div>
      <Field label="Characters">
        <CharacterChips ids={chapter.characterIds} characters={characters} onChange={(characterIds) => set({ characterIds })} pool={castIds} placeholder="Add" />
      </Field>
      <Field label="Summary">
        <TextArea minRows={2} value={chapter.summary} onCommit={(summary) => set({ summary })} placeholder="What happened, in two sentences" />
      </Field>
      <Field label="Private notes">
        <TextArea minRows={2} value={chapter.notes} onCommit={(notes) => set({ notes })} placeholder="Just for you" />
      </Field>
    </div>
  )
}
