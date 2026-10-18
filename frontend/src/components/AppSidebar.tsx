import { useAuth } from '../context/useAuth'
import { RoleBadge } from './Badges'

export type NavigationTab = 'overview' | 'work-items' | 'my-work' | 'approvals'

interface AppSidebarProps {
  activeTab: NavigationTab
  onSelectTab: (tab: NavigationTab) => void
  myWorkCount?: number
  approvalsCount?: number
}

function ProductMark() {
  return (
    <img
      src="/logo.webp"
      alt="Newtonite logo"
      className="size-8 shrink-0 rounded-lg object-contain shadow-xs ring-1 ring-slate-900/10"
    />
  )
}

export default function AppSidebar({
  activeTab,
  onSelectTab,
  myWorkCount,
  approvalsCount,
}: AppSidebarProps) {
  const { user, teams, currentTeam, roleInCurrentTeam, setCurrentTeam, logout } = useAuth()

  const navItems: Array<{
    id: NavigationTab
    label: string
    count?: number
    countColor?: string
    icon: (active: boolean) => React.ReactNode
  }> = [
    {
      id: 'overview',
      label: 'Overview',
      icon: (active) => (
        <svg
          className={`size-4.5 ${active ? 'text-accent-strong' : 'text-slate-500'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          />
        </svg>
      ),
    },
    {
      id: 'work-items',
      label: 'Work Items',
      icon: (active) => (
        <svg
          className={`size-4.5 ${active ? 'text-accent-strong' : 'text-slate-500'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
          />
        </svg>
      ),
    },
    {
      id: 'my-work',
      label: 'My Work',
      count: myWorkCount,
      countColor: 'bg-indigo-100 text-indigo-700',
      icon: (active) => (
        <svg
          className={`size-4.5 ${active ? 'text-accent-strong' : 'text-slate-500'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      ),
    },
    {
      id: 'approvals',
      label: 'Approvals',
      count: approvalsCount,
      countColor: 'bg-amber-100 text-amber-800',
      icon: (active) => (
        <svg
          className={`size-4.5 ${active ? 'text-accent-strong' : 'text-slate-500'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
      ),
    },
  ]

  return (
    <aside className="flex shrink-0 flex-col border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:border-r lg:border-b-0">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-4 py-3 lg:px-5 lg:py-5">
        <ProductMark />
        <div className="min-w-0 flex-1">
          <span className="block text-sm leading-tight font-semibold text-slate-900 truncate">
            Newtonite
          </span>
          <span className="block text-[11px] text-slate-500 font-mono">
            Ops Under Pressure
          </span>
        </div>
      </div>

      {/* Team Selection */}
      <div className="border-t border-slate-100 px-3 py-3 lg:px-4">
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="team-select" className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Current Team
          </label>
          {roleInCurrentTeam && <RoleBadge role={roleInCurrentTeam} />}
        </div>

        {teams.length > 1 ? (
          <select
            id="team-select"
            value={currentTeam?.id || ''}
            onChange={(e) => {
              const selected = teams.find((t) => t.id === e.target.value)
              if (selected) setCurrentTeam(selected)
            }}
            className="w-full h-8 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-800 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.role})
              </option>
            ))}
          </select>
        ) : currentTeam ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-800 truncate">
            {currentTeam.name}
          </div>
        ) : (
          <div className="text-xs text-slate-600 italic">No team memberships</div>
        )}
      </div>

      {/* Navigation Links */}
      <nav aria-label="Primary" className="px-3 py-2 lg:flex-1">
        <ul className="flex flex-wrap gap-1 lg:flex-col">
          {navItems.map((item) => {
            const isActive = activeTab === item.id
            return (
              <li key={item.id} className="w-full">
                <button
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-accent-soft text-accent-strong shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    {item.icon(isActive)}
                    {item.label}
                  </span>
                  {typeof item.count === 'number' && item.count > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[11px] font-semibold ${
                        item.countColor || 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* User info & Logout */}
      <div className="border-t border-slate-200 p-3 lg:p-4 bg-slate-50">
        {user ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 truncate">{user.name}</p>
              <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Sign out"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors"
              aria-label="Sign out"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
