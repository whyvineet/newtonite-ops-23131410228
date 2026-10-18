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
  'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium'

const statusStyles: Record<Status, string> = {
  open: 'border-slate-300 bg-white text-slate-700',
  in_progress: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  awaiting_approval: 'border-amber-300 bg-amber-50 text-amber-900',
  resolved: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  closed: 'border-slate-200 bg-slate-100 text-slate-600',
}

const priorityStyles: Record<Priority, string> = {
  low: 'border-slate-200 bg-slate-50 text-slate-600',
  normal: 'border-slate-300 bg-white text-slate-700',
  high: 'border-orange-300 bg-orange-50 text-orange-900',
  urgent: 'border-red-300 bg-red-50 text-red-800',
}

const typeStyles: Record<ItemType, string> = {
  incident: 'border-red-200 bg-red-50 text-red-700',
  customer_issue: 'border-blue-200 bg-blue-50 text-blue-700',
  payment: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  compliance: 'border-purple-200 bg-purple-50 text-purple-700',
  task: 'border-slate-200 bg-slate-50 text-slate-700',
}

const roleStyles: Record<Role, string> = {
  viewer: 'border-slate-200 bg-slate-100 text-slate-600',
  member: 'border-blue-200 bg-blue-50 text-blue-800',
  lead: 'border-indigo-200 bg-indigo-50 text-indigo-800 font-semibold',
  admin: 'border-purple-200 bg-purple-50 text-purple-800 font-semibold',
}

export function StatusBadge({ status }: { status: Status }) {
  const style = statusStyles[status] || 'border-slate-200 bg-white text-slate-700'
  const label = STATUS_LABELS[status] || status
  return <span className={`${base} ${style}`}>{label}</span>
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const style = priorityStyles[priority] || 'border-slate-200 bg-white text-slate-700'
  const label = PRIORITY_LABELS[priority] || priority
  return <span className={`${base} ${style}`}>{label}</span>
}

export function TypeBadge({ type }: { type: ItemType }) {
  const style = typeStyles[type] || 'border-slate-200 bg-white text-slate-700'
  const label = TYPE_LABELS[type] || type
  return <span className={`${base} ${style}`}>{label}</span>
}

export function RoleBadge({ role }: { role: Role }) {
  const style = roleStyles[role] || 'border-slate-200 bg-white text-slate-700'
  const label = ROLE_LABELS[role] || role
  return <span className={`${base} ${style}`}>{label}</span>
}
