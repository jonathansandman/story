import { describe, expect, it } from 'vitest'
import { buildSeed } from '@/db/seed'
import { DEFAULT_EXPORT_OPTIONS } from '@/db/factories'
import { findRepeats } from '@/lib/repeats'
import { makeBundle } from './bundle'
import { buildFollowUp, buildPrompt } from './build'
import { buildPolishPrompt } from './polish'
import { render } from './render'

const seed = buildSeed()
const bundle = makeBundle({ story: seed.stories[0]!, ...seed })

describe('findRepeats', () => {
  it('finds content phrases used too often and ignores function-word filler', () => {
    const text = 'Her hands were cold. The cold sea light. Her hands were cold again. And then she ran. Her hands were cold. And then she ran.'
    const r = findRepeats(text)
    expect(r[0]).toEqual({ phrase: 'her hands were cold', count: 3 })
    expect(r.some((x) => x.phrase.includes('and then'))).toBe(false)
  })
  it('merges overlapping chunks of one repeated sentence', () => {
    const r = findRepeats('The rain was loud on the roof. She lay still. The rain was loud on the roof. He lay still. The rain was loud on the roof again.')
    expect(r[0]).toEqual({ phrase: 'the rain was loud on the roof', count: 3 })
    expect(r).toHaveLength(1)
  })
  it('returns nothing for clean prose', () => {
    expect(findRepeats('A quiet line. Another, different line. Something else entirely.')).toEqual([])
  })
})

describe('craft rules in writing prompts', () => {
  it('are included by default, right after the task', () => {
    const r = buildPrompt({ bundle, scope: { kind: 'beat', beatId: 'b_ch_1_2' }, options: DEFAULT_EXPORT_OPTIONS })
    expect(r.doc.sections.map((s) => s.key).slice(0, 2)).toEqual(['task', 'craft'])
    expect(render(r.doc, 'markdown')).toContain('never name a trait, rule or intention')
  })
  it('can be switched off', () => {
    const r = buildPrompt({ bundle, scope: { kind: 'beat', beatId: 'b_ch_1_2' }, options: { ...DEFAULT_EXPORT_OPTIONS, includeCraft: false } })
    expect(r.doc.sections.some((s) => s.key === 'craft')).toBe(false)
  })
  it('follow-ups carry a short reminder', () => {
    const md = render(buildFollowUp(bundle, 'b_ch_1_2', DEFAULT_EXPORT_OPTIONS).doc, 'markdown')
    expect(md).toContain('Same craft rules as before')
  })
})

describe('polish prompt', () => {
  it('includes the draft, the plan, the style, and keeps markers for several beats', () => {
    const p = buildPolishPrompt(bundle, ['b_ch_1_0', 'b_ch_1_1'], 'More interiority.')
    expect(p).toContain('[[Beat 1]]')
    expect(p).toContain('[[Beat 2]]')
    expect(p).toContain('The radio did most of the talking')
    expect(p).toContain('My notes on this draft: More interiority.')
    expect(p).toContain('Style guide')
    expect(p).toContain('Keep each [[Beat N]] marker')
  })
  it('single beat asks for prose only and returns empty when nothing is written', () => {
    expect(buildPolishPrompt(bundle, ['b_ch_1_0'])).toContain('Output only the revised prose')
    expect(buildPolishPrompt(bundle, ['b_ch_2_0'])).toBe('')
  })
})
