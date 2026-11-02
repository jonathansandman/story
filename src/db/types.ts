/**
 * Trellis data model.
 *
 * Hierarchy:  Character (global, reusable)
 *             Story ─┬─ cast: links to Characters with story-specific overlays
 *                    └─ Chapter (ordered) ── Beat (ordered, atomic unit)
 *             Relationship (global, between two Characters)
 *
 * Every table is flat and keyed by string id. Parent/child links are foreign
 * keys (storyId, chapterId) rather than nested arrays so that:
 *   - reordering touches only the moved rows,
 *   - very large stories don't require rewriting one huge document,
 *   - a future sync layer can merge row-by-row.
 */

export type ID = string

/** Shared bookkeeping fields. Timestamps are epoch ms. */
export interface Timestamps {
  createdAt: number
  updatedAt: number
}

/* ──────────────────────────── Characters ──────────────────────────── */

/**
 * A single, modular piece of physical description ("Hair: copper, cropped").
 * `essential` traits are always exported; the rest only at "full" detail.
 * This is the main lever against prompt bloat for long character sheets.
 */
export interface Trait {
  id: ID
  label: string
  value: string
  essential: boolean
}

export interface Character extends Timestamps {
  id: ID
  name: string
  /** Nicknames / what other characters call them. */
  aka: string
  pronouns: string
  age: string
  /** One-line essence. Always exported. The single most important field. */
  tagline: string
  /** Accent colour used for avatars and chips. */
  color: string
  tags: string[]

  appearance: Trait[]
  personality: string
  /** How they talk: rhythm, vocabulary, tics. */
  voice: string
  /** A few lines of sample dialogue — hugely effective in prompts. */
  sampleLines: string[]
  motivations: string
  /** What they want, enjoy, and are drawn to, intimately. */
  desires: string
  /** Hard limits and soft limits. Always exported when the character is in scope. */
  boundaries: string
  backstory: string
  /** Private writer's notes. Never exported unless explicitly enabled. */
  notes: string
}

/** Fields that can be shown/hidden per export detail level. */
export type CharacterTextField =
  | 'personality'
  | 'voice'
  | 'motivations'
  | 'desires'
  | 'boundaries'
  | 'backstory'
  | 'notes'

/* ─────────────────────────── Relationships ─────────────────────────── */

/**
 * A dynamic between two characters. Exported automatically whenever *both*
 * characters are in the prompt's scope — that's what makes couple dynamics
 * "just work" without duplicating text into each character sheet.
 */
export interface Relationship extends Timestamps {
  id: ID
  /** Exactly two character ids, stored sorted for stable lookup. */
  characterIds: [ID, ID]
  /** Short label: "Married, 9 years", "Rivals → lovers". */
  label: string
  /** How they are together: power balance, rhythm, affection, friction. */
  dynamic: string
  /** Shared history worth knowing. */
  history: string
  /** The live wire: what's unresolved between them right now. */
  tension: string
  /** How they negotiate intimacy, check in, signal. Exported with boundaries. */
  consent: string
}

/* ────────────────────────────── Stories ────────────────────────────── */

export type StoryStatus = 'seed' | 'outlining' | 'drafting' | 'complete'

/** A character's participation in a specific story, with an optional overlay. */
export interface CastMember {
  characterId: ID
  /** "Protagonist", "Love interest", "Ex-husband"... */
  role: string
  /** Story-specific overrides/additions: "In this story she's just been promoted." */
  storyNotes: string
}

export interface Story extends Timestamps {
  id: ID
  title: string
  logline: string
  premise: string
  genre: string
  /** e.g. "Slow burn, explicit", "Fade to black" — tells the writer AI the heat. */
  heat: string
  /** Point of view, e.g. "Close third, alternating Mara/Theo". */
  pov: string
  tense: 'past' | 'present' | ''
  /** Prose style guide: voice, sentence rhythm, what to emulate/avoid. */
  style: string
  /** Story-wide content rules (always/never). */
  contentRules: string
  /** Setting, world, recurring places. */
  world: string
  status: StoryStatus
  tags: string[]
  /** Themes the story explores ("trust after betrayal"). Exported with the story bible. */
  themes: string[]
  cast: CastMember[]
  /** Ideas inbox: loose ideas or changes waiting to be woven into the outline. */
  ideas: Idea[]
  /** Saved prompt-export preferences for this story. */
  exportPrefs?: Partial<ExportOptions>
}

/** A loose idea or change, waiting in the story's inbox to be woven into the outline by AI. */
export interface Idea {
  id: ID
  text: string
  /** "change" = something already changed (e.g. the premise) that the outline should follow. */
  kind: 'idea' | 'change'
  createdAt: number
}

/* ────────────────────────────── Chapters ───────────────────────────── */

export interface Chapter extends Timestamps {
  id: ID
  storyId: ID
  /** Sort key within the story. Integers, rewritten on reorder. */
  order: number
  title: string
  /** What this chapter is *for* — its job in the story. */
  purpose: string
  /** Short synopsis; used as "story so far" context for later chapters. */
  summary: string
  povCharacterId: ID | null
  /** Characters present in the chapter (beats can narrow this further). */
  characterIds: ID[]
  setting: string
  notes: string
}

/* ─────────────────────────────── Beats ─────────────────────────────── */

export type BeatStatus = 'idea' | 'planned' | 'ready' | 'written'

export interface Beat extends Timestamps {
  id: ID
  storyId: ID
  chapterId: ID
  order: number
  title: string
  /** What happens. The heart of the beat. */
  description: string
  /** Emotional state / interior: who feels what, and how it shifts. */
  emotion: string
  tone: string
  pacing: string
  mustInclude: string
  mustAvoid: string
  /** Characters on the page. Empty = inherit from chapter. */
  characterIds: ID[]
  /** Optional target length in words for this segment. */
  targetWords: number | null
  /**
   * What actually happened once written (a 1–3 sentence recap). Used as
   * continuity context for later beats instead of the full plan.
   */
  recap: string
  status: BeatStatus
  /** The draft currently treated as "the" prose for this beat. Null = nothing written yet. */
  activeDraftId: ID | null
}

/* ─────────────────────────────── Drafts ─────────────────────────────── */

export type DraftSource = 'pasted' | 'typed' | 'ai-rewrite'

/**
 * A version of the prose for one beat. Pasting new prose creates a new draft;
 * editing changes the active draft in place. Keeping versions as separate rows
 * (rather than one string on the beat) is what makes future features cheap:
 * AI rewrites with feedback, comparing versions, multi-beat revision passes.
 */
export interface Draft extends Timestamps {
  id: ID
  beatId: ID
  storyId: ID
  text: string
  source: DraftSource
  /** Optional note: "Grok, first pass", "tightened dialogue". */
  note: string
}

/* ────────────────────────────── Export ─────────────────────────────── */

export type DetailLevel = 'brief' | 'standard' | 'full'
export type PromptFormat = 'markdown' | 'xml' | 'plain'

export interface ExportOptions {
  format: PromptFormat
  characterDetail: DetailLevel
  includeStory: boolean
  includeTask: boolean
  /** Summary of earlier chapters + earlier beats in this chapter. */
  includeContinuity: boolean
  /** Show the next beat as a "stop here" marker so the AI doesn't overrun. */
  includeNextBeat: boolean
  includeRelationships: boolean
  /** The tail of the previous beat's prose, so the next passage continues seamlessly. */
  includePreviousPassage: boolean
  includeWriterNotes: boolean
  /** Free text appended to the task section. */
  extraInstructions: string
}

/* ─────────────────────────── Persistence meta ──────────────────────── */

export interface Snapshot {
  id: ID
  createdAt: number
  label: string
  /** Serialized `TrellisBackup` JSON. */
  data: string
}

export interface TrellisBackup {
  app: 'trellis'
  schemaVersion: number
  exportedAt: number
  characters: Character[]
  relationships: Relationship[]
  stories: Story[]
  chapters: Chapter[]
  beats: Beat[]
  /** Added in schema v2; optional so v1 backups still import. */
  drafts?: Draft[]
}
