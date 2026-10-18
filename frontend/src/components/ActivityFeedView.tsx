import { useEffect, useState } from 'react'
import { listActivity, listItems } from '../api/workItems'
import { useAuth } from '../context/useAuth'
import type { ActivityEvent, WorkItem } from '../types/api'

interface ItemWithActivity {
  item: WorkItem
  event: ActivityEvent
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export default function ActivityFeedView({
  onSelectItem,
}: {
  onSelectItem: (item: WorkItem) => void
}) {
  const { currentTeam } = useAuth()
  const [feed, setFeed] = useState<ItemWithActivity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!currentTeam) return
    let unmounted = false

    async function loadActivityFeed() {
      setIsLoading(true)
      setError(null)
      try {
        // Fetch recent items for this team
        const itemsRes = await listItems({ team_id: currentTeam!.id, limit: 12 })
        if (unmounted) return

        // Fetch activity for top recent items
        const results = await Promise.all(
          itemsRes.items.slice(0, 8).map(async (item) => {
            try {
              const actRes = await listActivity(item.id, undefined, 5)
              return actRes.events.map((event) => ({ item, event }))
            } catch {
              return []
            }
          }),
        )

        if (unmounted) return
        const flattened = results.flat()
        // Sort chronologically descending
        flattened.sort(
          (a, b) =>
            new Date(b.event.created_at).getTime() - new Date(a.event.created_at).getTime(),
        )

        setFeed(flattened)
      } catch (err: unknown) {
        if (!unmounted) {
          setError(err instanceof Error ? err.message : 'Failed to load team activity')
        }
      } finally {
        if (!unmounted) setIsLoading(false)
      }
    }

    void loadActivityFeed()
    return () => {
      unmounted = true
    }
  }, [currentTeam])

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="rounded-lg border border-[#E2E1DC] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#8E8D87]">
          Audit & Situational Awareness
        </span>
        <h2 className="text-base font-semibold text-[#242520] mt-1">
          Operational Activity Stream
        </h2>
        <p className="text-xs text-[#63625D] mt-0.5">
          Real-time record of assignments, state transitions, and operator interventions across {currentTeam?.name}.
        </p>
      </div>

      {/* Feed list */}
      <div className="rounded-lg border border-[#E2E1DC] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#63625D] mb-4">
          Recent Operational Events
        </h3>

        {isLoading ? (
          <div className="space-y-4 py-4">
            <div className="h-12 w-full bg-[#F7F7F5] rounded animate-pulse" />
            <div className="h-12 w-full bg-[#FAFAF9] rounded animate-pulse" />
            <div className="h-12 w-full bg-[#F7F7F5] rounded animate-pulse" />
          </div>
        ) : error ? (
          <div className="p-4 text-xs text-[#A6261E] bg-[#FDF0EE] rounded border border-[#F1B8B3]">
            {error}
          </div>
        ) : feed.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#8E8D87]">
            No activity events found in recent records.
          </div>
        ) : (
          <div className="space-y-3.5">
            {feed.map(({ item, event }) => (
              <div
                key={`${item.id}-${event.id}`}
                onClick={() => onSelectItem(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectItem(item)
                  }
                }}
                className="group flex items-start justify-between gap-3 rounded border border-[#EAE9E4] bg-[#FAF9F7] p-3 hover:bg-[#F2F2EE] hover:border-[#D5D4CE] focus:outline-none focus:ring-1 focus:ring-[#B85D3B] transition-colors cursor-pointer"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-[#242520]">{event.actor.name}</span>
                    <span className="text-[#8E8D87]">&middot;</span>
                    <code className="rounded bg-white border border-[#E2E1DC] px-1 py-0.5 font-mono text-[10px] text-[#242520]">
                      {event.event_type}
                    </code>
                    <span className="text-[#8E8D87]">&middot;</span>
                    <span className="text-xs font-medium text-[#242520] group-hover:text-[#B85D3B] truncate">
                      {item.title}
                    </span>
                  </div>

                  {event.old_value && event.new_value && (
                    <div className="text-[11px] font-mono text-[#63625D]">
                      {Object.keys(event.new_value).map((k) => (
                        <span key={k} className="inline-block mr-3">
                          {k}: {String(event.old_value?.[k])} &rarr; {String(event.new_value?.[k])}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <span className="block font-mono text-[10px] text-[#8E8D87]">
                    #{item.id.slice(0, 8)}
                  </span>
                  <span className="block text-[10px] text-[#8E8D87] mt-0.5">
                    {dateFormatter.format(new Date(event.created_at))}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
