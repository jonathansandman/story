import { describe, expect, it } from 'vitest'
import { buildSeed } from '@/db/seed'
import { DEFAULT_EXPORT_OPTIONS } from '@/db/factories'
import type { ExportOptions } from '@/db/types'
import { makeBundle } from './bundle'
import { buildPrompt, characterSheet, condense, tailWords } from './build'
import { render } from './render'

const seed = buildSeed()
const bundle = makeBundle({ story: seed.stories[0]!, ...seed })
const opts = (o: Partial<ExportOptions> = {}): ExportOptions => ({ ...DEFAULT_EXPORT_OPTIONS, ...o })

describe('buildPrompt — single beat', () => {
  const result = buildPrompt({ bundle, scope: { kind: 'beat', beatId: 'b_ch_1_2' }, options: opts() })
  const md = render(result.doc, 'markdown')

  it('includes only the characters on the page, POV first', () => {
    expect(result.characterIds).toEqual(['c_mara', 'c_june'])
    expect(md).not.toContain('### Theo Okafor')
  })

  it('includes the relationship between characters in scope only', () => {
    expect(md).toContain('Mara Ellison & Juniper Hale')
    expect(md).not.toContain('Mara Ellison & Theo Okafor')
  })

  it('uses recaps for earlier beats and marks the next beat as a stop point', () => {
    expect(md).toContain("She took her rings off at a petrol station")
    expect(md).toContain('Stop before (next beat — do not write)')
    expect(md).toContain('(Chapter 2: Low Tide)')
  })

  it('puts the beat last', () => {
    const keys = result.doc.sections.map((s) => s.key)
    expect(keys.slice(-2)).toEqual(['beat', 'stop_before'])
  })

  it('always includes boundaries, never writer notes by default', () => {
    expect(md).toContain('**Boundaries:**')
    expect(md).not.toContain('Writer notes')
  })
})

describe('buildPrompt — chapter', () => {
  it('unions characters across beats and summarises earlier chapters', () => {
    const r = buildPrompt({ bundle, scope: { kind: 'chapter', chapterId: 'ch_2' }, options: opts() })
    expect(r.characterIds[0]).toBe('c_theo') // chapter POV first
    const md = render(r.doc, 'markdown')
    expect(md).toContain('Chapter 1: Arrival — They arrive at the cottage')
    expect(md).toContain('Length: roughly 3,200 words.')
    expect(md).toContain('next chapter — do not write')
  })

  it('respects per-character overrides', () => {
    const r = buildPrompt({
      bundle,
      scope: { kind: 'chapter', chapterId: 'ch_2' },
      options: opts(),
      overrides: { c_june: 'exclude' },
    })
    expect(r.characterIds).not.toContain('c_june')
  })
})

describe('buildPrompt — selection', () => {
  it('exports selected beats across chapters in story order', () => {
    const r = buildPrompt({ bundle, scope: { kind: 'selection', beatIds: ['b_ch_2_0', 'b_ch_1_2'] }, options: opts() })
    expect(r.beats.map((b) => b.beat.id)).toEqual(['b_ch_1_2', 'b_ch_2_0'])
    expect(r.doc.sections.filter((s) => s.key === 'chapter')).toHaveLength(2)
  })
})

describe('characterSheet detail levels', () => {
  const mara = seed.characters[0]!
  const size = (l: 'brief' | 'standard' | 'full') =>
    render({ title: 'x', sections: [characterSheet(mara, l)] }, 'markdown').length
  it('grows with detail level', () => {
    expect(size('brief')).toBeLessThan(size('standard'))
    expect(size('standard')).toBeLessThan(size('full'))
  })
  it('brief keeps essential traits only', () => {
    const md = render({ title: 'x', sections: [characterSheet(mara, 'brief')] }, 'markdown')
    expect(md).toContain('Build:')
    expect(md).not.toContain('Ink-stained')
    expect(md).toContain('Boundaries')
  })
})

describe('renderers', () => {
  const r = buildPrompt({ bundle, scope: { kind: 'beat', beatId: 'b_ch_2_1' }, options: opts() })
  it('xml output is balanced', () => {
    const xml = render(r.doc, 'xml')
    const opens = xml.match(/<([a-z_]+)[ >]/g)?.length ?? 0
    const closes = xml.match(/<\/[a-z_]+>/g)?.length ?? 0
    expect(opens).toBe(closes)
    expect(xml).toContain('<character name="Theo Okafor">')
  })
  it('plain output has no markdown syntax', () => {
    const plain = render(r.doc, 'plain')
    expect(plain).not.toMatch(/^#/m)
    expect(plain).not.toContain('**')
  })
})

describe('condense', () => {
  it('cuts at a sentence boundary when possible', () => {
    const s = 'First sentence here is fine. ' + 'word '.repeat(80)
    expect(condense(s, 50)).toBe('First sentence here is fine.')
  })
})

describe('previous passage', () => {
  it('quotes the tail of the preceding beat’s prose and stops quoting at a boundary', () => {
    const r = buildPrompt({ bundle, scope: { kind: 'beat', beatId: 'b_ch_1_2' }, options: opts() })
    const md = render(r.doc, 'markdown')
    expect(md).toContain('Pick up from here')
    expect(md).toContain('It was after two before either of them slept.')
  })
  it('crosses chapter boundaries', () => {
    const r = buildPrompt({ bundle, scope: { kind: 'chapter', chapterId: 'ch_2' }, options: opts() })
    // Previous beat (ch1 beat 3) has no prose, so nothing is quoted.
    expect(render(r.doc, 'markdown')).not.toContain('Pick up from here')
  })
  it('tailWords trims long text to roughly n words', () => {
    const long = Array.from({ length: 50 }, (_, i) => `Sentence number ${i} is here.`).join(' ')
    const { text, truncated } = tailWords(long, 20)
    expect(truncated).toBe(true)
    expect(text.startsWith('Sentence')).toBe(true)
    expect(text.split(/\s+/).length).toBeLessThanOrEqual(20)
  })
})
