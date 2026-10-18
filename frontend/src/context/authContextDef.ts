import { createContext } from 'react'
import type { Role, Team, User } from '../types/api'
import type { RegisterPayload } from '../api/auth'

export interface AuthContextType {
  user: User | null
  token: string | null
  teams: Team[]
  currentTeam: Team | null
  roleInCurrentTeam: Role | null
  isLoading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => void
  setCurrentTeam: (team: Team) => void
  refreshUserData: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)
