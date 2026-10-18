import { useState } from 'react'
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../api/auth'
import { useAuth } from '../context/useAuth'
import BackendStatus from './BackendStatus'

export default function LoginScreen() {
  const { login, isLoading, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setFormError('Please enter both email and password.')
      return
    }
    setFormError(null)
    try {
      await login(email.trim(), password)
    } catch {
      // Error is set in AuthContext
    }
  }

  const handleDemoLogin = async (demoEmail: string) => {
    setEmail(demoEmail)
    setPassword(DEMO_PASSWORD)
    setFormError(null)
    try {
      await login(demoEmail, DEMO_PASSWORD)
    } catch {
      // Error handled
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
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
            Sign in with your team credentials
          </p>
          <div className="mt-2">
            <BackendStatus />
          </div>
        </div>

        {(error || formError) && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {error || formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
              placeholder="e.g. alice.lead@demo.test"
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
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {isLoading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="pt-2">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 font-medium text-slate-600">
                Or quick sign in as demo user
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => handleDemoLogin(acc.email)}
                disabled={isLoading}
                className="flex flex-col items-start rounded-md border border-slate-200 bg-slate-50 p-2 text-left hover:border-slate-300 hover:bg-slate-100 disabled:opacity-50"
              >
                <span className="text-xs font-semibold text-slate-900">
                  {acc.name}
                </span>
                <span className="text-[11px] text-slate-600">
                  {acc.roleDescription}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
