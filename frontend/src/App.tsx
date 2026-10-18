import { useCallback, useEffect, useMemo, useState } from 'react'
import { listTeamMembers } from './api/teams'
import { getDashboard, getDashboardSummary, listItems } from './api/workItems'
import AppHeader from './components/AppHeader'
import AppSidebar, { type NavigationTab } from './components/AppSidebar'
import CreateWorkItemModal from './components/CreateWorkItemModal'
import LoginScreen from './components/LoginScreen'
import SummaryCard from './components/SummaryCard'
import WorkItemDetailModal from './components/WorkItemDetailModal'
import WorkItemsSection from './components/WorkItemsSection'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/useAuth'
import type { DashboardSummary, ItemType, Priority, Status, TeamMember, WorkItem } from './types/api'
import { canCreateItem } from './utils/permissions'

type OverviewFilter = 'all' | 'open' | 'in_progress' | 'urgent' | 'awaiting_approval'

function DashboardApp() {
  const { user, token, teams, currentTeam, roleInCurrentTeam, isLoading, logout } =
    useAuth()

  const [activeTab, setActiveTab] = useState<NavigationTab>('overview')
  const [members, setMembers] = useState<TeamMember[]>([])
  const [summary, setSummary] = useState<DashboardSummary | null>(null)

  // Current tab items & cursor pagination
  const [items, setItems] = useState<WorkItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([])
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(undefined)
  const [pageIndex, setPageIndex] = useState<number>(0)

  // Server-side filters
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all')
  const [overviewFilter, setOverviewFilter] = useState<OverviewFilter>('all')

  const [isLoadingData, setIsLoadingData] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const teamId = currentTeam?.id
  const currentUserId = user?.id

  // Fetch summary counts and team members
  const fetchSummaryAndMembers = useCallback(async () => {
    if (!teamId || !token) return
    try {
      const [membersRes, summaryRes] = await Promise.all([
        listTeamMembers(teamId),
        getDashboardSummary(teamId),
      ])
      setMembers(membersRes)
      setSummary(summaryRes)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch team data'
      setDataError(msg)
    }
  }, [teamId, token])

  // Fetch current page of items for the active view and cursor
  const fetchItems = useCallback(
    async (cursor?: string) => {
      if (!teamId || !token) return
      setIsLoadingData(true)
      setDataError(null)

      try {
        const q = searchQuery.trim() || undefined
        const p = priorityFilter !== 'all' ? priorityFilter : undefined
        const t = typeFilter !== 'all' ? typeFilter : undefined

        let pageItems: WorkItem[] = []
        let pageNextCursor: string | null = null

        if (activeTab === 'overview') {
          let s: Status | undefined = statusFilter !== 'all' ? statusFilter : undefined
          let priority = p
          if (overviewFilter === 'open') s = 'open'
          else if (overviewFilter === 'in_progress') s = 'in_progress'
          else if (overviewFilter === 'awaiting_approval') s = 'awaiting_approval'
          else if (overviewFilter === 'urgent') priority = 'urgent'

          const res = await listItems({
            team_id: teamId,
            status: s,
            priority,
            type: t,
            q,
            cursor,
            limit: 25,
          })
          pageItems = res.items
          pageNextCursor = res.next_cursor
        } else if (activeTab === 'work-items') {
          const s = statusFilter !== 'all' ? statusFilter : undefined
          const res = await listItems({
            team_id: teamId,
            status: s,
            priority: p,
            type: t,
            q,
            cursor,
            limit: 25,
          })
          pageItems = res.items
          pageNextCursor = res.next_cursor
        } else if (activeTab === 'my-work') {
          // Use existing dashboard endpoint if no custom filters are applied
          if (!q && statusFilter === 'all' && priorityFilter === 'all' && typeFilter === 'all') {
            const res = await getDashboard('assigned_to_me', {
              team_id: teamId,
              cursor,
              limit: 25,
            })
            pageItems = res.items
            pageNextCursor = res.next_cursor
          } else {
            const s = statusFilter !== 'all' ? statusFilter : undefined
            const res = await listItems({
              team_id: teamId,
              assignee_id: currentUserId,
              status: s,
              priority: p,
              type: t,
              q,
              cursor,
              limit: 25,
            })
            pageItems = res.items
            pageNextCursor = res.next_cursor
          }
        } else if (activeTab === 'approvals') {
          // Use existing dashboard endpoint for lead approval queue
          if (!q && statusFilter === 'all' && priorityFilter === 'all' && typeFilter === 'all') {
            const res = await getDashboard('awaiting_my_approval', {
              team_id: teamId,
              cursor,
              limit: 25,
            })
            pageItems = res.items
            pageNextCursor = res.next_cursor
          } else {
            const res = await listItems({
              team_id: teamId,
              status: 'awaiting_approval',
              priority: p,
              type: t,
              q,
              cursor,
              limit: 25,
            })
            pageItems = res.items
            pageNextCursor = res.next_cursor
          }
        }

        setItems(pageItems)
        setNextCursor(pageNextCursor)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch work items'
        setDataError(msg)
      } finally {
        setIsLoadingData(false)
      }
    },
    [
      teamId,
      token,
      activeTab,
      overviewFilter,
      searchQuery,
      statusFilter,
      priorityFilter,
      typeFilter,
      currentUserId,
    ],
  )

  // Fetch summary and members when team or token changes
  useEffect(() => {
    if (!teamId || !token) return
    let unmounted = false
    void Promise.resolve().then(async () => {
      if (unmounted) return
      await fetchSummaryAndMembers()
    })
    return () => {
      unmounted = true
    }
  }, [teamId, token, fetchSummaryAndMembers])

  // Fetch items when current cursor changes
  useEffect(() => {
    if (!teamId || !token) return
    let unmounted = false
    void Promise.resolve().then(async () => {
      if (unmounted) return
      await fetchItems(currentCursor)
    })
    return () => {
      unmounted = true
    }
  }, [teamId, token, currentCursor, fetchItems])


  // Explicit refresh without clearing view
  const refreshData = useCallback(async () => {
    if (!currentTeam?.id || !token) return
    setIsRefreshing(true)
    try {
      await Promise.all([fetchSummaryAndMembers(), fetchItems(currentCursor)])
    } finally {
      setIsRefreshing(false)
    }
  }, [currentTeam, token, fetchSummaryAndMembers, fetchItems, currentCursor])

  const membersMap = useMemo(() => {
    const map: Record<string, TeamMember> = {}
    for (const m of members) {
      map[m.user_id] = m
    }
    return map
  }, [members])

  // Summary counts calculated across complete dataset in PostgreSQL
  const openCount = summary?.open ?? 0
  const inProgressCount = summary?.in_progress ?? 0
  const urgentCount = summary?.urgent ?? 0
  const awaitingApprovalCount = summary?.awaiting_approval ?? 0
  const myWorkCount = summary?.assigned_to_me ?? 0

  const summaryCards = [
    {
      key: 'open' as const,
      label: 'Open',
      value: openCount,
      hint: 'Not yet started',
      filter: 'open' as const,
    },
    {
      key: 'in_progress' as const,
      label: 'In progress',
      value: inProgressCount,
      hint: 'Actively being worked',
      filter: 'in_progress' as const,
    },
    {
      key: 'urgent' as const,
      label: 'Urgent',
      value: urgentCount,
      hint: 'Excludes resolved and closed',
      filter: 'urgent' as const,
    },
    {
      key: 'awaiting_approval' as const,
      label: 'Awaiting approval',
      value: awaitingApprovalCount,
      hint: 'Blocked on a decision',
      filter: 'awaiting_approval' as const,
    },
  ]

  const handleCardClick = (cardFilter: OverviewFilter) => {
    setOverviewFilter(overviewFilter === cardFilter ? 'all' : cardFilter)
    setCursorStack([])
    setCurrentCursor(undefined)
    setPageIndex(0)
  }

  const handleSelectTab = (tab: NavigationTab) => {
    setActiveTab(tab)
    setSearchQuery('')
    setStatusFilter('all')
    setPriorityFilter('all')
    setTypeFilter('all')
    setOverviewFilter('all')
    setCursorStack([])
    setCurrentCursor(undefined)
    setPageIndex(0)
  }

  const handleSearchChange = (q: string) => {
    setSearchQuery(q)
    setCursorStack([])
    setCurrentCursor(undefined)
    setPageIndex(0)
  }

  const handleStatusChange = (s: Status | 'all') => {
    setStatusFilter(s)
    setCursorStack([])
    setCurrentCursor(undefined)
    setPageIndex(0)
  }

  const handlePriorityChange = (p: Priority | 'all') => {
    setPriorityFilter(p)
    setCursorStack([])
    setCurrentCursor(undefined)
    setPageIndex(0)
  }

  const handleTypeChange = (t: ItemType | 'all') => {
    setTypeFilter(t)
    setCursorStack([])
    setCurrentCursor(undefined)
    setPageIndex(0)
  }

  const handleClearFilters = () => {
    setSearchQuery('')
    setStatusFilter('all')
    setPriorityFilter('all')
    setTypeFilter('all')
    setOverviewFilter('all')
    setCursorStack([])
    setCurrentCursor(undefined)
    setPageIndex(0)
  }

  const handleNextPage = () => {
    if (!nextCursor) return
    setCursorStack((prev) => [...prev, currentCursor])
    setCurrentCursor(nextCursor)
    setPageIndex((prev) => prev + 1)
  }

  const handlePrevPage = () => {
    if (pageIndex <= 0) return
    const prevCursor = cursorStack[cursorStack.length - 1]
    setCursorStack((prev) => prev.slice(0, -1))
    setCurrentCursor(prevCursor)
    setPageIndex((prev) => prev - 1)
  }

  // Calculate total count for the current view if known across complete dataset
  const totalCountForCurrentView = useMemo(() => {
    if (!summary) return undefined
    const hasCustomFilters =
      searchQuery.trim() !== '' ||
      priorityFilter !== 'all' ||
      typeFilter !== 'all'

    if (activeTab === 'overview') {
      if (hasCustomFilters) return undefined
      if (overviewFilter === 'open') return summary.open
      if (overviewFilter === 'in_progress') return summary.in_progress
      if (overviewFilter === 'urgent') return summary.urgent
      if (overviewFilter === 'awaiting_approval') return summary.awaiting_approval
      if (statusFilter !== 'all') return undefined
      return summary.total
    }
    if (activeTab === 'work-items') {
      if (hasCustomFilters || statusFilter !== 'all') return undefined
      return summary.total
    }
    if (activeTab === 'my-work') {
      if (hasCustomFilters || statusFilter !== 'all') return undefined
      return summary.assigned_to_me
    }
    if (activeTab === 'approvals') {
      if (hasCustomFilters || statusFilter !== 'all') return undefined
      return summary.awaiting_approval
    }
    return undefined
  }, [summary, activeTab, overviewFilter, searchQuery, statusFilter, priorityFilter, typeFilter])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3 flex items-center justify-center">
            <img
              src="/logo.webp"
              alt="Newtonite logo"
              className="size-14 rounded-2xl object-contain shadow-md ring-1 ring-slate-900/10 animate-pulse"
            />
          </div>
          <p className="text-sm font-medium text-slate-700">
            Initializing Newtonite session…
          </p>
        </div>
      </div>
    )
  }

  if (!user || !token) {
    return <LoginScreen />
  }

  if (teams.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-md">
          <img
            src="/logo.webp"
            alt="Newtonite logo"
            className="mx-auto size-12 rounded-xl object-contain shadow-sm mb-4 ring-1 ring-slate-900/10"
          />
          <h2 className="text-lg font-semibold text-slate-900">
            No Team Memberships
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Your account ({user.email}) is not currently assigned to any operations
            team. Please contact your administrator for access.
          </p>
          <button
            type="button"
            onClick={logout}
            className="mt-6 inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  const canCreate = canCreateItem(roleInCurrentTeam)

  const viewMetadata: Record<
    NavigationTab,
    { title: string; description: string }
  > = {
    overview: {
      title: 'Operations Overview',
      description: 'Real-time work items and operational queue health.',
    },
    'work-items': {
      title: 'Work Items',
      description: 'Search, filter, and manage all team tickets and incidents.',
    },
    'my-work': {
      title: 'My Work',
      description: 'Tasks and incidents assigned to you in the active team.',
    },
    approvals: {
      title: 'Approvals Queue',
      description: 'Items requiring review and sign-off before resolution.',
    },
  }

  const currentMeta = viewMetadata[activeTab]

  return (
    <div className="min-h-screen lg:flex bg-slate-50/50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-strong focus:shadow"
      >
        Skip to main content
      </a>

      <AppSidebar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        myWorkCount={myWorkCount}
        approvalsCount={awaitingApprovalCount}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          title={currentMeta.title}
          description={currentMeta.description}
          canCreate={canCreate}
          onCreateItem={() => setIsCreateOpen(true)}
          onRefresh={() => void refreshData()}
          isRefreshing={isRefreshing}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className="w-full max-w-7xl space-y-6 px-4 py-6 focus:outline-none sm:px-6 lg:px-8"
        >
          {/* Overview View */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <section aria-labelledby="summary-heading">
                <div className="flex items-center justify-between pb-2">
                  <h2
                    id="summary-heading"
                    className="text-xs font-semibold tracking-wider text-slate-500 uppercase"
                  >
                    Team Summary &middot; Click card to filter
                  </h2>
                  {overviewFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => handleCardClick('all')}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      Reset filter
                    </button>
                  )}
                </div>
                <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {summaryCards.map((card) => (
                    <SummaryCard
                      key={card.key}
                      label={card.label}
                      value={card.value}
                      hint={card.hint}
                      isActive={overviewFilter === card.filter}
                      onClick={() => handleCardClick(card.filter)}
                    />
                  ))}
                </ul>
              </section>

              <WorkItemsSection
                title={
                  overviewFilter === 'all'
                    ? 'All Active Work Items'
                    : `Filtered: ${
                        summaryCards.find((s) => s.filter === overviewFilter)?.label
                      }`
                }
                description={
                  overviewFilter === 'all'
                    ? `Displaying records for ${currentTeam?.name}. Click any row to view details or perform actions.`
                    : `Showing items matching "${overviewFilter.replace('_', ' ')}".`
                }
                items={items}
                members={membersMap}
                isLoading={isLoadingData}
                error={dataError}
                onRetry={() => void fetchItems(currentCursor)}
                onSelectItem={(item) => setSelectedItemId(item.id)}
                onCreateItem={() => setIsCreateOpen(true)}
                canCreate={canCreate}
                currentUserId={user.id}
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
                statusFilter={statusFilter}
                onStatusChange={handleStatusChange}
                priorityFilter={priorityFilter}
                onPriorityChange={handlePriorityChange}
                typeFilter={typeFilter}
                onTypeChange={handleTypeChange}
                onClearFilters={handleClearFilters}
                hideStatusFilter={overviewFilter !== 'all'}
                hasNextPage={Boolean(nextCursor)}
                hasPrevPage={pageIndex > 0}
                onNextPage={handleNextPage}
                onPrevPage={handlePrevPage}
                pageIndex={pageIndex}
                totalCount={totalCountForCurrentView}
              />
            </div>
          )}

          {/* Work Items View */}
          {activeTab === 'work-items' && (
            <div className="space-y-6">
              <WorkItemsSection
                title="All Work Items"
                description={`Complete catalog of records for ${currentTeam?.name}.`}
                items={items}
                members={membersMap}
                isLoading={isLoadingData}
                error={dataError}
                onRetry={() => void fetchItems(currentCursor)}
                onSelectItem={(item) => setSelectedItemId(item.id)}
                onCreateItem={() => setIsCreateOpen(true)}
                canCreate={canCreate}
                currentUserId={user.id}
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
                statusFilter={statusFilter}
                onStatusChange={handleStatusChange}
                priorityFilter={priorityFilter}
                onPriorityChange={handlePriorityChange}
                typeFilter={typeFilter}
                onTypeChange={handleTypeChange}
                onClearFilters={handleClearFilters}
                hideStatusFilter={false}
                hasNextPage={Boolean(nextCursor)}
                hasPrevPage={pageIndex > 0}
                onNextPage={handleNextPage}
                onPrevPage={handlePrevPage}
                pageIndex={pageIndex}
                totalCount={totalCountForCurrentView}
              />
            </div>
          )}

          {/* My Work View */}
          {activeTab === 'my-work' && (
            <div className="space-y-6">
              <WorkItemsSection
                title="Assigned to Me"
                description={`Work items currently assigned to ${user.name} in this team.`}
                items={items}
                members={membersMap}
                isLoading={isLoadingData}
                error={dataError}
                onRetry={() => void fetchItems(currentCursor)}
                onSelectItem={(item) => setSelectedItemId(item.id)}
                onCreateItem={() => setIsCreateOpen(true)}
                canCreate={canCreate}
                currentUserId={user.id}
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
                statusFilter={statusFilter}
                onStatusChange={handleStatusChange}
                priorityFilter={priorityFilter}
                onPriorityChange={handlePriorityChange}
                typeFilter={typeFilter}
                onTypeChange={handleTypeChange}
                onClearFilters={handleClearFilters}
                hideStatusFilter={false}
                hasNextPage={Boolean(nextCursor)}
                hasPrevPage={pageIndex > 0}
                onNextPage={handleNextPage}
                onPrevPage={handlePrevPage}
                pageIndex={pageIndex}
                totalCount={totalCountForCurrentView}
              />
            </div>
          )}

          {/* Approvals View */}
          {activeTab === 'approvals' && (
            <div className="space-y-6">
              {roleInCurrentTeam === 'lead' ? (
                <div
                  role="status"
                  className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-xs text-indigo-900"
                >
                  <p className="font-semibold text-sm">Team Lead Approval Authority</p>
                  <p className="mt-0.5">
                    As a Lead in <strong>{currentTeam?.name}</strong>, you have
                    exclusive authority to approve items and resolve them. Click any
                    item below to inspect and approve.
                  </p>
                </div>
              ) : (
                <div
                  role="status"
                  className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"
                >
                  <p className="font-semibold text-sm">Lead-Only Approvals</p>
                  <p className="mt-0.5">
                    Your role is <strong>{roleInCurrentTeam}</strong>. Only Team Leads
                    can grant approval on work items. You can view the items
                    awaiting decision below.
                  </p>
                </div>
              )}

              <WorkItemsSection
                title="Items Awaiting Approval"
                description="Pending operational sign-off before resolution."
                items={items}
                members={membersMap}
                isLoading={isLoadingData}
                error={dataError}
                onRetry={() => void fetchItems(currentCursor)}
                onSelectItem={(item) => setSelectedItemId(item.id)}
                onCreateItem={() => setIsCreateOpen(true)}
                canCreate={canCreate}
                currentUserId={user.id}
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
                statusFilter={statusFilter}
                onStatusChange={handleStatusChange}
                priorityFilter={priorityFilter}
                onPriorityChange={handlePriorityChange}
                typeFilter={typeFilter}
                onTypeChange={handleTypeChange}
                onClearFilters={handleClearFilters}
                hideStatusFilter={true}
                hasNextPage={Boolean(nextCursor)}
                hasPrevPage={pageIndex > 0}
                onNextPage={handleNextPage}
                onPrevPage={handlePrevPage}
                pageIndex={pageIndex}
                totalCount={totalCountForCurrentView}
              />
            </div>
          )}
        </main>
      </div>

      {/* Item Detail Modal */}
      {selectedItemId && (
        <WorkItemDetailModal
          itemId={selectedItemId}
          onClose={() => setSelectedItemId(null)}
          onItemUpdated={() => void refreshData()}
        />
      )}

      {/* Create Item Modal */}
      {isCreateOpen && currentTeam && (
        <CreateWorkItemModal
          teamId={currentTeam.id}
          teamMembers={members}
          onClose={() => setIsCreateOpen(false)}
          onItemCreated={() => {
            setIsCreateOpen(false)
            void refreshData()
          }}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <DashboardApp />
    </AuthProvider>
  )
}
