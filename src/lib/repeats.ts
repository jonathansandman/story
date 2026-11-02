/**
 * Find phrases a passage leans on too often — the most common quality
 * problem in AI prose. Purely local; used to flag drafts and to tell the
 * polishing prompt exactly what to vary.
 */

const STOP = new Set(
  'a an the and or but so of to in on at by for with from up down out over into onto off as is are was were be been being it its it’s his her hers him he she they them their you your i me my we our us this that these those then than there here just not no do does did have has had will would can could all one what who how when where why'.split(
    ' ',
  ),
)

export interface Repeat {
  phrase: string
  count: number
}

export function findRepeats(text: string, { min = 3, max = 8 }: { min?: number; max?: number } = {}): Repeat[] {
  const words = text
    .toLowerCase()
    .replace(/[’']/g, '’')
    .split(/[^a-z0-9’-]+/)
    .filter(Boolean)
  const positions = new Map<string, number[]>()
  for (const n of [4, 3, 2]) {
    for (let i = 0; i + n <= words.length; i++) {
      const gram = words.slice(i, i + n)
      // Skip grams that are mostly function words ("and then she", "of the").
      const content = gram.filter((w) => !STOP.has(w)).length
      if (content < Math.min(2, n - 1) || (STOP.has(gram[0]!) && STOP.has(gram[n - 1]!))) continue
      const key = gram.join(' ')
      positions.set(key, [...(positions.get(key) ?? []), i])
    }
  }

  // Grow each repeated gram to the longest span that repeats at every occurrence,
  // so one repeated sentence shows up once, not as several overlapping chunks.
  const grown = new Map<string, number>()
  for (const [key, pos] of positions) {
    if (pos.length < min) continue
    let start = 0
    let len = key.split(' ').length
    const same = (off: number) => pos.every((p) => words[p + off] !== undefined && words[p + off] === words[pos[0]! + off])
    while (len < 12 && same(start + len)) len++
    while (start > -6 && pos.every((p) => p + start - 1 >= 0) && same(start - 1)) start--
    const phrase = words.slice(pos[0]! + start, pos[0]! + start + len).join(' ')
    grown.set(phrase, Math.max(grown.get(phrase) ?? 0, pos.length))
  }

  const hits = [...grown].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
  // Drop phrases already covered by a longer one with a similar count.
  const out: Repeat[] = []
  for (const [phrase, count] of hits) {
    if (out.some((r) => r.phrase.includes(phrase) && r.count >= count - 1)) continue
    out.push({ phrase, count })
    if (out.length >= max) break
  }
  return out
}
