/** Where the writer was last working, so the home screen can offer "Continue". */
export interface LastVisit {
  storyId: string
  chapterId: string | null
  tab: 'outline' | 'write' | 'read' | 'ideas' | 'story'
  at: number
}

const KEY = 'trellis.lastVisit'

export function saveLastVisit(v: Omit<LastVisit, 'at'>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...v, at: Date.now() }))
  } catch {
    /* ignore */
  }
}

export function loadLastVisit(): LastVisit | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as LastVisit) : null
  } catch {
    return null
  }
}

export function tabPath(storyId: string, tab: LastVisit['tab']) {
  return `/stories/${storyId}${tab === 'outline' ? '' : `/${tab}`}`
}
