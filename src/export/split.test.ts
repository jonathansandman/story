import { describe, expect, it } from 'vitest'
import { splitChapterReply, stripMarkers } from './split'
import { buildSeed } from '@/db/seed'
import { DEFAULT_EXPORT_OPTIONS } from '@/db/factories'
import { makeBundle } from './bundle'
import { buildFollowUp, buildPrompt } from './build'
import { render } from './render'

describe('splitChapterReply', () => {
  it('splits on decorated markers and drops chatter', () => {
    const reply = `Here's the chapter!\n\n**[[Beat 1]]**\nThe tide.\n\nIt came in fast.\n\n### [[Beat 2: Stranded]]\nCold.\n\n[[Beat 3]]\nDawn.\n\n---\nWant me to continue?`
    const r = splitChapterReply(reply)
    expect(r.found).toBe(true)
    expect(r.parts).toEqual([
      { beat: 1, text: 'The tide.\n\nIt came in fast.' },
      { beat: 2, text: 'Cold.' },
      { beat: 3, text: 'Dawn.' },
    ])
    expect(r.preamble).toBe('')
  })
  it('reports when there are no markers', () => {
    expect(splitChapterReply('Just prose.').found).toBe(false)
  })
  it('strips markers from single-beat replies', () => {
    expect(stripMarkers('[[Beat 2]]\nHello.')).toBe('Hello.')
  })
})

describe('chapter prompt markers & follow-ups', () => {
  const seed = buildSeed()
  const bundle = makeBundle({ story: seed.stories[0]!, ...seed })
  it('asks for markers in chapter prompts', () => {
    const md = render(buildPrompt({ bundle, scope: { kind: 'chapter', chapterId: 'ch_2' }, options: DEFAULT_EXPORT_OPTIONS }).doc, 'markdown')
    expect(md).toContain('[[Beat 1]], [[Beat 2]], [[Beat 3]]')
  })
  it('follow-up prompt is short and introduces only new characters', () => {
    const r = buildFollowUp(bundle, 'b_ch_1_2', DEFAULT_EXPORT_OPTIONS)
    const md = render(r.doc, 'markdown')
    expect(md).toContain('Continue directly')
    expect(md).toContain('### Juniper Hale')
    expect(md).not.toContain('### Mara Ellison')
    expect(md).not.toContain('Style guide')
    const full = render(buildPrompt({ bundle, scope: { kind: 'beat', beatId: 'b_ch_1_2' }, options: DEFAULT_EXPORT_OPTIONS }).doc, 'markdown')
    expect(md.length).toBeLessThan(full.length / 2)
  })
  it('follow-up at a chapter start includes the chapter brief', () => {
    const md = render(buildFollowUp(bundle, 'b_ch_2_0', DEFAULT_EXPORT_OPTIONS).doc, 'markdown')
    expect(md).toContain('Now start Chapter 2: Low Tide')
  })
})
