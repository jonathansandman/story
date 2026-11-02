import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { TrellisDB } from '@/db/db'
import { importBackup } from '@/db/repo'
import { buildSeed } from '@/db/seed'
import { applyPlan, loadState } from './apply'
import { extractJson, parseReply } from './patch'
import { defaultSelection, planPatch, type DataState } from './plan'
import { buildAiRequest } from './requests'

const seedState = (): DataState => {
  const s = buildSeed()
  return { stories: s.stories, characters: s.characters, relationships: s.relationships, chapters: s.chapters, beats: s.beats, beatsWithProse: new Set(['b_ch_1_0', 'b_ch_1_1']) }
}

describe('parseReply', () => {
  it('extracts a fenced block from chatty replies and repairs common mistakes', () => {
    const reply = 'Sure! Here you go:\n```json\n{ “characters”: [ { "name": "Ana", "appearance": { "Hair": "black", "Eyes": "grey" }, "sampleLines": "Hi.\\nBye.", }, ], }\n```\nHope that helps.'
    const { patch, error } = parseReply(reply)
    expect(error).toBeUndefined()
    expect(patch?.characters[0]?.appearance).toEqual([
      { label: 'Hair', value: 'black', essential: true },
      { label: 'Eyes', value: 'grey', essential: true },
    ])
    expect(patch?.characters[0]?.sampleLines).toEqual(['Hi.', 'Bye.'])
  })

  it('accepts loose key names and string beats', () => {
    const { patch } = parseReply('{"chapters":[{"name":"One","beats":["She arrives.", {"what_happens":"He waits.","emotional_state":"dread","words":"800"}]}]}')
    const beats = patch!.chapters[0]!.beats!
    expect(beats[0]!.description).toBe('She arrives.')
    expect(beats[1]).toMatchObject({ description: 'He waits.', emotion: 'dread', targetWords: 800 })
  })

  it('reports missing JSON clearly', () => {
    expect(parseReply('no json here').error).toMatch(/Couldn’t find/)
    expect(extractJson('text {"a":1} more')).toBe('{"a":1}')
  })
})

describe('planPatch', () => {
  it('creates a whole new story with characters, relationships and beats, resolving names', () => {
    const { patch } = parseReply(
      JSON.stringify({
        story: { title: 'Salt', logline: 'Two divers.' },
        characters: [{ name: 'Ines Rocha', tagline: 'A diver', role: 'Lead' }, { name: 'Mara Ellison', storyNotes: 'Visiting' }],
        relationships: [{ between: ['Ines', 'Mara Ellison'], label: 'Strangers' }],
        chapters: [{ title: 'Dive', pov: 'Ines', beats: [{ title: 'Descent', description: 'Down.', characters: ['Ines', 'Mara'] }] }],
      }),
    )
    const plan = planPatch(patch!, seedState())
    expect(plan.storyIsNew).toBe(true)
    const keys = plan.changes.map((c) => `${c.group}:${c.op}`)
    expect(keys).toEqual(['story:create', 'character:create', 'relationship:create', 'chapter:create'])
    // Mara matched the existing library character and only got story notes (no field changes → no character change).
    const story = plan.changes[0]!.row as { cast: { characterId: string; role: string }[] }
    expect(story.cast.map((m) => m.characterId)).toContain('c_mara')
    const ch = plan.changes.find((c) => c.group === 'chapter')!
    expect(ch.beats?.[0]?.row.characterIds).toContain('c_mara')
    expect(plan.warnings).toEqual([])
  })

  it('updates existing entities by id and shows field diffs', () => {
    const { patch } = parseReply(JSON.stringify({ characters: [{ id: 'c_theo', name: 'Theo Okafor', voice: 'Clipped now.' }] }))
    const plan = planPatch(patch!, seedState())
    expect(plan.changes).toHaveLength(1)
    expect(plan.changes[0]).toMatchObject({ op: 'update', fields: [{ label: 'Voice', after: 'Clipped now.' }] })
  })

  it('replace mode deletes unlisted beats and flags prose', () => {
    const { patch } = parseReply(JSON.stringify({ chapters: [{ id: 'ch_1', beatsMode: 'replace', beats: [{ id: 'b_ch_1_2' }, { title: 'New end', description: 'x' }] }] }))
    const plan = planPatch(patch!, seedState(), { targetStoryId: 's_long_weekend' })
    const ch = plan.changes.find((c) => c.group === 'chapter')!
    const deletes = ch.beats!.filter((b) => b.op === 'delete')
    expect(deletes).toHaveLength(2)
    expect(deletes.every((d) => d.hasProse)).toBe(true)
    expect(ch.beatOrder?.[0]).toBe('b_ch_1_2')
  })

  it('merge mode places a new beat after the beat listed before it', () => {
    const { patch } = parseReply(JSON.stringify({ chapters: [{ id: 'ch_2', beats: [{ id: 'b_ch_2_1', tone: 'Bleak' }, { title: 'Coda', description: 'y' }] }] }))
    const plan = planPatch(patch!, seedState(), { targetStoryId: 's_long_weekend' })
    const ch = plan.changes.find((c) => c.group === 'chapter')!
    expect(ch.beatOrder).toEqual(['b_ch_2_0', 'b_ch_2_1', ch.beats![1]!.row.id, 'b_ch_2_2'])
    expect(ch.beats![1]!.position).toBe('After “Stranded”')
  })

  it('places new beats by "after" (id, title or start), keeping list order for the same anchor', () => {
    const { patch } = parseReply(
      JSON.stringify({
        chapters: [
          {
            id: 'ch_2',
            beats: [
              { title: 'A', description: 'a', after: 'Stranded' },
              { title: 'B', description: 'b', after: 'Stranded', optional: true, why: 'Adds texture' },
              { title: 'Opening', description: 'o', after: 'start' },
              { title: 'Lost', description: 'l', after: 'Nonexistent' },
            ],
          },
        ],
      }),
    )
    const plan = planPatch(patch!, seedState(), { targetStoryId: 's_long_weekend' })
    const ch = plan.changes.find((c) => c.group === 'chapter')!
    const title = (id: string) => ch.beats!.find((b) => b.row.id === id)?.title ?? id
    expect(ch.beatOrder!.map(title)).toEqual(['Opening', 'Lost', 'b_ch_2_0', 'b_ch_2_1', 'A', 'B', 'b_ch_2_2'])
    const b = ch.beats!.find((x) => x.title === 'B')!
    expect(b).toMatchObject({ defaultOn: false, why: 'Adds texture' })
    expect(defaultSelection(plan).has(b.key)).toBe(false)
    expect(plan.warnings.some((w) => w.includes('Nonexistent'))).toBe(true)
  })

  it('inserts new chapters after a named chapter and renumbers', () => {
    const { patch } = parseReply(JSON.stringify({ chapters: [{ title: 'Interlude', purpose: 'Breathe', after: 'Arrival' }] }))
    const plan = planPatch(patch!, seedState(), { targetStoryId: 's_long_weekend' })
    expect(plan.chapterOrder).toEqual(['ch_1', plan.changes.find((c) => c.group === 'chapter')!.row.id, 'ch_2', 'ch_3'])
    expect(plan.changes.find((c) => c.group === 'chapter')!.title).toBe('2. Interlude')
  })

  it('matches by nickname without renaming', () => {
    const { patch } = parseReply(JSON.stringify({ characters: [{ name: 'June', voice: 'Louder now.' }] }))
    const plan = planPatch(patch!, seedState())
    expect(plan.changes[0]).toMatchObject({ op: 'update', title: 'Juniper Hale' })
    expect(plan.changes[0]!.fields.map((f) => f.label)).toEqual(['Voice'])
  })

  it('does not report an unchanged POV as cleared', () => {
    const { patch } = parseReply(JSON.stringify({ chapters: [{ id: 'ch_2', beats: [{ title: 'Extra', description: 'x' }] }] }))
    const plan = planPatch(patch!, seedState(), { targetStoryId: 's_long_weekend' })
    expect(plan.changes.find((c) => c.group === 'chapter')!.fields).toEqual([])
  })

  it('warns about unknown character names', () => {
    const { patch } = parseReply(JSON.stringify({ chapters: [{ id: 'ch_3', pov: 'Nobody' }] }))
    const plan = planPatch(patch!, seedState(), { targetStoryId: 's_long_weekend' })
    expect(plan.warnings[0]).toMatch(/Nobody/)
  })
})

describe('applyPlan', () => {
  it('writes selected changes and drops references to unticked new characters', async () => {
    const database = new TrellisDB(`test-${Math.random()}`)
    await importBackup(buildSeed(), database)
    const { patch } = parseReply(
      JSON.stringify({
        characters: [{ name: 'Rook', tagline: 'A stranger' }],
        chapters: [{ id: 'ch_3', characters: ['Mara', 'Rook'], beats: [{ title: 'Knock', description: 'Rook knocks.', characters: ['Rook', 'Mara'] }] }],
      }),
    )
    const plan = planPatch(patch!, await loadState(database), { targetStoryId: 's_long_weekend' })
    const rook = plan.changes.find((c) => c.group === 'character')!
    const selected = defaultSelection(plan)
    selected.delete(rook.key)
    await applyPlan(plan, selected, { snapshot: false, database })
    expect(await database.characters.where('name').equals('Rook').count()).toBe(0)
    const ch3 = await database.chapters.get('ch_3')
    expect(ch3?.characterIds).toEqual(['c_mara'])
    const beats = await database.beats.where('chapterId').equals('ch_3').sortBy('order')
    expect(beats.map((b) => b.title)).toEqual(['The workshop', 'Knock'])
    expect(beats[1]!.characterIds).toEqual(['c_mara'])
    const story = await database.stories.get('s_long_weekend')
    expect(story?.cast.some((m) => m.characterId === rook.row.id)).toBe(false)
  })
})

describe('buildAiRequest', () => {
  it('includes context JSON with ids and the reply format', () => {
    const { prompt, targetStoryId } = buildAiRequest({ kind: 'chapter', chapterId: 'ch_2', instruction: 'Add a beat where June calls.' }, seedState())
    expect(targetStoryId).toBe('s_long_weekend')
    expect(prompt).toContain('"id": "b_ch_2_1"')
    expect(prompt).toContain('Add a beat where June calls.')
    expect(prompt).toContain('## Reply format')
  })
})

describe('applyPlan — per-beat selection', () => {
  it('skips unticked new beats and keeps unticked deletions in place', async () => {
    const database = new TrellisDB(`test-${Math.random()}`)
    await importBackup(buildSeed(), database)
    const { patch } = parseReply(JSON.stringify({ chapters: [{ id: 'ch_2', beatsMode: 'replace', beats: [{ id: 'b_ch_2_0' }, { title: 'New', description: 'n' }, { id: 'b_ch_2_2' }] }] }))
    const plan = planPatch(patch!, await loadState(database), { targetStoryId: 's_long_weekend' })
    const ch = plan.changes.find((c) => c.group === 'chapter')!
    const selected = defaultSelection(plan)
    selected.delete(ch.beats!.find((b) => b.op === 'create')!.key) // don't add "New"
    selected.delete(ch.beats!.find((b) => b.op === 'delete')!.key) // keep "Stranded"
    await applyPlan(plan, selected, { snapshot: false, database })
    const beats = await database.beats.where('chapterId').equals('ch_2').sortBy('order')
    expect(beats.map((b) => b.title)).toEqual(['The causeway', 'Stranded', 'June\'s lights'])
  })
})
