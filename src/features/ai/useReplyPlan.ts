import { useEffect, useState } from 'react'
import { loadState } from '@/ai/apply'
import { parseReply } from '@/ai/patch'
import { defaultSelection, planPatch, type Plan } from '@/ai/plan'

/** Parse + plan a pasted reply whenever it (or the target story) changes. */
export function useReplyPlan(reply: string, targetStoryId: string | null) {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!reply.trim()) {
      setPlan(null)
      setError(null)
      return
    }
    let cancelled = false
    const result = parseReply(reply)
    if (!result.patch) {
      setPlan(null)
      setError(result.error ?? 'Couldn’t read that reply.')
      return
    }
    setError(null)
    setWarnings(result.warnings)
    void loadState().then((state) => {
      if (cancelled) return
      const p = planPatch(result.patch!, state, { targetStoryId })
      setPlan(p)
      setSelected(defaultSelection(p))
    })
    return () => {
      cancelled = true
    }
  }, [reply, targetStoryId])

  return { plan, error, warnings: [...warnings, ...(plan?.warnings ?? [])], selected, setSelected }
}
