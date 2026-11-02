# Trellis

**A local-first planning tool for long-form, character-driven fiction.**
Build reusable **Characters**, structure **Stories → Chapters → Beats**, then copy any beat, chapter or custom selection as a clean, well-structured prompt for the AI that writes your prose (Grok, Claude, GPT, a local model).

> *A trellis is the structure a plant grows along. Trellis is the structure your prose grows along. The writing happens elsewhere.*

Why not "StoryBible"? A bible is something you *consult*. A trellis is something you *build first*, on purpose, before anything grows. That's the habit this app is built to support.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check + production build to `dist/` (static files, host anywhere) |
| `npm run preview` | Serve the production build locally |
| `npm test` | Unit tests for the prompt engine (Vitest) |
| `npm run typecheck` | TypeScript only |

On first load, Trellis seeds an example story, *The Long Weekend*. It has three characters (a married couple and the first love who lives next door), two defined relationships, three chapters and seven beats at different stages of planning. Use **Settings → Reset to example data** to bring it back.

No accounts and no server. Your data lives in your browser's IndexedDB.

---

## Information architecture

```
Sidebar ──┬── Stories (home) ── story cards with planning progress
          ├── Characters ─────── library grid → character editor
          ├── Your stories ───── quick links
          └── Settings ───────── theme · prompt defaults · backup · snapshots

Story ────┬── Outline ────────── chapter rail │ chapter panel with beat cards
          ├── Story bible ────── logline, premise, heat, POV, tense, style guide, rules, world
          └── Cast & dynamics ── who's in it (+ story-specific notes) · every pair's relationship

⌘K ─────── search across characters, stories, chapters and the full text of beats
Composer ── modal opened from any beat/chapter/selection: options │ live preview │ copy
```

### Primary flows

1. **Create a character once, reuse it everywhere.** In *Characters* you get a long-form editor (identity, modular appearance, inner life, voice and sample lines, intimacy, boundaries, history, private notes). A live **"As exported"** panel beside it shows the sheet at Brief, Standard or Full detail, with a token count. You see the cost of a long sheet while you write it.
2. **Outline before prose.** A story's *Outline* shows chapters on the left (drag to reorder, with a status bar per beat) and the selected chapter's beats on the right. Beats are cards: click one to expand an inline editor, drag the handle to reorder, use the menu to move it to another chapter.
3. **Copy as prompt.**
   - **Beat:** the copy icon on a beat card, or **Copy beat prompt** in the expanded card.
   - **Chapter:** **Copy chapter prompt** in the chapter header.
   - **Custom selection:** tick beats (the selection persists across chapters), then use **Copy as prompt** in the floating bar.
   - **Compose…** on any of these opens the composer, where you can change the format, detail level, per-character detail, sections and extra instructions with a live preview. Options are remembered per story, and ⌘/Ctrl+Enter copies.
4. **Paste the prose back.** After the writing AI replies, copy its passage and tap **Paste result** on the beat (or *Paste prose from clipboard* in the beat's menu). The prose is stored on that beat, and the beat is marked **Written**. Each beat has a **Plan / Prose** switch. Pasting again saves a **new version**, and you choose which version is active.
5. **Close the loop.** The next beat's prompt quotes the **last ~250 words of the previous beat's prose**, across chapter breaks too, under *"Pick up from here"*, so the new passage continues seamlessly. Add a 1–3 sentence **recap** to a written beat and later prompts use it as "story so far" instead of your original plan.
6. **Read it.** The **Read** switch on a chapter shows every beat's prose in order as one comfortable reading page, with gaps marked. **Copy chapter text** copies the whole chapter.

### Designing for the writer's psychology

The app is meant to make planning feel rewarding and rushing feel slightly uncomfortable, without blocking anything:

- **Beat status ladder:** *Idea → Planned → Ready to write → Written.* Each chapter in the rail shows one coloured segment per beat, so you can see at a glance how much is planned.
- **Placeholders are questions** ("What does each person feel going in — and coming out?"), not labels.
- **Readiness hints in the composer:** *"Before you send — the AI will have to guess:"* followed by a list such as a beat with no emotional state, a character with no essence line, a missing style guide, or written beats with no recap. These are nudges, not errors.
- **One essence line per character** gets the most prominent spot in the editor, because it's the field that matters most in a prompt.
- **Calm UI:** warm paper tones, a serif for story content (Newsreader), a sans-serif for interface text (Geist), lots of whitespace, and very little colour.

---

## Data model

All types are in [`src/db/types.ts`](src/db/types.ts). Each entity is its own flat table, and children point to their parent with foreign keys. Nothing is a deeply nested document.

```
Character ─────────────┐ (global library)
Relationship(a, b) ────┤ (global; exported when both a and b are in scope)
                       │
Story ── cast[] ───────┘ CastMember { characterId, role, storyNotes }
  └─ Chapter (storyId, order, povCharacterId, characterIds[])
       └─ Beat (chapterId, order, characterIds[], status, recap, …)
```

| Entity | Key fields | Notes |
|---|---|---|
| **Character** | `name`, `tagline` (essence), `appearance: Trait[]`, `personality`, `voice`, `sampleLines[]`, `motivations`, `desires`, `boundaries`, `backstory`, `notes`, `tags[]` | `Trait = { label, value, essential }`. Starred (*essential*) traits are always exported. The others are exported only at Full detail. |
| **Relationship** | `characterIds: [a, b]` (sorted), `label`, `dynamic`, `history`, `tension`, `consent` | Stored once per pair rather than copied into both character sheets. |
| **Story** | `logline`, `premise`, `genre`, `heat`, `pov`, `tense`, `style`, `contentRules`, `world`, `cast[]`, `exportPrefs` | `cast[].storyNotes` adds story-specific details to a character ("in this story she's just been promoted") without editing the master sheet. |
| **Chapter** | `order`, `title`, `purpose`, `summary`, `povCharacterId`, `characterIds[]`, `setting`, `notes` | `summary` is used as "story so far" in later chapters. |
| **Beat** | `order`, `title`, `description`, `emotion`, `tone`, `pacing`, `mustInclude`, `mustAvoid`, `characterIds[]`, `targetWords`, `status`, `recap`, `activeDraftId` | An empty `characterIds` list means the beat inherits the chapter's characters. |
| **Draft** | `beatId`, `storyId`, `text`, `source` (`pasted` / `typed` / `ai-rewrite`), `note`, `createdAt` | One row per **version** of a beat's prose. The beat's `activeDraftId` marks the current one. Versions are rows, not a single string on the beat, so AI rewrites, comparing versions and multi-beat revision passes can be added later without changing the data model. |

**Why flat tables:** reordering writes only the rows whose position changed. A 300-beat story doesn't mean rewriting one huge document on every keystroke. A future sync layer can also merge row by row.

**Ordering:** each row has an integer `order`. A drag writes new indices only for the rows that moved, which is cheap at chapter and beat scale. The UI keeps the new order locally until the database write lands, so items don't flicker back.

**Write path:** components never write to Dexie directly. Every mutation goes through [`src/db/repo.ts`](src/db/repo.ts), which handles timestamps, cascading deletes (deleting a character unlinks it from every story, chapter and beat) and transactions. Edits to nested arrays (traits, sample lines, cast) use a read-modify-write inside a single IndexedDB operation, so two quick edits can't overwrite each other.

**Edit history:** v1 doesn't track per-field history. Instead it keeps **snapshots** of the whole database. One is taken automatically at most every 6 hours, and always before an import, restore or reset. The latest 20 are kept, and you can take one manually in Settings. Any snapshot can be restored. Together with **Download backup** (a single JSON file), that gives you real recovery without the complexity of versioning every row.

---

## How export prompts are structured

The prompt engine is in [`src/export/`](src/export). It's pure TypeScript with no React or database code, and it's unit-tested.

```
loadBundle(storyId)  ─►  buildPrompt({ bundle, scope, options, overrides })  ─►  PromptDocument  ─►  render(doc, format)
   (db/hooks.ts)              (export/build.ts)                                (export/document.ts)   (export/render.ts)
```

`PromptDocument` is a format-agnostic tree of sections, fields, lists and text. Renderers turn it into **Markdown**, **XML-tagged** text or **plain** text. A new target, such as JSON for an API call, a different model's preferred format or a .docx brief, only needs a new renderer.

### Section order

The order is deliberate. It follows how an editor would brief a ghostwriter, and it puts the part the model must act on last, closest to where it starts generating:

1. **Your task:** what to write, POV, tense, length (summed from the beats' target word counts), "stay in character", "don't write past *Stop before*", "output prose only". Your extra instructions are added here.
2. **The story:** title, logline, genre, heat level, premise, setting, then **Style guide** and **Content rules** as subsections.
3. **Characters on the page:** one sheet per relevant character, POV character first.
4. **Relationships:** only pairs where *both* characters are on the page.
5. **Story so far:** one line per earlier chapter (its summary, or its purpose if there's no summary), then **Earlier in this chapter**: each earlier beat's *recap*, or a shortened version of its plan marked `(planned)`.
6. **Pick up from here:** the last ~250 words of the previous beat's active prose, trimmed to start at a paragraph or sentence boundary. If the previous beat ends the last chapter, the prompt says so and asks for a new chapter.
7. **Chapter:** purpose, setting, POV (and the chapter summary for single-beat prompts).
8. **The beat(s):** what happens, who's on the page, emotional state, tone, pacing, must include, must avoid, length.
9. **Stop before:** the next beat (or the next chapter, for chapter prompts), explicitly labelled *do not write*. This is the most effective guard against the model writing past the end of the beat.

An abridged example, a single beat in Markdown:

```markdown
# The Long Weekend — Chapter 2, Beat 2: Stranded

## Your task
Write the prose for the beat described at the end of this brief, as one continuous scene segment. …
- Point of view: Theo Okafor — Close third, alternating by chapter.
- Tense: past.
- Length: roughly 2,000 words.
- Do not write past the point marked "Stop before".
- Output prose only — no headings, beat labels, summaries, or commentary.

## The story
**Heat level:** Slow burn → explicit. Intimacy is earned and emotionally specific; never gratuitous.
### Style guide
Restrained, sensory, interior. …

## Characters on the page
### Theo Okafor
**Identity:** he/him · 36 · POV, Protagonist
**Essence:** A session cellist who listens for a living and has stopped listening at home.
**Voice:** Unhurried. Long pauses he doesn't apologise for. …
**Boundaries:** …
### Mara Ellison
…

## Relationships
### Theo Okafor & Mara Ellison — Married nine years, drifting
**Consent and check-ins:** … Either can stop anything with "pause" and it is honoured instantly.

## Story so far
- Chapter 1: Arrival — They arrive at the cottage in the rain, perform politeness, …
### Earlier in Chapter 2: Low Tide
- Beat 1: The causeway — Theo and Mara walk out to the island at low tide. … (planned)

## Chapter 2: Low Tide
**Purpose:** Crack the politeness. First real touch in months.

## The beat — Beat 2: Stranded
**What happens:** They misjudge the tide and have to wait out the night in the old lifeboat shelter. …
**Emotional state:** Theo: wanting to be asked. Mara: wanting to stop deciding.
**Must include:** Explicit verbal consent before anything escalates — "yes?" / "yes."

## Stop before (next beat — do not write)
Beat 3: June's lights — Walking back at dawn, they see June's workshop lit. …
```

### What "relevant character context" means

For each target beat, Trellis includes:

- the characters tagged on the beat, or the chapter's characters if the beat has none;
- the chapter's **POV character**, always, because the reader is in their head;
- for a **whole-chapter** prompt, the chapter's declared characters as well.

Characters are ordered POV first, then by story cast order. Relationships are included only when both people are in that set. A third character tagged on the chapter but not on this beat stays out of the beat prompt.

### Avoiding prompt bloat

| Lever | Effect |
|---|---|
| **Detail level** (Brief / Standard / Full), story-wide | *Brief*: identity, essence, essential traits, voice, boundaries. *Standard*: adds personality, wants, desires, up to 3 sample lines and story notes. *Full*: adds every trait, all sample lines and backstory. |
| **Per-character override** in the composer | e.g. Full for the POV character, Brief for a walk-on, or Off. Each character's token cost is shown. |
| **Essential traits** (★) | Appearance is modular. Star the 2–3 details that matter and the rest stay out except at Full. |
| **Recaps over plans** | Continuity uses short recaps. Planned beats are shortened to about 220 characters at a sentence boundary. |
| **Continuity cap** | At most 8 earlier chapters are listed; older ones are counted ("3 earlier chapters omitted"). |
| **Section toggles** | Leave out the story bible, relationships, continuity, the stop marker or the task when you don't need them. |
| **Live token estimate** | Shown in the composer (about 4 characters per token) and in the character editor, which warns above about 900 tokens. |

Things that are **always** exported: boundaries, and the consent and check-in notes of any relationship in scope. They're short, and they're the details a writing model must not get wrong. **Never** exported by default: private writer notes on characters and chapters. You can switch them on in the composer.

---

## Tech choices

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite + React 19 + TypeScript (strict)** | The app is entirely client-side, so Next.js's server features (SSR, API routes) would add complexity without benefit. Vite builds static files you can host anywhere or open from a local server. |
| Persistence | **Dexie 4 on IndexedDB** + `dexie-react-hooks` | Real database semantics (indexes, transactions, compound keys) in the browser, plenty of storage, and **reactive live queries**: components re-render when rows change, including from another tab. Dexie also has an optional sync add-on (Dexie Cloud), which leaves the door open later. |
| Styling | **Tailwind CSS v4** with semantic tokens (`bg-surface`, `text-muted`, `border-line`, `bg-accent`) defined as CSS variables | Light and dark mode are one set of variables in `index.css`. Components never use raw colours. |
| Accessible primitives | **Radix UI** (Dialog, DropdownMenu, Popover) | Focus management and keyboard support. Styling is entirely ours, which gives what shadcn/ui offers without its CLI and copied-in code. |
| Drag and drop | **dnd-kit** | Accessible: focus a handle, press Space, move with the arrow keys, press Space to drop. Works with touch, and is modular. |
| Fonts | **Geist** (interface), **Newsreader** (story text), **JetBrains Mono** (prompt preview), all bundled through `@fontsource` | Self-hosted, so no request to Google Fonts. That keeps the app private and working offline. |
| Tests | **Vitest** | The prompt engine is pure, and the seed doubles as a realistic test fixture. |

### Local-first and privacy

- No backend, no analytics, no external requests at runtime.
- Text you type is saved locally about 350 ms after you stop typing (and immediately when you leave a field). The value shown while typing is kept in local component state, so the cursor never jumps while the database catches up.
- **Backups are plain JSON** (`trellis-backup-YYYY-MM-DD.json`). Commit them to a private GitHub repo for off-device history and diffs today, or let a future GitHub sync feature do it for you (see the roadmap).

---

## Project layout

```
src/
  db/          types · Dexie schema · factories · repo (all writes) · hooks (reactive reads) · seed · bootstrap
  export/      document model · bundle loader · prompt builder · renderers · readiness hints · tests
  features/
    stories/     home · story layout & tabs · outline (chapter rail + panel) · beat card · bible · cast
    characters/  library · editor · picker · relationship editor
    export/      composer + quick-copy context
    search/      ⌘K command palette
    settings/    theme · defaults · backup · snapshots
  components/
    ui/          primitives (Button, draft-backed inputs, Segmented, Switch, Avatar…) · overlays · Sortable
    layout/      app shell & sidebar · page scaffolding
  lib/         ids · text utils · theme · clipboard · cn
```

**Extending it:**

- *A new field on a beat:* add it to `types.ts`, give it a default in `factories.ts`, add an input in `BeatCard.tsx`, and export it from `beatNode()` in `build.ts`. For existing rows, bump the version in `db.ts` and backfill the default in an `.upgrade()` callback.
- *A new export format:* add a renderer in `render.ts` and add it to `PromptFormat`.
- *AI features:* `buildPrompt` already produces the context. A "suggest next beats" feature is a new `scope` plus a `task` section and an API call.

---

## Scope

### v1 (this release)

Character library with modular traits, relationships and a live export preview · stories with a story bible and a cast with story-specific notes · chapters and beats with drag-and-drop, status and recaps · prose paste-back with versions, a chapter reading view and previous-passage continuity · prompt engine with 3 formats, 3 detail levels, per-character overrides, continuity, stop markers and readiness hints · one-click copy for a beat, a chapter or a selection, plus the composer · ⌘K full-text search · dark mode · JSON backup and import · automatic snapshots · example seed data.

### Mobile

Trellis is built to be used mostly on a phone:
- Beat actions (copy, menu, drag handle) are always visible on touch screens rather than appearing on hover.
- The composer opens full-screen with **Copy prompt** at the top and its options folded away behind **Options**.
- Every field is at least 16px on phones, so iOS doesn't zoom in when you tap into it.
- The character editor's export preview and relationships move below the form.
- The reading view uses a comfortable serif page size.

The phone loop is **Copy beat prompt** → switch to Grok → copy the reply → back to Trellis → **Paste result**. On iOS, Safari shows a small "Paste" bubble the first time; that's the browser asking permission. If clipboard access is blocked, there's always a plain box you can long-press and paste into.

### Next: revision (planned)

Prose versions are already stored per beat, so the next step is a **revision workspace**: select one or more beats, write feedback ("make Theo less passive, keep the tide clock"), and either export a *rewrite prompt* that includes the current prose, the plan and the characters, or call a model directly with your own API key. The result is saved as a new `ai-rewrite` version you can compare against the previous one. A continuity check would read the active prose of neighbouring beats and flag contradictions with recaps, character sheets and boundaries.

### v1.1

- Drag beats *between* chapters (today it's done from the beat's menu).
- A whole-story **board** view: every chapter as a column of beat cards.
- **Mentioned-but-absent characters:** export a one-line summary for characters who are referred to but not on the page.
- Named **prompt presets** ("Grok — explicit", "Claude — XML, brief sheets").
- Snapshot diff ("what changed since…").

### v2

- **Optional GitHub sync:** write the backup JSON, or one file per entity for readable diffs, to a private repo of the user's choosing using a fine-grained token kept only in the browser. Pull and merge on open.
- **AI-assisted planning:** suggest beats, flag continuity problems, draft recaps from pasted prose. The planning stays yours and the AI assists.
- More export targets: a .docx story bible, JSON for API calls, a direct "send to model" for users who bring their own API key.
- Collaboration: CRDT-based sync, for example Dexie Cloud or Yjs.
- PWA install and an offline-first service worker.

---

## Trade-offs

- **Browser storage can be cleared.** IndexedDB is durable but tied to the browser. Snapshots protect against mistakes, not against clearing site data. Download backups. On startup Trellis asks the browser for persistent storage (`navigator.storage.persist()`), which makes eviction under storage pressure much less likely.
- **Integer ordering instead of fractional indexes:** a reorder rewrites the positions of the rows that moved. That's trivial at this scale and simpler to reason about. Fractional indexing becomes worth it once multi-device sync arrives.
- **Snapshots instead of per-field history:** whole-database snapshots are cheap for text-only data (the example is about 30 KB) and easy to restore, but there's no per-field undo yet.
- **Token counts are estimates** (about 4 characters per token). Bundling a real tokenizer per model would add hundreds of KB for little practical gain.
- **The heuristic for relevant characters is explicit rather than inferred.** Trellis doesn't guess from names mentioned in the text. Tagging is a small amount of effort, and in return you control exactly what goes into the prompt.
