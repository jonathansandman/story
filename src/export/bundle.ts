import type { Beat, Chapter, Character, Relationship, Story } from '@/db/types'

/**
 * Everything the prompt builder needs, loaded once. The builder itself is a
 * pure function of (bundle, scope, options) — easy to test, easy to preview
 * live while the user tweaks options.
 */
export interface StoryBundle {
  story: Story
  /** Ordered by `order`. */
  chapters: Chapter[]
  /** chapterId → beats ordered by `order`. */
  beatsByChapter: Map<string, Beat[]>
  characters: Map<string, Character>
  relationships: Relationship[]
}

export type ExportScope =
  | { kind: 'beat'; beatId: string }
  | { kind: 'chapter'; chapterId: string }
  /** Arbitrary beats, possibly across chapters; exported in story order. */
  | { kind: 'selection'; beatIds: string[] }

export function makeBundle(input: {
  story: Story
  chapters: Chapter[]
  beats: Beat[]
  characters: Character[]
  relationships: Relationship[]
}): StoryBundle {
  const chapters = [...input.chapters].filter((c) => c.storyId === input.story.id).sort((a, b) => a.order - b.order)
  const beatsByChapter = new Map<string, Beat[]>(chapters.map((c) => [c.id, []]))
  for (const b of input.beats) beatsByChapter.get(b.chapterId)?.push(b)
  for (const list of beatsByChapter.values()) list.sort((a, b) => a.order - b.order)
  return {
    story: input.story,
    chapters,
    beatsByChapter,
    characters: new Map(input.characters.map((c) => [c.id, c])),
    relationships: input.relationships,
  }
}

/** A beat with its position in the story, for headings and continuity. */
export interface LocatedBeat {
  beat: Beat
  chapter: Chapter
  chapterIndex: number
  beatIndex: number
}

/** All beats in reading order. */
export function storyOrder(bundle: StoryBundle): LocatedBeat[] {
  return bundle.chapters.flatMap((chapter, chapterIndex) =>
    (bundle.beatsByChapter.get(chapter.id) ?? []).map((beat, beatIndex) => ({ beat, chapter, chapterIndex, beatIndex })),
  )
}
