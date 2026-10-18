import { generateIdempotencyKey, request } from './client'
import type {
  ActivityPage,
  AssignRequest,
  Comment,
  CommentPage,
  DashboardResponse,
  DashboardSummary,
  DashboardView,
  ItemType,
  Priority,
  Status,
  TransitionRequest,
  WorkItem,
  WorkItemCreate,
  WorkItemPage,
  WorkItemUpdate,
} from '../types/api'

export interface ItemListFilters {
  team_id?: string
  status?: Status
  priority?: Priority
  assignee_id?: string
  type?: ItemType
  q?: string
  cursor?: string
  limit?: number
}

export async function listItems(
  filters: ItemListFilters = {},
  signal?: AbortSignal,
): Promise<WorkItemPage> {
  const query = filters.q?.trim()
  return request<WorkItemPage>('/items', {
    method: 'GET',
    params: {
      team_id: filters.team_id,
      status: filters.status,
      priority: filters.priority,
      assignee_id: filters.assignee_id,
      type: filters.type,
      q: query ? query : undefined,
      cursor: filters.cursor,
      limit: filters.limit,
    },
    signal,
  })
}

export async function getItem(id: string, signal?: AbortSignal): Promise<WorkItem> {
  return request<WorkItem>(`/items/${id}`, {
    method: 'GET',
    signal,
  })
}

export async function createItem(
  payload: WorkItemCreate,
  idempotencyKey?: string,
): Promise<WorkItem> {
  return request<WorkItem>('/items', {
    method: 'POST',
    body: payload,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  })
}

export async function updateItem(
  id: string,
  payload: WorkItemUpdate,
): Promise<WorkItem> {
  return request<WorkItem>(`/items/${id}`, {
    method: 'PATCH',
    body: payload,
  })
}

export async function claimItem(id: string): Promise<WorkItem> {
  return request<WorkItem>(`/items/${id}/claim`, {
    method: 'POST',
  })
}

export async function assignItem(
  id: string,
  payload: AssignRequest,
): Promise<WorkItem> {
  return request<WorkItem>(`/items/${id}/assign`, {
    method: 'POST',
    body: payload,
  })
}

export async function transitionItem(
  id: string,
  payload: TransitionRequest,
): Promise<WorkItem> {
  return request<WorkItem>(`/items/${id}/transition`, {
    method: 'POST',
    body: payload,
  })
}

export async function listComments(
  itemId: string,
  cursor?: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<CommentPage> {
  return request<CommentPage>(`/items/${itemId}/comments`, {
    method: 'GET',
    params: { cursor, limit },
    signal,
  })
}

export async function addComment(itemId: string, body: string): Promise<Comment> {
  return request<Comment>(`/items/${itemId}/comments`, {
    method: 'POST',
    body: { body },
  })
}

export async function listActivity(
  itemId: string,
  cursor?: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<ActivityPage> {
  return request<ActivityPage>(`/items/${itemId}/activity`, {
    method: 'GET',
    params: { cursor, limit },
    signal,
  })
}

export interface DashboardOptions {
  cursor?: string
  limit?: number
  team_id?: string
}

export async function getDashboard(
  view: DashboardView,
  optionsOrCursor?: string | DashboardOptions,
  limit: number = 25,
  signal?: AbortSignal,
): Promise<DashboardResponse> {
  let cursor: string | undefined
  let lim = limit
  let team_id: string | undefined

  if (typeof optionsOrCursor === 'string') {
    cursor = optionsOrCursor
  } else if (optionsOrCursor) {
    cursor = optionsOrCursor.cursor
    lim = optionsOrCursor.limit ?? lim
    team_id = optionsOrCursor.team_id
  }

  return request<DashboardResponse>('/dashboard', {
    method: 'GET',
    params: {
      view,
      cursor,
      limit: lim,
      team_id,
    },
    signal,
  })
}

export async function getDashboardSummary(
  team_id?: string,
  signal?: AbortSignal,
): Promise<DashboardSummary> {
  return request<DashboardSummary>('/dashboard/summary', {
    method: 'GET',
    params: {
      team_id,
    },
    signal,
  })
}


