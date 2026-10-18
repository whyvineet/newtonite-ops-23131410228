import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { getMe, login as apiLogin, register as apiRegister, type RegisterPayload } from '../api/auth'
import { ApiClientError, getStoredToken, setStoredToken } from '../api/client'
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
  const [teamsError, setTeamsError] = useState<string | null>(null)

  const clearSession = useCallback(() => {
    setStoredToken(null)
    setToken(null)
    setUser(null)
    setTeams([])
    setCurrentTeamState(null)
    try {
      localStorage.removeItem(TEAM_STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  const fetchUserAndTeams = useCallback(async () => {
    setError(null)
    setTeamsError(null)

    // Step 1: Fetch current authenticated user
    let userData: User
    try {
      userData = await getMe()
      setUser(userData)
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.status === 401) {
        // Confirmed invalid or expired session -> clear credentials
        clearSession()
        setError('Session expired or not authenticated. Please log in.')
        return
      }
      // Recoverable error: network error, timeout, 5xx server error
      const msg = err instanceof Error ? err.message : 'Failed to connect to backend server'
      setError(msg)
      throw err
    }

    // Step 2: Fetch user's team memberships (distinguished from user profile)
    try {
      const myTeams = await listMyTeams()
      setTeams(myTeams)

      // Restore previously selected team or pick first
      const savedTeamId = localStorage.getItem(TEAM_STORAGE_KEY)
      const matchingTeam = myTeams.find((t) => t.id === savedTeamId) || myTeams[0] || null
      setCurrentTeamState(matchingTeam)
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.status === 401) {
        clearSession()
        setError('Session expired while loading teams. Please log in.')
        return
      }
      const msg = err instanceof Error ? err.message : 'Failed to load team memberships'
      setTeamsError(msg)
      throw err
    }
  }, [clearSession])

  useEffect(() => {
    let unmounted = false

    async function init() {
      const existingToken = getStoredToken()
      if (existingToken) {
        try {
          await fetchUserAndTeams()
        } catch {
          // Recoverable error is preserved in error/teamsError state without logging out
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
    setTeamsError(null)
    try {
      const res = await apiLogin(email, password)
      setStoredToken(res.access_token)
      setToken(res.access_token)
      try {
        await fetchUserAndTeams()
      } catch (initErr: unknown) {
        const msg = initErr instanceof Error ? initErr.message : 'Initialization failed'
        setError(`Authenticated, but failed to load workspace: ${msg}. Click retry to reconnect.`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed'
      setError(msg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const register = async (payload: RegisterPayload) => {
    setIsLoading(true)
    setError(null)
    setTeamsError(null)
    try {
      const res = await apiRegister(payload)
      setStoredToken(res.access_token)
      setToken(res.access_token)
      try {
        await fetchUserAndTeams()
      } catch (initErr: unknown) {
        const msg = initErr instanceof Error ? initErr.message : 'Initialization failed'
        setError(`Registered successfully, but failed to load workspace: ${msg}. Click retry to reconnect.`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed'
      setError(msg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    clearSession()
    setError(null)
    setTeamsError(null)
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
        teamsError,
        login,
        register,
        logout,
        setCurrentTeam,
        refreshUserData: fetchUserAndTeams,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
