import type { TeamMember, WorkItem } from '../types/api'
import { PriorityBadge, StatusBadge, TypeBadge } from './Badges'

interface WorkItemsTableProps {
  items: readonly WorkItem[]
  members?: Record<string, TeamMember>
  onSelectItem?: (item: WorkItem) => void
  currentUserId?: string
}

const dateFormatter = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const headerCell =
  'whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase'
const cell = 'px-4 py-3 align-top text-sm text-slate-700'

export default function WorkItemsTable({
  items,
  members = {},
  onSelectItem,
  currentUserId,
}: WorkItemsTableProps) {
  return (
    <div
      role="region"
      aria-label="Work items table"
      tabIndex={0}
      className="overflow-x-auto focus:outline-none"
    >
      <table className="w-full min-w-[56rem] border-collapse">
        <caption className="sr-only">Work items list</caption>
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th scope="col" className={`${headerCell} sticky left-0 z-10 bg-slate-50`}>
              Item
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
            <th scope="col" className={`${headerCell} text-right`}>
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
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
                className="group cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none transition-colors"
                role="button"
                aria-label={`View details for ${item.title}`}
              >
                <th
                  scope="row"
                  className={`${cell} sticky left-0 z-10 max-w-xs bg-white text-left font-normal group-hover:bg-slate-50 group-focus:bg-slate-50`}
                >
                  <span className="block font-medium text-slate-900 group-hover:text-accent-strong transition-colors">
                    {item.title}
                  </span>
                  <span className="block font-mono text-xs text-slate-500">
                    #{item.id.slice(0, 8)} • v{item.version}
                  </span>
                </th>
                <td className={`${cell} whitespace-nowrap`}>
                  <TypeBadge type={item.type} />
                </td>
                <td className={`${cell} whitespace-nowrap`}>
                  {assignee ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                      {assignee.name}
                      {isAssignedToMe && (
                        <span className="rounded bg-indigo-50 px-1.5 py-0.2 text-[10px] font-semibold text-indigo-700">
                          You
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">Unassigned</span>
                  )}
                </td>
                <td className={cell}>
                  <PriorityBadge priority={item.priority} />
                </td>
                <td className={cell}>
                  <StatusBadge status={item.status} />
                </td>
                <td className={`${cell} whitespace-nowrap`}>
                  {item.due_at ? (
                    <time dateTime={item.due_at}>
                      {dateFormatter.format(new Date(item.due_at))}
                    </time>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className={`${cell} whitespace-nowrap text-right`}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectItem?.(item)
                    }}
                    className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    Details &rarr;
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
