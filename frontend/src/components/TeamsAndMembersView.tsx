import { useState, useEffect } from 'react'
import { listTeamMembers } from '../api/teams'
import { useAuth } from '../context/useAuth'
import type { TeamMember } from '../types/api'
import { RoleBadge } from './Badges'

export default function TeamsAndMembersView() {
  const { currentTeam, roleInCurrentTeam } = useAuth()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!currentTeam) return
    let unmounted = false

    async function loadMembers() {
      setIsLoading(true)
      setError(null)
      try {
        const data = await listTeamMembers(currentTeam!.id)
        if (!unmounted) setMembers(data)
      } catch (err: unknown) {
        if (!unmounted) {
          setError(err instanceof Error ? err.message : 'Failed to load team members')
        }
      } finally {
        if (!unmounted) setIsLoading(false)
      }
    }

    void loadMembers()
    return () => {
      unmounted = true
    }
  }, [currentTeam])

  return (
    <div className="space-y-6">
      {/* Team Info Header Card */}
      <div className="rounded-lg border border-[#E2E1DC] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#8E8D87]">
                Team Administration
              </span>
              {roleInCurrentTeam && <RoleBadge role={roleInCurrentTeam} />}
            </div>
            <h2 className="text-base font-semibold text-[#242520] mt-1">
              {currentTeam?.name}
            </h2>
            <p className="text-xs text-[#63625D] mt-0.5">
              Authorized team members and operational permission boundaries.
            </p>
          </div>
          <div className="text-xs font-mono text-[#8E8D87]">
            Team ID: {currentTeam?.id}
          </div>
        </div>
      </div>

      {/* Members Table */}
      <div className="rounded-lg border border-[#E2E1DC] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="border-b border-[#EAE9E4] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#63625D]">
            Team Members ({members.length})
          </h3>
          <p className="text-xs text-[#8E8D87] mt-0.5">
            Users who can create, claim, or review operational work items in this team.
          </p>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-3">
            <div className="h-8 w-full bg-[#F7F7F5] rounded animate-pulse" />
            <div className="h-8 w-full bg-[#FAFAF9] rounded animate-pulse" />
            <div className="h-8 w-full bg-[#F7F7F5] rounded animate-pulse" />
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs text-[#A6261E] bg-[#FDF0EE]">
            {error}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="border-b border-[#E2E1DC] bg-[#FAF9F7] text-[10px] font-bold uppercase tracking-wider text-[#8E8D87]">
                <tr>
                  <th className="px-4 py-2.5">Member</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 font-mono text-right">User ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE9E4]">
                {members.map((m) => (
                  <tr key={m.user_id} className="hover:bg-[#FAFAF9] transition-colors">
                    <td className="px-4 py-3 font-medium text-[#242520]">
                      {m.name}
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={m.role} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] ${
                          m.is_active ? 'text-[#2E7D43]' : 'text-[#8E8D87]'
                        }`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${
                            m.is_active ? 'bg-[#2E7D43]' : 'bg-[#8E8D87]'
                          }`}
                        />
                        {m.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-[#8E8D87] text-right">
                      {m.user_id.slice(0, 8)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Role Authority and Permissions Matrix */}
      <div className="rounded-lg border border-[#E2E1DC] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] space-y-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#63625D]">
            Role Permission Matrix
          </h3>
          <p className="text-xs text-[#8E8D87] mt-0.5">
            Role boundaries enforced by the backend authority.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="rounded border border-[#E8C8BC] bg-[#FBF0EA]/40 p-3.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#9E4C2E]">Team Lead</span>
              <span className="font-mono text-[10px] text-[#9E4C2E] uppercase">Full Authority</span>
            </div>
            <p className="text-[#63625D] text-[11px] leading-relaxed">
              Exclusive authority to approve work items in <em>Awaiting Approval</em> status and mark them Resolved.
              Can reassign work items, claim tickets, modify priorities, edit core fields, and close completed records.
            </p>
          </div>

          <div className="rounded border border-[#CFDDF5] bg-[#F3F7FD]/40 p-3.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#2452A1]">Team Member</span>
              <span className="font-mono text-[10px] text-[#2452A1] uppercase">Operator</span>
            </div>
            <p className="text-[#63625D] text-[11px] leading-relaxed">
              Can create new work items, claim unassigned items from the Open queue, transition owned items to In Progress,
              submit completed work for Lead approval, and post operational updates/comments.
            </p>
          </div>

          <div className="rounded border border-[#DFD3ED] bg-[#F7F3FB]/40 p-3.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#5A318F]">Team Admin</span>
              <span className="font-mono text-[10px] text-[#5A318F] uppercase">System Admin</span>
            </div>
            <p className="text-[#63625D] text-[11px] leading-relaxed">
              Manages team configuration, memberships, and user assignments. Holds full administrative authority across team items.
            </p>
          </div>

          <div className="rounded border border-[#E2E1DC] bg-[#F7F7F5] p-3.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#4A4944]">Viewer</span>
              <span className="font-mono text-[10px] text-[#63625D] uppercase">Read Only</span>
            </div>
            <p className="text-[#63625D] text-[11px] leading-relaxed">
              Read-only inspection rights. Can inspect work items, view comments, and audit timeline activity. Cannot modify status, assign, or post comments.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
