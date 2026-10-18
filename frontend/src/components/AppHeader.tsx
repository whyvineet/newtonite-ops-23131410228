import { useMemo } from 'react'
import { RoleBadge } from './Badges'
import { useAuth } from '../context/useAuth'

interface AppHeaderProps {
  title: string
  description: string
  category?: string
  onCreateItem?: () => void
  canCreate?: boolean
  onRefresh?: () => void
  isRefreshing?: boolean
}

export default function AppHeader({
  title,
  description,
  category = 'OPERATIONS',
  onCreateItem,
  canCreate = false,
  onRefresh,
  isRefreshing = false,
}: AppHeaderProps) {
  const { currentTeam, roleInCurrentTeam } = useAuth()

  // Dynamic day of week in uppercase, e.g. "MONDAY / OPERATIONS"
  const dayEyebrow = useMemo(() => {
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'long' })
      .format(new Date())
      .toUpperCase()
    return `${day} / ${category}`
  }, [category])

  return (
    <header className="border-b border-[#E2E1DC] bg-white sticky top-0 z-20">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-[#8E8D87] uppercase">
              {dayEyebrow}
            </span>
            {currentTeam && (
              <span className="inline-flex items-center rounded border border-[#E2E1DC] bg-[#F7F7F5] px-2 py-0.5 text-[10px] font-medium text-[#4A4944]">
                {currentTeam.name}
              </span>
            )}
            {roleInCurrentTeam && (
              <span className="hidden sm:inline-block">
                <RoleBadge role={roleInCurrentTeam} />
              </span>
            )}
          </div>
          <h1 className="text-base sm:text-lg font-semibold tracking-tight text-[#242520] mt-0.5">
            {title}
          </h1>
          <p className="text-xs text-[#63625D] mt-0.5">{description}</p>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh data"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-[#E2E1DC] bg-white px-2.5 text-xs font-medium text-[#4A4944] hover:bg-[#F7F7F5] hover:text-[#242520] focus:outline-none focus:ring-1 focus:ring-[#B85D3B] disabled:opacity-40 transition-colors"
              aria-label="Refresh data"
            >
              <svg
                className={`size-3.5 ${isRefreshing ? 'animate-spin text-[#B85D3B]' : 'text-[#63625D]'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}

          {canCreate && onCreateItem && (
            <button
              type="button"
              onClick={onCreateItem}
              className="inline-flex h-8 items-center gap-1.5 rounded bg-[#B85D3B] px-3 text-xs font-medium text-white hover:bg-[#9E4C2E] focus:outline-none focus:ring-2 focus:ring-[#B85D3B]/20 transition-colors"
            >
              <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>New Work Item</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
