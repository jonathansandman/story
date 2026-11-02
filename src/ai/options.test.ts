import { describe, expect, it } from 'vitest'
import { buildSeed } from '@/db/seed'
import { changeIdeasFor } from './changes'
import { mergeOptions, parseOptions } from './options'
import { parseReply } from './patch'
import { planPatch, type DataState } from './plan'
import { buildAiRequest, type Spark } from './requests'

const seed = buildSeed()
const state: DataState = { ...seed, beatsWithProse: new Set(['b_ch_1_0']) }
const spark: Spark = { text: 'Two rival chefs in Lisbon.', characterIds: ['c_june'], heat: '', length: 'short', density: 'lush' }

describe('parseOptions', () => {
  it('reads all option groups with loose shapes', () => {
    const reply = '```json\n' + JSON.stringify({
      directions: [{ title: 'Salt', pitch: 'Rivals.', logline: 'L', premise: 'P' }],
      themes: ['Pride: what it costs', { name: 'Hunger' }],
      styles: [{ name: 'Lush', guide: 'Sensory.', example: 'The pan hissed.' }],
      tropes: { 'Forced proximity': 'One kitchen', Rivals: 'Two egos' },
      characters: [{ name: 'Inês', essence: 'Guarded', role: 'Lead' }],
    }) + '\n```'
    const { options } = parseOptions(reply)
    expect(options!.directions[0]).toMatchObject({ title: 'Salt', description: 'Rivals.', logline: 'L' })
    expect(options!.themes.map((t) => t.title)).toEqual(['Pride', 'Hunger'])
    expect(options!.styles[0]).toMatchObject({ title: 'Lush', sample: 'The pan hissed.' })
    expect(options!.elements.map((e) => e.title)).toEqual(['Forced proximity', 'Rivals'])
    expect(options!.characters[0]).toMatchObject({ title: 'Inês', description: 'Guarded' })
  })
  it('merges without duplicate titles', () => {
    const a = parseOptions(JSON.stringify({ themes: ['Pride', 'Hunger'] })).options!
    const b = parseOptions(JSON.stringify({ themes: ['hunger', 'Grief'] })).options!
    expect(mergeOptions(a, b).themes.map((t) => t.title)).toEqual(['Pride', 'Hunger', 'Grief'])
  })
})

describe('AI requests', () => {
  it('spark asks for options and lists things to avoid', () => {
    const { prompt } = buildAiRequest({ kind: 'spark', spark, avoid: ['Salt'] }, state)
    expect(prompt).toContain('"directions"')
    expect(prompt).toContain('7–10 beats')
    expect(prompt).toContain('fresh alternatives instead: Salt')
    expect(prompt).toContain('Juniper Hale')
  })
  it('outline includes picks and asks for optional beats', () => {
    const { prompt } = buildAiRequest(
      {
        kind: 'outline',
        spark,
        picks: { direction: null, customDirection: 'Darker', themes: ['Pride'], style: null, customStyle: '', elements: ['A burnt hand'], characters: [], extra: '' },
      },
      state,
    )
    expect(prompt).toContain('Themes to explore: Pride.')
    expect(prompt).toContain('- A burnt hand')
    expect(prompt).toContain('"optional": true')
  })
  it('brainstorm and weave include the compact outline with ids and written flags', () => {
    const b = buildAiRequest({ kind: 'brainstorm', chapterId: 'ch_2', focus: 'tension' }, state).prompt
    expect(b).toContain('Brainstorm 8–12 candidate beats')
    const w = buildAiRequest({ kind: 'weave', storyId: 's_long_weekend', ideas: [{ id: 'i1', text: 'June calls Mara', kind: 'idea', createdAt: 0 }], extra: '' }, state).prompt
    expect(w).toContain('1. June calls Mara')
    expect(w).toContain('"written": true')
    expect(w).toContain('"id": "b_ch_2_1"')
  })
})

describe('changeIdeasFor', () => {
  it('turns story/character updates into a change idea for stories that have beats', () => {
    const { patch } = parseReply(JSON.stringify({ story: { premise: 'New premise.' }, characters: [{ id: 'c_theo', name: 'Theo Okafor', voice: 'Brisk.' }] }))
    const plan = planPatch(patch!, state, { targetStoryId: 's_long_weekend' })
    const sel = new Set(plan.changes.map((c) => c.key))
    const ideas = changeIdeasFor(plan, sel, seed.stories, new Set(['s_long_weekend']))
    expect(ideas).toHaveLength(1)
    expect(ideas[0]!.text).toContain('Premise:')
    expect(ideas[0]!.text).toContain('Theo Okafor — Voice:')
  })
})
