import { useState } from 'react'
import { useAuth } from '../context/useAuth'
import { RoleBadge } from './Badges'

export type NavigationTab =
  | 'overview'
  | 'work-items'
  | 'my-work'
  | 'approvals'
  | 'activity'
  | 'teams'

interface AppSidebarProps {
  activeTab: NavigationTab
  onSelectTab: (tab: NavigationTab) => void
  myWorkCount?: number
  approvalsCount?: number
  unassignedUrgentCount?: number
}

export default function AppSidebar({
  activeTab,
  onSelectTab,
  myWorkCount,
  approvalsCount,
}: AppSidebarProps) {
  const { user, teams, currentTeam, roleInCurrentTeam, setCurrentTeam, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const workspaceNavItems: Array<{
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
          className={`size-4 ${active ? 'text-[#B85D3B]' : 'text-[#63625D]'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
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
      label: 'Work items',
      icon: (active) => (
        <svg
          className={`size-4 ${active ? 'text-[#B85D3B]' : 'text-[#63625D]'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
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
      label: 'Assigned to me',
      count: myWorkCount,
      countColor: 'bg-[#FBF0EA] text-[#9E4C2E] border border-[#E8C8BC]',
      icon: (active) => (
        <svg
          className={`size-4 ${active ? 'text-[#B85D3B]' : 'text-[#63625D]'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
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
      countColor: 'bg-[#FDF8EB] text-[#855D10] border border-[#E6D4A5]',
      icon: (active) => (
        <svg
          className={`size-4 ${active ? 'text-[#B85D3B]' : 'text-[#63625D]'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
      ),
    },
    {
      id: 'activity',
      label: 'Activity',
      icon: (active) => (
        <svg
          className={`size-4 ${active ? 'text-[#B85D3B]' : 'text-[#63625D]'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
  ]

  const adminNavItems: Array<{
    id: NavigationTab
    label: string
    icon: (active: boolean) => React.ReactNode
  }> = [
    {
      id: 'teams',
      label: 'Teams & members',
      icon: (active) => (
        <svg
          className={`size-4 ${active ? 'text-[#B85D3B]' : 'text-[#63625D]'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      ),
    },
  ]

  const handleNavClick = (id: NavigationTab) => {
    onSelectTab(id)
    setMobileMenuOpen(false)
  }

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="flex items-center justify-between border-b border-[#E2E1DC] bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-[#242520] text-[#F7F7F5]">
            N°
          </span>
          <span className="text-xs font-semibold tracking-wider text-[#242520] uppercase">
            Newtonite Console
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="rounded-md border border-[#E2E1DC] p-1.5 text-[#63625D] hover:bg-[#F7F7F5]"
          aria-label="Toggle navigation menu"
        >
          <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={mobileMenuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'}
            />
          </svg>
        </button>
      </div>

      {/* Main Persistent Sidebar */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } lg:flex shrink-0 flex-col border-b border-[#E2E1DC] bg-white lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:border-r lg:border-b-0 z-30`}
      >
        {/* Brand Header */}
        <div className="flex items-center gap-2.5 border-b border-[#EAE9E4] px-4 py-4 lg:px-5 lg:py-5">
          <div className="flex items-center">
            <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-[#242520] text-[#F7F7F5]">
              N°
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-xs font-bold tracking-[0.14em] text-[#242520] uppercase">
              Newtonite
            </span>
            <span className="block text-[10px] font-medium tracking-widest text-[#63625D] uppercase">
              Operations Console
            </span>
          </div>
        </div>

        {/* Team Selection */}
        <div className="border-b border-[#EAE9E4] px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="team-select"
              className="text-[10px] font-semibold uppercase tracking-widest text-[#63625D]"
            >
              Team
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
              className="w-full h-8 rounded border border-[#E2E1DC] bg-[#F7F7F5] px-2.5 text-xs font-medium text-[#242520] hover:border-[#D5D4CE] focus:outline-none focus:ring-1 focus:ring-[#B85D3B] focus:border-[#B85D3B] transition-colors"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.role})
                </option>
              ))}
            </select>
          ) : currentTeam ? (
            <div className="rounded border border-[#E2E1DC] bg-[#F7F7F5] px-2.5 py-1.5 text-xs font-medium text-[#242520] truncate">
              {currentTeam.name}
            </div>
          ) : (
            <div className="text-xs text-[#9C9A93] italic">No team memberships</div>
          )}
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
          {/* Section: WORKSPACE */}
          <div>
            <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8E8D87]">
              Workspace
            </p>
            <ul className="space-y-0.5">
              {workspaceNavItems.map((item) => {
                const isActive = activeTab === item.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleNavClick(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`relative flex w-full items-center justify-between gap-2 rounded px-2.5 py-2 text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-[#FBF0EA] text-[#9E4C2E] font-semibold'
                          : 'text-[#4A4944] hover:bg-[#F0EFEA] hover:text-[#242520]'
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-[#B85D3B]" />
                      )}
                      <span className="flex items-center gap-2.5">
                        {item.icon(isActive)}
                        <span>{item.label}</span>
                      </span>
                      {typeof item.count === 'number' && item.count > 0 && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                            item.countColor || 'bg-[#EAE9E4] text-[#4A4944]'
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
          </div>

          {/* Section: ADMINISTRATION */}
          <div>
            <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8E8D87]">
              Administration
            </p>
            <ul className="space-y-0.5">
              {adminNavItems.map((item) => {
                const isActive = activeTab === item.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleNavClick(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`relative flex w-full items-center justify-between gap-2 rounded px-2.5 py-2 text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-[#FBF0EA] text-[#9E4C2E] font-semibold'
                          : 'text-[#4A4944] hover:bg-[#F0EFEA] hover:text-[#242520]'
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-[#B85D3B]" />
                      )}
                      <span className="flex items-center gap-2.5">
                        {item.icon(isActive)}
                        <span>{item.label}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        {/* User info & Logout */}
        <div className="border-t border-[#EAE9E4] p-3">
          {user ? (
            <div className="flex items-center gap-2.5">
              <div className="size-7 shrink-0 rounded bg-[#FBF0EA] border border-[#E8C8BC] flex items-center justify-center">
                <span className="text-[11px] font-bold text-[#9E4C2E]">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#242520] truncate leading-tight">
                  {user.name}
                </p>
                <p className="text-[10px] text-[#63625D] truncate">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={logout}
                title="Sign out"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded border border-[#E2E1DC] bg-white text-[#63625D] hover:bg-[#FDF0EE] hover:text-[#A6261E] hover:border-[#F1B8B3] transition-colors"
                aria-label="Sign out"
              >
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              </button>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  )
}
