import { useState, useMemo } from 'react'
import {
  ALL_PRIORITIES,
  ALL_STATUSES,
  ALL_TYPES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  type ItemType,
  type Priority,
  type Status,
  type TeamMember,
  type WorkItem,
} from '../types/api'
import WorkItemsTable from './WorkItemsTable'

interface WorkItemsSectionProps {
  title?: string
  description?: string
  items: readonly WorkItem[]
  members?: Record<string, TeamMember>
  isLoading?: boolean
  error?: string | null
  onRetry?: () => void
  onSelectItem?: (item: WorkItem) => void
  onCreateItem?: () => void
  canCreate?: boolean
  currentUserId?: string
}

const controlClass =
  'h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent'

export default function WorkItemsSection({
  title = 'Work Items',
  description,
  items,
  members = {},
  isLoading = false,
  error = null,
  onRetry,
  onSelectItem,
  onCreateItem,
  canCreate = false,
  currentUserId,
}: WorkItemsSectionProps) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status | 'all'>('all')
  const [priority, setPriority] = useState<Priority | 'all'>('all')
  const [type, setType] = useState<ItemType | 'all'>('all')

  const normalizedQuery = query.trim().toLowerCase()
  const hasActiveFilters =
    normalizedQuery !== '' || status !== 'all' || priority !== 'all' || type !== 'all'

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (status !== 'all' && item.status !== status) return false
      if (priority !== 'all' && item.priority !== priority) return false
      if (type !== 'all' && item.type !== type) return false
      if (normalizedQuery === '') return true

      const assigneeName = item.assignee_id ? members[item.assignee_id]?.name ?? '' : 'unassigned'
      return [item.id, item.title, item.description, item.type, assigneeName]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [items, status, priority, type, normalizedQuery, members])

  function clearFilters() {
    setQuery('')
    setStatus('all')
    setPriority('all')
    setType('all')
  }

  return (
    <section
      aria-labelledby="work-items-heading"
      className="rounded-lg border border-slate-200 bg-white shadow-xs"
    >
      <div className="space-y-3 border-b border-slate-200 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="work-items-heading" className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
          </div>

          <div className="flex items-center gap-2">
            {canCreate && onCreateItem && (
              <button
                type="button"
                onClick={onCreateItem}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-accent-strong focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                New Work Item
              </button>
            )}
          </div>
        </div>

          <div className="flex flex-wrap items-end gap-3 pt-1">
            <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-slate-700 sm:max-w-xs">
              Search
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Title, ID, assignee…"
                className={controlClass}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
              Status
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as Status | 'all')}
                className={controlClass}
              >
                <option value="all">All statuses</option>
                {ALL_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
              Priority
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as Priority | 'all')}
                className={controlClass}
              >
                <option value="all">All priorities</option>
                {ALL_PRIORITIES.map((option) => (
                  <option key={option} value={option}>
                    {PRIORITY_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
              Type
              <select
                value={type}
                onChange={(event) => setType(event.target.value as ItemType | 'all')}
                className={controlClass}
              >
                <option value="all">All types</option>
                {ALL_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {TYPE_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:border-slate-200 disabled:hover:bg-white"
            >
              Clear
            </button>
          </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
          <p aria-live="polite">
            {isLoading
              ? 'Fetching records from server…'
              : `Showing ${visibleItems.length} of ${items.length} items`}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="px-4 py-16 text-center">
          <div className="inline-block size-6 animate-spin rounded-full border-2 border-slate-300 border-t-accent" />
          <p className="mt-2 text-sm text-slate-600">Loading work items…</p>
        </div>
      ) : error ? (
        <div className="px-4 py-12 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-red-100 text-red-600">
            <svg className="size-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-900">Failed to load work items</p>
          <p className="mt-1 text-xs text-slate-600">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex items-center rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong"
            >
              Retry
            </button>
          )}
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <p className="text-sm font-medium text-slate-900">No work items found</p>
          <p className="mt-1 text-xs text-slate-500">
            There are currently no items in this operational queue.
          </p>
          {canCreate && onCreateItem && (
            <button
              type="button"
              onClick={onCreateItem}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong"
            >
              Create first work item
            </button>
          )}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <p className="text-sm font-medium text-slate-900">
            No work items match your search and filters
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Try adjusting your search criteria or resetting filters.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-4 inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <WorkItemsTable
          items={visibleItems}
          members={members}
          onSelectItem={onSelectItem}
          currentUserId={currentUserId}
        />
      )}
    </section>
  )
}
