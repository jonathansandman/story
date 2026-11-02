/** Rough token estimate: ~4 characters per token for English prose. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function wordCount(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function relativeTime(ts: number, now = Date.now()): string {
  const s = Math.round((now - ts) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

/** Case/diacritic-insensitive "does haystack contain all words of needle". */
export function matches(haystack: string, needle: string): boolean {
  const norm = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  const h = norm(haystack)
  return norm(needle)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => h.includes(w))
}
