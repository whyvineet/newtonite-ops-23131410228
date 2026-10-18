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
import { ApiClientError } from '../api/client'
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

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export default function WorkItemDetailModal({
  itemId,
  onClose,
  onItemUpdated,
}: WorkItemDetailModalProps) {
  const { user, roleInCurrentTeam, currentTeam } = useAuth()
  const [item, setItem] = useState<WorkItem | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsNextCursor, setCommentsNextCursor] = useState<string | null>(null)
  const [activities, setActivities] = useState<ActivityEvent[]>([])
  const [activityNextCursor, setActivityNextCursor] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'activity'>('details')

  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMoreComments, setIsLoadingMoreComments] = useState(false)
  const [isLoadingMoreActivity, setIsLoadingMoreActivity] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null)
  const [isConflict, setIsConflict] = useState(false)
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
      setRefreshWarning(null)
      setIsConflict(false)
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

        // Load comments and activities bounded in parallel
        const [commentsRes, activityRes] = await Promise.all([
          listComments(itemId, undefined, 20, controller.signal),
          listActivity(itemId, undefined, 20, controller.signal),
        ])
        if (!unmounted) {
          setComments(commentsRes.comments)
          setCommentsNextCursor(commentsRes.next_cursor)
          setActivities(activityRes.events)
          setActivityNextCursor(activityRes.next_cursor)
        }
      } catch (err: unknown) {
        if (!unmounted) {
          if (
            (err instanceof DOMException && err.name === 'AbortError') ||
            (err instanceof Error && err.name === 'AbortError')
          ) {
            return
          }
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

  const refreshItemOnly = async (preserveUserEdits = false) => {
    setRefreshWarning(null)
    try {
      const refreshed = await getItem(itemId)
      setItem(refreshed)
      if (!preserveUserEdits && !isEditing) {
        setEditTitle(refreshed.title)
        setEditDescription(refreshed.description)
        setEditType(refreshed.type)
        setEditPriority(refreshed.priority)
        setEditDueDate(refreshed.due_at ? refreshed.due_at.substring(0, 10) : '')
      }
      setSelectedAssignee(refreshed.assignee_id || '')
      onItemUpdated(refreshed)
      setIsConflict(false)

      try {
        const [commentsRes, activityRes] = await Promise.all([
          listComments(itemId, undefined, 20),
          listActivity(itemId, undefined, 20),
        ])
        setComments(commentsRes.comments)
        setCommentsNextCursor(commentsRes.next_cursor)
        setActivities(activityRes.events)
        setActivityNextCursor(activityRes.next_cursor)
      } catch (feedErr: unknown) {
        const msg = feedErr instanceof Error ? feedErr.message : 'Failed to reload recent activity'
        setRefreshWarning(`Item state updated, but timeline refresh encountered an issue: ${msg}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh latest item state'
      setRefreshWarning(`Action completed, but failed to reload latest item details: ${msg}. Click retry to refresh.`)
    }
  }

  const handleLoadMoreActivity = async () => {
    if (!activityNextCursor || isLoadingMoreActivity) return
    setIsLoadingMoreActivity(true)
    try {
      const res = await listActivity(itemId, activityNextCursor, 20)
      setActivities((prev) => [...prev, ...res.events])
      setActivityNextCursor(res.next_cursor)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load older activity'
      setError(msg)
    } finally {
      setIsLoadingMoreActivity(false)
    }
  }

  const handleLoadMoreComments = async () => {
    if (!commentsNextCursor || isLoadingMoreComments) return
    setIsLoadingMoreComments(true)
    try {
      const res = await listComments(itemId, commentsNextCursor, 20)
      setComments((prev) => [...prev, ...res.comments])
      setCommentsNextCursor(res.next_cursor)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load older comments'
      setError(msg)
    } finally {
      setIsLoadingMoreComments(false)
    }
  }

  const handleError = (err: unknown, defaultMessage: string) => {
    if (
      err instanceof ApiClientError &&
      (err.status === 409 || err.code === 'version_conflict')
    ) {
      setIsConflict(true)
      setError('This item has changed on the server. Your changes conflict with the newest server state.')
    } else {
      setIsConflict(false)
      setError(err instanceof Error ? err.message : defaultMessage)
    }
  }

  const handleClaim = async () => {
    if (!item) return
    setIsSubmitting(true)
    setError(null)
    setSuccessMessage(null)
    setRefreshWarning(null)
    setIsConflict(false)
    try {
      const updated = await claimItem(item.id)
      setItem(updated)
      onItemUpdated(updated)
      setSuccessMessage('Work item claimed successfully (status updated to In progress).')
      await refreshItemOnly()
    } catch (err: unknown) {
      handleError(err, 'Failed to claim work item')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAssign = async () => {
    if (!item || !selectedAssignee) return
    setIsSubmitting(true)
    setError(null)
    setSuccessMessage(null)
    setRefreshWarning(null)
    setIsConflict(false)
    try {
      const updated = await assignItem(item.id, {
        assignee_id: selectedAssignee,
        expected_version: item.version,
      })
      setItem(updated)
      onItemUpdated(updated)
      const newAssigneeName = members.find((m) => m.user_id === selectedAssignee)?.name || 'member'
      setSuccessMessage(`Assigned to ${newAssigneeName}.`)
      await refreshItemOnly()
    } catch (err: unknown) {
      handleError(err, 'Failed to assign work item')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleTransition = async (toStatus: Status) => {
    if (!item) return
    setIsSubmitting(true)
    setError(null)
    setSuccessMessage(null)
    setRefreshWarning(null)
    setIsConflict(false)
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
      handleError(err, 'Status transition failed')
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
    setRefreshWarning(null)
    setIsConflict(false)
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
      setSuccessMessage('Work item details updated successfully.')
      await refreshItemOnly()
    } catch (err: unknown) {
      handleError(err, 'Update failed')
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
      const activityRes = await listActivity(item.id, undefined, 20)
      setActivities(activityRes.events)
      setActivityNextCursor(activityRes.next_cursor)
      setSuccessMessage('Comment added.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to post comment')
    } finally {
      setIsSubmitting(false)
    }
  }

  const assignee = members.find((m) => m.user_id === item?.assignee_id)
  const assigneeName = assignee?.name || (item?.assignee_id ? 'Assigned' : 'Unassigned')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 sm:p-6"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg border border-[#E2E1DC] bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#EAE9E4] px-5 py-3.5">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-[#8E8D87]">
                #{itemId.slice(0, 8)} &middot; v{item?.version || 1}
              </span>
              {item && <StatusBadge status={item.status} />}
              {item && <PriorityBadge priority={item.priority} />}
            </div>
            <h2 id="modal-title" className="text-base font-semibold text-[#242520] truncate mt-1">
              {item ? item.title : 'Loading details…'}
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

        {/* Alerts: Concurrency conflict banner */}
        {isConflict && (
          <div
            role="alert"
            className="mx-5 mt-3 rounded border border-[#E8C8BC] bg-[#FDF0EE] p-3 text-xs text-[#A6261E]"
          >
            <div>
              <p className="font-semibold">Version Conflict (409 Conflict)</p>
              <p className="mt-0.5 leading-relaxed">
                This work item was modified by another operator (currently v{item?.version || '?'}). Your submitted action targeted a stale version.
              </p>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void refreshItemOnly(false)}
                className="rounded bg-[#B85D3B] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#9E4C2E] transition-colors"
              >
                Reload latest server version
              </button>
              {isEditing && (
                <button
                  type="button"
                  onClick={async () => {
                    await refreshItemOnly(true)
                    setError(null)
                  }}
                  className="rounded border border-[#B85D3B] bg-white px-2.5 py-1 text-xs font-medium text-[#B85D3B] hover:bg-[#FDF0EE] transition-colors"
                >
                  Preserve my edits & update version target
                </button>
              )}
            </div>
          </div>
        )}

        {/* Refresh warning (action committed, refresh warning) */}
        {refreshWarning && (
          <div
            role="status"
            className="mx-5 mt-3 flex items-center justify-between rounded border border-[#E6D4A5] bg-[#FDF8EB] p-2.5 text-xs text-[#855D10]"
          >
            <span>{refreshWarning}</span>
            <button
              type="button"
              onClick={() => void refreshItemOnly()}
              className="ml-3 font-semibold underline hover:text-[#5E4007] transition-colors shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Regular error */}
        {error && !isConflict && (
          <div
            role="alert"
            className="mx-5 mt-3 rounded border border-[#F1B8B3] bg-[#FDF0EE] p-2.5 text-xs text-[#A6261E]"
          >
            {error}
          </div>
        )}

        {/* Success message */}
        {successMessage && (
          <div
            role="status"
            className="mx-5 mt-3 rounded border border-[#C5DDC9] bg-[#F2F8F3] p-2.5 text-xs text-[#285E34]"
          >
            {successMessage}
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="border-b border-[#EAE9E4] px-5">
          <nav className="flex gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`border-b-2 py-2.5 text-xs font-medium transition-colors ${
                activeTab === 'details'
                  ? 'border-[#B85D3B] text-[#9E4C2E] font-semibold'
                  : 'border-transparent text-[#63625D] hover:text-[#242520]'
              }`}
            >
              Details & Actions
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('comments')}
              className={`border-b-2 py-2.5 text-xs font-medium transition-colors ${
                activeTab === 'comments'
                  ? 'border-[#B85D3B] text-[#9E4C2E] font-semibold'
                  : 'border-transparent text-[#63625D] hover:text-[#242520]'
              }`}
            >
              Comments ({comments.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('activity')}
              className={`border-b-2 py-2.5 text-xs font-medium transition-colors ${
                activeTab === 'activity'
                  ? 'border-[#B85D3B] text-[#9E4C2E] font-semibold'
                  : 'border-transparent text-[#63625D] hover:text-[#242520]'
              }`}
            >
              Audit Trail ({activities.length})
            </button>
          </nav>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="space-y-3 py-6">
              <div className="h-6 w-1/3 bg-[#F7F7F5] rounded animate-pulse" />
              <div className="h-16 w-full bg-[#FAFAF9] rounded animate-pulse" />
              <div className="h-24 w-full bg-[#F7F7F5] rounded animate-pulse" />
            </div>
          ) : !item ? (
            <div className="text-center py-8 text-xs text-[#63625D]">
              Could not load work item details.
            </div>
          ) : activeTab === 'details' ? (
            <div className="space-y-5">
              {/* Approval status callout */}
              {item.status === 'awaiting_approval' && (
                <div className="rounded border border-[#E6D4A5] bg-[#FDF8EB] p-3 text-xs text-[#855D10]">
                  <p className="font-semibold">Review & Sign-Off Required</p>
                  <p className="mt-0.5">
                    {roleInCurrentTeam === 'lead'
                      ? `As a Team Lead in ${currentTeam?.name}, you have exclusive authority to approve and resolve this work item.`
                      : `This item is waiting for sign-off from a Team Lead before it can be resolved.`}
                  </p>
                </div>
              )}

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-[#E2E1DC] bg-[#FAF9F7] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-[#63625D]">Current State:</span>
                  <StatusBadge status={item.status} />
                  <PriorityBadge priority={item.priority} />
                  <TypeBadge type={item.type} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Claim Button */}
                  {canClaimItem(roleInCurrentTeam, item) && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleClaim}
                      className="rounded bg-[#B85D3B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#9E4C2E] disabled:opacity-50 transition-colors"
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
                      className="rounded bg-[#B85D3B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#9E4C2E] disabled:opacity-50 transition-colors"
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
                      className="rounded border border-[#E6D4A5] bg-[#FDF8EB] px-3 py-1.5 text-xs font-medium text-[#855D10] hover:bg-[#F9F0DA] disabled:opacity-50 transition-colors"
                    >
                      Submit for Approval
                    </button>
                  )}

                  {/* Approve (Lead only!) */}
                  {item.status === 'awaiting_approval' && canApprove(roleInCurrentTeam, item) && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleTransition('resolved')}
                      className="rounded border border-[#C5DDC9] bg-[#F2F8F3] px-3 py-1.5 text-xs font-semibold text-[#285E34] hover:bg-[#E5F2E7] disabled:opacity-50 transition-colors"
                    >
                      Approve & Resolve
                    </button>
                  )}

                  {/* Close */}
                  {canClose(roleInCurrentTeam, item) && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleTransition('closed')}
                      className="rounded border border-[#E2E1DC] bg-white px-3 py-1.5 text-xs font-medium text-[#4A4944] hover:bg-[#F7F7F5] disabled:opacity-50 transition-colors"
                    >
                      Close Item
                    </button>
                  )}
                </div>
              </div>

              {/* Main Fields / Edit Mode */}
              {isEditing ? (
                <form onSubmit={handleSaveEdit} className="space-y-4 rounded border border-[#E2E1DC] p-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#242520]">Title</label>
                    <input
                      type="text"
                      required
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="mt-1 block w-full rounded border border-[#E2E1DC] px-3 py-1.5 text-xs text-[#242520] focus:outline-none focus:ring-1 focus:ring-[#B85D3B]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#242520]">Description</label>
                    <textarea
                      rows={3}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="mt-1 block w-full rounded border border-[#E2E1DC] px-3 py-1.5 text-xs text-[#242520] focus:outline-none focus:ring-1 focus:ring-[#B85D3B]"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#63625D] uppercase">Type</label>
                      <select
                        value={editType}
                        onChange={(e) => setEditType(e.target.value as ItemType)}
                        className="mt-1 block w-full rounded border border-[#E2E1DC] px-2.5 py-1.5 text-xs text-[#242520]"
                      >
                        {ALL_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[#63625D] uppercase">
                        Priority {canChangePriority(roleInCurrentTeam, item) ? '' : '(Lead/Admin only)'}
                      </label>
                      <select
                        disabled={!canChangePriority(roleInCurrentTeam, item)}
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value as Priority)}
                        className="mt-1 block w-full rounded border border-[#E2E1DC] px-2.5 py-1.5 text-xs text-[#242520] disabled:bg-[#F7F7F5]"
                      >
                        {ALL_PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {PRIORITY_LABELS[p]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[#63625D] uppercase">Due Date</label>
                      <input
                        type="date"
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(e.target.value)}
                        className="mt-1 block w-full rounded border border-[#E2E1DC] px-2.5 py-1.5 text-xs text-[#242520]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-[#EAE9E4]">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="rounded border border-[#E2E1DC] bg-white px-3 py-1.5 text-xs font-medium text-[#4A4944] hover:bg-[#F7F7F5]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="rounded bg-[#B85D3B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#9E4C2E] disabled:opacity-50"
                    >
                      {isSubmitting ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-[#8E8D87] uppercase tracking-wider">
                        Description
                      </h3>
                      <p className="mt-1 text-xs text-[#242520] whitespace-pre-wrap leading-relaxed">
                        {item.description || (
                          <span className="italic text-[#9C9A93]">No description provided.</span>
                        )}
                      </p>
                    </div>
                    {canEditBasic(roleInCurrentTeam, user?.id || null, item) && (
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="rounded border border-[#E2E1DC] px-2 py-1 text-xs font-medium text-[#4A4944] hover:bg-[#F7F7F5] transition-colors"
                      >
                        Edit
                      </button>
                    )}
                  </div>

                  {/* Metadata grid */}
                  <div className="grid grid-cols-2 gap-3 rounded border border-[#EAE9E4] bg-[#FAF9F7] p-3 sm:grid-cols-4">
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#8E8D87]">
                        Assignee
                      </span>
                      <span className="block mt-0.5 text-xs font-semibold text-[#242520] truncate">
                        {assigneeName}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#8E8D87]">
                        Due Date
                      </span>
                      <span className="block mt-0.5 text-xs text-[#4A4944]">
                        {item.due_at ? item.due_at.substring(0, 10) : 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#8E8D87]">
                        Created
                      </span>
                      <span className="block mt-0.5 text-xs text-[#4A4944]">
                        {dateFormatter.format(new Date(item.created_at))}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#8E8D87]">
                        Last Update
                      </span>
                      <span className="block mt-0.5 text-xs text-[#4A4944]">
                        {dateFormatter.format(new Date(item.updated_at))}
                      </span>
                    </div>
                  </div>

                  {/* Assignment Control (Lead/Admin) */}
                  {canAssignItem(roleInCurrentTeam, item) && (
                    <div className="rounded border border-[#E2E1DC] p-3 space-y-2">
                      <label
                        htmlFor="assignee-select"
                        className="block text-[11px] font-semibold uppercase tracking-wider text-[#63625D]"
                      >
                        Assign Member (Lead / Admin Authority)
                      </label>
                      <div className="flex gap-2">
                        <select
                          id="assignee-select"
                          value={selectedAssignee}
                          onChange={(e) => setSelectedAssignee(e.target.value)}
                          className="flex-1 rounded border border-[#E2E1DC] bg-white px-2.5 py-1.5 text-xs text-[#242520]"
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
                          disabled={
                            isSubmitting || !selectedAssignee || selectedAssignee === item.assignee_id
                          }
                          onClick={handleAssign}
                          className="rounded bg-[#242520] px-3 py-1.5 text-xs font-medium text-white hover:bg-black disabled:opacity-40 transition-colors"
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
                <p className="text-center py-6 text-xs text-[#8E8D87]">
                  No comments yet on this work item.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {comments.map((c) => (
                    <div
                      key={c.id}
                      className="rounded border border-[#EAE9E4] bg-[#FAF9F7] p-3 text-xs"
                    >
                      <div className="flex items-center justify-between text-[#8E8D87] mb-1">
                        <span className="font-semibold text-[#242520]">{c.author.name}</span>
                        <span>{dateFormatter.format(new Date(c.created_at))}</span>
                      </div>
                      <p className="text-[#4A4944] whitespace-pre-wrap leading-relaxed">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}

              {commentsNextCursor && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    disabled={isLoadingMoreComments}
                    onClick={handleLoadMoreComments}
                    className="rounded border border-[#E2E1DC] bg-white px-3 py-1.5 text-xs font-medium text-[#4A4944] hover:bg-[#F7F7F5] disabled:opacity-50 transition-colors"
                  >
                    {isLoadingMoreComments ? 'Loading older comments…' : 'Load Older Comments'}
                  </button>
                </div>
              )}

              {/* Add comment */}
              {canComment(roleInCurrentTeam) ? (
                <form onSubmit={handleAddComment} className="pt-2 border-t border-[#EAE9E4]">
                  <label htmlFor="new-comment" className="block text-xs font-semibold text-[#242520]">
                    Add a comment
                  </label>
                  <textarea
                    id="new-comment"
                    rows={2}
                    required
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Type an operational update…"
                    className="mt-1 block w-full rounded border border-[#E2E1DC] p-2 text-xs text-[#242520] placeholder:text-[#9C9A93] focus:outline-none focus:ring-1 focus:ring-[#B85D3B]"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmitting || !newComment.trim()}
                      className="rounded bg-[#B85D3B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#9E4C2E] disabled:opacity-50 transition-colors"
                    >
                      {isSubmitting ? 'Posting…' : 'Post Comment'}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-xs text-[#8E8D87] italic">
                  Viewers have read-only access and cannot post comments.
                </p>
              )}
            </div>
          ) : (
            /* Audit Trail */
            <div className="space-y-3">
              {activities.length === 0 ? (
                <p className="text-center py-6 text-xs text-[#8E8D87]">
                  No activity events recorded.
                </p>
              ) : (
                activities.map((act) => (
                  <div key={act.id} className="flex gap-3 border-l-2 border-[#E2E1DC] pl-3 py-1">
                    <div className="flex-1">
                      <p className="text-xs text-[#4A4944]">
                        <strong className="text-[#242520]">{act.actor.name}</strong> performed{' '}
                        <code className="rounded bg-[#F7F7F5] border border-[#E2E1DC] px-1 py-0.5 font-mono text-[10px] text-[#242520]">
                          {act.event_type}
                        </code>
                      </p>
                      {act.old_value && act.new_value && (
                        <div className="mt-1 text-[11px] text-[#63625D] font-mono bg-[#FAF9F7] p-1.5 rounded border border-[#EAE9E4]">
                          {Object.keys(act.new_value).map((k) => (
                            <span key={k} className="block">
                              {k}: {JSON.stringify(act.old_value?.[k])} → {JSON.stringify(act.new_value?.[k])}
                            </span>
                          ))}
                        </div>
                      )}
                      <span className="block mt-1 text-[10px] text-[#8E8D87]">
                        {dateFormatter.format(new Date(act.created_at))}
                      </span>
                    </div>
                  </div>
                ))
              )}

              {activityNextCursor && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    disabled={isLoadingMoreActivity}
                    onClick={handleLoadMoreActivity}
                    className="rounded border border-[#E2E1DC] bg-white px-3 py-1.5 text-xs font-medium text-[#4A4944] hover:bg-[#F7F7F5] disabled:opacity-50 transition-colors"
                  >
                    {isLoadingMoreActivity ? 'Loading older events…' : 'Load Older Events'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center border-t border-[#EAE9E4] bg-[#FAF9F7] px-5 py-2.5">
          <div className="text-xs text-[#63625D] flex items-center gap-1.5">
            <span>Your role:</span>
            {roleInCurrentTeam ? <RoleBadge role={roleInCurrentTeam} /> : 'None'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[#E2E1DC] bg-white px-3 py-1 text-xs font-medium text-[#4A4944] hover:bg-[#F7F7F5] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
