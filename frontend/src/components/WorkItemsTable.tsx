import type { TeamMember, WorkItem } from '../types/api'
import { PriorityBadge, StatusBadge, TypeBadge } from './Badges'

interface WorkItemsTableProps {
  items: readonly WorkItem[]
  members?: Record<string, TeamMember>
  onSelectItem?: (item: WorkItem) => void
  currentUserId?: string
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const headerCell =
  'whitespace-nowrap px-3.5 py-2.5 text-left text-[10px] font-bold tracking-[0.12em] text-[#8E8D87] uppercase select-none'
const cell = 'px-3.5 py-2.5 align-middle text-xs text-[#4A4944]'

export default function WorkItemsTable({
  items,
  members = {},
  onSelectItem,
  currentUserId,
}: WorkItemsTableProps) {
  if (items.length === 0) {
    return null
  }

  return (
    <div>
      {/* Mobile Structured Record Summaries */}
      <div className="divide-y divide-[#EAE9E4] md:hidden">
        {items.map((item) => {
          const assignee = item.assignee_id ? members[item.assignee_id] : null
          const isAssignedToMe = item.assignee_id === currentUserId

          return (
            <div
              key={item.id}
              onClick={() => onSelectItem?.(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectItem?.(item)
                }
              }}
              className="p-3.5 space-y-2 hover:bg-[#FAFAF9] focus:bg-[#FAFAF9] focus:outline-none transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8E8D87]">
                    <span>#{item.id.slice(0, 8)}</span>
                    <span>&middot;</span>
                    <span>v{item.version}</span>
                  </div>
                  <h3 className="text-xs font-semibold text-[#242520] truncate mt-0.5">
                    {item.title}
                  </h3>
                </div>
                <StatusBadge status={item.status} />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <PriorityBadge priority={item.priority} />
                <TypeBadge type={item.type} />
                <span className="text-[11px] text-[#63625D]">
                  {assignee ? (
                    <span className="inline-flex items-center gap-1">
                      <span>{assignee.name}</span>
                      {isAssignedToMe && (
                        <span className="rounded bg-[#FBF0EA] px-1 text-[9px] font-bold text-[#9E4C2E]">
                          You
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="italic text-[#9C9A93]">Unassigned</span>
                  )}
                </span>
              </div>

              {item.due_at && (
                <div className="text-[10px] text-[#8E8D87]">
                  Due: {dateFormatter.format(new Date(item.due_at))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Desktop Compact Information-Dense Table */}
      <div
        role="region"
        aria-label="Work items table"
        tabIndex={0}
        className="hidden md:block overflow-x-auto focus:outline-none"
      >
        <table className="w-full border-collapse">
          <caption className="sr-only">Work items list</caption>
          <thead className="border-b border-[#E2E1DC] bg-[#FAF9F7]">
            <tr>
              <th scope="col" className={`${headerCell} sticky left-0 z-10 bg-[#FAF9F7]`}>
                Work Item & ID
              </th>
              <th scope="col" className={headerCell}>
                Type
              </th>
              <th scope="col" className={headerCell}>
                Assignee
              </th>
              <th scope="col" className={headerCell}>
                Priority
              </th>
              <th scope="col" className={headerCell}>
                Status
              </th>
              <th scope="col" className={headerCell}>
                Due Date
              </th>
              <th scope="col" className={headerCell}>
                Updated
              </th>
              <th scope="col" className={`${headerCell} text-right`}>
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAE9E4]">
            {items.map((item) => {
              const assignee = item.assignee_id ? members[item.assignee_id] : null
              const isAssignedToMe = item.assignee_id === currentUserId

              return (
                <tr
                  key={item.id}
                  onClick={() => onSelectItem?.(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelectItem?.(item)
                    }
                  }}
                  tabIndex={0}
                  className="group cursor-pointer hover:bg-[#FAFAF9] focus:bg-[#FAFAF9] focus:outline-none transition-colors duration-100"
                  role="button"
                  aria-label={`View details for ${item.title}`}
                >
                  <th
                    scope="row"
                    className={`${cell} sticky left-0 z-10 max-w-sm bg-white text-left font-normal group-hover:bg-[#FAFAF9] group-focus:bg-[#FAFAF9]`}
                  >
                    <span className="block font-medium text-[#242520] group-hover:text-[#B85D3B] transition-colors truncate">
                      {item.title}
                    </span>
                    <span className="block font-mono text-[10px] text-[#8E8D87] mt-0.5">
                      #{item.id.slice(0, 8)} &middot; v{item.version}
                    </span>
                  </th>
                  <td className={`${cell} whitespace-nowrap`}>
                    <TypeBadge type={item.type} />
                  </td>
                  <td className={`${cell} whitespace-nowrap`}>
                    {assignee ? (
                      <span className="inline-flex items-center gap-1.5 text-[#242520]">
                        <span>{assignee.name}</span>
                        {isAssignedToMe && (
                          <span className="rounded bg-[#FBF0EA] border border-[#E8C8BC] px-1 py-0.2 text-[9px] font-bold text-[#9E4C2E]">
                            You
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[#9C9A93] italic">Unassigned</span>
                    )}
                  </td>
                  <td className={`${cell} whitespace-nowrap`}>
                    <PriorityBadge priority={item.priority} />
                  </td>
                  <td className={`${cell} whitespace-nowrap`}>
                    <StatusBadge status={item.status} />
                  </td>
                  <td className={`${cell} whitespace-nowrap`}>
                    {item.due_at ? (
                      <time dateTime={item.due_at} className="text-[#63625D] text-xs">
                        {dateFormatter.format(new Date(item.due_at))}
                      </time>
                    ) : (
                      <span className="text-[#B5B3AD]">—</span>
                    )}
                  </td>
                  <td className={`${cell} whitespace-nowrap text-[#8E8D87] text-[11px]`}>
                    {item.updated_at ? (
                      <span>{dateTimeFormatter.format(new Date(item.updated_at))}</span>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                  <td className={`${cell} whitespace-nowrap text-right`}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectItem?.(item)
                      }}
                      className="inline-flex items-center gap-1 rounded border border-[#E2E1DC] bg-white px-2 py-1 text-[11px] font-medium text-[#4A4944] hover:border-[#B85D3B] hover:text-[#B85D3B] focus:outline-none focus:ring-1 focus:ring-[#B85D3B] transition-colors"
                    >
                      Details
                      <svg
                        className="size-2.5"
                        fill="none"
                        viewBox="0 0 12 12"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8l4-4M8 8V4H4" />
                      </svg>
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
