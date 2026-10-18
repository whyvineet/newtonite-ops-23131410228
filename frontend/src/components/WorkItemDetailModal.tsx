import { useEffect, useState } from 'react'
import {
  addComment,
  assignItem,
  claimItem,
  getItem,
  listActivity,
  listComments,
  transitionItem,
  updateItem,
} from '../api/workItems'
import { listTeamMembers } from '../api/teams'
import { useAuth } from '../context/useAuth'
import {
  ALL_PRIORITIES,
  ALL_TYPES,
  PRIORITY_LABELS,
  TYPE_LABELS,
  type ActivityEvent,
  type Comment,
  type ItemType,
  type Priority,
  type Status,
  type TeamMember,
  type WorkItem,
} from '../types/api'
import {
  canApprove,
  canAssignItem,
  canChangePriority,
  canClaimItem,
  canClose,
  canComment,
  canEditBasic,
  canStartWork,
  canSubmitForApproval,
} from '../utils/permissions'
import { PriorityBadge, RoleBadge, StatusBadge, TypeBadge } from './Badges'

interface WorkItemDetailModalProps {
  itemId: string
  onClose: () => void
  onItemUpdated: (updated: WorkItem) => void
}

const dateFormatter = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export default function WorkItemDetailModal({
  itemId,
  onClose,
  onItemUpdated,
}: WorkItemDetailModalProps) {
  const { user, roleInCurrentTeam } = useAuth()
  const [item, setItem] = useState<WorkItem | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [activities, setActivities] = useState<ActivityEvent[]>([])
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'activity'>('details')

  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Edit states
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editType, setEditType] = useState<ItemType>('task')
  const [editPriority, setEditPriority] = useState<Priority>('normal')
  const [editDueDate, setEditDueDate] = useState('')

  // Assign state
  const [selectedAssignee, setSelectedAssignee] = useState<string>('')

  // Comment state
  const [newComment, setNewComment] = useState('')

  useEffect(() => {
    let unmounted = false
    const controller = new AbortController()

    async function loadData() {
      setIsLoading(true)
      setError(null)
      try {
        const itemData = await getItem(itemId, controller.signal)
        if (unmounted) return

        setItem(itemData)
        setEditTitle(itemData.title)
        setEditDescription(itemData.description)
        setEditType(itemData.type)
        setEditPriority(itemData.priority)
        setEditDueDate(itemData.due_at ? itemData.due_at.substring(0, 10) : '')
        setSelectedAssignee(itemData.assignee_id || '')

        // Load members for assignment
        const teamMembers = await listTeamMembers(itemData.team_id)
        if (!unmounted) setMembers(teamMembers)

        // Load comments and activities in parallel
        const [commentsRes, activityRes] = await Promise.all([
          listComments(itemId, undefined, 50, controller.signal),
          listActivity(itemId, undefined, 50, controller.signal),
        ])
        if (!unmounted) {
          setComments(commentsRes.comments)
          setActivities(activityRes.events)
        }
      } catch (err: unknown) {
        if (!unmounted) {
          const msg = err instanceof Error ? err.message : 'Failed to load work item'
          setError(msg)
        }
      } finally {
        if (!unmounted) setIsLoading(false)
      }
    }

    void loadData()

    return () => {
      unmounted = true
      controller.abort()
    }
  }, [itemId])

  const refreshItemOnly = async () => {
    try {
      const refreshed = await getItem(itemId)
      setItem(refreshed)
      setEditTitle(refreshed.title)
      setEditDescription(refreshed.description)
      setEditType(refreshed.type)
      setEditPriority(refreshed.priority)
      setEditDueDate(refreshed.due_at ? refreshed.due_at.substring(0, 10) : '')
      setSelectedAssignee(refreshed.assignee_id || '')
      onItemUpdated(refreshed)

      const [commentsRes, activityRes] = await Promise.all([
        listComments(itemId, undefined, 50),
        listActivity(itemId, undefined, 50),
      ])
      setComments(commentsRes.comments)
      setActivities(activityRes.events)
    } catch {
      // ignore
    }
  }

  const handleClaim = async () => {
    if (!item) return
    setIsSubmitting(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const updated = await claimItem(item.id)
      setItem(updated)
      onItemUpdated(updated)
      setSuccessMessage('Work item claimed successfully (moved to In Progress).')
      await refreshItemOnly()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to claim work item')
      await refreshItemOnly()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAssign = async () => {
    if (!item || !selectedAssignee) return
    setIsSubmitting(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const updated = await assignItem(item.id, {
        assignee_id: selectedAssignee,
        expected_version: item.version,
      })
      setItem(updated)
      onItemUpdated(updated)
      setSuccessMessage('Assignee updated.')
      await refreshItemOnly()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign work item')
      await refreshItemOnly()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleTransition = async (toStatus: Status) => {
    if (!item) return
    setIsSubmitting(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const updated = await transitionItem(item.id, {
        to_status: toStatus,
        expected_version: item.version,
      })
      setItem(updated)
      onItemUpdated(updated)
      setSuccessMessage(`Moved to ${toStatus.replace('_', ' ')}.`)
      await refreshItemOnly()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Transition failed')
      await refreshItemOnly()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!item) return
    setIsSubmitting(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const updated = await updateItem(item.id, {
        expected_version: item.version,
        title: editTitle.trim(),
        description: editDescription.trim(),
        type: editType,
        priority: editPriority,
        due_at: editDueDate ? new Date(editDueDate).toISOString() : null,
      })
      setItem(updated)
      onItemUpdated(updated)
      setIsEditing(false)
      setSuccessMessage('Work item updated.')
      await refreshItemOnly()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Update failed')
      await refreshItemOnly()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!item || !newComment.trim()) return
    setIsSubmitting(true)
    setError(null)
    try {
      const added = await addComment(item.id, newComment.trim())
      setComments((prev) => [...prev, added])
      setNewComment('')
      const activityRes = await listActivity(item.id, undefined, 50)
      setActivities(activityRes.events)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to post comment')
    } finally {
      setIsSubmitting(false)
    }
  }

  const assigneeName =
    members.find((m) => m.user_id === item?.assignee_id)?.name ||
    (item?.assignee_id ? 'Assigned' : 'Unassigned')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 sm:p-6"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="min-w-0 pr-4">
            <h2 id="modal-title" className="text-lg font-semibold text-slate-900 truncate">
              {item ? item.title : 'Loading…'}
            </h2>
            <p className="text-xs text-slate-500 font-mono">ID: {itemId}</p>
          </div>
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

        {/* Alerts */}
        {error && (
          <div
            role="alert"
            className="mx-6 mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </div>
        )}
        {successMessage && (
          <div
            role="status"
            className="mx-6 mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            {successMessage}
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-slate-200 px-6">
          <nav className="flex gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`border-b-2 py-3 text-sm font-medium ${
                activeTab === 'details'
                  ? 'border-accent text-accent-strong'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Details & Actions
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('comments')}
              className={`border-b-2 py-3 text-sm font-medium ${
                activeTab === 'comments'
                  ? 'border-accent text-accent-strong'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Comments ({comments.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('activity')}
              className={`border-b-2 py-3 text-sm font-medium ${
                activeTab === 'activity'
                  ? 'border-accent text-accent-strong'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Audit Trail ({activities.length})
            </button>
          </nav>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-500">
              Loading work item details…
            </div>
          ) : !item ? (
            <div className="text-center py-8 text-slate-600">
              Could not load work item details.
            </div>
          ) : activeTab === 'details' ? (
            <div className="space-y-6">
              {/* Status and Actions Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">Status:</span>
                  <StatusBadge status={item.status} />
                  <PriorityBadge priority={item.priority} />
                  <TypeBadge type={item.type} />
                  <span className="text-xs text-slate-400">v{item.version}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Claim Button */}
                  {canClaimItem(roleInCurrentTeam, item) && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleClaim}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-accent-strong disabled:opacity-50"
                    >
                      Claim Item
                    </button>
                  )}

                  {/* Start Work */}
                  {canStartWork(roleInCurrentTeam, user?.id || null, item) && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleTransition('in_progress')}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-accent-strong disabled:opacity-50"
                    >
                      Start Work
                    </button>
                  )}

                  {/* Submit for Approval */}
                  {canSubmitForApproval(roleInCurrentTeam, user?.id || null, item) && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleTransition('awaiting_approval')}
                      className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-amber-700 disabled:opacity-50"
                    >
                      Submit for Approval
                    </button>
                  )}

                  {/* Approve (Lead only!) */}
                  {item.status === 'awaiting_approval' && (
                    canApprove(roleInCurrentTeam, item) ? (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleTransition('resolved')}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Approve (Resolve)
                      </button>
                    ) : (
                      <span className="text-xs text-amber-700 italic">
                        Approval requires Lead role
                      </span>
                    )
                  )}

                  {/* Close */}
                  {canClose(roleInCurrentTeam, item) && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleTransition('closed')}
                      className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50"
                    >
                      Close Item
                    </button>
                  )}
                </div>
              </div>

              {/* Main Fields / Edit Mode */}
              {isEditing ? (
                <form onSubmit={handleSaveEdit} className="space-y-4 rounded-lg border border-slate-200 p-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Title</label>
                    <input
                      type="text"
                      required
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Description</label>
                    <textarea
                      rows={3}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Type</label>
                      <select
                        value={editType}
                        onChange={(e) => setEditType(e.target.value as ItemType)}
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
                      <label className="block text-xs font-semibold text-slate-700">
                        Priority {canChangePriority(roleInCurrentTeam, item) ? '' : '(Lead/Admin only)'}
                      </label>
                      <select
                        disabled={!canChangePriority(roleInCurrentTeam, item)}
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value as Priority)}
                        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                      >
                        {ALL_PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {PRIORITY_LABELS[p]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Due Date</label>
                      <input
                        type="date"
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-accent-strong disabled:opacity-50"
                    >
                      {isSubmitting ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Description</h3>
                      <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                        {item.description || <span className="italic text-slate-400">No description provided.</span>}
                      </p>
                    </div>
                    {canEditBasic(roleInCurrentTeam, user?.id || null, item) && (
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                    )}
                  </div>

                  {/* Metadata grid */}
                  <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-100 bg-slate-50/50 p-3 sm:grid-cols-4">
                    <div>
                      <span className="block text-xs font-medium text-slate-500">Assignee</span>
                      <span className="block mt-0.5 text-xs font-semibold text-slate-800 truncate">
                        {assigneeName}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs font-medium text-slate-500">Due Date</span>
                      <span className="block mt-0.5 text-xs font-semibold text-slate-800">
                        {item.due_at ? item.due_at.substring(0, 10) : 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs font-medium text-slate-500">Created At</span>
                      <span className="block mt-0.5 text-xs text-slate-700">
                        {dateFormatter.format(new Date(item.created_at))}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs font-medium text-slate-500">Updated At</span>
                      <span className="block mt-0.5 text-xs text-slate-700">
                        {dateFormatter.format(new Date(item.updated_at))}
                      </span>
                    </div>
                  </div>

                  {/* Assignment Control (Lead/Admin) */}
                  {canAssignItem(roleInCurrentTeam, item) && (
                    <div className="rounded-lg border border-slate-200 p-4 space-y-2">
                      <label htmlFor="assignee-select" className="block text-xs font-semibold text-slate-700">
                        Reassign Item (Lead / Admin)
                      </label>
                      <div className="flex gap-2">
                        <select
                          id="assignee-select"
                          value={selectedAssignee}
                          onChange={(e) => setSelectedAssignee(e.target.value)}
                          className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                        >
                          <option value="">Select an active member</option>
                          {members
                            .filter((m) => m.is_active && m.role !== 'viewer')
                            .map((m) => (
                              <option key={m.user_id} value={m.user_id}>
                                {m.name} ({m.role})
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          disabled={isSubmitting || !selectedAssignee || selectedAssignee === item.assignee_id}
                          onClick={handleAssign}
                          className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
                        >
                          {isSubmitting ? 'Saving…' : 'Assign'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : activeTab === 'comments' ? (
            <div className="space-y-4">
              {/* Comment list */}
              {comments.length === 0 ? (
                <p className="text-center py-6 text-sm text-slate-500">
                  No comments yet on this work item.
                </p>
              ) : (
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div key={c.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="font-semibold text-slate-800">{c.author.name}</span>
                        <span>{dateFormatter.format(new Date(c.created_at))}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Add comment */}
              {canComment(roleInCurrentTeam) ? (
                <form onSubmit={handleAddComment} className="pt-2">
                  <label htmlFor="new-comment" className="block text-xs font-semibold text-slate-700">
                    Add a comment
                  </label>
                  <textarea
                    id="new-comment"
                    rows={2}
                    required
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Type your comment…"
                    className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-sm text-slate-900"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmitting || !newComment.trim()}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
                    >
                      {isSubmitting ? 'Posting…' : 'Post Comment'}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  Viewers have read-only access and cannot post comments.
                </p>
              )}
            </div>
          ) : (
            /* Audit Trail */
            <div className="space-y-3">
              {activities.length === 0 ? (
                <p className="text-center py-6 text-sm text-slate-500">
                  No activity events recorded.
                </p>
              ) : (
                activities.map((act) => (
                  <div key={act.id} className="flex gap-3 border-l-2 border-slate-200 pl-4 py-1">
                    <div className="flex-1">
                      <p className="text-xs text-slate-700">
                        <strong className="text-slate-900">{act.actor.name}</strong> performed{' '}
                        <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-800">
                          {act.event_type}
                        </code>
                      </p>
                      {act.old_value && act.new_value && (
                        <div className="mt-1 text-[11px] text-slate-500 font-mono">
                          {Object.keys(act.new_value).map((k) => (
                            <span key={k} className="block">
                              {k}: {JSON.stringify(act.old_value?.[k])} → {JSON.stringify(act.new_value?.[k])}
                            </span>
                          ))}
                        </div>
                      )}
                      <span className="block mt-0.5 text-[10px] text-slate-400">
                        {dateFormatter.format(new Date(act.created_at))}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between border-t border-slate-200 bg-slate-50 px-6 py-3">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span>Your role:</span>
            {roleInCurrentTeam ? <RoleBadge role={roleInCurrentTeam} /> : 'None'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
