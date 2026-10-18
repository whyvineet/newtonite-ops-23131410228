import { useState } from 'react'
import { createItem } from '../api/workItems'
import {
  ALL_PRIORITIES,
  ALL_TYPES,
  PRIORITY_LABELS,
  TYPE_LABELS,
  type ItemType,
  type Priority,
  type TeamMember,
  type WorkItem,
} from '../types/api'

interface CreateWorkItemModalProps {
  teamId: string
  teamMembers: TeamMember[]
  onClose: () => void
  onItemCreated: (item: WorkItem) => void
}

export default function CreateWorkItemModal({
  teamId,
  teamMembers,
  onClose,
  onItemCreated,
}: CreateWorkItemModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<ItemType>('task')
  const [priority, setPriority] = useState<Priority>('normal')
  const [assigneeId, setAssigneeId] = useState<string>('')
  const [dueDate, setDueDate] = useState<string>('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const payload = {
        team_id: teamId,
        title: title.trim(),
        description: description.trim(),
        type,
        priority,
        assignee_id: assigneeId ? assigneeId : null,
        due_at: dueDate ? new Date(dueDate).toISOString() : null,
      }

      const newItem = await createItem(payload)
      onItemCreated(newItem)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create work item'
      setError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filter assignable members (active and not viewers)
  const assignableMembers = teamMembers.filter(
    (m) => m.is_active && m.role !== 'viewer',
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 sm:p-6"
    >
      <div className="relative w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h2 id="create-modal-title" className="text-base font-semibold text-slate-900">
            Create New Work Item
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close dialog"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="create-title" className="block text-xs font-semibold text-slate-700">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="create-title"
              type="text"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Summary of the work item"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="create-description" className="block text-xs font-semibold text-slate-700">
              Description
            </label>
            <textarea
              id="create-description"
              rows={3}
              maxLength={10000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description, reproduction steps, or context"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="create-type" className="block text-xs font-semibold text-slate-700">
                Type
              </label>
              <select
                id="create-type"
                value={type}
                onChange={(e) => setType(e.target.value as ItemType)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {ALL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="create-priority" className="block text-xs font-semibold text-slate-700">
                Priority
              </label>
              <select
                id="create-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {ALL_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="create-assignee" className="block text-xs font-semibold text-slate-700">
                Initial Assignee
              </label>
              <select
                id="create-assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {assignableMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name} ({m.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="create-due-date" className="block text-xs font-semibold text-slate-700">
                Due Date
              </label>
              <input
                id="create-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-accent px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-accent-strong disabled:opacity-50"
            >
              {isSubmitting ? 'Creating…' : 'Create Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
