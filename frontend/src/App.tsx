import { useCallback, useEffect, useMemo, useState } from 'react'
import { listTeamMembers } from './api/teams'
import { getDashboard, getDashboardSummary, listItems } from './api/workItems'
import ActivityFeedView from './components/ActivityFeedView'
import AppHeader from './components/AppHeader'
import AppSidebar, { type NavigationTab } from './components/AppSidebar'
import CreateWorkItemModal from './components/CreateWorkItemModal'
import LoginScreen from './components/LoginScreen'
import SummaryCard from './components/SummaryCard'
import TeamsAndMembersView from './components/TeamsAndMembersView'
import WorkItemDetailModal from './components/WorkItemDetailModal'
import WorkItemsSection from './components/WorkItemsSection'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/useAuth'
import type { DashboardSummary, ItemType, Priority, Status, TeamMember, WorkItem } from './types/api'
import { canCreateItem } from './utils/permissions'

type OverviewFilter =
  | 'all'
  | 'unassigned_urgent'
  | 'awaiting_approval'
  | 'in_progress'
  | 'open'
  | 'urgent'

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
          if (overviewFilter === 'unassigned_urgent' && !q && priorityFilter === 'all' && typeFilter === 'all') {
            const res = await getDashboard('unassigned_urgent', {
              team_id: teamId,
              cursor,
              limit: 25,
            })
            pageItems = res.items
            pageNextCursor = res.next_cursor
          } else if (overviewFilter === 'awaiting_approval' && !q && priorityFilter === 'all' && typeFilter === 'all') {
            const res = await getDashboard('awaiting_my_approval', {
              team_id: teamId,
              cursor,
              limit: 25,
            })
            pageItems = res.items
            pageNextCursor = res.next_cursor
          } else {
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
          }
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

  // Operational metrics
  const unassignedUrgentCount = summary?.unassigned_urgent ?? 0
  const awaitingApprovalCount = summary?.awaiting_approval ?? 0
  const inProgressCount = summary?.in_progress ?? 0
  const myWorkCount = summary?.assigned_to_me ?? 0

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

  const totalCountForCurrentView = useMemo(() => {
    if (!summary) return undefined
    const hasCustomFilters =
      searchQuery.trim() !== '' ||
      priorityFilter !== 'all' ||
      typeFilter !== 'all'

    if (activeTab === 'overview') {
      if (hasCustomFilters) return undefined
      if (overviewFilter === 'unassigned_urgent') return summary.unassigned_urgent
      if (overviewFilter === 'awaiting_approval') return summary.awaiting_approval
      if (overviewFilter === 'in_progress') return summary.in_progress
      if (overviewFilter === 'open') return summary.open
      if (overviewFilter === 'urgent') return summary.urgent
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
      <div className="flex min-h-screen items-center justify-center bg-[#F7F7F5]">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="flex items-center justify-center">
            <span className="font-mono text-base font-bold px-2.5 py-1 rounded bg-[#242520] text-[#F7F7F5] tracking-tight">
              N°
            </span>
          </div>
          <p className="font-mono text-[11px] font-semibold tracking-widest text-[#8E8D87] uppercase">
            Initializing Session &middot; Operational Precision
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
      <div className="flex min-h-screen items-center justify-center bg-[#F7F7F5] p-4">
        <div className="w-full max-w-sm rounded-lg border border-[#E2E1DC] bg-white p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="mb-3 flex items-center justify-center">
            <span className="font-mono text-sm font-bold px-2 py-0.5 rounded bg-[#242520] text-[#F7F7F5]">
              N°
            </span>
          </div>
          <h2 className="text-sm font-semibold text-[#242520]">No Team Memberships</h2>
          <p className="mt-2 text-xs text-[#63625D] leading-normal">
            Your account ({user.email}) is not currently assigned to any operations
            team. Please contact your system administrator for access.
          </p>
          <button
            type="button"
            onClick={logout}
            className="mt-5 inline-flex items-center rounded border border-[#E2E1DC] bg-[#242520] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-black transition-colors"
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
    { title: string; description: string; category: string }
  > = {
    overview: {
      title: 'Overview',
      description: 'See what needs attention and move work forward.',
      category: 'OPERATIONS',
    },
    'work-items': {
      title: 'Work items',
      description: 'Catalog of team incidents, tasks, and operational requests.',
      category: 'WORKSPACE',
    },
    'my-work': {
      title: 'Assigned to me',
      description: `Active work items assigned to ${user.name} in this team.`,
      category: 'WORKSPACE',
    },
    approvals: {
      title: 'Approval queue',
      description: 'Operational items requiring sign-off before resolution.',
      category: 'DECISIONS',
    },
    activity: {
      title: 'Activity stream',
      description: 'Audit log of assignments, transitions, and status updates.',
      category: 'AUDIT',
    },
    teams: {
      title: 'Teams & members',
      description: 'Operational team members and role authority rules.',
      category: 'ADMINISTRATION',
    },
  }

  const currentMeta = viewMetadata[activeTab]

  return (
    <div className="min-h-screen lg:flex bg-[#F7F7F5] text-[#242520]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-[#242520] focus:px-3 focus:py-1.5 focus:text-xs focus:font-medium focus:text-[#F7F7F5]"
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
          category={currentMeta.category}
          canCreate={canCreate}
          onCreateItem={() => setIsCreateOpen(true)}
          onRefresh={() => void refreshData()}
          isRefreshing={isRefreshing}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className="w-full max-w-7xl space-y-6 px-4 py-5 focus:outline-none sm:px-6 lg:px-8"
        >
          {/* Overview View (Screen 01) */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Needs Attention Section */}
              <section aria-labelledby="needs-attention-heading">
                <div className="flex items-center justify-between pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-block size-1.5 rounded-full bg-[#B85D3B]" />
                    <h2
                      id="needs-attention-heading"
                      className="text-[11px] font-bold tracking-[0.14em] text-[#8E8D87] uppercase"
                    >
                      Needs Attention
                    </h2>
                  </div>
                  {overviewFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => handleCardClick('all')}
                      className="text-xs font-medium text-[#B85D3B] hover:underline"
                    >
                      Reset filter
                    </button>
                  )}
                </div>

                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <SummaryCard
                    label="Unassigned urgent"
                    value={unassignedUrgentCount}
                    hint="Items needing an owner"
                    highlight={unassignedUrgentCount > 0}
                    isActive={overviewFilter === 'unassigned_urgent'}
                    onClick={() => handleCardClick('unassigned_urgent')}
                  />
                  <SummaryCard
                    label="Awaiting approval"
                    value={awaitingApprovalCount}
                    hint="Items blocked on a decision"
                    highlight={awaitingApprovalCount > 0}
                    isActive={overviewFilter === 'awaiting_approval'}
                    onClick={() => handleCardClick('awaiting_approval')}
                  />
                  <SummaryCard
                    label="In progress"
                    value={inProgressCount}
                    hint="Actively moving forward"
                    isActive={overviewFilter === 'in_progress'}
                    onClick={() => handleCardClick('in_progress')}
                  />
                  <SummaryCard
                    label="Assigned to me"
                    value={myWorkCount}
                    hint="Your personal queue"
                    isActive={overviewFilter === 'all'}
                    onClick={() => handleSelectTab('my-work')}
                  />
                </ul>
              </section>

              {/* Work Items Table Section */}
              <WorkItemsSection
                title={
                  overviewFilter === 'all'
                    ? 'Recent Work Items'
                    : overviewFilter === 'unassigned_urgent'
                    ? 'Unassigned Urgent Work Items'
                    : overviewFilter === 'awaiting_approval'
                    ? 'Items Awaiting Approval'
                    : `Filtered: ${overviewFilter.replace('_', ' ')}`
                }
                description={
                  overviewFilter === 'all'
                    ? `Records for ${currentTeam?.name}. Click any record to inspect status, assign, or transition.`
                    : `Displaying records filtered by "${overviewFilter.replace('_', ' ')}".`
                }
                items={items}
                members={membersMap}
                isLoading={isLoadingData}
                error={dataError}
                onRetry={() => void fetchItems(currentCursor)}
                onSelectItem={(item) => {
                  setSelectedItemId(item.id)
                }}
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

          {/* Work Items View (Screen 02) */}
          {activeTab === 'work-items' && (
            <div className="space-y-6">
              <WorkItemsSection
                title="All Work Items"
                description={`Complete operational catalog for ${currentTeam?.name}.`}
                items={items}
                members={membersMap}
                isLoading={isLoadingData}
                error={dataError}
                onRetry={() => void fetchItems(currentCursor)}
                onSelectItem={(item) => {
                  setSelectedItemId(item.id)
                }}
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
                onSelectItem={(item) => {
                  setSelectedItemId(item.id)
                }}
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

          {/* Approvals View (Screen 04) */}
          {activeTab === 'approvals' && (
            <div className="space-y-6">
              {roleInCurrentTeam === 'lead' ? (
                <div
                  role="status"
                  className="rounded-lg border border-[#E8C8BC] bg-[#FBF0EA] p-4 text-xs text-[#9E4C2E]"
                >
                  <p className="font-semibold text-xs text-[#9E4C2E] uppercase tracking-wider">
                    Team Lead Approval Authority
                  </p>
                  <p className="mt-1 text-[#63625D] leading-normal">
                    As a Lead in <strong>{currentTeam?.name}</strong>, you have
                    exclusive authority to approve items and resolve them. Inspect items below to review work and sign off.
                  </p>
                </div>
              ) : (
                <div
                  role="status"
                  className="rounded-lg border border-[#E6D4A5] bg-[#FDF8EB] p-4 text-xs text-[#855D10]"
                >
                  <p className="font-semibold text-xs text-[#855D10] uppercase tracking-wider">
                    Lead-Only Approval Authority
                  </p>
                  <p className="mt-1 text-[#63625D] leading-normal">
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
                onSelectItem={(item) => {
                  setSelectedItemId(item.id)
                }}
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

          {/* Activity Stream View */}
          {activeTab === 'activity' && (
            <ActivityFeedView
              onSelectItem={(item) => {
                setSelectedItemId(item.id)
              }}
            />
          )}

          {/* Teams & Members View */}
          {activeTab === 'teams' && <TeamsAndMembersView />}
        </main>
      </div>

      {/* Item Detail Modal (Screen 03) */}
      {selectedItemId && (
        <WorkItemDetailModal
          itemId={selectedItemId}
          onClose={() => {
            setSelectedItemId(null)
          }}
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
