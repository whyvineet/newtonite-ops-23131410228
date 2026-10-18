import type { Role, WorkItem } from '../types/api'

export function canCreateItem(role: Role | null): boolean {
  if (!role) return false
  return role === 'member' || role === 'lead' || role === 'admin'
}

export function canClaimItem(role: Role | null, item: WorkItem): boolean {
  if (!role) return false
  if (role === 'viewer') return false
  return item.status === 'open' && item.assignee_id === null
}

export function canAssignItem(role: Role | null, item: WorkItem): boolean {
  if (!role) return false
  if (role !== 'lead' && role !== 'admin') return false
  return item.status !== 'resolved' && item.status !== 'closed'
}

export function canEditBasic(
  role: Role | null,
  userId: string | null,
  item: WorkItem,
): boolean {
  if (!role || !userId) return false
  if (item.status === 'closed') return false
  if (role === 'lead' || role === 'admin') return true
  if (role === 'member') {
    return item.created_by_id === userId || item.assignee_id === userId
  }
  return false
}

export function canChangePriority(role: Role | null, item: WorkItem): boolean {
  if (!role) return false
  if (item.status === 'closed') return false
  return role === 'lead' || role === 'admin'
}

export function canStartWork(
  role: Role | null,
  userId: string | null,
  item: WorkItem,
): boolean {
  if (!role || !userId) return false
  if (item.status !== 'open') return false
  if (!item.assignee_id) return false
  if (role === 'lead' || role === 'admin') return true
  return role === 'member' && item.assignee_id === userId
}

export function canSubmitForApproval(
  role: Role | null,
  userId: string | null,
  item: WorkItem,
): boolean {
  if (!role || !userId) return false
  if (item.status !== 'in_progress') return false
  if (role === 'lead' || role === 'admin') return true
  return role === 'member' && item.assignee_id === userId
}

/**
 * Approval is LEAD-ONLY. Admins explicitly cannot approve.
 */
export function canApprove(role: Role | null, item: WorkItem): boolean {
  if (!role) return false
  if (item.status !== 'awaiting_approval') return false
  return role === 'lead'
}

export function canClose(role: Role | null, item: WorkItem): boolean {
  if (!role) return false
  if (item.status !== 'resolved') return false
  return role === 'lead' || role === 'admin'
}

export function canComment(role: Role | null): boolean {
  if (!role) return false
  return role !== 'viewer'
}
