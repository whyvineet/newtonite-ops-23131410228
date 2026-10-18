import { useState, useEffect, useMemo } from 'react'
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

  // Server-side filtering
  searchQuery?: string
  onSearchChange?: (q: string) => void
  statusFilter?: Status | 'all'
  onStatusChange?: (s: Status | 'all') => void
  priorityFilter?: Priority | 'all'
  onPriorityChange?: (p: Priority | 'all') => void
  typeFilter?: ItemType | 'all'
  onTypeChange?: (t: ItemType | 'all') => void
  onClearFilters?: () => void
  hideStatusFilter?: boolean

  // Keyset pagination
  hasNextPage?: boolean
  hasPrevPage?: boolean
  onNextPage?: () => void
  onPrevPage?: () => void
  pageIndex?: number
  totalCount?: number
}

const controlClass =
  'h-8 rounded border border-[#E2E1DC] bg-white px-2.5 text-xs text-[#242520] placeholder:text-[#9C9A93] hover:border-[#D5D4CE] focus:outline-none focus:ring-1 focus:ring-[#B85D3B] focus:border-[#B85D3B] transition-colors'

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
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  priorityFilter,
  onPriorityChange,
  typeFilter,
  onTypeChange,
  onClearFilters,
  hideStatusFilter = false,
  hasNextPage = false,
  hasPrevPage = false,
  onNextPage,
  onPrevPage,
  pageIndex = 0,
  totalCount,
}: WorkItemsSectionProps) {
  const isServerFiltered = Boolean(onSearchChange || onStatusChange || onPriorityChange || onTypeChange)

  const [localSearch, setLocalSearch] = useState(searchQuery ?? '')
  const [internalStatus, setInternalStatus] = useState<Status | 'all'>('all')
  const [internalPriority, setInternalPriority] = useState<Priority | 'all'>('all')
  const [internalType, setInternalType] = useState<ItemType | 'all'>('all')

  const effectiveStatus = isServerFiltered ? (statusFilter ?? 'all') : internalStatus
  const effectivePriority = isServerFiltered ? (priorityFilter ?? 'all') : internalPriority
  const effectiveType = isServerFiltered ? (typeFilter ?? 'all') : internalType

  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery)
  if (searchQuery !== prevSearchQuery) {
    setPrevSearchQuery(searchQuery)
    setLocalSearch(searchQuery ?? '')
  }

  // Debounce search trigger
  useEffect(() => {
    if (!onSearchChange) return
    const timer = setTimeout(() => {
      onSearchChange(localSearch)
    }, 280)
    return () => clearTimeout(timer)
  }, [localSearch, onSearchChange])

  const hasActiveFilters = Boolean(
    localSearch.trim() !== '' ||
      (effectiveStatus !== 'all' && !hideStatusFilter) ||
      effectivePriority !== 'all' ||
      effectiveType !== 'all',
  )

  function handleClear() {
    setLocalSearch('')
    if (onClearFilters) {
      onClearFilters()
    } else {
      setInternalStatus('all')
      setInternalPriority('all')
      setInternalType('all')
    }
  }

  // Client-side fallback filtering
  const visibleItems = useMemo(() => {
    if (isServerFiltered) return items
    const query = localSearch.trim().toLowerCase()
    return items.filter((item) => {
      if (effectiveStatus !== 'all' && item.status !== effectiveStatus) return false
      if (effectivePriority !== 'all' && item.priority !== effectivePriority) return false
      if (effectiveType !== 'all' && item.type !== effectiveType) return false
      if (query === '') return true

      const assigneeName = item.assignee_id ? members[item.assignee_id]?.name ?? '' : 'unassigned'
      return [item.id, item.title, item.description, item.type, assigneeName]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [isServerFiltered, items, localSearch, effectiveStatus, effectivePriority, effectiveType, members])

  const showPagination = Boolean(
    hasPrevPage || hasNextPage || (pageIndex !== undefined && pageIndex > 0),
  )

  return (
    <section
      aria-labelledby="work-items-heading"
      className="rounded-lg border border-[#E2E1DC] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden"
    >
      {/* Header and Filter Toolbar */}
      <div className="space-y-3 border-b border-[#EAE9E4] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="work-items-heading" className="text-sm font-semibold tracking-tight text-[#242520]">
              {title}
            </h2>
            {description && <p className="text-xs text-[#63625D] mt-0.5">{description}</p>}
          </div>

          <div className="flex items-center gap-2">
            {canCreate && onCreateItem && (
              <button
                type="button"
                onClick={onCreateItem}
                className="inline-flex items-center gap-1.5 rounded bg-[#B85D3B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#9E4C2E] transition-colors"
              >
                <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                    clipRule="evenodd"
                  />
                </svg>
                New Work Item
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-end gap-2.5 pt-1">
          <label className="flex min-w-44 flex-1 flex-col gap-1 text-[11px] font-semibold tracking-wider text-[#63625D] uppercase sm:max-w-xs">
            Search
            <input
              type="search"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Title, description, ID…"
              className={controlClass}
            />
          </label>

          {!hideStatusFilter && (
            <label className="flex flex-col gap-1 text-[11px] font-semibold tracking-wider text-[#63625D] uppercase">
              Status
              <select
                value={effectiveStatus}
                onChange={(e) => {
                  const val = e.target.value as Status | 'all'
                  if (onStatusChange) onStatusChange(val)
                  else setInternalStatus(val)
                }}
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
          )}

          <label className="flex flex-col gap-1 text-[11px] font-semibold tracking-wider text-[#63625D] uppercase">
            Priority
            <select
              value={effectivePriority}
              onChange={(e) => {
                const val = e.target.value as Priority | 'all'
                if (onPriorityChange) onPriorityChange(val)
                else setInternalPriority(val)
              }}
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

          <label className="flex flex-col gap-1 text-[11px] font-semibold tracking-wider text-[#63625D] uppercase">
            Type
            <select
              value={effectiveType}
              onChange={(e) => {
                const val = e.target.value as ItemType | 'all'
                if (onTypeChange) onTypeChange(val)
                else setInternalType(val)
              }}
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

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClear}
              className="h-8 rounded border border-[#E2E1DC] bg-white px-2.5 text-xs font-medium text-[#63625D] hover:bg-[#F7F7F5] hover:text-[#242520] transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Info Bar */}
        <div className="flex items-center justify-between text-[11px] text-[#8E8D87] pt-0.5">
          <p aria-live="polite">
            {isLoading
              ? 'Loading operational records…'
              : totalCount !== undefined
              ? `Page ${pageIndex + 1} · ${visibleItems.length} displayed (${totalCount} in queue)`
              : `Page ${pageIndex + 1} · ${visibleItems.length} records`}
          </p>
        </div>
      </div>

      {/* Skeletons on loading */}
      {isLoading ? (
        <div className="p-4 space-y-3">
          <div className="h-9 w-full bg-[#F7F7F5] rounded animate-pulse" />
          <div className="h-9 w-full bg-[#FAFAF9] rounded animate-pulse" />
          <div className="h-9 w-full bg-[#F7F7F5] rounded animate-pulse" />
          <div className="h-9 w-full bg-[#FAFAF9] rounded animate-pulse" />
          <div className="h-9 w-full bg-[#F7F7F5] rounded animate-pulse" />
        </div>
      ) : error ? (
        <div className="px-4 py-12 text-center">
          <div className="mx-auto flex size-9 items-center justify-center rounded bg-[#FDF0EE] text-[#A6261E] mb-2.5">
            <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <p className="text-xs font-semibold text-[#242520]">Failed to load work items</p>
          <p className="mt-0.5 text-xs text-[#63625D]">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3.5 inline-flex items-center rounded border border-[#E2E1DC] bg-white px-3 py-1.5 text-xs font-medium text-[#242520] hover:bg-[#F7F7F5] transition-colors"
            >
              Retry request
            </button>
          )}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="px-4 py-14 text-center">
          {hasActiveFilters ? (
            <div className="max-w-sm mx-auto space-y-2">
              <p className="text-xs font-semibold text-[#242520]">
                No matching work items
              </p>
              <p className="text-xs text-[#63625D]">
                No items match your active search or filters. Reset the filters to view all records in this queue.
              </p>
              <button
                type="button"
                onClick={handleClear}
                className="mt-2 inline-flex items-center rounded border border-[#E2E1DC] bg-white px-3 py-1.5 text-xs font-medium text-[#242520] hover:bg-[#F7F7F5] transition-colors"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="max-w-sm mx-auto space-y-2">
              <p className="text-xs font-semibold text-[#242520]">No work items in queue</p>
              <p className="text-xs text-[#63625D]">
                There are currently no records in this operations view.
              </p>
              {canCreate && onCreateItem && (
                <button
                  type="button"
                  onClick={onCreateItem}
                  className="mt-2 inline-flex items-center gap-1.5 rounded bg-[#B85D3B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#9E4C2E] transition-colors"
                >
                  Create work item
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <WorkItemsTable
            items={visibleItems}
            members={members}
            onSelectItem={onSelectItem}
            currentUserId={currentUserId}
          />

          {showPagination && (
            <div className="flex items-center justify-between border-t border-[#EAE9E4] bg-[#FAF9F7] px-4 py-2.5">
              <div className="text-[11px] text-[#63625D]">
                Page <span className="font-semibold text-[#242520]">{pageIndex + 1}</span>
                {totalCount !== undefined && <span> &middot; {totalCount} total records</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onPrevPage}
                  disabled={!hasPrevPage || isLoading}
                  className="inline-flex items-center rounded border border-[#E2E1DC] bg-white px-2.5 py-1 text-xs font-medium text-[#4A4944] hover:bg-[#F7F7F5] disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                >
                  &larr; Prev
                </button>
                <button
                  type="button"
                  onClick={onNextPage}
                  disabled={!hasNextPage || isLoading}
                  className="inline-flex items-center rounded border border-[#E2E1DC] bg-white px-2.5 py-1 text-xs font-medium text-[#4A4944] hover:bg-[#F7F7F5] disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                >
                  Next &rarr;
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
