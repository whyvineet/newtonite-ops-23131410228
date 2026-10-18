import { useRef, useState } from 'react'
import { generateIdempotencyKey } from '../api/client'
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

  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => generateIdempotencyKey())
  const lastPayloadStringRef = useRef<string>('')

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

      const payloadString = JSON.stringify(payload)
      let keyToUse = idempotencyKey

      // If the user modified any form fields, generate a new key for the new payload
      if (lastPayloadStringRef.current && lastPayloadStringRef.current !== payloadString) {
        keyToUse = generateIdempotencyKey()
        setIdempotencyKey(keyToUse)
      }
      lastPayloadStringRef.current = payloadString

      const newItem = await createItem(payload, keyToUse)
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

  const inputClass =
    'mt-1 block w-full rounded border border-[#E2E1DC] bg-white px-2.5 py-1.5 text-xs text-[#242520] placeholder:text-[#9C9A93] hover:border-[#D5D4CE] focus:outline-none focus:ring-1 focus:ring-[#B85D3B] focus:border-[#B85D3B] transition-colors'

  const labelClass = 'block text-[11px] font-semibold uppercase tracking-wider text-[#63625D]'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 sm:p-6"
    >
      <div className="relative w-full max-w-lg rounded-lg border border-[#E2E1DC] bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#EAE9E4] pb-3">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#8E8D87]">
              Operations &middot; Entry
            </span>
            <h2 id="create-modal-title" className="text-sm font-semibold text-[#242520] mt-0.5">
              Create Work Item
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[#63625D] hover:bg-[#F7F7F5] hover:text-[#242520] transition-colors"
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
            className="mt-3 rounded border border-[#F1B8B3] bg-[#FDF0EE] p-2.5 text-xs text-[#A6261E]"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label htmlFor="create-title" className={labelClass}>
              Title <span className="text-[#B85D3B]">*</span>
            </label>
            <input
              id="create-title"
              type="text"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Operational incident or ticket title…"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="create-description" className={labelClass}>
              Description
            </label>
            <textarea
              id="create-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the context, severity, and reproduction steps…"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="create-type" className={labelClass}>
                Type
              </label>
              <select
                id="create-type"
                value={type}
                onChange={(e) => setType(e.target.value as ItemType)}
                className={inputClass}
              >
                {ALL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="create-priority" className={labelClass}>
                Priority
              </label>
              <select
                id="create-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className={inputClass}
              >
                {ALL_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="create-assignee" className={labelClass}>
                Assignee
              </label>
              <select
                id="create-assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className={inputClass}
              >
                <option value="">Unassigned (Open queue)</option>
                {assignableMembers.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.name} ({member.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="create-due" className={labelClass}>
                Due Date
              </label>
              <input
                id="create-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#EAE9E4]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded border border-[#E2E1DC] bg-white px-3 py-1.5 text-xs font-medium text-[#4A4944] hover:bg-[#F7F7F5] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded bg-[#B85D3B] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#9E4C2E] disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Creating…' : 'Create Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
