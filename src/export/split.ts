/**
 * Split a whole-chapter reply back into beats using the [[Beat N]] markers the
 * chapter prompt asks for. Tolerates the ways models decorate markers:
 * **[[Beat 2]]**, ### [[Beat 2]], [[ Beat 2: The causeway ]], [Beat 2], "Beat 2:" headings.
 */

export interface SplitPart {
  /** 1-based beat number as written in the marker. */
  beat: number
  text: string
}

export interface SplitResult {
  parts: SplitPart[]
  /** Text before the first marker that looked like prose rather than chatter. */
  preamble: string
  found: boolean
}

const MARKER =
  /^[ \t>*_#-]*(?:\[\[\s*beat\s*(\d+)[^\]\n]*\]\]|\[\s*beat\s*(\d+)[^\]\n]*\]|beat\s+(\d+)\s*(?::[^\n]{0,80})?)[ \t*_]*$/gim

export function splitChapterReply(reply: string): SplitResult {
  const text = reply.replace(/\r\n/g, '\n')
  const hits = [...text.matchAll(MARKER)].map((m) => ({ beat: Number(m[1] ?? m[2] ?? m[3]), start: m.index!, end: m.index! + m[0].length }))
  if (!hits.length) return { parts: [], preamble: '', found: false }

  const parts: SplitPart[] = []
  hits.forEach((h, i) => {
    const body = cleanup(text.slice(h.end, hits[i + 1]?.start ?? text.length))
    if (!body) return
    const existing = parts.find((p) => p.beat === h.beat)
    if (existing) existing.text += `\n\n${body}`
    else parts.push({ beat: h.beat, text: body })
  })

  // Short text before the first marker is almost always chatter ("Here's chapter 2:").
  const pre = cleanup(text.slice(0, hits[0]!.start))
  const preamble = pre.split(/\s+/).length > 40 ? pre : ''
  return { parts, preamble, found: true }
}

/** Trim, drop code fences and trailing sign-offs separated by a rule. */
function cleanup(s: string): string {
  return s
    .replace(/^```[a-z]*\n?|```$/gm, '')
    .replace(/\n\s*(?:---|\*\*\*)\s*\n[\s\S]{0,300}$/, (m) => (/[?]|let me know|hope|want me to/i.test(m) ? '' : m))
    .trim()
}

/** Remove any stray markers from a single-beat reply (some models add them anyway). */
export function stripMarkers(text: string): string {
  return text.replace(MARKER, '').replace(/\n{3,}/g, '\n\n').trim()
}
