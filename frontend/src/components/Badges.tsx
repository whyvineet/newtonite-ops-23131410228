import {
  PRIORITY_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  type ItemType,
  type Priority,
  type Role,
  type Status,
} from '../types/api'

const base =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide transition-colors'

const statusStyles: Record<Status, string> = {
  open: 'border-[#D5D4CE] bg-[#F7F7F5] text-[#4A4944]',
  in_progress: 'border-[#E8C8BC] bg-[#FBF0EA] text-[#9E4C2E] font-medium',
  awaiting_approval: 'border-[#E6D4A5] bg-[#FDF8EB] text-[#855D10] font-medium',
  resolved: 'border-[#C5DDC9] bg-[#F2F8F3] text-[#285E34]',
  closed: 'border-[#DDDCD7] bg-[#EBEAE5] text-[#696863]',
}

const statusDots: Record<Status, string> = {
  open: 'bg-[#9C9A93]',
  in_progress: 'bg-[#B85D3B]',
  awaiting_approval: 'bg-[#B48424]',
  resolved: 'bg-[#2E7D43]',
  closed: 'bg-[#8E8D87]',
}

const priorityStyles: Record<Priority, string> = {
  low: 'border-[#E8E7E3] bg-[#F7F7F5] text-[#7A7873]',
  normal: 'border-[#E2E1DC] bg-[#FFFFFF] text-[#4A4944]',
  high: 'border-[#F6D0AA] bg-[#FDF6ED] text-[#A05208] font-medium',
  urgent: 'border-[#F1B8B3] bg-[#FDF0EE] text-[#A6261E] font-semibold',
}

const typeStyles: Record<ItemType, string> = {
  incident: 'border-[#F1B8B3] bg-[#FDF0EE] text-[#A6261E]',
  customer_issue: 'border-[#CFDDF5] bg-[#F3F7FD] text-[#2452A1]',
  payment: 'border-[#CDE5DB] bg-[#F0F8F5] text-[#1E684B]',
  compliance: 'border-[#DFD3ED] bg-[#F7F3FB] text-[#5A318F]',
  task: 'border-[#E2E1DC] bg-[#FFFFFF] text-[#4A4944]',
}

const roleStyles: Record<Role, string> = {
  viewer: 'border-[#E2E1DC] bg-[#F7F7F5] text-[#63625D]',
  member: 'border-[#CFDDF5] bg-[#F3F7FD] text-[#2452A1]',
  lead: 'border-[#E8C8BC] bg-[#FBF0EA] text-[#9E4C2E] font-semibold',
  admin: 'border-[#DFD3ED] bg-[#F7F3FB] text-[#5A318F] font-semibold',
}

export function StatusBadge({ status }: { status: Status }) {
  const style = statusStyles[status] || 'border-[#E2E1DC] bg-[#FFFFFF] text-[#4A4944]'
  const dot = statusDots[status] || 'bg-[#9C9A93]'
  const label = STATUS_LABELS[status] || status
  return (
    <span className={`${base} ${style}`}>
      <span className={`size-1.5 rounded-full ${dot} shrink-0`} aria-hidden="true" />
      {label}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const style = priorityStyles[priority] || 'border-[#E2E1DC] bg-[#FFFFFF] text-[#4A4944]'
  const label = PRIORITY_LABELS[priority] || priority
  return (
    <span className={`${base} ${style}`}>
      {priority === 'urgent' && (
        <span className="size-1.5 rounded-full bg-[#A6261E] shrink-0 animate-pulse" aria-hidden="true" />
      )}
      {label}
    </span>
  )
}

export function TypeBadge({ type }: { type: ItemType }) {
  const style = typeStyles[type] || 'border-[#E2E1DC] bg-[#FFFFFF] text-[#4A4944]'
  const label = TYPE_LABELS[type] || type
  return <span className={`${base} ${style}`}>{label}</span>
}

export function RoleBadge({ role }: { role: Role }) {
  const style = roleStyles[role] || 'border-[#E2E1DC] bg-[#FFFFFF] text-[#4A4944]'
  const label = ROLE_LABELS[role] || role
  return <span className={`${base} ${style}`}>{label}</span>
}
