import { useCallback, useEffect, useMemo, useState } from 'react'
import { listTeamMembers } from './api/teams'
import { listItems } from './api/workItems'
import AppHeader from './components/AppHeader'
import AppSidebar, { type NavigationTab } from './components/AppSidebar'
import CreateWorkItemModal from './components/CreateWorkItemModal'
import LoginScreen from './components/LoginScreen'
import SummaryCard from './components/SummaryCard'
import WorkItemDetailModal from './components/WorkItemDetailModal'
import WorkItemsSection from './components/WorkItemsSection'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/useAuth'
import type { TeamMember, WorkItem } from './types/api'
import { canCreateItem } from './utils/permissions'

type OverviewFilter = 'all' | 'open' | 'in_progress' | 'urgent' | 'awaiting_approval'

function DashboardApp() {
  const { user, token, teams, currentTeam, roleInCurrentTeam, isLoading, logout } =
    useAuth()

  const [activeTab, setActiveTab] = useState<NavigationTab>('overview')
  const [items, setItems] = useState<WorkItem[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [overviewFilter, setOverviewFilter] = useState<OverviewFilter>('all')

  const teamId = currentTeam?.id

  // Initial and team-change load
  useEffect(() => {
    if (!teamId || !token) return
    let unmounted = false

    void Promise.resolve().then(async () => {
      if (unmounted) return
      setIsLoadingData(true)
      setDataError(null)

      try {
        const [itemsRes, membersRes] = await Promise.all([
          listItems({ team_id: teamId, limit: 100 }),
          listTeamMembers(teamId),
        ])
        if (!unmounted) {
          setItems(itemsRes.items)
          setMembers(membersRes)
        }
      } catch (err: unknown) {
        if (!unmounted) {
          const msg = err instanceof Error ? err.message : 'Failed to fetch team data'
          setDataError(msg)
        }
      } finally {
        if (!unmounted) {
          setIsLoadingData(false)
        }
      }
    })

    return () => {
      unmounted = true
    }
  }, [teamId, token])

  // Explicit refresh without clearing view
  const refreshData = useCallback(async () => {
    if (!currentTeam?.id || !token) return
    setIsRefreshing(true)
    setDataError(null)

    try {
      const [itemsRes, membersRes] = await Promise.all([
        listItems({ team_id: currentTeam.id, limit: 100 }),
        listTeamMembers(currentTeam.id),
      ])
      setItems(itemsRes.items)
      setMembers(membersRes)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh data'
      setDataError(msg)
    } finally {
      setIsRefreshing(false)
    }
  }, [currentTeam, token])

  const membersMap = useMemo(() => {
    const map: Record<string, TeamMember> = {}
    for (const m of members) {
      map[m.user_id] = m
    }
    return map
  }, [members])

  // Summary counts calculated from real backend data
  const openCount = items.filter((i) => i.status === 'open').length
  const inProgressCount = items.filter((i) => i.status === 'in_progress').length
  const urgentCount = items.filter(
    (i) =>
      i.priority === 'urgent' && i.status !== 'resolved' && i.status !== 'closed',
  ).length
  const awaitingApprovalCount = items.filter(
    (i) => i.status === 'awaiting_approval',
  ).length
  const myWorkCount = user
    ? items.filter((i) => i.assignee_id === user.id && i.status !== 'closed').length
    : 0

  const summary = [
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
    if (overviewFilter === cardFilter) {
      setOverviewFilter('all')
    } else {
      setOverviewFilter(cardFilter)
    }
  }

  // Filter items for Overview tab
  const overviewVisibleItems = useMemo(() => {
    if (overviewFilter === 'all') return items
    if (overviewFilter === 'open') return items.filter((i) => i.status === 'open')
    if (overviewFilter === 'in_progress')
      return items.filter((i) => i.status === 'in_progress')
    if (overviewFilter === 'urgent')
      return items.filter(
        (i) =>
          i.priority === 'urgent' &&
          i.status !== 'resolved' &&
          i.status !== 'closed',
      )
    if (overviewFilter === 'awaiting_approval')
      return items.filter((i) => i.status === 'awaiting_approval')
    return items
  }, [items, overviewFilter])

  // Items for My Work tab
  const myWorkItems = useMemo(() => {
    if (!user) return []
    return items.filter((i) => i.assignee_id === user.id)
  }, [items, user])

  // Items for Approvals tab
  const approvalItems = useMemo(() => {
    return items.filter((i) => i.status === 'awaiting_approval')
  }, [items])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="inline-block size-8 animate-spin rounded-full border-3 border-slate-300 border-t-accent" />
          <p className="mt-3 text-sm font-medium text-slate-700">
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
        onSelectTab={setActiveTab}
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
                      onClick={() => setOverviewFilter('all')}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      Reset filter
                    </button>
                  )}
                </div>
                <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {summary.map((card) => (
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
                        summary.find((s) => s.filter === overviewFilter)?.label
                      }`
                }
                description={
                  overviewFilter === 'all'
                    ? `Displaying all ${items.length} records for ${currentTeam?.name}. Click any row to view details or perform actions.`
                    : `Showing items matching "${overviewFilter.replace('_', ' ')}".`
                }
                items={overviewVisibleItems}
                members={membersMap}
                isLoading={isLoadingData}
                error={dataError}
                onRetry={() => void refreshData()}
                onSelectItem={(item) => setSelectedItemId(item.id)}
                onCreateItem={() => setIsCreateOpen(true)}
                canCreate={canCreate}
                currentUserId={user.id}
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
                onRetry={() => void refreshData()}
                onSelectItem={(item) => setSelectedItemId(item.id)}
                onCreateItem={() => setIsCreateOpen(true)}
                canCreate={canCreate}
                currentUserId={user.id}
              />
            </div>
          )}

          {/* My Work View */}
          {activeTab === 'my-work' && (
            <div className="space-y-6">
              <WorkItemsSection
                title="Assigned to Me"
                description={`Work items currently assigned to ${user.name} in this team.`}
                items={myWorkItems}
                members={membersMap}
                isLoading={isLoadingData}
                error={dataError}
                onRetry={() => void refreshData()}
                onSelectItem={(item) => setSelectedItemId(item.id)}
                onCreateItem={() => setIsCreateOpen(true)}
                canCreate={canCreate}
                currentUserId={user.id}
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
                items={approvalItems}
                members={membersMap}
                isLoading={isLoadingData}
                error={dataError}
                onRetry={() => void refreshData()}
                onSelectItem={(item) => setSelectedItemId(item.id)}
                onCreateItem={() => setIsCreateOpen(true)}
                canCreate={canCreate}
                currentUserId={user.id}
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
