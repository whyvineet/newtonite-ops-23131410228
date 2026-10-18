import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { getMe, login as apiLogin } from '../api/auth'
import { getStoredToken, setStoredToken } from '../api/client'
import { listMyTeams } from '../api/teams'
import type { Role, Team, User } from '../types/api'
import { AuthContext } from './authContextDef'

const TEAM_STORAGE_KEY = 'newtonite_selected_team_id'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getStoredToken)
  const [user, setUser] = useState<User | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [currentTeam, setCurrentTeamState] = useState<Team | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUserAndTeams = useCallback(async () => {
    try {
      const userData = await getMe()
      setUser(userData)

      const myTeams = await listMyTeams()
      setTeams(myTeams)

      // Restore previously selected team or pick first
      const savedTeamId = localStorage.getItem(TEAM_STORAGE_KEY)
      const matchingTeam = myTeams.find((t) => t.id === savedTeamId) || myTeams[0] || null
      setCurrentTeamState(matchingTeam)
      setError(null)
    } catch {
      // Token expired or invalid
      setStoredToken(null)
      setToken(null)
      setUser(null)
      setTeams([])
      setCurrentTeamState(null)
    }
  }, [])

  useEffect(() => {
    let unmounted = false

    async function init() {
      const existingToken = getStoredToken()
      if (existingToken) {
        try {
          await fetchUserAndTeams()
        } catch {
          if (!unmounted) setError('Failed to restore session')
        }
      }
      if (!unmounted) setIsLoading(false)
    }

    void init()

    return () => {
      unmounted = true
    }
  }, [fetchUserAndTeams])

  const login = async (email: string, password: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await apiLogin(email, password)
      setStoredToken(res.access_token)
      setToken(res.access_token)
      await fetchUserAndTeams()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed'
      setError(msg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    setStoredToken(null)
    setToken(null)
    setUser(null)
    setTeams([])
    setCurrentTeamState(null)
    localStorage.removeItem(TEAM_STORAGE_KEY)
  }

  const setCurrentTeam = (team: Team) => {
    setCurrentTeamState(team)
    try {
      localStorage.setItem(TEAM_STORAGE_KEY, team.id)
    } catch {
      // ignore
    }
  }

  const roleInCurrentTeam: Role | null = currentTeam?.role || null

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        teams,
        currentTeam,
        roleInCurrentTeam,
        isLoading,
        error,
        login,
        logout,
        setCurrentTeam,
        refreshUserData: fetchUserAndTeams,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
