import type { PromptFormat } from '@/db/types'
import type { PromptDocument, PromptNode, PromptSection } from './document'

/**
 * Renderers. Each takes the same PromptDocument and produces a string.
 * Output rules shared by all: no trailing whitespace, single blank line
 * between blocks, final newline.
 */

export function render(doc: PromptDocument, format: PromptFormat): string {
  const out = format === 'xml' ? renderXml(doc) : format === 'plain' ? renderPlain(doc) : renderMarkdown(doc)
  return tidy(out)
}

function tidy(s: string): string {
  return (
    s
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  )
}

const isMultiline = (v: string) => v.includes('\n') || v.length > 90

/* ───────────── Markdown ───────────── */

// An empty document title renders sections one level up (used for standalone character sheets).
function renderMarkdown(doc: PromptDocument): string {
  const parts = doc.title ? [`# ${doc.title}`] : []
  for (const s of doc.sections) parts.push(mdSection(s, doc.title ? 2 : 1))
  return parts.join('\n\n')
}

function mdSection(s: PromptSection, depth: number): string {
  const h = '#'.repeat(Math.min(depth, 6))
  return [`${h} ${s.title}`, ...s.children.map((c) => mdNode(c, depth + 1))].join('\n\n')
}

function mdNode(n: PromptNode, depth: number): string {
  switch (n.kind) {
    case 'text':
      return n.text
    case 'list':
      return n.items.map((i) => `- ${i.replace(/\n/g, '\n  ')}`).join('\n')
    case 'fields':
      return n.items
        .map((f) => (isMultiline(f.value) ? `**${f.label}:**\n${f.value}` : `**${f.label}:** ${f.value}`))
        .join('\n\n')
    case 'section':
      return mdSection(n, depth)
  }
}

/* ───────────── XML-tagged ───────────── */
// Many models (Claude especially, but Grok and GPT too) parse tagged context
// very reliably. Tag names come from section keys / field labels.

function tagName(label: string): string {
  const t = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return /^[a-z]/.test(t) ? t : `x_${t}`
}

const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

function renderXml(doc: PromptDocument): string {
  return doc.sections.map((s) => xmlSection(s, 0)).join('\n\n')
}

function xmlSection(s: PromptSection, indent: number): string {
  const pad = '  '.repeat(indent)
  const attrs = Object.entries(s.attrs ?? {})
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('')
  const tag = tagName(s.key)
  const inner = s.children.map((c) => xmlNode(c, indent + 1)).join('\n')
  return `${pad}<${tag}${attrs}>\n${inner}\n${pad}</${tag}>`
}

function xmlNode(n: PromptNode, indent: number): string {
  const pad = '  '.repeat(indent)
  const block = (v: string) => v.split('\n').map((l) => pad + l).join('\n')
  switch (n.kind) {
    case 'text':
      return block(n.text)
    case 'list':
      return n.items.map((i) => block(`- ${i}`)).join('\n')
    case 'fields':
      return n.items
        .map((f) => {
          const t = tagName(f.label)
          return isMultiline(f.value)
            ? `${pad}<${t}>\n${f.value.split('\n').map((l) => pad + '  ' + l).join('\n')}\n${pad}</${t}>`
            : `${pad}<${t}>${f.value}</${t}>`
        })
        .join('\n')
    case 'section':
      return xmlSection(n, indent)
  }
}

/* ───────────── Plain text ───────────── */
// For chat boxes that mangle Markdown. Uses rules and caps for hierarchy.

function renderPlain(doc: PromptDocument): string {
  const parts = doc.title ? [doc.title.toUpperCase(), '='.repeat(Math.min(doc.title.length, 72))] : []
  for (const s of doc.sections) parts.push(plainSection(s, 0))
  return parts.join('\n\n')
}

function plainSection(s: PromptSection, depth: number): string {
  const head = depth === 0 ? `== ${s.title.toUpperCase()} ==` : `-- ${s.title} --`
  return [head, ...s.children.map((c) => plainNode(c, depth + 1))].join('\n\n')
}

function plainNode(n: PromptNode, depth: number): string {
  switch (n.kind) {
    case 'text':
      return n.text
    case 'list':
      return n.items.map((i) => `* ${i}`).join('\n')
    case 'fields':
      return n.items.map((f) => (isMultiline(f.value) ? `${f.label}:\n${f.value}` : `${f.label}: ${f.value}`)).join('\n\n')
    case 'section':
      return plainSection(n, depth)
  }
}
