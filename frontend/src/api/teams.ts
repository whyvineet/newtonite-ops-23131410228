import { request } from './client'
import type { Team, TeamMember } from '../types/api'

export async function listMyTeams(): Promise<Team[]> {
  return request<Team[]>('/teams', {
    method: 'GET',
  })
}

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  return request<TeamMember[]>(`/teams/${teamId}/members`, {
    method: 'GET',
  })
}
