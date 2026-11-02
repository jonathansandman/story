import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from './dnd-modifiers'
import { CSS } from '@dnd-kit/utilities'

/**
 * Thin wrapper around dnd-kit for vertical lists. Keyboard accessible:
 * focus a handle, press Space, move with arrows, Space to drop.
 */
export function SortableList({ ids, onReorder, children }: { ids: string[]; onReorder: (ids: string[]) => void; children: ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from >= 0 && to >= 0) onReorder(arrayMove(ids, from, to))
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

export interface HandleProps {
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners
}

export function SortableItem({ id, children }: { id: string; children: (handle: HandleProps, dragging: boolean) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  }
  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners }, isDragging)}
    </div>
  )
}

/**
 * Hold a local ordering between drop and the database round-trip so items
 * don't snap back for a frame. Resyncs whenever the persisted order changes.
 */
export function useOptimisticOrder<T extends { id: string }>(items: T[], persist: (ids: string[]) => Promise<void> | void) {
  const key = items.map((i) => i.id).join('|')
  const [local, setLocal] = useState<{ key: string; ids: string[] } | null>(null)
  const ids = local && local.key === key ? local.ids : items.map((i) => i.id)
  const byId = new Map(items.map((i) => [i.id, i]))
  const ordered = ids.map((id) => byId.get(id)).filter((x): x is T => !!x)
  const reorder = (next: string[]) => {
    setLocal({ key, ids: next })
    void persist(next)
  }
  return { ordered, ids, reorder }
}
