import { useEffect, useState } from 'react'

type ConnectionState = 'checking' | 'connected' | 'unavailable'

const HEALTH_TIMEOUT_MS = 5000

const presentation: Record<ConnectionState, { label: string; dot: string }> = {
  checking: { label: 'Checking backend…', dot: 'bg-slate-400' },
  connected: { label: 'Backend connected', dot: 'bg-emerald-600' },
  unavailable: { label: 'Backend unavailable', dot: 'bg-red-600' },
}

function isHealthyResponse(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    'status' in body &&
    body.status === 'ok'
  )
}

export default function BackendStatus() {
  const [state, setState] = useState<ConnectionState>('checking')

  // One initial check against the existing health endpoint; no polling.
  useEffect(() => {
    const controller = new AbortController()
    let unmounted = false
    const timeoutId = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)

    async function check() {
      try {
        const response = await fetch('/health', {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        const body: unknown = response.ok ? await response.json() : null
        if (!unmounted) {
          setState(isHealthyResponse(body) ? 'connected' : 'unavailable')
        }
      } catch {
        // Network failure, timeout, or non-JSON body: all mean "unavailable".
        if (!unmounted) setState('unavailable')
      } finally {
        window.clearTimeout(timeoutId)
      }
    }

    void check()

    return () => {
      unmounted = true
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [])

  const { label, dot } = presentation[state]

  return (
    <div
      role="status"
      className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
      {label}
    </div>
  )
}
