/** Short, sortable-enough, collision-resistant ids for local-first rows. */
export function newId(prefix = ''): string {
  const rand = crypto.getRandomValues(new Uint8Array(8))
  const body = Array.from(rand, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
  return `${prefix}${Date.now().toString(36)}${body}`
}
