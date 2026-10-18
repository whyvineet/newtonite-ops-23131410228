export type Role = 'viewer' | 'member' | 'lead' | 'admin'

export type ItemType =
  | 'incident'
  | 'customer_issue'
  | 'payment'
  | 'compliance'
  | 'task'

export type Priority = 'low' | 'normal' | 'high' | 'urgent'

export type Status =
  | 'open'
  | 'in_progress'
  | 'awaiting_approval'
  | 'resolved'
  | 'closed'

export type EventType =
  | 'item_created'
  | 'item_updated'
  | 'priority_changed'
  | 'claimed'
  | 'assigned'
  | 'status_changed'
  | 'comment_added'

export type DashboardView =
  | 'assigned_to_me'
  | 'unassigned_urgent'
  | 'awaiting_my_approval'

export interface Membership {
  team_id: string
  team_name: string
  role: Role
}

export interface User {
  id: string
  name: string
  email: string
  memberships: Membership[]
}

export interface Team {
  id: string
  name: string
  role: Role
}

export interface TeamMember {
  user_id: string
  name: string
  role: Role
  is_active: boolean
}

export interface WorkItem {
  id: string
  team_id: string
  title: string
  description: string
  type: ItemType
  priority: Priority
  status: Status
  assignee_id: string | null
  created_by_id: string
  due_at: string | null
  version: number
  created_at: string
  updated_at: string
  resolved_at: string | null
  closed_at: string | null
}

export interface WorkItemPage {
  items: WorkItem[]
  next_cursor: string | null
  limit: number
}

export interface WorkItemCreate {
  team_id: string
  title: string
  description?: string
  type: ItemType
  priority?: Priority
  assignee_id?: string | null
  due_at?: string | null
}

export interface WorkItemUpdate {
  expected_version: number
  title?: string
  description?: string
  type?: ItemType
  priority?: Priority
  due_at?: string | null
}

export interface AssignRequest {
  assignee_id: string
  expected_version?: number
}

export interface TransitionRequest {
  to_status: Status
  expected_version: number
}

export interface ActorRead {
  id: string
  name: string
}

export interface Comment {
  id: string
  work_item_id: string
  author: ActorRead
  body: string
  created_at: string
}

export interface CommentPage {
  comments: Comment[]
  next_cursor: string | null
}

export interface ActivityEvent {
  id: string
  work_item_id: string
  event_type: EventType
  actor: ActorRead
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
}

export interface ActivityPage {
  events: ActivityEvent[]
  next_cursor: string | null
}

export interface DashboardResponse {
  view: DashboardView
  total: number
  items: WorkItem[]
  next_cursor: string | null
  limit: number
}

export interface DashboardSummary {
  open: number
  in_progress: number
  urgent: number
  awaiting_approval: number
  assigned_to_me: number
  unassigned_urgent: number
  total: number
}


export interface ApiErrorDetail {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface ApiErrorResponse {
  error?: ApiErrorDetail
  detail?: Array<{ loc: (string | number)[]; msg: string; type: string }> | string
}

export const STATUS_LABELS: Record<Status, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  awaiting_approval: 'Awaiting Approval',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

export const TYPE_LABELS: Record<ItemType, string> = {
  incident: 'Incident',
  customer_issue: 'Customer Issue',
  payment: 'Payment',
  compliance: 'Compliance',
  task: 'Task',
}

export const ROLE_LABELS: Record<Role, string> = {
  viewer: 'Viewer',
  member: 'Member',
  lead: 'Lead',
  admin: 'Admin',
}

export const ALL_STATUSES: Status[] = [
  'open',
  'in_progress',
  'awaiting_approval',
  'resolved',
  'closed',
]

export const ALL_PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent']

export const ALL_TYPES: ItemType[] = [
  'incident',
  'customer_issue',
  'payment',
  'compliance',
  'task',
]
