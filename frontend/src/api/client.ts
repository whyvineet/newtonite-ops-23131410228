import type { ApiErrorResponse } from '../types/api'

const TOKEN_STORAGE_KEY = 'newtonite_access_token'
const API_PREFIX = '/api/v1'

export class ApiClientError extends Error {
  status: number
  code?: string
  details?: unknown

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: unknown,
  ) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  } catch {
    // LocalStorage might be restricted; ignore
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  params?: Record<string, string | number | boolean | undefined | null>
  idempotencyKey?: string
}

export async function request<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { params, body, headers: customHeaders, idempotencyKey, ...fetchOptions } = options

  // Build and normalize URL
  let url: string
  if (endpoint.startsWith('http')) {
    url = endpoint
  } else {
    // Strip leading slash
    const clean = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint
    if (clean.startsWith('api/') || clean === 'api' || clean.startsWith('health')) {
      url = `/${clean}`
    } else {
      url = `${API_PREFIX}/${clean}`
    }
  }

  if (params) {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value))
      }
    }
    const query = searchParams.toString()
    if (query) {
      url += (url.includes('?') ? '&' : '?') + query
    }
  }

  const headers = new Headers(customHeaders)
  headers.set('Accept', 'application/json')

  if (body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  const token = getStoredToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  if (idempotencyKey) {
    headers.set('Idempotency-Key', idempotencyKey)
  }

  let response: Response
  try {
    response = await fetch(url, {
      ...fetchOptions,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new ApiClientError(
      'Network error: Failed to connect to backend server. Make sure the backend is running.',
      0,
      'network_error',
    )
  }

  // Handle successful empty response (e.g., 204)
  if (response.status === 204) {
    return null as T
  }

  // Parse JSON
  let responseData: unknown = null
  const contentType = response.headers.get('Content-Type')
  if (contentType && contentType.includes('application/json')) {
    try {
      responseData = await response.json()
    } catch {
      responseData = null
    }
  }

  if (!response.ok) {
    const errorData = responseData as ApiErrorResponse | null

    let code = 'unknown_error'
    let message = `Request failed with status ${response.status}`
    let details: unknown = undefined

    if (errorData?.error) {
      code = errorData.error.code || code
      message = errorData.error.message || message
      details = errorData.error.details
    } else if (errorData?.detail) {
      if (typeof errorData.detail === 'string') {
        message = errorData.detail
      } else if (Array.isArray(errorData.detail) && errorData.detail.length > 0) {
        code = 'validation_error'
        message = errorData.detail.map((err) => `${err.loc.join('.')}: ${err.msg}`).join(', ')
        details = errorData.detail
      }
    }

    if (response.status === 401) {
      code = code === 'unknown_error' ? 'not_authenticated' : code
      message = message.startsWith('Request failed') ? 'Session expired or not authenticated. Please log in.' : message
    } else if (response.status === 403) {
      code = code === 'unknown_error' ? 'forbidden' : code
      message = message.startsWith('Request failed') ? 'You do not have permission to perform this action.' : message
    } else if (response.status === 404) {
      code = code === 'unknown_error' ? 'not_found' : code
      message = message.startsWith('Request failed') ? 'Resource not found.' : message
    } else if (response.status === 409) {
      code = code === 'unknown_error' ? 'conflict' : code
      message = message.startsWith('Request failed') ? 'A conflict occurred. The resource may have been updated.' : message
    }

    throw new ApiClientError(message, response.status, code, details)
  }

  return responseData as T
}

export function generateIdempotencyKey(): string {
  return `key-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}
