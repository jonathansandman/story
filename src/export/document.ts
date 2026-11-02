/**
 * A format-agnostic prompt document.
 *
 * The builder produces this tree; renderers turn it into Markdown, XML-tagged
 * text, or plain text. Keeping structure separate from formatting means new
 * targets (JSON for an API call, a .docx brief, a different model's preferred
 * style) are a new renderer, not a rewrite.
 */

export type PromptNode =
  | { kind: 'text'; text: string }
  | { kind: 'fields'; items: PromptField[] }
  | { kind: 'list'; items: string[] }
  | PromptSection

export interface PromptField {
  label: string
  value: string
}

export interface PromptSection {
  kind: 'section'
  /** Stable key, used for XML tag names and UI toggles. */
  key: string
  title: string
  /** Optional XML attributes (e.g. character name). */
  attrs?: Record<string, string>
  children: PromptNode[]
}

export interface PromptDocument {
  title: string
  sections: PromptSection[]
}

/* ───── Small constructors that drop empty content automatically ───── */

export function text(t: string | undefined | null): PromptNode | null {
  const v = t?.trim()
  return v ? { kind: 'text', text: v } : null
}

export function fields(items: Array<[label: string, value: string | undefined | null | false]>): PromptNode | null {
  const kept = items
    .filter((i): i is [string, string] => typeof i[1] === 'string' && i[1].trim() !== '')
    .map(([label, value]) => ({ label, value: value.trim() }))
  return kept.length ? { kind: 'fields', items: kept } : null
}

export function list(items: Array<string | undefined | null>): PromptNode | null {
  const kept = items.map((i) => i?.trim()).filter((i): i is string => !!i)
  return kept.length ? { kind: 'list', items: kept } : null
}

export function section(
  key: string,
  title: string,
  children: Array<PromptNode | null | undefined | false>,
  attrs?: Record<string, string>,
): PromptSection | null {
  const kept = children.filter((c): c is PromptNode => !!c)
  return kept.length ? { kind: 'section', key, title, children: kept, ...(attrs ? { attrs } : {}) } : null
}

export function compact<T>(items: Array<T | null | undefined | false>): T[] {
  return items.filter((i): i is T => !!i)
}
