import { useState } from 'react'
import { useAuth } from '../context/useAuth'
import BackendStatus from './BackendStatus'

type AuthMode = 'login' | 'register'

export default function LoginScreen() {
  const { login, register, isLoading, error } = useAuth()
  const [mode, setMode] = useState<AuthMode>('login')

  // Shared fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Register fields
  const [name, setName] = useState('')
  const [teamName, setTeamName] = useState('Platform Ops')
  const [role, setRole] = useState<'lead' | 'admin' | 'member' | 'viewer'>('lead')

  const [formError, setFormError] = useState<string | null>(null)

  const handleSwitchMode = (newMode: AuthMode) => {
    setMode(newMode)
    setFormError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (mode === 'login') {
      if (!email.trim() || !password) {
        setFormError('Please enter both email and password.')
        return
      }
      try {
        await login(email.trim(), password)
      } catch {
        // Error is set in AuthContext
      }
    } else {
      if (!name.trim()) {
        setFormError('Please enter your full name.')
        return
      }
      if (!email.trim() || !password) {
        setFormError('Please enter both email and password.')
        return
      }
      if (password.length < 6) {
        setFormError('Password must be at least 6 characters long.')
        return
      }
      if (!teamName.trim()) {
        setFormError('Please specify a team name.')
        return
      }
      try {
        await register({
          name: name.trim(),
          email: email.trim(),
          password,
          team_name: teamName.trim(),
          role,
        })
      } catch {
        // Error is set in AuthContext
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <img
            src="/logo.webp"
            alt="Newtonite logo"
            className="size-16 rounded-2xl object-contain shadow-md ring-1 ring-slate-900/10"
          />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
            Operations Under Pressure
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {mode === 'login'
              ? 'Sign in with your team credentials'
              : 'Create a new user account and team'}
          </p>
          <div className="mt-2">
            <BackendStatus />
          </div>
        </div>

        {/* Mode switcher tabs */}
        <div className="flex rounded-lg bg-slate-100 p-1 border border-slate-200">
          <button
            type="button"
            onClick={() => handleSwitchMode('login')}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
              mode === 'login'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode('register')}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
              mode === 'register'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Register New User
          </button>
        </div>

        {(error || formError) && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {formError || error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label
                htmlFor="name"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
              >
                Full Name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none"
            />
            {mode === 'register' && (
              <p className="mt-1 text-[11px] text-slate-500">
                Minimum 6 characters.
              </p>
            )}
          </div>

          {mode === 'register' && (
            <>
              <div>
                <label
                  htmlFor="teamName"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
                >
                  Team Name
                </label>
                <input
                  id="teamName"
                  type="text"
                  required
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Platform Ops"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Creates or joins this team workspace.
                </p>
              </div>

              <div>
                <label
                  htmlFor="role"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
                >
                  Role in Team
                </label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) =>
                    setRole(e.target.value as 'lead' | 'admin' | 'member' | 'viewer')
                  }
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent focus:outline-none"
                >
                  <option value="lead">Lead (Full operational & approval rights)</option>
                  <option value="admin">Admin (Membership & ticket management)</option>
                  <option value="member">Member (Can create, work on, & claim items)</option>
                  <option value="viewer">Viewer (Read-only access)</option>
                </select>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 cursor-pointer"
          >
            {isLoading
              ? mode === 'login'
                ? 'Signing in…'
                : 'Creating Account…'
              : mode === 'login'
                ? 'Sign In'
                : 'Create Account & Sign In'}
          </button>
        </form>

        <div className="pt-2 text-center text-xs text-slate-600">
          {mode === 'login' ? (
            <p>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => handleSwitchMode('register')}
                className="font-semibold text-accent hover:underline cursor-pointer"
              >
                Register a new user
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => handleSwitchMode('login')}
                className="font-semibold text-accent hover:underline cursor-pointer"
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
