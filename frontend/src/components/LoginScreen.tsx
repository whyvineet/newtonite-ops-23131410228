import { useState } from 'react'
import { useAuth } from '../context/useAuth'

type AuthMode = 'login' | 'register'

export default function LoginScreen() {
  const { login, register, isLoading, error } = useAuth()
  const [mode, setMode] = useState<AuthMode>('login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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

  const inputClass =
    'mt-1 block w-full rounded border border-[#E2E1DC] bg-white px-3 py-2 text-xs text-[#242520] placeholder:text-[#9C9A93] hover:border-[#D5D4CE] focus:outline-none focus:ring-1 focus:ring-[#B85D3B] focus:border-[#B85D3B] transition-colors'

  const labelClass = 'block text-[11px] font-semibold uppercase tracking-wider text-[#63625D]'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F7F7F5] px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo + Heading */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex items-center justify-center">
            <span className="font-mono text-base font-bold px-2.5 py-1 rounded bg-[#242520] text-[#F7F7F5] tracking-tight">
              N°
            </span>
          </div>
          <span className="text-xs font-mono font-bold tracking-[0.16em] uppercase text-[#8E8D87]">
            Operations Console
          </span>
          <h1 className="text-lg font-semibold tracking-tight text-[#242520] mt-0.5">
            Newtonite
          </h1>
          <p className="mt-1 text-xs text-[#63625D]">
            {mode === 'login'
              ? 'Sign in to access your operations queue'
              : 'Create a new team and operator account'}
          </p>
        </div>

        {/* Paper Surface Card */}
        <div className="rounded-lg border border-[#E2E1DC] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          {/* Mode Switcher */}
          <div className="mb-5 flex rounded border border-[#E2E1DC] bg-[#FAF9F7] p-0.5">
            <button
              type="button"
              onClick={() => handleSwitchMode('login')}
              className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
                mode === 'login'
                  ? 'bg-white text-[#242520] font-semibold shadow-xs'
                  : 'text-[#63625D] hover:text-[#242520]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('register')}
              className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
                mode === 'register'
                  ? 'bg-white text-[#242520] font-semibold shadow-xs'
                  : 'text-[#63625D] hover:text-[#242520]'
              }`}
            >
              Create Account
            </button>
          </div>

          {(formError || error) && (
            <div
              role="alert"
              className="mb-4 rounded border border-[#F1B8B3] bg-[#FDF0EE] p-2.5 text-xs text-[#A6261E]"
            >
              {formError || error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <div>
                <label htmlFor="auth-name" className={labelClass}>
                  Full Name
                </label>
                <input
                  id="auth-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className={labelClass}>
                Work Email
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="auth-password" className={labelClass}>
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
              />
            </div>

            {mode === 'register' && (
              <>
                <div>
                  <label htmlFor="auth-team" className={labelClass}>
                    Team Name
                  </label>
                  <input
                    id="auth-team"
                    type="text"
                    required
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Platform Ops"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="auth-role" className={labelClass}>
                    Role in Team
                  </label>
                  <select
                    id="auth-role"
                    value={role}
                    onChange={(e) =>
                      setRole(e.target.value as 'lead' | 'admin' | 'member' | 'viewer')
                    }
                    className={inputClass}
                  >
                    <option value="lead">Lead (Approval authority)</option>
                    <option value="member">Member (Standard workflow)</option>
                    <option value="admin">Admin (Full administrative)</option>
                    <option value="viewer">Viewer (Read-only)</option>
                  </select>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full rounded bg-[#B85D3B] py-2 text-xs font-semibold text-white hover:bg-[#9E4C2E] disabled:opacity-50 transition-colors"
            >
              {isLoading
                ? 'Processing…'
                : mode === 'login'
                ? 'Sign in to Console'
                : 'Create Account & Team'}
            </button>
          </form>

          {/* Editorial helper notes */}
          <div className="mt-4 pt-3 border-t border-[#EAE9E4] text-[11px] text-[#8E8D87] text-center">
            Newtonite Operations Console &middot; Operational Precision
          </div>
        </div>
      </div>
    </div>
  )
}
