import BackendStatus from './BackendStatus'
import { RoleBadge } from './Badges'
import { useAuth } from '../context/useAuth'

interface AppHeaderProps {
  title: string
  description: string
  onCreateItem?: () => void
  canCreate?: boolean
  onRefresh?: () => void
  isRefreshing?: boolean
}

export default function AppHeader({
  title,
  description,
  onCreateItem,
  canCreate = false,
  onRefresh,
  isRefreshing = false,
}: AppHeaderProps) {
  const { currentTeam, roleInCurrentTeam } = useAuth()

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
            {currentTeam && (
              <span className="hidden sm:inline-block rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                {currentTeam.name}
              </span>
            )}
            {roleInCurrentTeam && (
              <span className="hidden sm:inline-block">
                <RoleBadge role={roleInCurrentTeam} />
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600 mt-0.5">{description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh data"
              className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              aria-label="Refresh data"
            >
              <svg
                className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          )}

          {canCreate && onCreateItem && (
            <button
              type="button"
              onClick={onCreateItem}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-accent-strong focus:outline-none focus:ring-2 focus:ring-accent"
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

          <BackendStatus />
        </div>
      </div>
    </header>
  )
}
